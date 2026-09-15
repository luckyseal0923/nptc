import { useEffect, useState } from 'react';
import { rpc, supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { HospitalPicker, type Hospital } from '@/app/student/student-dashboard';

type Student = { name: string; email: string; phone: string; nursingYears: number | null; hospital: string | null; unit: string | null; examSpecialty: string | null; firstOsce: boolean | null; birthDate: string | null };
export type Onboarding = { stage: 'unclaimed' | 'profile' | 'active'; student?: Student };
const redirect = () => new URL(`${import.meta.env.BASE_URL}student/`, location.origin).href;
const message = (cause: unknown) => cause instanceof Error ? cause.message : '操作未完成，請稍後重試。';
function PasswordFields() {
  return <><label className="block">設定密碼（至少 8 個字元）<Input className="mt-2 h-12 px-3 md:text-base" name="password" type="password" autoComplete="new-password" minLength={8} required /></label><label className="block">再次輸入密碼<Input className="mt-2 h-12 px-3 md:text-base" name="confirm" type="password" autoComplete="new-password" minLength={8} required /></label></>;
}
function passwordFrom(form: FormData) {
  const password = String(form.get('password') ?? '');
  if (password.length < 8 || password !== form.get('confirm')) throw new Error('密碼須至少 8 個字元，且兩次輸入須相同。');
  return password;
}

export function StudentLogin() {
  const [mode, setMode] = useState<'activate' | 'login' | 'reset'>('login');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [sent, setSent] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const fields = new FormData(event.currentTarget);
    setBusy(true); setError(''); setSent('');
    try {
      const email = String(fields.get('email')).trim();
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: String(fields.get('password')) });
        if (error) throw new Error('登入失敗，請確認 Email 與密碼；尚未啟用者請選「首次啟用帳號」。');
      } else if (mode === 'activate') {
        sessionStorage.setItem('nptc-activation-name', String(fields.get('name')).trim());
        sessionStorage.setItem('nptc-activation-phone', String(fields.get('phone')).trim());
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect() } });
        if (error) throw error;
        setSent('驗證信已寄出。請開啟信中的連結，核對名冊後補齊資料並設定密碼。');
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${redirect()}?reset=1` });
        if (error) throw error;
        setSent('若此 Email 可用於重設密碼，您將收到重設連結，請至信箱查看。');
      }
    } catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  }
  return <section className="mx-auto max-w-4xl px-6 py-12">
    <h1 className="text-3xl font-bold">學員專區</h1><p className="mt-3 mb-8">首次使用請先啟用帳號；已完成啟用者直接登入查看成績。</p>
    <div className="grid gap-4 sm:grid-cols-2">{(['activate', 'login'] as const).map(value => <button key={value} type="button" disabled={busy} aria-pressed={mode === value} onClick={() => { setMode(value); setError(''); setSent(''); }} className={`rounded-xl border-2 p-6 text-left ${mode === value ? 'border-[#174943] bg-[#eaf2df]' : 'border-[#d5e0d8] bg-white'}`}><strong className="block text-xl">{value === 'activate' ? '首次啟用帳號' : '學員登入'}</strong><span className="mt-2 block text-sm">{value === 'activate' ? '核對姓名、Email、手機，建立登入密碼' : '使用已設定的 Email 與密碼登入'}</span></button>)}</div>
    <form onSubmit={submit} className="mt-6 space-y-5 rounded-xl border bg-white p-6 sm:p-8">
      <h2 className="text-xl font-bold">{mode === 'activate' ? '首次啟用帳號' : mode === 'reset' ? '忘記密碼' : '學員登入'}</h2>
      {mode === 'activate' && <><p className="text-sm">請填寫報名時的資料。系統會先驗證信箱，再核對管理員建立的名冊。</p><label className="block">姓名<Input className="mt-2 h-12 px-3 md:text-base" name="name" autoComplete="name" maxLength={100} required /></label></>}
      <label className="block">Email<Input className="mt-2 h-12 px-3 md:text-base" name="email" type="email" autoComplete="username" required /></label>
      {mode === 'activate' && <label className="block">手機電話<Input className="mt-2 h-12 px-3 md:text-base" name="phone" type="tel" autoComplete="tel" pattern="09[0-9]{8}" placeholder="例如：0912345678" required /></label>}
      {mode === 'login' && <label className="block">密碼<Input className="mt-2 h-12 px-3 md:text-base" name="password" type="password" autoComplete="current-password" required /></label>}
      {error && <p role="alert" className="text-red-700">{error}</p>}{sent && <p role="status" className="rounded bg-green-50 p-3">{sent}</p>}
      <div className="flex flex-wrap items-center gap-5"><Button className="min-h-12 px-6 text-base" type="submit" disabled={busy}>{busy ? '處理中…' : mode === 'activate' ? '寄送啟用驗證信' : mode === 'reset' ? '寄送重設密碼連結' : '登入'}</Button><button type="button" disabled={busy} className="text-sm underline" onClick={() => { setMode(mode === 'reset' ? 'login' : 'reset'); setError(''); setSent(''); }}>{mode === 'reset' ? '返回登入' : '忘記密碼？'}</button></div>
    </form>
  </section>;
}

export function StudentActivation({ email, status, onComplete }: { email: string; status: Onboarding; onComplete: () => void }) {
  const [state, setState] = useState(status), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [hospitals, setHospitals] = useState<Hospital[]>([]), [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}data/accredited-hospitals.json`, { signal: controller.signal }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(data => setHospitals(data.hospitals ?? [])).catch(e => { if (e.name !== 'AbortError') setError('醫院名冊無法載入，請重新整理後再試。'); }).finally(() => setLoading(false));
    return () => controller.abort();
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const fields = new FormData(event.currentTarget); setBusy(true); setError('');
    try {
      if (state.stage === 'unclaimed') {
        const result = await rpc<Onboarding>('nptc_claim_student', { body: { name: String(fields.get('name')).trim(), phone: String(fields.get('phone')).trim() } });
        sessionStorage.removeItem('nptc-activation-name'); sessionStorage.removeItem('nptc-activation-phone');
        if (result.stage === 'active') onComplete(); else setState(result);
      } else {
        const password = passwordFrom(fields), hospital = String(fields.get('hospital') ?? '');
        if (!hospitals.some(h => h.name === hospital)) throw new Error('請搜尋並點選服務醫院全名。');
        await rpc('nptc_student_update_profile', { body: { nursingYears: Number(fields.get('nursingYears')), hospital, unit: String(fields.get('unit')).trim(), examSpecialty: fields.get('examSpecialty'), firstOsce: fields.get('firstOsce') === 'yes', birthDate: fields.get('birthDate') } });
        const { error } = await supabase.auth.updateUser({ password }); if (error) throw error;
        await rpc('nptc_finish_student_activation'); onComplete();
      }
    } catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  }
  const student = state.student;
  return <section className="mx-auto max-w-3xl px-6 py-12"><h1 className="text-2xl font-bold">完成首次啟用</h1><p className="my-4">{state.stage === 'unclaimed' ? 'Email 已驗證，請核對報名姓名與手機。' : '名冊已核對，請補齊個人資料並設定日後登入密碼。'}</p>
    <form onSubmit={submit} className="space-y-5 rounded-xl border bg-white p-6" key={state.stage}>
      <label className="block">Email（登入帳號）<Input className="mt-2 h-12 px-3 md:text-base" value={email} readOnly /></label>
      {state.stage === 'unclaimed' ? <><label className="block">姓名<Input className="mt-2 h-12 px-3 md:text-base" name="name" defaultValue={sessionStorage.getItem('nptc-activation-name') ?? ''} required /></label><label className="block">手機電話<Input className="mt-2 h-12 px-3 md:text-base" name="phone" type="tel" pattern="09[0-9]{8}" defaultValue={sessionStorage.getItem('nptc-activation-phone') ?? ''} required /></label></> : <>
        <div className="grid gap-4 sm:grid-cols-2"><label>姓名<Input className="mt-2 h-12 px-3 md:text-base" value={student?.name ?? ''} readOnly /></label><label>手機電話<Input className="mt-2 h-12 px-3 md:text-base" value={student?.phone ?? ''} readOnly /></label></div><p className="text-sm">以上資料由管理員建立，如需更正請聯絡管理員。</p>
        <label className="block">護理年資（年）<Input className="mt-2 h-12 px-3 md:text-base" name="nursingYears" type="number" min={0} max={60} step={1} defaultValue={student?.nursingYears ?? ''} required /></label>
        <HospitalPicker defaultValue={student?.hospital ?? ''} hospitals={hospitals} loading={loading} />
        <label className="block">服務單位<Input className="mt-2 h-12 px-3 md:text-base" name="unit" maxLength={100} defaultValue={student?.unit ?? ''} required /></label>
        <label className="block">報考科別<select name="examSpecialty" defaultValue={student?.examSpecialty ?? ''} className="block w-full rounded border p-3" required><option value="">請選擇</option>{['內科','精神科','兒科','外科','婦產科','麻醉科','家庭科'].map(s => <option key={s}>{s}</option>)}</select></label>
        <label className="block">是否首次報考國家 OSCE<select name="firstOsce" defaultValue={student?.firstOsce == null ? '' : student.firstOsce ? 'yes' : 'no'} className="block w-full rounded border p-3" required><option value="">請選擇</option><option value="yes">是</option><option value="no">否</option></select></label>
        <label className="block">出生年月日<Input className="mt-2 h-12 px-3 md:text-base" name="birthDate" type="date" min="1900-01-01" max={new Date().toLocaleDateString('en-CA')} defaultValue={student?.birthDate ?? ''} required /></label>
        <PasswordFields />
      </>}
      {error && <p role="alert" className="text-red-700">{error}</p>}<Button className="min-h-12 px-6 text-base" type="submit" disabled={busy || (state.stage === 'profile' && loading)}>{busy ? '處理中…' : state.stage === 'unclaimed' ? '核對名冊' : '儲存資料並啟用帳號'}</Button>
    </form></section>;
}

export function ResetStudentPassword({ onComplete, teacher = false }: { onComplete: () => void; teacher?: boolean }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <form className="mx-auto my-12 max-w-lg space-y-5 rounded-xl border bg-white p-6" onSubmit={async event => {
    event.preventDefault(); const fields = new FormData(event.currentTarget); setBusy(true); setError('');
    try { const { error } = await supabase.auth.updateUser({ password: passwordFrom(fields) }); if (error) throw error; history.replaceState(null, '', teacher ? new URL(`${import.meta.env.BASE_URL}teacher/`, location.origin).href : redirect()); onComplete(); }
    catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  }}><h1 className="text-2xl font-bold">重設登入密碼</h1><PasswordFields />{error && <p role="alert" className="text-red-700">{error}</p>}<Button className="min-h-12 px-6 text-base" type="submit" disabled={busy}>{busy ? '儲存中…' : '儲存新密碼'}</Button></form>;
}
