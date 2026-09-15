# OSCE 五面向成績

## 操作方式

1. 在「新增 OSCE 題目」設定現在病史、過去病史、ROS、身體評估、鑑別診斷的滿分。各面向大於 0，合計固定 100 分，可有不同配分。
2. 在「登錄成績與回饋」輸入五個面向得分，總得分自動加總，再填 Global Rating 與回饋，勾選學員後儲存。
3. 公告後，學員可看到各題雷達圖；後臺學習分析的個人歷次紀錄也呈現雷達圖。

雷達圖每軸為「面向得分 ÷ 面向滿分 × 5」，最高 5 分。原始得分與滿分並列顯示。例如 24 / 30 會顯示 4 / 5。邊緣及格分數仍依該題 Rating＝3 的總得分平均計算。

## 舊資料與限制

- 舊總分保留；缺少五面向資料時不推算雷達圖。
- 舊題目可保留未設定配分，但開始登錄新分項前必須補上配分。
- 已有分項成績的題目不能更改配分，以免既有得分失去意義。
- 五個分項須完整填寫，允許 0 分與最多兩位小數，不得超過該面向滿分。清除成績時五項與 Rating 都留白。
- 已公告題目須先取消公告才可修改成績。

## 部署順序

1. 在已安裝本專案動態題目、學員啟用與名冊狀態更新的 Supabase 資料庫執行 `supabase/upgrade-domain-scores.sql`。
2. 確認 SQL 成功後，再部署新版前端。新版使用 v3 RPC；只更新前端而未執行 SQL 將無法儲存。
3. 用測試梯次設定配分、儲存分項、公告後，以該測試學員登入確認。
4. 若要補齊正式環境的虛構展示梯次，再執行 `supabase/backfill-demo-domain-scores.sql`。此檔只接受名稱完全符合 `demo-np osce` 的唯一梯次，將五面向各設為 20 分，僅補尚無分項的成績，並驗證 4 題、80 筆分項皆與原總分相同。

SQL 可重複執行，保留原總分；新增 nullable JSON 分項欄位並以資料庫重新加總。舊版只傳總分的寫入管道停用，因此部署期間應避免用舊頁面登錄成績。

## 本機驗證

- `node tests/domain-scores.mjs`
- `node tests/domain-scores-sql.mjs`（需本機 `.verify-accounts` 的 PGlite）
- `node tests/grading.test.mjs`
- `node tests/learning-analysis.mjs`
- `node tests/student-activation.mjs`
- `npx tsc --noEmit`、`npm run build`

SQL 測試涵蓋配分驗證、自動加總、偽造總分、版本衝突、批次回滾、公告限制、學員隔離及既有管理功能。瀏覽器預覽使用獨立虛構分項資料；未改寫正式 demo-np osce 的原有成績。本機驗證不代表已在正式 Supabase 執行更新。

