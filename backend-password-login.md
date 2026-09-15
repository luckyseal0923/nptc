# 後臺 Email／密碼登入

本次沿用 Supabase Auth 與既有帳號審核 RPC，不需新增 SQL table 或重新執行 SQL。

- 新申請：姓名、Email、密碼（至少 8 字元）、確認密碼、用途。首次信箱驗證返回網站後，送出待審核申請。
- 已啟用：直接用 Email＋密碼登入。
- 既有信件登入帳號：點「首次設定／忘記密碼」收信設定一次。
- 尚未啟用／已停用：不能讀寫後臺課程資料。
- 密碼只交給 Supabase Auth，不存進申請資料或瀏覽器自訂儲存。

## 正式環境設定

在 Zeabur auth 的 GOTRUE_URI_ALLOW_LIST 保留原值並加入：

https://nptc-ai.zeabur.app/teacher/?reset=1

同時保留 https://nptc-ai.zeabur.app/teacher/ 。修改後重新啟動 auth。
不要為了省略後臺首次驗證而全域開啟自動確認，因為學員名冊核對也依賴信箱身分。

## 驗收

1. 已啟用舊帳號先重設密碼，再登出，用新密碼登入。
2. 新 Email 申請、首次驗證，確認出現等待審核；未啟用前不得讀寫課程。
3. 審核管理員啟用後，申請者重新登入進入後臺。
4. 停用後，重新操作資料應被伺服器拒絕。

本機已完成型別檢查、正式建置、帳號審核及學員隔離 SQL 測試與表單版面確認。正式收信、密碼設定及部署後完整流程尚需實際驗收。

官方 API：https://supabase.com/docs/reference/javascript/auth-signup
