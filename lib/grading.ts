export const STATIONS=[{key:'q1',day:1,title:'第一題'},{key:'q2',day:1,title:'第二題'},{key:'q3',day:2,title:'第一題'},{key:'q4',day:2,title:'第二題'}] as const;
export const PASS_SCORE=60;
export type Grade={score:number|null;rating:number|null};
export type Student={id:string;workshop_id:string;name:string;email:string;code:string;revision:number;updated_at:string;[key:string]:string|number|null};
export type Workshop={id:string;name:string;published:number;created_at:string};
export type Threshold={key:string;value:number|null;count:number};
export function gradeStatus(score:number|null){return score===null?'尚未登錄':score>=PASS_SCORE?'及格':'未達及格';}
export function computeThreshold(grades:Grade[]):{value:number|null;count:number}{
  const eligible=grades.filter(g=>g.rating===3&&g.score!==null);
  return {value:eligible.length?eligible.reduce((sum,g)=>sum+g.score!,0)/eligible.length:null,count:eligible.length};
}
export function formatScore(n:number|null){return n===null?'—':Number(n.toFixed(2)).toString();}
export function validateGrade(score:unknown,rating:unknown):Grade{
  if(score===null&&rating===null)return {score:null,rating:null};
  if(typeof score!=='number'||!Number.isFinite(score)||score<0||score>100||typeof rating!=='number'||!Number.isInteger(rating)||rating<1||rating>5)throw new Error('每題分數須介於 0–100，Global Rating 須為 1–5 的整數；兩欄請一起填寫或一起留空。');
  return {score,rating};
}
