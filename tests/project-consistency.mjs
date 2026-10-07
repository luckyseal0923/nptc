import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

await test('current installation and populated upgrade preserve permissions and records', async t => {
 const db=new PGlite();
 const root='00000000-0000-0000-0000-000000000001',admin='00000000-0000-0000-0000-000000000002',student='00000000-0000-0000-0000-000000000003';
 const current='10000000-0000-0000-0000-000000000001',archived='10000000-0000-0000-0000-000000000002';
 const sid='20000000-0000-0000-0000-000000000001',oldSid='20000000-0000-0000-0000-000000000002';
 const domainMax={currentHistory:20,pastHistory:20,ros:20,physicalExam:20,differentialDiagnosis:20};
 const stations=['q1','q2'].map(key=>({key,title:`題目 ${key}`,testDate:'2026-09-01',complaint:'主訴',diagnosis:'診斷',prompt:'摘要',domainMax}));
 const hospital=JSON.parse(readFileSync('public/data/accredited-hospitals.json','utf8')).hospitals[0].name;
 const profile={nursingYears:0,hospital,unit:'內科',examSpecialty:'內科',firstOsce:false,birthDate:'1990-01-01'};
 let session=0;
 async function owner(){await db.exec('reset role');}
 async function asUser(id=root,email='chin.wei.chang0923@gmail.com') {
  await owner();await db.query("select set_config('test.uid',$1,false),set_config('test.email',$2,false),set_config('test.session_id','',false),set_config('test.amr_timestamp','',false)",[id,email]);await db.exec('set role authenticated');
 }
 async function fresh(){await owner();await db.query("select set_config('test.session_id',$1,false),set_config('test.amr_timestamp',extract(epoch from now())::text,false)",[`session-${++session}`]);await db.exec('set role authenticated');}
 async function call(name,body){return (await db.query(`select public.${name}(${body===undefined?'':'$1::jsonb'}) result`,body===undefined?[]:[JSON.stringify(body)])).rows[0].result;}
 async function read(name='nptc_teacher_data',id=current){return (await db.query(`select public.${name}($1::uuid) result`,[id])).rows[0].result;}
 async function snapshot(){await owner();return (await db.query('select to_jsonb(g) g from nptc_private.station_grades g order by student_id,station_key')).rows;}
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
   create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,encrypted_password text);
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('email',current_setting('test.email',true),'session_id',current_setting('test.session_id',true),
    'amr',case when coalesce(current_setting('test.amr_timestamp',true),'')='' then '[]'::jsonb else jsonb_build_array(jsonb_build_object('method','password','timestamp',current_setting('test.amr_timestamp',true)::double precision)) end)$$;
   grant usage on schema auth to authenticated,anon;`);
  await t.test('fresh install works without obsolete invitations',async()=>{
   await db.exec(readFileSync('supabase/install.sql','utf8'));
   assert.equal((await db.query("select to_regprocedure('public.nptc_issue_student_invitation(uuid)') fn")).rows[0].fn,null);
  });
  await db.query('insert into auth.users values($1,$2,now(),$3),($4,$5,now(),$3),($6,$7,now(),$3)',[root,'chin.wei.chang0923@gmail.com','hash',admin,'admin@example.test',student,'student@example.test']);
  await db.query('insert into nptc_private.workshops(id,name,stations) values($1,$2,$3::jsonb),($4,$5,$3::jsonb)',[current,'目前梯次',JSON.stringify(stations),archived,'舊梯次']);
  await db.query('insert into nptc_private.students(id,workshop_id,name,email,phone,updated_by) values($1,$2,$3,$4,$5,$6),($7,$8,$3,$4,$5,$6)',[sid,current,'測試學員','student@example.test','0912345678',root,oldSid,archived]);
  await db.query("insert into nptc_private.student_accounts(user_id,email,activated_at) values($1,$2,now())",[student,'student@example.test']);
  await db.query("insert into nptc_private.station_grades(student_id,station_key,score,rating,feedback,domain_scores) values($1,'q1',50,3,'回饋',$2::jsonb),($3,'q1',50,3,'舊回饋',$2::jsonb)",[sid,JSON.stringify(Object.fromEntries(Object.keys(domainMax).map(key=>[key,10]))),oldSid]);
  await asUser(admin,'admin@example.test');await call('nptc_apply_backend_account',{name:'一般管理員',reason:'測試'});
  await asUser();await call('nptc_set_backend_account',{email:'admin@example.test',enabled:true});
  await t.test('archive requires recent password and a one-use session',async()=>{
   await assert.rejects(()=>call('nptc_set_workshop_archived',{workshopId:archived,archived:true}),/重新輸入/);
   await fresh();await call('nptc_set_workshop_archived',{workshopId:archived,archived:true});
   await assert.rejects(()=>call('nptc_set_workshop_archived',{workshopId:current,archived:true}),/已使用/);
  });
  await t.test('analysis includes archives only for system admins',async()=>{
   assert.equal((await read()).workshops.length,1);
   let a=await read('nptc_analysis_data');assert.equal(a.includesArchived,true);assert.equal(a.workshops.length,2);
   await asUser(admin,'admin@example.test');a=await read('nptc_analysis_data');assert.equal(a.includesArchived,false);assert.equal(a.workshops.length,1);
   await assert.rejects(()=>db.query('select nptc_private.teacher_data(null,true)'));
   await assert.rejects(()=>call('nptc_set_workshop_archived',{workshopId:current,archived:true}));
  });
  await t.test('publication blocks all roster writes and preserves threshold',async()=>{
   await call('nptc_teacher_publish_station',{workshopId:current,station:'q1',published:true});
   const data=await read();assert.equal(data.selected.published,0);assert.deepEqual(data.selected.publishedStations,['q1']);assert.equal(data.thresholds[0].value,50);
   for(const body of [{action:'deleteStudent',id:sid,revision:0},{action:'saveStudent',id:sid,revision:0,name:'改名',email:'student@example.test',phone:'0912345678'},{action:'bulkImportStudents',students:[{name:'新學員',email:'new@example.test',phone:'0912345679'}]}])
    await assert.rejects(()=>call('nptc_teacher_write',{workshopId:current,...body}),/所有題目公告/);
   assert.equal((await read()).thresholds[0].value,50);
  });
  await t.test('legacy station and score routes cannot bypass current protections',async()=>{
   for(const name of ['nptc_teacher_write','nptc_teacher_save_stations','nptc_teacher_save_stations_v3'])
    await assert.rejects(()=>call(name,{action:'saveStations',workshopId:current,stationsRevision:1,stations:stations.map(s=>({...s,title:'竄改'}))}),/撤回本題/);
   for(const action of ['saveScores','publish'])await assert.rejects(()=>call('nptc_teacher_write',{action,workshopId:current}),/逐題公告/);
   await assert.rejects(()=>db.query("select nptc_private.teacher_write_before_domains('{}'::jsonb)"));
   await assert.rejects(()=>call('nptc_teacher_batch_scores_v3',{workshopId:current,station:'q1',items:[{id:sid,revision:0,domains:null,rating:null,feedback:''}]}),/撤回/);
  });
  await t.test('unpublished station can change while published station remains fixed; stale revision fails',async()=>{
   const updated=stations.map(s=>s.key==='q2'?{...s,title:'更新 q2'}:s);
   await call('nptc_teacher_save_stations_v3',{workshopId:current,stationsRevision:1,stations:updated});
   await assert.rejects(()=>call('nptc_teacher_save_stations_v3',{workshopId:current,stationsRevision:1,stations:updated}),/其他人更新/);
   await assert.rejects(()=>call('nptc_teacher_save_stations_v3',{workshopId:current,stations:updated}),/最新版/);
   await call('nptc_teacher_publish_station',{workshopId:current,station:'q1',published:false});
   const changedMax={...domainMax,currentHistory:10,pastHistory:30};
   await assert.rejects(()=>call('nptc_teacher_write',{action:'saveStations',workshopId:current,stationsRevision:3,stations:updated.map(s=>s.key==='q1'?{...s,domainMax:changedMax}:s)}),/不能變更配分/);
   await assert.rejects(()=>call('nptc_teacher_save_stations_v3',{workshopId:current,stationsRevision:3,stations:updated.filter(s=>s.key!=='q1')}),/不可刪除/);
  });
  await t.test('registered roster email cannot be directly edited',async()=>{
   await assert.rejects(()=>call('nptc_teacher_write',{action:'saveStudent',workshopId:current,id:sid,revision:0,name:'測試學員',email:'changed@example.test',phone:'0912345678'}),/信箱確認/);
   await call('nptc_teacher_write',{action:'saveStudent',workshopId:current,id:sid,revision:0,name:'測試學員',email:'student@example.test',phone:'0912345678'});
   await assert.rejects(()=>call('nptc_teacher_write',{action:'deleteStudent',workshopId:current,id:sid,revision:0}),/資料已更新/);
  });
  await t.test('create retry is idempotent and does not accept a changed name',async()=>{
   const body={action:'createWorkshop',requestId:'30000000-0000-0000-0000-000000000001',name:'新梯次'};
   const a=await call('nptc_teacher_write',body),b=await call('nptc_teacher_write',body);assert.equal(a.id,b.id);
   assert.equal((await read()).workshops.filter(w=>w.name==='新梯次').length,1);
   await assert.rejects(()=>call('nptc_teacher_write',{...body,name:'另一個名稱'}),/名稱不同/);
  });
  await t.test('profile updates active enrollment while archived profile remains frozen',async()=>{
   await asUser(student,'student@example.test');
   await assert.rejects(()=>call('nptc_student_update_profile',{...profile,hospital:'自行輸入醫院'}),/官方醫院/);
   await assert.rejects(()=>call('nptc_student_update_profile',{...profile,firstOsce:'false'}),/個人資料/);
   await call('nptc_student_update_profile',profile);
   const onboarding=await call('nptc_student_onboarding_status');assert.equal(onboarding.student.hospital,hospital);assert.equal(onboarding.student.firstOsce,false);assert.equal(onboarding.student.nursingYears,0);
   await owner();assert.equal((await db.query('select hospital from nptc_private.students where id=$1',[oldSid])).rows[0].hospital,null);
  });
  await t.test('confirmed Auth email synchronizes active and archived history atomically',async()=>{
   const before=await snapshot();
   await db.query('update auth.users set email=$1 where id=$2',['changed@example.test',student]);
   await asUser(student,'student@example.test');await assert.rejects(()=>call('nptc_sync_student_email'));
   await asUser(student,'changed@example.test');await call('nptc_sync_student_email');await call('nptc_sync_student_email');
   const result=await call('nptc_student_data');assert.equal(result.records.length,2);assert.equal(result.records.filter(r=>r.archived).length,1);
   const after=await snapshot();assert.deepEqual(after,before);
   const rows=(await db.query('select id,email,hospital from nptc_private.students order by id')).rows;assert.equal(rows.length,2);assert.ok(rows.every(s=>s.email==='changed@example.test'));assert.equal(rows.find(s=>s.id===oldSid).hospital,null);
   assert.equal((await db.query('select count(*)::int n from nptc_private.student_email_changes')).rows[0].n,1);
  });
  await t.test('email collision rolls back all enrollments and audit rows',async()=>{
   await db.query('insert into nptc_private.students(workshop_id,name,email,phone,updated_by) values($1,$2,$3,$4,$5)',[current,'另一學員','collision@example.test','0912345679',root]);
   await db.query('update auth.users set email=$1 where id=$2',['collision@example.test',student]);
   await asUser(student,'collision@example.test');await assert.rejects(()=>call('nptc_sync_student_email'),/原紀錄仍保留/);
   await owner();assert.equal((await db.query('select email from nptc_private.student_accounts where user_id=$1',[student])).rows[0].email,'changed@example.test');
   assert.equal((await db.query('select email from nptc_private.students where id=$1',[oldSid])).rows[0].email,'changed@example.test');
   assert.equal((await db.query('select count(*)::int n from nptc_private.student_email_changes')).rows[0].n,1);
   await db.query('update auth.users set email=$1 where id=$2',['changed@example.test',student]);
  });
  await t.test('populated current upgrade is repeatable and preserves grades and archive guard',async()=>{
   const before=await snapshot();await db.exec(readFileSync('supabase/upgrade-project-consistency.sql','utf8'));await db.exec(readFileSync('supabase/upgrade-project-consistency.sql','utf8'));assert.deepEqual(await snapshot(),before);
   const checks=await db.exec(readFileSync('supabase/verify-project-consistency.sql','utf8'));
   for(const index of [3,4,5,6])assert.equal(Object.values(checks[index].rows[0])[0],0);
   await assert.rejects(()=>db.query('update nptc_private.students set name=$1 where id=$2',['篡改',oldSid]),/封存/);
   await asUser();assert.equal(await call('nptc_schema_version'),2026100701);assert.ok((await call('nptc_hospital_directory')).hospitals.length>100);
   await assert.rejects(()=>call('nptc_delete_archived_workshop',{workshopId:archived,name:'舊梯次'}),/重新輸入/);
  });
  await t.test('all legacy migration replays stop instead of weakening permissions',async()=>{
   await owner();
   for(const file of readdirSync('supabase').filter(f=>f==='setup.sql'||(f.startsWith('upgrade-')&&f!=='upgrade-project-consistency.sql'))){
    await assert.rejects(()=>db.exec(readFileSync(`supabase/${file}`,'utf8')),/不可重跑舊版/);await db.exec('rollback');
   }
   await db.exec(readFileSync('supabase/repair-student-phone-write.sql','utf8'));
   await asUser();assert.equal(await call('nptc_schema_version'),2026100701);
  });
  await t.test('anonymous and student accounts cannot read admin data or private tables',async()=>{
   await asUser(student,'changed@example.test');await assert.rejects(()=>read('nptc_analysis_data'));await assert.rejects(()=>call('nptc_teacher_write',{action:'createWorkshop',name:'拒絕'}));
   await assert.rejects(()=>call('nptc_verify_student_roster',{name:'測試學員',email:'changed@example.test',phone:'0912345678'}));
   await owner();await db.exec('set role anon');for(const name of ['nptc_schema_version','nptc_hospital_directory','nptc_sync_student_email','nptc_student_data'])await assert.rejects(()=>call(name));
   await assert.rejects(()=>db.query('select * from nptc_private.student_email_changes'));
  });
 } finally {await db.close();}
});

await test('upgrade an existing populated legacy environment without rewriting history',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,encrypted_password text);
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('email',current_setting('test.email',true))$$;
   grant usage on schema auth to authenticated,anon;`);
  const files=['setup','upgrade-workshop-management','upgrade-score-feedback','upgrade-student-phone','upgrade-student-profile','upgrade-dynamic-osce-stations','upgrade-backend-accounts','upgrade-student-activation','upgrade-roster-account-status','upgrade-domain-scores','upgrade-student-roster-activation','upgrade-admin-roles','upgrade-workshop-sensitive-actions'];
  for(const file of files)await db.exec(readFileSync(`supabase/${file}.sql`,'utf8'));
  await db.exec(`insert into nptc_private.workshops(id,name) values('10000000-0000-0000-0000-000000000003','歷史梯次');
   insert into nptc_private.students(id,workshop_id,name,email,phone,updated_by) values('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000003','歷史學員','old@example.test','0912345678','00000000-0000-0000-0000-000000000001');
   insert into nptc_private.station_grades(student_id,station_key,score,rating,feedback) values('20000000-0000-0000-0000-000000000003','q1',60,3,'歷史回饋');
   update nptc_private.workshops set archived_at=now();`);
  const before=(await db.query('select to_jsonb(g) g from nptc_private.station_grades g')).rows;
  await db.exec('grant execute on function public.nptc_verify_student_roster(jsonb),public.nptc_teacher_batch_scores(jsonb) to authenticated');
  await db.exec(readFileSync('supabase/upgrade-project-consistency.sql','utf8'));
  assert.deepEqual((await db.query('select to_jsonb(g) g from nptc_private.station_grades g')).rows,before);
  assert.ok((await db.query('select archived_at from nptc_private.workshops')).rows[0].archived_at);
  await assert.rejects(()=>db.exec("update nptc_private.students set name='不可更動'"),/封存/);
  await db.exec('set role authenticated');
  await assert.rejects(()=>db.exec("select public.nptc_verify_student_roster('{}'::jsonb)"),/permission denied/);
  await assert.rejects(()=>db.exec("select public.nptc_teacher_batch_scores('{}'::jsonb)"),/permission denied/);
 }finally{await db.close();}
});
