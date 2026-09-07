import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const base='http://localhost:3000';
const teacherHeaders={Cookie:'__sites_local_auth=1'};
const ids=[];let checks=0;
async function call(path,body,status=200,headers=teacherHeaders){const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{...headers,...(body===undefined?{}:{'Content-Type':'application/json',Origin:base})},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,status,JSON.stringify(data));checks++;return data;}
const api='/api/teacher';
try{
 await call(api,undefined,401,{});
 await call('/api/student',undefined,401,{});
 await call(api,undefined,401,{'oai-authenticated-user-id':'spoof','oai-authenticated-user-email':'chin.wei.chang0923@gmail.com'});
 await call(api,{action:'createWorkshop',name:'denied'},401,{});
 const csrf=await fetch(base+api,{method:'POST',headers:{...teacherHeaders,'Content-Type':'application/json',Origin:'https://other.invalid'},body:'{}'});assert.equal(csrf.status,403);checks++;
 const w=await call(api,{action:'createWorkshop',name:'LOCAL-TEST-'+Date.now()});ids.push(w.id);
 await call(api,{action:'publish',workshopId:w.id,published:true},400);
 for(const [code,name,email] of [['A','Local test learner','seedy@sites.test'],['B','Other learner','other@example.test'],['C','Third learner','third@example.test']])await call(api,{action:'saveStudent',workshopId:w.id,code,name,email});
 await call(api,{action:'saveStudent',workshopId:w.id,code:'D',name:'duplicate',email:'SEEDY@sites.test'},409);
 let data=await call(api+'?workshop='+w.id);const a=data.students.find(s=>s.code==='A'),b=data.students.find(s=>s.code==='B');
 const empty={q1:{score:null,rating:null},q2:{score:null,rating:null},q3:{score:null,rating:null},q4:{score:null,rating:null}};
 const scoreBody={action:'saveScores',workshopId:w.id,id:a.id,revision:0};
 await call(api,{...scoreBody,grades:{...empty,q1:{score:101,rating:3}}},400);
 await call(api,{...scoreBody,grades:{...empty,q1:{score:60,rating:3.5}}},400);
 await call(api,{...scoreBody,grades:{...empty,q1:{score:60,rating:null}}},400);
 await call(api,{...scoreBody,grades:{...empty,q1:{score:50,rating:3},q2:{score:20,rating:3},q3:{score:0,rating:3}}});
 await call(api,{...scoreBody,grades:empty},409);
 await call(api,{...scoreBody,id:b.id,grades:{...empty,q1:{score:70,rating:3},q2:{score:80,rating:3},q3:{score:100,rating:4}}});
 data=await call(api+'?workshop='+w.id);assert.deepEqual(data.thresholds.map(t=>[t.value,t.count]),[[60,2],[50,2],[0,1],[null,0]]);checks++;
 let mine=await call('/api/student?student='+b.id);let own=mine.records.find(r=>r.id===a.id);assert(own);assert(!mine.records.some(r=>r.id===b.id));assert.deepEqual(own.grades,[]);assert.deepEqual(own.thresholds,[]);checks++;
 const w2=await call(api,{action:'createWorkshop',name:'LOCAL-TEST-isolation-'+Date.now()});ids.push(w2.id);
 await call(api,{action:'saveStudent',workshopId:w2.id,code:'A',name:'Separate cohort',email:'other@example.test'});
 const second=await call(api+'?workshop='+w2.id);
 await call(api,{...scoreBody,workshopId:w2.id,id:second.students[0].id,grades:{...empty,q1:{score:99,rating:3}}});
 data=await call(api+'?workshop='+w.id);assert.equal(data.thresholds[0].value,60);checks++;
 await call(api,{action:'publish',workshopId:w.id,published:true});
 mine=await call('/api/student');own=mine.records.find(r=>r.id===a.id);assert.equal(own.grades[0].score,50);assert.equal(own.thresholds[0].value,60);assert(!mine.records.some(r=>r.name==='Other learner'));checks++;
 await call(api,{...scoreBody,revision:1,grades:empty},409);
 await call(api,{action:'publish',workshopId:w.id,published:false});
 mine=await call('/api/student');own=mine.records.find(r=>r.id===a.id);assert.deepEqual(own.grades,[]);checks++;
 console.log(`PASS: ${checks} API, authorization, isolation, grading and publication checks.`);
}finally{
 await writeFile('work/test-cleanup.sql',ids.map(id=>`DELETE FROM students WHERE workshop_id='${id}';\nDELETE FROM workshops WHERE id='${id}' AND name LIKE 'LOCAL-TEST-%';`).join('\n'));
}
