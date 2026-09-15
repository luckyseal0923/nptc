import { lazy, Suspense, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import TeacherDashboard from '@/app/teacher/teacher-dashboard';
import { BackendAccounts } from '@/components/backend-accounts';
import { rpc } from '@/lib/supabase';
import { DEMO_MODE } from '@/lib/demo';

const LearningAnalysis = lazy(() => import('@/components/learning-analysis'));

export function BackendWorkspace() {
  const [page, setPage] = useState<'courses' | 'analysis' | 'accounts'>('courses');
  const [currentWorkshopId, setCurrentWorkshopId] = useState<string>();
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
      if (active) { setCanReview(result); if (!result) setPage(page => page === 'accounts' ? 'courses' : page); }
    }).catch(() => { if (active) setError('無法確認帳號管理權限，課程與成績管理仍可使用。'); });
    return () => { active = false; };
  }, [retry]);
  return <div className="workspace">
    {navigation && createPortal(<>
      {(['courses', 'analysis', ...(canReview ? ['accounts'] : [])] as ('courses' | 'analysis' | 'accounts')[]).map(value => <button
        key={value} type="button" aria-current={page === value ? 'page' : undefined}
        aria-controls={`backend-${value}`}
        className={`border-b-2 py-1 text-sm text-[#174943] ${page === value ? 'border-[#174943] font-bold' : 'border-transparent hover:border-[#9bb5aa]'}`}
        onClick={() => setPage(value)}>{value === 'courses' ? '課程與成績管理' : value === 'analysis' ? '學習分析儀表板' : '帳號管理'}</button>)}
    </>, navigation)}
    {error && <p role="alert" className="mb-4 text-sm">{error} <button type="button" className="underline" onClick={() => setRetry(v => v + 1)}>重新確認</button></p>}
    <section id="backend-courses" aria-label="課程與成績管理" hidden={page !== 'courses'}><TeacherDashboard onWorkshopChange={setCurrentWorkshopId} /></section>
    <section id="backend-analysis" aria-label="學習分析儀表板" hidden={page !== 'analysis'}>{page === 'analysis' && <Suspense fallback={<p role="status">正在載入學習分析…</p>}><LearningAnalysis currentWorkshopId={currentWorkshopId}/></Suspense>}</section>
    {canReview && <section id="backend-accounts" aria-label="帳號管理" hidden={page !== 'accounts'}>{page === 'accounts' && <BackendAccounts expanded />}</section>}
  </div>;
}
