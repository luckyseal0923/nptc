-- 在 upgrade-admin-roles.sql 後執行。封存與永久刪除須使用剛以密碼登入的新 session。
begin;

create table if not exists nptc_private.workshop_action_sessions (
 session_id text primary key,
 admin_id uuid not null,
 used_at timestamptz not null default now()
);
alter table nptc_private.workshop_action_sessions enable row level security;
revoke all on nptc_private.workshop_action_sessions from public,anon,authenticated;

create or replace function nptc_private.require_fresh_admin_password() returns void
language plpgsql security definer set search_path='' as $$
declare session_key text:=auth.jwt()->>'session_id'; password_at timestamptz;
begin
 if not public.nptc_is_account_reviewer() then
  raise exception '只有系統管理者可執行此操作。' using errcode='42501';
 end if;
 select to_timestamp((method->>'timestamp')::double precision) into password_at
 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) method
 where method->>'method'='password' and jsonb_typeof(method->'timestamp')='number'
 order by (method->>'timestamp')::double precision desc limit 1;
 if coalesce(session_key,'')='' or password_at is null
  or password_at < now()-interval '2 minutes' or password_at > now()+interval '30 seconds' then
  raise exception '請重新輸入系統管理者帳號與密碼。' using errcode='42501';
 end if;
 delete from nptc_private.workshop_action_sessions where used_at < now()-interval '7 days';
 insert into nptc_private.workshop_action_sessions(session_id,admin_id) values(session_key,auth.uid())
 on conflict do nothing;
 if not found then
  raise exception '本次密碼驗證已使用，請重新輸入帳號與密碼。' using errcode='42501';
 end if;
end;$$;

create or replace function public.nptc_set_workshop_archived(body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target uuid; archive boolean;
begin
 if not public.nptc_is_account_reviewer() then raise exception '只有系統管理者可封存或還原梯次。' using errcode='42501'; end if;
 if jsonb_typeof(body->'workshopId') is distinct from 'string' or jsonb_typeof(body->'archived') is distinct from 'boolean' then raise exception '梯次資料不正確。'; end if;
 target=(body->>'workshopId')::uuid; archive=(body->>'archived')::boolean;
 if archive then perform nptc_private.require_fresh_admin_password(); end if;
 update nptc_private.workshops set archived_at=case when archive then now() else null end
  where id=target and (archived_at is null)=archive;
 if not found then raise exception '梯次不存在或狀態已變更，請重新整理。'; end if;
 return '{"ok":true}'::jsonb;
end;$$;

create or replace function nptc_private.reject_archived_workshop_change() returns trigger
language plpgsql set search_path='' as $$
declare target uuid;
begin
 if TG_OP='DELETE' and current_setting('nptc.delete_archived_workshop',true)='on' then return old; end if;
 if TG_TABLE_NAME='workshops' then
  if TG_OP='DELETE' then raise exception '請先封存梯次，再由系統管理者刪除。'; end if;
  if old.archived_at is not null and (new.archived_at is not null or (new.name,new.published,new.stations,new.published_stations) is distinct from (old.name,old.published,old.stations,old.published_stations)) then
   raise exception '封存梯次不可修改，請先還原。';
  end if;
  return new;
 end if;
 if TG_TABLE_NAME='students' then target=case when TG_OP='DELETE' then old.workshop_id else new.workshop_id end;
 else select s.workshop_id into target from nptc_private.students s where s.id=case when TG_OP='DELETE' then old.student_id else new.student_id end; end if;
 if exists(select 1 from nptc_private.workshops w where w.id=target and w.archived_at is not null) then raise exception '封存梯次不可修改，請先還原。'; end if;
 if TG_OP='DELETE' then return old; end if;
 return new;
end;$$;

create or replace function public.nptc_delete_archived_workshop(body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target uuid; actual_name text;
begin
 if jsonb_typeof(body->'workshopId') is distinct from 'string' or jsonb_typeof(body->'name') is distinct from 'string' then
  raise exception '梯次資料不正確。';
 end if;
 target=(body->>'workshopId')::uuid;
 perform nptc_private.require_fresh_admin_password();
 select name into actual_name from nptc_private.workshops where id=target and archived_at is not null for update;
 if not found then raise exception '只能刪除已封存的梯次，請重新整理。'; end if;
 if body->>'name' is distinct from actual_name then raise exception '梯次名稱不符，請重新確認。'; end if;
 perform set_config('nptc.delete_archived_workshop','on',true);
 delete from nptc_private.station_grades g using nptc_private.students s
  where g.student_id=s.id and s.workshop_id=target;
 delete from nptc_private.students where workshop_id=target;
 delete from nptc_private.workshops where id=target;
 perform set_config('nptc.delete_archived_workshop','off',true);
 return '{"ok":true}'::jsonb;
end;$$;

revoke all on function nptc_private.require_fresh_admin_password() from public,anon,authenticated;
revoke all on function public.nptc_delete_archived_workshop(jsonb) from public,anon;
grant execute on function public.nptc_delete_archived_workshop(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
