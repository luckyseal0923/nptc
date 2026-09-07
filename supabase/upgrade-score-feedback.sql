-- 在已執行 setup.sql 與 upgrade-workshop-management.sql 的專案中執行本檔。
begin;

alter table nptc_private.students
  add column if not exists q1_feedback text not null default '' check(length(q1_feedback)<=500),
  add column if not exists q2_feedback text not null default '' check(length(q2_feedback)<=500),
  add column if not exists q3_feedback text not null default '' check(length(q3_feedback)<=500),
  add column if not exists q4_feedback text not null default '' check(length(q4_feedback)<=500);

create or replace function public.nptc_teacher_batch_scores(body jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare w nptc_private.workshops; station text:=body->>'station'; item jsonb; score numeric; rating numeric; feedback text; affected integer;
begin
 if not public.nptc_is_teacher() then raise exception '此帳號沒有老師權限。' using errcode='42501'; end if;
 if jsonb_typeof(body->'workshopId') is distinct from 'string' or jsonb_typeof(body->'items') is distinct from 'array' or jsonb_array_length(body->'items')=0 or station not in ('q1','q2','q3','q4') then raise exception '批次成績資料格式不正確。'; end if;
 select * into w from nptc_private.workshops where id=(body->>'workshopId')::uuid for update;
 if w.id is null then raise exception '找不到此梯次。'; end if;
 if w.published=1 then raise exception '請先撤回公布，再修改成績。'; end if;
 for item in select value from jsonb_array_elements(body->'items') loop
  if jsonb_typeof(item->'id') is distinct from 'string' or jsonb_typeof(item->'revision') is distinct from 'number' or jsonb_typeof(item->'feedback') is distinct from 'string' then raise exception '學員成績資料格式不正確。'; end if;
  feedback=trim(item->>'feedback');
  if length(feedback)>500 then raise exception '質性回饋最多 500 字。'; end if;
  if not(item->'score'='null'::jsonb and item->'rating'='null'::jsonb) then
   if jsonb_typeof(item->'score') is distinct from 'number' or jsonb_typeof(item->'rating') is distinct from 'number' then raise exception '分數與 Rating 請成對填寫數字或留空。'; end if;
   score=(item->>'score')::numeric; rating=(item->>'rating')::numeric;
   if score<0 or score>100 or rating<1 or rating>5 or rating<>trunc(rating) then raise exception '分數須為 0–100，Rating 須為 1–5 整數。'; end if;
  else score=null; rating=null; end if;
  if station='q1' then update nptc_private.students set q1_score=score,q1_rating=rating,q1_feedback=feedback,revision=revision+1,updated_at=now(),updated_by=auth.uid() where id=(item->>'id')::uuid and workshop_id=w.id and revision=(item->>'revision')::integer;
  elsif station='q2' then update nptc_private.students set q2_score=score,q2_rating=rating,q2_feedback=feedback,revision=revision+1,updated_at=now(),updated_by=auth.uid() where id=(item->>'id')::uuid and workshop_id=w.id and revision=(item->>'revision')::integer;
  elsif station='q3' then update nptc_private.students set q3_score=score,q3_rating=rating,q3_feedback=feedback,revision=revision+1,updated_at=now(),updated_by=auth.uid() where id=(item->>'id')::uuid and workshop_id=w.id and revision=(item->>'revision')::integer;
  else update nptc_private.students set q4_score=score,q4_rating=rating,q4_feedback=feedback,revision=revision+1,updated_at=now(),updated_by=auth.uid() where id=(item->>'id')::uuid and workshop_id=w.id and revision=(item->>'revision')::integer;
  end if;
  get diagnostics affected=row_count;
  if affected=0 then raise exception '資料已更新，請重新載入後再編輯。'; end if;
 end loop;
 return '{"ok":true}';
end;$$;

-- 公布後，學員可看到老師對自己的回饋。
create or replace function public.nptc_student_data() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception '請先登入。' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',s.id,'name',s.name,'national_id',s.national_id,'workshopName',w.name,'published',w.published,
  'stations',case when w.published=1 then w.stations else '[]'::jsonb end,
  'updatedAt',case when w.published=1 then s.updated_at end,
  'grades',case when w.published=1 then jsonb_build_array(
   jsonb_build_object('key','q1','score',s.q1_score,'rating',s.q1_rating,'feedback',s.q1_feedback),jsonb_build_object('key','q2','score',s.q2_score,'rating',s.q2_rating,'feedback',s.q2_feedback),
   jsonb_build_object('key','q3','score',s.q3_score,'rating',s.q3_rating,'feedback',s.q3_feedback),jsonb_build_object('key','q4','score',s.q4_score,'rating',s.q4_rating,'feedback',s.q4_feedback)) else '[]'::jsonb end,
  'thresholds',case when w.published=1 then nptc_private.thresholds(w.id) else '[]'::jsonb end
 ) order by w.created_at desc,w.id),'[]') into result
 from nptc_private.students s join nptc_private.workshops w on w.id=s.workshop_id
 where s.email=lower(auth.jwt()->>'email');
 return jsonb_build_object('records',result);
end;$$;

revoke all on function public.nptc_teacher_batch_scores(jsonb) from public,anon;
revoke all on function public.nptc_student_data() from public,anon;
grant execute on function public.nptc_teacher_batch_scores(jsonb),public.nptc_student_data() to authenticated;
notify pgrst,'reload schema';
commit;
