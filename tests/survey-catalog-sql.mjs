import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { definition as dti, scoring, surveys } from './helpers-surveys.mjs';

const vpirs = JSON.parse(readFileSync('lib/vpirs-e.json', 'utf8'));
const satisfaction = JSON.parse(readFileSync('lib/learning-satisfaction.json', 'utf8'));

test('new instruments retain answers, defer scoring and preserve existing survey records', async t => {
 const db = new PGlite();
 const root='00000000-0000-0000-0000-000000000001', user='00000000-0000-0000-0000-000000000002';
 const workshop='10000000-0000-0000-0000-000000000001', student='20000000-0000-0000-0000-000000000001';
 const upgrade=readFileSync('supabase/upgrade-survey-catalog.sql','utf8');
 const asUser=async (id=root)=>{await db.exec('reset role');await db.query("select set_config('test.uid',$1,false),set_config('test.email',$2,false)",[id,id===root?'chin.wei.chang0923@gmail.com':'learner@example.test']);await db.exec('set role authenticated');};
 const call=async(name,body)=>(await db.query(`select public.nptc_survey_${name}($1::jsonb) value`,[JSON.stringify(body)])).rows[0].value;
 const assign=async d=>(await call('assign',{workshopId:workshop,scaleCode:d.code,scaleVersion:d.version,requestId:crypto.randomUUID(),status:'open',note:'僅供驗證'})).id;
 const submit=async(id,d,answers)=>call('submit',{assignmentId:id,version:d.version,requestId:crypto.randomUUID(),answers,scores:{total:9999}});
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
   create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,encrypted_password text);
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('email',current_setting('test.email',true))$$;
   grant usage on schema auth to anon,authenticated;`);
  for(const f of ['install','upgrade-surveys','upgrade-survey-library','upgrade-survey-analysis','upgrade-survey-deletion'])await db.exec(readFileSync(`supabase/${f}.sql`,'utf8'));
  await db.query('insert into auth.users values($1,$2,now(),$3),($4,$5,now(),$3)',[root,'chin.wei.chang0923@gmail.com','fixture-only',user,'learner@example.test']);
  await db.query('insert into nptc_private.workshops(id,name) values($1,$2)',[workshop,'隔離測試']);
  await db.query('insert into nptc_private.students(id,workshop_id,name,email,phone,updated_by) values($1,$2,$3,$4,$5,$6)',[student,workshop,'測試學員','learner@example.test','0912345678',root]);
  await db.query('insert into nptc_private.student_accounts(user_id,email,activated_at) values($1,$2,now())',[user,'learner@example.test']);
  await asUser();const old=await assign(dti);await asUser(user);await submit(old,dti,Array(14).fill(4));await db.exec('reset role');
  const saved=(await db.query('select to_jsonb(r) value from nptc_private.survey_responses r')).rows;
  await db.exec(upgrade);await db.exec(upgrade);
  assert.deepEqual((await db.query('select to_jsonb(r) value from nptc_private.survey_responses r')).rows,saved);

  await t.test('catalog snapshots match 25-item VPIRS and all 15 workbook questions',async()=>{
   assert.equal(vpirs.items.length,25);assert.deepEqual(Object.values(vpirs.dimensions).map(a=>a.length),[14,4,3,4]);
   assert.deepEqual(vpirs.negativeItems,[19,20,21,22,23,24,25]);assert.deepEqual(vpirs.reverseItems,[]);
   assert.equal(satisfaction.items.length,15);assert.equal(satisfaction.items.filter(q=>q.type==='text').length,3);
   assert.equal(satisfaction.items.filter(q=>q.required===false).length,3);assert.deepEqual(satisfaction.items[12].options,['是','否']);
   for(const d of [vpirs,satisfaction])assert.deepEqual((await db.query('select definition from nptc_private.survey_instruments where code=$1 and version=$2',[d.code,d.version])).rows[0].definition,d);
  });
  let vpId,satId;
  await asUser();vpId=await assign(vpirs);satId=await assign(satisfaction);await asUser(user);
  await t.test('VPIRS requires 25 valid answers and never creates inferred reverse or total scores',async()=>{
   for(const bad of [Array(24).fill(3),Array(25).fill(6),Array(25).fill('3'),Array(25).fill(null)])await assert.rejects(()=>submit(vpId,vpirs,bad));
   const answers=Array(25).fill(5);await submit(vpId,vpirs,answers);
   const form=(await db.query('select public.nptc_survey_form($1) value',[vpId])).rows[0].value;
   assert.ok(!('negativeItems' in form.assignment.definition));assert.ok(!('scores' in form.assignment));
   await db.exec('reset role');
   const response=(await db.query('select answers,scores from nptc_private.survey_responses where assignment_id=$1',[vpId])).rows[0];
   assert.deepEqual(response.answers,answers);assert.deepEqual(response.scores,scoring.scoreSurvey(vpirs,answers));
   assert.deepEqual(response.scores,{status:'pending',itemScores:[],total:null,dimensions:{}});
   await asUser(user);
  });
  await t.test('satisfaction validates scale and yes/no, preserves optional free text and exports no fabricated totals',async()=>{
   const answers=[...Array(11).fill(5),null,'是','=SUM(1,2)',null];
   const wrong=[...answers];wrong[12]='其他';await assert.rejects(()=>submit(satId,satisfaction,wrong));
   const missing=[...answers];missing[0]=null;await assert.rejects(()=>submit(satId,satisfaction,missing));
   const long=[...answers];long[11]='字'.repeat(2001);await assert.rejects(()=>submit(satId,satisfaction,long));
   await submit(satId,satisfaction,answers);await db.exec('reset role');
   const r=(await db.query('select answers,scores from nptc_private.survey_responses where assignment_id=$1',[satId])).rows[0];
   assert.deepEqual(r.answers,answers);assert.deepEqual(r.scores,scoring.scoreSurvey(satisfaction,answers));
   assert.equal(r.scores.status,'unscored');assert.equal(r.scores.total,null);assert.deepEqual(r.scores.itemScores,[]);
   const csv=surveys.surveyResponsesCsv({workshop:{id:workshop,name:'測試'},participants:[student],responses:[{...r,assignment_id:satId,student_id:student,scale_code:satisfaction.code,scale_version:satisfaction.version,submitted_at:new Date().toISOString()}]});
   assert.ok(csv.includes("'=SUM(1,2)"));assert.ok(csv.includes('不計分（原始回覆）'));
  });
  await t.test('private validators remain inaccessible and DTI scoring stays unchanged',async()=>{
   await asUser();await assert.rejects(()=>db.query('select nptc_private.survey_validate_answers($1::jsonb,$2::jsonb)',[JSON.stringify(vpirs),JSON.stringify(Array(25).fill(3))]));
   await db.exec('reset role');const scores=(await db.query('select nptc_private.survey_score($1::jsonb,$2::jsonb) value',[JSON.stringify(dti),JSON.stringify(Array(14).fill(6))])).rows[0].value;
   assert.deepEqual(scores,scoring.scoreSurvey(dti,Array(14).fill(6)));
   await db.exec('set role anon');await assert.rejects(()=>db.query('select public.nptc_survey_library()'));
  });
 } finally {await db.close();}
});
