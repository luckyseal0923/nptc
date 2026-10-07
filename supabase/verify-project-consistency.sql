-- 僅供 SQL Editor 唯讀驗收，不修改資料；請勿將含名冊的查詢結果公開。
select max(version) as installed_version from nptc_private.schema_migrations;
select to_regprocedure('public.nptc_analysis_data(uuid)') as analysis_rpc,
       to_regprocedure('public.nptc_sync_student_email()') as email_sync_rpc,
       to_regprocedure('public.nptc_hospital_directory()') as directory_rpc;
select 'workshops' as resource,count(*) as records from nptc_private.workshops
union all select 'students',count(*) from nptc_private.students
union all select 'station_grades',count(*) from nptc_private.station_grades
union all select 'hospital_directory',count(*) from nptc_private.hospital_directory;

-- 應為 0：直接資料表讀寫權限不得交給 anon 或 authenticated。
select count(*) as unexpected_table_privileges from information_schema.tables t
where t.table_schema='nptc_private' and t.table_type='BASE TABLE'
and (has_table_privilege('anon',format('%I.%I',t.table_schema,t.table_name),'SELECT,INSERT,UPDATE,DELETE')
 or has_table_privilege('authenticated',format('%I.%I',t.table_schema,t.table_name),'SELECT,INSERT,UPDATE,DELETE'));

-- 應為 0；非 0 代表舊資料可能已受舊 API 影響，需人工核對原始評分，不能推算改分。
select count(*) as published_station_missing from nptc_private.workshops w
cross join lateral jsonb_array_elements(w.published_stations) p
where not exists(select 1 from jsonb_array_elements(w.stations) definition where definition->>'key'=p->>'key');
select count(*) as graded_station_missing from nptc_private.station_grades g
join nptc_private.students s on s.id=g.student_id join nptc_private.workshops w on w.id=s.workshop_id
where (g.score is not null or g.feedback<>'') and not exists(select 1 from jsonb_array_elements(w.stations) definition where definition->>'key'=g.station_key);
select count(distinct (g.student_id,g.station_key)) as invalid_domain_grades from nptc_private.station_grades g
join nptc_private.students s on s.id=g.student_id join nptc_private.workshops w on w.id=s.workshop_id
cross join lateral jsonb_array_elements(w.stations) definition
cross join lateral jsonb_each(g.domain_scores) domain
where definition->>'key'=g.station_key and g.domain_scores is not null
and case when jsonb_typeof(domain.value)='number' and jsonb_typeof(definition->'domainMax'->domain.key)='number'
 then (domain.value#>>'{}')::numeric<0 or (domain.value#>>'{}')::numeric>(definition->'domainMax'->>domain.key)::numeric else true end;

-- 僅列數量：歷史院名可能已停用、改名或不在本次名冊；保留原值，不能批次猜測替換。
select count(*) as legacy_hospital_names from nptc_private.students s
where coalesce(s.hospital,'')<>'' and not exists(select 1 from nptc_private.hospital_directory h where h.name=s.hospital);
