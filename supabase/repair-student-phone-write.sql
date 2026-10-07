-- 手機欄位已整合至現行升級，不再以字串替換修改正式函式。
begin;
do $$ begin
 if to_regclass('nptc_private.schema_migrations') is not null then
  if exists(select 1 from nptc_private.schema_migrations where version>=2026100701) then
   raise notice '目前版本已包含手機欄位與名冊寫入修正，不需另外修補。';
   return;
  end if;
 end if;
 raise exception '請完成 README 前置升級並執行 upgrade-project-consistency.sql，保留完整權限與新版寫入規則。';
end;$$;
commit;
