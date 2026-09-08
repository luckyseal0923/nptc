# 為國考而訓：靜態前端 + Supabase

前端使用 React + Vite，建置結果為 `dist/`，只包含 HTML、CSS、JavaScript 與圖片。正式服務不需要 Node、Cloudflare Worker 或 D1。

## 目前展示登入

目前先啟用瀏覽器本機展示模式，不需要輸入 Email，也不會寄出驗證信或寫入 Supabase：

- 老師帳號：`teacher`／`demo1234`
- 學員帳號：`student`／`demo1234`

展示資料只存在使用者目前瀏覽器的 localStorage。要恢復 Supabase 的 Email 驗證登入，將 `lib/demo.ts` 的 `DEMO_MODE` 改為 `false`，再依下列 Supabase 初始化設定完成 SMTP 與 Redirect URL。

正式登入採 Email 驗證或 Email／密碼模式；姓名、Email 與手機電話用於辨識學員與課程聯絡。若使用 Email／密碼，應要求學員首次登入後自行變更密碼。

## 啟動與建置

1. `.env.local` 已提供 Supabase API URL 與 anon key。變數名稱見 `.env.example`。這兩個值會在建置時加入前端；不得改放 secret/service_role key。
2. 安裝：`pnpm install`
3. 開發：`pnpm dev`
4. 建置：`pnpm build`
5. 預覽：`pnpm start`

若本機 pnpm 包裝器要求重新安裝，可直接執行已安裝套件：

```powershell
node node_modules/vite/bin/vite.js build
node scripts/static-routes.mjs
node node_modules/vite/bin/vite.js preview --host 127.0.0.1
```

首頁 `/`、老師 `/teacher/`、學員 `/student/` 都有靜態 HTML 入口，適合掛在網域根目錄。若部署至子目錄，需另調整連結與資產基底路徑。

## Supabase 初始化

在對應專案的 SQL Editor 執行 `supabase/setup.sql`。老師信箱已設定為 `chin.wei.chang0923@gmail.com`。

若已執行過初版設定，依序執行 `supabase/upgrade-workshop-management.sql`、`supabase/upgrade-score-feedback.sql` 與 `supabase/upgrade-student-phone.sql`。最後一份腳本會將名冊登入資訊改為姓名、Email、手機電話。

- 啟用 Email 驗證登入與註冊，並設定可寄信的 SMTP。自架 Supabase 的環境設定需在 Zeabur 修改。
- 將 Site URL 設定為正式前端網址，Redirect URLs 加入正式網址 `/student/` 與 `/teacher/`，本機測試另加入 `http://127.0.0.1:5173/student/` 與 `/teacher/`。
- 驗證信可使用登入連結；若希望輸入驗證碼，Email 模板必須包含 `{{ .Token }}`。
- 勿關閉 Email 驗證；權限依 Supabase 簽署的登入 Email 判斷。
- 啟用正式登入前，需在 Supabase Auth 建立老師與學員的 Email／密碼帳號。批次建立帳號應由受保護的 Supabase Edge Function 或 Auth 管理介面完成，不能在靜態前端放置 service-role key。

## 權限與資料

資料保存在 `nptc_private` schema。資料表啟用 RLS 並撤銷 anon/authenticated 的直接存取，只開放四個 public RPC。函式固定 search_path，並逐次檢查登入身分與老師名單。

- `nptc_is_teacher()`：查詢目前帳號的老師權限。
- `nptc_teacher_data(requested_workshop)`：老師取得梯次、名冊及邊緣及格分數。
- `nptc_teacher_write(body)`：老師建立梯次、儲存學員與成績、公布及撤回。
- `nptc_student_data()`：學員只取得本人資料，未公布時不回傳分數或邊緣及格分數。

每題分數 0–100，Rating 為 1–5 整數；兩欄成對填寫或留空。固定及格線 60 分。邊緣及格分數為該梯次 Rating=3 的平均。公布後禁止修改，撤回後才能編輯；revision 防止覆寫新版資料，梯次鎖防止公布與修改互相競爭。

每個梯次另有四站題目設定：第一天兩題、第二天兩題，分別可記錄題目名稱與命題內容。名冊可由 Excel 貼上「姓名、Email、手機電話」三欄批次匯入；名冊中的手機電話會遮蔽顯示。學員只能查看自己的已公布成績與各站邊緣及格分數。

舊 D1 後端程式已從此專案移除。若舊 D1 資料庫仍有正式名冊，需要另外匯出後再匯入 Supabase。

## 檢查

```powershell
node --test tests/grading.test.mjs
node node_modules/typescript/bin/tsc --noEmit
node scripts/check-supabase.mjs
```

連線檢查只輸出 HTTP 狀態，不顯示金鑰。未登入呼叫已安裝的 RPC 應被拒絕。
