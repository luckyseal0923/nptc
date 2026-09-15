import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import TeacherDashboard from '@/app/teacher/teacher-dashboard';
import { BackendAccounts } from '@/components/backend-accounts';
import { rpc } from '@/lib/supabase';
import { DEMO_MODE } from '@/lib/demo';

export function BackendWorkspace() {
  const [page, setPage] = useState<'courses' | 'accounts'>('courses');
  const [canReview, setCanReview] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [navigation, setNavigation] = useState<HTMLElement | null>(null);
  useEffect(() => { setNavigation(document.getElementById('backend-navigation')); }, []);
  useEffect(() => {
    if (DEMO_MODE) return;
    let active = true;
    setError('');
    rpc<boolean>('nptc_is_account_reviewer').then(result => {
      if (active) { setCanReview(result); if (!result) setPage('courses'); }
    }).catch(() => { if (active) setError('無法確認帳號管理權限，課程與成績管理仍可使用。'); });
    return () => { active = false; };
  }, [retry]);
  return <div className="workspace">
    {navigation && createPortal(<>
      {(['courses', ...(canReview ? ['accounts'] : [])] as ('courses' | 'accounts')[]).map(value => <button
        key={value} type="button" aria-current={page === value ? 'page' : undefined}
        aria-controls={`backend-${value}`}
        className={`border-b-2 py-1 text-sm ${page === value ? 'border-[#174943] font-bold text-[#174943]' : 'border-transparent text-[#56716c] hover:text-[#174943]'}`}
        onClick={() => setPage(value)}>{value === 'courses' ? '課程與成績管理' : '帳號管理'}</button>)}
    </>, navigation)}
    {error && <p role="alert" className="mb-4 text-sm">{error} <button type="button" className="underline" onClick={() => setRetry(v => v + 1)}>重新確認</button></p>}
    <section id="backend-courses" aria-label="課程與成績管理" hidden={page !== 'courses'}><TeacherDashboard /></section>
    {canReview && <section id="backend-accounts" aria-label="帳號管理" hidden={page !== 'accounts'}>{page === 'accounts' && <BackendAccounts expanded />}</section>}
  </div>;
}
