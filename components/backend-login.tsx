import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function BackendLogin() {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const redirect = new URL(`${import.meta.env.BASE_URL}teacher/`, location.origin).href;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget, fields = new FormData(form);
    const email = String(fields.get('email')).trim().toLowerCase();
    setBusy(true); setError(''); setNotice('');
    try {
      if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${redirect}?reset=1` });
        if (error) throw error;
        setNotice('若此 Email 已建立帳號，您將收到設定密碼的信件。請開啟最新一封信。');
      } else {
        const password = String(fields.get('password'));
        if (mode === 'signup') {
          const name = String(fields.get('name')).trim(), reason = String(fields.get('reason')).trim();
          if (!name || !reason) throw new Error('請填寫姓名與申請用途。');
          if (password.length < 8 || password !== fields.get('confirm')) throw new Error('密碼須至少 8 個字元，且兩次輸入須相同。');
          const { data, error } = await supabase.auth.signUp({ email, password, options: {
            emailRedirectTo: redirect,
            data: { backend_application: { name, reason } },
          } });
          if (error) throw error;
          if (!data.session) setNotice('請至信箱完成首次驗證，返回後系統會送出申請，等待管理員啟用。若已有帳號，請直接登入或設定密碼。');
          form.reset();
        } else {
          const { error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) throw new Error(error.code === 'email_not_confirmed' ? '請先完成信箱中的首次驗證。' : '登入失敗，請確認 Email 與密碼；原先使用信件登入者，請先點選「忘記密碼」。');
        }
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : '操作失敗，請稍後重試。'); }
    finally { setBusy(false); }
  }
  return <div className="mx-auto grid max-w-6xl gap-12 px-6 py-16 lg:grid-cols-2 lg:items-start">
    <section className="lg:pt-32"><p className="mb-4 text-xs font-bold tracking-widest">TEACHING & ASSESSMENT</p><h1 className="text-4xl font-black leading-tight">讓每一份回饋，成為學員的下一步。</h1><p className="mt-7 leading-8">建立學員名冊、登錄 OSCE 分數與回饋，並逐題管理成績公布。</p></section>
    <section className="rounded-2xl border border-[#d5e0d8] bg-white p-8 shadow-sm">
      <h2 className="text-2xl font-black">{mode === 'login' ? '後臺管理系統登入' : mode === 'signup' ? '申請後臺帳號' : '忘記密碼'}</h2>
      <p className="mt-3 text-sm leading-6">{mode === 'login' ? '使用 Email 與密碼登入；帳號須經管理員啟用。' : mode === 'signup' ? '填寫申請資料與密碼，完成首次信箱驗證後，等待管理員啟用。' : '原先使用信件登入的帳號，也可以在這裡設定密碼。'}</p>
      <div className="mt-5 flex flex-wrap gap-4 text-sm">{(['signup', 'reset'] as const).map(m => <button key={m} type="button" disabled={busy} aria-pressed={mode === m} className="underline" onClick={() => { setMode(m); setError(''); setNotice(''); }}>{m === 'signup' ? '申請帳號' : '忘記密碼'}</button>)}</div>
      <form key={mode} onSubmit={submit} className="mt-7"><fieldset disabled={busy} className="space-y-5">
        {mode === 'signup' && <label className="block">姓名<Input className="mt-2 h-12 px-3 md:text-base" name="name" required maxLength={100} autoComplete="name" /></label>}
        <label className="block">Email<Input className="mt-2 h-12 px-3 md:text-base" name="email" type="email" required autoComplete="username" /></label>
        {mode !== 'reset' && <label className="block">{mode === 'signup' ? '設定密碼（至少 8 個字元）' : '密碼'}<Input className="mt-2 h-12 px-3 md:text-base" name="password" type="password" required minLength={mode === 'signup' ? 8 : undefined} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} /></label>}
        {mode === 'signup' && <><label className="block">再次輸入密碼<Input className="mt-2 h-12 px-3 md:text-base" name="confirm" type="password" required minLength={8} autoComplete="new-password" /></label><label className="block">申請用途<Input className="mt-2 h-12 px-3 md:text-base" name="reason" required maxLength={500} placeholder="例如：工作坊評分與名冊管理" /></label></>}
        {error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {notice && <p role="status" className="rounded bg-green-50 p-3 text-sm">{notice}</p>}
        <Button type="submit" className="h-12 w-full text-base font-bold">{busy ? '處理中…' : mode === 'login' ? '登入後臺' : mode === 'signup' ? '申請帳號' : '寄送設定密碼連結'}</Button>
      </fieldset></form>
      {mode !== 'login' && <button type="button" disabled={busy} className="mt-5 text-sm underline" onClick={() => { setMode('login'); setError(''); setNotice(''); }}>返回登入</button>}
    </section>
  </div>;
}
