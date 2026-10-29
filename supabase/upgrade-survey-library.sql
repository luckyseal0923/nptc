-- 量表庫與獨立問卷連結。先安裝 upgrade-surveys.sql，再執行本檔。
-- 保留原始作答，將舊前後測類別移至教師備註；之後不再以類別控制填寫。
begin;
do $$ begin
 if to_regclass('nptc_private.survey_assignments') is null then raise exception '請先安裝 upgrade-surveys.sql。'; end if;
end;$$;

drop trigger if exists nptc_survey_assignment_guard on nptc_private.survey_assignments;
alter table nptc_private.survey_assignments add column if not exists note text not null default '';
alter table nptc_private.survey_assignments add column if not exists request_id uuid;
alter table nptc_private.survey_assignments alter column phase drop not null;
alter table nptc_private.survey_assignments drop constraint if exists survey_assignments_workshop_id_scale_code_phase_key;
update nptc_private.survey_assignments set note=case when note<>'' then note when phase='pre' then '前測' when phase='post' then '後測' else '' end,phase=null where phase is not null;
create unique index if not exists survey_assignment_requests on nptc_private.survey_assignments(created_by,request_id) where request_id is not null;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='nptc_survey_note_length' and conrelid='nptc_private.survey_assignments'::regclass) then
  alter table nptc_private.survey_assignments add constraint nptc_survey_note_length check(length(note)<=2000);
 end if;
end;$$;

create or replace function nptc_private.survey_validate_definition(d jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare n integer; mn integer; mx integer; indices jsonb; dimension text;
begin
 if jsonb_typeof(d) is distinct from 'object' or octet_length(d::text)>256000 then raise exception '量表內容格式或大小不正確。'; end if;
 if jsonb_typeof(d->'code') is distinct from 'string' or jsonb_typeof(d->'version') is distinct from 'string' or coalesce(d->>'code','') !~ '^[a-zA-Z0-9_-]{1,80}$' or length(trim(coalesce(d->>'version',''))) not between 1 and 80 then raise exception '量表代碼或版本不正確。'; end if;
 if jsonb_typeof(d->'title') is distinct from 'string' or length(trim(d->>'title')) not between 1 and 150 or jsonb_typeof(d->'notice') is distinct from 'string' or length(d->>'notice')>1000 then raise exception '請填寫量表名稱，並確認註記長度。'; end if;
 if (d ? 'minScore' and jsonb_typeof(d->'minScore')<>'number') or (d ? 'maxScore' and jsonb_typeof(d->'maxScore')<>'number') or coalesce(d->>'minScore','1') !~ '^[0-9]+$' or coalesce(d->>'maxScore','6') !~ '^[0-9]+$' then raise exception '量尺必須為整數。'; end if;
 mn=coalesce(d->>'minScore','1')::integer; mx=coalesce(d->>'maxScore','6')::integer;
 if mn<0 or mx>10 or mn>=mx then raise exception '量尺須在 0 至 10 之間，且上限大於下限。'; end if;
 if jsonb_typeof(d->'instructions') is distinct from 'array' then raise exception '填答說明格式不正確。'; end if;
 if jsonb_array_length(d->'instructions')>50 or exists(select 1 from jsonb_array_elements(d->'instructions') p where jsonb_typeof(p)<>'string' or length(p#>>'{}')>2000) then raise exception '填答說明長度不正確。'; end if;
 if jsonb_typeof(d->'items') is distinct from 'array' then raise exception '請加入量表題目。'; end if;
 n=jsonb_array_length(d->'items');
 if n not between 1 and 200 then raise exception '量表需有 1 至 200 題。'; end if;
 if exists(select 1 from jsonb_array_elements(d->'items') q where jsonb_typeof(q)<>'object' or (
  (jsonb_typeof(q->'text')='string' and length(trim(q->>'text')) between 1 and 2000) or
  (jsonb_typeof(q->'left')='string' and length(trim(q->>'left')) between 1 and 2000 and jsonb_typeof(q->'right')='string' and length(trim(q->>'right')) between 1 and 2000)
 ) is not true) then raise exception '請填寫每一題的完整敘述。'; end if;
 indices=coalesce(d->'reverseItems','[]'::jsonb);
 if jsonb_typeof(indices) is distinct from 'array' then raise exception '反向計分題號不正確。'; end if;
 if exists(select 1 from jsonb_array_elements(indices) i where jsonb_typeof(i)<>'number' or i::text !~ '^[1-9][0-9]*$') then raise exception '反向計分題號需為正整數。'; end if;
 if exists(select 1 from jsonb_array_elements(indices) i where (i::text)::integer>n) or (select count(*)<>count(distinct i) from jsonb_array_elements(indices) i) then raise exception '反向計分題號超出範圍或重複。'; end if;
 if jsonb_typeof(coalesce(d->'dimensions','{}'::jsonb)) is distinct from 'object' then raise exception '構面格式不正確。'; end if;
 for dimension,indices in select key,value from jsonb_each(coalesce(d->'dimensions','{}'::jsonb)) loop
  if length(trim(dimension)) not between 1 and 80 or jsonb_typeof(indices) is distinct from 'array' then raise exception '構面名稱或題號不正確。'; end if;
  if exists(select 1 from jsonb_array_elements(indices) i where jsonb_typeof(i)<>'number' or i::text !~ '^[1-9][0-9]*$') then raise exception '構面題號需為正整數。'; end if;
  if exists(select 1 from jsonb_array_elements(indices) i where (i::text)::integer>n) or (select count(*)<>count(distinct i) from jsonb_array_elements(indices) i) then raise exception '構面題號超出範圍或重複。'; end if;
 end loop;
end;$$;

create or replace function nptc_private.survey_validate_answers(definition jsonb,answers jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare i integer; q jsonb; answer jsonb; item_type text; mn integer:=coalesce(definition->>'minScore','1')::integer; mx integer:=coalesce(definition->>'maxScore','6')::integer;
begin
 if jsonb_typeof(answers) is distinct from 'array' then raise exception '請提供完整作答。'; end if;
 if jsonb_array_length(answers)<>jsonb_array_length(definition->'items') then raise exception '請完成每一題必填作答。'; end if;
 for i in 0..jsonb_array_length(answers)-1 loop
  q=definition->'items'->i; answer=answers->i; item_type=coalesce(q->>'type','scale');
  if q->'required'='false'::jsonb and (answer='null'::jsonb or answer='""'::jsonb) then continue; end if;
  if item_type='text' then
   if jsonb_typeof(answer)<>'string' or length(trim(answer#>>'{}'))=0 or length(answer#>>'{}')>least(coalesce((q->>'maxLength')::integer,2000),4000) then raise exception '第 % 題文字內容或長度不正確。',i+1; end if;
  elsif item_type='choice' then
   if jsonb_typeof(answer)<>'string' or not coalesce(q->'options','[]'::jsonb) @> jsonb_build_array(answer#>>'{}') then raise exception '請選擇第 % 題的其中一個選項。',i+1; end if;
  elsif item_type='scale' then
   if jsonb_typeof(answer)<>'number' or answer::text !~ '^(0|[1-9][0-9]*)$' then raise exception '每題必須選擇量尺中的整數。'; end if;
   if (answer::text)::integer<mn or (answer::text)::integer>mx then raise exception '作答超出量尺範圍。'; end if;
  else raise exception '不支援的問卷題型。'; end if;
 end loop;
end;$$;

create or replace function nptc_private.survey_score(definition jsonb,answers jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare points jsonb:='[]'::jsonb; dims jsonb:='{}'::jsonb; result jsonb; mn integer:=coalesce(definition->>'minScore','1')::integer; mx integer:=coalesce(definition->>'maxScore','6')::integer;
 n integer; i integer; point_value integer; total integer:=0; dimension text; indices jsonb; subtotal integer;
begin
 perform nptc_private.survey_validate_answers(definition,answers);
 if definition->>'scoringStatus' in ('pending','unscored') then
  return jsonb_build_object('status',definition->>'scoringStatus','itemScores','[]'::jsonb,'total',null,'dimensions','{}'::jsonb);
 end if;
 if jsonb_typeof(answers) is distinct from 'array' then raise exception '請提供完整作答。'; end if;
 n=jsonb_array_length(definition->'items');
 if jsonb_array_length(answers)<>n then raise exception '請完成每一題。'; end if;
 if exists(select 1 from jsonb_array_elements(answers) a where jsonb_typeof(a)<>'number' or a::text !~ '^(0|[1-9][0-9]*)$') then raise exception '每題必須選擇量尺中的整數。'; end if;
 for i in 0..n-1 loop
  point_value=(answers->>i)::integer;
  if point_value<mn or point_value>mx then raise exception '作答超出量尺範圍。'; end if;
  if coalesce(definition->'reverseItems','[]'::jsonb) @> to_jsonb(i+1) then point_value=mn+mx-point_value; end if;
  points=points||jsonb_build_array(point_value); total=total+point_value;
 end loop;
 for dimension,indices in select key,value from jsonb_each(coalesce(definition->'dimensions','{}'::jsonb)) loop
  select coalesce(sum((points->>((j::text)::integer-1))::integer),0)::integer into subtotal from jsonb_array_elements(indices) j;
  dims=dims||jsonb_build_object(dimension,subtotal);
 end loop;
 result=jsonb_build_object('itemScores',points,'total',total,'dimensions',dims);
 if dims ? 'flexibility' then result=result||jsonb_build_object('flexibility',dims->'flexibility'); end if;
 if dims ? 'structure' then result=result||jsonb_build_object('structure',dims->'structure'); end if;
 return result;
end;$$;

create or replace function public.nptc_survey_library() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.nptc_is_teacher() then raise exception '此帳號沒有量表庫管理權限。' using errcode='42501'; end if;
 return jsonb_build_object('instruments',coalesce((select jsonb_agg(to_jsonb(i) order by i.definition->>'title',i.version desc) from nptc_private.survey_instruments i),'[]'::jsonb));
end;$$;

-- 依使用者要求先不提供量表新增／修訂入口；保留既有量表內容。
drop function if exists public.nptc_survey_library_save(jsonb);

create or replace function public.nptc_survey_create_pair(body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin raise exception '請重新整理頁面，從量表庫加入問卷。'; end;$$;

create or replace function public.nptc_survey_assign(body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare wid uuid:=(body->>'workshopId')::uuid; rid uuid:=(body->>'requestId')::uuid;
 d jsonb; a nptc_private.survey_assignments; memo text:=trim(coalesce(body->>'note','')); publication text:=coalesce(body->>'status','open');
begin
 perform nptc_private.survey_require_teacher(wid);
 perform 1 from nptc_private.workshops where id=wid and archived_at is null for update;
 if not found then raise exception '封存梯次不可加入問卷。'; end if;
 if rid is null or length(memo)>2000 or publication not in ('draft','open') then raise exception '問卷加入資料不正確。'; end if;
 select definition into d from nptc_private.survey_instruments where code=body->>'scaleCode' and version=body->>'scaleVersion';
 if d is null then raise exception '找不到選擇的量表版本。'; end if;
 select * into a from nptc_private.survey_assignments where created_by=auth.uid() and request_id=rid;
 if found then
  if a.workshop_id<>wid or a.scale_code<>d->>'code' or a.scale_version<>d->>'version' or a.note<>memo then raise exception '這個加入請求已使用，請重新選擇量表。'; end if;
  return jsonb_build_object('ok',true,'id',a.id);
 end if;
 insert into nptc_private.survey_assignments(workshop_id,scale_code,scale_version,definition,status,note,created_by,request_id)
 values(wid,d->>'code',d->>'version',d,publication,memo,auth.uid(),rid) returning * into a;
 return jsonb_build_object('ok',true,'id',a.id);
end;$$;

create or replace function public.nptc_survey_update(body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a nptc_private.survey_assignments; wid uuid; next_status text:=body->>'status'; memo text;
begin
 select workshop_id into wid from nptc_private.survey_assignments where id=(body->>'id')::uuid;
 perform nptc_private.survey_require_teacher(wid);
 perform 1 from nptc_private.workshops where id=wid and archived_at is null for update;
 if not found then raise exception '封存梯次不可修改問卷。'; end if;
 select * into a from nptc_private.survey_assignments where id=(body->>'id')::uuid for update;
 if jsonb_typeof(body->'revision') is distinct from 'number' or body->>'revision' !~ '^[0-9]+$' or (body->>'revision')::integer<>a.revision then raise exception '問卷設定已更新，請重新讀取。'; end if;
 if next_status is null or next_status not in ('open','closed') then raise exception '請選擇開放或關閉。'; end if;
 memo=trim(coalesce(body->>'note',a.note));
 if length(memo)>2000 then raise exception '備註不可超過 2000 字。'; end if;
 update nptc_private.survey_assignments set status=next_status,note=memo,opens_at=nullif(body->>'opensAt','')::timestamptz,closes_at=nullif(body->>'closesAt','')::timestamptz,revision=revision+1 where id=a.id;
 return '{"ok":true}'::jsonb;
end;$$;

create or replace function public.nptc_survey_teacher_data(requested_workshop uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform nptc_private.survey_require_teacher(requested_workshop);
 return jsonb_build_object(
 'assignments',coalesce((select jsonb_agg((to_jsonb(a)-'phase'-'request_id')||jsonb_build_object('submitted_count',(select count(*) from nptc_private.survey_responses r where r.assignment_id=a.id)) order by a.created_at,a.id) from nptc_private.survey_assignments a where a.workshop_id=requested_workshop),'[]'::jsonb),
 'students',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name,s.id) from nptc_private.students s where s.workshop_id=requested_workshop),'[]'::jsonb),
 'responses',coalesce((select jsonb_agg(jsonb_build_object('assignment_id',r.assignment_id,'student_id',r.student_id,'submitted_at',r.submitted_at,'scores',r.scores)) from nptc_private.survey_responses r join nptc_private.survey_assignments a on a.id=r.assignment_id where a.workshop_id=requested_workshop),'[]'::jsonb));
end;$$;

create or replace function nptc_private.survey_require_student() returns text
language plpgsql stable security definer set search_path='' as $$
declare e text:=nptc_private.student_identity();
begin
 if not exists(select 1 from nptc_private.student_accounts where user_id=auth.uid() and email=e and activated_at is not null) then raise exception '請使用已完成啟用的學員帳號登入。' using errcode='42501'; end if;
 return e;
end;$$;

create or replace function nptc_private.survey_availability(aid uuid,sid uuid) returns text
language sql stable set search_path='' as $$
 select case when exists(select 1 from nptc_private.survey_responses r where r.assignment_id=a.id and r.student_id=sid) then 'submitted'
  when w.archived_at is not null or a.status<>'open' then 'closed'
  when a.opens_at is not null and now()<a.opens_at then 'scheduled'
  when a.closes_at is not null and now()>=a.closes_at then 'expired' else 'open' end
 from nptc_private.survey_assignments a join nptc_private.workshops w on w.id=a.workshop_id where a.id=aid;
$$;

create or replace function public.nptc_survey_student_data(requested_student uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare e text:=nptc_private.survey_require_student(); sid uuid; wid uuid;
begin
 select id,workshop_id into sid,wid from nptc_private.students where id=requested_student and email=e;
 if sid is null then raise exception '找不到本人的梯次名冊。' using errcode='42501'; end if;
 return jsonb_build_object('assignments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'workshop_id',wid,'title',a.definition->>'title','created_at',a.created_at,'availability',nptc_private.survey_availability(a.id,sid),'submitted_at',r.submitted_at) order by a.created_at,a.id)
  from nptc_private.survey_assignments a left join nptc_private.survey_responses r on r.assignment_id=a.id and r.student_id=sid where a.workshop_id=wid and a.status<>'draft'),'[]'::jsonb));
end;$$;

create or replace function public.nptc_survey_form(requested_assignment uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare e text:=nptc_private.survey_require_student(); a nptc_private.survey_assignments; sid uuid; workshop_name text; submitted timestamptz;
begin
 select * into a from nptc_private.survey_assignments where id=requested_assignment and status<>'draft';
 if not found then raise exception '問卷尚未發布或連結無效。'; end if;
 select id into sid from nptc_private.students where workshop_id=a.workshop_id and email=e;
 if sid is null then raise exception '這份問卷不屬於您的工作坊，請確認使用的是受邀學員帳號。' using errcode='42501'; end if;
 select name into workshop_name from nptc_private.workshops where id=a.workshop_id;
 select submitted_at into submitted from nptc_private.survey_responses where assignment_id=a.id and student_id=sid;
 return jsonb_build_object('workshopName',workshop_name,'assignment',jsonb_build_object('id',a.id,'workshop_id',a.workshop_id,'scale_code',a.scale_code,'scale_version',a.scale_version,'created_at',a.created_at,'status',a.status,'revision',a.revision,'opens_at',a.opens_at,'closes_at',a.closes_at,'definition',a.definition-'reverseItems'-'dimensions'-'negativeItems','availability',nptc_private.survey_availability(a.id,sid),'submitted_at',submitted));
end;$$;

create or replace function public.nptc_survey_submit(body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e text:=nptc_private.survey_require_student(); a nptc_private.survey_assignments; r nptc_private.survey_responses;
 sid uuid; wid uuid; rid uuid:=(body->>'requestId')::uuid; calculated jsonb;
begin
 if rid is null then raise exception '請重新開啟問卷後提交。'; end if;
 select s.id,s.workshop_id into sid,wid from nptc_private.students s join nptc_private.survey_assignments x on x.workshop_id=s.workshop_id where x.id=(body->>'assignmentId')::uuid and s.email=e;
 if sid is null then raise exception '無法填寫其他梯次的問卷。' using errcode='42501'; end if;
 perform 1 from nptc_private.workshops where id=wid for update;
 select * into a from nptc_private.survey_assignments where id=(body->>'assignmentId')::uuid for update;
 select * into r from nptc_private.survey_responses where assignment_id=a.id and student_id=sid;
 if found then
  if r.user_id=auth.uid() and r.request_id=rid and r.answers=body->'answers' and a.scale_version=body->>'version' then return jsonb_build_object('ok',true,'submitted_at',r.submitted_at); end if;
  raise exception '本次問卷已完成，原始作答不可覆寫。';
 end if;
 if a.status<>'open' or exists(select 1 from nptc_private.workshops where id=wid and archived_at is not null) then raise exception '問卷已關閉或梯次已封存。'; end if;
 if a.opens_at is not null and now()<a.opens_at then raise exception '尚未到開放時間。'; end if;
 if a.closes_at is not null and now()>=a.closes_at then raise exception '問卷已截止。'; end if;
 if a.scale_version is distinct from body->>'version' then raise exception '量表版本不符，請重新開啟。'; end if;
 calculated=nptc_private.survey_score(a.definition,body->'answers');
 insert into nptc_private.survey_responses(assignment_id,student_id,user_id,request_id,answers,scores) values(a.id,sid,auth.uid(),rid,body->'answers',calculated) returning * into r;
 return jsonb_build_object('ok',true,'submitted_at',r.submitted_at);
end;$$;

create or replace function public.nptc_survey_export(requested_workshop uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform nptc_private.survey_require_teacher(requested_workshop);
 return jsonb_build_object('workshop',(select jsonb_build_object('id',id,'name',name) from nptc_private.workshops where id=requested_workshop),
 'participants',coalesce((select jsonb_agg(id order by id) from nptc_private.students where workshop_id=requested_workshop),'[]'::jsonb),
 'responses',coalesce((select jsonb_agg(jsonb_build_object('assignment_id',a.id,'student_id',r.student_id,'note',a.note,'scale_code',a.scale_code,'scale_version',a.scale_version,'submitted_at',r.submitted_at,'answers',r.answers,'scores',r.scores) order by r.student_id,a.created_at,a.id) from nptc_private.survey_responses r join nptc_private.survey_assignments a on a.id=r.assignment_id where a.workshop_id=requested_workshop),'[]'::jsonb));
end;$$;

-- 沿用第一段的封存／快照保護；備註及發布狀態可經 RPC 修改。
create trigger nptc_survey_assignment_guard before insert or update or delete on nptc_private.survey_assignments for each row execute function nptc_private.survey_guard();
revoke all on function nptc_private.survey_validate_definition(jsonb),nptc_private.survey_validate_answers(jsonb,jsonb),nptc_private.survey_require_student(),nptc_private.survey_availability(uuid,uuid) from public,anon,authenticated;
revoke all on function public.nptc_survey_library(),public.nptc_survey_assign(jsonb),public.nptc_survey_form(uuid) from public,anon;
grant execute on function public.nptc_survey_library(),public.nptc_survey_assign(jsonb),public.nptc_survey_form(uuid) to authenticated;
insert into nptc_private.schema_migrations(version) values(2026102902) on conflict do nothing;
notify pgrst,'reload schema';
commit;
