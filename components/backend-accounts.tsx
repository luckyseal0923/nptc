import { useEffect, useState } from 'react';
import { rpc } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Account = { email: string; name: string; reason: string; status: 'pending' | 'active' | 'disabled'; protected?: boolean };
type Status = { application: Account | null; canReview: boolean };
const labels = { pending: '等待審核', active: '已啟用', disabled: '已停用' };

export function BackendApplication({ email }: { email: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function refresh() {
    setError('');
    try { setStatus(await rpc<Status>('nptc_backend_account_status')); }
    catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { void refresh(); }, []);
  return <section className="workspace"><div className="data-panel"><h1>後臺帳號申請</h1><p className="form-help">已驗證 Email：{email}</p>
    {error && <p role="alert" className="notice error">{error}</p>}
    {!status ? <Button className="action" onClick={refresh}>重新載入申請狀態</Button> : status.application ? <>
      <h2>{labels[status.application.status]}</h2><p className="form-help">{status.application.status === 'pending' ? '申請已送出，請等待管理員啟用帳號。' : status.application.status === 'disabled' ? '目前無法使用後臺功能，請聯絡管理員協助。' : '帳號已啟用，請重新載入進入後臺。'}</p>
      <Button className="action" onClick={() => location.reload()}>重新確認啟用狀態</Button>
    </> : <form className="entry-form" onSubmit={async (event) => {
      event.preventDefault(); const fields = new FormData(event.currentTarget); setBusy(true); setError('');
      try { setStatus(await rpc<Status>('nptc_apply_backend_account', { body: { name: fields.get('name'), reason: fields.get('reason') } })); }
      catch(e) { setError((e as Error).message); } finally { setBusy(false); }
    }}><fieldset disabled={busy}><label>姓名<Input name="name" required maxLength={100} autoComplete="name" /></label><label>申請用途<Input name="reason" required maxLength={500} placeholder="例如：協助工作坊評分與名冊管理" /></label><p className="form-help">管理員啟用後，即可管理工作坊、學員名冊與成績。</p><Button className="action" type="submit">{busy ? '送出中…' : '送出帳號申請'}</Button></fieldset></form>}
  </div></section>;
}

export function BackendAccounts() {
  const [canReview, setCanReview] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function load() {
    setError('');
    try {
      const status = await rpc<Status>('nptc_backend_account_status'); setCanReview(status.canReview);
      if (status.canReview) setAccounts(await rpc<Account[]>('nptc_backend_accounts'));
    } catch(e) { setError((e as Error).message); }
  }
  useEffect(() => { void load(); }, []);
  if (!canReview && !error) return null;
  return <section className="data-panel" style={{ marginTop: 24 }}>
    <div className="panel-heading"><h2>帳號管理</h2>{canReview && <Button className="action secondary" onClick={() => setOpen(!open)}>{open ? '收合帳號管理' : `查看帳號（${accounts.filter(a => a.status === 'pending').length} 筆待審核）`}</Button>}</div>
    {error && <p role="alert" className="notice error">{error}<Button className="action secondary" onClick={load}>重試</Button></p>}
    {open && <><p className="form-help">啟用後可管理所有工作坊；停用後，後續資料操作會被拒絕。</p><div className="station-settings-grid">{accounts.map(account => <article className="station-setting" key={account.email}>
      <h3>{account.name}</h3><p style={{ overflowWrap: 'anywhere' }}>{account.email}</p><p>{account.reason}</p><p className="form-help">{labels[account.status]}{account.protected ? ' · 審核管理員' : ''}</p>
      {!account.protected && <Button className="action" disabled={busy} onClick={async () => {
        setBusy(true); setError('');
        try { await rpc('nptc_set_backend_account', { body: { email: account.email, enabled: account.status !== 'active' } }); await load(); }
        catch(e) { setError((e as Error).message); } finally { setBusy(false); }
      }}>{account.status === 'active' ? '停用帳號' : '啟用帳號'}</Button>}
    </article>)}</div></>}
  </section>;
}
