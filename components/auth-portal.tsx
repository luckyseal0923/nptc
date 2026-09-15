import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { BackendWorkspace } from '@/components/backend-workspace';
import StudentDashboard from '@/app/student/student-dashboard';
import { BackendApplication } from '@/components/backend-accounts';
import { BackendLogin } from '@/components/backend-login';
import { StudentLogin, StudentActivation, ResetStudentPassword, type Onboarding } from '@/components/student-access';
import { DEMO_MODE, demoUser } from '@/lib/demo';
import { rpc, supabase } from '@/lib/supabase';
import { LoginPanel, PortalShell } from '@/components/portal-shell';

export function AuthPortal({ teacher = false }: { teacher?: boolean }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [user, setUser] = useState<{ role: 'teacher' | 'student'; username: string; email: string } | null | undefined>(undefined);
  const [status, setStatus] = useState<Onboarding | null>(null);
  const [error, setError] = useState(''), [version, setVersion] = useState(0);
  const [recovery, setRecovery] = useState(new URLSearchParams(location.search).get('reset') === '1');
  useEffect(() => {
    if (DEMO_MODE) { setUser(demoUser()); return; }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, current) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      setSession(current);
    });
    return () => subscription.unsubscribe();
  }, []);
  const email = session?.user.email, uid = session?.user.id;
  const sessionReady = session !== undefined;
  useEffect(() => {
    if (DEMO_MODE || !sessionReady) return;
    if (!email) { setUser(null); setStatus(null); setError(''); return; }
    let active = true;
    setUser(undefined); setError('');
    (async () => {
      try {
        const isTeacher = await rpc<boolean>('nptc_is_teacher');
        const onboarding = !teacher && !isTeacher && !recovery ? await rpc<Onboarding>('nptc_student_onboarding_status') : null;
        if (active) { setStatus(onboarding); setUser({ role: isTeacher ? 'teacher' : 'student', username: email, email }); }
      } catch (cause) { if (active) setError((cause as Error).message); }
    })();
    return () => { active = false; };
  }, [email, uid, sessionReady, teacher, version, recovery]);
  const reload = () => setVersion(v => v + 1);
  return <PortalShell email={user?.username ?? email} teacher={teacher}>
    {error ? <div className="mx-auto max-w-xl space-y-4 px-6 py-12" role="alert"><p>{error}</p><button className="underline" onClick={reload}>重新檢查</button></div>
    : user === undefined ? <p className="px-6 py-12 text-center">正在確認登入狀態…</p>
    : !user ? <>{recovery && <p className="p-4 text-center" role="alert">請開啟最新的重設密碼信件；連結失效時可重新申請。</p>}{!DEMO_MODE ? (teacher ? <BackendLogin /> : <StudentLogin />) : <LoginPanel teacher={teacher} />}</>
    : recovery ? <ResetStudentPassword teacher={teacher} onComplete={() => { setRecovery(false); reload(); }} />
    : teacher && user.role !== 'teacher' ? <BackendApplication email={user.email} />
    : teacher ? <BackendWorkspace key={user.email} />
    : !DEMO_MODE && user.role !== 'teacher' && status?.stage !== 'active' ? <StudentActivation key={user.email} email={user.email} status={status ?? { stage: 'unclaimed' }} onComplete={reload} />
    : <div className="workspace"><StudentDashboard /></div>}
  </PortalShell>;
}
