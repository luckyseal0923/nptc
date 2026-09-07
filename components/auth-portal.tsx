import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, rpc } from '@/lib/supabase';
import { PortalShell, LoginPanel } from './portal-shell';
import Link from './link';
import TeacherDashboard from '@/app/teacher/teacher-dashboard';
import StudentDashboard from '@/app/student/student-dashboard';
export function AuthPortal({ teacher = false }: { teacher?: boolean }) {
  const [session, setSession] = useState<Session | null>(null),
    [ready, setReady] = useState(false),
    [role, setRole] = useState<{ uid: string; teacher: boolean } | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (active) {
        setSession(data.session);
        setReady(true);
        if (error) setError(error.message);
      }
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) {
        setSession(next);
        setReady(true);
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    let active = true;
    setRole(null);
    setError('');
    if (session)
      rpc<boolean>('nptc_is_teacher')
        .then((value) => {
          if (active) setRole({ uid: session.user.id, teacher: value });
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [session?.user.id]);
  const authorized = role?.uid === session?.user.id ? role : null;
  return (
    <PortalShell email={session?.user.email} teacher={teacher}>
      {error ? (
        <section className="notice error" role="alert">
          <p>{error}</p>
          <button onClick={() => location.reload()}>重新載入</button>
        </section>
      ) : !ready ? (
        <p role="status">正在確認登入狀態…</p>
      ) : !session ? (
        <LoginPanel teacher={teacher} />
      ) : !authorized ? (
        <p role="status">正在確認帳號權限…</p>
      ) : teacher && !authorized.teacher ? (
        <section className="portal-panel">
          <h1>此帳號尚未獲得老師權限</h1>
          <p>請聯絡管理員，或登出後切換至已授權的老師信箱。</p>
          <Link className="button" href="/student">
            前往學員專區
          </Link>
        </section>
      ) : teacher ? (
        <TeacherDashboard key={session.user.id} />
      ) : (
        <StudentDashboard
          key={session.user.id}
          isTeacher={authorized.teacher}
        />
      )}
    </PortalShell>
  );
}
