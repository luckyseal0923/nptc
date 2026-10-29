-- 僅供既有「Demo 示範梯次（20 位學員）」的 01–20 號示範學員。
-- 先安裝四段量表升級；本檔不加入 install.sql，也不由建置自動執行。
-- 三次 DTI-SK、共 60 份人工生成作答；不是實際教育介入或量表驗證結果。
-- 保留現有帳號、名冊、分數及其他發布；重跑不覆寫既有作答。
begin;

do $$
declare
  wid uuid;
  matches integer;
  roster_count integer;
  seed_definition jsonb;
  publisher constant uuid := 'd7102026-1029-4000-8000-000000000000'; -- SQL 示範資料標記，非登入帳號。
  seed_dates constant timestamptz[] := array['2026-10-01 01:00:00+00','2026-10-15 01:00:00+00','2026-10-29 01:00:00+00']::timestamptz[];
  round_no integer;
  seed_assignment uuid;
  publication_request uuid;
  memo text;
  student record;
  points integer;
  offset_score integer;
  seed_answers jsonb;
  invalid_count integer;
begin
  if not exists(select 1 from nptc_private.schema_migrations where version=2026102904) then
    raise exception '請先完成四段量表升級（至 upgrade-survey-deletion.sql）。';
  end if;

  select count(*) into matches from nptc_private.workshops where name='Demo 示範梯次（20 位學員）';
  if matches<>1 then raise exception '預期正好一個 Demo 示範梯次，目前找到 % 個。',matches; end if;
  select id into wid from nptc_private.workshops where name='Demo 示範梯次（20 位學員）' and archived_at is null for update;
  if wid is null then raise exception 'Demo 梯次已封存，不得補入示範分數。'; end if;

  -- 僅以 01–20 號示範名稱及既有已啟用帳號選取，不加入其他名冊或建立 Auth 帳號。
  select count(*),count(distinct n) into roster_count,matches from (
    select (regexp_match(s.name,'^示範學員[[:space:]]*([0-9]{1,2})$'))[1]::integer n
    from nptc_private.students s
    join nptc_private.student_accounts account on account.email=s.email and account.activated_at is not null
    join auth.users u on u.id=account.user_id
    where s.workshop_id=wid and s.name ~ '^示範學員[[:space:]]*[0-9]{1,2}$'
  ) targets where n between 1 and 20;
  if roster_count<>20 or matches<>20 then
    raise exception '需有不重複的 01–20 號已啟用示範學員，目前共 % 筆、% 個編號。',roster_count,matches;
  end if;

  select i.definition into seed_definition from nptc_private.survey_instruments i
  where i.code='dti-sk' and i.version='zh-TW-draft-20261029';
  if seed_definition is null then raise exception '找不到指定的 DTI-SK 14 題版本。'; end if;
  perform nptc_private.survey_validate_definition(seed_definition);

  for round_no in 1..3 loop
    seed_assignment:=md5('nptc:demo-survey:20261029:'||wid::text||':'||round_no)::uuid;
    publication_request:=md5('nptc:demo-survey:request:'||wid::text||':'||round_no)::uuid;
    memo:=format('Demo 第 %s 次施測｜模擬資料，僅供操作與趨勢示範',round_no);

    -- 固定識別避免重跑重複建立；識別遭占用或資料經編輯時停止，不覆寫。
    if exists(select 1 from nptc_private.survey_assignments a where a.id=seed_assignment and
      (a.workshop_id,a.scale_code,a.scale_version,a.definition,a.created_by,a.created_at,a.request_id,a.note,a.status,a.phase)
      is distinct from (wid,'dti-sk'::text,'zh-TW-draft-20261029'::text,seed_definition,publisher,seed_dates[round_no],publication_request,memo,'closed'::text,null::text)) then
      raise exception '第 % 次示範發布已被修改或識別衝突，停止以保護現有資料。',round_no;
    end if;
    insert into nptc_private.survey_assignments(id,workshop_id,scale_code,scale_version,definition,status,note,created_by,created_at,request_id)
    values(seed_assignment,wid,'dti-sk','zh-TW-draft-20261029',seed_definition,'closed',memo,publisher,seed_dates[round_no],publication_request)
    on conflict(id) do nothing;

    for student in
      select targets.* from (
        select s.id,account.user_id,(regexp_match(s.name,'^示範學員[[:space:]]*([0-9]{1,2})$'))[1]::integer n
        from nptc_private.students s join nptc_private.student_accounts account on account.email=s.email
        where s.workshop_id=wid and s.name ~ '^示範學員[[:space:]]*[0-9]{1,2}$'
      ) targets where n between 1 and 20 order by n
    loop
      -- 四組不同走勢：持續上升、持平、先升後回落、較晚上升。
      offset_score:=case (student.n-1)%4
        when 0 then round_no-1
        when 1 then 1
        when 2 then case when round_no=2 then 2 else 1 end
        else case when round_no=3 then 1 else 0 end end;
      seed_answers:='[]'::jsonb;
      for q in 1..14 loop
        points:=2+((student.n+q*2)%3)+offset_score;
        seed_answers:=seed_answers||jsonb_build_array(case when seed_definition->'reverseItems' @> to_jsonb(q) then 7-points else points end);
      end loop;
      insert into nptc_private.survey_responses(assignment_id,student_id,user_id,request_id,answers,scores,submitted_at)
      values(seed_assignment,student.id,student.user_id,
        md5('nptc:demo-survey:response:'||seed_assignment::text||':'||student.id::text)::uuid,
        seed_answers,nptc_private.survey_score(seed_definition,seed_answers),seed_dates[round_no]+interval '1 hour'+student.n*interval '3 minutes')
      on conflict(assignment_id,student_id) do nothing;

      if not exists(select 1 from nptc_private.survey_responses r where r.assignment_id=seed_assignment and r.student_id=student.id
        and r.user_id=student.user_id and r.answers=seed_answers and r.scores=nptc_private.survey_score(seed_definition,seed_answers)
        and r.request_id=md5('nptc:demo-survey:response:'||seed_assignment::text||':'||student.id::text)::uuid) then
        raise exception '第 % 次示範作答與現有資料衝突，停止且不覆寫。',round_no;
      end if;
    end loop;

    select count(*) into roster_count from nptc_private.survey_responses r where r.assignment_id=seed_assignment;
    if roster_count<>20 then raise exception '第 % 次應有 20 筆示範作答，目前為 % 筆。',round_no,roster_count; end if;
  end loop;

  select count(*) into invalid_count from nptc_private.survey_responses r
  join nptc_private.survey_assignments a on a.id=r.assignment_id
  where a.workshop_id=wid and a.created_by=publisher and r.scores<>nptc_private.survey_score(a.definition,r.answers);
  if invalid_count<>0 then raise exception '示範計分不一致，已取消本次變更。'; end if;
end;$$;

select a.note,a.created_at,count(r.id)::integer responses,
  round(avg((r.scores->>'total')::numeric),2) mean_total,
  min((r.scores->>'total')::integer) min_total,max((r.scores->>'total')::integer) max_total
from nptc_private.survey_assignments a
join nptc_private.workshops w on w.id=a.workshop_id
left join nptc_private.survey_responses r on r.assignment_id=a.id
where w.name='Demo 示範梯次（20 位學員）' and a.created_by='d7102026-1029-4000-8000-000000000000'
group by a.id order by a.created_at;

commit;
