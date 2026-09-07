import {createRoot} from 'react-dom/client';
import Home from '../app/page';
import {AuthPortal} from '../components/auth-portal';
import '../app/globals.css';
import '../app/portal.css';
const basePath = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
const rawPath = location.pathname.replace(/\/$/, '');
const path = (basePath && rawPath.startsWith(basePath) ? rawPath.slice(basePath.length) : rawPath) || '';
if(path) {document.title=(path==='/teacher'?'老師專區':'我的 OSCE 成績')+'｜為國考而訓';const meta=document.createElement('meta');meta.name='robots';meta.content='noindex,nofollow';document.head.append(meta);}
createRoot(document.getElementById('root')!).render(path==='/teacher'||path==='/student'?<AuthPortal teacher={path==='/teacher'}/>:path===''?<Home/>:<main><h1>找不到此頁面</h1><a href={basePath || '/'}>回首頁</a></main>);
