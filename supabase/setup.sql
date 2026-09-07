-- 在 Supabase SQL Editor 執行整份檔案；不會搬移或刪除舊 D1 資料。
begin;
create schema if not exists nptc_private;
revoke all on schema nptc_private from public,anon,authenticated;
create table if not exists nptc_private.teachers(email text primary key check(email=lower(trim(email))));
create table if not exists nptc_private.workshops(
 id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name)) between 1 and 100),
 published integer not null default 0 check(published in (0,1)),created_at timestamptz not null default now());
create table if not exists nptc_private.students(
 id uuid primary key default gen_random_uuid(),workshop_id uuid not null references nptc_private.workshops(id),
 name text not null check(length(trim(name)) between 1 and 100),
 email text not null check(email=lower(trim(email)) and length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 code text not null check(length(trim(code)) between 1 and 40),revision integer not null default 0,
 q1_score numeric,q1_rating integer,q2_score numeric,q2_rating integer,q3_score numeric,q3_rating integer,q4_score numeric,q4_rating integer,
 updated_at timestamptz not null default now(),updated_by uuid not null,
 unique(workshop_id,email),unique(workshop_id,code),
 check((q1_score is null and q1_rating is null) or (q1_score is not null and q1_rating is not null and q1_score between 0 and 100 and q1_rating between 1 and 5)),
 check((q2_score is null and q2_rating is null) or (q2_score is not null and q2_rating is not null and q2_score between 0 and 100 and q2_rating between 1 and 5)),
 check((q3_score is null and q3_rating is null) or (q3_score is not null and q3_rating is not null and q3_score between 0 and 100 and q3_rating between 1 and 5)),
 check((q4_score is null and q4_rating is null) or (q4_score is not null and q4_rating is not null and q4_score between 0 and 100 and q4_rating between 1 and 5)));
alter table nptc_private.teachers enable row level security;
alter table nptc_private.workshops enable row level security;
alter table nptc_private.students enable row level security;
revoke all on all tables in schema nptc_private from public,anon,authenticated;
insert into nptc_private.teachers(email) values ('chin.wei.chang0923@gmail.com') on conflict do nothing;
-- 無直接資料表權限；所有讀寫經下列檢查過的函式。
create or replace function public.nptc_is_teacher() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from nptc_private.teachers where email=lower(auth.jwt()->>'email'));
$$;
create or replace function nptc_private.thresholds(w uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_agg(jsonb_build_object('key',key,'value',value,'count',n) order by key) from (
 select v.key,avg(v.score) filter(where v.rating=3) as value,count(v.score) filter(where v.rating=3) as n
 from (values('q1'),('q2'),('q3'),('q4')) k(key)
 left join nptc_private.students s on s.workshop_id=w
 cross join lateral (select k.key,case k.key when 'q1' then s.q1_score when 'q2' then s.q2_score when 'q3' then s.q3_score else s.q4_score end as score,
 case k.key when 'q1' then s.q1_rating when 'q2' then s.q2_rating when 'q3' then s.q3_rating else s.q4_rating end as rating) v
 group by v.key) t;
$$;
create or replace function public.nptc_teacher_data(requested_workshop uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare selected nptc_private.workshops; items jsonb; roster jsonb;
begin
 if not public.nptc_is_teacher() then raise exception '此帳號沒有老師權限。' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(w) order by w.created_at desc,w.id),'[]') into items from nptc_private.workshops w;
 select * into selected from nptc_private.workshops w order by (w.id=requested_workshop) desc nulls last,w.created_at desc,w.id limit 1;
 select coalesce(jsonb_agg(to_jsonb(s) order by s.code,s.name),'[]') into roster from nptc_private.students s where s.workshop_id=selected.id;
 return jsonb_build_object('workshops',items,'selected',case when selected.id is null then null else to_jsonb(selected) end,'students',roster,'thresholds',case when selected.id is null then '[]'::jsonb else nptc_private.thresholds(selected.id) end);
end;$$;
create or replace function public.nptc_student_data() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception '請先登入。' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'code',s.code,'workshopName',w.name,'published',w.published,
 'updatedAt',case when w.published=1 then s.updated_at end,
 'grades',case when w.published=1 then jsonb_build_array(
 jsonb_build_object('key','q1','score',s.q1_score,'rating',s.q1_rating),jsonb_build_object('key','q2','score',s.q2_score,'rating',s.q2_rating),
 jsonb_build_object('key','q3','score',s.q3_score,'rating',s.q3_rating),jsonb_build_object('key','q4','score',s.q4_score,'rating',s.q4_rating)) else '[]'::jsonb end,
 'thresholds',case when w.published=1 then nptc_private.thresholds(w.id) else '[]'::jsonb end) order by w.created_at desc,w.id),'[]') into result
 from nptc_private.students s join nptc_private.workshops w on w.id=s.workshop_id where s.email=lower(auth.jwt()->>'email');
 return jsonb_build_object('records',result);
end;$$;
create or replace function public.nptc_teacher_write(body jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare action text:=body->>'action'; w nptc_private.workshops; sid uuid; affected integer; station text; g jsonb; score numeric; rating numeric;
begin
 if not public.nptc_is_teacher() then raise exception '此帳號沒有老師權限。' using errcode='42501'; end if;
 if action='createWorkshop' then
  if jsonb_typeof(body->'name') is distinct from 'string' then raise exception '請輸入梯次名稱。'; end if;
  insert into nptc_private.workshops(name) values(trim(body->>'name')) returning id into sid;return jsonb_build_object('id',sid);
 end if;
 -- 每個梯次序列化公布與修改，避免同時公布及寫入。
 select * into w from nptc_private.workshops where id=(body->>'workshopId')::uuid for update;
 if w.id is null then raise exception '找不到此梯次。'; end if;
 if action='publish' then
  if jsonb_typeof(body->'published') is distinct from 'boolean' then raise exception '公布狀態不正確。'; end if;
  if (body->>'published')::boolean and not exists(select 1 from nptc_private.students where workshop_id=w.id and (q1_score is not null or q2_score is not null or q3_score is not null or q4_score is not null)) then raise exception '至少登錄一筆成績後才能公布。'; end if;
  update nptc_private.workshops set published=case when (body->>'published')::boolean then 1 else 0 end where id=w.id;return '{"ok":true}';
 end if;
 if w.published=1 then raise exception '請先撤回公布，再修改名冊或成績。'; end if;
 if action not in ('saveStudent','saveScores') or action is null then raise exception '不支援的操作。'; end if;
 if body->>'id' is not null then
  if jsonb_typeof(body->'revision') is distinct from 'number' or (body->>'revision') !~ '^[0-9]+$' then raise exception '資料版本不正確。'; end if;
 end if;
 if action='saveStudent' then
  if jsonb_typeof(body->'name') is distinct from 'string' or jsonb_typeof(body->'email') is distinct from 'string' or jsonb_typeof(body->'code') is distinct from 'string' then raise exception '請完整填寫姓名、Email 與學號。'; end if;
  if body->>'id' is null then
   insert into nptc_private.students(workshop_id,name,email,code,updated_by) values(w.id,trim(body->>'name'),lower(trim(body->>'email')),trim(body->>'code'),auth.uid());
  else
   update nptc_private.students set name=trim(body->>'name'),email=lower(trim(body->>'email')),code=trim(body->>'code'),revision=revision+1,updated_at=now(),updated_by=auth.uid()
   where id=(body->>'id')::uuid and workshop_id=w.id and revision=(body->>'revision')::integer;
   get diagnostics affected=row_count;
   if affected=0 then raise exception '資料已更新，請重新載入後再編輯。'; end if;
  end if;
 else
  foreach station in array array['q1','q2','q3','q4'] loop
   g=body->'grades'->station;
   if g is null or jsonb_typeof(g) is distinct from 'object' or not(g ? 'score' and g ? 'rating') then raise exception '請提供四題成績。'; end if;
   if not(g->'score'='null'::jsonb and g->'rating'='null'::jsonb) then
    if jsonb_typeof(g->'score') is distinct from 'number' or jsonb_typeof(g->'rating') is distinct from 'number' then raise exception '分數與 Rating 請成對填寫數字或留空。'; end if;
    score=(g->>'score')::numeric;rating=(g->>'rating')::numeric;
    if score<0 or score>100 or rating<1 or rating>5 or rating<>trunc(rating) then raise exception '分數須為 0–100，Rating 須為 1–5 整數。'; end if;
   end if;
  end loop;
  update nptc_private.students set
   q1_score=(body#>>'{grades,q1,score}')::numeric,q1_rating=(body#>>'{grades,q1,rating}')::numeric::integer,
   q2_score=(body#>>'{grades,q2,score}')::numeric,q2_rating=(body#>>'{grades,q2,rating}')::numeric::integer,
   q3_score=(body#>>'{grades,q3,score}')::numeric,q3_rating=(body#>>'{grades,q3,rating}')::numeric::integer,
   q4_score=(body#>>'{grades,q4,score}')::numeric,q4_rating=(body#>>'{grades,q4,rating}')::numeric::integer,
   revision=revision+1,updated_at=now(),updated_by=auth.uid()
   where id=(body->>'id')::uuid and workshop_id=w.id and revision=(body->>'revision')::integer;
  get diagnostics affected=row_count;
  if affected=0 then raise exception '資料已更新，請重新載入後再編輯。'; end if;
 end if;
 return '{"ok":true}';
exception when unique_violation then raise exception '此梯次已有相同的學號或 Email。';
 when check_violation or not_null_violation then raise exception '欄位格式或範圍不正確，請確認姓名、Email、學號與成績。';
end;$$;
revoke all on function public.nptc_is_teacher() from public,anon;
revoke all on function public.nptc_teacher_data(uuid) from public,anon;
revoke all on function public.nptc_student_data() from public,anon;
revoke all on function public.nptc_teacher_write(jsonb) from public,anon;
revoke all on function nptc_private.thresholds(uuid) from public,anon,authenticated;
grant execute on function public.nptc_is_teacher(),public.nptc_teacher_data(uuid),public.nptc_student_data(),public.nptc_teacher_write(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
