-- 供日後驗收時在 SQL Editor 以資料庫管理者唯讀執行；本次尚未執行。
select version,installed_at from nptc_private.schema_migrations where version=2026102902;
select to_regprocedure('public.nptc_survey_library()') as library,
 to_regprocedure('public.nptc_survey_library_save(jsonb)') as removed_writer_expected_null,
 to_regprocedure('public.nptc_survey_assign(jsonb)') as add_to_workshop,
 to_regprocedure('public.nptc_survey_form(uuid)') as linked_form;
select code,version,definition->>'title' as title,jsonb_array_length(definition->'items') as question_count from nptc_private.survey_instruments order by code,version;
select count(*) as assignments,count(*) filter(where phase is not null) as legacy_phase_values_expected_zero from nptc_private.survey_assignments;
