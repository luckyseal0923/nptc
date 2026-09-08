export type StationDefinition={key:string;title:string;testDate:string;complaint:string;diagnosis:string;prompt:string};
export const DEFAULT_STATIONS:StationDefinition[]=[
 {key:'q1',title:'第一題',testDate:'',complaint:'',diagnosis:'',prompt:''},
 {key:'q2',title:'第二題',testDate:'',complaint:'',diagnosis:'',prompt:''},
 {key:'q3',title:'第三題',testDate:'',complaint:'',diagnosis:'',prompt:''},
 {key:'q4',title:'第四題',testDate:'',complaint:'',diagnosis:'',prompt:''},
];
export const STATIONS=DEFAULT_STATIONS;
export const PASS_SCORE=60;
export type Grade={score:number|null;rating:number|null};
export type Student={id:string;workshop_id:string;name:string;email:string;phone:string;revision:number;updated_at:string;[key:string]:string|number|null};
export type Workshop={id:string;name:string;published:number;publishedStations?:string[];created_at:string;stations?:StationDefinition[]};
export type Threshold={key:string;value:number|null;count:number};
export function gradeStatus(score:number|null){return score===null?'尚未登錄':score>=PASS_SCORE?'及格':'未達及格';}
export function computeThreshold(grades:Grade[]):{value:number|null;count:number}{const eligible=grades.filter(g=>g.rating===3&&g.score!==null);return {value:eligible.length?eligible.reduce((sum,g)=>sum+g.score!,0)/eligible.length:null,count:eligible.length};}
export function formatScore(n:number|null){return n===null?'—':Number(n.toFixed(2)).toString();}
export function maskPhone(value:string|null|undefined){if(!value)return '尚未填寫';return value.length<5?'***':`${value.slice(0,4)}${'*'.repeat(Math.max(0,value.length-7))}${value.slice(-3)}`;}
export function validateGrade(score:unknown,rating:unknown):Grade{if(score===null&&rating===null)return {score:null,rating:null};if(typeof score!=='number'||!Number.isFinite(score)||score<0||score>100||typeof rating!=='number'||!Number.isInteger(rating)||rating<1||rating>5)throw new Error('每題分數須介於 0–100，Global Rating 須為 1–5 的整數；兩欄請一起填寫或一起留空。');return {score,rating};}
export function workshopStations(workshop:Workshop|null|undefined):StationDefinition[]{const configured=workshop?.stations;if(!configured?.length)return DEFAULT_STATIONS;return configured.map((station,index)=>({key:station.key||`q${index+1}`,title:station.title||`OSCE 第 ${index+1} 題`,testDate:station.testDate||'',complaint:station.complaint||'',diagnosis:station.diagnosis||'',prompt:station.prompt||''}));}
