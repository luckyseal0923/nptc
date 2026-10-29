import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { rpc } from '@/lib/supabase';
import { DEMO_MODE } from '@/lib/demo';
import { deleteSurveyWithPassword, type SurveyDeletionRequest } from '@/lib/admin-survey-action';

type Info = { id: string; title: string; revision: number; responseCount: number };
export function DeleteSurveyDialog({ assignmentId, onDeleted, onClose }: { assignmentId: string; onDeleted: () => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [info, setInfo] = useState<Info | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [reload, setReload] = useState(0);
  useEffect(() => { const node = dialog.current; if (node && !node.open) node.showModal(); return () => { if (node?.open) node.close(); }; }, []);
  useEffect(() => { const abort = new AbortController(); setInfo(null); setError(''); rpc<Info>('nptc_survey_delete_info', { requested_assignment: assignmentId }, abort.signal).then(result => { if (!abort.signal.aborted) setInfo(result); }).catch(cause => { if (!abort.signal.aborted) setError(cause.message); }); return () => abort.abort(); }, [assignmentId, reload]);
  return <dialog ref={dialog} className="survey-modal" aria-labelledby="survey-delete-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className="survey-modal-heading"><div><h2 id="survey-delete-title">刪除本次問卷發布</h2><p>{info?.title ?? '正在讀取問卷資訊…'}</p></div><button className="survey-modal-close" type="button" disabled={busy} aria-label="取消刪除" onClick={onClose}>×</button></header>
    {info && <form key={`${info.revision}-${info.responseCount}`} autoComplete="off" onSubmit={async event => {
      event.preventDefault(); const form = event.currentTarget, fields = new FormData(form); setBusy(true); setError('');
      const body: SurveyDeletionRequest = { id: info.id, revision: info.revision, expectedResponses: info.responseCount, acknowledgeDataLoss: fields.get('acknowledge') === 'on' };
      try { if (info.responseCount > 0) await deleteSurveyWithPassword(body, String(fields.get('email') ?? ''), String(fields.get('password') ?? '')); else await rpc('nptc_survey_delete', { body }); form.reset(); onDeleted(); }
      catch (cause) { setError((cause as Error).message); const password = form.querySelector<HTMLInputElement>('input[name="password"]'); if (password) password.value = ''; }
      finally { setBusy(false); }
    }}>
      <div className={info.responseCount > 0 ? 'survey-delete-warning' : 'survey-delete-explanation'} role={info.responseCount > 0 ? 'alert' : undefined}>{info.responseCount > 0 ? <><strong>這份問卷已有 {info.responseCount} 筆作答及分數資料。</strong><p>刪除會同時永久移除這些作答與分數，無法還原。請重新驗證目前管理員身分後再刪除。</p></> : <p>這份問卷尚無學員作答。刪除後，此次填答連結將失效。</p>}<p>量表庫原始內容與其他次發布會保留。</p></div>
      <fieldset disabled={busy} className="survey-modal-fields">{info.responseCount > 0 && <><label>目前管理員 Email<input type="email" name="email" required autoComplete="username" placeholder={DEMO_MODE ? 'teacher-demo@example.test' : ''}/></label><label>管理員密碼<input name="password" type="password" required autoComplete="current-password"/></label>{DEMO_MODE && <small className="survey-muted">本機示範：teacher-demo@example.test／demo1234</small>}<label className="survey-check-label"><input type="checkbox" name="acknowledge" required/>我了解將永久刪除以上 {info.responseCount} 筆作答與分數。</label></>}
        <div className="survey-modal-actions"><Button className="action secondary" type="button" onClick={onClose}>取消</Button><Button className="action destructive" type="submit">{busy ? '處理中…' : info.responseCount > 0 ? '驗證並永久刪除' : '確認刪除'}</Button></div>
      </fieldset>
    </form>}
    {error && <div className="notice error" role="alert"><p>{error}</p><Button className="action secondary small" disabled={busy} onClick={() => setReload(v => v + 1)}>重新讀取刪除資訊</Button></div>}
    {!info && !error && <p role="status">正在確認最新作答筆數…</p>}
  </dialog>;
}
