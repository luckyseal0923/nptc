# 公開金鑰到期檢查與更新

`pnpm check:key` 只輸出 key 類型、到期時間與剩餘天數，不印出 key。每日 GitHub Pages workflow 及每次部署都會檢查：距到期 90 天內產生 warning，不足 7 天或已過期會停止發布。publishable key 不套用 JWT 的 exp 檢查；service_role 一律拒絕。

本次讀取的公開 anon JWT 到期時間為臺灣時間 **2027-01-10 07:00**。目前仍有效；這次加入檢查與更新流程，沒有直接改動共享 JWT_SECRET 或替換正式機密。

更新時先盤點同一 Supabase 專案的 Kong API key、Auth／PostgREST／Realtime／Storage／Edge 所需設定，區分「API key 字串」與「JWT 簽章設定」。不要只替換前端，也不要把 service_role 放入網站環境變數。

1. 先保留目前設定的安全備份，於隔離環境確認新設定可用。若保持 JWT_SECRET 不變，確認所有會使用 API key 的服務同步採用新字串；若更換 JWT_SECRET，另外評估既有登入 session 與所有服務驗證的影響。
2. 更新伺服器端設定；機密只保留於伺服器／受保護的設定存放處。各服務重啟後確認 API 與 Auth 正常。
3. 更新本機 `.env.local`、Zeabur 前端 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 及 GitHub Actions 同名 secret；只放 anon／publishable。
4. 執行 `pnpm check:key`、`pnpm check:api`、`pnpm check` 與正式建置。API 檢查必須讀取錯誤 code；401 本身不能代表權限正常。
5. 部署後核對兩個前端公開資產的角色與期限，再用測試帳號驗證登入、問卷讀取、繳交與管理員資料讀取。錯誤時依備份回復一致設定。

不把任何完整 key、JWT_SECRET、密碼貼進 Git、文件或檢查紀錄。`meta.docx` 已精確排除；提交前可再執行 `node scripts/check-secrets.mjs --staged`。
