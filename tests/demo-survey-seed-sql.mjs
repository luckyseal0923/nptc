import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { scoring } from './helpers-surveys.mjs';

test('three demo rounds preserve scope, account identity, scores and repeatability', async t => {
  const db = new PGlite();
  const root = '00000000-0000-0000-0000-000000000001';
  const workshop = '10000000-0000-0000-0000-000000000001';
  const other = '10000000-0000-0000-0000-000000000002';
  const seed = readFileSync('supabase/seed-demo-surveys.sql', 'utf8');
  const definition = JSON.parse(readFileSync('lib/dti-sk.json', 'utf8'));
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
      create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,encrypted_password text);
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('email',current_setting('test.email',true))$$;
      grant usage on schema auth to anon,authenticated;`);
    for (const file of ['install', 'upgrade-surveys', 'upgrade-survey-library', 'upgrade-survey-analysis', 'upgrade-survey-deletion']) {
      await db.exec(readFileSync(`supabase/${file}.sql`, 'utf8'));
    }
    await db.query('insert into auth.users values($1,$2,now(),$3)', [root, 'chin.wei.chang0923@gmail.com', 'fixture-only']);
    await db.query('insert into nptc_private.workshops(id,name) values($1,$2),($3,$4)', [workshop, 'Demo 示範梯次（20 位學員）', other, '其他梯次']);
    for (let n = 1; n <= 23; n++) {
      const sid = `20000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
      const uid = `30000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
      const email = `synthetic-${n}@example.invalid`;
      await db.query('insert into auth.users values($1,$2,now(),$3)', [uid, email, 'fixture-only']);
      await db.query('insert into nptc_private.student_accounts(user_id,email,activated_at) values($1,$2,now())', [uid, email]);
      await db.query('insert into nptc_private.students(id,workshop_id,name,email,phone,updated_by) values($1,$2,$3,$4,$5,$6)',
        [sid, n === 23 ? other : workshop, n === 22 ? '另一位學員' : `示範學員 ${String(n === 23 ? 1 : n).padStart(2, '0')}`, email, `09${String(n).padStart(8, '0')}`, root]);
    }
    const before = (await db.query(`select (select jsonb_agg(to_jsonb(s) order by id) from nptc_private.students s) students,
      (select jsonb_agg(to_jsonb(a) order by user_id) from nptc_private.student_accounts a) accounts,
      (select count(*)::int from auth.users) users`)).rows;
    const snapshot = async () => (await db.query(`select
      (select jsonb_agg(to_jsonb(a) order by id) from nptc_private.survey_assignments a) assignments,
      (select jsonb_agg(to_jsonb(r) order by id) from nptc_private.survey_responses r) responses`)).rows;

    await t.test('only the twenty numbered demo students receive three closed rounds', async () => {
      await db.exec(seed);
      const assignments = (await db.query('select * from nptc_private.survey_assignments order by created_at')).rows;
      assert.equal(assignments.length, 3);
      assert.ok(assignments.every(a => a.workshop_id === workshop && a.status === 'closed' && a.phase === null));
      assert.deepEqual(assignments.map(a => a.created_at.toISOString().slice(0, 10)), ['2026-10-01', '2026-10-15', '2026-10-29']);
      assert.ok(assignments.every(a => a.note.includes('模擬資料')));
      const rows = (await db.query(`select r.*,s.name,account.user_id expected_user from nptc_private.survey_responses r
        join nptc_private.students s on s.id=r.student_id join nptc_private.student_accounts account on account.email=s.email`)).rows;
      assert.equal(rows.length, 60);
      assert.ok(rows.every(r => r.user_id === r.expected_user));
      assert.ok(rows.every(r => r.name !== '示範學員 21' && r.name !== '另一位學員'));
      for (const r of rows) assert.deepEqual(r.scores, scoring.scoreSurvey(definition, r.answers));
      for (const a of assignments) assert.equal(rows.filter(r => r.assignment_id === a.id).length, 20);
      const unchanged = (await db.query(`select (select jsonb_agg(to_jsonb(s) order by id) from nptc_private.students s) students,
        (select jsonb_agg(to_jsonb(a) order by user_id) from nptc_private.student_accounts a) accounts,
        (select count(*)::int from auth.users) users`)).rows;
      assert.deepEqual(unchanged, before);
    });
    await t.test('person and group trends use existing identities and varied trajectories', async () => {
      await db.query("select set_config('test.uid',$1,false),set_config('test.email',$2,false)", [root, 'chin.wei.chang0923@gmail.com']);
      await db.exec('set role authenticated');
      const data = (await db.query('select public.nptc_survey_analysis($1) result', [workshop])).rows[0].result;
      await db.exec('reset role');
      assert.ok(data.responses.every(r => data.students.some(s => s.id === r.student_id && s.identity === r.identity)));
      const totals = (await db.query(`select s.name,array_agg((r.scores->>'total')::int order by a.created_at) scores
        from nptc_private.survey_responses r join nptc_private.survey_assignments a on a.id=r.assignment_id
        join nptc_private.students s on s.id=r.student_id group by s.id order by s.name`)).rows;
      const [up, flat, dip, late] = totals.map(r => r.scores);
      assert.ok(up[0] < up[1] && up[1] < up[2]);
      assert.equal(flat[0], flat[1]); assert.equal(flat[1], flat[2]);
      assert.ok(dip[0] < dip[1] && dip[1] > dip[2]);
      assert.equal(late[0], late[1]); assert.ok(late[1] < late[2]);
    });
    await t.test('repeated seed does not add or change saved responses', async () => {
      const saved = await snapshot(); await db.exec(seed); assert.deepEqual(await snapshot(), saved);
    });
    await t.test('edited publications and incomplete demo rosters stop safely', async () => {
      const first = (await db.query('select id from nptc_private.survey_assignments order by created_at limit 1')).rows[0].id;
      await db.query("update nptc_private.survey_assignments set note='教師已修改' where id=$1", [first]);
      const saved = await snapshot();
      await assert.rejects(() => db.exec(seed), /已被修改或識別衝突/); await db.exec('rollback');
      assert.deepEqual(await snapshot(), saved);
      await db.query("update nptc_private.student_accounts set activated_at=null where email='synthetic-1@example.invalid'");
      await assert.rejects(() => db.exec(seed), /01–20 號/); await db.exec('rollback');
      assert.deepEqual(await snapshot(), saved);
    });
  } finally { await db.close(); }
});
