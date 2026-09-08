-- 在 upgrade-student-profile.sql 之後執行：不限題數、逐題公告的 OSCE 題目與成績。
begin;

alter table nptc_private.workshops add column if not exists published_stations jsonb not null default '[]'::jsonb;
create table if not exists nptc_private.station_grades (
 student_id uuid not null references nptc_private.students(id) on delete cascade,
 station_key text not null check(length(station_key) between 1 and 100),
 score numeric check(score between 0 and 100),
 rating integer check(rating between 1 and 5),
 feedback text not null default '' check(length(feedback)<=500),
 updated_at timestamptz not null default now(),
 updated_by uuid,
 primary key(student_id,station_key),
 check((score is null and rating is null) or (score is not null and rating is not null))
);
alter table nptc_private.station_grades enable row level security;
revoke all on nptc_private.station_grades from public,anon,authenticated;

-- 將既有四站成績帶入新資料表，重複執行不會覆寫新資料。
insert into nptc_private.station_grades(student_id,station_key,score,rating,feedback,updated_at,updated_by)
select s.id,v.station_key,v.score,v.rating,coalesce(v.feedback,''),s.updated_at,s.updated_by
from nptc_private.students s cross join lateral (values
 ('q1',s.q1_score,s.q1_rating,s.q1_feedback),('q2',s.q2_score,s.q2_rating,s.q2_feedback),('q3',s.q3_score,s.q3_rating,s.q3_feedback),('q4',s.q4_score,s.q4_rating,s.q4_feedback)
) v(station_key,score,rating,feedback) where v.score is not null
on conflict(student_id,station_key) do nothing;

-- 既有已公布梯次改為四題均已公告；新梯次由逐題公告管理。
update nptc_private.workshops set published_stations=coalesce(nullif(published_stations,'[]'::jsonb),stations) where published=1 and jsonb_array_length(published_stations)=0;
update nptc_private.workshops set published_stations=(select coalesce(jsonb_agg(jsonb_build_object('key',x->>'key')),'[]'::jsonb) from jsonb_array_elements(stations) x) where published=1 and jsonb_array_length(published_stations)>0;

create or replace function nptc_private.dynamic_thresholds(w uuid, visible_only boolean default false) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('key',q.key,'value',q.value,'count',q.n) order by q.ord),'[]'::jsonb) from (
  select x.value->>'key' key, x.ordinality ord, avg(g.score) filter(where g.rating=3) value, count(g.score) filter(where g.rating=3) n
  from nptc_private.workshops wk cross join lateral jsonb_array_elements(wk.stations) with ordinality x(value,ordinality)
  left join nptc_private.station_grades g on g.station_key=x.value->>'key' and g.student_id in (select id from nptc_private.students where workshop_id=wk.id)
  where wk.id=w and (not visible_only or exists(select 1 from jsonb_array_elements(wk.published_stations) p where p->>'key'=x.value->>'key'))
  group by x.value,x.ordinality
 ) q;
$$;

create or replace function public.nptc_teacher_data(requested_workshop uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare selected nptc_private.workshops; items jsonb; roster jsonb;
begin
 if not public.nptc_is_teacher() then raise exception '此帳號沒有老師權限。' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(w) || jsonb_build_object('publishedStations',coalesce((select jsonb_agg(p->>'key') from jsonb_array_elements(w.published_stations) p),'[]'::jsonb)) order by w.created_at desc,w.id),'[]'::jsonb) into items from nptc_private.workshops w;
 select * into selected from nptc_private.workshops w order by (w.id=requested_workshop) desc nulls last,w.created_at desc,w.id limit 1;
 select coalesce(jsonb_agg(to_jsonb(s) || coalesce((select jsonb_object_agg(g.station_key||'_score',g.score) from nptc_private.station_grades g where g.student_id=s.id),'{}'::jsonb) || coalesce((select jsonb_object_agg(g.station_key||'_rating',g.rating) from nptc_private.station_grades g where g.student_id=s.id),'{}'::jsonb) || coalesce((select jsonb_object_agg(g.station_key||'_feedback',g.feedback) from nptc_private.station_grades g where g.student_id=s.id),'{}'::jsonb) order by s.phone,s.name),'[]'::jsonb) into roster from nptc_private.students s where s.workshop_id=selected.id;
 return jsonb_build_object('workshops',items,'selected',case when selected.id is null then null else to_jsonb(selected) || jsonb_build_object('publishedStations',coalesce((select jsonb_agg(p->>'key') from jsonb_array_elements(selected.published_stations) p),'[]'::jsonb)) end,'students',roster,'thresholds',case when selected.id is null then '[]'::jsonb else nptc_private.dynamic_thresholds(selected.id) end);
end;$$;

create or replace function public.nptc_teacher_save_stations(body jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare w nptc_private.workshops; item jsonb; seen text[]:='{}'; key text;
begin
 if not public.nptc_is_teacher() then raise exception '此帳號沒有老師權限。' using errcode='42501'; end if;
 if jsonb_typeof(body->'workshopId') is distinct from 'string' or jsonb_typeof(body->'stations') is distinct from 'array' or jsonb_array_length(body->'stations')=0 then raise exception '請至少新增一題 OSCE 題目。'; end if;
 select * into w from nptc_private.workshops where id=(body->>'workshopId')::uuid for update;
 if w.id is null then raise exception '找不到此梯次。'; end if;
 for item in select value from jsonb_array_elements(body->'stations') loop
  key=trim(item->>'key');
  if key='' or key=any(seen) or jsonb_typeof(item->'title') is distinct from 'string' or length(trim(item->>'title'))=0 or jsonb_typeof(item->'testDate') is distinct from 'string' or (item->>'testDate') !~ '^\\d{4}-\\d{2}-\\d{2}$' or jsonb_typeof(item->'complaint') is distinct from 'string' or length(trim(item->>'complaint'))=0 or jsonb_typeof(item->'diagnosis') is distinct from 'string' or length(trim(item->>'diagnosis'))=0 or jsonb_typeof(item->'prompt') is distinct from 'string' or length(trim(item->>'prompt'))=0 then raise exception '每題須完成題目名稱、測驗日期、個案主訴、最終診斷與命題內容摘要。'; end if;
  seen=array_append(seen,key);
 end loop;
 if exists(select 1 from jsonb_array_elements(w.published_stations) p where not (p->>'key'=any(seen))) then raise exception '已公告題目不能刪除；請先撤回公告。'; end if;
 update nptc_private.workshops set stations=body->'stations' where id=w.id;
 return '{"ok":true}';
end;$$;

create or replace function public.nptc_teacher_batch_scores_v2(body jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare w nptc_private.workshops; item jsonb; station text:=body->>'station'; score numeric; rating integer; affected integer;
begin
 if not public.nptc_is_teacher() then raise exception '此帳號沒有老師權限。' using errcode='42501'; end if;
 if jsonb_typeof(body->'workshopId') is distinct from 'string' or jsonb_typeof(body->'items') is distinct from 'array' or jsonb_array_length(body->'items')=0 then raise exception '批次成績資料格式不正確。'; end if;
 select * into w from nptc_private.workshops where id=(body->>'workshopId')::uuid for update;
 if not exists(select 1 from jsonb_array_elements(w.stations) x where x->>'key'=station) then raise exception '找不到指定題目。'; end if;
 if exists(select 1 from jsonb_array_elements(w.published_stations) x where x->>'key'=station) then raise exception '請先撤回本題公告，再修改成績。'; end if;
 for item in select value from jsonb_array_elements(body->'items') loop
  if jsonb_typeof(item->'id') is distinct from 'string' or jsonb_typeof(item->'revision') is distinct from 'number' then raise exception '學員成績資料格式不正確。'; end if;
  if not(item->'score'='null'::jsonb and item->'rating'='null'::jsonb) then score=(item->>'score')::numeric; rating=(item->>'rating')::integer; if score<0 or score>100 or rating not between 1 and 5 then raise exception '分數須為 0–100，Rating 須為 1–5。'; end if; else score=null;rating=null;end if;
  insert into nptc_private.station_grades(student_id,station_key,score,rating,feedback,updated_at,updated_by) values((item->>'id')::uuid,station,score,rating,trim(coalesce(item->>'feedback','')),now(),auth.uid()) on conflict(student_id,station_key) do update set score=excluded.score,rating=excluded.rating,feedback=excluded.feedback,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
  update nptc_private.students set revision=revision+1,updated_at=now(),updated_by=auth.uid() where id=(item->>'id')::uuid and workshop_id=w.id and revision=(item->>'revision')::integer; get diagnostics affected=row_count; if affected=0 then raise exception '資料已更新，請重新載入後再編輯。'; end if;
 end loop;
 return '{"ok":true}';
end;$$;

create or replace function public.nptc_teacher_publish_station(body jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare w nptc_private.workshops; station text:=body->>'station'; should_publish boolean:=(body->>'published')::boolean;
begin
 if not public.nptc_is_teacher() then raise exception '此帳號沒有老師權限。' using errcode='42501'; end if;
 select * into w from nptc_private.workshops where id=(body->>'workshopId')::uuid for update;
 if not exists(select 1 from jsonb_array_elements(w.stations) x where x->>'key'=station) then raise exception '找不到指定題目。'; end if;
 if should_publish and not exists(select 1 from nptc_private.station_grades g join nptc_private.students s on s.id=g.student_id where s.workshop_id=w.id and g.station_key=station and g.score is not null) then raise exception '本題至少要有一筆已登錄成績才能公布。'; end if;
 update nptc_private.workshops set published_stations=case when should_publish then (select coalesce(jsonb_agg(distinct jsonb_build_object('key',v)),'[]'::jsonb) from unnest(array_append(array(select p->>'key' from jsonb_array_elements(published_stations) p),station)) v) else (select coalesce(jsonb_agg(p),'[]'::jsonb) from jsonb_array_elements(published_stations) p where p->>'key'<>station) end,published=0 where id=w.id;
 return '{"ok":true}';
end;$$;

create or replace function public.nptc_student_data() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception '請先登入。' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'email',s.email,'phone',s.phone,'workshopName',w.name,'published',case when jsonb_array_length(w.published_stations)>0 then 1 else 0 end,'profile',jsonb_build_object('nursingYears',s.nursing_years,'hospital',coalesce(s.hospital,''),'unit',coalesce(s.unit,''),'examSpecialty',coalesce(s.exam_specialty,''),'firstOsce',s.first_osce,'birthDate',coalesce(s.birth_date::text,'')),'stations',coalesce((select jsonb_agg(x.value order by x.ordinality) from jsonb_array_elements(w.stations) with ordinality x(value,ordinality) where exists(select 1 from jsonb_array_elements(w.published_stations) p where p->>'key'=x.value->>'key')),'[]'::jsonb),'updatedAt',s.updated_at,'grades',coalesce((select jsonb_agg(jsonb_build_object('key',g.station_key,'score',g.score,'rating',g.rating,'feedback',g.feedback)) from nptc_private.station_grades g where g.student_id=s.id and exists(select 1 from jsonb_array_elements(w.published_stations) p where p->>'key'=g.station_key)),'[]'::jsonb),'thresholds',nptc_private.dynamic_thresholds(w.id,true)) order by w.created_at desc,w.id),'[]'::jsonb) into result from nptc_private.students s join nptc_private.workshops w on w.id=s.workshop_id where s.email=lower(auth.jwt()->>'email');
 return jsonb_build_object('records',result);
end;$$;

revoke all on function public.nptc_teacher_save_stations(jsonb),public.nptc_teacher_batch_scores_v2(jsonb),public.nptc_teacher_publish_station(jsonb) from public,anon;
grant execute on function public.nptc_teacher_save_stations(jsonb),public.nptc_teacher_batch_scores_v2(jsonb),public.nptc_teacher_publish_station(jsonb),public.nptc_teacher_data(uuid),public.nptc_student_data() to authenticated;
notify pgrst,'reload schema';
commit;
