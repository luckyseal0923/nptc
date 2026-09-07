import {db} from './db';
import {STATIONS,type Threshold,type Workshop,type Student} from './grading';
export async function thresholds(workshopId:string):Promise<Threshold[]>{
  const columns=STATIONS.flatMap(({key})=>[`AVG(CASE WHEN ${key}_rating = 3 THEN ${key}_score END) AS ${key}_value`,`COUNT(CASE WHEN ${key}_rating = 3 THEN ${key}_score END) AS ${key}_count`]).join(',');
  const row=await db().prepare(`SELECT ${columns} FROM students WHERE workshop_id = ?`).bind(workshopId).first<Record<string,number|null>>();
  return STATIONS.map(({key})=>({key,value:row?.[`${key}_value`]??null,count:row?.[`${key}_count`]??0}));
}
export async function teacherData(id?:string|null){
  const {results:workshops}=await db().prepare('SELECT * FROM workshops ORDER BY created_at DESC,id').all<Workshop>();
  const selected=workshops.find(w=>w.id===id)??workshops[0]??null;
  const students=selected?(await db().prepare('SELECT * FROM students WHERE workshop_id = ? ORDER BY code,name').bind(selected.id).all<Student>()).results:[];
  return {workshops,selected,students,thresholds:selected?await thresholds(selected.id):[]};
}
