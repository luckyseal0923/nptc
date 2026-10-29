-- 先安裝 upgrade-surveys.sql 及 upgrade-survey-library.sql。
-- 本檔加入單次問卷發布刪除；已有作答時要求目前管理員的新密碼登入 session。
begin;
do $$ begin
 if to_regprocedure('public.nptc_survey_library()') is null then raise exception '請先安裝 upgrade-survey-library.sql。'; end if;
end;$$;

create table if not exists nptc_private.survey_deletion_events(
 id uuid primary key default gen_random_uuid(), assignment_id uuid not null, workshop_id uuid not null,
 scale_code text not null, scale_version text not null, response_count integer not null,
 deleted_by uuid not null, deleted_at timestamptz not null default now()
);
alter table nptc_private.survey_deletion_events enable row level security;
revoke all on nptc_private.survey_deletion_events from public,anon,authenticated;

create or replace function nptc_private.require_fresh_survey_admin_password() returns void
language plpgsql security definer set search_path='' as $$
declare session_key text:=auth.jwt()->>'session_id'; password_at timestamptz;
begin
 if not public.nptc_is_teacher() then raise exception '只有已啟用的後臺管理員可刪除問卷。' using errcode='42501'; end if;
 select to_timestamp((method->>'timestamp')::double precision) into password_at
 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) method
 where method->>'method'='password' and jsonb_typeof(method->'timestamp')='number'
 order by (method->>'timestamp')::double precision desc limit 1;
 if coalesce(session_key,'')='' or password_at is null or password_at<now()-interval '2 minutes' or password_at>now()+interval '30 seconds' then
  raise exception '請重新輸入目前管理員的 Email 與密碼。' using errcode='42501';
 end if;
 delete from nptc_private.workshop_action_sessions where used_at<now()-interval '7 days';
 insert into nptc_private.workshop_action_sessions(session_id,admin_id) values(session_key,auth.uid()) on conflict do nothing;
 if not found then raise exception '這次身分驗證已使用，請重新輸入帳號與密碼。' using errcode='42501'; end if;
end;$$;

create or replace function nptc_private.survey_guard() returns trigger
language plpgsql set search_path='' as $$
declare wid uuid;
begin
 if TG_OP='DELETE' then
  if current_setting('nptc.delete_archived_workshop',true)='on' then return old; end if;
  if TG_TABLE_NAME='survey_assignments' then
   if current_setting('nptc.delete_survey_assignment',true)=old.id::text then return old; end if;
  elsif TG_TABLE_NAME='survey_responses' then
   if current_setting('nptc.delete_survey_assignment',true)=old.assignment_id::text then return old; end if;
  end if;
 end if;
 if TG_TABLE_NAME='students' then
  if exists(select 1 from nptc_private.survey_responses where student_id=old.id) then raise exception '學員已有量表作答紀錄，請保留名冊。'; end if;
  return old;
 end if;
 if TG_TABLE_NAME='survey_assignments' then
  if TG_OP='DELETE' then raise exception '請使用具身分驗證與資料警示的問卷刪除流程。'; end if;
  wid=new.workshop_id;
  if TG_OP='UPDATE' and (new.workshop_id,new.scale_code,new.scale_version,new.definition,new.phase,new.created_by,new.created_at) is distinct from (old.workshop_id,old.scale_code,old.scale_version,old.definition,old.phase,old.created_by,old.created_at) then raise exception '已建立問卷的題目與版本不可變更。'; end if;
 else
  if TG_OP<>'INSERT' then raise exception '已提交問卷不可修改或直接刪除。'; end if;
  select workshop_id into wid from nptc_private.survey_assignments where id=new.assignment_id;
 end if;
 perform 1 from nptc_private.workshops where id=wid and archived_at is null for update;
 if not found then raise exception '封存梯次不可修改或填答問卷。'; end if;
 return new;
end;$$;

create or replace function public.nptc_survey_delete_info(requested_assignment uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a nptc_private.survey_assignments; amount integer;
begin
 if not public.nptc_is_teacher() then raise exception '此帳號沒有問卷管理權限。' using errcode='42501'; end if;
 select * into a from nptc_private.survey_assignments where id=requested_assignment;
 if not found then raise exception '問卷已刪除或不存在，請更新發布紀錄。'; end if;
 perform nptc_private.survey_require_teacher(a.workshop_id);
 select count(*)::integer into amount from nptc_private.survey_responses where assignment_id=a.id;
 return jsonb_build_object('id',a.id,'title',a.definition->>'title','revision',a.revision,'responseCount',amount);
end;$$;

create or replace function public.nptc_survey_delete(body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a nptc_private.survey_assignments; wid uuid; amount integer;
begin
 if not public.nptc_is_teacher() then raise exception '此帳號沒有問卷刪除權限。' using errcode='42501'; end if;
 select workshop_id into wid from nptc_private.survey_assignments where id=(body->>'id')::uuid;
 if wid is null then raise exception '問卷已刪除或不存在，請更新發布紀錄。'; end if;
 perform nptc_private.survey_require_teacher(wid);
 perform 1 from nptc_private.workshops where id=wid and archived_at is null for update;
 if not found then raise exception '封存梯次不可刪除問卷，請先還原。'; end if;
 select * into a from nptc_private.survey_assignments where id=(body->>'id')::uuid for update;
 if not found then raise exception '問卷已刪除，請更新發布紀錄。'; end if;
 if jsonb_typeof(body->'revision') is distinct from 'number' or coalesce(body->>'revision','') !~ '^[0-9]+$' or (body->>'revision')::integer<>a.revision then raise exception '問卷設定已變更，請重新讀取刪除資訊。'; end if;
 select count(*)::integer into amount from nptc_private.survey_responses where assignment_id=a.id;
 if jsonb_typeof(body->'expectedResponses') is distinct from 'number' or coalesce(body->>'expectedResponses','') !~ '^[0-9]+$' or (body->>'expectedResponses')::integer<>amount then raise exception '作答筆數已變更，請重新讀取刪除資訊並確認影響範圍。'; end if;
 if amount>0 then
  if body->'acknowledgeDataLoss' is distinct from 'true'::jsonb then raise exception '請確認永久刪除這些作答與分數。'; end if;
  perform nptc_private.require_fresh_survey_admin_password();
 end if;
 insert into nptc_private.survey_deletion_events(assignment_id,workshop_id,scale_code,scale_version,response_count,deleted_by) values(a.id,wid,a.scale_code,a.scale_version,amount,auth.uid());
 perform set_config('nptc.delete_survey_assignment',a.id::text,true);
 delete from nptc_private.survey_assignments where id=a.id;
 perform set_config('nptc.delete_survey_assignment','',true);
 return jsonb_build_object('ok',true,'deletedResponses',amount);
end;$$;
revoke all on function nptc_private.require_fresh_survey_admin_password(),nptc_private.survey_guard() from public,anon,authenticated;
revoke all on function public.nptc_survey_delete_info(uuid),public.nptc_survey_delete(jsonb) from public,anon;
grant execute on function public.nptc_survey_delete_info(uuid),public.nptc_survey_delete(jsonb) to authenticated;
insert into nptc_private.schema_migrations(version) values(2026102904) on conflict do nothing;
notify pgrst,'reload schema';
commit;
