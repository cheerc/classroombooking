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

另 `JavaScript.html` 的 localStorage 還原邏輯亦將 week + time 視為無效組合。

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
| PDF 匯出 | **一併支援** | 週檢視 PDF 是 DOM scraping，沿用相同表格結構即自動跟進；僅需修正左上角標籤 |

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
| `renderAllSchedulesView` | 加 week + time 分支，走唯讀變體（加 `readonly` class、移除刪除鈕） |
| `addUpcomingClassIndicators` | 「即將上課」徽章目前掛在左欄教室名旁；time 模式左欄是時間，改掛到課程卡上 |
| 共用 helper | 新增資料攤平 helper，收斂四處重複 |

### `JavaScript.html`

localStorage 還原邏輯允許 week + time 組合（Risk-Flag #2，改動需標記）。

### `PDFExport.js.html`

左上角斜線標籤 `bottomText` 加入 `time` → `'時間'`。表格本體靠 DOM scraping 自動跟進，須驗證左欄取值選擇器與新結構相容。

### `tests/lib/`

| 檔案 | 改動 |
|---|---|
| `uiHelpers.js` | `resolveRenderTarget` 分派條件同步；`computeClassElementProps` 的 `showClassroomInContent` 擴為獨立的顯示老師／顯示教室旗標 |
| `integrationHelpers.js` | render 函式清單契約加入新函式 |

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

CI 有 coverage gate（95/90/95/95），`tests/lib/` 為 UI 決策邏輯的平行實作，改一處須改兩處，否則契約測試會抓到不一致。

- `resolveRenderTarget`：week + time 導向新 renderer、日檢視維持原 renderer、fallback 行為
- `computeClassElementProps`：三種 `viewContext` 的欄位顯示旗標
- 分組邏輯純函式：空資料、篩選後全空、不規則時間、同時段多教室、同起始不同結束
- 函式清單契約：`integrationHelpers.js`

本地驗證跑 `workflow.sh` t6（full run）。無 E2E（GAS sandbox 限制），端到端正確性靠 `TestCases.md` 手動驗收。

## 8. 驗收條件

1. 週檢視下「依時間」按鈕可見可按
2. 切換後左欄變時間軸，每列為一個上課起始時間，橫向對應週一～日
3. 課程卡同時顯示老師與教室
4. 可 inline 編輯、可刪除、不可拖拉、無「+ 新增課程」
5. 重新整理後仍停在 week + time
6. 「全部課表」模式下 week + time 走唯讀時間軸
7. PDF 匯出版面正確、左上角標「星期／時間」
8. 日檢視「依時間」行為完全不變（回歸）

## 9. 非範圍

- 日檢視改為時段分組網格
- 時間軸模式的拖拉排課
- 時間軸模式的「+ 新增課程」（含選教室 UI）
- 固定間隔時間軸／空堂視覺化

## 10. 風險

| 風險 | 緩解 |
|---|---|
| `JavaScript.html` 為 App 主物件（Risk-Flag #2） | 本次改動限於 localStorage 還原邏輯，範圍極小；review depth D3 |
| 測試鏡像層漂移 | 逐項對照 `tests/lib/` 與 `UI.js.html` 的對應邏輯 |
| PDF DOM scraping 對新結構的相容性 | 實作時實際匯出驗證，不僅靠靜態推論 |
| 日檢視回歸 | 驗收條件第 8 項明列；`TestCases.md` B-1-1 手動案例覆蓋週／日切換 |
