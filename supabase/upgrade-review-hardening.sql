-- 已安裝量表版本 2026102905 的環境執行整份。可重跑，不改既有名冊、分數或作答。
begin;
do $$ begin
 if not exists(select 1 from nptc_private.schema_migrations where version=2026102905) then raise exception '請先安裝 upgrade-survey-catalog.sql。'; end if;
end;$$;

create table if not exists nptc_private.workshop_deletion_events(
 id uuid primary key default gen_random_uuid(),workshop_id uuid not null,workshop_name text not null,
 deleted_by uuid not null,deleted_at timestamptz not null default now(),impact jsonb not null
);
alter table nptc_private.workshop_deletion_events enable row level security;
revoke all on nptc_private.workshop_deletion_events from public,anon,authenticated;

create or replace function nptc_private.workshop_delete_impact(wid uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare w nptc_private.workshops; result jsonb; fingerprint text;
begin
 select * into w from nptc_private.workshops where id=wid and archived_at is not null;
 if not found then raise exception '只能刪除已封存的梯次。'; end if;
 result=jsonb_build_object('studentCount',(select count(*) from nptc_private.students where workshop_id=wid),
  'gradeCount',(select count(*) from nptc_private.station_grades g join nptc_private.students s on s.id=g.student_id where s.workshop_id=wid),
  'assignmentCount',(select count(*) from nptc_private.survey_assignments where workshop_id=wid),
  'responseCount',(select count(*) from nptc_private.survey_responses r join nptc_private.survey_assignments a on a.id=r.assignment_id where a.workshop_id=wid),
  'surveys',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'title',a.definition->>'title','responseCount',(select count(*) from nptc_private.survey_responses r where r.assignment_id=a.id)) order by a.created_at,a.id) from nptc_private.survey_assignments a where a.workshop_id=wid),'[]'::jsonb));
 fingerprint=md5(jsonb_build_object('workshop',to_jsonb(w),'impact',result,
  'students',(select string_agg(md5(to_jsonb(s)::text),'' order by s.id) from nptc_private.students s where s.workshop_id=wid),
  'grades',(select string_agg(md5(to_jsonb(g)::text),'' order by g.student_id,g.station_key) from nptc_private.station_grades g join nptc_private.students s on s.id=g.student_id where s.workshop_id=wid),
  'assignments',(select string_agg(md5(to_jsonb(a)::text),'' order by a.id) from nptc_private.survey_assignments a where a.workshop_id=wid),
  'responses',(select string_agg(md5(to_jsonb(r)::text),'' order by r.id) from nptc_private.survey_responses r join nptc_private.survey_assignments a on a.id=r.assignment_id where a.workshop_id=wid))::text);
 return result||jsonb_build_object('fingerprint',fingerprint);
end;$$;

create or replace function public.nptc_archived_workshop_delete_info(requested_workshop uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.nptc_is_account_reviewer() then raise exception '只有系統管理者可查看完整刪除範圍。' using errcode='42501'; end if;
 return nptc_private.workshop_delete_impact(requested_workshop);
end;$$;

create or replace function public.nptc_delete_archived_workshop(body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target uuid; actual_name text; impact jsonb;
begin
 if not public.nptc_is_account_reviewer() then raise exception '只有系統管理者可刪除梯次。' using errcode='42501'; end if;
 if jsonb_typeof(body->'workshopId') is distinct from 'string' or jsonb_typeof(body->'name') is distinct from 'string' then raise exception '梯次資料不正確。'; end if;
 target=(body->>'workshopId')::uuid;
 select name into actual_name from nptc_private.workshops where id=target and archived_at is not null for update;
 if not found then raise exception '只能刪除已封存的梯次，請重新整理。'; end if;
 if body->>'name' is distinct from actual_name then raise exception '梯次名稱不符，請重新確認。'; end if;
 impact=nptc_private.workshop_delete_impact(target);
 if body->'acknowledgeDataLoss' is distinct from 'true'::jsonb or jsonb_typeof(body->'fingerprint') is distinct from 'string' or body->>'fingerprint' is distinct from impact->>'fingerprint' then raise exception '刪除範圍未確認或資料已變更，請重新讀取完整刪除範圍。'; end if;
 perform nptc_private.require_fresh_admin_password();
 insert into nptc_private.workshop_deletion_events(workshop_id,workshop_name,deleted_by,impact) values(target,actual_name,auth.uid(),impact);
 perform set_config('nptc.delete_archived_workshop','on',true);
 delete from nptc_private.station_grades g using nptc_private.students s where g.student_id=s.id and s.workshop_id=target;
 delete from nptc_private.students where workshop_id=target;
 delete from nptc_private.workshops where id=target;
 perform set_config('nptc.delete_archived_workshop','off',true);
 return jsonb_build_object('ok',true,'impact',impact);
end;$$;

create or replace function public.nptc_survey_analysis_workshops() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare archives boolean;
begin
 if not public.nptc_is_teacher() then raise exception '此帳號沒有量表分析權限。' using errcode='42501'; end if;
 archives=public.nptc_is_account_reviewer();
 return jsonb_build_object('includesArchived',archives,'workshops',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'name',w.name,'archived_at',w.archived_at) order by w.created_at desc,w.id) from nptc_private.workshops w where archives or w.archived_at is null),'[]'::jsonb));
end;$$;

create or replace function public.nptc_survey_analysis_summary(requested_workshop uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare archives boolean;
begin
 if not public.nptc_is_teacher() then raise exception '此帳號沒有量表分析權限。' using errcode='42501'; end if;
 archives=public.nptc_is_account_reviewer();
 if requested_workshop is not null then perform nptc_private.survey_require_teacher(requested_workshop); end if;
 return jsonb_build_object('includesArchived',archives,
  'workshops',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'name',w.name,'archived_at',w.archived_at) order by w.created_at desc,w.id) from nptc_private.workshops w where archives or w.archived_at is null),'[]'::jsonb),
  'students',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'workshop_id',s.workshop_id,'name',s.name,'identity',coalesce(account.user_id::text,'email:'||s.email)) order by s.name,s.id) from nptc_private.students s join nptc_private.workshops w on w.id=s.workshop_id left join nptc_private.student_accounts account on account.email=s.email where (archives or w.archived_at is null) and (requested_workshop is null or w.id=requested_workshop)),'[]'::jsonb),
  'assignments',coalesce((select jsonb_agg((to_jsonb(a)-'phase'-'request_id') order by a.created_at,a.id) from nptc_private.survey_assignments a join nptc_private.workshops w on w.id=a.workshop_id where (archives or w.archived_at is null) and (requested_workshop is null or w.id=requested_workshop)),'[]'::jsonb),
  'responses',coalesce((select jsonb_agg(jsonb_build_object('assignment_id',r.assignment_id,'student_id',r.student_id,'identity',r.user_id::text,'submitted_at',r.submitted_at,'scores',r.scores) order by r.submitted_at,r.id) from nptc_private.survey_responses r join nptc_private.survey_assignments a on a.id=r.assignment_id join nptc_private.workshops w on w.id=a.workshop_id where (archives or w.archived_at is null) and (requested_workshop is null or w.id=requested_workshop)),'[]'::jsonb));
end;$$;

create or replace function public.nptc_survey_response_detail(requested_assignment uuid,requested_student uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare wid uuid; result jsonb;
begin
 if not public.nptc_is_teacher() then raise exception '此帳號沒有量表分析權限。' using errcode='42501'; end if;
 select workshop_id into wid from nptc_private.survey_assignments where id=requested_assignment;
 perform nptc_private.survey_require_teacher(wid);
 select jsonb_build_object('assignment_id',r.assignment_id,'student_id',r.student_id,'identity',r.user_id::text,'submitted_at',r.submitted_at,'scores',r.scores,'answers',r.answers) into result from nptc_private.survey_responses r where r.assignment_id=requested_assignment and r.student_id=requested_student;
 if result is null then raise exception '找不到這筆作答，請更新資料。'; end if;
 return result;
end;$$;

revoke all on function nptc_private.workshop_delete_impact(uuid) from public,anon,authenticated;
revoke all on function public.nptc_archived_workshop_delete_info(uuid),public.nptc_delete_archived_workshop(jsonb),public.nptc_survey_analysis_workshops(),public.nptc_survey_analysis_summary(uuid),public.nptc_survey_response_detail(uuid,uuid) from public,anon;
grant execute on function public.nptc_archived_workshop_delete_info(uuid),public.nptc_delete_archived_workshop(jsonb),public.nptc_survey_analysis_workshops(),public.nptc_survey_analysis_summary(uuid),public.nptc_survey_response_detail(uuid,uuid) to authenticated;
insert into nptc_private.schema_migrations(version) values(2026103001) on conflict do nothing;
notify pgrst,'reload schema';
commit;
