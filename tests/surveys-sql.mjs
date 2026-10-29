import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const definition=JSON.parse(readFileSync('lib/dti-sk.json','utf8'));
const upgrade=readFileSync('supabase/upgrade-surveys.sql','utf8');

await test('survey database permissions, lifecycle, scoring and preserved records',async t=>{
 const db=new PGlite();
 const root='00000000-0000-0000-0000-000000000001',student='00000000-0000-0000-0000-000000000002',other='00000000-0000-0000-0000-000000000003',admin='00000000-0000-0000-0000-000000000004';
 const w='10000000-0000-0000-0000-000000000001',w2='10000000-0000-0000-0000-000000000002',sid='20000000-0000-0000-0000-000000000001',sid2='20000000-0000-0000-0000-000000000002';
 let pair,pre,post;
 const owner=()=>db.exec('reset role');
 async function asUser(id=root,email='chin.wei.chang0923@gmail.com') {await owner();await db.query("select set_config('test.uid',$1,false),set_config('test.email',$2,false)",[id,email]);await db.exec('set role authenticated');}
 async function call(name,body) {return (await db.query(`select public.nptc_survey_${name}($1::jsonb) result`,[JSON.stringify(body)])).rows[0].result;}
 async function read(name,id=w) {return (await db.query(`select public.nptc_survey_${name}($1::uuid) result`,[id])).rows[0].result;}
 async function update(a,extra={}) {await call('update',{id:a.id,revision:a.revision,status:'open',opensAt:null,closesAt:null,...extra});a.revision++;}
 const request=(a,answers=Array(14).fill(6))=>({assignmentId:a.id,version:definition.version,requestId:crypto.randomUUID(),answers});
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
   create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,encrypted_password text);
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('email',current_setting('test.email',true))$$;
   grant usage on schema auth to authenticated,anon;`);
  await db.exec(readFileSync('supabase/install.sql','utf8'));await db.exec(upgrade);
  await db.query('insert into auth.users values($1,$2,now(),$3),($4,$5,now(),$3),($6,$7,now(),$3),($8,$9,now(),$3)',[root,'chin.wei.chang0923@gmail.com','hash',student,'student@example.test',other,'other@example.test',admin,'admin@example.test']);
  await db.query('insert into nptc_private.workshops(id,name) values($1,$2),($3,$4)',[w,'測試班',w2,'其他梯次']);
  await db.query('insert into nptc_private.students(id,workshop_id,name,email,phone,updated_by) values($1,$2,$3,$4,$5,$6),($7,$2,$8,$9,$10,$6)',[sid,w,'學員甲','student@example.test','0912345678',root,sid2,'學員乙','other@example.test','0912345679']);
  await db.query('insert into nptc_private.student_accounts(user_id,email,activated_at) values($1,$2,now()),($3,$4,now())',[student,'student@example.test',other,'other@example.test']);
  await asUser(admin,'admin@example.test');await db.query("select public.nptc_apply_backend_account($1::jsonb)",[JSON.stringify({name:'一般管理員',reason:'測試'})]);await asUser();await db.query("select public.nptc_set_backend_account($1::jsonb)",[JSON.stringify({email:'admin@example.test',enabled:true})]);
  await t.test('pair creation is idempotent and drafts are hidden',async()=>{
   await call('create_pair',{workshopId:w});await call('create_pair',{workshopId:w});pair=(await read('teacher_data')).assignments;assert.equal(pair.length,2);pre=pair.find(a=>a.phase==='pre');post=pair.find(a=>a.phase==='post');
   await asUser(student,'student@example.test');assert.deepEqual((await read('student_data',sid)).assignments,[]);await assert.rejects(()=>call('create_pair',{workshopId:w}),/權限/);await assert.rejects(()=>read('student_data',sid2),/本人/);await asUser();
  });
  await t.test('publication validates revisions, schedule and locked definition',async()=>{
   await update(pre);await update(post);
   await assert.rejects(()=>call('update',{id:pre.id,revision:0,status:'open'}),/重新讀取/);
   await assert.rejects(()=>update(pre,{opensAt:'2026-10-30T00:00:00Z',closesAt:'2026-10-29T00:00:00Z'}));
   await owner();await assert.rejects(()=>db.query("update nptc_private.survey_assignments set definition='{}' where id=$1",[pre.id]),/不可變更/);await asUser();
  });
  await t.test('activation, identity, answer types, version and pretest are enforced',async()=>{
   await asUser(student,'student@example.test');await assert.rejects(()=>call('submit',request(post)),/前測/);
   const visible=(await read('student_data',sid)).assignments;assert.equal(visible.find(a=>a.phase==='post').availability,'waiting_pre');assert.ok(!JSON.stringify(visible).includes('reverseItems'));assert.ok(!JSON.stringify(visible).includes('scores'));
   for(const answers of [null,{},[],Array(13).fill(1),Array(15).fill(1),[...Array(13).fill(1),true],[...Array(13).fill(1),'1'],[...Array(13).fill(1),0],[...Array(13).fill(1),7],[...Array(13).fill(1),2.5]])await assert.rejects(()=>call('submit',request(pre,answers)));
   await assert.rejects(()=>call('submit',{...request(pre),version:'wrong'}),/版本/);
   await owner();await db.query('update nptc_private.student_accounts set activated_at=null where user_id=$1',[student]);await asUser(student,'student@example.test');await assert.rejects(()=>call('submit',request(pre)),/啟用/);await owner();await db.query('update nptc_private.student_accounts set activated_at=now() where user_id=$1',[student]);await asUser(student,'student@example.test');
  });
  let first,receipt;
  await t.test('server calculates scores and retries cannot overwrite or duplicate',async()=>{
   first={...request(pre),scores:{total:9999},studentId:sid2};receipt=await call('submit',first);assert.deepEqual(await call('submit',first),receipt);
   await assert.rejects(()=>call('submit',{...first,requestId:crypto.randomUUID()}),/不可覆寫/);await assert.rejects(()=>call('submit',{...first,answers:Array(14).fill(1)}),/不可覆寫/);
   await asUser();let result=await read('export');assert.equal(result.responses.length,1);assert.equal(result.responses[0].student_id,sid);assert.equal(result.responses[0].scores.total,49);assert.equal(result.responses[0].scores.flexibility,27);assert.equal(result.responses[0].scores.structure,22);assert.ok(!JSON.stringify(result).includes('student@example.test'));
   await owner();await assert.rejects(()=>db.exec("update nptc_private.survey_responses set scores='{}'"),/不可修改/);
   const d=(await db.query('select definition from nptc_private.survey_instruments')).rows[0].definition;assert.deepEqual(d,definition);await asUser();
  });
  await t.test('posttest pairs to enrollment and submitted data stays hidden from learners',async()=>{
   await asUser(student,'student@example.test');await call('submit',request(post,[6,6,6,6,1,1,6,1,1,6,6,1,1,1]));
   const own=await read('student_data',sid);assert.ok(own.assignments.every(a=>a.availability==='submitted'));assert.ok(!JSON.stringify(own).includes('scores'));assert.ok(!JSON.stringify(own).includes('answers'));
   await asUser(other,'other@example.test');assert.ok((await read('student_data',sid2)).assignments.every(a=>!a.submitted_at));await assert.rejects(()=>read('student_data',sid));
   await asUser();assert.equal((await read('export')).responses.find(r=>r.phase==='post').scores.total,84);
  });
  await t.test('close, expiry, future opening and network replay are checked on server',async()=>{
   await update(pre,{status:'closed'});await asUser(student,'student@example.test');assert.deepEqual(await call('submit',first),receipt);
   await asUser(other,'other@example.test');await assert.rejects(()=>call('submit',request(pre)),/關閉/);await asUser();
   await update(pre,{closesAt:'2000-01-01T00:00:00Z'});await asUser(other,'other@example.test');assert.equal((await read('student_data',sid2)).assignments.find(a=>a.id===pre.id).availability,'expired');await assert.rejects(()=>call('submit',request(pre)),/截止/);await asUser();
   await update(pre,{opensAt:'2100-01-01T00:00:00Z'});await asUser(other,'other@example.test');await assert.rejects(()=>call('submit',request(pre)),/開放時間/);await asUser();await update(pre);
  });
  await t.test('RLS, direct table/function access, anonymous reads and exports are denied',async()=>{
   await asUser(student,'student@example.test');for(const fn of ['teacher_data','export'])await assert.rejects(()=>read(fn),/權限/);
   await assert.rejects(()=>db.exec('select * from nptc_private.survey_responses'));await assert.rejects(()=>db.exec("select nptc_private.survey_score('{}','[]')"));
   await owner();await db.exec('set role anon');for(const fn of ['teacher_data','export','student_data'])await assert.rejects(()=>read(fn));await assert.rejects(()=>call('submit',request(pre)));await asUser();
  });
  await t.test('populated upgrade is repeatable and roster deletion preserves responses',async()=>{
   const before=await read('export');await owner();await db.exec(upgrade);await asUser();assert.deepEqual(await read('export'),before);
   await assert.rejects(()=>db.query('select public.nptc_teacher_write($1::jsonb)',[JSON.stringify({action:'deleteStudent',workshopId:w,id:sid,revision:0})]),/量表作答紀錄/);
  });
  await t.test('archive isolates ordinary admins and permanent-delete flow can cascade',async()=>{
   await owner();await db.query('update nptc_private.workshops set archived_at=now() where id=$1',[w]);await asUser(admin,'admin@example.test');await assert.rejects(()=>read('export'),/存取/);await asUser();assert.equal((await read('export')).responses.length,2);await assert.rejects(()=>update(pre),/封存/);
   await asUser(other,'other@example.test');await assert.rejects(()=>call('submit',request(pre)),/封存/);
   await owner();await db.exec('begin');await db.exec("select set_config('nptc.delete_archived_workshop','on',true)");await db.query('delete from nptc_private.students where workshop_id=$1',[w]);await db.query('delete from nptc_private.workshops where id=$1',[w]);await db.exec('commit');assert.equal((await db.query('select count(*)::int n from nptc_private.survey_responses')).rows[0].n,0);
  });
 } finally {await db.close();}
});
