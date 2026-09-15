import { PGlite } from '../.verify-accounts/node_modules/@electric-sql/pglite/dist/index.js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role;
  create schema auth; create schema nptc_private;
  create table auth.users(id uuid primary key,email text);
  create table nptc_private.students(id uuid primary key,name text,email text,phone text);
  create function public.nptc_is_teacher() returns boolean language sql as $$select true$$;
  create function auth.uid() returns uuid language sql as $$select '00000000-0000-0000-0000-000000000001'::uuid$$;`);
await db.exec(readFileSync('supabase/upgrade-student-invitation.sql', 'utf8'));
await db.exec(readFileSync('supabase/upgrade-student-roster-activation.sql', 'utf8'));
await db.exec(`insert into nptc_private.students values ('10000000-0000-0000-0000-000000000001','Test Student','test@example.invalid','0912345678');`);
async function verify(body) {
  return (await db.query('select public.nptc_verify_student_roster($1::jsonb) as result', [JSON.stringify(body)])).rows[0].result;
}
const body = { name: 'Test Student', email: 'test@example.invalid', phone: '0912345678' };
await db.exec('set role authenticated');
await assert.rejects(() => verify(body));
await db.exec('reset role; set role service_role');
assert.equal((await verify({ ...body, phone: '0900000000' })).ok, false);
assert.equal((await verify(body)).ok, true);
await db.exec(`reset role; insert into auth.users values ('00000000-0000-0000-0000-000000000002','test@example.invalid'); set role service_role`);
assert.equal((await verify(body)).ok, false);
await db.exec(`reset role; delete from auth.users; truncate nptc_private.activation_attempts; set role service_role`);
for (let i = 0; i < 5; i++) assert.equal((await verify({ ...body, phone: '0900000000' })).ok, false);
assert.equal((await verify(body)).ok, false);
await db.close();
console.log('PASS: service-only roster verification, exact identity, existing-account protection, and rate limit');
