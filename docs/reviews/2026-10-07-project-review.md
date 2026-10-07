# NPTC 前端與後端程式回顧

2026 年 10 月 7 日。檢查基準為本機 `572f3b9` 與工作目錄目前檔案，涵蓋 React 登入、名冊、題目、成績、分析、Supabase SQL 與帳號啟用服務。

本報告保留修正前的 14 項問題證據；修正結果請見 [2026-10-07-fixes.md](./2026-10-07-fixes.md)。

檢視當時有 14 項需處理的問題，其中 4 項應優先修正。主要原因是新功能持續疊加，但舊寫入入口、舊公布欄位與可重新執行的 SQL 仍保留原本邏輯，導致部分保護只在新版流程成立。現有架構可以修復，無須先重寫整個系統。

12 支既有測試程式與 TypeScript 檢查均通過，前端建置成功；另以隔離 PostgreSQL 引擎重現 12 個交叉情境。這些結果證明本機程式存在下列行為，正式資料庫是否安裝相同函式仍需另外核對。本次正式 API 唯讀連線未成功，未取得正式函式定義，也未執行正式資料寫入。

## 優先修正的問題

### F01 舊題目寫入入口可繞過新保護

優先程度 P1。已重現，證據 R02。

新版 `nptc_teacher_save_stations_v3` 會阻止修改已公布題目，以及變更已有分項成績的配分。但 `nptc_teacher_write` 僅禁止舊的 `saveScores`，其他操作仍交給 `teacher_write_before_domains`。其中 `saveStations` 仍走舊版四題儲存邏輯。

在具有 q1 至 q4 的梯次，先登錄五面向成績並公布 q1，再改用 `nptc_teacher_write` 的 `saveStations`，仍可修改 q1 名稱及配分。已儲存的分項因此可能超過新滿分，雷達圖也會失去意義。呼叫者仍需管理員權限；問題是授權管理員能繞過既定的資料保護。

修正方向：將所有題目寫入入口導向 v3 驗證；舊 `publish` 也應關閉或轉接逐題公布。舊函式的名冊功能應拆出明確允許的操作，避免整支舊函式成為備用入口。

位置：[新入口的轉接規則](C:/Users/ASUS/Documents/ChatGPT/NPTC為國考而訓/supabase/upgrade-domain-scores.sql:144)、[保留下來的舊題目邏輯](C:/Users/ASUS/Documents/ChatGPT/NPTC為國考而訓/supabase/upgrade-student-phone.sql:54)。

### F02 刪除名冊會改變已公布成績的門檻

優先程度 P1。已重現，證據 R03。

逐題公布後，後端將 `published_stations` 更新，但把舊欄位 `published` 設成 0。名冊表單與舊名冊寫入函式仍只檢查 `published`，因此可以直接刪除已有公布成績的學員。學員刪除會連帶刪除 `station_grades`，及格門檻每次查詢又依現存成績重新計算。

重現結果：q1 已公布且 Rating＝3 的平均為 50 分；刪除唯一的 Rating＝3 學員後，q1 仍維持公布，其他學員的門檻卻變成 null，判定由及格或未達及格變成尚無法判定。

修正方向：資料庫應禁止刪除帶有已公布成績的名冊，須先撤回受影響的題目。若未來需要公布後仍能調整名冊，應另外設計公布版本或門檻快照，保留當時的結果。前端按鈕也須使用相同規則。

位置：[舊名冊鎖定與刪除](C:/Users/ASUS/Documents/ChatGPT/NPTC為國考而訓/supabase/upgrade-student-phone.sql:54)、[逐題公布更新](C:/Users/ASUS/Documents/ChatGPT/NPTC為國考而訓/supabase/upgrade-dynamic-osce-stations.sql:93)、[名冊刪除按鈕](C:/Users/ASUS/Documents/ChatGPT/NPTC為國考而訓/app/teacher/teacher-dashboard.tsx:169)。

### F03 封存舊梯次會阻擋學員完成新梯次啟用

優先程度 P1。已重現，證據 R05。

`nptc_student_update_profile` 依 Email 更新所有梯次的同一學員資料。封存保護 trigger 則拒絕修改任何封存梯次的名冊。當同一 Email 同時存在於封存舊梯次與新梯次，儲存個人資料就會觸碰舊名冊，使整筆更新回滾。

因此，首次啟用尚未完成者，即使新梯次資料正確，也無法完成必要的個人資料儲存；已有帳號者在新梯次補資料時也會被阻擋。

修正方向：短期限定更新未封存梯次，並明確處理沒有可更新名冊的情況。中期把帳號個人資料與各梯次名冊分開，保留封存梯次當時的背景資料。

位置：[依 Email 更新全部名冊](C:/Users/ASUS/Documents/ChatGPT/NPTC為國考而訓/supabase/upgrade-student-activation.sql:90)、[封存名冊保護](C:/Users/ASUS/Documents/ChatGPT/NPTC為國考而訓/supabase/upgrade-workshop-sensitive-actions.sql:61)。

### F04 重跑舊升級檔會撤銷新版保護

優先程度 P1。已重現，證據 R07、R08。

安裝 `upgrade-workshop-sensitive-actions.sql` 後，若重跑 `upgrade-admin-roles.sql`，會重新覆寫封存函式，使近期密碼驗證與一次性 session 不再被檢查。隔離測試確認原本被拒絕的未再次驗證封存操作隨後成功。

安裝帳號權限與封存功能後，重跑 `upgrade-domain-scores.sql`，又會覆寫 `nptc_teacher_data`，使封存梯次重新出現在一般清單。其他舊檔案也重複定義相同 RPC；「可重複執行」並不代表能在任意順序下安全重跑。

修正方向：建立唯一的升級順序與資料庫版本紀錄。已被取代的檔案應阻止覆寫較新版本，或只負責當時的資料結構變更；最新函式定義集中維護。README 的「student activation 須最後執行」也需改為完整且一致的安裝流程。

位置：[舊封存函式](C:/Users/ASUS/Documents/ChatGPT/NPTC為國考而訓/supabase/upgrade-admin-roles.sql:61)、[新版密碼檢查](C:/Users/ASUS/Documents/ChatGPT/NPTC為國考而訓/supabase/upgrade-workshop-sensitive-actions.sql:42)、[覆寫老師資料查詢](C:/Users/ASUS/Documents/ChatGPT/NPTC為國考而訓/supabase/upgrade-domain-scores.sql:117)。

## 其他需要修正的問題

| 編號 | 優先程度 | 問題與影響 | 證據 | 修正方向 |
| --- | --- | --- | --- | --- |
| F05 | P2 | 後臺摘要仍讀舊 `published`，逐題公布後卻固定為 0，因此題目已公布仍顯示「成績未公告」。 | R01；[摘要顯示](C:/Users/ASUS/Documents/ChatGPT/NPTC為國考而訓/app/teacher/teacher-dashboard.tsx:125) | 統一由 `publishedStations` 計算「未公布、部分公布、全部公布」，逐步停用舊欄位。 |
| F06 | P2 | 題目設定缺少版本檢查。兩名管理員載入相同題目後，各自修改不同題目，第二次儲存會靜默覆寫第一人的修改。資料列鎖只能讓寫入依序進行，無法辨識舊畫面。 | R09；[完整覆寫題目清單](C:/Users/ASUS/Documents/ChatGPT/NPTC為國考而訓/supabase/upgrade-domain-scores.sql:71) | 加入題目設定 revision，前端帶回讀取時版本；版本不符時要求重新載入或合併。 |
| F07 | P2 | 前端限制選擇官方醫院，但後端只檢查醫院名稱長度。直接呼叫 RPC 可以保存不存在的醫院，破壞依醫院分組的分析。 | R04；[後端個資驗證](C:/Users/ASUS/Documents/ChatGPT/NPTC為國考而訓/supabase/upgrade-student-activation.sql:79) | 後端維護同版本醫院清單並驗證醫院識別碼；若需要允許其他任職機構，應採明確的選項及規則。 |
| F08 | P2 | 醫院 JSON 載入失敗會寫入成績頁共用 error，整個成績畫面因此被錯誤區塊取代，已有完整個資者也看不到成功取得的成績。 | 程式判讀；[醫院載入錯誤](C:/Users/ASUS/Documents/ChatGPT/NPTC為國考而訓/app/student/student-dashboard.tsx:62)、[整頁錯誤分支](C:/Users/ASUS/Documents/ChatGPT/NPTC為國考而訓/app/student/student-dashboard.tsx:89) | 分開成績與醫院錯誤；醫院失敗只影響個資表單，成績照常呈現。 |
| F09 | P2 | 切換梯次後保留舊 `scoreStation` 與勾選狀態。若新梯次沒有該 key，題目內容會退回第一題，門檻卻仍查舊 key，造成門檻顯示為空且沒有相符的題目按鈕被選取。勾選數也可能保留上一梯次數量。 | 程式判讀；[題目與門檻選取](C:/Users/ASUS/Documents/ChatGPT/NPTC為國考而訓/app/teacher/teacher-dashboard.tsx:39)、[載入後狀態](C:/Users/ASUS/Documents/ChatGPT/NPTC為國考而訓/app/teacher/teacher-dashboard.tsx:48) | 梯次變更時重新設定有效題目 key，清空學員勾選與梯次相關表單狀態；門檻依實際 selectedStation.key 查詢。 |
| F10 | P2 | 寫入成功後若重新讀取失敗，`save` 將整個操作當成失敗。建立梯次表單仍保留，管理員再次送出會建立第二個同名梯次。 | 程式判讀；[寫入與重新讀取共用失敗處理](C:/Users/ASUS/Documents/ChatGPT/NPTC為國考而訓/app/teacher/teacher-dashboard.tsx:64) | 分開「已儲存但載入失敗」與「儲存失敗」；保留成功回傳的 id，重試只重新讀取。建立操作另可加一次性請求識別碼。 |
| F11 | P2 | 學習分析標示「所有梯次」與「歷次紀錄」，來源 RPC 卻排除封存梯次。學員端仍保留封存成績，所以兩個頁面對同一人的歷史範圍不同。 | R11 與程式判讀；[分析資料來源](C:/Users/ASUS/Documents/ChatGPT/NPTC為國考而訓/lib/learning-analysis.ts:49)、[所有梯次文案](C:/Users/ASUS/Documents/ChatGPT/NPTC為國考而訓/components/learning-analysis.tsx:72) | 短期改為「所有未封存梯次」。若要完整歷史，新增有權限檢查的封存資料讀取選項，仍維持封存不可修改。 |
| F12 | P2 | 工作目錄既有未追蹤的 `repair-student-phone-write.sql` 只檢查 public 函式本文。最新版 public 函式是轉接殼層，不含 phone，執行修補檔會直接失敗，實際舊欄位邏輯可能在私有被保留的函式內。 | R06；[修補檔檢查](C:/Users/ASUS/Documents/ChatGPT/NPTC為國考而訓/supabase/repair-student-phone-write.sql:7) | 先辨識函式版本及轉接關係，再針對完整現行定義處理；避免使用全域字串替換修補正式函式。 |
| F13 | P2 | README 仍描述 Email 驗證連結與四個 RPC，實際前端已使用密碼及 `student-activate`。文件漏掉新版啟用服務的完整部署流程；名冊啟用升級又無條件撤銷已廢止的 invitation 函式，若從未安裝 invitation，整份升級會回滾。 | R10 與程式判讀；[文件舊登入方式](C:/Users/ASUS/Documents/ChatGPT/NPTC為國考而訓/README.md:5)、[隱藏的舊函式依賴](C:/Users/ASUS/Documents/ChatGPT/NPTC為國考而訓/supabase/upgrade-student-roster-activation.sql:32) | 整理全新安裝與既有環境升級兩條流程；撤銷舊函式前檢查是否存在，記錄 Edge 部署方式與伺服器必要設定。 |
| F14 | P2 | 管理員可以直接修改名冊 Email，但 Supabase 登入帳號與 student_accounts 未同步。原帳號立即失去該梯次資料，新 Email 又沒有相對應的原登入帳號；跨梯次歷史也被拆開。 | R12；[名冊 Email 更新](C:/Users/ASUS/Documents/ChatGPT/NPTC為國考而訓/supabase/upgrade-student-phone.sql:87)、[資料依 Email 比對](C:/Users/ASUS/Documents/ChatGPT/NPTC為國考而訓/supabase/upgrade-domain-scores.sql:130) | 已認領帳號的 Email 變更改走專用流程，核對 Auth 身分並處理相關名冊；中期使用穩定的 user_id 或學員識別碼串接。 |

## 後續改善

GitHub Pages 部署目前只執行安裝與建置，沒有 TypeScript 或 SQL 回歸測試。`vite build` 成功不能證明資料庫權限與升級順序正確。應將重要測試接到部署前檢查，並將 PGlite 測試依賴與單一測試指令納入正式開發設定。

展示模式與正式模式已有差異，例如展示資料沒有完整模擬帳號角色、封存及所有題目寫入保護。展示模式仍可用於說明介面，但應避免拿它驗收正式權限；若繼續維護，應共用可共用的資料驗證邏輯。

前端主 bundle 約 614 kB，建置有超過 500 kB 的警告。後臺與學員頁目前由入口一起載入，可再按頁面拆分。這屬於效能改善，優先程度低於資料保護問題。

分析個人歷史的梯次數文案也使用目前篩選後的 `p.records`，但明細使用全部 `allRows`。應以實際顯示的歷史計算數量，避免顯示「1 個梯次」卻列出多個梯次。[位置](C:/Users/ASUS/Documents/ChatGPT/NPTC為國考而訓/components/learning-analysis.tsx:100)。

## 帳號啟用與部署的驗證邊界

目前 Edge Function 以 `email_confirm: true` 建立學員帳號。這表示伺服器將名冊核對視為足以建立帳號的條件，並沒有驗證使用者確實能收取該信箱郵件。前端的「不需要驗證信」符合程式，但啟用後「Email 已驗證」的文字容易使管理者誤以為已證明信箱所有權。應明確區分「名冊核對成功」與「信箱驗證成功」。Supabase 的 [createUser 文件](https://supabase.com/docs/reference/javascript/auth-admin-createuser) 說明了由管理端建立及自動確認帳號的 API。

這是現行流程的取捨，不據此認定使用者應改回寄信。若需要提高首次認領的可靠性，可比較寄信、由課程人員交付一次性啟用碼，或保留目前三欄核對並加強濫用限制；選擇取決於實際報名與身分核對流程。

儲存庫沒有 `supabase/config.toml`，也沒有 Edge Function 的部署工作流程。Supabase 的 [Edge Function 驗證文件](https://supabase.com/docs/guides/functions/auth) 說明預設 JWT 檢查與公開函式的設定。此專案允許 publishable 與 anon 兩種前端 key，須明確記錄實際自架環境的匿名啟用設定及 key 相容性；不能只根據 handler 的單元測試判定閘道已經能讓未登入學員呼叫。正式設定本次未取得。

本次檢查沒有建立正式帳號、寄送郵件、公布或撤回正式成績，也沒有封存或刪除正式梯次。SMTP、Auth 與 Edge 閘道的端到端可用性仍須用測試名冊驗收。

## 修正方案與建議順序

| 方案 | 工作內容 | 人力與維護 | 適用條件 |
| --- | --- | --- | --- |
| A 先修正資料保護 | 關閉舊入口、保護已公布名冊、排除封存個資更新衝突，修正公布狀態與重要前端錯誤處理。 | 開發投入較少，仍須人工管理既有 SQL 順序。 | 近期必須繼續使用，需要先減少直接影響成績與啟用的錯誤。 |
| B 分階段整合現有架構 | 先完成 A，再建立唯一現行 SQL、升級版本紀錄、前後端資料規格及部署前回歸測試。 | 投入中等，後續新增功能與維護較容易。 | 推薦方案，符合目前專案規模，保留現有 Vite 與 Supabase 架構。 |
| C 重寫獨立後端服務 | 將寫入、權限、公布版本與帳號管理移至獨立服務，重新設計資料存取。 | 投入與部署維護較高，資料遷移成本最大。 | 未來出現多院權限隔離、複雜稽核或大量跨系統整合，再評估。 |

建議採 B，先以 A 的範圍完成第一批修正。第一批由程式維護者處理 RPC、trigger 與前端，邀請一位一般管理員及一位系統管理者協助驗收，使用獨立測試梯次與虛構學員。

第一批驗收至少涵蓋下列情境：

1. 透過新版及舊版入口都不能修改已公布題目或已有分項的配分。
2. 已公布成績的學員不能直接刪除，其他人的門檻不會因名冊操作改變。
3. 同一學員有封存舊梯次仍能完成新梯次啟用。
4. 重跑任何允許重跑的 SQL 不會降低密碼驗證或使封存資料回到日常清單。
5. 名冊 Email 更正後，帳號與可見資料保持一致。
6. 任一題公布、切換梯次及醫院資料載入失敗時，畫面仍顯示一致的結果。

## 本機驗證紀錄

| 檢查 | 結果 | 範圍 |
| --- | --- | --- |
| TypeScript | 通過 | `node node_modules/typescript/bin/tsc --noEmit --incremental false`。目前 tsconfig 沒有包含 Deno Edge Function。 |
| 12 支既有測試程式 | 全部通過 | 成績、五面向、分析、重試、學員啟用、名冊、invitation、後臺帳號與管理員權限。 |
| 交叉情境重現 | 12 項成功重現 | 本機 PGlite，資料全部為虛構，沒有連接正式資料庫。 |
| 前端建置 | 成功 | `vite build` 與 `scripts/static-routes.mjs`；有 bundle 大小警告。此次沒有重新下載官方醫院清單。 |
| 正式唯讀連線 | 無法驗證 | 未登入 RPC 與 Edge GET 均未成功連線。沒有據此判定服務是否故障。 |

重現程式：[reproduce-2026-10-07.mjs](C:/Users/ASUS/Documents/ChatGPT/NPTC為國考而訓/docs/reviews/reproduce-2026-10-07.mjs)。從專案根目錄執行：

```powershell
node docs/reviews/reproduce-2026-10-07.mjs
```

重現程式現已固定讀取修正前 Git commit `572f3b9` 的 SQL 與當時手機修補內容，使用正式 PGlite 測試依賴；assertion 驗證「歷史問題可以重現」，沒有執行新版升級。此程式不加入 CI。現行版本的安全拒絕與一致性由 `tests/project-consistency.mjs` 回歸測試驗證。

| 證據 | 重現結果 |
| --- | --- |
| R01 | `published=0`，但 `publishedStations=[q1]`。 |
| R02 | v3 拒絕修改已公布題目，舊 `teacher_write/saveStations` 接受同一修改。 |
| R03 | 刪除學員後，已公布 q1 門檻從 50 變為 null。 |
| R04 | 個資 RPC 接受官方名冊中不存在的醫院名稱。 |
| R05 | 同 Email 有任一封存梯次時，個資更新被封存 trigger 拒絕。 |
| R06 | 手機修補檔面對現行 v3 轉接函式時失敗。 |
| R07 | 重跑 admin roles 後，無新密碼驗證的封存請求成功。 |
| R08 | 重跑 domain scores 後，封存梯次回到一般清單。 |
| R09 | 第二份舊題目草稿靜默覆寫第一位編輯者的修改。 |
| R10 | 若不存在已廢止的 invitation 函式，名冊啟用升級失敗。 |
| R11 | 學員端有兩個歷史梯次，分析資料來源只有一個未封存梯次。 |
| R12 | 更改名冊 Email 後，原帳號失去該梯次資料，Auth 帳號 Email 仍為舊值。 |

以上是修正前檢視紀錄。後續程式修正與完整驗證另見修正結果報告；使用者既有的其他文件及開發日誌保留。
