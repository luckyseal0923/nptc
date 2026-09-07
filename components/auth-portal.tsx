import { useEffect, useState } from 'react';
import TeacherDashboard from '@/app/teacher/teacher-dashboard';
import StudentDashboard from '@/app/student/student-dashboard';
import Link from '@/components/link';
import { demoUser } from '@/lib/demo';
import { LoginPanel, PortalShell } from '@/components/portal-shell';

export function AuthPortal({ teacher = false }: { teacher?: boolean }) {
  const [user, setUser] = useState<ReturnType<typeof demoUser> | undefined>(undefined);

  useEffect(() => {
    setUser(demoUser());
  }, []);

  if (user === undefined) return null;

  return (
    <PortalShell email={user?.username} teacher={teacher}>
      {!user ? (
        <LoginPanel teacher={teacher} />
      ) : teacher && user.role !== 'teacher' ? (
        <div className="mx-auto max-w-3xl px-6 py-16">
          <h1 className="text-3xl font-black">此帳號沒有老師權限</h1>
          <p className="mt-4 text-[#5c7772]">請使用老師展示帳號 teacher／demo1234 登入。</p>
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
