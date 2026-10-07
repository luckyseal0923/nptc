import { ServiceInstitution, serviceInstitutionValues } from '@/components/service-institution';
import { useEffect, useState } from 'react';
import { rpc, supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { type Hospital } from '@/components/hospital-picker';
import { studentActivationError, studentAccountExists } from '@/lib/student-access-errors';

type Student = { name: string; email: string; phone: string; nursingYears: number | null; serviceKind?: string; hospital: string | null; unit: string | null; examSpecialty: string | null; firstOsce: boolean | null; birthDate: string | null };
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
  const [mode, setMode] = useState<'activate' | 'login' | 'reset' | 'confirm'>('login');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [sent, setSent] = useState('');
  function changeMode(next: typeof mode) { setMode(next); setError(''); setSent(''); }
  const heading = mode === 'activate' ? '第一次使用本平台？建立帳號' : mode === 'reset' ? '忘記密碼' : mode === 'confirm' ? '重新寄送確認信' : '學員登入';
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const fields = new FormData(event.currentTarget);
    setBusy(true); setError(''); setSent('');
    try {
      const email = String(fields.get('email')).trim();
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: String(fields.get('password')) });
        if (error) throw new Error('登入未完成，請確認 Email 與密碼。忘記密碼可申請重設；尚未確認信箱者可重新寄送確認信。');
      } else if (mode === 'activate') {
        sessionStorage.setItem('nptc-activation-name', String(fields.get('name')).trim());
        sessionStorage.setItem('nptc-activation-phone', String(fields.get('phone')).trim());
        const password = passwordFrom(fields);
        const { error } = await supabase.functions.invoke('student-activate', { body: {
          email, name: String(fields.get('name')).trim(), phone: String(fields.get('phone')).trim(),
          password,
        } });
        if (error) {
          const guidance = studentActivationError(error);
          if (studentAccountExists(error)) { window.alert(guidance); setMode('login'); }
          throw new Error(guidance);
        }
        sessionStorage.setItem('nptc-password-created', email.toLowerCase());
        const login = await supabase.auth.signInWithPassword({ email, password });
        if (login.error) { setMode('login'); setSent('帳號已建立，請使用剛設定的密碼登入。'); }
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${redirect()}?reset=1` });
        if (error) throw new Error('重設密碼信件暫時無法寄送，請稍後重試或聯絡管理員。');
        setSent('若此 Email 可用於重設密碼，您將收到重設連結，請至信箱查看。');
      } else {
        const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirect() } });
        if (error) throw new Error('確認信暫時無法寄送，請稍後重試或聯絡管理員。');
        setSent('若此 Email 有待確認的註冊申請，您將收到確認信。請完成信箱確認後登入，再接續核對名冊與補齊個人資料。');
      }
    } catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  }
  return <section className="mx-auto max-w-4xl px-6 py-12">
    <h1 className="text-3xl font-bold">學員專區</h1><p className="mt-3 mb-8">帳號只需建立一次。曾參加其他梯次並完成啟用者，請以原本的 Email 與密碼直接登入。</p>
    <div className="grid gap-4 sm:grid-cols-2">{(['login', 'activate'] as const).map(value => <button key={value} type="button" disabled={busy} aria-pressed={mode === value} onClick={() => changeMode(value)} className={`rounded-xl border-2 p-6 text-left ${mode === value ? 'border-[#174943] bg-[#eaf2df]' : 'border-[#d5e0d8] bg-white'}`}><strong className="block text-xl">{value === 'activate' ? '第一次使用本平台？建立帳號' : '學員登入'}</strong><span className="mt-2 block text-sm">{value === 'activate' ? '核對名冊並建立帳號，完成後即可跨梯次使用' : '已有帳號或參加新梯次，請從這裡登入'}</span></button>)}</div>
    <form onSubmit={submit} className="mt-6 space-y-5 rounded-xl border bg-white p-6 sm:p-8">
      <h2 className="text-xl font-bold">{heading}</h2>
      {mode === 'activate' && <><p className="text-sm">填寫老師名冊登錄的姓名、Email 與完整手機號碼，並設定登入密碼。新帳號核對成功後即可建立，不需要驗證信。曾建立帳號者請直接登入；若尚未完成啟用，登入後可接續填寫資料。</p><label className="block">姓名<Input id="student-activation-name" className="mt-2 h-12 px-3 md:text-base" name="name" autoComplete="name" maxLength={100} required /></label></>}
      {mode === 'confirm' && <p className="text-sm">若曾註冊但尚未確認信箱，可重新寄送確認信。完成確認後，請使用原本的密碼登入。</p>}
      <label className="block">Email<Input className="mt-2 h-12 px-3 md:text-base" name="email" type="email" autoComplete="username" required /></label>
      {mode === 'activate' && <label className="block">手機電話<Input className="mt-2 h-12 px-3 md:text-base" name="phone" type="tel" autoComplete="tel" pattern="09[0-9]{8}" placeholder="例如：0912345678" required /></label>}
      {mode === 'activate' && <PasswordFields />}
      {mode === 'login' && <label className="block">密碼<Input className="mt-2 h-12 px-3 md:text-base" name="password" type="password" autoComplete="current-password" required /></label>}
      {error && <p role="alert" className="text-red-700">{error}</p>}{sent && <p role="status" className="rounded bg-green-50 p-3">{sent}</p>}
      {mode === 'activate' && error && <div className="flex flex-wrap gap-5 text-sm">{error.includes('核對名冊') && <a className="underline" href="#student-activation-name">重新核對資料</a>}<button type="button" disabled={busy} className="underline" onClick={() => changeMode('login')}>改用學員登入</button></div>}
      <div className="flex flex-wrap items-center gap-5"><Button className="min-h-12 px-6 text-base" type="submit" disabled={busy}>{busy ? '處理中…' : mode === 'activate' ? '核對並建立帳號' : mode === 'reset' ? '寄送重設密碼連結' : mode === 'confirm' ? '寄送確認信' : '登入'}</Button><button type="button" disabled={busy} className="text-sm underline" onClick={() => changeMode(mode === 'reset' || mode === 'confirm' ? 'login' : 'reset')}>{mode === 'reset' || mode === 'confirm' ? '返回登入' : '忘記密碼？'}</button>{mode === 'login' && <button type="button" disabled={busy} className="text-sm underline" onClick={() => changeMode('confirm')}>重新寄送確認信</button>}</div>
    </form>
  </section>;
}

export function StudentActivation({ email, status, onComplete }: { email: string; status: Onboarding; onComplete: () => void }) {
  const passwordCreated = sessionStorage.getItem('nptc-password-created') === email.toLowerCase();
  const [state, setState] = useState(status), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [hospitals, setHospitals] = useState<Hospital[]>([]), [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    rpc<{hospitals:Hospital[]}>('nptc_hospital_directory',{},controller.signal).then(data=>setHospitals(data.hospitals)).catch(e=>{if(e.name!=='AbortError')setError('醫院名冊暫時無法載入，可勾選「服務機構不在清單內」並自行填寫。');}).finally(()=>setLoading(false));
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
        const password = passwordCreated ? null : passwordFrom(fields);
        const institution = serviceInstitutionValues(fields, hospitals);
        await rpc('nptc_student_update_profile', { body: { nursingYears: Number(fields.get('nursingYears')), ...institution, examSpecialty: fields.get('examSpecialty'), firstOsce: fields.get('firstOsce') === 'yes', birthDate: fields.get('birthDate') } });
        if (password !== null) { const { error } = await supabase.auth.updateUser({ password }); if (error) throw error; }
        await rpc('nptc_finish_student_activation'); sessionStorage.removeItem('nptc-password-created'); onComplete();
      }
    } catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  }
  const student = state.student;
  return <section className="mx-auto max-w-3xl px-6 py-12"><h1 className="text-2xl font-bold">完成首次啟用</h1><p className="my-4">{state.stage === 'unclaimed' ? '已登入，請核對報名姓名與手機。' : '名冊已核對，請補齊個人資料並設定日後登入密碼。'}</p>
    <form onSubmit={submit} className="space-y-5 rounded-xl border bg-white p-6" key={state.stage}>
      <label className="block">Email（登入帳號）<Input className="mt-2 h-12 px-3 md:text-base" value={email} readOnly /></label>
      {state.stage === 'unclaimed' ? <><label className="block">姓名<Input className="mt-2 h-12 px-3 md:text-base" name="name" defaultValue={sessionStorage.getItem('nptc-activation-name') ?? ''} required /></label><label className="block">手機電話<Input className="mt-2 h-12 px-3 md:text-base" name="phone" type="tel" pattern="09[0-9]{8}" defaultValue={sessionStorage.getItem('nptc-activation-phone') ?? ''} required /></label></> : <>
        <div className="grid gap-4 sm:grid-cols-2"><label>姓名<Input className="mt-2 h-12 px-3 md:text-base" value={student?.name ?? ''} readOnly /></label><label>手機電話<Input className="mt-2 h-12 px-3 md:text-base" value={student?.phone ?? ''} readOnly /></label></div><p className="text-sm">以上資料由管理員建立，如需更正請聯絡管理員。</p>
        <label className="block">護理年資（年）<Input className="mt-2 h-12 px-3 md:text-base" name="nursingYears" type="number" min={0} max={60} step={1} defaultValue={student?.nursingYears ?? ''} required /></label>
        <ServiceInstitution hospital={student?.hospital ?? ''} unit={student?.unit ?? ''} serviceKind={student?.serviceKind} hospitals={hospitals} loading={loading} />
        <label className="block">報考科別<select name="examSpecialty" defaultValue={student?.examSpecialty ?? ''} className="block w-full rounded border p-3" required><option value="">請選擇</option>{['內科','精神科','兒科','外科','婦產科','麻醉科','家庭科'].map(s => <option key={s}>{s}</option>)}</select></label>
        <label className="block">是否首次報考國家 OSCE<select name="firstOsce" defaultValue={student?.firstOsce == null ? '' : student.firstOsce ? 'yes' : 'no'} className="block w-full rounded border p-3" required><option value="">請選擇</option><option value="yes">是</option><option value="no">否</option></select></label>
        <label className="block">出生年月日<Input className="mt-2 h-12 px-3 md:text-base" name="birthDate" type="date" min="1900-01-01" max={new Date().toLocaleDateString('en-CA')} defaultValue={student?.birthDate ?? ''} required /></label>
        {!passwordCreated && <PasswordFields />}
      </>}
      {error && <p role="alert" className="text-red-700">{error}</p>}<Button className="min-h-12 px-6 text-base" type="submit" disabled={busy || (state.stage === 'profile' && loading)}>{busy ? '處理中…' : state.stage === 'unclaimed' ? '核對名冊' : '儲存資料並啟用帳號'}</Button>
    </form></section>;
}

export function ResetStudentPassword({ onComplete, teacher = false }: { onComplete: () => void; teacher?: boolean }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <form className="mx-auto my-12 max-w-lg space-y-5 rounded-xl border bg-white p-6" onSubmit={async event => {
    event.preventDefault(); const fields = new FormData(event.currentTarget); setBusy(true); setError('');
    try { const { data, error } = await supabase.auth.updateUser({ password: passwordFrom(fields) }); if (error) throw error; if (!teacher && data.user?.email) sessionStorage.setItem('nptc-password-created', data.user.email.toLowerCase()); history.replaceState(null, '', teacher ? new URL(`${import.meta.env.BASE_URL}teacher/`, location.origin).href : redirect()); onComplete(); }
    catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  }}><h1 className="text-2xl font-bold">重設登入密碼</h1><PasswordFields />{error && <p role="alert" className="text-red-700">{error}</p>}<Button className="min-h-12 px-6 text-base" type="submit" disabled={busy}>{busy ? '儲存中…' : '儲存新密碼'}</Button></form>;
}
