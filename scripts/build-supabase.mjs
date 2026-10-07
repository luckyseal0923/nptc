import { readFile, writeFile } from 'node:fs/promises';

export const baseline = ['setup','upgrade-workshop-management','upgrade-score-feedback','upgrade-student-phone',
  'upgrade-student-profile','upgrade-dynamic-osce-stations','upgrade-backend-accounts','upgrade-student-activation',
  'upgrade-roster-account-status','upgrade-domain-scores','upgrade-student-roster-activation','upgrade-admin-roles','upgrade-workshop-sensitive-actions'];
const files = Object.fromEntries(await Promise.all(baseline.map(async name => [name,(await readFile(`supabase/${name}.sql`,'utf8')).replace(/\r\n/g,'\n')])));
const extract = (name,fn) => {
  const expression = new RegExp(`create or replace function ${fn.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\([\\s\\S]*?end;\\s*\\$\\$;`, 'i');
  const match = files[name].match(expression);
  if (!match) throw new Error(`Cannot find ${fn} in ${name}`);
  return match[0];
};
const sqlString = value => `'${String(value).replaceAll("'","''")}'`;
const directory = JSON.parse(await readFile('public/data/accredited-hospitals.json','utf8'));
if (!Array.isArray(directory.hospitals) || !directory.hospitals.length) throw new Error('Missing hospital directory');
const hospitals = [...new Map(directory.hospitals.map(h=>[h.name,h])).values()].sort((a,b)=>a.name.localeCompare(b.name,'zh-Hant'));
const seed = `delete from nptc_private.hospital_directory;\ninsert into nptc_private.hospital_directory(name,city,level) values\n${hospitals.map(h=>`(${[h.name,h.city,h.level].map(sqlString).join(',')})`).join(',\n')};`;

let teacherRead = extract('upgrade-admin-roles','public.nptc_teacher_data')
  .replace('public.nptc_teacher_data(requested_workshop uuid default null)','nptc_private.teacher_data(requested_workshop uuid default null,include_archived boolean default false)')
  .replaceAll('where w.archived_at is null','where (include_archived or w.archived_at is null)')
  .replace("jsonb_build_object('workshops',items", "jsonb_build_object('includesArchived',include_archived,'workshops',items");
const readWrappers = `
create or replace function public.nptc_teacher_data(requested_workshop uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$select nptc_private.teacher_data(requested_workshop,false)$$;
create or replace function public.nptc_analysis_data(requested_workshop uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$select nptc_private.teacher_data(requested_workshop,public.nptc_is_account_reviewer())$$;
revoke all on function nptc_private.teacher_data(uuid,boolean) from public,anon,authenticated;
revoke all on function public.nptc_teacher_data(uuid),public.nptc_analysis_data(uuid) from public,anon;
grant execute on function public.nptc_teacher_data(uuid),public.nptc_analysis_data(uuid) to authenticated;`;
const onboarding = extract('upgrade-student-activation','public.nptc_student_onboarding_status').replace(
  'select * into s from nptc_private.students where email=e order by updated_at desc nulls last,id limit 1;',
  'select student.* into s from nptc_private.students student join nptc_private.workshops w on w.id=student.workshop_id where student.email=e order by (w.archived_at is null) desc,student.updated_at desc nulls last,student.id limit 1;');
const verifyRoster = extract('upgrade-student-roster-activation','public.nptc_verify_student_roster').replace(
  /from nptc_private\.students s\s+where/, 'from nptc_private.students s join nptc_private.workshops w on w.id=s.workshop_id\n   where w.archived_at is null and');
const studentRead = extract('upgrade-domain-scores','nptc_private.student_data_before_activation').replace(
  "'workshopName',w.name,'published'", "'workshopName',w.name,'archived',w.archived_at is not null,'published'");
const current = [teacherRead,readWrappers,onboarding,
  extract('upgrade-student-activation','public.nptc_claim_student'),
  extract('upgrade-student-activation','public.nptc_student_data'),
  extract('upgrade-student-activation','public.nptc_finish_student_activation'),
  studentRead,
  extract('upgrade-domain-scores','public.nptc_teacher_batch_scores_v3'),
  `create or replace function public.nptc_teacher_batch_scores_v2(body jsonb) returns jsonb language sql security definer set search_path='' as $$select public.nptc_teacher_batch_scores_v3(body)$$;`,
  verifyRoster,
  extract('upgrade-workshop-sensitive-actions','nptc_private.require_fresh_admin_password'),
  extract('upgrade-workshop-sensitive-actions','public.nptc_set_workshop_archived'),
  extract('upgrade-workshop-sensitive-actions','public.nptc_delete_archived_workshop')].join('\n\n');
let upgrade = await readFile('supabase/upgrade-project-consistency.sql','utf8');
upgrade = upgrade.replace(/-- BEGIN HOSPITAL DIRECTORY[\s\S]*?-- END HOSPITAL DIRECTORY/,()=>`-- BEGIN HOSPITAL DIRECTORY\n${seed}\n-- END HOSPITAL DIRECTORY`)
  .replace(/-- BEGIN CURRENT READ FUNCTIONS[\s\S]*?-- END CURRENT READ FUNCTIONS/,()=>`-- BEGIN CURRENT READ FUNCTIONS\n${current}\n-- END CURRENT READ FUNCTIONS`);
await writeFile('supabase/upgrade-project-consistency.sql',upgrade);
await writeFile('supabase/install.sql',`-- Generated by scripts/build-supabase.mjs. New database only.\n${baseline.map(name=>`-- ${name}\n${files[name]}`).join('\n')}\n${upgrade}`);
console.log(`Built SQL installation and current upgrade with ${hospitals.length} hospitals.`);
