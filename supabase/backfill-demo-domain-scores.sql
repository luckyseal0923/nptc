-- 僅補 demo-np osce 的虛構資料。須先執行 upgrade-domain-scores.sql。
-- 五面向各 20 分；分項由既有總分做可重現的示範分配，合計不改變原總分。
-- 已有 domain_scores 的資料不覆寫。可重複執行。
begin;

do $$
declare demo_count integer;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='nptc_private' and table_name='station_grades' and column_name='domain_scores'
  ) then
    raise exception '請先執行 upgrade-domain-scores.sql。';
  end if;

  select count(*) into demo_count
  from nptc_private.workshops
  where lower(trim(name))='demo-np osce';

  if demo_count<>1 then
    raise exception '預期正好一個 demo-np osce 梯次，目前找到 % 個。',demo_count;
  end if;
end;$$;

create or replace function pg_temp.demo_domain_scores(total_score numeric, seed_text text)
returns jsonb language plpgsql immutable set search_path='' as $$
declare
  score integer;
  values integer[];
  remainder integer;
  start_at integer;
  i integer;
  donor integer;
  recipient integer;
  transfer integer;
begin
  if total_score is null or total_score<>trunc(total_score) or total_score<0 or total_score>100 then
    raise exception '示範總分須為 0 至 100 的整數，目前為 %。',total_score;
  end if;

  score:=total_score::integer;
  values:=array_fill(score/5,array[5]);
  remainder:=score%5;
  start_at:=(abs(hashtext(seed_text))%5)+1;

  if remainder>0 then
    for i in 0..remainder-1 loop
      values[((start_at+i-1)%5)+1]:=values[((start_at+i-1)%5)+1]+1;
    end loop;
  end if;

  -- 轉移少量分數，讓示範雷達圖有差異，同時維持總分及每項 0–20 分。
  for i in 0..2 loop
    donor:=((start_at+i*2-1)%5)+1;
    recipient:=((start_at+i*2+1)%5)+1;
    transfer:=least(2,values[donor],20-values[recipient]);
    values[donor]:=values[donor]-transfer;
    values[recipient]:=values[recipient]+transfer;
  end loop;

  return jsonb_build_object(
    'currentHistory',values[1],
    'pastHistory',values[2],
    'ros',values[3],
    'physicalExam',values[4],
    'differentialDiagnosis',values[5]
  );
end;$$;

update nptc_private.workshops w
set stations=(
  select jsonb_agg(
    station.value || jsonb_build_object('domainMax',jsonb_build_object(
      'currentHistory',20,
      'pastHistory',20,
      'ros',20,
      'physicalExam',20,
      'differentialDiagnosis',20
    ))
    order by station.ordinality
  )
  from jsonb_array_elements(w.stations) with ordinality station(value,ordinality)
)
where lower(trim(w.name))='demo-np osce';

with changed as (
  update nptc_private.station_grades g
  set domain_scores=pg_temp.demo_domain_scores(g.score,g.student_id::text||':'||g.station_key)
  from nptc_private.students s,nptc_private.workshops w
  where s.id=g.student_id
    and w.id=s.workshop_id
    and lower(trim(w.name))='demo-np osce'
    and g.domain_scores is null
  returning g.student_id
)
update nptc_private.students s
set revision=s.revision+1,updated_at=now()
where s.id in (select distinct student_id from changed);

do $$
declare invalid_count integer; grade_count integer; domain_count integer; station_count integer;
begin
  select count(*),count(g.domain_scores),count(*) filter (
    where nptc_private.domain_score_total(g.domain_scores,
      jsonb_build_object('currentHistory',20,'pastHistory',20,'ros',20,'physicalExam',20,'differentialDiagnosis',20)
    )<>g.score
  ) into grade_count,domain_count,invalid_count
  from nptc_private.station_grades g
  join nptc_private.students s on s.id=g.student_id
  join nptc_private.workshops w on w.id=s.workshop_id
  where lower(trim(w.name))='demo-np osce';

  select count(*) into station_count
  from nptc_private.workshops w
  cross join lateral jsonb_array_elements(w.stations) station
  where lower(trim(w.name))='demo-np osce'
    and station->'domainMax'=jsonb_build_object(
      'currentHistory',20,'pastHistory',20,'ros',20,'physicalExam',20,'differentialDiagnosis',20
    );

  if grade_count<>80 or domain_count<>80 or invalid_count<>0 or station_count<>4 then
    raise exception '示範補分驗證失敗：grades %, domains %, invalid %, stations %。',grade_count,domain_count,invalid_count,station_count;
  end if;
end;$$;

commit;

