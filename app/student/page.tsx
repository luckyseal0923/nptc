import {identity} from '@/lib/access';
import {PortalShell,LoginPanel} from '@/components/portal-shell';
import StudentDashboard from './student-dashboard';
export const dynamic='force-dynamic';
export const metadata={title:'我的 OSCE 成績｜為國考而訓',robots:{index:false,follow:false}};
export default async function StudentPage(){const user=await identity();return <PortalShell email={user?.email}>{user?<StudentDashboard isTeacher={user.isTeacher}/>:<LoginPanel/>}</PortalShell>}
