import { useEffect, useState } from 'react';
import { adminWorkshopAction } from '@/lib/admin-workshop-action';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { rpc } from '@/lib/supabase';
type DeleteInfo = { fingerprint: string; studentCount: number; gradeCount: number; assignmentCount: number; responseCount: number; surveys: { title: string; responseCount: number }[] };

export function ConfirmWorkshopAction({ action, workshop, onSuccess, onCancel }: {
  action: 'archive' | 'delete';
  workshop: { id: string; name: string };
  onSuccess: () => Promise<void> | void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const deleting = action === 'delete';
  const [info, setInfo] = useState<DeleteInfo | null>(null), [reload, setReload] = useState(0);
  useEffect(() => {
    if (!deleting) return;
    const abort = new AbortController(); setInfo(null); setError('');
    rpc<DeleteInfo>('nptc_archived_workshop_delete_info', { requested_workshop: workshop.id }, abort.signal)
      .then(result => { if (!abort.signal.aborted) setInfo(result); })
      .catch(cause => { if (!abort.signal.aborted) setError(cause.message); });
    return () => abort.abort();
  }, [deleting, workshop.id, reload]);
  return <form className="entry-form" autoComplete="off" onSubmit={async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    if (deleting && fields.get('workshopName') !== workshop.name) {
      setError('梯次名稱不符，請重新確認。');
      return;
    }
    if (deleting && (!info || fields.get('acknowledge') !== 'on')) { setError('請先讀取並確認完整刪除範圍。'); return; }
    setBusy(true); setError('');
    try {
      await adminWorkshopAction(action, workshop, String(fields.get('email')), String(fields.get('password')), deleting && info ? { fingerprint: info.fingerprint, acknowledgeDataLoss: true } : undefined);
      form.reset();
      await onSuccess();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '操作失敗。'); const password = form.querySelector<HTMLInputElement>('input[name="password"]'); if (password) password.value = ''; }
    finally { setBusy(false); }
  }}>
    <p className="form-help">{deleting
      ? `永久刪除「${workshop.name}」及其名冊、成績、回饋、問卷發布與原始作答，無法還原。`
      : `封存「${workshop.name}」後，名冊與成績會保留，系統管理者可還原。`}</p>
    {deleting && (info ? <div role="alert" className="notice error"><p>將移除 {info.studentCount} 位學員、{info.gradeCount} 筆 OSCE 評分、{info.assignmentCount} 次問卷發布、{info.responseCount} 份量表作答。</p><ul>{info.surveys.map((s,i) => <li key={i}>{s.title}：{s.responseCount} 份作答</li>)}</ul><label><input name="acknowledge" type="checkbox" required disabled={busy}/>我已確認以上資料將永久刪除。</label></div> : <p role="status">尚未取得完整刪除範圍，暫不可刪除。</p>)}
    <label>目前系統管理者 Email<Input name="email" type="email" required autoComplete="username" disabled={busy}/></label>
    <label>密碼<Input name="password" type="password" required autoComplete="current-password" disabled={busy}/></label>
    {deleting && <label>請再次輸入梯次名稱「{workshop.name}」<Input name="workshopName" required disabled={busy}/></label>}
    {error && <p role="alert" className="notice error">{error}</p>}
    {deleting && <Button type="button" className="action secondary" disabled={busy} onClick={() => setReload(v => v + 1)}>重新讀取刪除範圍</Button>}
    <div className="flex flex-wrap gap-2">
      <Button type="submit" className={deleting ? 'action destructive' : 'action'} disabled={busy || deleting && !info}>{busy ? '驗證並處理中…' : deleting ? '驗證並永久刪除' : '驗證並封存'}</Button>
      <Button type="button" className="action secondary" disabled={busy} onClick={onCancel}>取消</Button>
    </div>
  </form>;
}
