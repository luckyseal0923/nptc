import {identity} from '@/lib/access';
import {PortalShell,LoginPanel} from '@/components/portal-shell';
import TeacherDashboard from './teacher-dashboard';
export const dynamic='force-dynamic';
export const metadata={title:'老師專區｜為國考而訓',robots:{index:false,follow:false}};
export default async function TeacherPage(){const user=await identity();return <PortalShell email={user?.email} teacher>{!user?<LoginPanel teacher/>:!user.isTeacher?<section className="portal-panel"><h1>此帳號尚未獲得老師權限</h1><p>請確認目前登入的 Email，或使用右上方「登出」切換至已授權的老師帳號。</p><a className="button" href="/student">前往學員專區</a></section>:<TeacherDashboard/>}</PortalShell>}
