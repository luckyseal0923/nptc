import {db} from '@/lib/db';
import {requireTeacher,verifyWrite,json,failure,HttpError} from '@/lib/access';
import {teacherData} from '@/lib/records';
import {STATIONS,validateGrade,type Workshop} from '@/lib/grading';
export const dynamic='force-dynamic';
function text(value:unknown,label:string,max=100){if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw new HttpError(400,`${label}不可空白，且不得超過 ${max} 字。`);return value.trim();}
export async function GET(request:Request){try{await requireTeacher();return json(await teacherData(new URL(request.url).searchParams.get('workshop')));}catch(e){return failure(e);}}
export async function POST(request:Request){try{
  const user=await requireTeacher();verifyWrite(request);
  let parsed:unknown;try{parsed=await request.json();}catch{throw new HttpError(400,'資料格式不正確。');}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new HttpError(400,'資料格式不正確。');
  const body=parsed as Record<string,unknown> & {grades?:Record<string,{score?:unknown;rating?:unknown}>};
  const now=new Date().toISOString();
  if(body.action==='createWorkshop'){
    const id=crypto.randomUUID();await db().prepare('INSERT INTO workshops (id,name,created_at) VALUES (?,?,?)').bind(id,text(body.name,'梯次名稱'),now).run();return json({id});
  }
  const workshopId=text(body.workshopId,'梯次');const workshop=await db().prepare('SELECT * FROM workshops WHERE id = ?').bind(workshopId).first<Workshop>();
  if(!workshop)throw new HttpError(404,'找不到此梯次。');
  if(body.action==='publish'){
    if(typeof body.published!=='boolean')throw new HttpError(400,'公布狀態不正確。');
    if(body.published){const count=await db().prepare('SELECT COUNT(*) AS n FROM students WHERE workshop_id = ? AND (q1_score IS NOT NULL OR q2_score IS NOT NULL OR q3_score IS NOT NULL OR q4_score IS NOT NULL)').bind(workshopId).first<{n:number}>();if(!count?.n)throw new HttpError(400,'至少登錄一筆成績後才能公布。');}
    await db().prepare('UPDATE workshops SET published = ? WHERE id = ?').bind(body.published?1:0,workshopId).run();return json({ok:true});
  }
  if(workshop.published)throw new HttpError(409,'請先撤回公布，再修改名冊或成績。');
  if(body.action==='saveStudent'){
    const name=text(body.name,'姓名'),email=text(body.email,'Email',254).toLowerCase(),code=text(body.code,'學號',40);
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new HttpError(400,'請輸入有效的 Email。');
    if(body.id){
      if(typeof body.revision!=='number'||!Number.isInteger(body.revision)||body.revision<0)throw new HttpError(400,'資料版本不正確。');
      const result=await db().prepare('UPDATE students SET name=?,email=?,code=?,revision=revision+1,updated_at=?,updated_by=? WHERE id=? AND workshop_id=? AND revision=? AND EXISTS (SELECT 1 FROM workshops WHERE id=? AND published=0)').bind(name,email,code,now,user.userId,text(body.id,'學員'),workshopId,body.revision,workshopId).run();
      if(!result.meta.changes)throw new HttpError(409,'資料已更新或公布，請重新載入後再編輯。');
    }else{
      const result=await db().prepare('INSERT INTO students (id,workshop_id,name,email,code,updated_at,updated_by) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM workshops WHERE id=? AND published=0)').bind(crypto.randomUUID(),workshopId,name,email,code,now,user.userId,workshopId).run();
      if(!result.meta.changes)throw new HttpError(409,'此梯次已公布，請重新載入。');
    }return json({ok:true});
  }
  if(body.action==='saveScores'){
    const id=text(body.id,'學員');if(typeof body.revision!=='number'||!Number.isInteger(body.revision)||body.revision<0)throw new HttpError(400,'資料版本不正確。');
    const values:(number|null)[]=[];
    for(const {key} of STATIONS){try{const grade=validateGrade(body.grades?.[key]?.score,body.grades?.[key]?.rating);values.push(grade.score,grade.rating);}catch(e){throw new HttpError(400,(e as Error).message);}}
    const assignments=STATIONS.map(({key})=>`${key}_score=?,${key}_rating=?`).join(',');
    const result=await db().prepare(`UPDATE students SET ${assignments},revision=revision+1,updated_at=?,updated_by=? WHERE id=? AND workshop_id=? AND revision=? AND EXISTS (SELECT 1 FROM workshops WHERE id=? AND published=0)`).bind(...values,now,user.userId,id,workshopId,body.revision,workshopId).run();
    if(!result.meta.changes)throw new HttpError(409,'資料已更新或公布，請重新載入後再編輯。');return json({ok:true});
  }
  throw new HttpError(400,'不支援的操作。');
}catch(e){return failure(e);}}
