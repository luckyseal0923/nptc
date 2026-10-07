# 為國考而訓：React／Vite 前端與 Supabase

前端是 React＋Vite 靜態網站，建置結果在 dist/。資料庫讀寫透過 Supabase RPC，學員首次啟用由 Edge Function 處理。本文以資料庫版本 2026100701 為準。

正式網站：[nptc-wfh.zeabur.app](https://nptc-wfh.zeabur.app/)。老師使用 [/teacher/](https://nptc-wfh.zeabur.app/teacher/)，學員使用 [/student/](https://nptc-wfh.zeabur.app/student/)。正式 Auth 回跳設定以 backend-password-login.md 的四個路徑為準。

## 登入與帳號

- 後臺：Email＋密碼登入。新申請者須確認信箱並經系統管理者啟用，未啟用與停用帳號不能讀寫課程。
- 學員：老師先建立姓名、Email、手機名冊；學員以三項資料首次啟用，由 student-activate 核對名冊並建立 Auth 帳號，接著補齊個人資料與設定密碼。之後使用 Email＋密碼登入。
- 首次啟用沿用免寄驗證信的名冊核對流程；不能把 Auth 內部的 email_confirmed_at 解讀成曾實際收過驗證信。後臺申請、忘記密碼及 Email 變更需要可用 SMTP。
- 同一 Email 的學員帳號只建立一次；參加其他梯次直接登入。已有帳號但未完成啟用者，登入後接續核對名冊與填寫資料；舊有未確認信箱帳號可由登入頁重新寄送確認信。
- 名冊以紅叉、橘色時鐘、綠勾區分「尚未建立帳號」「帳號已建立，啟用未完成」「已啟用」，滑鼠停留或鍵盤聚焦時顯示狀態與個人資料。
- 已建立帳號的 Email 不能由管理員直接改名冊。學員在專區申請變更，完成 Auth 的信箱確認後，系統按同一個 user_id 同步目前及封存名冊；成績不搬動。若新 Email 與同梯次既有名冊衝突，同步會整筆回復，原紀錄仍保留，需由系統管理者核對。
- .env.local 僅放前端可公開的 publishable／anon key；service-role key 只能放 Edge Function 的伺服器環境。

## 本機開發與檢查

```powershell
pnpm install --frozen-lockfile
pnpm dev
pnpm check
pnpm build
```

.env.local 設定 NEXT_PUBLIC_SUPABASE_URL 與 NEXT_PUBLIC_SUPABASE_ANON_KEY。前端只有這兩個公開值會進入建置；Vite 會拒絕 service-role key。pnpm check 執行前端及 Edge 的 TypeScript 檢查與完整本機測試，PGlite 是正式 devDependency，不必另裝 .verify-accounts 套件。Edge 型別檢查使用本機 Deno 宣告；部署環境仍須實測原生 Edge 執行。

GitHub Pages workflow 在部署前執行 pnpm check；SQL 與 Edge 不會因前端 workflow 而自動安裝。

## 資料庫安裝與升級

### 全新、尚未建立 NPTC 資料表的資料庫

在 Supabase SQL Editor 執行完整 supabase/install.sql。此檔由 scripts/build-supabase.mjs 產生，包含所有必要前置升級及現行修正，不依賴已停用的 invitation RPC。

### 既有資料庫

先保留資料庫備份並記錄梯次、學員與成績筆數。若已完成五面向評分、學員啟用、兩級角色與敏感操作，只需執行完整 supabase/upgrade-project-consistency.sql。此檔以交易執行，可重跑，保留既有資料與封存狀態。

若缺少前置功能，只補尚未安裝的檔案，順序如下：

1. setup.sql
2. upgrade-workshop-management.sql
3. upgrade-score-feedback.sql
4. upgrade-student-phone.sql
5. upgrade-student-profile.sql
6. upgrade-dynamic-osce-stations.sql
7. upgrade-backend-accounts.sql
8. upgrade-student-activation.sql
9. upgrade-roster-account-status.sql
10. upgrade-domain-scores.sql
11. upgrade-student-roster-activation.sql
12. upgrade-admin-roles.sql
13. upgrade-workshop-sensitive-actions.sql
14. upgrade-project-consistency.sql

已安裝 2026100701 後，舊 setup 與 upgrade 檔會主動停止，避免覆蓋新版的帳號、封存及成績保護。不要把 install.sql 當成既有資料庫的修復檔。repair-student-phone-write.sql 也不再以文字取代方式改動函式；完整升級已包含手機寫入修正。

完整唯讀安裝與歷史資料檢查請執行 supabase/verify-project-consistency.sql；若舊資料出現已公布題目缺漏或分項超過配分，須核對原始評分紀錄，不會以程式猜測改分。基本確認（SQL Editor）：

```sql
select max(version) as installed_version from nptc_private.schema_migrations;
select to_regprocedure('public.nptc_analysis_data(uuid)') as analysis_rpc,
       to_regprocedure('public.nptc_sync_student_email()') as email_sync_rpc,
       to_regprocedure('public.nptc_hospital_directory()') as directory_rpc;
select count(*) as hospital_count from nptc_private.hospital_directory;
select count(*) as workshops from nptc_private.workshops;
select count(*) as students from nptc_private.students;
select count(*) as grades from nptc_private.station_grades;
```

正常版本至少為 2026100701，三支 RPC 均存在；資料筆數應符合升級前的紀錄。前端登入時也檢查版本，未升級時顯示明確提示。

## Edge Function、SMTP 與部署順序

1. 完成上述 SQL 升級。
2. 部署 supabase/functions/student-activate/index.ts，伺服器設定 SUPABASE_URL 與 SUPABASE_SERVICE_ROLE_KEY。若自架 Kong API key 與資料庫 JWT 分開設定，JWT_SECRET 必須與 Auth／PostgREST 的共享設定一致；機密僅放伺服器。CLI 使用 supabase/config.toml 的 functions.student-activate.verify_jwt=false，因為首次啟用者尚未登入；僅此函式允許匿名進入，內部仍以 service-only RPC 核對名冊、拒絕既有帳號並限制嘗試次數。自架環境須另外確認 functions gateway／runtime 有套用相同設定，單純放入 config.toml 不會自動更新 Zeabur。
3. 確認 Auth 的 Site URL 為 https://nptc-wfh.zeabur.app，Redirect URLs 使用 backend-password-login.md 的四個正式路徑。確認 SMTP 與 Email 變更確認設定；Email 變更保留 secure email change，確認新舊信箱。不要以全域自動確認略過後臺申請或 Email 變更。
4. 部署新版 dist/。先升級 SQL，再部署前端；舊頁籤的題目寫入若未帶版本會被拒絕，請重新整理頁面。
5. 使用測試名冊驗收首次啟用、登出／密碼登入、重設密碼、部分公布、名冊鎖定、封存／還原、系統管理者分析封存紀錄及 Email 變更。永久刪除只用可拋棄測試梯次，由真人重新輸入系統管理者 Email、密碼與梯次名稱驗收。

本機 SQL 測試、建置成功與已推送程式都不等於正式服務已完成這些步驟。

## 權限、評分與資料一致性

nptc_private 資料表啟用 RLS，anon／authenticated 沒有直接資料表權限。public RPC 逐次檢查身分與權限；一般管理員可管理未封存課程、名冊、題目、成績與公布；系統管理者額外可管理帳號、封存、還原與永久刪除。初始系統管理者及自身帳號受到降權／停用保護。

- 五大面向滿分皆大於 0、合計 100；後端重新加總得分，不能信任前端送來的總分。分數與 Global Rating 成對填寫或留空；0 分有效。
- 每題以該梯次該題 Rating＝3 的平均分數為邊緣及格線；沒有可用資料時尚無法判定，沒有固定 60 分及格線。
- 題目逐題公布／撤回。公布後該題題目與成績鎖定；已有分項成績就不能變更配分。只要有任何題目公布，整份名冊即鎖定，避免刪除學員改變已公布門檻。
- 題目 stations_revision、學員 revision 與梯次鎖共同防止舊草稿覆寫及公布／寫入競爭。新增梯次以管理員＋requestId 記錄建立請求；網路重試回傳同一個梯次。
- 所有舊版題目寫入都轉至現行保護；舊整梯次公布及總分寫入拒絕使用。
- 封存保留歷史題目、背景與成績；個人背景資料僅更新未封存名冊，經 Auth 確認的 Email 變更為可稽核的身分同步例外。
- 日常課程清單不包含封存梯次；系統管理者的學習分析含封存歷史，一般管理員分析限未封存梯次，畫面會標明範圍。
- 封存與永久刪除需要兩分鐘內的密碼登入及一次性 session；永久刪除還需已封存與完整梯次名稱，由後端再次授權。

## 官方醫院清單

scripts/sync-hospitals.mjs 擷取官方公開名冊並保留 public/data/accredited-hospitals.json 快取。pnpm build:sql 依快取重建 SQL 種子；新版前端與後端都使用已安裝的 nptc_private.hospital_directory，避免兩套名單不同步。

更新快取或每日前端建置不會自動改正式資料庫名冊。要更新正式清單，重新產生 SQL，檢閱差異並執行完整現行升級。下載失敗保留快取，不能宣稱清單已刷新。後端拒絕不在清單的自由文字；既有歷史院名保留。正式資料庫的實際清單版本取決於最後一次 SQL 升級所使用的快取。

## 展示模式

lib/demo.ts 的 DEMO_MODE 預設 false。可改為 true，在瀏覽器 localStorage 使用 teacher／demo1234 或 student／demo1234；只用於展示與離線測試，不存正式資料。展示模式遵守逐題公布、名冊鎖定、題目版本與建立重試等主要資料規則；不模擬真實 Auth 信箱確認、SMTP、系統管理者、封存或永久刪除。醫院名冊仍取自網站提供的本機快取資產。

## 相關檔案

- docs/reviews/2026-10-07-project-review.md：本次修正前的檢視證據。
- docs/reviews/2026-10-07-fixes.md：逐項修正結果與驗證邊界。
- docs/reviews/2026-10-07-before-after.html：完整程式修改前／後對照。
- backend-password-login.md：後臺登入設定與驗收。

官方 API：[更新 Email／密碼](https://supabase.com/docs/reference/javascript/auth-updateuser)、[Edge 個別函式驗證設定](https://supabase.com/docs/guides/functions/function-configuration)。
