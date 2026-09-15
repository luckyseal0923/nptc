-- 在 upgrade-student-activation.sql 與 upgrade-dynamic-osce-stations.sql 之後執行。
-- 僅回傳名冊對應帳號的註冊狀態，不回傳認證資料。可重複執行。
begin;
create or replace function public.nptc_teacher_data(requested_workshop uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare selected nptc_private.workshops; items jsonb; roster jsonb;
begin
 if not public.nptc_is_teacher() then raise exception '此帳號沒有老師權限。' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(w) || jsonb_build_object('publishedStations',coalesce((select jsonb_agg(p->>'key') from jsonb_array_elements(w.published_stations) p),'[]'::jsonb)) order by w.created_at desc,w.id),'[]'::jsonb) into items from nptc_private.workshops w;
 select * into selected from nptc_private.workshops w order by (w.id=requested_workshop) desc nulls last,w.created_at desc,w.id limit 1;
 select coalesce(jsonb_agg(to_jsonb(s) || jsonb_build_object('account_registered',exists(select 1 from auth.users u where lower(trim(u.email))=lower(trim(s.email))),'account_activated_at',(select a.activated_at from nptc_private.student_accounts a join auth.users u on u.id=a.user_id and lower(trim(u.email))=lower(trim(a.email)) where lower(trim(a.email))=lower(trim(s.email)) limit 1)) || coalesce((select jsonb_object_agg(g.station_key||'_score',g.score) from nptc_private.station_grades g where g.student_id=s.id),'{}'::jsonb) || coalesce((select jsonb_object_agg(g.station_key||'_rating',g.rating) from nptc_private.station_grades g where g.student_id=s.id),'{}'::jsonb) || coalesce((select jsonb_object_agg(g.station_key||'_feedback',g.feedback) from nptc_private.station_grades g where g.student_id=s.id),'{}'::jsonb) order by s.phone,s.name),'[]'::jsonb) into roster from nptc_private.students s where s.workshop_id=selected.id;
 return jsonb_build_object('workshops',items,'selected',case when selected.id is null then null else to_jsonb(selected) || jsonb_build_object('publishedStations',coalesce((select jsonb_agg(p->>'key') from jsonb_array_elements(selected.published_stations) p),'[]'::jsonb)) end,'students',roster,'thresholds',case when selected.id is null then '[]'::jsonb else nptc_private.dynamic_thresholds(selected.id) end);
end;$$;
revoke all on function public.nptc_teacher_data(uuid) from public,anon;
grant execute on function public.nptc_teacher_data(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
