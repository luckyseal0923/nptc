import { PGlite } from '../.verify-accounts/node_modules/@electric-sql/pglite/dist/index.js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,encrypted_password text);
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('email',current_setting('test.email',true))$$;
grant usage on schema auth to anon,authenticated;`);
for(const file of ['setup','upgrade-workshop-management','upgrade-score-feedback','upgrade-student-phone','upgrade-student-profile','upgrade-dynamic-osce-stations','upgrade-backend-accounts','upgrade-student-activation','upgrade-roster-account-status','upgrade-domain-scores'])await db.exec(readFileSync(`supabase/${file}.sql`,'utf8'));

const workshop='10000000-0000-0000-0000-000000000001';
const stations=Array.from({length:4},(_,i)=>({key:`q${i+1}`,title:`題目 ${i+1}`,testDate:'2026-09-16',complaint:'主訴',diagnosis:'診斷',prompt:'摘要'}));
await db.query(`insert into nptc_private.workshops(id,name,stations) values($1,'demo-np osce',$2::jsonb)`,[workshop,JSON.stringify(stations)]);
for(let i=0;i<20;i++){
  const student=`20000000-0000-0000-0000-${String(i+1).padStart(12,'0')}`;
  await db.query(`insert into nptc_private.students(id,workshop_id,name,email,phone,updated_by) values($1,$2,$3,$4,$5,'00000000-0000-0000-0000-000000000001')`,[student,workshop,`虛擬學員 ${i+1}`,`demo-${i+1}@example.invalid`,`09${String(i).padStart(8,'0')}`]);
  for(let q=1;q<=4;q++)await db.query(`insert into nptc_private.station_grades(student_id,station_key,score,rating) values($1,$2,$3,3)`,[student,`q${q}`,48+((i*7+q*3)%48)]);
}

const backfill=readFileSync('supabase/backfill-demo-domain-scores.sql','utf8');
await db.exec(backfill);
await db.exec(backfill);
const result=await db.query(`select count(*)::int grades,count(domain_scores)::int domains,
count(distinct domain_scores)::int patterns,
count(*) filter(where (select sum(value::numeric) from jsonb_each_text(domain_scores))<>score)::int invalid
from nptc_private.station_grades`);
assert.equal(result.rows[0].grades,80);
assert.equal(result.rows[0].domains,80);
assert.equal(result.rows[0].invalid,0);
assert.ok(result.rows[0].patterns>20,'示範雷達圖應具有足夠差異');
const config=(await db.query(`select stations from nptc_private.workshops where id=$1`,[workshop])).rows[0].stations;
assert.equal(config.length,4);
for(const station of config)assert.deepEqual(station.domainMax,{ros:20,pastHistory:20,currentHistory:20,physicalExam:20,differentialDiagnosis:20});
assert.equal((await db.query(`select min(revision)::int low,max(revision)::int high from nptc_private.students`)).rows[0].low,1,'rerun does not increment revisions again');
await db.close();
console.log('PASS: demo-only backfill creates 80 total-preserving domain scores, four maxima configs, varied radar patterns and is repeatable');
