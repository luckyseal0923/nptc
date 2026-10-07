// Historical diagnostic only: reproduces commit 572f3b9 before the fixes. Never runs current production SQL.
import { PGlite } from '@electric-sql/pglite';
import { execFileSync } from 'node:child_process';
const historicalPhoneRepair="-- 修正舊版名冊 RPC，保留目前部署的其他操作及權限檢查。\n-- 修改前：national_id / 身分證字號；修改後：phone / 手機電話。\nbegin;\ndo $repair$\ndeclare definition text;\nbegin\n  select pg_get_functiondef('public.nptc_teacher_write(jsonb)'::regprocedure) into definition;\n  if position('national_id' in definition) > 0 then\n    if position('public.nptc_is_teacher()' in definition) = 0\n       or position('revision' in definition) = 0 then\n      raise exception '函式結構與預期不同，停止修補。';\n    end if;\n    definition := replace(replace(definition, 'national_id', 'phone'), '身分證字號', '手機電話');\n    execute definition;\n  elsif position('phone' in definition) = 0 then\n    raise exception '找不到預期的學員欄位，停止修補。';\n  end if;\nend;\n$repair$;\nnotify pgrst, 'reload schema';\ncommit;\n";
function readBaseline(path){return path==='supabase/repair-student-phone-write.sql' ? historicalPhoneRepair : execFileSync('git',['show',`572f3b9:${path}`],{encoding:'utf8'});}
import assert from 'node:assert/strict';

const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,encrypted_password text);
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('email',current_setting('test.email',true),
 'session_id',nullif(current_setting('test.session_id',true),''),
 'amr',case when nullif(current_setting('test.amr_timestamp',true),'') is null then '[]'::jsonb
 else jsonb_build_array(jsonb_build_object('method','password','timestamp',current_setting('test.amr_timestamp',true)::double precision)) end)$$;
grant usage on schema auth to authenticated,anon;`);
const chain=['setup','upgrade-workshop-management','upgrade-score-feedback','upgrade-student-phone',
 'upgrade-student-profile','upgrade-dynamic-osce-stations','upgrade-backend-accounts','upgrade-student-activation',
 'upgrade-roster-account-status','upgrade-domain-scores','upgrade-student-invitation',
 'upgrade-student-roster-activation','upgrade-admin-roles','upgrade-workshop-sensitive-actions'];
for(const file of chain) await db.exec(readBaseline(`supabase/${file}.sql`));
const root='00000000-0000-0000-0000-000000000001',student='00000000-0000-0000-0000-000000000002';
const w1='10000000-0000-0000-0000-000000000001',w2='10000000-0000-0000-0000-000000000002';
const s1='20000000-0000-0000-0000-000000000001',s2='20000000-0000-0000-0000-000000000002',s3='20000000-0000-0000-0000-000000000003';
await db.exec(`insert into auth.users values('${root}','chin.wei.chang0923@gmail.com',now(),'hash'),('${student}','student@example.test',now(),'hash');
insert into nptc_private.workshops(id,name) values('${w1}','Review active'),('${w2}','Review history');
insert into nptc_private.students(id,workshop_id,name,email,phone,updated_by) values
('${s1}','${w1}','Review student','student@example.test','0912345678','${root}'),
('${s2}','${w1}','Borderline student','border@example.test','0912345679','${root}'),
('${s3}','${w2}','Review student','student@example.test','0912345678','${root}');
insert into nptc_private.student_accounts(user_id,email) values('${student}','student@example.test');`);
async function asUser(id,email){await db.exec('reset role');await db.query("select set_config('test.uid',$1,false),set_config('test.email',$2,false)",[id,email]);await db.exec('set role authenticated');}
async function call(fn,body){return (await db.query(`select public.${fn}(${body===undefined?'':'$1::jsonb'}) result`,body===undefined?[]:[JSON.stringify(body)])).rows[0].result;}
async function data(id=w1){return (await db.query('select public.nptc_teacher_data($1::uuid) result',[id])).rows[0].result;}
const max={currentHistory:20,pastHistory:20,ros:20,physicalExam:20,differentialDiagnosis:20};
const station={key:'q1',title:'Review station',testDate:'2026-10-07',complaint:'Review complaint',diagnosis:'Review diagnosis',prompt:'Review prompt',domainMax:max};
const stations=['q1','q2','q3','q4'].map(key=>({...station,key}));
await asUser(root,'chin.wei.chang0923@gmail.com');
await call('nptc_teacher_save_stations_v3',{workshopId:w1,stations});
await call('nptc_teacher_save_stations_v3',{workshopId:w2,stations});
await call('nptc_teacher_batch_scores_v3',{workshopId:w1,station:'q1',items:[
 {id:s1,revision:0,domains:{...max,currentHistory:0},rating:4,feedback:'Review'},
 {id:s2,revision:0,domains:{currentHistory:10,pastHistory:10,ros:10,physicalExam:10,differentialDiagnosis:10},rating:3,feedback:'Review'}]});
await call('nptc_teacher_publish_station',{workshopId:w1,station:'q1',published:true});
let current=await data();
assert.deepEqual(current.selected.publishedStations,['q1']);
assert.equal(current.selected.published,0);
console.log('R01 publication mismatch: published=0 while publishedStations=[q1]');

const changed=stations.map(s=>s.key==='q1'?{...s,title:'Changed after publication',domainMax:{...max,currentHistory:5,pastHistory:35}}:s);
await assert.rejects(()=>call('nptc_teacher_save_stations_v3',{workshopId:w1,stations:changed}));
await call('nptc_teacher_write',{action:'saveStations',workshopId:w1,stations:changed});
current=await data();
assert.equal(current.selected.stations[0].title,'Changed after publication');
assert.equal(current.selected.stations[0].domainMax.currentHistory,5);
console.log('R02 legacy teacher_write/saveStations bypassed published station and maximum locks');

const thresholdBefore=current.thresholds.find(t=>t.key==='q1').value;
await call('nptc_teacher_write',{action:'deleteStudent',workshopId:w1,id:s2,revision:1});
current=await data();
assert.equal(thresholdBefore,50);assert.equal(current.thresholds.find(t=>t.key==='q1').value,null);
assert.deepEqual(current.selected.publishedStations,['q1']);
console.log('R03 deleting a published-station student changed threshold 50 -> null without withdrawal');

const sharedDraft=current.selected.stations;
await call('nptc_teacher_save_stations_v3',{workshopId:w1,stations:sharedDraft.map(s=>s.key==='q2'?{...s,title:'First editor change'}:s)});
await call('nptc_teacher_save_stations_v3',{workshopId:w1,stations:sharedDraft.map(s=>s.key==='q3'?{...s,title:'Second editor change'}:s)});
current=await data();
assert.equal(current.selected.stations.find(s=>s.key==='q2').title,'Review station');
console.log('R09 stale station draft silently overwrote another editor change despite row locking');

await asUser(student,'student@example.test');
const profile={nursingYears:5,hospital:'Not in official directory',unit:'Review unit',examSpecialty:'內科',firstOsce:true,birthDate:'1990-01-01'};
await call('nptc_student_update_profile',profile);
await db.exec('reset role');
assert.equal((await db.query('select hospital from nptc_private.students where id=$1',[s1])).rows[0].hospital,profile.hospital);
console.log('R04 profile RPC accepted a hospital not in the official directory');

await asUser(root,'chin.wei.chang0923@gmail.com');
await db.query("select set_config('test.session_id','review-archive',false),set_config('test.amr_timestamp',extract(epoch from now())::text,false)");
await call('nptc_set_workshop_archived',{workshopId:w2,archived:true});
await asUser(student,'student@example.test');
await assert.rejects(()=>call('nptc_student_update_profile',{...profile,hospital:'Review updated'}),/封存梯次不可修改/);
console.log('R05 profile/first activation blocked when the same email has any archived workshop');

await call('nptc_finish_student_activation');
assert.equal((await call('nptc_student_data')).records.length,2);
await asUser(root,'chin.wei.chang0923@gmail.com');
assert.equal((await data()).workshops.length,1);
console.log('R11 student retains archived history but the analytics source excludes it');
const rosterBeforeRename=(await data()).students.find(s=>s.id===s1);
await call('nptc_teacher_write',{action:'saveStudent',workshopId:w1,id:s1,revision:rosterBeforeRename.revision,
 name:rosterBeforeRename.name,email:'student-new@example.test',phone:rosterBeforeRename.phone});
await asUser(student,'student@example.test');
const recordsAfterRename=(await call('nptc_student_data')).records;
assert.equal(recordsAfterRename.some(r=>r.id===s1),false);
await db.exec('reset role');
assert.equal((await db.query('select email from auth.users where id=$1',[student])).rows[0].email,'student@example.test');
console.log('R12 roster email edit removed access to that workshop without changing the login account');

await db.exec('reset role');
await assert.rejects(()=>db.exec(readBaseline('supabase/repair-student-phone-write.sql')),/找不到預期的學員欄位/);
await db.exec('rollback');
console.log('R06 current repair-student-phone-write is incompatible with the v3 wrapper');

await db.query("select set_config('test.session_id','',false),set_config('test.amr_timestamp','',false)");
await asUser(root,'chin.wei.chang0923@gmail.com');
await assert.rejects(()=>call('nptc_set_workshop_archived',{workshopId:w1,archived:true}),/重新輸入/);
await db.exec('reset role');
await db.exec(readBaseline('supabase/upgrade-admin-roles.sql'));
await asUser(root,'chin.wei.chang0923@gmail.com');
await call('nptc_set_workshop_archived',{workshopId:w1,archived:true});
console.log('R07 rerunning admin-roles after sensitive-actions removed the fresh-password archive guard');

await db.exec('reset role');
await db.exec(readBaseline('supabase/upgrade-domain-scores.sql'));
await asUser(root,'chin.wei.chang0923@gmail.com');
assert.equal((await data()).workshops.length,2);
console.log('R08 rerunning domain-scores after admin-roles returned archived workshops to normal lists');
await db.exec('reset role');
await db.exec('drop function public.nptc_issue_student_invitation(uuid); drop function public.nptc_consume_student_invitation(jsonb);');
await assert.rejects(()=>db.exec(readBaseline('supabase/upgrade-student-roster-activation.sql')),/does not exist/);
await db.exec('rollback');
console.log('R10 roster-activation migration failed when obsolete invitation functions were absent');
await db.close();
