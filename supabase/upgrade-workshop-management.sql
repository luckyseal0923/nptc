-- 在已執行 setup.sql 的專案中執行本檔，加入題目設定與批次匯入功能。
begin;

alter table nptc_private.workshops
  add column if not exists stations jsonb not null default '[
    {"key":"q1","day":1,"title":"第一題","prompt":""},
    {"key":"q2","day":1,"title":"第二題","prompt":""},
    {"key":"q3","day":2,"title":"第一題","prompt":""},
    {"key":"q4","day":2,"title":"第二題","prompt":""}
  ]'::jsonb;

-- 學員僅於成績公布後取得本站題目內容。
create or replace function public.nptc_student_data() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception '請先登入。' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',s.id,'name',s.name,'code',s.code,'workshopName',w.name,'published',w.published,
  'stations',case when w.published=1 then w.stations else '[]'::jsonb end,
  'updatedAt',case when w.published=1 then s.updated_at end,
  'grades',case when w.published=1 then jsonb_build_array(
    jsonb_build_object('key','q1','score',s.q1_score,'rating',s.q1_rating),jsonb_build_object('key','q2','score',s.q2_score,'rating',s.q2_rating),
    jsonb_build_object('key','q3','score',s.q3_score,'rating',s.q3_rating),jsonb_build_object('key','q4','score',s.q4_score,'rating',s.q4_rating)) else '[]'::jsonb end,
  'thresholds',case when w.published=1 then nptc_private.thresholds(w.id) else '[]'::jsonb end
 ) order by w.created_at desc,w.id),'[]') into result
 from nptc_private.students s join nptc_private.workshops w on w.id=s.workshop_id
 where s.email=lower(auth.jwt()->>'email');
 return jsonb_build_object('records',result);
end;$$;

-- 批次匯入時傳入 [{"code":"A001","name":"王小明","email":"student@example.com"}]。
create or replace function public.nptc_teacher_write(body jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare action text:=body->>'action'; w nptc_private.workshops; sid uuid; affected integer; station text; g jsonb; score numeric; rating numeric; row_item jsonb;
begin
 if not public.nptc_is_teacher() then raise exception '此帳號沒有老師權限。' using errcode='42501'; end if;
 if action='createWorkshop' then
  if jsonb_typeof(body->'name') is distinct from 'string' then raise exception '請輸入梯次名稱。'; end if;
  insert into nptc_private.workshops(name) values(trim(body->>'name')) returning id into sid;
  return jsonb_build_object('id',sid);
 end if;
 select * into w from nptc_private.workshops where id=(body->>'workshopId')::uuid for update;
 if w.id is null then raise exception '找不到此梯次。'; end if;
 if action='publish' then
  if jsonb_typeof(body->'published') is distinct from 'boolean' then raise exception '公布狀態不正確。'; end if;
  if (body->>'published')::boolean and not exists(select 1 from nptc_private.students where workshop_id=w.id and (q1_score is not null or q2_score is not null or q3_score is not null or q4_score is not null)) then raise exception '至少登錄一筆成績後才能公布。'; end if;
  update nptc_private.workshops set published=case when (body->>'published')::boolean then 1 else 0 end where id=w.id;
  return '{"ok":true}';
 end if;
 if w.published=1 then raise exception '請先撤回公布，再修改名冊、題目或成績。'; end if;
 if action='saveStations' then
  if jsonb_typeof(body->'stations') is distinct from 'array' or jsonb_array_length(body->'stations')<>4 then raise exception '請完整填寫四題題目資料。'; end if;
  foreach station in array array['q1','q2','q3','q4'] loop
   select value into g from jsonb_array_elements(body->'stations') where value->>'key'=station limit 1;
   if g is null or jsonb_typeof(g->'title') is distinct from 'string' or length(trim(g->>'title'))=0 or length(trim(g->>'title'))>100 or jsonb_typeof(g->'prompt') is distinct from 'string' or length(g->>'prompt')>2000 then raise exception '題目資料格式不正確。'; end if;
  end loop;
  update nptc_private.workshops set stations=body->'stations' where id=w.id;
  return '{"ok":true}';
 end if;
 if action='bulkImportStudents' then
  if jsonb_typeof(body->'students') is distinct from 'array' or jsonb_array_length(body->'students')=0 then raise exception '請至少提供一位學員。'; end if;
  for row_item in select value from jsonb_array_elements(body->'students') loop
   if jsonb_typeof(row_item->'name') is distinct from 'string' or jsonb_typeof(row_item->'email') is distinct from 'string' or jsonb_typeof(row_item->'code') is distinct from 'string' then raise exception '匯入資料需包含學號、姓名與 Email。'; end if;
   insert into nptc_private.students(workshop_id,name,email,code,updated_by)
     values(w.id,trim(row_item->>'name'),lower(trim(row_item->>'email')),trim(row_item->>'code'),auth.uid());
  end loop;
  return '{"ok":true}';
 end if;
 if action not in ('saveStudent','saveScores','deleteStudent') or action is null then raise exception '不支援的操作。'; end if;
 if body->>'id' is not null then
  if jsonb_typeof(body->'revision') is distinct from 'number' or (body->>'revision') !~ '^[0-9]+$' then raise exception '資料版本不正確。'; end if;
 end if;
 if action='deleteStudent' then
  if body->>'id' is null then raise exception '請指定欲刪除的學員。'; end if;
  delete from nptc_private.students where id=(body->>'id')::uuid and workshop_id=w.id and revision=(body->>'revision')::integer;
  get diagnostics affected=row_count;
  if affected=0 then raise exception '資料已更新或已被刪除，請重新載入。'; end if;
 elsif action='saveStudent' then
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

revoke all on function public.nptc_student_data() from public,anon;
revoke all on function public.nptc_teacher_write(jsonb) from public,anon;
grant execute on function public.nptc_student_data(),public.nptc_teacher_write(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
