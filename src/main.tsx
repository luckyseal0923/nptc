import {createRoot} from 'react-dom/client';
import {lazy,Suspense} from 'react';
const Home=lazy(()=>import('../app/page'));
const AuthPortal=lazy(()=>import('../components/auth-portal').then(module=>({default:module.AuthPortal})));
import '../app/globals.css';
import '../app/portal.css';
import { surveyIdFromShortQuery } from '../lib/survey-short-link';
const basePath = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
const rawPath = location.pathname.replace(/\/$/, '');
const path = (basePath && rawPath.startsWith(basePath) ? rawPath.slice(basePath.length) : rawPath) || '';
const shortAssignmentId = path === '/q' ? surveyIdFromShortQuery(location.search) : null;
if(path) {document.title=(path==='/teacher'?'後臺管理系統':path==='/q'||new URLSearchParams(location.search).has('survey')?'問卷填寫':'我的 OSCE 成績')+'｜為國考而訓';const meta=document.createElement('meta');meta.name='robots';meta.content='noindex,nofollow';document.head.append(meta);}
createRoot(document.getElementById('root')!).render(<Suspense fallback={<p role="status">正在載入頁面…</p>}>{path==='/q'&&shortAssignmentId?<AuthPortal shortAssignmentId={shortAssignmentId}/>:path==='/teacher'||path==='/student'?<AuthPortal teacher={path==='/teacher'}/>:path===''?<Home/>:<main><h1>{path==='/q'?'問卷連結不完整或格式不正確':'找不到此頁面'}</h1>{path==='/q'&&<p>請向老師索取完整的問卷連結。</p>}<a href={basePath || '/'}>回首頁</a></main>}</Suspense>);
