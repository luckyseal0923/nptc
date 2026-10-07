import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { DEMO_MODE } from '@/lib/demo';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { appUrl } from '@/lib/routes';
export function StudentEmailChange({ email }: { email: string }) {
  const [open,setOpen] = useState(false),[busy,setBusy] = useState(false),[notice,setNotice] = useState(''),[error,setError] = useState('');
  if (DEMO_MODE) return null;
  return <section className="data-panel"><Button type="button" className="action secondary" onClick={()=>setOpen(!open)}>變更登入 Email</Button>{open && <form className="entry-form" onSubmit={async event=>{
    event.preventDefault();setBusy(true);setError('');setNotice('');
    const next = String(new FormData(event.currentTarget).get('email')).trim().toLowerCase();
    try {
      if (next===email.toLowerCase()) throw new Error('請輸入與目前帳號不同的新 Email。');
      const result = await supabase.auth.updateUser({email:next},{emailRedirectTo:appUrl('/student/')});
      if (result.error) throw result.error;
      setNotice('請依新舊信箱收到的信件完成確認，再重新登入。確認完成後會同步所有梯次的名冊，保留成績與歷史紀錄。');
    } catch(cause) {setError(cause instanceof Error ? cause.message : '變更未完成，請稍後重試。');}
    finally {setBusy(false);}
  }}><p>目前登入 Email：{email}</p><label>新 Email<Input name="email" type="email" maxLength={254} required disabled={busy}/></label>{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}<Button type="submit" disabled={busy}>{busy ? '處理中…' : '寄送 Email 變更確認'}</Button></form>}</section>;
}
