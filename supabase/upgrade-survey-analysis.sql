-- 先安裝 upgrade-surveys.sql 及 upgrade-survey-library.sql。
-- 本檔僅加入老師專用量表分析讀取，不改寫原始作答或分數。
begin;
do $$ begin
 if to_regprocedure('public.nptc_survey_library()') is null then raise exception '請先安裝 upgrade-survey-library.sql。'; end if;
end;$$;

create or replace function public.nptc_survey_analysis(requested_workshop uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare archives boolean;
begin
 if not public.nptc_is_teacher() then raise exception '此帳號沒有量表分析權限。' using errcode='42501'; end if;
 archives=public.nptc_is_account_reviewer();
 if requested_workshop is not null then perform nptc_private.survey_require_teacher(requested_workshop); end if;
 return jsonb_build_object('includesArchived',archives,
  'workshops',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'name',w.name,'archived_at',w.archived_at) order by w.created_at desc,w.id) from nptc_private.workshops w where archives or w.archived_at is null),'[]'::jsonb),
  'students',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'workshop_id',s.workshop_id,'name',s.name,'identity',coalesce(account.user_id::text,'email:'||s.email)) order by s.name,s.id)
   from nptc_private.students s join nptc_private.workshops w on w.id=s.workshop_id left join nptc_private.student_accounts account on account.email=s.email
   where (archives or w.archived_at is null) and (requested_workshop is null or w.id=requested_workshop)),'[]'::jsonb),
  'assignments',coalesce((select jsonb_agg((to_jsonb(a)-'phase'-'request_id') order by a.created_at,a.id)
   from nptc_private.survey_assignments a join nptc_private.workshops w on w.id=a.workshop_id where (archives or w.archived_at is null) and (requested_workshop is null or w.id=requested_workshop)),'[]'::jsonb),
  'responses',coalesce((select jsonb_agg(jsonb_build_object('assignment_id',r.assignment_id,'student_id',r.student_id,'identity',r.user_id::text,'submitted_at',r.submitted_at,'answers',r.answers,'scores',r.scores) order by r.submitted_at,r.id)
   from nptc_private.survey_responses r join nptc_private.survey_assignments a on a.id=r.assignment_id join nptc_private.workshops w on w.id=a.workshop_id where (archives or w.archived_at is null) and (requested_workshop is null or w.id=requested_workshop)),'[]'::jsonb));
end;$$;
revoke all on function public.nptc_survey_analysis(uuid) from public,anon;
grant execute on function public.nptc_survey_analysis(uuid) to authenticated;
insert into nptc_private.schema_migrations(version) values(2026102903) on conflict do nothing;
notify pgrst,'reload schema';
commit;
