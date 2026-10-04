-- 在 upgrade-backend-accounts.sql 之後執行。系統管理者沿用既有 account_reviewers 名單。
begin;

-- 既有審核員即為系統管理者；初始帳號保留為不可降權的根管理者。
create or replace function public.nptc_backend_accounts() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.nptc_is_account_reviewer() then raise exception '只有系統管理者可查看帳號。' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(a) || jsonb_build_object(
  'systemAdmin',exists(select 1 from nptc_private.account_reviewers r where r.email=a.email),
  'protected',a.email='chin.wei.chang0923@gmail.com')
  order by (a.status='pending') desc,a.created_at desc),'[]'::jsonb)
  from nptc_private.backend_applications a);
end;$$;

create or replace function public.nptc_set_backend_role(body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target text:=lower(trim(body->>'email')); promote boolean;
begin
 if not public.nptc_is_account_reviewer() then raise exception '只有系統管理者可調整權限。' using errcode='42501'; end if;
 if jsonb_typeof(body->'systemAdmin') is distinct from 'boolean' then raise exception '權限資料不正確。'; end if;
 promote=(body->>'systemAdmin')::boolean;
 if target='chin.wei.chang0923@gmail.com' and not promote then raise exception '初始系統管理者不可降權。'; end if;
 if target=lower(auth.jwt()->>'email') and not promote then raise exception '不可降低自己的權限。'; end if;
 perform 1 from nptc_private.backend_applications where email=target and status='active' for update;
 if not found then raise exception '只能調整已啟用帳號的權限。'; end if;
 if promote then insert into nptc_private.account_reviewers(email) values(target) on conflict do nothing;
 else delete from nptc_private.account_reviewers where email=target; end if;
 return '{"ok":true}'::jsonb;
end;$$;

create or replace function public.nptc_set_backend_account(body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target text:=lower(trim(body->>'email')); activate boolean;
begin
 if not public.nptc_is_account_reviewer() then raise exception '只有系統管理者可啟用或停用帳號。' using errcode='42501'; end if;
 if jsonb_typeof(body->'enabled') is distinct from 'boolean' then raise exception '啟用狀態不正確。'; end if;
 activate=(body->>'enabled')::boolean;
 if target='chin.wei.chang0923@gmail.com' and not activate then raise exception '初始系統管理者不可停用。'; end if;
 if target=lower(auth.jwt()->>'email') and not activate then raise exception '不可停用自己的帳號。'; end if;
 perform 1 from nptc_private.backend_applications where email=target for update;
 if not found then raise exception '找不到帳號申請。'; end if;
 insert into nptc_private.teachers(email,enabled) values(target,activate)
  on conflict(email) do update set enabled=excluded.enabled;
 update nptc_private.backend_applications set status=case when activate then 'active' else 'disabled' end,
  reviewed_at=now(),reviewed_by=auth.uid() where email=target;
 return '{"ok":true}'::jsonb;
end;$$;

-- 封存保留名冊、題目、成績與已公布狀態，不直接刪除資料。
alter table nptc_private.workshops add column if not exists archived_at timestamptz;

create or replace function public.nptc_archived_workshops() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.nptc_is_account_reviewer() then raise exception '只有系統管理者可查看封存梯次。' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'archivedAt',archived_at) order by archived_at desc),'[]'::jsonb)
  from nptc_private.workshops where archived_at is not null);
end;$$;

create or replace function public.nptc_set_workshop_archived(body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target uuid; archive boolean;
begin
 if not public.nptc_is_account_reviewer() then raise exception '只有系統管理者可封存或還原梯次。' using errcode='42501'; end if;
 if jsonb_typeof(body->'workshopId') is distinct from 'string' or jsonb_typeof(body->'archived') is distinct from 'boolean' then raise exception '梯次資料不正確。'; end if;
 target=(body->>'workshopId')::uuid; archive=(body->>'archived')::boolean;
 update nptc_private.workshops set archived_at=case when archive then now() else null end
  where id=target and (archived_at is null)=archive;
 if not found then raise exception '梯次不存在或狀態已變更，請重新整理。'; end if;
 return '{"ok":true}'::jsonb;
end;$$;

-- 既有老師資料 RPC 的結果保留完整格式，只篩選封存梯次。
create or replace function public.nptc_teacher_data(requested_workshop uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare selected nptc_private.workshops; items jsonb; roster jsonb;
begin
 if not public.nptc_is_teacher() then raise exception '此帳號沒有一般管理員權限。' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(w) || jsonb_build_object('publishedStations',coalesce((select jsonb_agg(p->>'key') from jsonb_array_elements(w.published_stations) p),'[]'::jsonb)) order by w.created_at desc,w.id),'[]'::jsonb)
  into items from nptc_private.workshops w where w.archived_at is null;
 select * into selected from nptc_private.workshops w where w.archived_at is null
  order by (w.id=requested_workshop) desc nulls last,w.created_at desc,w.id limit 1;
 select coalesce(jsonb_agg(to_jsonb(s) || coalesce((select jsonb_object_agg(g.station_key||'_domains',g.domain_scores) from nptc_private.station_grades g where g.student_id=s.id),'{}'::jsonb) || jsonb_build_object('account_registered',exists(select 1 from auth.users u where lower(trim(u.email))=lower(trim(s.email))),'account_activated_at',(select a.activated_at from nptc_private.student_accounts a join auth.users u on u.id=a.user_id and lower(trim(u.email))=lower(trim(a.email)) where lower(trim(a.email))=lower(trim(s.email)) limit 1)) || coalesce((select jsonb_object_agg(g.station_key||'_score',g.score) from nptc_private.station_grades g where g.student_id=s.id),'{}'::jsonb) || coalesce((select jsonb_object_agg(g.station_key||'_rating',g.rating) from nptc_private.station_grades g where g.student_id=s.id),'{}'::jsonb) || coalesce((select jsonb_object_agg(g.station_key||'_feedback',g.feedback) from nptc_private.station_grades g where g.student_id=s.id),'{}'::jsonb) order by s.phone,s.name),'[]'::jsonb)
  into roster from nptc_private.students s where s.workshop_id=selected.id;
 return jsonb_build_object('workshops',items,'selected',case when selected.id is null then null else to_jsonb(selected) || jsonb_build_object('publishedStations',coalesce((select jsonb_agg(p->>'key') from jsonb_array_elements(selected.published_stations) p),'[]'::jsonb)) end,'students',roster,'thresholds',case when selected.id is null then '[]'::jsonb else nptc_private.dynamic_thresholds(selected.id) end);
end;$$;

create or replace function nptc_private.reject_archived_workshop_change() returns trigger
language plpgsql set search_path='' as $$
declare target uuid;
begin
 if TG_TABLE_NAME='workshops' then
  if TG_OP='DELETE' then raise exception '請封存梯次，不可直接刪除。'; end if;
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

drop trigger if exists nptc_archived_workshop_guard on nptc_private.workshops;
create trigger nptc_archived_workshop_guard before update or delete on nptc_private.workshops
 for each row execute function nptc_private.reject_archived_workshop_change();
drop trigger if exists nptc_archived_student_guard on nptc_private.students;
create trigger nptc_archived_student_guard before insert or update or delete on nptc_private.students
 for each row execute function nptc_private.reject_archived_workshop_change();
drop trigger if exists nptc_archived_grade_guard on nptc_private.station_grades;
create trigger nptc_archived_grade_guard before insert or update or delete on nptc_private.station_grades
 for each row execute function nptc_private.reject_archived_workshop_change();

create or replace function public.nptc_update_backend_account(body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target text:=lower(trim(body->>'email')); new_name text:=trim(body->>'name'); new_reason text:=trim(body->>'reason');
begin
 if not public.nptc_is_account_reviewer() then raise exception '只有系統管理者可修改帳號。' using errcode='42501'; end if;
 if target is null or new_name is null or new_reason is null or length(new_name) not between 1 and 100 or length(new_reason) not between 1 and 500 then
  raise exception '請填寫姓名與申請用途，並確認長度。';
 end if;
 update nptc_private.backend_applications set name=new_name,reason=new_reason where email=target;
 if not found then raise exception '找不到帳號申請。'; end if;
 return '{"ok":true}'::jsonb;
end;$$;

revoke all on function public.nptc_backend_accounts(),public.nptc_set_backend_role(jsonb),public.nptc_set_backend_account(jsonb),public.nptc_archived_workshops(),public.nptc_set_workshop_archived(jsonb),public.nptc_teacher_data(uuid),public.nptc_update_backend_account(jsonb) from public,anon;
revoke all on function nptc_private.reject_archived_workshop_change() from public,anon,authenticated;
grant execute on function public.nptc_backend_accounts(),public.nptc_set_backend_role(jsonb),public.nptc_set_backend_account(jsonb),public.nptc_archived_workshops(),public.nptc_set_workshop_archived(jsonb),public.nptc_teacher_data(uuid),public.nptc_update_backend_account(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
