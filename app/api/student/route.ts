import {identity,json,failure,HttpError} from '@/lib/access';
import {db} from '@/lib/db';
import {thresholds} from '@/lib/records';
import {STATIONS,type Student} from '@/lib/grading';
export const dynamic='force-dynamic';
export async function GET(){try{
  const user=await identity();if(!user)throw new HttpError(401,'請先登入。');
  const {results}=await db().prepare('SELECT s.*,w.name AS workshop_name,w.published FROM students s JOIN workshops w ON w.id=s.workshop_id WHERE s.email=? ORDER BY w.created_at DESC,w.id').bind(user.email).all<Student>();
  const records=await Promise.all(results.map(async row=>({id:row.id,name:row.name,code:row.code,workshopName:row.workshop_name,published:row.published,updatedAt:row.published?row.updated_at:null,grades:row.published?STATIONS.map(({key})=>({key,score:row[`${key}_score`],rating:row[`${key}_rating`]})):[],thresholds:row.published?await thresholds(row.workshop_id):[]})));
  return json({records});
}catch(e){return failure(e);}}
