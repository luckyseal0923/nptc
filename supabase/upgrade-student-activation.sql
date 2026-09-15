-- 請在 dynamic-osce-stations 與 backend-accounts 升級之後執行整份檔案。
begin;
create table if not exists nptc_private.student_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 email text not null unique,
 claimed_at timestamptz not null default now(),
 activated_at timestamptz
);
alter table nptc_private.student_accounts enable row level security;
revoke all on nptc_private.student_accounts from public,anon,authenticated;

create or replace function nptc_private.student_identity() returns text
language plpgsql stable security definer set search_path='' as $$
declare verified_email text;
begin
 select lower(email) into verified_email from auth.users
 where id=auth.uid() and email_confirmed_at is not null;
 if verified_email is null or verified_email is distinct from lower(auth.jwt()->>'email') then
  raise exception '請先完成 Email 驗證並重新登入。' using errcode='42501';
 end if;
 return verified_email;
end;$$;

create or replace function public.nptc_student_onboarding_status() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare e text:=nptc_private.student_identity(); a nptc_private.student_accounts; s nptc_private.students;
begin
 select * into a from nptc_private.student_accounts where user_id=auth.uid() and email=e;
 if a.user_id is null then return jsonb_build_object('stage','unclaimed'); end if;
 select * into s from nptc_private.students where email=e order by updated_at desc nulls last,id limit 1;
 if s.id is null then raise exception '目前沒有您的學員名冊，請聯絡管理員。'; end if;
 return jsonb_build_object('stage',case when a.activated_at is null then 'profile' else 'active' end,
 'student',jsonb_build_object('name',s.name,'email',s.email,'phone',s.phone,
 'nursingYears',s.nursing_years,'hospital',s.hospital,'unit',s.unit,
 'examSpecialty',s.exam_specialty,'firstOsce',s.first_osce,'birthDate',s.birth_date));
end;$$;

create or replace function public.nptc_claim_student(body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e text:=nptc_private.student_identity();
begin
 if not exists(select 1 from nptc_private.students where email=e and trim(name)=trim(body->>'name')
  and regexp_replace(phone,'[[:space:]-]','','g')=regexp_replace(body->>'phone','[[:space:]-]','','g')
  and length(coalesce(body->>'phone',''))>=10) then
  raise exception '姓名、Email 與手機未能對應名冊，請確認資料或聯絡管理員。';
 end if;
 insert into nptc_private.student_accounts(user_id,email) values(auth.uid(),e)
 on conflict(user_id) do nothing;
 return public.nptc_student_onboarding_status();
end;$$;

-- 保留既有逐題公布的讀取邏輯，但封鎖繞過啟用程序直接呼叫。
do $$ begin
 if to_regprocedure('nptc_private.student_data_before_activation()') is null then
  alter function public.nptc_student_data() set schema nptc_private;
  alter function nptc_private.nptc_student_data() rename to student_data_before_activation;
 end if;
end;$$;
revoke all on function nptc_private.student_data_before_activation() from public,anon,authenticated;

create or replace function public.nptc_student_data() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare e text:=nptc_private.student_identity();
begin
 if not public.nptc_is_teacher() and not exists(select 1 from nptc_private.student_accounts
 where user_id=auth.uid() and email=e and activated_at is not null) then
  raise exception '請先完成首次啟用、個人資料與密碼設定。' using errcode='42501';
 end if;
 return nptc_private.student_data_before_activation();
end;$$;

create or replace function public.nptc_student_update_profile(body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e text:=nptc_private.student_identity();
begin
 if not public.nptc_is_teacher() and not exists(select 1 from nptc_private.student_accounts where user_id=auth.uid() and email=e) then
  raise exception '請先核對學員名冊。' using errcode='42501';
 end if;
 if jsonb_typeof(body->'nursingYears') is distinct from 'number'
 or (body->>'nursingYears')::numeric not between 0 and 60
 or (body->>'nursingYears')::numeric<>trunc((body->>'nursingYears')::numeric)
 or jsonb_typeof(body->'firstOsce') is distinct from 'boolean'
 or coalesce(length(trim(body->>'hospital')),0) not between 1 and 100
 or coalesce(length(trim(body->>'unit')),0) not between 1 and 100
 or coalesce(body->>'examSpecialty','') not in ('內科','精神科','兒科','外科','婦產科','麻醉科','家庭科')
 or coalesce(body->>'birthDate','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
  raise exception '請完整填寫有效的個人資料。';
 end if;
 if (body->>'birthDate')::date>current_date or (body->>'birthDate')::date<date '1900-01-01' then raise exception '請確認出生年月日。'; end if;
 update nptc_private.students set nursing_years=(body->>'nursingYears')::integer,
 hospital=trim(body->>'hospital'),unit=trim(body->>'unit'),exam_specialty=body->>'examSpecialty',
 first_osce=(body->>'firstOsce')::boolean,birth_date=(body->>'birthDate')::date,updated_at=now(),updated_by=auth.uid()
 where email=e;
 if not found then raise exception '找不到學員名冊。'; end if;
 return '{"ok":true}';
end;$$;

create or replace function public.nptc_finish_student_activation() returns jsonb
language plpgsql security definer set search_path='' as $$
declare e text:=nptc_private.student_identity();
begin
 if not exists(select 1 from auth.users where id=auth.uid() and length(encrypted_password)>0) then
  raise exception '請先設定登入密碼。';
 end if;
 if not exists(select 1 from nptc_private.students where email=e and nursing_years is not null
  and length(trim(hospital))>0 and length(trim(unit))>0 and exam_specialty is not null
  and first_osce is not null and birth_date between date '1900-01-01' and current_date) then
  raise exception '請先完整填寫個人資料。';
 end if;
 update nptc_private.student_accounts set activated_at=coalesce(activated_at,now()) where user_id=auth.uid() and email=e;
 if not found then raise exception '請先核對學員名冊。'; end if;
 return '{"ok":true}';
end;$$;
revoke all on function nptc_private.student_identity() from public,anon,authenticated;
revoke all on function public.nptc_student_onboarding_status(),public.nptc_claim_student(jsonb),public.nptc_student_data(),public.nptc_student_update_profile(jsonb),public.nptc_finish_student_activation() from public,anon;
grant execute on function public.nptc_student_onboarding_status(),public.nptc_claim_student(jsonb),public.nptc_student_data(),public.nptc_student_update_profile(jsonb),public.nptc_finish_student_activation() to authenticated;
notify pgrst,'reload schema';
commit;
