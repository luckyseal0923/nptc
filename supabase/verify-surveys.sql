-- 在 Supabase SQL Editor 以資料庫管理者唯讀執行。
select version,installed_at from nptc_private.schema_migrations where version=2026102901;
select c.relname,c.relrowsecurity as rls_enabled from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='nptc_private' and c.relname in ('survey_instruments','survey_assignments','survey_responses') order by c.relname;
select to_regprocedure('public.nptc_survey_create_pair(jsonb)') as create_pair,
 to_regprocedure('public.nptc_survey_student_data(uuid)') as student_data,
 to_regprocedure('public.nptc_survey_submit(jsonb)') as submit,
 to_regprocedure('public.nptc_survey_export(uuid)') as researcher_export;
select nptc_private.survey_score(definition,'[6,6,6,6,1,1,6,1,1,6,6,1,1,1]'::jsonb) as expected_total_84_dimensions_42
 from nptc_private.survey_instruments where code='dti-sk' and version='zh-TW-draft-20261029';
select count(*) as assignments from nptc_private.survey_assignments;
select count(*) as responses from nptc_private.survey_responses;
