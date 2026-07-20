# 週檢視「依時間」時間軸模式 — 設計文件

- 日期：2026-07-20
- 狀態：設計已核可，待實作
- 複雜度：Complex+（3+ 模組、觸及 `JavaScript.html` = Risk-Flag #2）
- Related：#92（建立本次須同步修改的 `tests/lib/uiHelpers.js` 測試鏡像層）

## 1. 動機

目前「依時間」排序只在日檢視可用，週檢視僅能「依教室」或「依老師」排列。使用者需要在週檢視也能以時間為主軸檢視整週課程——左側欄顯示時間軸，橫向對應星期一～日，教室與老師資訊改為顯示在課程卡片內。

## 2. 現況

### 2.1 三種排序模式

| 模式 | 函式 | 列 (row) | 欄 (col) |
|---|---|---|---|
| 依教室 | `renderByClassroom` (`UI.js.html`) | 教室 | 星期一～日（週）／單日（日） |
| 依老師 | `renderByTeacher` (`UI.js.html`) | 老師 | 同上 |
| 依時間 | `renderDayViewByTime` (`UI.js.html`) | **一課一列** | 單欄（僅日檢視） |

### 2.2 關鍵認知：現有「依時間」不是時間軸

`renderDayViewByTime` 把當天所有教室的課攤平成陣列，依 `timeStart` 排序後**一課一列**，左欄印的是 `course.classroom`。它是「依時間排序的課程清單」，**不是時間軸網格**。本次週檢視要的是後者，屬新版面結構，非現有邏輯的平移。

### 2.3 週檢視 + `time` 目前被三處擋住

1. `setViewMode` — 切到週檢視時，若 `viewSortMode === 'time'` 強制改回 `'classroom'`
2. `updateViewControls` — 「依時間」按鈕在週檢視 `style.display = 'none'`
3. `renderScheduleTable` — 分派條件要求 `currentViewMode === MODES.DAY`

另 `JavaScript.html:26-27` 的 localStorage 還原邏輯**根本沒有獨立儲存 `viewSortMode`**——它從 `lastViewMode` 推導：`day` → `time`，否則 → `classroom`。因此 week + time 不僅被視為無效組合，而是**在現行儲存模型下無法表達**（見 §5.1 blocker 1 的處理）。

### 2.4 既有可複用基礎

`createClassElement` 已具 `viewContext` 機制：`teacherSort` 時卡片內顯示「教室：X」，否則顯示老師。本次「教室與老師同時顯示在卡片」即擴充此機制。

## 3. 設計決策

| 決策 | 選定 | 理由 |
|---|---|---|
| 版面結構 | **動態時間軸網格** | 列只列出資料中實際出現的 `timeStart`。無空列、畫面緊湊；不需假設課程對齊整點，`09:10` / `13:30` 等不規則時間也對得準 |
| 時間軸粒度 | **資料驅動**（非固定間隔） | 固定每小時會使不規則起始時間錯位，且早晚空列拉長畫面 |
| 分組鍵 | **`timeStart`**（不含 `timeEnd`） | 符合「同時間開始」直覺；`09:10-11:00` 與 `09:10-10:00` 同列 |
| 編輯能力 | **同現有日檢視 time 模式** | 可 inline 編輯、可刪除、不可拖拉、無「+ 新增課程」。使用者不需重新學習 |
| 日檢視行為 | **維持現狀**（一課一列） | 日檢視比的是「看今天細節」，一課一列搭配備註欄（僅日檢視顯示）較合適；不驚動既有使用者，回歸風險最低 |
| 全部課表模式 | **一併支援**（唯讀） | 避免「從單一課表帶著 time 狀態切過去、畫面卻變回依教室」的靜默不一致 |
| PDF 匯出 | **一併支援**（需 time-mode 分支，**非**自動跟進） | 週檢視 PDF 雖是 DOM scraping，但 body 為**逐欄位選擇性抽取**、time mode 會落入只印老師的 else 分支 → 須新增 time-mode `bottomObj` 分支使每張卡同時輸出老師與教室，並修左上角標籤（**完整內容契約見 §5.2**；含 week-time PDF fixture/assertion） |

### 3.1 為何不提供「+ 新增課程」

時間軸格對應的是「時間 × 星期」，同一格可能橫跨多間教室，系統無從判斷新課該建到哪一間。「依教室」模式每格對應明確的「教室 × 星期」才有天然落點。若日後要支援，需額外設計選教室的 UI，屬本次範圍外。

## 4. 架構

### 4.1 新增 `renderWeekViewByTime(dataToRender)`

與現有三個 render 函式並列，不動日檢視。

```
輸入 dataToRender（教室 → 星期 → 課程[]）
  ↓ 攤平：掃全部教室 × 7 天，每筆課程帶上 { classroom, day }
  ↓ 分組：Map<timeStart, course[]>
  ↓ 排序：時間鍵依 timeToMinutes() 升冪
  ↓ 輸出：每個時間鍵一個 <tr>
        第 1 格 = 時間標籤
        第 2~8 格 = 週一～週日，各放該格所有課程卡（垂直堆疊）
```

同一「時間 × 星期」有多間教室的課時，卡片垂直堆疊於同一格（與 `renderByTeacher` 既有做法一致）。

### 4.2 取徑選擇

採「新增獨立函式 + 抽共用 helper」，而非把日檢視與週檢視的 time 渲染合併為單一函式。兩者版面已確定不同（一課一列 vs 時段網格），強行合併只會產生充斥 `if (isWeek)` 的分支。共用的僅資料攤平那層，故只抽該層。

### 4.3 順手重構（範圍內）

`renderDayViewByTime`、`renderAllSchedulesView`、`renderByTeacher` 三處各有一份幾乎相同的「攤平教室 × 日 → course 陣列」迴圈，新函式將是第四份。抽成共用 helper 一次收斂。

### 4.4 課程卡片欄位

現行為二選一，需擴為兩個獨立旗標：

| viewContext | 顯示老師 | 顯示教室 |
|---|---|---|
| `default` | ✅ | ❌（左欄已是教室） |
| `teacherSort` | ❌（左欄已是老師） | ✅ |
| `timeSort`（新增） | ✅ | ✅ |

標籤與衝突圖示沿用既有渲染，不變更。

## 5. 逐檔改動清單

### `UI.js.html`

| 項目 | 改動 |
|---|---|
| `setViewMode` | 移除「切週檢視時強制 `time` → `classroom`」 |
| `updateViewControls` | 「依時間」按鈕兩種檢視皆顯示；週檢視 time 模式表頭左上角斜線標籤改為「星期／時間」 |
| `renderScheduleTable` | 分派邏輯依 `currentViewMode` 導向 `renderDayViewByTime` 或 `renderWeekViewByTime` |
| `renderWeekViewByTime` | **新增** |
| `renderAllSchedulesView` | 加 week + time 分支，走唯讀變體（加 `readonly` class、移除刪除鈕）。**唯讀變體不得讓 timeSort card 的 editable 欄位繞過 `activeScheduleId` guard**（見 §5.4） |
| `renderWeekViewByTime` 空 cell | 時間 × 星期沒有天然教室，**空 cell 不得帶 `data-classroom` dataset**，避免 `handleEmptyCellDoubleClick` 誤觸新增（見 §5.5） |
| 共用 helper | 新增資料攤平 helper，收斂四處重複 |

> 「即將上課」徽章相關改動已從本節移除 —— 見 §9 非範圍第 5 項與 §5.3。

### 5.1 週檢視 + time 的持久化（blocker 1）

**現況**：`JavaScript.html:26-27` 只儲存 `lastViewMode`，`viewSortMode` 由它推導而非獨立儲存；`setViewSortMode`（`UI.js.html:423-427`）只改 `app.viewSortMode` 並重繪，**完全沒有 localStorage write**。因此使用者在週檢視按「依時間」後 refresh，constructor 會重新推導出 week + classroom，直接違反驗收條件 #5。

**⚠️ 持久化語意（回應 re-review §5.1 TDD_ACCEPTANCE — 避免改動日檢視行為）**：

現行日檢視的既有行為是「refresh 後 sort **一律回 `time`**」（`JavaScript.html:27` 對 day 恆推導 time，不記使用者在 day 選過的 classroom/teacher）。驗收條件 #9 要求「日檢視行為完全不變」。因此持久化**不得**做成跨 view 的單一全域 sort key（否則「day 選 teacher → refresh → 恢復 teacher」會改變日檢視行為）。

**採 view-scoped restore：`lastViewSortMode` 只作用於 week；day restore 一律強制 `time`。**

**設計**：

1. **新增持久化 key `lastViewSortMode`**：
   - `setViewSortMode`（`UI.js.html:423`）改 `app.viewSortMode` 時 `localStorage.setItem('lastViewSortMode', mode)`（無條件寫入當下值即可——day 寫入的值在 restore 時不會被讀，見 2）。
   - `setViewMode`（`UI.js.html:402`）維持既有：切 day 時 sort 預設 `time`。
2. **constructor 還原邏輯**（`JavaScript.html:26-27`）：
   - restored `currentViewMode === DAY` → `viewSortMode = 'time'`（**強制，維持現況、不讀 `lastViewSortMode`**）。
   - restored `currentViewMode === WEEK` → `viewSortMode = lastViewSortMode`，經**合法值 fallback**：值須落在 `{classroom, teacher, time}`；非法／不存在 → `classroom`（維持現行 week 首次載入預設）。
   - 結果：day 永遠 time 起手（行為不變）；week 記住 classroom/time/teacher；week+time 可跨 refresh 保存。
3. **測試**：新增還原測試——(a) week+time 存後還原為 week+time、(b) **day 選 teacher 後 refresh 仍為 day+time**（回歸鎖，直接對應驗收 #9）、(c) week 非法值 fallback classroom、(d) 舊使用者無 `lastViewSortMode` key 的向後相容。此還原決策函式須抽為 §7.2 的具名 production-importable 純邏輯（非 mirror 副本）。

### 5.2 週檢視 time 模式 PDF 內容契約（blocker 2）

**現況**：`PDFExport.js.html:252-266` 的 week branch 逐欄位抽取——`name`（`[data-field="name"]`）、`time`（`[data-field="time"]`）、`refTeacher`（`[data-field="teacher"]`）；`bottomObj` 預設 `(老師)`，**只有** `viewSortMode === 'teacher'` 時才改讀 `dataset.classroom` 印教室。新的 time mode 既非 teacher，會落入 else → PDF 每張課程卡**只有老師、遺漏教室**，違反驗收條件 #7 與資訊完整性。

**設計**：week PDF 的 `bottomObj` 組法擴為三分支，與螢幕卡片的 `viewContext` 對齊：

| `App.viewSortMode` | PDF `bottomObj` |
|---|---|
| `teacher` | `(教室：<classroom>)` |
| `time`（新增） | `<老師> · <教室>`（兩者皆列，格式實作時定） |
| 其餘（classroom 等） | `(<老師>)` |

- 教室值取 `item.dataset.classroom`（課程卡保留此 dataset，見 §5.4），老師取 `[data-field="teacher"]`。
- **測試**：新增 week-time PDF 的 fixture／assertion，驗證輸出同時含老師與教室。此段屬 `PDFExport.js.html`（HTML，coverage 排除）→ 對應**強制手動 TestCase**（見 §7）。

### 5.3 「即將上課」徽章 — 明確 day-only（blocker 3）

**現況**：徽章的**產生端** `findNextUpcomingClasses`（`DataCollection.js.html:181-188`）先 `nextUpcomingClassIds.clear()`，且 `currentViewMode !== DAY || currentDayIndex !== today` 即 early-return；每分鐘重繪的 timer（`JavaScript.html:67-76`）同樣只在 DAY + today 執行。只改 consumer `addUpcomingClassIndicators` 的掛載位置**沒有任何可觀察效果**（ID 集合恆為空）。

**決策（operator 拍板 2026-07-20）**：維持 day-only。週檢視 time 模式**不支援**「即將上課」徽章。故：

- 本設計**不改** `DataCollection.js.html` 的 producer guard、**不改** `JavaScript.html` 的 timer。
- `addUpcomingClassIndicators`（`UI.js.html`）在 time 模式左欄為時間、無教室名可掛，須確保**不因找不到 `.classroom-name-main` 而報錯**（防禦性 null check），但不主動渲染徽章。
- 列入 §9 非範圍。

**stale highlight（re-review watchpoint 1）已由既有流程關閉**：`renderScheduleTable`（`UI.js.html:492`）開頭即呼叫 `findNextUpcomingClasses`，後者第一行 `nextUpcomingClassIds.clear()`（`DataCollection.js.html:182`）後才 day/today early-return。故任何切到 week-time 的重繪都會先清空集合 → 不殘留舊 highlight。impl-review 仍應實測確認（WT-8 涵蓋日檢視回歸；此點順帶驗 week 無殘留 highlight）。

### 5.4 課程卡 dataset 與唯讀 guard（watchpoint）

- time-grid 課程卡**仍須保留** `dataset.classroom` / `dataset.day` —— inline edit / delete 依賴它們定位課程（`Interaction.js.html` 的編輯/刪除路徑）。可省的是**空 cell** 的 classroom dataset（§5.5），不是課程卡的。
- 全部課表 week-time 的唯讀變體：card 加 `readonly`、移除 delete 鈕，且 editable 欄位不得繞過 `activeScheduleId === ALL_SCHEDULES_ID` 的唯讀 guard。

### 5.5 空 cell 不帶 classroom（watchpoint）

`Interaction.js.html:613-619`：任何空白 `.schedule-cell` 的 double-click 會呼叫 `handleEmptyCellDoubleClick`，該 handler 依 `cell.dataset.classroom` / `cell.dataset.day` 開新增表單。時間 × 星期沒有天然教室 → time-grid 的空 cell **不得**帶可誤用的 `data-classroom`（否則會誤建課程到任意教室）。實作須保證：time-grid 空 cell 無 classroom dataset，或在 event path 明確禁止 time mode 新增。

### `tests/lib/` 與測試鏡像層

| 檔案 | 改動 |
|---|---|
| `uiHelpers.js` | `resolveRenderTarget` 分派條件同步（week+time → 新 renderer、day+time → 舊 renderer，兩者須區分）；`computeClassElementProps` 的 `showClassroomInContent` 二選一**擴為兩個獨立旗標** `showTeacher` / `showClassroom`，覆蓋 default／teacherSort／timeSort 三 context |
| `integrationHelpers.js` | render 函式清單契約加入新函式（**僅驗存在性，不能取代行為測試**，見 §7） |
| `tests/unit/uiHelpers.test.js` | `:50-57` 目前明確期待 week+time fallback 為 classroom → 須改為期待新 renderer |

> ⚠️ **鏡像層本質**：`tests/lib/` 是 UI 決策邏輯的**平行實作（mirror）**，它綠**不代表** production HTML 正確（見 §7 blocker 4）。

## 6. 邊界情況與錯誤處理

| 情況 | 預期行為 |
|---|---|
| 無任何課程 | 空表格（僅表頭），不報錯 |
| 篩選後某時段全空 | 該時間列不出現（動態列的自然結果） |
| 同一時間 × 同一天多間教室 | 卡片垂直堆疊於同一格 |
| 起始時間相同、結束時間不同 | 同列（分組鍵為 `timeStart`） |
| `timeStart` 格式異常 | 沿用 `timeToMinutes` 既有行為，不新增例外處理 |

渲染錯誤沿用 `renderScheduleTable` 既有 try/catch 與通知機制。

## 7. 測試策略

### 7.1 Coverage gate 的結構性限制（blocker 4）

⚠️ **關鍵前提**：`vitest.config.js:14-20` 的 coverage **只 instrument `程式碼.js` 與 `tests/lib/**`**，**所有 `.html` 檔（含 `UI.js.html` / `JavaScript.html` / `PDFExport.js.html` / `Interaction.js.html`）被明確排除**（GAS template `<script>` 無法被 v8 provider instrument）。gate 值為 lines 95 / functions 95 / branches 90 / statements 95。

**後果**：新增在 `UI.js.html` 的 `renderWeekViewByTime`、`JavaScript.html` 的持久化還原、`PDFExport.js.html` 的 time-mode 分支，**完全不計入 coverage**。若只讓 `tests/lib/` 的 mirror 通過，production HTML 就算保留 week+time fallback、timeSort 顯示錯欄位、或 PDF 漏教室，gate 仍會**全綠（false-green）**。`tests/unit/integrationHelpers.test.js:74-87` 的 UI 契約也只比對 factory method 名稱，不驗 dispatch／DOM row-cell／viewContext／readonly／PDF／persistence。

### 7.2 防 false-green（回應 re-review blocker 2 — 具名 wiring + 證據門檻）

**根本前提（誠實面對 GAS 架構）**：production 邏輯在 GAS `.html` include（runtime = GAS，透過 `Index.html` 的 `<?!= include() ?>` 組裝、以全域物件串接），test 在 vitest（runtime = Node ESM）。兩者**無法執行同一份 source 檔**，故 `tests/lib/` 對 production HTML 的正確性**在架構上不可能提供自動化保證**。因此 false-green 的真正對策**不是**更嚴的自動化，而是「mirror 降級為輔助 + 手動案例升為 production 唯一 gate + best-effort 抽單一 source 降 drift」。

**第 1 道 — mirror 降級為輔助（非 gate）**：`tests/lib/` 測試檔頭明確標註「mirror-only：本檔綠不代表 production HTML 正確；production 正確性由 §7.2 手動 TestCases gate」。自動化測試不得被當作 week-time 功能的驗收依據。

**第 2 道 — best-effort 單一 authored source + 具名 wiring（降 drift，非消除）**：把三塊純決策邏輯抽為**單一被 production 實際呼叫**的來源，而非各寫一份：

| 決策邏輯 | production 呼叫點（call-site） | 抽離目標 |
|---|---|---|
| render dispatch keying（viewMode × sortMode → 哪個 renderer） | `UI.js.html` `renderScheduleTable`（現 `:507-516` 分派段） | 抽成具名純函式，供 dispatch 直接呼叫 |
| 持久化還原 fallback（§5.1 view-scoped restore） | `JavaScript.html` constructor `:26-27` | 同上 |
| 卡片欄位旗標（default／teacherSort／timeSort → showTeacher/showClassroom） | `UI.js.html` `createClassElement`（現 `:349-353`） | 同上 |

- **具體形式**：新增一個 `.js.html` include（依現有 IIFE-module 慣例，如 `UtilityFunctions.js.html` / `DataCollection.js.html` 的形式），定義一個全域決策物件；production 的 `UI.js.html` / `JavaScript.html` 在上述 call-site **實際呼叫它**（不是各自 inline 一份邏輯）。
- **wiring 硬約束**：此 include 必須在 `Index.html` 的 include 順序中**先於** `UI.js.html` / `JavaScript.html`（全域須先定義後消費）——**`Index.html` 列入 Required Reads，impl 改 include 順序前先確認**（見 PROJECT.md §12 / LEAD SOP 對跨檔全域的規定）。若暴露新全域，**同步 `.eslintrc.json` globals**（否則 lint no-undef）。
- **降 drift 原理**：production 與 test 對的是**同一份 authored 邏輯**（production 呼叫它、test import 它的等價抽出），而非兩份獨立副本。
- **可行性 fallback**：若 impl 評估 GAS include 順序或 IIFE 域無法乾淨承載此抽離（實作時判定），**降級為 mirror + 在該處加對照註解指明 production 對應行號**，並**完全依賴第 3 道手動 gate**——不得因抽離失敗而放寬 production 正確性驗收。

**第 3 道 — 強制手動 TestCases（production HTML 的唯一 gate；寫入 `TestCases.md`，每案附證據）**：

| # | 案例 | 通過判準 | 證據門檻 |
|---|---|---|---|
| WT-1 | 週檢視選「依時間」的 **renderer dispatch** | 畫面呈**時間軸網格**（左欄時間、非教室列），**非** classroom fallback | 截圖貼 PR |
| WT-2 | **7-day placement** | 同一起始時間橫跨週一～日正確落欄；同時段多教室同格堆疊 | 截圖貼 PR |
| WT-3 | **卡片雙欄位** | 每張課程卡同時顯示老師**與**教室 | 截圖貼 PR |
| WT-4 | **持久化** | 週檢視選「依時間」→ refresh → 仍 week+time | 操作錄影/前後截圖貼 PR |
| WT-5 | **week-time PDF** | 匯出每張卡含老師**且**教室、左上角「星期／時間」 | PDF 檔/截圖貼 PR |
| WT-6 | **空 cell 無新增** | time-grid 空白格 double-click **不**開新增表單 | 操作錄影/截圖貼 PR |
| WT-7 | **全部課表唯讀** | week-time 下課程卡唯讀、無刪除鈕、editable 欄位不繞過 guard | 截圖貼 PR |
| WT-8 | **日檢視回歸** | 日檢視「依時間」仍一課一列、教室左欄、notes 行為不變；**day 選 teacher → refresh → 仍 day+time** | 截圖貼 PR |

> **證據門檻語意**：上述每案**須有 PR-attached 證據方可判 pass**；無證據 = 未驗收（不得以「code 看起來對」替代）。這是 GAS 架構下 production HTML 唯一的實質 gate。

### 7.3 自動化測試清單

- `resolveRenderTarget`：week+time → 新 renderer、day+time → 舊 renderer（兩者須區分）、fallback 行為
- `computeClassElementProps`：default／teacherSort／timeSort 三 context 的 `showTeacher` / `showClassroom` 旗標
- 持久化還原純函式：week+time 存還原、非法值 fallback、無 key 向後相容
- 分組 helper：空資料、篩選後全空、不規則時間、同時段多教室、同起始不同結束、異常 `timeStart`；並驗**時間排序**與 **7-day placement**
- 函式清單契約：`integrationHelpers.js`（僅存在性）

本地驗證跑 `workflow.sh` t6（full run）。無 E2E（GAS sandbox 限制），端到端正確性靠上列 §7.2 手動 TestCases。

## 8. 驗收條件

1. 週檢視下「依時間」按鈕可見可按
2. 切換後左欄變時間軸，每列為一個上課起始時間，橫向對應週一～日
3. 課程卡同時顯示老師與教室
4. 可 inline 編輯、可刪除、不可拖拉、無「+ 新增課程」
5. 重新整理後仍停在 week + time（**需 §5.1 獨立 `lastViewSortMode` 持久化**）
6. 「全部課表」模式下 week + time 走唯讀時間軸（card 唯讀、無刪除鈕、不繞過 guard）
7. PDF 匯出版面正確、左上角標「星期／時間」，**且每張課程卡含老師與教室**（需 §5.2 PDF time 分支）
8. time-grid 空白格 double-click 不開新增表單（§5.5）
9. 日檢視「依時間」行為完全不變（回歸：一課一列、教室左欄、notes）

## 9. 非範圍

- 日檢視改為時段分組網格
- 時間軸模式的拖拉排課
- 時間軸模式的「+ 新增課程」（含選教室 UI）
- 固定間隔時間軸／空堂視覺化
- **週檢視 time 模式的「即將上課」徽章**（operator 2026-07-20 拍板維持 day-only；不改 `DataCollection.js.html` producer guard 與 `JavaScript.html` timer）

## 10. 風險

| 風險 | 緩解 |
|---|---|
| `JavaScript.html` 為 App 主物件（Risk-Flag #2） | 改動 = 新增 `lastViewSortMode` 持久化 + 還原 fallback，範圍受控；review depth D3；含向後相容測試 |
| **測試鏡像層 false-green**（blocker 4） | §7.2：mirror-only 標註 + 抽 production-importable 純邏輯 + 強制手動 TestCases 補 HTML surface |
| **PDF time 分支漏教室**（blocker 2） | §5.2 明列三分支內容契約 + week-time PDF fixture；實作時實際匯出驗證，不僅靠靜態推論 |
| **持久化無法表達 week+time**（blocker 1） | §5.1 獨立 key + 合法值 fallback + refresh 測試 |
| 空 cell 誤觸新增（watchpoint） | §5.5：time-grid 空 cell 不帶 classroom dataset |
| 日檢視回歸 | 驗收條件第 9 項明列；`TestCases.md` B-1-1 手動案例覆蓋週／日切換 |
