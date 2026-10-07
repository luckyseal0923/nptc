import { useEffect, useState } from 'react';
import { rpc, supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmWorkshopAction } from '@/components/confirm-workshop-action';
import { BackendEntryLayout } from '@/components/backend-login';
import Link from '@/components/link';

type Account = { email: string; name: string; reason: string; status: 'pending' | 'active' | 'disabled'; protected?: boolean; systemAdmin?: boolean };
type Status = { application: Account | null; canReview: boolean };
const labels = { pending: '等待審核', active: '已啟用', disabled: '已停用' };

export function BackendApplication({ email }: { email: string }) {
  const [applying, setApplying] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  return <BackendEntryLayout>
    <h2 className="text-2xl font-black">後臺管理系統登入</h2>
    <div role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
      <p className="break-all font-bold" style={{ color: 'inherit' }}>目前登入帳號：{email}</p>
      <p className="mt-2 leading-7" style={{ color: 'inherit' }}>此帳號尚無後臺管理權限。請登出後使用管理員帳號登入，或申請後臺管理權限。</p>
    </div>
    <div className="mt-6 flex flex-col gap-4">
      <Button type="button" disabled={signingOut} className="h-auto min-h-12 whitespace-normal py-3" onClick={async () => {
        setSigningOut(true); setSignOutError('');
        try {
          const { error } = await supabase.auth.signOut({ scope: 'local' });
          if (error) throw error;
        } catch {
          setSignOutError('登出未完成，請稍後重試。');
          setSigningOut(false);
        }
      }}>{signingOut ? '登出中…' : '登出並使用管理員帳號登入'}</Button>
      <Button type="button" variant="outline" disabled={signingOut} aria-expanded={applying} aria-controls="backend-permission-application" onClick={() => setApplying(!applying)}>{applying ? '收合申請表' : '申請後臺管理權限'}</Button>
      <Link href="/student/" className="text-center underline">返回學員專區</Link>
    </div>
    {signOutError && <p role="alert" className="mt-4 text-red-700">{signOutError}</p>}
    {applying && <div id="backend-permission-application" className="mt-7 border-t pt-6"><BackendApplicationForm email={email}/></div>}
  </BackendEntryLayout>;
}

function BackendApplicationForm({ email }: { email: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function refresh() {
    setError('');
    try {
      let current = await rpc<Status>('nptc_backend_account_status');
      if (!current.application) {
        const { data, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        // Metadata is application text only. Approval remains in the guarded RPC.
        const draft = data.user?.user_metadata?.backend_application;
        if (typeof draft?.name === 'string' && typeof draft?.reason === 'string' && draft.name.trim() && draft.reason.trim()) {
          current = await rpc<Status>('nptc_apply_backend_account', { body: { name: draft.name, reason: draft.reason } });
        }
      }
      setStatus(current);
    }
    catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { void refresh(); }, []);
  return <section><h3 className="text-xl font-bold">申請後臺管理權限</h3><p className="form-help break-all">申請帳號：{email}</p>
    {error && <p role="alert" className="notice error">{error}</p>}
    {!status ? <Button className="action" onClick={refresh}>重新載入申請狀態</Button> : status.application ? <>
      <h2>{labels[status.application.status]}</h2><p className="form-help">{status.application.status === 'pending' ? '申請已送出，請等待系統管理者啟用帳號。' : status.application.status === 'disabled' ? '目前無法使用後臺功能，請聯絡系統管理者協助。' : '帳號已啟用，請重新載入進入後臺。'}</p>
      <Button className="action" onClick={() => location.reload()}>重新確認啟用狀態</Button>
    </> : <form className="entry-form" onSubmit={async (event) => {
      event.preventDefault(); const fields = new FormData(event.currentTarget); setBusy(true); setError('');
      try { setStatus(await rpc<Status>('nptc_apply_backend_account', { body: { name: fields.get('name'), reason: fields.get('reason') } })); }
      catch(e) { setError((e as Error).message); } finally { setBusy(false); }
    }}><fieldset disabled={busy}><label>姓名<Input name="name" required maxLength={100} autoComplete="name" /></label><label>申請用途<Input name="reason" required maxLength={500} placeholder="例如：協助工作坊評分與名冊管理" /></label><p className="form-help">系統管理者啟用後，即以一般管理員身分管理工作坊、學員名冊與成績。</p><Button className="action" type="submit">{busy ? '送出中…' : '送出帳號申請'}</Button></fieldset></form>}
  </section>;
}

export function BackendAccounts({ expanded = false }: { expanded?: boolean }) {
  const [canReview, setCanReview] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [open, setOpen] = useState(expanded);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
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
    {open && <><p className="form-help">一般管理員可管理所有工作坊；系統管理者可編輯、啟用與停用帳號。停用後，後續資料操作會被拒絕。</p><div className="station-settings-grid">{accounts.map(account => <article className="station-setting account-card" key={account.email}>
      <h3>{account.name}</h3><p style={{ overflowWrap: 'anywhere' }}>{account.email}</p><p>{account.reason}</p><p className={`form-help account-status ${account.status}`}>{labels[account.status]} · {account.systemAdmin ? '系統管理者' : '一般管理員'}</p>
      {editing === account.email && <form className="entry-form" onSubmit={async (event) => {
        event.preventDefault(); const fields = new FormData(event.currentTarget); setBusy(true); setError('');
        try { await rpc('nptc_update_backend_account', { body: { email: account.email, name: fields.get('name'), reason: fields.get('reason') } }); setEditing(null); await load(); }
        catch(e) { setError((e as Error).message); } finally { setBusy(false); }
      }}><fieldset disabled={busy}><label>姓名<Input name="name" required maxLength={100} defaultValue={account.name} /></label><label>申請用途<Input name="reason" required maxLength={500} defaultValue={account.reason} /></label><Button className="action" type="submit">儲存修改</Button></fieldset></form>}
      <div className="account-card-actions">
      <Button className="action secondary" disabled={busy} onClick={() => setEditing(editing === account.email ? null : account.email)}>{editing === account.email ? '取消修改' : '修改資料'}</Button>
      {account.status === 'active' && !account.protected && <Button className="action secondary" disabled={busy} onClick={async () => {
        setBusy(true); setError('');
        try { await rpc('nptc_set_backend_role', { body: { email: account.email, systemAdmin: !account.systemAdmin } }); await load(); }
        catch(e) { setError((e as Error).message); } finally { setBusy(false); }
      }}>{account.systemAdmin ? '改為一般管理員' : '升為系統管理者'}</Button>}
      {!account.protected && <Button className={account.status === 'active' ? 'action destructive' : 'action'} disabled={busy} onClick={async () => {
        setBusy(true); setError('');
        try { await rpc('nptc_set_backend_account', { body: { email: account.email, enabled: account.status !== 'active' } }); await load(); }
        catch(e) { setError((e as Error).message); } finally { setBusy(false); }
      }}>{account.status === 'active' ? '停用帳號' : '啟用帳號'}</Button>}
      </div>
    </article>)}</div></>}
  </section>;
}

type ArchivedWorkshop = { id: string; name: string; archivedAt: string };
export function ArchivedWorkshops() {
  const [items, setItems] = useState<ArchivedWorkshop[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  async function load() {
    try { setError(''); setItems(await rpc<ArchivedWorkshop[]>('nptc_archived_workshops')); }
    catch (cause) { setError((cause as Error).message); }
  }
  useEffect(() => { void load(); }, []);
  return <section className="data-panel" style={{ marginTop: 24 }}><div className="panel-heading"><h2>已封存梯次</h2><Button className="action secondary" onClick={load}>重新整理</Button></div>
    <p className="form-help">封存會保留名冊與成績，並停止修改。還原後會重新出現在梯次清單；永久刪除會移除該梯次及其名冊、成績與回饋。</p>
    {error && <p role="alert" className="notice error">{error}</p>}
    {!items.length ? <p>目前沒有已封存梯次。</p> : <div className="station-settings-grid">{items.map(item => <article className="station-setting" key={item.id}>
      <h3>{item.name}</h3><p className="form-help">封存時間：{new Date(item.archivedAt).toLocaleString('zh-TW')}</p>
      <Button className="action secondary" disabled={busy} onClick={async () => {
        setBusy(true); setError('');
        try { await rpc('nptc_set_workshop_archived', { body: { workshopId: item.id, archived: false } }); await load(); }
        catch(cause) { setError((cause as Error).message); } finally { setBusy(false); }
      }}>還原梯次</Button>
      <Button className="action destructive" disabled={busy} onClick={() => setDeleting(deleting === item.id ? null : item.id)}>{deleting === item.id ? '取消刪除' : '永久刪除'}</Button>
      {deleting === item.id && <ConfirmWorkshopAction action="delete" workshop={item} onCancel={() => setDeleting(null)} onSuccess={async () => { setDeleting(null); await load(); }}/>}
    </article>)}</div>}
  </section>;
}
