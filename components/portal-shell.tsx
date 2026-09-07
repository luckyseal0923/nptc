import Link from '@/components/link';
import { DEMO_MODE, signInDemo, signOutDemo } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import { Activity, LockKeyhole } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function PortalShell({
  children,
  email,
  teacher = false,
}: {
  children: React.ReactNode;
  email?: string;
  teacher?: boolean;
}) {
  return (
    <main className="min-h-screen bg-[#f8faf7] text-[#133b38]">
      <header className="border-b border-[#dbe4dc] bg-white/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-[#123f3a] text-[#c9ef72]">
              <Activity className="h-6 w-6" />
            </span>
            <span>
              <strong className="block text-lg tracking-wide">為國考而訓</strong>
              <small className="tracking-[0.22em] text-[#2c6660]">NP ・ OSCE WORKSHOP</small>
            </span>
          </Link>
          <nav className="flex items-center gap-5 text-sm font-medium">
            {teacher ? <Link href="/student/">學員專區</Link> : <Link href="/teacher/">老師專區</Link>}
            <Link href="/">課程首頁</Link>
            {email && (
              <button
                type="button"
                className="rounded-md border border-[#b9cdc5] px-3 py-1.5 text-xs"
                onClick={() => {
                  if (DEMO_MODE) {
                    signOutDemo();
                    location.reload();
                  } else {
                    supabase.auth.signOut().then(() => location.reload());
                  }
                }}
              >
                登出
              </button>
            )}
          </nav>
        </div>
      </header>
      {children}
    </main>
  );
}

export function LoginPanel({ teacher = false }: { teacher?: boolean }) {
  const role = teacher ? 'teacher' : 'student';
  const [username, setUsername] = useState(DEMO_MODE ? (teacher ? 'teacher' : 'student') : '');
  const [password, setPassword] = useState(DEMO_MODE ? 'demo1234' : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (DEMO_MODE) {
        signInDemo(role, username.trim(), password);
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: username.trim(), password });
        if (authError) throw authError;
      }
      location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '登入失敗，請再試一次。');
      setBusy(false);
    }
  }

  const isDemo = DEMO_MODE;
  return (
    <div className="mx-auto grid max-w-6xl gap-12 px-6 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
      <section>
        <p className="mb-4 text-xs font-bold tracking-[0.2em] text-[#3d766e]">TEACHING & ASSESSMENT</p>
        <h1 className="max-w-xl text-4xl font-black leading-tight text-[#123f3a] md:text-5xl">
          {teacher ? '讓每一份回饋，成為學員的下一步。' : '看見自己的進步，準備下一次挑戰。'}
        </h1>
        <p className="mt-7 max-w-xl leading-8 text-[#56716c]">
          {teacher
            ? '建立學員名冊、登錄四題 OSCE 分數與 Global Rating，並管理成績公布。'
            : '登入後查看已公布的 OSCE 成績、各站回饋與下一步練習方向。'}
        </p>
        <div className="mt-9 flex gap-6 text-sm font-semibold text-[#245750]">
          <span>2 天訓練</span><span>4 題 OSCE</span><span>100 分／題</span>
        </div>
      </section>

      <section className="rounded-2xl border border-[#d5e0d8] bg-white p-8 shadow-sm">
        <LockKeyhole className="mb-7 h-8 w-8 text-[#174943]" />
        <h2 className="text-2xl font-black">{teacher ? '老師登入' : '學員登入'}</h2>
        <p className="mt-3 text-sm leading-6 text-[#5c7772]">{isDemo ? '使用展示帳號登入，資料只會儲存在此瀏覽器。' : teacher ? '請使用已授權的老師 Email 與密碼登入。' : '請使用報名時留下的 Email 與身分證後三碼登入。'}</p>
        <form className="mt-7 space-y-5" onSubmit={login}>
          <label className="block text-sm font-medium">
            {isDemo ? '帳號' : 'Email'}
            <Input type={isDemo ? 'text' : 'email'} value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" className="mt-2" required />
          </label>
          <label className="block text-sm font-medium">
            {isDemo ? '密碼' : teacher ? '密碼' : '身分證後三碼'}
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" className="mt-2" required minLength={isDemo ? undefined : 3} maxLength={isDemo ? undefined : teacher ? undefined : 3} />
          </label>
          {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full bg-[#174943] hover:bg-[#0f3834]">
            {busy ? '登入中…' : isDemo ? '登入展示帳號' : '登入'}
          </Button>
        </form>
        {isDemo && <div className="mt-6 border-t border-[#dbe4dc] pt-5 text-sm leading-6 text-[#5c7772]">
          <p>老師：<strong className="text-[#174943]">teacher／demo1234</strong></p>
          <p>學員：<strong className="text-[#174943]">student／demo1234</strong></p>
        </div>}
      </section>
    </div>
  );
}
