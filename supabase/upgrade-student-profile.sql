-- 在既有設定之後執行：新增學員首次登入個人資料。
begin;
alter table nptc_private.students
 add column if not exists nursing_years integer check(nursing_years between 0 and 60),
 add column if not exists hospital text check(length(hospital)<=100),
 add column if not exists unit text check(length(unit)<=100),
 add column if not exists exam_specialty text check(exam_specialty in ('內科','精神科','兒科','外科','婦產科','麻醉科','家庭科')),
 add column if not exists first_osce boolean,
 add column if not exists birth_date date;

create or replace function public.nptc_student_update_profile(body jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception '請先登入。' using errcode='42501'; end if;
 if jsonb_typeof(body->'nursingYears') is distinct from 'number' or jsonb_typeof(body->'hospital') is distinct from 'string' or jsonb_typeof(body->'unit') is distinct from 'string' or jsonb_typeof(body->'examSpecialty') is distinct from 'string' or jsonb_typeof(body->'firstOsce') is distinct from 'boolean' or jsonb_typeof(body->'birthDate') is distinct from 'string' then raise exception '請完整填寫個人資料。'; end if;
 update nptc_private.students set nursing_years=(body->>'nursingYears')::integer,hospital=trim(body->>'hospital'),unit=trim(body->>'unit'),exam_specialty=body->>'examSpecialty',first_osce=(body->>'firstOsce')::boolean,birth_date=(body->>'birthDate')::date,updated_at=now(),updated_by=auth.uid() where email=lower(auth.jwt()->>'email');
 if not found then raise exception '找不到學員名冊資料。'; end if;
 return '{"ok":true}';
end;$$;

-- 讓學員讀取自己的基本資料；成績與題目仍只在公告後回傳。
create or replace function public.nptc_student_data() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception '請先登入。' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'email',s.email,'phone',s.phone,'workshopName',w.name,'published',w.published,'profile',jsonb_build_object('nursingYears',s.nursing_years,'hospital',coalesce(s.hospital,''),'unit',coalesce(s.unit,''),'examSpecialty',coalesce(s.exam_specialty,''),'firstOsce',s.first_osce,'birthDate',coalesce(s.birth_date::text,'')),'stations',case when w.published=1 then w.stations else '[]'::jsonb end,'updatedAt',case when w.published=1 then s.updated_at end,'grades',case when w.published=1 then jsonb_build_array(jsonb_build_object('key','q1','score',s.q1_score,'rating',s.q1_rating,'feedback',s.q1_feedback),jsonb_build_object('key','q2','score',s.q2_score,'rating',s.q2_rating,'feedback',s.q2_feedback),jsonb_build_object('key','q3','score',s.q3_score,'rating',s.q3_rating,'feedback',s.q3_feedback),jsonb_build_object('key','q4','score',s.q4_score,'rating',s.q4_rating,'feedback',s.q4_feedback)) else '[]'::jsonb end,'thresholds',case when w.published=1 then nptc_private.thresholds(w.id) else '[]'::jsonb end) order by w.created_at desc,w.id),'[]') into result from nptc_private.students s join nptc_private.workshops w on w.id=s.workshop_id where s.email=lower(auth.jwt()->>'email');
 return jsonb_build_object('records',result);
end;$$;
revoke all on function public.nptc_student_update_profile(jsonb) from public,anon;
grant execute on function public.nptc_student_update_profile(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
