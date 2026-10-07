-- 現行版本 2026100701。適用已完成五面向、學員啟用、管理員角色與敏感操作的環境。
-- 新安裝使用 install.sql；請整份執行，可重跑。醫院種子由 scripts/build-supabase.mjs 產生。
begin;
do $$ begin
 if to_regprocedure('nptc_private.student_identity()') is null
 or to_regprocedure('nptc_private.require_fresh_admin_password()') is null
 or not exists(select 1 from information_schema.columns where table_schema='nptc_private' and table_name='station_grades' and column_name='domain_scores') then
  raise exception '前置升級未完成，請依 README 的既有環境升級順序操作。';
 end if;
end; $$;

create table if not exists nptc_private.schema_migrations(version bigint primary key, installed_at timestamptz not null default now());
alter table nptc_private.schema_migrations enable row level security;
alter table nptc_private.workshops add column if not exists stations_revision integer not null default 0 check(stations_revision>=0);
create table if not exists nptc_private.hospital_directory(name text primary key, city text not null, level text not null);
alter table nptc_private.hospital_directory enable row level security;
create table if not exists nptc_private.workshop_create_requests(
 admin_id uuid not null, request_id uuid not null, name text not null, workshop_id uuid not null,
 primary key(admin_id,request_id));
alter table nptc_private.workshop_create_requests enable row level security;
create table if not exists nptc_private.student_email_changes(
 id uuid primary key default gen_random_uuid(),user_id uuid not null,previous_email text not null,new_email text not null,
 changed_at timestamptz not null default now());
alter table nptc_private.student_email_changes enable row level security;
revoke all on all tables in schema nptc_private from public,anon,authenticated;

-- BEGIN HOSPITAL DIRECTORY
delete from nptc_private.hospital_directory;
insert into nptc_private.hospital_directory(name,city,level) values
('三軍總醫院松山分院附設民眾診療服務處','臺北市','醫院評鑑合格（區域醫院）'),
('三軍總醫院附設民眾診療服務處及其汀州院區','臺北市','醫院評鑑優等（醫學中心）'),
('三軍總醫院澎湖分院附設民眾診療服務處','澎湖縣','醫院評鑑合格（地區醫院）'),
('大千綜合醫院','苗栗縣','醫院評鑑合格（地區醫院）'),
('中山醫學大學附設醫院','臺中市','醫院評鑑優等（醫學中心）'),
('中國醫藥大學北港附設醫院','雲林縣','醫院評鑑合格（區域醫院）'),
('中國醫藥大學附設醫院','臺中市','醫院評鑑優等（醫學中心）'),
('中國醫藥大學新竹附設醫院','新竹縣','醫院評鑑合格（地區醫院）'),
('仁愛醫療財團法人大里仁愛醫院','臺中市','醫院評鑑合格（區域醫院）'),
('天主教中華聖母修女會醫療財團法人天主教聖馬爾定醫院及其民權院區','嘉義市','醫院評鑑合格（區域醫院）'),
('天主教仁慈醫療財團法人仁慈醫院','新竹縣','醫院評鑑合格（地區醫院）'),
('天主教若瑟醫療財團法人若瑟醫院','雲林縣','醫院評鑑合格（地區醫院）'),
('天主教耕莘醫療財團法人永和耕莘醫院','新北市','醫院評鑑合格（地區醫院）'),
('天主教耕莘醫療財團法人耕莘醫院','新北市','醫院評鑑合格（區域醫院）'),
('天主教耕莘醫療財團法人耕莘醫院安康院區','新北市','醫院評鑑合格（地區醫院）'),
('天主教聖功醫療財團法人聖功醫院','高雄市','醫院評鑑合格（地區醫院）'),
('天主教靈醫會醫療財團法人羅東聖母醫院','宜蘭縣','醫院評鑑合格（區域醫院）'),
('天成醫院','桃園市','醫院評鑑合格（地區醫院）'),
('天成醫療社團法人天晟醫院','桃園市','醫院評鑑合格（區域醫院）'),
('台南市立醫院(委託秀傳醫療社團法人經營)','臺南市','醫院評鑑合格（區域醫院）'),
('台灣基督長老教會馬偕醫療財團法人台東馬偕紀念醫院','臺東縣','醫院評鑑合格（區域醫院）'),
('台灣基督長老教會馬偕醫療財團法人馬偕紀念醫院','臺北市','醫院評鑑優等（醫學中心）'),
('台灣基督長老教會馬偕醫療財團法人淡水馬偕紀念醫院','新北市','醫院評鑑優等（醫學中心）'),
('台灣基督長老教會馬偕醫療財團法人新竹馬偕紀念醫院','新竹市','醫院評鑑合格（區域醫院）'),
('台灣基督長老教會新樓醫療財團法人台南新樓醫院','臺南市','醫院評鑑合格（區域醫院）'),
('台灣基督長老教會新樓醫療財團法人麻豆新樓醫院','臺南市','醫院評鑑合格（地區醫院）'),
('光田醫療社團法人光田綜合醫院及其大甲院區','臺中市','醫院評鑑合格（區域醫院）'),
('行天宮醫療志業醫療財團法人恩主公醫院','新北市','醫院評鑑合格（區域醫院）'),
('西園醫療社團法人西園醫院','臺北市','醫院評鑑合格（地區醫院）'),
('佛教慈濟醫療財團法人大林慈濟醫院','嘉義縣','醫院評鑑合格（區域醫院－準醫學中心）'),
('佛教慈濟醫療財團法人台中慈濟醫院','臺中市','醫院評鑑合格（區域醫院）'),
('佛教慈濟醫療財團法人台北慈濟醫院','新北市','醫院評鑑優等（醫學中心）'),
('佛教慈濟醫療財團法人花蓮慈濟醫院','花蓮縣','醫院評鑑優等（醫學中心）'),
('李綜合醫療社團法人大甲李綜合醫院','臺中市','醫院評鑑合格（區域醫院）'),
('李綜合醫療社團法人苑裡李綜合醫院','苗栗縣','醫院評鑑合格（地區醫院）'),
('沙爾德聖保祿修女會醫療財團法人聖保祿醫院','桃園市','醫院評鑑合格（區域醫院）'),
('秀傳醫療社團法人秀傳紀念醫院','彰化縣','醫院評鑑合格（區域醫院）'),
('秀傳醫療財團法人彰濱秀傳紀念醫院','彰化縣','醫院評鑑合格（區域醫院）'),
('阮綜合醫療社團法人阮綜合醫院','高雄市','醫院評鑑合格（區域醫院）'),
('亞洲大學附屬醫院','臺中市','醫院評鑑合格（區域醫院）'),
('奇美醫療財團法人佳里奇美醫院','臺南市','醫院評鑑合格（地區醫院）'),
('奇美醫療財團法人奇美醫院及其樹林院區','臺南市','醫院評鑑優等（醫學中心）'),
('奇美醫療財團法人柳營奇美醫院','臺南市','醫院評鑑合格（區域醫院）'),
('怡仁綜合醫院','桃園市','醫院評鑑合格（地區醫院）'),
('東元醫療社團法人東元綜合醫院','新竹縣','醫院評鑑合格（區域醫院）'),
('東基醫療財團法人台東基督教醫院','臺東縣','醫院評鑑合格（地區醫院）'),
('林新醫療社團法人林新醫院','臺中市','醫院評鑑合格（區域醫院）'),
('林新醫療社團法人烏日林新醫院','臺中市','醫院評鑑合格（地區醫院）'),
('長庚醫療財團法人台北長庚紀念醫院','臺北市','醫院評鑑優等（醫學中心）'),
('長庚醫療財團法人林口長庚紀念醫院','桃園市','醫院評鑑優等（醫學中心）'),
('長庚醫療財團法人桃園長庚紀念醫院及其長青院區','桃園市','醫院評鑑合格（地區醫院）'),
('長庚醫療財團法人高雄長庚紀念醫院','高雄市','醫院評鑑優等（醫學中心）'),
('長庚醫療財團法人基隆長庚紀念醫院及其情人湖院區','基隆市','醫院評鑑合格（區域醫院）'),
('長庚醫療財團法人嘉義長庚紀念醫院','嘉義縣','醫院評鑑合格（區域醫院）'),
('屏東榮民總醫院','屏東縣','醫院評鑑合格（地區醫院）'),
('屏東榮民總醫院龍泉分院','屏東縣','醫院評鑑合格（地區醫院）'),
('屏基醫療財團法人屏東基督教醫院及其瑞光院區','屏東縣','醫院評鑑合格（區域醫院）'),
('為恭醫療財團法人為恭紀念醫院及其東興院區','苗栗縣','醫院評鑑合格（區域醫院）'),
('埔基醫療財團法人埔里基督教醫院','南投縣','醫院評鑑合格（區域醫院）'),
('振興醫療財團法人振興醫院','臺北市','醫院評鑑合格（區域醫院）'),
('財團法人私立高雄醫學大學附設中和紀念醫院','高雄市','醫院評鑑優等（醫學中心）'),
('高雄市立小港醫院（委託財團法人私立高雄醫學大學經營）','高雄市','醫院評鑑合格（區域醫院）'),
('高雄市立鳳山醫院（委託長庚醫療財團法人經營）','高雄市','醫院評鑑合格（地區醫院）'),
('高雄市立聯合醫院','高雄市','醫院評鑑合格（區域醫院）'),
('高雄榮民總醫院','高雄市','醫院評鑑優等（醫學中心）'),
('高雄榮民總醫院臺南分院','臺南市','醫院評鑑合格（地區醫院）'),
('健仁醫院','高雄市','醫院評鑑合格（地區醫院）'),
('國立台灣大學醫學院附設醫院','臺北市','醫院評鑑優等（醫學中心）'),
('國立成功大學醫學院附設醫院','臺南市','醫院評鑑優等（醫學中心）'),
('國立成功大學醫學院附設醫院斗六分院','雲林縣','醫院評鑑合格（地區醫院）'),
('國立陽明交通大學附設醫院及其新民院區','宜蘭縣','醫院評鑑合格（區域醫院）'),
('國立臺灣大學醫學院附設醫院雲林分院及其虎尾院區','雲林縣','醫院評鑑合格（區域醫院－準醫學中心）'),
('國立臺灣大學醫學院附設醫院新竹臺大分院生醫醫院及其竹東院區','新竹縣','醫院評鑑合格（區域醫院）'),
('國立臺灣大學醫學院附設醫院新竹臺大分院新竹醫院','新竹市','醫院評鑑優等（醫學中心）'),
('國立臺灣大學醫學院附設醫院癌醫中心分院','臺北市','醫院評鑑合格（區域醫院）'),
('國軍左營總醫院附設民眾診療服務處','高雄市','醫院評鑑合格（區域醫院）'),
('國軍花蓮總醫院附設民眾診療服務處','花蓮縣','醫院評鑑合格（區域醫院）'),
('國軍桃園總醫院附設民眾診療服務處','桃園市','醫院評鑑合格（區域醫院）'),
('國軍高雄總醫院附設民眾診療服務處','高雄市','醫院評鑑合格（區域醫院）'),
('國軍臺中總醫院附設民眾診療服務處','臺中市','醫院評鑑合格（區域醫院）'),
('國泰醫療財團法人汐止國泰綜合醫院','新北市','醫院評鑑合格（區域醫院）'),
('國泰醫療財團法人國泰綜合醫院','臺北市','醫院評鑑優等（醫學中心）'),
('國泰醫療財團法人新竹國泰綜合醫院','新竹市','醫院評鑑合格（地區醫院）'),
('基督復臨安息日會醫療財團法人臺安醫院','臺北市','醫院評鑑合格（區域醫院）'),
('敏盛綜合醫院','桃園市','醫院評鑑合格（區域醫院）'),
('郭綜合醫院','臺南市','醫院評鑑合格（地區醫院）'),
('博仁綜合醫院','臺北市','醫院評鑑合格（地區醫院）'),
('童綜合醫療社團法人童綜合醫院及其沙鹿院區','臺中市','醫院評鑑合格（區域醫院）'),
('新北市立土城醫院(委託長庚醫療財團法人興建經營)','新北市','醫院評鑑合格（區域醫院）'),
('新北市立聯合醫院及其板橋院區','新北市','醫院評鑑合格（區域醫院）'),
('新光醫療財團法人新光吳火獅紀念醫院','臺北市','醫院評鑑優等（醫學中心）'),
('新竹市立馬偕兒童醫院(委託台灣基督長老教會馬偕醫療財團法人興建經營)','新竹市','醫院評鑑合格（區域醫院）'),
('義大醫療財團法人義大癌治療醫院','高雄市','醫院評鑑合格（區域醫院）'),
('義大醫療財團法人義大醫院','高雄市','醫院評鑑優等（醫學中心）'),
('彰化基督教醫療財團法人二林基督教醫院','彰化縣','醫院評鑑合格（地區醫院）'),
('彰化基督教醫療財團法人員林基督教醫院','彰化縣','醫院評鑑合格（地區醫院）'),
('彰化基督教醫療財團法人雲林基督教醫院','雲林縣','醫院評鑑合格（地區醫院）'),
('彰化基督教醫療財團法人彰化基督教醫院','彰化縣','醫院評鑑優等（醫學中心）'),
('臺中榮民總醫院','臺中市','醫院評鑑優等（醫學中心）'),
('臺中榮民總醫院埔里分院','南投縣','醫院評鑑合格（地區醫院）'),
('臺中榮民總醫院嘉義分院','嘉義市','醫院評鑑合格（區域醫院）'),
('臺北市立萬芳醫院-委託臺北醫學大學辦理','臺北市','醫院評鑑優等（醫學中心）'),
('臺北市立聯合醫院中興院區','臺北市','醫院評鑑合格（區域醫院）'),
('臺北市立聯合醫院仁愛院區','臺北市','醫院評鑑合格（區域醫院）'),
('臺北市立聯合醫院和平婦幼院區及其婦幼院區','臺北市','醫院評鑑合格（區域醫院）'),
('臺北市立聯合醫院忠孝院區','臺北市','醫院評鑑合格（區域醫院）'),
('臺北市立聯合醫院陽明院區','臺北市','醫院評鑑合格（區域醫院）'),
('臺北榮民總醫院','臺北市','醫院評鑑優等（醫學中心）'),
('臺北榮民總醫院員山分院','宜蘭縣','醫院評鑑合格（地區醫院）'),
('臺北榮民總醫院桃園分院','桃園市','醫院評鑑合格（區域醫院）'),
('臺北榮民總醫院新竹分院','新竹縣','醫院評鑑合格（地區醫院）'),
('臺北醫學大學附設醫院','臺北市','醫院評鑑合格（區域醫院－準醫學中心）'),
('臺南市立安南醫院-委託中國醫藥大學興建經營','臺南市','醫院評鑑合格（區域醫院）'),
('臺灣基督教門諾會醫療財團法人門諾醫院','花蓮縣','醫院評鑑合格（區域醫院）'),
('輔仁大學學校財團法人輔仁大學附設醫院','新北市','醫院評鑑合格（區域醫院）'),
('輔英科技大學附設醫院','屏東縣','醫院評鑑合格（區域醫院）'),
('澄清綜合醫院','臺中市','醫院評鑑合格（區域醫院）'),
('澄清綜合醫院中港分院','臺中市','醫院評鑑合格（區域醫院）'),
('衛生福利部南投醫院及其中興院區','南投縣','醫院評鑑合格（區域醫院）'),
('衛生福利部屏東醫院','屏東縣','醫院評鑑合格（區域醫院）'),
('衛生福利部苗栗醫院','苗栗縣','醫院評鑑合格（區域醫院）'),
('衛生福利部桃園醫院','桃園市','醫院評鑑合格（區域醫院）'),
('衛生福利部胸腔病院','臺南市','醫院評鑑合格（地區醫院）'),
('衛生福利部基隆醫院','基隆市','醫院評鑑合格（區域醫院）'),
('衛生福利部嘉義醫院','嘉義市','醫院評鑑合格（地區醫院）'),
('衛生福利部彰化醫院','彰化縣','醫院評鑑合格（區域醫院）'),
('衛生福利部旗山醫院','高雄市','醫院評鑑合格（地區醫院）'),
('衛生福利部臺中醫院','臺中市','醫院評鑑合格（區域醫院）'),
('衛生福利部臺北醫院','新北市','醫院評鑑合格（區域醫院）'),
('衛生福利部臺南醫院','臺南市','醫院評鑑合格（區域醫院）'),
('衛生福利部樂生療養院','新北市','醫院評鑑合格（地區醫院）'),
('衛生福利部豐原醫院','臺中市','醫院評鑑合格（區域醫院）'),
('衛生福利部雙和醫院(委託臺北醫學大學興建經營)','新北市','醫院評鑑優等（醫學中心）'),
('戴德森醫療財團法人嘉義基督教醫院','嘉義市','醫院評鑑合格（區域醫院）'),
('聯新國際醫院','桃園市','醫院評鑑合格（區域醫院）'),
('醫療財團法人徐元智先生醫藥基金會亞東紀念醫院','新北市','醫院評鑑優等（醫學中心）'),
('醫療財團法人辜公亮基金會和信治癌中心醫院','臺北市','醫院評鑑合格（區域醫院）'),
('醫療財團法人羅許基金會羅東博愛醫院','宜蘭縣','醫院評鑑合格（區域醫院）'),
('寶建醫療社團法人寶建醫院','屏東縣','醫院評鑑合格（區域醫院）');
-- END HOSPITAL DIRECTORY

create or replace function public.nptc_schema_version() returns bigint
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception '請先登入。' using errcode='42501'; end if;
 return (select max(version) from nptc_private.schema_migrations);
end;$$;
create or replace function public.nptc_hospital_directory() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception '請先登入。' using errcode='42501'; end if;
 return jsonb_build_object('hospitals',(select coalesce(jsonb_agg(to_jsonb(h) order by city,name),'[]'::jsonb) from nptc_private.hospital_directory h));
end;$$;

-- 所有題目寫入經同一支函式；版本檢查防止舊草稿覆寫其他人的修改。
create or replace function public.nptc_teacher_save_stations_v3(body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w nptc_private.workshops; item jsonb; old_item jsonb; seen text[]:='{}'; v_station_key text; cleaned jsonb:='[]';
begin
 if not public.nptc_is_teacher() then raise exception '此帳號沒有一般管理員權限。' using errcode='42501'; end if;
 if jsonb_typeof(body->'workshopId') is distinct from 'string' or jsonb_typeof(body->'stations') is distinct from 'array'
 or jsonb_typeof(body->'stationsRevision') is distinct from 'number' or (body->>'stationsRevision') !~ '^[0-9]+$' then
  raise exception '請重新載入最新版題目設定後再儲存。';
 end if;
 if jsonb_array_length(body->'stations')=0 then raise exception '請至少新增一題 OSCE 題目。'; end if;
 select * into w from nptc_private.workshops where id=(body->>'workshopId')::uuid for update;
 if w.id is null then raise exception '找不到此梯次。'; end if;
 if w.archived_at is not null then raise exception '封存梯次不可修改，請先還原。'; end if;
 if w.stations_revision<>(body->>'stationsRevision')::integer then raise exception '題目設定已被其他人更新，請重新載入後再編輯。'; end if;
 for item in select value from jsonb_array_elements(body->'stations') loop
  v_station_key=trim(item->>'key');
  if jsonb_typeof(item->'key') is distinct from 'string' or coalesce(length(v_station_key),0) not between 1 and 100 or v_station_key=any(seen)
  or jsonb_typeof(item->'title') is distinct from 'string' or coalesce(length(trim(item->>'title')),0) not between 1 and 100
  or jsonb_typeof(item->'testDate') is distinct from 'string' or coalesce(item->>'testDate','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  or jsonb_typeof(item->'complaint') is distinct from 'string' or coalesce(length(trim(item->>'complaint')),0) not between 1 and 300
  or jsonb_typeof(item->'diagnosis') is distinct from 'string' or coalesce(length(trim(item->>'diagnosis')),0) not between 1 and 300
  or jsonb_typeof(item->'prompt') is distinct from 'string' or coalesce(length(trim(item->>'prompt')),0) not between 1 and 2000 then
   raise exception '每題須完成題目名稱、有效日期、主訴、診斷與命題摘要。';
  end if;
  perform (item->>'testDate')::date;
  select value into old_item from jsonb_array_elements(w.stations) where value->>'key'=v_station_key;
  if item->'domainMax' is not null and item->'domainMax'<>'null'::jsonb then perform nptc_private.validate_domain_max(item->'domainMax');
  elsif old_item is null or coalesce(length(trim(old_item->>'title')),0)=0 or (old_item->'domainMax' is not null and old_item->'domainMax'<>'null'::jsonb) then
   raise exception '新題目或已設定配分的題目必須填寫五面向滿分。';
  end if;
  if exists(select 1 from jsonb_array_elements(w.published_stations) p where p->>'key'=v_station_key) and item is distinct from old_item then
   raise exception '請先撤回本題公告，再修改題目。';
  end if;
  if old_item->'domainMax' is distinct from item->'domainMax' and exists(select 1 from nptc_private.station_grades g join nptc_private.students s on s.id=g.student_id
   where s.workshop_id=w.id and g.station_key=v_station_key and g.domain_scores is not null) then raise exception '已有分項成績，不能變更配分；請建立新題目。'; end if;
  seen=array_append(seen,v_station_key);cleaned=cleaned||jsonb_build_array(item||jsonb_build_object('key',v_station_key));
 end loop;
 if exists(select 1 from jsonb_array_elements(w.published_stations) p where not(p->>'key'=any(seen)))
 or exists(select 1 from nptc_private.station_grades g join nptc_private.students s on s.id=g.student_id where s.workshop_id=w.id and (g.score is not null or g.feedback<>'') and not(g.station_key=any(seen))) then
  raise exception '有成績、回饋或已公告的題目不可刪除。';
 end if;
 update nptc_private.workshops set stations=cleaned,stations_revision=stations_revision+1 where id=w.id;
 return jsonb_build_object('ok',true,'stationsRevision',w.stations_revision+1);
end;$$;
create or replace function public.nptc_teacher_save_stations(body jsonb) returns jsonb
language sql security definer set search_path='' as $$select public.nptc_teacher_save_stations_v3(body)$$;

-- 名冊使用目前規則直接寫入，不再轉接保留的舊版函式。
create or replace function public.nptc_teacher_write(body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare action text:=body->>'action';w nptc_private.workshops;s nptc_private.students;row_item jsonb;sid uuid;request_uuid uuid;request_record nptc_private.workshop_create_requests;affected integer;
begin
 if not public.nptc_is_teacher() then raise exception '此帳號沒有一般管理員權限。' using errcode='42501'; end if;
 if action='saveStations' then return public.nptc_teacher_save_stations_v3(body); end if;
 if action in ('publish','saveScores') then raise exception '請使用新版逐題公告與五面向成績表。'; end if;
 if action='createWorkshop' then
  if jsonb_typeof(body->'name') is distinct from 'string' or length(trim(body->>'name')) not between 1 and 100
  or jsonb_typeof(body->'requestId') is distinct from 'string' then raise exception '請完整輸入梯次名稱，並重新載入新版建立表單。'; end if;
  request_uuid=(body->>'requestId')::uuid;
  insert into nptc_private.workshop_create_requests(admin_id,request_id,name,workshop_id)
   values(auth.uid(),request_uuid,trim(body->>'name'),gen_random_uuid()) on conflict do nothing;
  get diagnostics affected=row_count;
  select * into request_record from nptc_private.workshop_create_requests where admin_id=auth.uid() and request_id=request_uuid for update;
  if request_record.name is distinct from trim(body->>'name') then raise exception '上次建立請求的名稱不同，請先重新整理確認建立結果。'; end if;
  if affected=0 and not exists(select 1 from nptc_private.workshops where id=request_record.workshop_id) then raise exception '先前建立的梯次已刪除，請重新建立。'; end if;
  insert into nptc_private.workshops(id,name) values(request_record.workshop_id,request_record.name) on conflict(id) do nothing;
  return jsonb_build_object('id',request_record.workshop_id);
 end if;
 if action is null or action not in ('saveStudent','deleteStudent','bulkImportStudents') then raise exception '不支援的操作。'; end if;
 select * into w from nptc_private.workshops where id=(body->>'workshopId')::uuid for update;
 if w.id is null then raise exception '找不到此梯次。'; end if;
 if w.archived_at is not null then raise exception '封存梯次不可修改，請先還原。'; end if;
 if jsonb_array_length(w.published_stations)>0 then raise exception '請先撤回本梯次所有題目公告，再修改名冊。'; end if;
 if action='bulkImportStudents' then
  if jsonb_typeof(body->'students') is distinct from 'array' or jsonb_array_length(body->'students')=0 then raise exception '請至少提供一位學員。'; end if;
  for row_item in select value from jsonb_array_elements(body->'students') loop
   if jsonb_typeof(row_item->'name') is distinct from 'string' or jsonb_typeof(row_item->'email') is distinct from 'string'
    or jsonb_typeof(row_item->'phone') is distinct from 'string' or trim(row_item->>'phone') !~ '^09[0-9]{8}$' then raise exception '請完整填寫姓名、Email 與有效手機。'; end if;
   insert into nptc_private.students(workshop_id,name,email,phone,updated_by)
    values(w.id,trim(row_item->>'name'),lower(trim(row_item->>'email')),trim(row_item->>'phone'),auth.uid());
  end loop;
  return '{"ok":true}';
 end if;
 if body->>'id' is not null then
  if jsonb_typeof(body->'revision') is distinct from 'number' or (body->>'revision') !~ '^[0-9]+$' then raise exception '資料版本不正確。'; end if;
  select * into s from nptc_private.students where id=(body->>'id')::uuid and workshop_id=w.id and revision=(body->>'revision')::integer for update;
  if s.id is null then raise exception '資料已更新或已被刪除，請重新載入。'; end if;
 end if;
 if action='deleteStudent' then
  if s.id is null then raise exception '請指定欲刪除的學員。'; end if;
  delete from nptc_private.students where id=s.id;
 else
  if jsonb_typeof(body->'name') is distinct from 'string' or jsonb_typeof(body->'email') is distinct from 'string'
   or jsonb_typeof(body->'phone') is distinct from 'string' or trim(body->>'phone') !~ '^09[0-9]{8}$' then raise exception '請完整填寫姓名、Email 與有效手機。'; end if;
  if s.id is not null and s.email is distinct from lower(trim(body->>'email')) and
   (body ? 'profile' or exists(select 1 from auth.users where lower(email)=s.email) or exists(select 1 from nptc_private.student_accounts where email=s.email)) then
   raise exception '已建立帳號的登入 Email 不可直接改名冊，請聯絡系統管理者處理。';
  end if;
  if s.id is null then
   insert into nptc_private.students(workshop_id,name,email,phone,updated_by) values(w.id,trim(body->>'name'),lower(trim(body->>'email')),trim(body->>'phone'),auth.uid());
  else
   update nptc_private.students set name=trim(body->>'name'),email=lower(trim(body->>'email')),phone=trim(body->>'phone'),revision=revision+1,updated_at=now(),updated_by=auth.uid() where id=s.id;
   if body ? 'profile' then
    row_item=body->'profile';
    if jsonb_typeof(row_item) is distinct from 'object'
      or not row_item ?& array['nursingYears','hospital','unit','examSpecialty','firstOsce','birthDate']
      or (row_item->'nursingYears'<>'null'::jsonb and (jsonb_typeof(row_item->'nursingYears')<>'number' or (row_item->>'nursingYears') !~ '^[0-9]+$' or (row_item->>'nursingYears')::numeric not between 0 and 60))
      or jsonb_typeof(row_item->'hospital') is distinct from 'string'
      or jsonb_typeof(row_item->'unit') is distinct from 'string' or length(trim(row_item->>'unit'))>100
      or jsonb_typeof(row_item->'examSpecialty') is distinct from 'string' or row_item->>'examSpecialty' not in ('','內科','精神科','兒科','外科','婦產科','麻醉科','家庭科')
      or jsonb_typeof(row_item->'firstOsce') not in ('boolean','null')
      or jsonb_typeof(row_item->'birthDate') not in ('string','null')
      then raise exception '請確認學員基本資料格式。'; end if;
    if row_item->>'hospital'<>'' and not exists(select 1 from nptc_private.hospital_directory where name=row_item->>'hospital') then raise exception '請從官方醫院名冊選擇服務醫院。'; end if;
    if row_item->>'birthDate' is not null and ((row_item->>'birthDate') !~ '^\d{4}-\d{2}-\d{2}$' or (row_item->>'birthDate')::date not between date '1900-01-01' and current_date) then raise exception '請確認出生年月日。'; end if;
    update nptc_private.students set nursing_years=(row_item->>'nursingYears')::integer,
      hospital=nullif(row_item->>'hospital',''),unit=nullif(trim(row_item->>'unit'),''),exam_specialty=nullif(row_item->>'examSpecialty',''),
      first_osce=(row_item->>'firstOsce')::boolean,birth_date=(row_item->>'birthDate')::date where id=s.id;
   end if;
  end if;
 end if;
 return '{"ok":true}';
exception when unique_violation then raise exception '此梯次已有相同的手機電話或 Email。';
 when check_violation or not_null_violation then raise exception '請確認姓名、Email 與手機電話格式。';
end;$$;

create or replace function public.nptc_teacher_publish_station(body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w nptc_private.workshops;station text:=body->>'station';should_publish boolean;
begin
 if not public.nptc_is_teacher() then raise exception '此帳號沒有一般管理員權限。' using errcode='42501'; end if;
 if jsonb_typeof(body->'published') is distinct from 'boolean' then raise exception '公布狀態不正確。'; end if;
 should_publish=(body->>'published')::boolean;
 select * into w from nptc_private.workshops where id=(body->>'workshopId')::uuid for update;
 if w.id is null then raise exception '找不到此梯次。'; end if;
 if w.archived_at is not null then raise exception '封存梯次不可修改，請先還原。'; end if;
 if not exists(select 1 from jsonb_array_elements(w.stations) x where x->>'key'=station) then raise exception '找不到指定題目。'; end if;
 if should_publish and not exists(select 1 from nptc_private.station_grades g join nptc_private.students s on s.id=g.student_id where s.workshop_id=w.id and g.station_key=station and g.score is not null) then raise exception '本題至少要有一筆已登錄成績才能公布。'; end if;
 update nptc_private.workshops set published_stations=case when should_publish then
  (select coalesce(jsonb_agg(distinct jsonb_build_object('key',v)),'[]'::jsonb) from unnest(array_append(array(select p->>'key' from jsonb_array_elements(published_stations) p),station)) v)
 else (select coalesce(jsonb_agg(p),'[]'::jsonb) from jsonb_array_elements(published_stations) p where p->>'key'<>station) end,
 published=0,stations_revision=stations_revision+1 where id=w.id;
 return '{"ok":true}';
end;$$;

create or replace function public.nptc_student_update_profile(body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e text:=nptc_private.student_identity();
begin
 if not public.nptc_is_teacher() and not exists(select 1 from nptc_private.student_accounts where user_id=auth.uid() and email=e) then raise exception '請先核對學員名冊。' using errcode='42501'; end if;
 if jsonb_typeof(body->'nursingYears') is distinct from 'number' or (body->>'nursingYears')::numeric not between 0 and 60
 or (body->>'nursingYears')::numeric<>trunc((body->>'nursingYears')::numeric) or jsonb_typeof(body->'firstOsce') is distinct from 'boolean'
 or jsonb_typeof(body->'hospital') is distinct from 'string' or jsonb_typeof(body->'unit') is distinct from 'string'
 or coalesce(length(trim(body->>'unit')),0) not between 1 and 100
 or coalesce(body->>'examSpecialty','') not in ('內科','精神科','兒科','外科','婦產科','麻醉科','家庭科')
 or coalesce(body->>'birthDate','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception '請完整填寫有效的個人資料。'; end if;
 if not exists(select 1 from nptc_private.hospital_directory where name=body->>'hospital') then raise exception '請從目前的官方醫院名冊選擇服務醫院。'; end if;
 if (body->>'birthDate')::date>current_date or (body->>'birthDate')::date<date '1900-01-01' then raise exception '請確認出生年月日。'; end if;
 update nptc_private.students s set nursing_years=(body->>'nursingYears')::integer,hospital=body->>'hospital',unit=trim(body->>'unit'),
 exam_specialty=body->>'examSpecialty',first_osce=(body->>'firstOsce')::boolean,birth_date=(body->>'birthDate')::date,updated_at=now(),updated_by=auth.uid()
 where s.email=e and exists(select 1 from nptc_private.workshops w where w.id=s.workshop_id and w.archived_at is null);
 if not found then raise exception '目前沒有可更新的未封存學員名冊，請聯絡管理員。'; end if;
 return '{"ok":true}';
end;$$;

-- Email 變更須先由 Auth 完成信箱確認，再依相同 user_id 同步歷史名冊。
create or replace function nptc_private.reject_archived_workshop_change() returns trigger
language plpgsql set search_path='' as $$
declare target uuid;
begin
 if TG_OP='DELETE' and current_setting('nptc.delete_archived_workshop',true)='on' then return old; end if;
 if TG_TABLE_NAME='workshops' then
  if TG_OP='DELETE' then raise exception '請先封存梯次，再由系統管理者刪除。'; end if;
  if old.archived_at is not null and (new.archived_at is not null or (new.name,new.published,new.stations,new.published_stations,new.stations_revision)
   is distinct from (old.name,old.published,old.stations,old.published_stations,old.stations_revision)) then raise exception '封存梯次不可修改，請先還原。'; end if;
  return new;
 end if;
 if TG_TABLE_NAME='students' then
  if TG_OP='UPDATE' and current_setting('nptc.student_email_sync',true)=auth.uid()::text and new.email=lower(auth.jwt()->>'email')
   and old.email is distinct from new.email and (to_jsonb(new)-array['email','revision','updated_at','updated_by']) is not distinct from (to_jsonb(old)-array['email','revision','updated_at','updated_by']) then return new; end if;
  target=case when TG_OP='DELETE' then old.workshop_id else new.workshop_id end;
 else select s.workshop_id into target from nptc_private.students s where s.id=case when TG_OP='DELETE' then old.student_id else new.student_id end; end if;
 if exists(select 1 from nptc_private.workshops w where w.id=target and w.archived_at is not null) then raise exception '封存梯次不可修改，請先還原。'; end if;
 if TG_OP='DELETE' then return old; end if;
 return new;
end;$$;
create or replace function public.nptc_sync_student_email() returns jsonb
language plpgsql security definer set search_path='' as $$
declare e text:=nptc_private.student_identity();previous text;
begin
 select email into previous from nptc_private.student_accounts where user_id=auth.uid() for update;
 if previous is null or previous=e then return '{"ok":true}'; end if;
 if exists(select 1 from nptc_private.teachers where email in(previous,e)) then raise exception '後臺帳號的 Email 變更請聯絡系統管理者。'; end if;
 perform set_config('nptc.student_email_sync',auth.uid()::text,true);
 update nptc_private.students set email=e,revision=revision+1,updated_at=now(),updated_by=auth.uid() where email=previous;
 update nptc_private.student_accounts set email=e where user_id=auth.uid();
 insert into nptc_private.student_email_changes(user_id,previous_email,new_email) values(auth.uid(),previous,e);
 perform set_config('nptc.student_email_sync','',true);
 return '{"ok":true}';
exception when unique_violation then raise exception '新 Email 與既有名冊衝突，請聯絡系統管理者核對，原紀錄仍保留。';
end;$$;

-- BEGIN CURRENT READ FUNCTIONS
create or replace function nptc_private.teacher_data(requested_workshop uuid default null,include_archived boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare selected nptc_private.workshops; items jsonb; roster jsonb;
begin
 if not public.nptc_is_teacher() then raise exception '此帳號沒有一般管理員權限。' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(w) || jsonb_build_object('publishedStations',coalesce((select jsonb_agg(p->>'key') from jsonb_array_elements(w.published_stations) p),'[]'::jsonb)) order by w.created_at desc,w.id),'[]'::jsonb)
  into items from nptc_private.workshops w where (include_archived or w.archived_at is null);
 select * into selected from nptc_private.workshops w where (include_archived or w.archived_at is null)
  order by (w.id=requested_workshop) desc nulls last,w.created_at desc,w.id limit 1;
 select coalesce(jsonb_agg(to_jsonb(s) || coalesce((select jsonb_object_agg(g.station_key||'_domains',g.domain_scores) from nptc_private.station_grades g where g.student_id=s.id),'{}'::jsonb) || jsonb_build_object('account_registered',exists(select 1 from auth.users u where lower(trim(u.email))=lower(trim(s.email))),'account_activated_at',(select a.activated_at from nptc_private.student_accounts a join auth.users u on u.id=a.user_id and lower(trim(u.email))=lower(trim(a.email)) where lower(trim(a.email))=lower(trim(s.email)) limit 1)) || coalesce((select jsonb_object_agg(g.station_key||'_score',g.score) from nptc_private.station_grades g where g.student_id=s.id),'{}'::jsonb) || coalesce((select jsonb_object_agg(g.station_key||'_rating',g.rating) from nptc_private.station_grades g where g.student_id=s.id),'{}'::jsonb) || coalesce((select jsonb_object_agg(g.station_key||'_feedback',g.feedback) from nptc_private.station_grades g where g.student_id=s.id),'{}'::jsonb) order by s.phone,s.name),'[]'::jsonb)
  into roster from nptc_private.students s where s.workshop_id=selected.id;
 return jsonb_build_object('includesArchived',include_archived,'workshops',items,'selected',case when selected.id is null then null else to_jsonb(selected) || jsonb_build_object('publishedStations',coalesce((select jsonb_agg(p->>'key') from jsonb_array_elements(selected.published_stations) p),'[]'::jsonb)) end,'students',roster,'thresholds',case when selected.id is null then '[]'::jsonb else nptc_private.dynamic_thresholds(selected.id) end);
end;$$;


create or replace function public.nptc_teacher_data(requested_workshop uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$select nptc_private.teacher_data(requested_workshop,false)$$;
create or replace function public.nptc_analysis_data(requested_workshop uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$select nptc_private.teacher_data(requested_workshop,public.nptc_is_account_reviewer())$$;
revoke all on function nptc_private.teacher_data(uuid,boolean) from public,anon,authenticated;
revoke all on function public.nptc_teacher_data(uuid),public.nptc_analysis_data(uuid) from public,anon;
grant execute on function public.nptc_teacher_data(uuid),public.nptc_analysis_data(uuid) to authenticated;

create or replace function public.nptc_student_onboarding_status() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare e text:=nptc_private.student_identity(); a nptc_private.student_accounts; s nptc_private.students;
begin
 select * into a from nptc_private.student_accounts where user_id=auth.uid() and email=e;
 if a.user_id is null then return jsonb_build_object('stage','unclaimed'); end if;
 select student.* into s from nptc_private.students student join nptc_private.workshops w on w.id=student.workshop_id where student.email=e order by (w.archived_at is null) desc,student.updated_at desc nulls last,student.id limit 1;
 if s.id is null then raise exception '目前沒有您的學員名冊，請聯絡管理員。'; end if;
 return jsonb_build_object('stage',case when a.activated_at is null then 'profile' else 'active' end,
 'student',jsonb_build_object('name',s.name,'email',s.email,'phone',s.phone,
 'nursingYears',s.nursing_years,'hospital',s.hospital,'unit',s.unit,
 'examSpecialty',s.exam_specialty,'firstOsce',s.first_osce,'birthDate',s.birth_date));
end;$$;

create or replace function public.nptc_claim_student(body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e text:=nptc_private.student_identity();
begin
 if not exists(select 1 from nptc_private.students where email=e and trim(name)=trim(body->>'name')
  and regexp_replace(phone,'[[:space:]-]','','g')=regexp_replace(body->>'phone','[[:space:]-]','','g')
  and length(coalesce(body->>'phone',''))>=10) then
  raise exception '姓名、Email 與手機未能對應名冊，請確認資料或聯絡管理員。';
 end if;
 insert into nptc_private.student_accounts(user_id,email) values(auth.uid(),e)
 on conflict(user_id) do nothing;
 return public.nptc_student_onboarding_status();
end;$$;

create or replace function public.nptc_student_data() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare e text:=nptc_private.student_identity();
begin
 if not public.nptc_is_teacher() and not exists(select 1 from nptc_private.student_accounts
 where user_id=auth.uid() and email=e and activated_at is not null) then
  raise exception '請先完成首次啟用、個人資料與密碼設定。' using errcode='42501';
 end if;
 return nptc_private.student_data_before_activation();
end;$$;

create or replace function public.nptc_finish_student_activation() returns jsonb
language plpgsql security definer set search_path='' as $$
declare e text:=nptc_private.student_identity();
begin
 if not exists(select 1 from auth.users where id=auth.uid() and length(encrypted_password)>0) then
  raise exception '請先設定登入密碼。';
 end if;
 if not exists(select 1 from nptc_private.students where email=e and nursing_years is not null
  and length(trim(hospital))>0 and length(trim(unit))>0 and exam_specialty is not null
  and first_osce is not null and birth_date between date '1900-01-01' and current_date) then
  raise exception '請先完整填寫個人資料。';
 end if;
 update nptc_private.student_accounts set activated_at=coalesce(activated_at,now()) where user_id=auth.uid() and email=e;
 if not found then raise exception '請先核對學員名冊。'; end if;
 return '{"ok":true}';
end;$$;

create or replace function nptc_private.student_data_before_activation() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception '請先登入。' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'email',s.email,'phone',s.phone,'workshopName',w.name,'archived',w.archived_at is not null,'published',case when jsonb_array_length(w.published_stations)>0 then 1 else 0 end,'profile',jsonb_build_object('nursingYears',s.nursing_years,'hospital',coalesce(s.hospital,''),'unit',coalesce(s.unit,''),'examSpecialty',coalesce(s.exam_specialty,''),'firstOsce',s.first_osce,'birthDate',coalesce(s.birth_date::text,'')),'stations',coalesce((select jsonb_agg(x.value order by x.ordinality) from jsonb_array_elements(w.stations) with ordinality x(value,ordinality) where exists(select 1 from jsonb_array_elements(w.published_stations) p where p->>'key'=x.value->>'key')),'[]'::jsonb),'updatedAt',s.updated_at,'grades',coalesce((select jsonb_agg(jsonb_build_object('key',g.station_key,'score',g.score,'rating',g.rating,'feedback',g.feedback,'domains',g.domain_scores)) from nptc_private.station_grades g where g.student_id=s.id and exists(select 1 from jsonb_array_elements(w.published_stations) p where p->>'key'=g.station_key)),'[]'::jsonb),'thresholds',nptc_private.dynamic_thresholds(w.id,true)) order by w.created_at desc,w.id),'[]'::jsonb) into result from nptc_private.students s join nptc_private.workshops w on w.id=s.workshop_id where s.email=lower(auth.jwt()->>'email');
 return jsonb_build_object('records',result);
end;$$;

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

create or replace function public.nptc_teacher_batch_scores_v2(body jsonb) returns jsonb language sql security definer set search_path='' as $$select public.nptc_teacher_batch_scores_v3(body)$$;

create or replace function public.nptc_verify_student_roster(body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare normalized_email text := lower(trim(body->>'email')); attempt_count integer;
begin
 if coalesce(normalized_email,'')='' then return jsonb_build_object('ok',false); end if;
 insert into nptc_private.activation_attempts as a(email_hash,attempts,started_at)
 values(encode(sha256(convert_to(normalized_email,'UTF8')),'hex'),1,now())
 on conflict(email_hash) do update set
 attempts=case when a.started_at < now()-interval '1 hour' then 1 else a.attempts+1 end,
 started_at=case when a.started_at < now()-interval '1 hour' then now() else a.started_at end
 returning attempts into attempt_count;
 if attempt_count>5 then return jsonb_build_object('ok',false); end if;
 if exists(select 1 from nptc_private.students s
  where lower(trim(s.email))=normalized_email and trim(s.name)=trim(body->>'name')
  and s.phone=body->>'phone' and coalesce(s.phone,'') ~ '^09[0-9]{8}$')
  and exists(select 1 from auth.users u where lower(u.email)=normalized_email) then
  return jsonb_build_object('ok',false,'code',case when exists(
   select 1 from nptc_private.student_accounts a join auth.users u on u.id=a.user_id
   where lower(a.email)=normalized_email and lower(u.email)=normalized_email and a.activated_at is not null
  ) then 'already_activated' else 'account_exists' end);
 end if;
 if exists(select 1 from auth.users u where lower(u.email)=normalized_email) then
  return jsonb_build_object('ok',false);
 end if;
 if not exists(select 1 from nptc_private.students s join nptc_private.workshops w on w.id=s.workshop_id
   where w.archived_at is null and lower(trim(s.email))=normalized_email and trim(s.name)=trim(body->>'name')
  and s.phone=body->>'phone' and coalesce(s.phone,'') ~ '^09[0-9]{8}$') then
  return jsonb_build_object('ok',false);
 end if;
 return jsonb_build_object('ok',true,'email',normalized_email);
end; $$;

create or replace function nptc_private.require_fresh_admin_password() returns void
language plpgsql security definer set search_path='' as $$
declare session_key text:=auth.jwt()->>'session_id'; password_at timestamptz;
begin
 if not public.nptc_is_account_reviewer() then
  raise exception '只有系統管理者可執行此操作。' using errcode='42501';
 end if;
 select to_timestamp((method->>'timestamp')::double precision) into password_at
 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) method
 where method->>'method'='password' and jsonb_typeof(method->'timestamp')='number'
 order by (method->>'timestamp')::double precision desc limit 1;
 if coalesce(session_key,'')='' or password_at is null
  or password_at < now()-interval '2 minutes' or password_at > now()+interval '30 seconds' then
  raise exception '請重新輸入系統管理者帳號與密碼。' using errcode='42501';
 end if;
 delete from nptc_private.workshop_action_sessions where used_at < now()-interval '7 days';
 insert into nptc_private.workshop_action_sessions(session_id,admin_id) values(session_key,auth.uid())
 on conflict do nothing;
 if not found then
  raise exception '本次密碼驗證已使用，請重新輸入帳號與密碼。' using errcode='42501';
 end if;
end;$$;

create or replace function public.nptc_set_workshop_archived(body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target uuid; archive boolean;
begin
 if not public.nptc_is_account_reviewer() then raise exception '只有系統管理者可封存或還原梯次。' using errcode='42501'; end if;
 if jsonb_typeof(body->'workshopId') is distinct from 'string' or jsonb_typeof(body->'archived') is distinct from 'boolean' then raise exception '梯次資料不正確。'; end if;
 target=(body->>'workshopId')::uuid; archive=(body->>'archived')::boolean;
 if archive then perform nptc_private.require_fresh_admin_password(); end if;
 update nptc_private.workshops set archived_at=case when archive then now() else null end
  where id=target and (archived_at is null)=archive;
 if not found then raise exception '梯次不存在或狀態已變更，請重新整理。'; end if;
 return '{"ok":true}'::jsonb;
end;$$;

create or replace function public.nptc_delete_archived_workshop(body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target uuid; actual_name text;
begin
 if jsonb_typeof(body->'workshopId') is distinct from 'string' or jsonb_typeof(body->'name') is distinct from 'string' then
  raise exception '梯次資料不正確。';
 end if;
 target=(body->>'workshopId')::uuid;
 perform nptc_private.require_fresh_admin_password();
 select name into actual_name from nptc_private.workshops where id=target and archived_at is not null for update;
 if not found then raise exception '只能刪除已封存的梯次，請重新整理。'; end if;
 if body->>'name' is distinct from actual_name then raise exception '梯次名稱不符，請重新確認。'; end if;
 perform set_config('nptc.delete_archived_workshop','on',true);
 delete from nptc_private.station_grades g using nptc_private.students s
  where g.student_id=s.id and s.workshop_id=target;
 delete from nptc_private.students where workshop_id=target;
 delete from nptc_private.workshops where id=target;
 perform set_config('nptc.delete_archived_workshop','off',true);
 return '{"ok":true}'::jsonb;
end;$$;
-- END CURRENT READ FUNCTIONS

-- 明確關閉已廢止的入口，保留現行批次成績 RPC 的完整驗證。
do $$ begin
 if to_regprocedure('public.nptc_issue_student_invitation(uuid)') is not null then execute 'revoke all on function public.nptc_issue_student_invitation(uuid) from public,anon,authenticated'; end if;
 if to_regprocedure('public.nptc_consume_student_invitation(jsonb)') is not null then execute 'revoke all on function public.nptc_consume_student_invitation(jsonb) from public,anon,authenticated,service_role'; end if;
 if to_regprocedure('nptc_private.teacher_write_before_domains(jsonb)') is not null then execute 'revoke all on function nptc_private.teacher_write_before_domains(jsonb) from public,anon,authenticated'; end if;
 if to_regprocedure('public.nptc_teacher_batch_scores(jsonb)') is not null then execute 'revoke all on function public.nptc_teacher_batch_scores(jsonb) from public,anon,authenticated'; end if;
end;$$;
revoke all on function public.nptc_verify_student_roster(jsonb) from public,anon,authenticated;
grant execute on function public.nptc_verify_student_roster(jsonb) to service_role;
revoke all on function public.nptc_teacher_batch_scores_v2(jsonb),public.nptc_teacher_batch_scores_v3(jsonb),
public.nptc_student_onboarding_status(),public.nptc_claim_student(jsonb),public.nptc_student_data(),public.nptc_finish_student_activation(),
public.nptc_set_workshop_archived(jsonb),public.nptc_delete_archived_workshop(jsonb) from public,anon;
grant execute on function public.nptc_teacher_batch_scores_v2(jsonb),public.nptc_teacher_batch_scores_v3(jsonb),
public.nptc_student_onboarding_status(),public.nptc_claim_student(jsonb),public.nptc_student_data(),public.nptc_finish_student_activation(),
public.nptc_set_workshop_archived(jsonb),public.nptc_delete_archived_workshop(jsonb) to authenticated;
revoke all on function nptc_private.require_fresh_admin_password() from public,anon,authenticated;
revoke all on function public.nptc_schema_version(),public.nptc_hospital_directory(),public.nptc_sync_student_email(),public.nptc_teacher_write(jsonb),
 public.nptc_teacher_save_stations_v3(jsonb),public.nptc_teacher_save_stations(jsonb),public.nptc_teacher_publish_station(jsonb) from public,anon;
grant execute on function public.nptc_schema_version(),public.nptc_hospital_directory(),public.nptc_sync_student_email(),public.nptc_teacher_write(jsonb),
 public.nptc_teacher_save_stations_v3(jsonb),public.nptc_teacher_save_stations(jsonb),public.nptc_teacher_publish_station(jsonb) to authenticated;
revoke all on function nptc_private.reject_archived_workshop_change() from public,anon,authenticated;
insert into nptc_private.schema_migrations(version) values(2026100701) on conflict do nothing;
notify pgrst,'reload schema';
commit;
