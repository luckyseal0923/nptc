import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create schema auth;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,encrypted_password text);
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object(
 'email',current_setting('test.email',true),
 'session_id',nullif(current_setting('test.session_id',true),''),
 'amr',case when nullif(current_setting('test.amr_timestamp',true),'') is null then '[]'::jsonb
  else jsonb_build_array(jsonb_build_object('method','password','timestamp',current_setting('test.amr_timestamp',true)::double precision)) end)$$;
grant usage on schema auth to authenticated,anon;`);
for (const file of ['setup','upgrade-workshop-management','upgrade-score-feedback','upgrade-student-phone','upgrade-student-profile','upgrade-dynamic-osce-stations','upgrade-backend-accounts','upgrade-student-activation','upgrade-roster-account-status','upgrade-domain-scores','upgrade-admin-roles']) {
  await db.exec(readFileSync(`supabase/${file}.sql`, 'utf8'));
}
const root='00000000-0000-0000-0000-000000000001', admin='00000000-0000-0000-0000-000000000002';
const workshop='10000000-0000-0000-0000-000000000001';
await db.exec(`insert into auth.users values('${root}','chin.wei.chang0923@gmail.com',now(),'hash'),('${admin}','admin@example.test',now(),'hash');
insert into nptc_private.workshops(id,name) values('${workshop}','測試梯次');
insert into nptc_private.students(id,workshop_id,name,email,phone,updated_by) values('20000000-0000-0000-0000-000000000001','${workshop}','測試學員','student@example.test','0912345678','${root}');
insert into nptc_private.station_grades(student_id,station_key,score,rating) values('20000000-0000-0000-0000-000000000001','q1',80,3);`);
async function asUser(id,email) { await db.exec('reset role'); await db.query("select set_config('test.uid',$1,false),set_config('test.email',$2,false)",[id,email]); await db.exec('set role authenticated'); }
async function call(name,body) { return (await db.query(`select public.${name}(${body===undefined?'':'$1::jsonb'}) result`,body===undefined?[]:[JSON.stringify(body)])).rows[0].result; }
await asUser(admin,'admin@example.test');
await call('nptc_apply_backend_account',{name:'一般管理員',reason:'評分'});
await assert.rejects(()=>call('nptc_set_backend_role',{email:'admin@example.test',systemAdmin:true}));
await assert.rejects(()=>call('nptc_set_workshop_archived',{workshopId:workshop,archived:true}));
await asUser(root,'chin.wei.chang0923@gmail.com');
await call('nptc_set_backend_account',{email:'admin@example.test',enabled:true});
await call('nptc_update_backend_account',{email:'admin@example.test',name:'更新姓名',reason:'名冊與評分'});
assert.equal((await call('nptc_backend_accounts')).find(a=>a.email==='admin@example.test').name,'更新姓名');
await asUser(admin,'admin@example.test');
assert.equal(await call('nptc_is_teacher'),true);
await call('nptc_teacher_write',{action:'createWorkshop',name:'一般管理員建立'});
await assert.rejects(()=>call('nptc_update_backend_account',{email:'admin@example.test',name:'不可修改',reason:'測試'}));
await assert.rejects(()=>call('nptc_set_workshop_archived',{workshopId:workshop,archived:true}));
await asUser(root,'chin.wei.chang0923@gmail.com');
await call('nptc_set_backend_role',{email:'admin@example.test',systemAdmin:true});
await asUser(admin,'admin@example.test');
assert.equal(await call('nptc_is_account_reviewer'),true);
await call('nptc_set_workshop_archived',{workshopId:workshop,archived:true});
assert.equal((await call('nptc_archived_workshops')).length,1);
assert.equal((await call('nptc_teacher_data')).workshops.some(w=>w.id===workshop),false);
await db.exec('reset role');
assert.equal((await db.query('select count(*)::int count from nptc_private.station_grades')).rows[0].count,1);
await asUser(admin,'admin@example.test');
await assert.rejects(()=>call('nptc_teacher_write',{action:'publish',workshopId:workshop,published:false}));
await call('nptc_set_workshop_archived',{workshopId:workshop,archived:false});
assert.equal((await call('nptc_teacher_data')).workshops.some(w=>w.id===workshop),true);
await asUser(root,'chin.wei.chang0923@gmail.com');
await call('nptc_set_backend_role',{email:'admin@example.test',systemAdmin:false});
await assert.rejects(()=>call('nptc_set_backend_role',{email:'chin.wei.chang0923@gmail.com',systemAdmin:false}));
await asUser(admin,'admin@example.test');
assert.equal(await call('nptc_is_account_reviewer'),false);
await assert.rejects(()=>call('nptc_archived_workshops'));
await db.exec('reset role');
await db.exec(readFileSync('supabase/upgrade-admin-roles.sql','utf8'));
await db.exec(readFileSync('supabase/upgrade-workshop-sensitive-actions.sql','utf8'));
await asUser(root,'chin.wei.chang0923@gmail.com');
await assert.rejects(()=>call('nptc_set_workshop_archived',{workshopId:workshop,archived:true}),/重新輸入/);
async function freshSession(id) {
 await db.exec('reset role');
 await db.query("select set_config('test.session_id',$1,false),set_config('test.amr_timestamp',extract(epoch from now())::text,false)",[id]);
 await db.exec('set role authenticated');
}
await freshSession('fresh-archive');
await assert.rejects(()=>call('nptc_delete_archived_workshop',{workshopId:workshop,name:'測試梯次'}),/只能刪除已封存/);
await call('nptc_set_workshop_archived',{workshopId:workshop,archived:true});
await assert.rejects(()=>call('nptc_delete_archived_workshop',{workshopId:workshop,name:'測試梯次'}),/已使用/);
await freshSession('fresh-delete');
await assert.rejects(()=>call('nptc_delete_archived_workshop',{workshopId:workshop,name:'名稱錯誤'}),/名稱不符/);
await call('nptc_delete_archived_workshop',{workshopId:workshop,name:'測試梯次'});
await db.exec('reset role');
assert.equal((await db.query('select count(*)::int n from nptc_private.workshops where id=$1',[workshop])).rows[0].n,0);
assert.equal((await db.query('select count(*)::int n from nptc_private.station_grades')).rows[0].n,0);
await db.close();
console.log('PASS: admin roles, archive and restore, fresh password requirement, one-use sessions, archived-only deletion and cascade');
