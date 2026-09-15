import { useEffect, useState } from 'react';
import TeacherDashboard from '@/app/teacher/teacher-dashboard';
import StudentDashboard from '@/app/student/student-dashboard';
import { BackendApplication, BackendAccounts } from '@/components/backend-accounts';
import { DEMO_MODE, demoUser } from '@/lib/demo';
import { rpc, supabase } from '@/lib/supabase';
import { LoginPanel, PortalShell } from '@/components/portal-shell';

export function AuthPortal({ teacher = false }: { teacher?: boolean }) {
  const [user, setUser] = useState<{ role: 'teacher' | 'student'; username: string; email: string } | null | undefined>(undefined);
  const [verificationError, setVerificationError] = useState('');

  useEffect(() => {
    if (DEMO_MODE) {
      setUser(demoUser());
      return;
    }
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      const email = data.session?.user.email;
      if (!email) { setUser(null); return; }
      try {
        const isTeacher = await rpc<boolean>('nptc_is_teacher');
        if (!teacher && !isTeacher) {
          const requestedPhone = sessionStorage.getItem('nptc-pending-student-phone') ?? '';
          const records = await rpc<{ records: Array<{ phone?: string | null }> }>('nptc_student_data');
          const matches = records.records.some((record) => record.phone === requestedPhone);
          if (!matches) {
            await supabase.auth.signOut();
            if (active) { setVerificationError('Email 已驗證，但手機電話與學員名冊不符。'); setUser(null); }
            return;
          }
        }
        if (active) setUser({ role: isTeacher ? 'teacher' : 'student', username: email, email });
      } catch {
        if (active) setUser(null);
      }
    });
    return () => { active = false; };
  }, []);

  if (user === undefined) return null;

  return (
    <PortalShell email={user?.username} teacher={teacher}>
      {!user ? (
        <><LoginPanel teacher={teacher} />{verificationError && <p className="mx-auto -mt-12 max-w-md rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{verificationError}</p>}</>
      ) : teacher && user.role !== 'teacher' ? (
        <BackendApplication email={user.email} />
      ) : teacher ? (
        <div className="workspace"><BackendAccounts /><TeacherDashboard /></div>
      ) : (
        <div className="workspace"><StudentDashboard isTeacher={user.role === 'teacher'} /></div>
      )}
    </PortalShell>
  );
}
