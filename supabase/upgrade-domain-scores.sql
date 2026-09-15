-- 前置：dynamic-osce-stations、student-activation、roster-account-status 已完成。
-- 不改寫既有總分，不推算五面向分數。請整份執行，可重複執行。
begin;
do $$ begin
 if to_regprocedure('nptc_private.student_data_before_activation()') is null then raise exception '請先完成 student-activation 升級。'; end if;
end;$$;
alter table nptc_private.station_grades add column if not exists domain_scores jsonb;

create or replace function nptc_private.validate_domain_max(v jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare k text; total numeric:=0; n numeric;
begin
 if jsonb_typeof(v) is distinct from 'object' then raise exception '請設定五面向滿分。'; end if;
 if (select count(*) from jsonb_object_keys(v))<>5 then raise exception '配分必須包含五個指定面向。'; end if;
 foreach k in array array['currentHistory','pastHistory','ros','physicalExam','differentialDiagnosis'] loop
  if jsonb_typeof(v->k) is distinct from 'number' then raise exception '各面向滿分必須為數字。'; end if;
  n=(v->>k)::numeric;
  if n<=0 or n>100 or n<>round(n,2) then raise exception '各面向滿分須大於 0，最多兩位小數。'; end if;
  total=total+n;
 end loop;
 if total<>100 then raise exception '五個面向滿分合計必須為 100 分。'; end if;
 return v;
end;$$;
create or replace function nptc_private.domain_score_total(v jsonb,m jsonb) returns numeric
language plpgsql immutable set search_path='' as $$
declare k text; total numeric:=0; n numeric;
begin
 perform nptc_private.validate_domain_max(m);
 if jsonb_typeof(v) is distinct from 'object' then raise exception '請完整填寫五面向得分。'; end if;
 if (select count(*) from jsonb_object_keys(v))<>5 then raise exception '得分必須包含五個指定面向。'; end if;
 foreach k in array array['currentHistory','pastHistory','ros','physicalExam','differentialDiagnosis'] loop
  if jsonb_typeof(v->k) is distinct from 'number' then raise exception '請完整填寫五面向得分。'; end if;
  n=(v->>k)::numeric;
  if n<0 or n>(m->>k)::numeric or n<>round(n,2) then raise exception '面向得分不可低於 0 或超過滿分，最多兩位小數。'; end if;
  total=total+n;
 end loop;
 return total;
end;$$;
revoke all on function nptc_private.validate_domain_max(jsonb),nptc_private.domain_score_total(jsonb,jsonb) from public,anon,authenticated;

create or replace function public.nptc_teacher_save_stations_v3(body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w nptc_private.workshops; item jsonb; old_item jsonb; seen text[]:='{}'; v_station_key text; cleaned jsonb:='[]';
begin
 if not public.nptc_is_teacher() then raise exception '此帳號沒有老師權限。' using errcode='42501'; end if;
 if jsonb_typeof(body->'workshopId') is distinct from 'string' or jsonb_typeof(body->'stations') is distinct from 'array' then raise exception '題目資料格式不正確。'; end if;
 if jsonb_array_length(body->'stations')=0 then raise exception '請至少新增一題 OSCE 題目。'; end if;
 select * into w from nptc_private.workshops where id=(body->>'workshopId')::uuid for update;
 if w.id is null then raise exception '找不到此梯次。'; end if;
 for item in select value from jsonb_array_elements(body->'stations') loop
  v_station_key=trim(item->>'key');
  if coalesce(length(v_station_key),0) not between 1 and 100 or v_station_key=any(seen)
   or jsonb_typeof(item->'title') is distinct from 'string' or coalesce(length(trim(item->>'title')),0) not between 1 and 100
   or jsonb_typeof(item->'testDate') is distinct from 'string' or coalesce(item->>'testDate','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   or jsonb_typeof(item->'complaint') is distinct from 'string' or coalesce(length(trim(item->>'complaint')),0) not between 1 and 300
   or jsonb_typeof(item->'diagnosis') is distinct from 'string' or coalesce(length(trim(item->>'diagnosis')),0) not between 1 and 300
   or jsonb_typeof(item->'prompt') is distinct from 'string' or coalesce(length(trim(item->>'prompt')),0) not between 1 and 2000 then raise exception '每題須完成題目名稱、有效日期、主訴、診斷與命題摘要。'; end if;
  perform (item->>'testDate')::date;
  select value into old_item from jsonb_array_elements(w.stations) where value->>'key'=v_station_key;
  if item->'domainMax' is not null and item->'domainMax'<>'null'::jsonb then
   perform nptc_private.validate_domain_max(item->'domainMax');
  elsif old_item is null or coalesce(length(trim(old_item->>'title')),0)=0 or (old_item->'domainMax' is not null and old_item->'domainMax'<>'null'::jsonb) then
   raise exception '新題目或已設定配分的題目必須填寫五面向滿分。';
  end if;
  if exists(select 1 from jsonb_array_elements(w.published_stations) p where p->>'key'=v_station_key) and item is distinct from old_item then raise exception '請先撤回本題公告，再修改題目。'; end if;
  if old_item->'domainMax' is distinct from item->'domainMax' and exists(select 1 from nptc_private.station_grades g join nptc_private.students s on s.id=g.student_id where s.workshop_id=w.id and g.station_key=v_station_key and g.domain_scores is not null) then raise exception '已有分項成績，不能變更配分；請建立新題目。'; end if;
  seen=array_append(seen,v_station_key);
  cleaned=cleaned||jsonb_build_array(item||jsonb_build_object('key',v_station_key));
 end loop;
 if exists(select 1 from jsonb_array_elements(w.published_stations) p where not(p->>'key'=any(seen))) or exists(select 1 from nptc_private.station_grades g join nptc_private.students s on s.id=g.student_id where s.workshop_id=w.id and g.score is not null and not(g.station_key=any(seen))) then raise exception '有成績或已公告的題目不可刪除。'; end if;
 update nptc_private.workshops set stations=cleaned where id=w.id;
 return '{"ok":true}';
end;$$;
create or replace function public.nptc_teacher_save_stations(body jsonb) returns jsonb
language sql security definer set search_path='' as $$select public.nptc_teacher_save_stations_v3(body)$$;

create or replace function public.nptc_teacher_batch_scores_v3(body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w nptc_private.workshops; item jsonb; v_station_key text:=body->>'station'; definition jsonb; total numeric; rating_value integer; domains jsonb; affected integer; seen uuid[]:='{}'; student_uuid uuid;
begin
 if not public.nptc_is_teacher() then raise exception '此帳號沒有老師權限。' using errcode='42501'; end if;
 if jsonb_typeof(body->'workshopId') is distinct from 'string' or jsonb_typeof(body->'items') is distinct from 'array' then raise exception '成績資料格式不正確。'; end if;
 if jsonb_array_length(body->'items')=0 then raise exception '請選擇要儲存的學員。'; end if;
 select * into w from nptc_private.workshops where id=(body->>'workshopId')::uuid for update;
 select value into definition from jsonb_array_elements(w.stations) where value->>'key'=v_station_key;
 if definition is null then raise exception '找不到指定題目。'; end if;
 perform nptc_private.validate_domain_max(definition->'domainMax');
 if exists(select 1 from jsonb_array_elements(w.published_stations) p where p->>'key'=v_station_key) then raise exception '請先撤回本題公告，再修改成績。'; end if;
 for item in select value from jsonb_array_elements(body->'items') loop
  if jsonb_typeof(item->'id') is distinct from 'string' or jsonb_typeof(item->'revision') is distinct from 'number' or not(item ? 'domains') or not(item ? 'rating') then raise exception '請使用五面向成績表完整輸入。'; end if;
  if (item->>'revision')::numeric<>trunc((item->>'revision')::numeric) then raise exception '資料版本不正確。'; end if;
  student_uuid=(item->>'id')::uuid;
  if student_uuid=any(seen) then raise exception '批次學員不可重複。'; end if;
  seen=array_append(seen,student_uuid);
  domains=item->'domains';
  if domains='null'::jsonb and item->'rating'='null'::jsonb then total=null;rating_value=null;domains=null;
  else
   total=nptc_private.domain_score_total(domains,definition->'domainMax');
   if jsonb_typeof(item->'rating') is distinct from 'number' then raise exception 'Global Rating 須為 1–5 的整數。'; end if;
   if (item->>'rating')::numeric not between 1 and 5 or (item->>'rating')::numeric<>trunc((item->>'rating')::numeric) then raise exception 'Global Rating 須為 1–5 的整數。'; end if;
   rating_value=(item->>'rating')::integer;
  end if;
  update nptc_private.students set revision=revision+1,updated_at=now(),updated_by=auth.uid() where id=student_uuid and workshop_id=w.id and revision=(item->>'revision')::integer;
  get diagnostics affected=row_count;
  if affected=0 then raise exception '學員不在本梯次或資料已更新，請重新載入。'; end if;
  insert into nptc_private.station_grades(student_id,station_key,score,rating,domain_scores,feedback,updated_at,updated_by)
  values(student_uuid,v_station_key,total,rating_value,domains,trim(coalesce(item->>'feedback','')),now(),auth.uid())
  on conflict(student_id,station_key) do update set score=excluded.score,rating=excluded.rating,domain_scores=excluded.domain_scores,feedback=excluded.feedback,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
 end loop;
 return '{"ok":true}';
end;$$;
create or replace function public.nptc_teacher_batch_scores_v2(body jsonb) returns jsonb
language sql security definer set search_path='' as $$select public.nptc_teacher_batch_scores_v3(body)$$;
revoke all on function public.nptc_teacher_save_stations_v3(jsonb),public.nptc_teacher_save_stations(jsonb),public.nptc_teacher_batch_scores_v3(jsonb),public.nptc_teacher_batch_scores_v2(jsonb) from public,anon;
grant execute on function public.nptc_teacher_save_stations_v3(jsonb),public.nptc_teacher_save_stations(jsonb),public.nptc_teacher_batch_scores_v3(jsonb),public.nptc_teacher_batch_scores_v2(jsonb) to authenticated;

create or replace function public.nptc_teacher_data(requested_workshop uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare selected nptc_private.workshops; items jsonb; roster jsonb;
begin
 if not public.nptc_is_teacher() then raise exception '此帳號沒有老師權限。' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(w) || jsonb_build_object('publishedStations',coalesce((select jsonb_agg(p->>'key') from jsonb_array_elements(w.published_stations) p),'[]'::jsonb)) order by w.created_at desc,w.id),'[]'::jsonb) into items from nptc_private.workshops w;
 select * into selected from nptc_private.workshops w order by (w.id=requested_workshop) desc nulls last,w.created_at desc,w.id limit 1;
 select coalesce(jsonb_agg(to_jsonb(s) || coalesce((select jsonb_object_agg(g.station_key||'_domains',g.domain_scores) from nptc_private.station_grades g where g.student_id=s.id),'{}'::jsonb) || jsonb_build_object('account_registered',exists(select 1 from auth.users u where lower(trim(u.email))=lower(trim(s.email))),'account_activated_at',(select a.activated_at from nptc_private.student_accounts a join auth.users u on u.id=a.user_id and lower(trim(u.email))=lower(trim(a.email)) where lower(trim(a.email))=lower(trim(s.email)) limit 1)) || coalesce((select jsonb_object_agg(g.station_key||'_score',g.score) from nptc_private.station_grades g where g.student_id=s.id),'{}'::jsonb) || coalesce((select jsonb_object_agg(g.station_key||'_rating',g.rating) from nptc_private.station_grades g where g.student_id=s.id),'{}'::jsonb) || coalesce((select jsonb_object_agg(g.station_key||'_feedback',g.feedback) from nptc_private.station_grades g where g.student_id=s.id),'{}'::jsonb) order by s.phone,s.name),'[]'::jsonb) into roster from nptc_private.students s where s.workshop_id=selected.id;
 return jsonb_build_object('workshops',items,'selected',case when selected.id is null then null else to_jsonb(selected) || jsonb_build_object('publishedStations',coalesce((select jsonb_agg(p->>'key') from jsonb_array_elements(selected.published_stations) p),'[]'::jsonb)) end,'students',roster,'thresholds',case when selected.id is null then '[]'::jsonb else nptc_private.dynamic_thresholds(selected.id) end);
end;$$;
create or replace function nptc_private.student_data_before_activation() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception '請先登入。' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'email',s.email,'phone',s.phone,'workshopName',w.name,'published',case when jsonb_array_length(w.published_stations)>0 then 1 else 0 end,'profile',jsonb_build_object('nursingYears',s.nursing_years,'hospital',coalesce(s.hospital,''),'unit',coalesce(s.unit,''),'examSpecialty',coalesce(s.exam_specialty,''),'firstOsce',s.first_osce,'birthDate',coalesce(s.birth_date::text,'')),'stations',coalesce((select jsonb_agg(x.value order by x.ordinality) from jsonb_array_elements(w.stations) with ordinality x(value,ordinality) where exists(select 1 from jsonb_array_elements(w.published_stations) p where p->>'key'=x.value->>'key')),'[]'::jsonb),'updatedAt',s.updated_at,'grades',coalesce((select jsonb_agg(jsonb_build_object('key',g.station_key,'score',g.score,'rating',g.rating,'feedback',g.feedback,'domains',g.domain_scores)) from nptc_private.station_grades g where g.student_id=s.id and exists(select 1 from jsonb_array_elements(w.published_stations) p where p->>'key'=g.station_key)),'[]'::jsonb),'thresholds',nptc_private.dynamic_thresholds(w.id,true)) order by w.created_at desc,w.id),'[]'::jsonb) into result from nptc_private.students s join nptc_private.workshops w on w.id=s.workshop_id where s.email=lower(auth.jwt()->>'email');
 return jsonb_build_object('records',result);
end;$$;
revoke all on function nptc_private.student_data_before_activation() from public,anon,authenticated;
revoke all on function public.nptc_teacher_data(uuid) from public,anon;
grant execute on function public.nptc_teacher_data(uuid) to authenticated;
-- 關閉舊版直接輸入總分的入口，保留名冊等其他寫入操作。
do $$ begin
 if to_regprocedure('nptc_private.teacher_write_before_domains(jsonb)') is null then
  alter function public.nptc_teacher_write(jsonb) set schema nptc_private;
  alter function nptc_private.nptc_teacher_write(jsonb) rename to teacher_write_before_domains;
 end if;
end;$$;
revoke all on function nptc_private.teacher_write_before_domains(jsonb) from public,anon,authenticated;
create or replace function public.nptc_teacher_write(body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.nptc_is_teacher() then raise exception '此帳號沒有老師權限。' using errcode='42501'; end if;
 if body->>'action'='saveScores' then raise exception '請使用五面向成績表，總分由系統加總。'; end if;
 return nptc_private.teacher_write_before_domains(body);
end;$$;
revoke all on function public.nptc_teacher_write(jsonb) from public,anon;
grant execute on function public.nptc_teacher_write(jsonb) to authenticated;
revoke all on function public.nptc_teacher_batch_scores(jsonb) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
