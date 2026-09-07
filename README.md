# 為國考而訓 — 學員與老師專區

首頁不含課程議程。學員與老師使用 Sites 的 ChatGPT 登入，權限在伺服器端檢查。

- `/student`：依登入 Email 取得本人名冊，只讀取已公布的四題成績。
- `/teacher`：僅 `TEACHER_EMAILS` 指定帳號能建立梯次、新增或修改學員、儲存四題成績、公布／撤回成績。
- 同一梯次不得重複學號或 Email。不同梯次的計算互不混用。
- 每題 0–100 分，Global Rating 1–5 整數；成績及 Rating 成對儲存。
- 固定及格線 60 分；邊緣及格分數＝同梯次、同題 Rating＝3 的有效分數平均，無資料時為 null。
- 成績狀態依原始分數與 60 比較，顯示數值最多四捨五入至小數點後兩位。
- 公布後鎖定編輯；先撤回再修改。更新以 revision 避免覆蓋他人較新的資料。

## 本機

依 `.env.example` 設定 `.env` 及忽略追蹤的 `.dev.vars`。Sites 在本機模擬登入帳號為 `seedy@sites.test`；只可在 `.dev.vars` 加入此帳號測試老師流程，正式環境不可加入。

以 pnpm 安裝套件並啟動 `dev`。遷移由 `drizzle-kit generate` 產生，以 `wrangler d1 migrations apply DB --local --config wrangler.local.jsonc` 套用本機資料庫。正式資料庫由 Sites 發布時套用遷移。

## 驗證

- `node --test tests/grading.test.mjs`
- `node tests/api-flow.mjs`（需要本機 localhost:3000、資料表及本機模擬老師權限）
- API 測試只在本機建立 LOCAL-TEST 梯次，清理 SQL 位於 `work/test-cleanup.sql`，透過本機 wrangler 執行。
- `tsc --noEmit` 與 `vinext build`

正式授權由 Sites 環境變數保存，不放入前端或 Git。正式庫不包含測試學員。
