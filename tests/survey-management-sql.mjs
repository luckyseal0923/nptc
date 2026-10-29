import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

test('survey analytics and deletion enforce permissions against populated data', async t => {
  const db = new PGlite();
  const root = '00000000-0000-0000-0000-000000000001', admin = '00000000-0000-0000-0000-000000000002';
  const learner = '00000000-0000-0000-0000-000000000003', outsider = '00000000-0000-0000-0000-000000000004';
  const workshop = '10000000-0000-0000-0000-000000000001', archived = '10000000-0000-0000-0000-000000000002';
  const sid = '20000000-0000-0000-0000-000000000001', oldSid = '20000000-0000-0000-0000-000000000002';
  const emails = { [root]: 'chin.wei.chang0923@gmail.com', [admin]: 'admin@example.test', [learner]: 'student@example.test', [outsider]: 'outsider@example.test' };
  const definition = JSON.parse(readFileSync('lib/dti-sk.json', 'utf8'));
  const best = [6,6,6,6,1,1,6,1,1,6,6,1,1,1];
  const owner = () => db.exec('reset role');
  async function asUser(uid = root, passwordAge = null, session = crypto.randomUUID()) {
    await owner();
    await db.query("select set_config('test.uid',$1,false),set_config('test.email',$2,false),set_config('test.session',$3,false),set_config('test.password_at',$4,false)", [uid, emails[uid], session, passwordAge === null ? '' : String(Date.now()/1000-passwordAge)]);
    await db.exec('set role authenticated');
  }
  const call = async (name, body) => (await db.query(`select public.nptc_survey_${name}(${body === undefined ? '' : '$1::jsonb'}) result`, body === undefined ? [] : [JSON.stringify(body)])).rows[0].result;
  const read = async (name, id = workshop) => (await db.query(`select public.nptc_survey_${name}($1::uuid) result`, [id])).rows[0].result;
  const add = async (wid = workshop, note = '老師專用備註') => (await call('assign', {workshopId:wid, scaleCode:definition.code, scaleVersion:definition.version, status:'open', note, requestId:crypto.randomUUID()})).id;
  const submit = async id => call('submit', {assignmentId:id, version:definition.version, requestId:crypto.randomUUID(), answers:best, scores:{total:-999}});
  const infoBody = async id => { const info = await read('delete_info', id); return {id, revision:info.revision, expectedResponses:info.responseCount, acknowledgeDataLoss:true}; };
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
      create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,encrypted_password text);
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('email',current_setting('test.email',true),'session_id',current_setting('test.session',true),'amr',
      case when coalesce(current_setting('test.password_at',true),'')='' then '[]'::jsonb else jsonb_build_array(jsonb_build_object('method','password','timestamp',current_setting('test.password_at',true)::double precision)) end)$$;
      grant usage on schema auth to authenticated,anon;`);
    for (const file of ['install','upgrade-surveys','upgrade-survey-library','upgrade-survey-analysis','upgrade-survey-deletion']) await db.exec(readFileSync(`supabase/${file}.sql`,'utf8'));
    for (const [uid,email] of Object.entries(emails)) await db.query('insert into auth.users values($1,$2,now(),$3)', [uid,email,'test-hash']);
    await db.query('insert into nptc_private.workshops(id,name) values($1,$2),($3,$4)',[workshop,'目前梯次',archived,'歷史梯次']);
    for (const [id,wid] of [[sid,workshop],[oldSid,archived]]) await db.query('insert into nptc_private.students(id,workshop_id,name,email,phone,updated_by) values($1,$2,$3,$4,$5,$6)',[id,wid,'測試學員',emails[learner],'0912345678',root]);
    for (const uid of [learner,outsider]) await db.query('insert into nptc_private.student_accounts(user_id,email,activated_at) values($1,$2,now())',[uid,emails[uid]]);
    await asUser(admin); await db.query("select public.nptc_apply_backend_account($1::jsonb)",[JSON.stringify({name:'一般管理員',reason:'測試'})]);
    await asUser(); await db.query("select public.nptc_set_backend_account($1::jsonb)",[JSON.stringify({email:emails[admin],enabled:true})]);
    const first = await add(), second = await add(), empty = await add(), old = await add(archived);
    await asUser(learner); for (const id of [first,second,old]) await submit(id);
    await asUser(root,0); await db.query('select public.nptc_set_workshop_archived($1::jsonb)',[JSON.stringify({workshopId:archived,archived:true})]);

    await t.test('teacher analytics joins accounts across cohorts and returns original and server-scored data', async () => {
      const data = await read('analysis',null);
      assert.equal(data.includesArchived,true); assert.equal(data.responses.length,3);
      assert.ok(data.students.every(s=>s.identity===learner)); assert.ok(data.responses.every(r=>r.identity===learner));
      assert.deepEqual(data.responses[0].answers,best); assert.equal(data.responses[0].scores.total,84);
      assert.equal(data.responses[0].scores.dimensions.flexibility,42);
      const scoped=await read('analysis',workshop); assert.equal(scoped.responses.length,2); assert.ok(scoped.assignments.every(a=>a.workshop_id===workshop));
      await asUser(admin); const normal=await read('analysis',null); assert.equal(normal.includesArchived,false); assert.equal(normal.responses.length,2);
      await assert.rejects(()=>read('analysis',archived),/可存取的梯次/);
    });
    await t.test('learners and anonymous callers cannot access scores, deletion, audit or private helpers', async () => {
      await asUser(learner);
      for (const name of ['analysis','delete_info']) await assert.rejects(()=>read(name,first),/權限/);
      await assert.rejects(()=>call('delete',{id:first}));
      const summary=await read('student_data',sid), form=await read('form',first);
      for (const source of [summary,form]) for (const hidden of ['"scores"','"answers"','"note"','老師專用備註','reverseItems','dimensions']) assert.ok(!JSON.stringify(source).includes(hidden));
      await asUser(outsider); await assert.rejects(()=>read('form',first),/工作坊/); await assert.rejects(()=>submit(first),/梯次/);
      await owner(); await db.exec('set role anon');
      for (const name of ['analysis','delete_info']) await assert.rejects(()=>read(name,first),/permission denied/);
      await assert.rejects(()=>call('delete',{id:first}),/permission denied/);
      await assert.rejects(()=>db.query('select * from nptc_private.survey_deletion_events'));
      await asUser(); await assert.rejects(()=>db.query('select nptc_private.require_fresh_survey_admin_password()'));
    });
    await t.test('stale response counts and settings are rejected before deleting anything', async () => {
      const body=await infoBody(first);
      for (const changes of [{expectedResponses:0},{expectedResponses:'1'},{revision:99},{revision:'0'},{acknowledgeDataLoss:false},{acknowledgeDataLoss:'true'}]) await assert.rejects(()=>call('delete',{...body,...changes}));
      assert.equal((await read('delete_info',first)).responseCount,1);
      const initial=await infoBody(empty); await asUser(learner); await submit(empty); await asUser(root,0);
      await assert.rejects(()=>call('delete',initial),/筆數已變更/);
      assert.equal((await read('delete_info',empty)).responseCount,1);
    });
    await t.test('password must be recent and a session may authorize only one destructive action', async () => {
      const body=await infoBody(first);
      for (const age of [null,180,-60]) {await asUser(root,age);await assert.rejects(()=>call('delete',body),/重新輸入/);}
      await asUser(admin,0); assert.equal((await call('delete',body)).deletedResponses,1);
      await assert.rejects(async()=>call('delete',await infoBody(second)),/已使用/);
      assert.equal((await read('delete_info',second)).responseCount,1);
      await asUser(admin,0); await call('delete',await infoBody(empty));
    });
    await t.test('empty publication needs no password and cascade is limited to that publication', async () => {
      await asUser(); const id=await add();
      assert.equal((await call('delete',await infoBody(id))).deletedResponses,0);
      assert.equal((await read('delete_info',second)).responseCount,1);
      assert.equal((await call('library')).instruments.length,1);
      const data=await read('analysis',null); assert.equal(data.responses.length,2);
      await owner(); const audit=(await db.query('select response_count from nptc_private.survey_deletion_events order by response_count')).rows;
      assert.deepEqual(audit.map(r=>r.response_count),[0,1,1]);
      await assert.rejects(()=>db.query('delete from nptc_private.survey_responses where assignment_id=$1',[second]),/不可修改|直接刪除/);
      await assert.rejects(()=>db.query('delete from nptc_private.survey_assignments where id=$1',[second]),/身分驗證/);
      await assert.rejects(()=>db.query('delete from nptc_private.students where id=$1',[sid]),/作答紀錄/);
    });
    await t.test('disabled admins and archived workshops cannot use fresh authentication to delete', async () => {
      await asUser(root,0); await assert.rejects(async()=>call('delete',await infoBody(old)),/封存/);
      await db.query('select public.nptc_set_backend_account($1::jsonb)',[JSON.stringify({email:emails[admin],enabled:false})]);
      await asUser(admin,0);await assert.rejects(()=>call('delete',{id:second,revision:0,expectedResponses:1,acknowledgeDataLoss:true}),/權限/);
    });
    await t.test('reapplying current migrations preserves responses and deletion protections', async () => {
      await asUser(); const before=await read('analysis',null);
      await owner();for(const file of ['upgrade-survey-library','upgrade-survey-analysis','upgrade-survey-deletion'])await db.exec(readFileSync(`supabase/${file}.sql`,'utf8'));
      await asUser();assert.deepEqual(await read('analysis',null),before);
      await assert.rejects(async()=>call('delete',await infoBody(second)),/重新輸入/);
      await owner();await assert.rejects(()=>db.exec(readFileSync('supabase/upgrade-surveys.sql','utf8')),/不可重跑/);await db.exec('rollback');
      await asUser(root,0);await db.query('select public.nptc_delete_archived_workshop($1::jsonb)',[JSON.stringify({workshopId:archived,name:'歷史梯次'})]);
      assert.equal((await read('analysis',null)).responses.length,1);
      assert.equal((await read('delete_info',second)).responseCount,1);
    });
  } finally { await db.close(); }
});
