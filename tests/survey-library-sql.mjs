// Library migration regression coverage; runs through pnpm test.
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

await test('library, private remarks, independent assignments and linked learner form',async t=>{
 const db=new PGlite();
 const admin='00000000-0000-0000-0000-000000000001',learner='00000000-0000-0000-0000-000000000002',outsider='00000000-0000-0000-0000-000000000003';
 const workshop='10000000-0000-0000-0000-000000000001',sid='20000000-0000-0000-0000-000000000001';
 const sql=readFileSync('supabase/upgrade-survey-library.sql','utf8');
 const d={code:'custom-example',version:'v1',title:'僅供開發測試的問卷',notice:'此為測試內容。',instructions:['請選擇答案。'],minScore:1,maxScore:5,items:[{text:'題目甲'},{text:'題目乙'}],reverseItems:[2],dimensions:{'構面甲':[1,2]}};
 const owner=()=>db.exec('reset role');
 async function asUser(uid=admin,email='chin.wei.chang0923@gmail.com'){await owner();await db.query("select set_config('test.uid',$1,false),set_config('test.email',$2,false)",[uid,email]);await db.exec('set role authenticated');}
 async function call(name,body){return (await db.query(`select public.nptc_survey_${name}(${body===undefined?'':'$1::jsonb'}) result`,body===undefined?[]:[JSON.stringify(body)])).rows[0].result;}
 async function read(name,id){return (await db.query(`select public.nptc_survey_${name}($1::uuid) result`,[id])).rows[0].result;}
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,encrypted_password text);
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('email',current_setting('test.email',true))$$;grant usage on schema auth to authenticated,anon;`);
  await db.exec(readFileSync('supabase/install.sql','utf8'));await db.exec(readFileSync('supabase/upgrade-surveys.sql','utf8'));
  await db.query('insert into auth.users values($1,$2,now(),$3),($4,$5,now(),$3),($6,$7,now(),$3)',[admin,'chin.wei.chang0923@gmail.com','hash',learner,'student@example.test',outsider,'outsider@example.test']);
  await db.query('insert into nptc_private.workshops(id,name) values($1,$2)',[workshop,'測試梯次']);
  await db.query('insert into nptc_private.students(id,workshop_id,name,email,phone,updated_by) values($1,$2,$3,$4,$5,$6)',[sid,workshop,'測試學員','student@example.test','0912345678',admin]);
  await db.query('insert into nptc_private.student_accounts(user_id,email,activated_at) values($1,$2,now()),($3,$4,now())',[learner,'student@example.test',outsider,'outsider@example.test']);
  await asUser();await call('create_pair',{workshopId:workshop});await owner();await db.exec(sql);await asUser();
  await t.test('legacy labels become private notes and no fixed type remains',async()=>{
   const a=(await read('teacher_data',workshop)).assignments;assert.equal(a.length,2);assert.ok(a.every(r=>!('phase' in r)));assert.deepEqual(a.map(r=>r.note).sort(),['前測','後測'].sort());await assert.rejects(()=>call('create_pair',{workshopId:workshop}),/量表庫/);
  });
  await t.test('library reads prepared scales and provides no public creation endpoint',async()=>{
   await owner();await db.query('insert into nptc_private.survey_instruments(code,version,definition) values($1,$2,$3::jsonb)',[d.code,d.version,JSON.stringify(d)]);await asUser();assert.equal((await call('library')).instruments.length,2);
   await assert.rejects(()=>call('library_save',{definition:d}));
   await assert.rejects(()=>db.query('insert into nptc_private.survey_instruments(code,version,definition) values($1,$2,$3::jsonb)',[d.code,'v2',JSON.stringify(d)]));
  });
  let first,second;
  await t.test('same instrument may be assigned repeatedly with idempotent add requests',async()=>{
   const body={workshopId:workshop,scaleCode:d.code,scaleVersion:d.version,requestId:crypto.randomUUID(),status:'open',note:'只給教師看的註記'};
   first=await call('assign',body);assert.deepEqual(await call('assign',body),first);second=await call('assign',{...body,requestId:crypto.randomUUID()});assert.notEqual(first.id,second.id);
  });
  await t.test('link authentication, private notes and no completion scores',async()=>{
   await asUser(learner,'student@example.test');const form=await read('form',second.id);assert.equal(form.assignment.definition.title,d.title);
   const summary=await read('student_data',sid);
   for(const source of [form,summary])for(const field of ['"note"','只給教師看的註記','"scores"','reverseItems','"phase"'])assert.ok(!JSON.stringify(source).includes(field));
   await assert.rejects(()=>call('library'),/權限/);
   await asUser(outsider,'outsider@example.test');await assert.rejects(()=>read('form',second.id),/工作坊/);await asUser(learner,'student@example.test');
  });
  await t.test('any assignment can be completed first; points follow its own scale',async()=>{
   const body={assignmentId:second.id,requestId:crypto.randomUUID(),version:'v1',answers:[5,1]};const receipt=await call('submit',body);assert.deepEqual(await call('submit',body),receipt);
   const summary=await read('student_data',sid);assert.equal(summary.assignments.find(a=>a.id===second.id).availability,'submitted');assert.equal(summary.assignments.find(a=>a.id===first.id).availability,'open');
   await asUser();const exported=await read('export',workshop);assert.equal(exported.responses[0].scores.total,10);assert.equal(exported.responses[0].scores.dimensions['構面甲'],10);assert.equal(exported.responses[0].note,'只給教師看的註記');
  });
  await t.test('repeat upgrade preserves records and anonymous callers are denied',async()=>{
   const before=await read('export',workshop);await owner();await db.exec(sql);await asUser();assert.deepEqual(await read('export',workshop),before);
   await owner();await db.exec('set role anon');await assert.rejects(()=>call('library'));await assert.rejects(()=>read('form',second.id));
  });
 } finally {await db.close();}
});
