-- 在既有升級完成後執行整份；可重複執行，不會重啟已停用的帳號。
begin;
alter table nptc_private.teachers add column if not exists enabled boolean not null default true;
create table if not exists nptc_private.account_reviewers (
 email text primary key references nptc_private.teachers(email)
);
insert into nptc_private.teachers(email) values ('chin.wei.chang0923@gmail.com') on conflict do nothing;
insert into nptc_private.account_reviewers(email) values ('chin.wei.chang0923@gmail.com') on conflict do nothing;
create table if not exists nptc_private.backend_applications (
 email text primary key check(email=lower(trim(email))),
 name text not null check(length(trim(name)) between 1 and 100),
 reason text not null check(length(trim(reason)) between 1 and 500),
 status text not null default 'pending' check(status in ('pending','active','disabled')),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by uuid
);
insert into nptc_private.backend_applications(email,name,reason,status)
 select email,email,'既有後臺帳號',case when enabled then 'active' else 'disabled' end from nptc_private.teachers on conflict do nothing;
alter table nptc_private.account_reviewers enable row level security;
alter table nptc_private.backend_applications enable row level security;
revoke all on nptc_private.account_reviewers,nptc_private.backend_applications from public,anon,authenticated;

create or replace function public.nptc_is_teacher() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from nptc_private.teachers where email=lower(auth.jwt()->>'email') and enabled);
$$;
create or replace function public.nptc_is_account_reviewer() returns boolean language sql stable security definer set search_path='' as $$
 select public.nptc_is_teacher() and exists(select 1 from nptc_private.account_reviewers where email=lower(auth.jwt()->>'email'));
$$;
create or replace function public.nptc_backend_account_status() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare application jsonb;
begin
 if auth.uid() is null then raise exception '請先驗證 Email。' using errcode='42501'; end if;
 select to_jsonb(a) into application from nptc_private.backend_applications a where email=lower(auth.jwt()->>'email');
 return jsonb_build_object('application',application,'canReview',public.nptc_is_account_reviewer());
end;$$;
create or replace function public.nptc_apply_backend_account(body jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare verified_email text;
begin
 select lower(email) into verified_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if verified_email is null then raise exception '請先驗證 Email。' using errcode='42501'; end if;
 if jsonb_typeof(body->'name') is distinct from 'string' or jsonb_typeof(body->'reason') is distinct from 'string' then raise exception '請填寫姓名與申請用途。'; end if;
 insert into nptc_private.backend_applications(email,name,reason) values(verified_email,trim(body->>'name'),trim(body->>'reason')) on conflict do nothing;
 return public.nptc_backend_account_status();
end;$$;
create or replace function public.nptc_backend_accounts() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.nptc_is_account_reviewer() then raise exception '無帳號審核權限。' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(a) || jsonb_build_object('protected',exists(select 1 from nptc_private.account_reviewers r where r.email=a.email)) order by (a.status='pending') desc,a.created_at desc),'[]'::jsonb) from nptc_private.backend_applications a);
end;$$;
create or replace function public.nptc_set_backend_account(body jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare target text:=lower(trim(body->>'email')); activate boolean;
begin
 if not public.nptc_is_account_reviewer() then raise exception '無帳號審核權限。' using errcode='42501'; end if;
 if jsonb_typeof(body->'enabled') is distinct from 'boolean' then raise exception '啟用狀態不正確。'; end if;
 activate=(body->>'enabled')::boolean;
 if exists(select 1 from nptc_private.account_reviewers where email=target) then raise exception '此審核管理員帳號受到保護。'; end if;
 perform 1 from nptc_private.backend_applications where email=target for update;
 if not found then raise exception '找不到帳號申請。'; end if;
 insert into nptc_private.teachers(email,enabled) values(target,activate) on conflict(email) do update set enabled=excluded.enabled;
 update nptc_private.backend_applications set status=case when activate then 'active' else 'disabled' end,reviewed_at=now(),reviewed_by=auth.uid() where email=target;
 return '{"ok":true}'::jsonb;
end;$$;
revoke all on function public.nptc_is_teacher(),public.nptc_is_account_reviewer(),public.nptc_backend_account_status(),public.nptc_apply_backend_account(jsonb),public.nptc_backend_accounts(),public.nptc_set_backend_account(jsonb) from public,anon;
grant execute on function public.nptc_is_teacher(),public.nptc_is_account_reviewer(),public.nptc_backend_account_status(),public.nptc_apply_backend_account(jsonb),public.nptc_backend_accounts(),public.nptc_set_backend_account(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
