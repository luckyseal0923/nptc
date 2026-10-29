import { readFile, writeFile } from 'node:fs/promises';
const definitions = await Promise.all(['vpirs-e', 'learning-satisfaction'].map(async name => JSON.parse(await readFile(`lib/${name}.json`, 'utf8'))));
const library = await readFile('supabase/upgrade-survey-library.sql', 'utf8');
const names = ['nptc_private.survey_validate_answers', 'nptc_private.survey_score', 'public.nptc_survey_form'];
const functions = names.map(name => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = library.match(new RegExp(`create or replace function ${escaped}\\([\\s\\S]*?end;\\$\\$;`));
  if (!match) throw new Error(`Missing survey function ${name}`);
  return match[0];
});
const quote = value => `'${value.replaceAll("'", "''")}'`;
const inserts = definitions.map(d => {
  const value = `${quote(JSON.stringify(d))}::jsonb`;
  return `do $$ begin
 perform nptc_private.survey_validate_definition(${value});
 if exists(select 1 from nptc_private.survey_instruments where code=${quote(d.code)} and version=${quote(d.version)} and definition<>${value}) then
  raise exception '量表版本已存在且內容不同，請勿覆寫既有版本。';
 end if;
end;$$;
insert into nptc_private.survey_instruments(code,version,definition) values(${quote(d.code)},${quote(d.version)},${value}) on conflict(code,version) do nothing;`;
});
await writeFile('supabase/upgrade-survey-catalog.sql', `-- 先完成四段量表升級。新增 VPIRS-E 與學習滿意度，支援待計分及混合題型。
-- 不修改既有發布快照或作答；不建立任何問卷發布；可重跑。
begin;
do $$ begin
 if not exists(select 1 from nptc_private.schema_migrations where version=2026102904) then raise exception '請先完成 upgrade-survey-deletion.sql。'; end if;
end;$$;

${functions.join('\n\n')}
revoke all on function nptc_private.survey_validate_answers(jsonb,jsonb) from public,anon,authenticated;
revoke all on function nptc_private.survey_score(jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.nptc_survey_form(uuid) from public,anon;
grant execute on function public.nptc_survey_form(uuid) to authenticated;

${inserts.join('\n\n')}

insert into nptc_private.schema_migrations(version) values(2026102905) on conflict do nothing;
notify pgrst,'reload schema';
commit;
`);
