-- 補齊曾漏執行的手機欄位升級，不覆寫現有登入與權限函式。
begin;
alter table nptc_private.students add column if not exists phone text;
alter table nptc_private.students alter column national_id drop not null;
create unique index if not exists students_workshop_phone_unique
 on nptc_private.students(workshop_id,phone) where phone is not null;
notify pgrst,'reload schema';
commit;
