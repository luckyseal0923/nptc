import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
test('review upgrade preserves answers, scopes lazy analysis and audits complete workshop deletion',async t=>{
 const db=new PGlite();
 const root='00000000-0000-0000-0000-000000000001',student='00000000-0000-0000-0000-000000000002',admin='00000000-0000-0000-0000-000000000003';
 const w1='10000000-0000-0000-0000-000000000001',w2='10000000-0000-0000-0000-000000000002',s1='20000000-0000-0000-0000-000000000001',s2='20000000-0000-0000-0000-000000000002';
 const emails={[root]:'chin.wei.chang0923@gmail.com',[student]:'student@example.test',[admin]:'admin@example.test'};
 const owner=()=>db.exec('reset role');
 async function asUser(uid=root,age=null){await owner();await db.query("select set_config('test.uid',$1,false),set_config('test.email',$2,false),set_config('test.session',$3,false),set_config('test.password_at',$4,false)",[uid,emails[uid],crypto.randomUUID(),age===null?'':String(Date.now()/1000-age)]);await db.exec('set role authenticated');}
 const call=async(name,body)=>(await db.query(`select public.${name}($1::jsonb) result`,[JSON.stringify(body)])).rows[0].result;
 const read=async(name,id)=>(await db.query(`select public.${name}($1::uuid) result`,[id])).rows[0].result;
 const answers=[6,6,6,6,1,1,6,1,1,6,6,1,1,1];
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
   create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,encrypted_password text);
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('email',current_setting('test.email',true),'session_id',current_setting('test.session',true),'amr',case when coalesce(current_setting('test.password_at',true),'')='' then '[]'::jsonb else jsonb_build_array(jsonb_build_object('method','password','timestamp',current_setting('test.password_at',true)::double precision)) end)$$;
   grant usage on schema auth to authenticated,anon;`);
  for(const name of ['install','upgrade-surveys','upgrade-survey-library','upgrade-survey-analysis','upgrade-survey-deletion','upgrade-survey-catalog','upgrade-review-hardening'])await db.exec(readFileSync(`supabase/${name}.sql`,'utf8'));
  for(const [uid,email] of Object.entries(emails))await db.query('insert into auth.users values($1,$2,now(),$3)',[uid,email,'test-hash']);
  await db.query('insert into nptc_private.workshops(id,name) values($1,$2),($3,$4)',[w1,'目前梯次',w2,'將刪除的測試梯次']);
  for(const [sid,wid] of [[s1,w1],[s2,w2]])await db.query('insert into nptc_private.students(id,workshop_id,name,email,phone,updated_by) values($1,$2,$3,$4,$5,$6)',[sid,wid,'測試學員',emails[student],'0912345678',root]);
  await db.query('insert into nptc_private.student_accounts(user_id,email,activated_at) values($1,$2,now())',[student,emails[student]]);
  await asUser(admin);await call('nptc_apply_backend_account',{name:'測試管理員',reason:'測試'});await asUser();await call('nptc_set_backend_account',{email:emails[admin],enabled:true});
  const d=JSON.parse(readFileSync('lib/dti-sk.json','utf8'));
  const add=async wid=>(await call('nptc_survey_assign',{workshopId:wid,scaleCode:d.code,scaleVersion:d.version,requestId:crypto.randomUUID(),status:'open',note:'測試'})).id;
  const a1=await add(w1),a2=await add(w2);
  await asUser(student);for(const aid of [a1,a2])await call('nptc_survey_submit',{assignmentId:aid,version:d.version,requestId:crypto.randomUUID(),answers});
  await asUser(root,0);await call('nptc_set_workshop_archived',{workshopId:w2,archived:true});
  await t.test('summary omits answers and scoped results preserve calculated scores',async()=>{
   const summary=await read('nptc_survey_analysis_summary',w1),legacy=await read('nptc_survey_analysis',w1);
   assert.equal(summary.responses.length,1);assert.ok(!JSON.stringify(summary).includes('"answers"'));assert.deepEqual(summary.responses[0].scores,legacy.responses[0].scores);
   const detail=(await db.query('select public.nptc_survey_response_detail($1,$2) result',[a1,s1])).rows[0].result;assert.deepEqual(detail.answers,answers);
  });
  await t.test('ordinary teachers cannot read archives or workshop deletion impact',async()=>{
   await asUser(admin);await assert.rejects(()=>read('nptc_survey_analysis_summary',w2),/可存取/);await assert.rejects(()=>read('nptc_archived_workshop_delete_info',w2),/系統管理者/);
   const meta=(await db.query('select public.nptc_survey_analysis_workshops() result')).rows[0].result;assert.equal(meta.workshops.length,1);
  });
  await t.test('students and anon cannot read summaries, answer detail or audit tables',async()=>{
   await asUser(student);await assert.rejects(()=>read('nptc_survey_analysis_summary',w1),/權限/);await assert.rejects(()=>db.query('select public.nptc_survey_response_detail($1,$2)',[a1,s1]),/權限/);
   await owner();await db.exec('set role anon');await assert.rejects(()=>read('nptc_archived_workshop_delete_info',w2));await owner();await db.exec('set role authenticated');await assert.rejects(()=>db.query('select * from nptc_private.workshop_deletion_events'));
  });
  await t.test('impact includes publications and answers; stale confirmation and old password cannot delete',async()=>{
   await asUser();const impact=await read('nptc_archived_workshop_delete_info',w2);assert.equal(impact.studentCount,1);assert.equal(impact.assignmentCount,1);assert.equal(impact.responseCount,1);assert.equal(impact.surveys[0].responseCount,1);
   const body={workshopId:w2,name:'將刪除的測試梯次',fingerprint:impact.fingerprint,acknowledgeDataLoss:true};
   await assert.rejects(()=>call('nptc_delete_archived_workshop',body),/重新輸入/);
   await asUser(root,0);for(const changes of [{fingerprint:'stale'},{acknowledgeDataLoss:false},{name:'wrong'}])await assert.rejects(()=>call('nptc_delete_archived_workshop',{...body,...changes}));
   await owner();emails[student]='student-new@example.test';await db.query('update auth.users set email=$1 where id=$2',[emails[student],student]);
   await asUser(student);await db.query('select public.nptc_sync_student_email()');
   await asUser(root,0);await assert.rejects(()=>call('nptc_delete_archived_workshop',body),/資料已變更/,'same counts but changed enrollment data invalidates confirmation');
   assert.equal((await read('nptc_archived_workshop_delete_info',w2)).responseCount,1);
  });
  await t.test('migration reapply leaves existing responses unchanged',async()=>{
   await owner();const snapshot=async()=>(await db.query('select to_jsonb(r) data from nptc_private.survey_responses r order by id')).rows;
   const before=await snapshot();await db.exec(readFileSync('supabase/upgrade-review-hardening.sql','utf8'));assert.deepEqual(await snapshot(),before);
   await assert.rejects(()=>db.exec(readFileSync('supabase/upgrade-project-consistency.sql','utf8')),/不可重跑基礎升級/);await db.exec('rollback');assert.deepEqual(await snapshot(),before);
  });
  await t.test('confirmed deletion leaves audit metadata and preserves other cohort answers',async()=>{
   await asUser(root,0);const impact=await read('nptc_archived_workshop_delete_info',w2);
   await call('nptc_delete_archived_workshop',{workshopId:w2,name:'將刪除的測試梯次',fingerprint:impact.fingerprint,acknowledgeDataLoss:true});
   await owner();assert.equal((await db.query('select count(*)::int n from nptc_private.workshop_deletion_events')).rows[0].n,1);
   const audit=(await db.query('select impact from nptc_private.workshop_deletion_events')).rows[0].impact;assert.equal(audit.responseCount,1);assert.ok(!JSON.stringify(audit).includes('"answers"'));
   await asUser();assert.equal((await read('nptc_survey_analysis_summary',w1)).responses.length,1);
  });
 } finally { await db.close(); }
});
