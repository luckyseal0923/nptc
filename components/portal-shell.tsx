import Link from '@/components/link';
import { Activity, LockKeyhole } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { appUrl } from '@/lib/routes';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
export function PortalShell({
  children,
  email,
  teacher = false,
}: {
  children: React.ReactNode;
  email?: string;
  teacher?: boolean;
}) {
  const [error, setError] = useState('');
  return (
    <>
      <header className="header portal-header">
        <Link href="/" className="brand">
          <span className="brand-symbol">
            <Activity size={25} />
          </span>
          <span>
            為國考而訓<small>NP · OSCE WORKSHOP</small>
          </span>
        </Link>
        <nav aria-label="專區導覽">
          <Link href="/student">學員專區</Link>
          <Link href="/teacher">老師專區</Link>
          <Link href="/">課程首頁</Link>
        </nav>
        {email && (
          <Button
            className="login-link"
            onClick={async () => {
              const { error } = await supabase.auth.signOut();
              if (error) setError(error.message);
            }}
          >
            登出
          </Button>
        )}
      </header>
      <main className="workspace">
        <div className="workspace-heading">
          <div className="section-label">
            {teacher ? 'TEACHING & ASSESSMENT' : 'YOUR LEARNING JOURNEY'}
            <span>{teacher ? '老師專區' : '學員專區'}</span>
          </div>
          {email && <span className="identity-pill">{email}</span>}
        </div>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {children}
      </main>
    </>
  );
}
export function LoginPanel({ teacher = false }: { teacher?: boolean }) {
  const [email, setEmail] = useState(''),
    [token, setToken] = useState(''),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <div className="sign-in-layout">
      <div>
        <h1>
          {teacher
            ? '讓每一份回饋，\n成為學員的下一步。'
            : '每一次練習，\n都有自己的成長軌跡。'}
        </h1>
        <p>
          {teacher
            ? '建立學員名冊，登錄四題 OSCE 分數與 Global Rating，並管理成績公布。'
            : '登入後，查看自己的 OSCE 測驗成績，以及固定及格線與邊緣及格分數。'}
        </p>
        <div className="login-facts">
          <span>2 天訓練</span>
          <span>4 題 OSCE</span>
          <span>100 分／題</span>
        </div>
      </div>
      <section className="portal-panel">
        <LockKeyhole size={32} />
        <h2>{teacher ? '老師登入' : '查看我的成績'}</h2>
        <p>
          請使用{teacher ? '已獲授權的老師信箱' : '老師登錄於名冊中的 Email'}
          登入。
        </p>
        <form
          className="entry-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              if (sent) {
                const { error } = await supabase.auth.verifyOtp({
                  email: email.trim().toLowerCase(),
                  token: token.trim(),
                  type: 'email',
                });
                if (error) throw error;
              } else {
                const { error } = await supabase.auth.signInWithOtp({
                  email: email.trim().toLowerCase(),
                  options: {
                    emailRedirectTo: appUrl(
                      teacher ? '/teacher/' : '/student/',
                    ),
                  },
                });
                if (error) throw error;
                setSent(true);
              }
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Email
            <Input
              type="email"
              required
              autoComplete="email"
              value={email}
              disabled={busy || sent}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {sent && (
            <>
              <p role="status">
                驗證信已寄出。請輸入信中的驗證碼，或開啟信中的登入連結。
              </p>
              <label>
                驗證碼
                <Input
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  disabled={busy}
                />
              </label>
            </>
          )}
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" className="action" disabled={busy}>
            {busy ? '處理中…' : sent ? '驗證並登入' : '寄送登入驗證信'}
          </Button>
          {sent && (
            <Button
              type="button"
              className="action secondary"
              disabled={busy}
              onClick={() => {
                setSent(false);
                setToken('');
                setError('');
              }}
            >
              更換信箱／重新寄送
            </Button>
          )}
        </form>
        <p className="portal-note">
          登入後僅能查詢自己的成績；老師需另外取得管理權限。
        </p>
      </section>
    </div>
  );
}
