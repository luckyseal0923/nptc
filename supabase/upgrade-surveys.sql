-- 既有資料庫須先安裝 upgrade-project-consistency.sql；本檔可重跑，保留作答。
begin;
do $$ begin
 if to_regprocedure('public.nptc_schema_version()') is null then raise exception '請先完成 NPTC 現行資料庫安裝。'; end if;
 if not exists(select 1 from nptc_private.schema_migrations where version>=2026100701) then raise exception '請先完成 upgrade-project-consistency.sql。'; end if;
 if exists(select 1 from nptc_private.schema_migrations where version=2026102902) then raise exception '已安裝量表庫，請使用 upgrade-survey-library.sql，不可重跑舊量表升級。'; end if;
end;$$;

create table if not exists nptc_private.survey_instruments(
 code text not null, version text not null, definition jsonb not null, primary key(code,version)
);
-- BEGIN DTI-SK DEFINITION
insert into nptc_private.survey_instruments(code,version,definition) values('dti-sk','zh-TW-draft-20261029','{"code":"dti-sk","version":"zh-TW-draft-20261029","title":"DTI-SK 簡式診斷思維量表","notice":"繁體中文翻譯初稿，未經驗證。","instructions":["本問卷共 14 題，旨在了解您在臨床情境中的診斷思維方式。每題有左右兩個敘述，沒有絕對正確或錯誤的答案。","請想像自己正在一般內科情境中面對病人，依照您目前實際會如何詢問、思考和做出診斷來回答，而非依照理想上應如何表現。臨床經驗有限者，可依病例討論、問題導向學習（PBL）或案例導向學習（CBL）經驗作答。","每題請選擇一個數字。1 表示最接近左側敘述，6 表示最接近右側敘述；介於兩者之間，請依接近程度選擇 2、3、4 或 5。送出後將保留原始作答，不提供修改。"],"reverseItems":[5,6,8,9,12,13,14],"dimensions":{"flexibility":[1,2,7,9,10,13,14],"structure":[3,4,5,6,8,11,12]},"items":[{"left":"與病人面談時，我經常將思考侷限在某一種可能的診斷上。","right":"我通常能輕易考慮多種可能的診斷。"},{"left":"面談過程中，如果我順著病人的思路進行，我容易失去自己原本的思考脈絡。","right":"即使我順著病人的思路進行，我仍能清楚維持自己的思考脈絡。"},{"left":"對於日常病史詢問，我經常覺得自己詢問得不夠充分。","right":"我通常覺得自己完成的病史詢問已達到滿意的程度。"},{"left":"當病人描述症狀、病情逐步展開時，我經常難以記住病人先前說過的內容。","right":"我通常能持續清楚掌握病人已經說過的內容。"},{"left":"與病人面談時，我通常能注意到重要的臨床線索。","right":"我經常難以判斷哪些資訊值得特別注意。"},{"left":"蒐集病人資訊時，我通常能自然而然地將相似的資訊歸納在一起。","right":"我經常難以理解病人的不同資訊之間有何關聯。"},{"left":"與病人面談時，我難以忽略與診斷無關的資訊。","right":"我不介意將某些資訊判定為無關而予以忽略。"},{"left":"即使我對某一類疾病幾乎沒有相關知識，我通常仍能提出可能的診斷。","right":"我會很難做出診斷。"},{"left":"對於自己最後做出的診斷，我通常很少產生懷疑。","right":"我經常對自己最後做出的診斷感到非常不確定。"},{"left":"做出診斷決策時，我會根據每個可能診斷本身的依據，逐一評估後做出判斷。","right":"我會透過比較與對照不同可能診斷來做出決定。"},{"left":"在形成診斷決策時，我經常會遺漏某些資訊，沒有將其納入考量。","right":"我通常已經將所有相關資訊納入考量。"},{"left":"當我對病人可能出了什麼問題形成大致概念時，我通常能進一步提出具體診斷。","right":"我很難將這個大致概念轉化為具體的診斷名稱。"},{"left":"當我在臨床面談中不知道該如何判斷時，我能輕易地從新的角度重新檢視資訊。","right":"我覺得很難從新的角度重新檢視資訊。"},{"left":"在進行病人面談時，我通常能充分涵蓋自己所需要的各項資訊。","right":"在面談中，我經常無法問完所有應該詢問的問題。"}]}'::jsonb) on conflict(code,version) do nothing;
-- END DTI-SK DEFINITION
create table if not exists nptc_private.survey_assignments(
 id uuid primary key default gen_random_uuid(),
 workshop_id uuid not null references nptc_private.workshops(id) on delete cascade,
 scale_code text not null, scale_version text not null, definition jsonb not null,
 phase text not null check(phase in ('pre','post')),
 status text not null default 'draft' check(status in ('draft','open','closed')),
 revision integer not null default 0,
 opens_at timestamptz, closes_at timestamptz,
 created_at timestamptz not null default now(), created_by uuid not null,
 unique(workshop_id,scale_code,phase),
 foreign key(scale_code,scale_version) references nptc_private.survey_instruments(code,version),
 check(opens_at is null or closes_at is null or opens_at<closes_at)
);
create table if not exists nptc_private.survey_responses(
 id uuid primary key default gen_random_uuid(),
 assignment_id uuid not null references nptc_private.survey_assignments(id) on delete cascade,
 student_id uuid not null references nptc_private.students(id) on delete cascade,
 user_id uuid not null, request_id uuid not null,
 answers jsonb not null, scores jsonb not null,
 submitted_at timestamptz not null default now(),
 unique(assignment_id,student_id), unique(user_id,request_id)
);
alter table nptc_private.survey_instruments enable row level security;
alter table nptc_private.survey_assignments enable row level security;
alter table nptc_private.survey_responses enable row level security;
revoke all on nptc_private.survey_instruments,nptc_private.survey_assignments,nptc_private.survey_responses from public,anon,authenticated;
create index if not exists survey_responses_student on nptc_private.survey_responses(student_id);

create or replace function nptc_private.survey_score(definition jsonb,answers jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare scores jsonb; total integer; flexibility integer; structure integer;
begin
 if jsonb_typeof(answers) is distinct from 'array' then raise exception '請提供完整的 14 題作答。'; end if;
 if jsonb_array_length(answers)<>jsonb_array_length(definition->'items') then raise exception '請完成每一題。'; end if;
 if exists(select 1 from jsonb_array_elements(answers) a where jsonb_typeof(a)<>'number' or a::text !~ '^[1-6]$') then raise exception '每題只能選擇 1 至 6 的整數。'; end if;
 select jsonb_agg(score order by i),sum(score),
  sum(score) filter(where (definition->'dimensions'->'flexibility') @> to_jsonb(i::integer)),
  sum(score) filter(where (definition->'dimensions'->'structure') @> to_jsonb(i::integer))
 into scores,total,flexibility,structure from (
  select i,case when (definition->'reverseItems') @> to_jsonb(i::integer) then 7-(a::text)::integer else (a::text)::integer end score
  from jsonb_array_elements(answers) with ordinality t(a,i)
 ) x;
 return jsonb_build_object('itemScores',scores,'total',total,'flexibility',flexibility,'structure',structure);
end;$$;

create or replace function nptc_private.survey_guard() returns trigger
language plpgsql set search_path='' as $$
declare wid uuid;
begin
 if TG_OP='DELETE' and current_setting('nptc.delete_archived_workshop',true)='on' then return old; end if;
 if TG_TABLE_NAME='students' then
  if exists(select 1 from nptc_private.survey_responses where student_id=old.id) then raise exception '學員已有量表作答紀錄，請保留名冊。'; end if;
  return old;
 end if;
 if TG_TABLE_NAME='survey_assignments' then
  if TG_OP='DELETE' then raise exception '量表發布紀錄請關閉保留，不可直接刪除。'; end if;
  wid=new.workshop_id;
  if TG_OP='UPDATE' and (new.workshop_id,new.scale_code,new.scale_version,new.definition,new.phase,new.created_by,new.created_at) is distinct from (old.workshop_id,old.scale_code,old.scale_version,old.definition,old.phase,old.created_by,old.created_at) then raise exception '已建立量表的題目、版本與時點不可變更。'; end if;
 else
  if TG_OP<>'INSERT' then raise exception '已提交量表不可修改或刪除。'; end if;
  select workshop_id into wid from nptc_private.survey_assignments where id=new.assignment_id;
 end if;
 perform 1 from nptc_private.workshops where id=wid and archived_at is null for update;
 if not found then raise exception '封存梯次不可修改或填答量表。'; end if;
 return new;
end;$$;
drop trigger if exists nptc_survey_assignment_guard on nptc_private.survey_assignments;
create trigger nptc_survey_assignment_guard before insert or update or delete on nptc_private.survey_assignments for each row execute function nptc_private.survey_guard();
drop trigger if exists nptc_survey_response_guard on nptc_private.survey_responses;
create trigger nptc_survey_response_guard before insert or update or delete on nptc_private.survey_responses for each row execute function nptc_private.survey_guard();
drop trigger if exists nptc_survey_roster_guard on nptc_private.students;
create trigger nptc_survey_roster_guard before delete on nptc_private.students for each row execute function nptc_private.survey_guard();

create or replace function nptc_private.survey_require_teacher(wid uuid) returns void
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.nptc_is_teacher() then raise exception '此帳號沒有量表管理權限。' using errcode='42501'; end if;
 if not exists(select 1 from nptc_private.workshops where id=wid and (archived_at is null or public.nptc_is_account_reviewer())) then raise exception '找不到可存取的梯次。' using errcode='42501'; end if;
end;$$;

create or replace function public.nptc_survey_create_pair(body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare wid uuid:=(body->>'workshopId')::uuid; d jsonb;
begin
 perform nptc_private.survey_require_teacher(wid);
 perform 1 from nptc_private.workshops where id=wid and archived_at is null for update;
 if not found then raise exception '封存梯次不可發布量表。'; end if;
 select definition into d from nptc_private.survey_instruments where code='dti-sk' and version='zh-TW-draft-20261029';
 if d is null then raise exception '量表版本尚未安裝。'; end if;
 insert into nptc_private.survey_assignments(workshop_id,scale_code,scale_version,definition,phase,created_by)
 select wid,d->>'code',d->>'version',d,phase,auth.uid() from (values('pre'),('post')) phases(phase)
 on conflict(workshop_id,scale_code,phase) do nothing;
 return '{"ok":true}'::jsonb;
end;$$;

create or replace function public.nptc_survey_update(body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a nptc_private.survey_assignments; wid uuid; next_status text:=body->>'status';
begin
 select workshop_id into wid from nptc_private.survey_assignments where id=(body->>'id')::uuid;
 perform nptc_private.survey_require_teacher(wid);
 perform 1 from nptc_private.workshops where id=wid and archived_at is null for update;
 if not found then raise exception '封存梯次不可修改量表。'; end if;
 select * into a from nptc_private.survey_assignments where id=(body->>'id')::uuid for update;
 if jsonb_typeof(body->'revision') is distinct from 'number' or body->>'revision' !~ '^[0-9]+$' or (body->>'revision')::integer<>a.revision then raise exception '量表設定已更新，請重新讀取。'; end if;
 if next_status is null or next_status not in ('open','closed') then raise exception '請選擇開放或關閉。'; end if;
 update nptc_private.survey_assignments set status=next_status,opens_at=nullif(body->>'opensAt','')::timestamptz,closes_at=nullif(body->>'closesAt','')::timestamptz,revision=revision+1 where id=a.id;
 return '{"ok":true}'::jsonb;
end;$$;

create or replace function public.nptc_survey_teacher_data(requested_workshop uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform nptc_private.survey_require_teacher(requested_workshop);
 return jsonb_build_object(
 'assignments',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('submitted_count',(select count(*) from nptc_private.survey_responses r where r.assignment_id=a.id)) order by a.phase desc) from nptc_private.survey_assignments a where a.workshop_id=requested_workshop),'[]'::jsonb),
 'students',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name,s.id) from nptc_private.students s where s.workshop_id=requested_workshop),'[]'::jsonb),
 'responses',coalesce((select jsonb_agg(jsonb_build_object('assignment_id',r.assignment_id,'student_id',r.student_id,'submitted_at',r.submitted_at,'scores',r.scores)) from nptc_private.survey_responses r join nptc_private.survey_assignments a on a.id=r.assignment_id where a.workshop_id=requested_workshop),'[]'::jsonb));
end;$$;

create or replace function public.nptc_survey_export(requested_workshop uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform nptc_private.survey_require_teacher(requested_workshop);
 return jsonb_build_object('workshop',(select jsonb_build_object('id',id,'name',name) from nptc_private.workshops where id=requested_workshop),
 'participants',coalesce((select jsonb_agg(id order by id) from nptc_private.students where workshop_id=requested_workshop),'[]'::jsonb),
 'responses',coalesce((select jsonb_agg(jsonb_build_object('assignment_id',a.id,'student_id',r.student_id,'phase',a.phase,'scale_code',a.scale_code,'scale_version',a.scale_version,'submitted_at',r.submitted_at,'answers',r.answers,'scores',r.scores) order by r.student_id,a.phase desc) from nptc_private.survey_responses r join nptc_private.survey_assignments a on a.id=r.assignment_id where a.workshop_id=requested_workshop),'[]'::jsonb));
end;$$;

create or replace function public.nptc_survey_student_data(requested_student uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare e text:=nptc_private.student_identity(); sid uuid; wid uuid; result jsonb;
begin
 if not exists(select 1 from nptc_private.student_accounts where user_id=auth.uid() and email=e and activated_at is not null) then raise exception '請先完成學員帳號啟用。' using errcode='42501'; end if;
 select id,workshop_id into sid,wid from nptc_private.students where id=requested_student and email=e;
 if sid is null then raise exception '找不到本人的梯次名冊。' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'workshop_id',a.workshop_id,'scale_code',a.scale_code,'scale_version',a.scale_version,'phase',a.phase,'status',a.status,'revision',a.revision,'opens_at',a.opens_at,'closes_at',a.closes_at,
 'definition',a.definition-'reverseItems'-'dimensions','submitted_at',r.submitted_at,
 'availability',case when r.id is not null then 'submitted'
 when w.archived_at is not null or a.status<>'open' then 'closed'
 when a.opens_at is not null and now()<a.opens_at then 'scheduled'
 when a.closes_at is not null and now()>=a.closes_at then 'expired'
 when a.phase='post' and not exists(select 1 from nptc_private.survey_responses p join nptc_private.survey_assignments pa on pa.id=p.assignment_id where pa.workshop_id=wid and pa.scale_code=a.scale_code and pa.scale_version=a.scale_version and pa.phase='pre' and p.student_id=sid) then 'waiting_pre' else 'open' end) order by a.phase desc),'[]'::jsonb)
 into result from nptc_private.survey_assignments a join nptc_private.workshops w on w.id=a.workshop_id left join nptc_private.survey_responses r on r.assignment_id=a.id and r.student_id=sid
 where a.workshop_id=wid and a.status<>'draft';
 return jsonb_build_object('assignments',result);
end;$$;

create or replace function public.nptc_survey_submit(body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e text:=nptc_private.student_identity(); a nptc_private.survey_assignments; r nptc_private.survey_responses;
 sid uuid; wid uuid; rid uuid:=(body->>'requestId')::uuid; calculated jsonb;
begin
 if rid is null then raise exception '請重新開啟問卷後提交。'; end if;
 if not exists(select 1 from nptc_private.student_accounts where user_id=auth.uid() and email=e and activated_at is not null) then raise exception '請先完成學員帳號啟用。' using errcode='42501'; end if;
 select s.id,s.workshop_id into sid,wid from nptc_private.students s join nptc_private.survey_assignments x on x.workshop_id=s.workshop_id where x.id=(body->>'assignmentId')::uuid and s.email=e;
 if sid is null then raise exception '無法填寫其他梯次的量表。' using errcode='42501'; end if;
 -- 與設定、封存及名冊異動共用梯次鎖，統一鎖定順序。
 perform 1 from nptc_private.workshops where id=wid for update;
 select * into a from nptc_private.survey_assignments where id=(body->>'assignmentId')::uuid for update;
 select * into r from nptc_private.survey_responses where assignment_id=a.id and student_id=sid;
 if found then
  if r.user_id=auth.uid() and r.request_id=rid and r.answers=body->'answers' and a.scale_version=body->>'version' then return jsonb_build_object('ok',true,'submitted_at',r.submitted_at); end if;
  raise exception '本次量表已完成，原始作答不可覆寫。';
 end if;
 if a.status<>'open' or exists(select 1 from nptc_private.workshops where id=wid and archived_at is not null) then raise exception '量表已關閉或梯次已封存。'; end if;
 if a.opens_at is not null and now()<a.opens_at then raise exception '尚未到開放時間。'; end if;
 if a.closes_at is not null and now()>=a.closes_at then raise exception '量表已截止。'; end if;
 if a.scale_version is distinct from body->>'version' then raise exception '量表版本不符，請重新開啟。'; end if;
 if a.phase='post' and not exists(select 1 from nptc_private.survey_responses p join nptc_private.survey_assignments pa on pa.id=p.assignment_id where pa.workshop_id=wid and pa.scale_code=a.scale_code and pa.scale_version=a.scale_version and pa.phase='pre' and p.student_id=sid) then raise exception '請先完成同一版本的前測。'; end if;
 calculated=nptc_private.survey_score(a.definition,body->'answers');
 insert into nptc_private.survey_responses(assignment_id,student_id,user_id,request_id,answers,scores) values(a.id,sid,auth.uid(),rid,body->'answers',calculated) returning * into r;
 return jsonb_build_object('ok',true,'submitted_at',r.submitted_at);
end;$$;

revoke all on function nptc_private.survey_score(jsonb,jsonb),nptc_private.survey_guard(),nptc_private.survey_require_teacher(uuid) from public,anon,authenticated;
revoke all on function public.nptc_survey_create_pair(jsonb),public.nptc_survey_update(jsonb),public.nptc_survey_teacher_data(uuid),public.nptc_survey_export(uuid),public.nptc_survey_student_data(uuid),public.nptc_survey_submit(jsonb) from public,anon;
grant execute on function public.nptc_survey_create_pair(jsonb),public.nptc_survey_update(jsonb),public.nptc_survey_teacher_data(uuid),public.nptc_survey_export(uuid),public.nptc_survey_student_data(uuid),public.nptc_survey_submit(jsonb) to authenticated;
insert into nptc_private.schema_migrations(version) values(2026102901) on conflict do nothing;
notify pgrst,'reload schema';
commit;
