-- 首次啟用改為名冊核對；只允許伺服器呼叫，不覆寫既有帳號。
begin;
create table if not exists nptc_private.activation_attempts (
 email_hash text primary key, attempts integer not null, started_at timestamptz not null
);
alter table nptc_private.activation_attempts enable row level security;
revoke all on nptc_private.activation_attempts from public,anon,authenticated;
create or replace function public.nptc_verify_student_roster(body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare normalized_email text := lower(trim(body->>'email')); attempt_count integer;
begin
 if coalesce(normalized_email,'')='' then return jsonb_build_object('ok',false); end if;
 insert into nptc_private.activation_attempts as a(email_hash,attempts,started_at)
 values(encode(sha256(convert_to(normalized_email,'UTF8')),'hex'),1,now())
 on conflict(email_hash) do update set
 attempts=case when a.started_at < now()-interval '1 hour' then 1 else a.attempts+1 end,
 started_at=case when a.started_at < now()-interval '1 hour' then now() else a.started_at end
 returning attempts into attempt_count;
 if attempt_count>5 then return jsonb_build_object('ok',false); end if;
 if exists(select 1 from auth.users u where lower(u.email)=normalized_email) then
  return jsonb_build_object('ok',false);
 end if;
 if not exists(select 1 from nptc_private.students s
  where lower(trim(s.email))=normalized_email and trim(s.name)=trim(body->>'name')
  and s.phone=body->>'phone' and coalesce(s.phone,'') ~ '^09[0-9]{8}$') then
  return jsonb_build_object('ok',false);
 end if;
 return jsonb_build_object('ok',true,'email',normalized_email);
end; $$;
revoke all on function public.nptc_verify_student_roster(jsonb) from public,anon,authenticated;
grant execute on function public.nptc_verify_student_roster(jsonb) to service_role;
revoke all on function public.nptc_issue_student_invitation(uuid) from public,anon,authenticated;
revoke all on function public.nptc_consume_student_invitation(jsonb) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
