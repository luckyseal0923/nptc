-- 一次性啟用碼；先部署此檔，再部署 student-activate Edge Function。
begin;
create table if not exists nptc_private.student_invitations (
 email text primary key,
 student_id uuid not null references nptc_private.students(id) on delete cascade,
 code_hash text not null,
 expires_at timestamptz not null,
 consumed_at timestamptz,
 issued_by uuid not null,
 issued_at timestamptz not null default now()
);
alter table nptc_private.student_invitations enable row level security;
revoke all on nptc_private.student_invitations from public,anon,authenticated;

create or replace function public.nptc_issue_student_invitation(student_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s nptc_private.students; code text;
begin
 if not public.nptc_is_teacher() then raise exception '無權限。' using errcode='42501'; end if;
 select * into s from nptc_private.students where id=student_id;
 if s.id is null or coalesce(s.phone,'') !~ '^09[0-9]{8}$' then raise exception '請先儲存有效的學員手機電話。'; end if;
 if exists(select 1 from auth.users where lower(email)=lower(s.email)) then
  raise exception '此 Email 已有帳號，請使用既有密碼登入或忘記密碼，不可重新啟用。';
 end if;
 -- 兩組 UUID 提供不可猜測的隨機碼；明碼僅回傳本次操作。
 code := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
 insert into nptc_private.student_invitations(email,student_id,code_hash,expires_at,issued_by)
 values(lower(s.email),s.id,encode(sha256(convert_to(code,'UTF8')),'hex'),now()+interval '7 days',auth.uid())
 on conflict(email) do update set student_id=excluded.student_id,code_hash=excluded.code_hash,
 expires_at=excluded.expires_at,consumed_at=null,issued_by=excluded.issued_by,issued_at=now();
 return jsonb_build_object('code',code,'expiresAt',now()+interval '7 days');
end; $$;

-- 只允許伺服器呼叫；原子消耗，重複及併發請求只有一次能成功。
create or replace function public.nptc_consume_student_invitation(body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result_email text;
begin
 update nptc_private.student_invitations i set consumed_at=now()
 from nptc_private.students s
 where i.student_id=s.id and i.email=lower(trim(body->>'email'))
 and lower(s.email)=i.email and trim(s.name)=trim(body->>'name')
 and s.phone=body->>'phone' and coalesce(s.phone,'') ~ '^09[0-9]{8}$'
 and i.code_hash=encode(sha256(convert_to(body->>'code','UTF8')),'hex')
 and i.expires_at>now() and i.consumed_at is null
 and not exists(select 1 from auth.users u where lower(u.email)=i.email)
 returning i.email into result_email;
 if result_email is null then return jsonb_build_object('ok',false); end if;
 return jsonb_build_object('ok',true,'email',result_email);
end; $$;
revoke all on function public.nptc_issue_student_invitation(uuid) from public,anon;
grant execute on function public.nptc_issue_student_invitation(uuid) to authenticated;
revoke all on function public.nptc_consume_student_invitation(jsonb) from public,anon,authenticated;
grant execute on function public.nptc_consume_student_invitation(jsonb) to service_role;
notify pgrst,'reload schema';
commit;
