import { useEffect, useState } from 'react';
import TeacherDashboard from '@/app/teacher/teacher-dashboard';
import StudentDashboard from '@/app/student/student-dashboard';
import Link from '@/components/link';
import { DEMO_MODE, demoUser } from '@/lib/demo';
import { rpc, supabase } from '@/lib/supabase';
import { LoginPanel, PortalShell } from '@/components/portal-shell';

export function AuthPortal({ teacher = false }: { teacher?: boolean }) {
  const [user, setUser] = useState<{ role: 'teacher' | 'student'; username: string; email: string } | null | undefined>(undefined);

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
        <LoginPanel teacher={teacher} />
      ) : teacher && user.role !== 'teacher' ? (
        <div className="mx-auto max-w-3xl px-6 py-16">
          <h1 className="text-3xl font-black">此帳號沒有老師權限</h1>
          <p className="mt-4 text-[#5c7772]">請使用已授權的老師帳號登入。</p>
          <Link href="/student/" className="mt-7 inline-block rounded-md bg-[#174943] px-4 py-2 text-white">前往學員專區</Link>
        </div>
      ) : teacher ? (
        <TeacherDashboard />
      ) : (
        <StudentDashboard isTeacher={user.role === 'teacher'} />
      )}
    </PortalShell>
  );
}
