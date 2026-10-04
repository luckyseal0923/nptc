import { useState } from 'react';
import { adminWorkshopAction } from '@/lib/admin-workshop-action';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ConfirmWorkshopAction({ action, workshop, onSuccess, onCancel }: {
  action: 'archive' | 'delete';
  workshop: { id: string; name: string };
  onSuccess: () => Promise<void> | void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const deleting = action === 'delete';
  return <form className="entry-form" autoComplete="off" onSubmit={async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    if (deleting && fields.get('workshopName') !== workshop.name) {
      setError('梯次名稱不符，請重新確認。');
      return;
    }
    setBusy(true); setError('');
    try {
      await adminWorkshopAction(action, workshop, String(fields.get('email')), String(fields.get('password')));
      form.reset();
      await onSuccess();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '操作失敗。'); }
    finally { setBusy(false); }
  }}>
    <p className="form-help">{deleting
      ? `永久刪除「${workshop.name}」及其名冊、成績與回饋，無法還原。`
      : `封存「${workshop.name}」後，名冊與成績會保留，系統管理者可還原。`}</p>
    <label>目前系統管理者 Email<Input name="email" type="email" required autoComplete="username" disabled={busy}/></label>
    <label>密碼<Input name="password" type="password" required autoComplete="current-password" disabled={busy}/></label>
    {deleting && <label>請再次輸入梯次名稱「{workshop.name}」<Input name="workshopName" required disabled={busy}/></label>}
    {error && <p role="alert" className="notice error">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <Button type="submit" className={deleting ? 'action destructive' : 'action'} disabled={busy}>{busy ? '驗證並處理中…' : deleting ? '驗證並永久刪除' : '驗證並封存'}</Button>
      <Button type="button" className="action secondary" disabled={busy} onClick={onCancel}>取消</Button>
    </div>
  </form>;
}
