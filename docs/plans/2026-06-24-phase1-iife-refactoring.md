# Phase 1 — JavaScript.html IIFE 職責域分離 Implementation Plan

> **Refs**: #129 (重構決策), #144 (準備度分析), #107 (Phase 2 coverage)
> **Base**: `origin/main` @ `9178602`
> **Scope**: 只拆分 JavaScript.html (1442 行) 的 App 內部方法到 7 個 IIFE-wrapped 新檔案。不碰其他 7 個 bare-script .html 檔。
> **Pattern**: `(function(App) { App.DomainName = { methods }; })(App);`

## Overview

JavaScript.html 是一個 1442 行的巨型 IIFE，內含 App 物件的全部方法。Phase 1 將其 7 個職責域分離到獨立的 IIFE-wrapped .html 檔案，每域 = 1 PR。

### 目標模式

```javascript
// 新檔案 e.g. UtilityFunctions.js.html
<script>
(function(App) {
  App.getShortUserName = function(email) { ... };
  App.timeToMinutes = function(timeStr) { ... };
  // ...
})(App);
</script>
```

JavaScript.html 最終只保留：state properties (L5-37) + init() (L39-82) + module wiring。

### 載入順序（Index.html L468-475）

```
Config → Elements → Api → Modals → History → UI → Interaction
→ [新域 1-7] → JavaScript.html (shrunk to core)
```

新的 IIFE 域插入在 Interaction 和 JavaScript 之間，順序按依賴拓撲排列。

## 7 個 PR 依序

### PR1: UtilityFunctions（canary, ~60 行）
- **方法**: `getShortUserName`, `generateUniqueId`, `stringToHashCode`, `timeToMinutes`, `formatTime`, `formatTimestampForFilename`, `hexToRgb`
- **源碼行**: L858-861, L898-908, L960-988, L1108-1115
- **依賴**: 零內部依賴，全 pure functions
- **外部依賴**: `AppConfig.TIME_REGEX` (formatTime only)
- **DI 測試**: ✅ utilityFunctions.js, frontendUtils.js, dataIdHelpers.js
- **風險**: 極低。Canary PR — 建立 IIFE 拆分模式
- **驗證**: `npm test` 全綠 + wiring tests 更新

### PR2: LockManager（~54 行）
- **方法**: `_getLocks`, `_saveLocks`, `acquireLock`, `releaseLock`, `releaseCurrentLock`, `refreshLockHeartbeat`
- **源碼行**: L742-795
- **依賴**: 只讀 state (tabId, activeScheduleId, isReadOnly)
- **外部依賴**: `localStorage`
- **DI 測試**: ✅ lockHelpers.js (complete createLockManager)
- **風險**: 低

### PR3: DataCollection（~120 行）
- **方法**: `_collectFromScheduleData`, `getAllTags`, `_collectFromAllCourses`, `getGlobalAllTags`, `getGlobalAllCourseNames`, `getGlobalAllTeachers`, `ensureDataIds`, `buildCourseColorMap`, `sortClassrooms`, `_forEachCourse`, `countOccurrences`, `updateAllOccurrences`
- **源碼行**: L797-856, L881-896, L910-946, L1038-1065
- **依賴**: UtilityFunctions (stringToHashCode, generateUniqueId)
- **外部依賴**: `AppConfig.COURSE_COLORS`
- **DI 測試**: ✅ dataCollectionHelpers.js, stateHelpers.js, dataIdHelpers.js
- **風險**: 低。注意 `_forEachCourse` 是多個方法的共用 helper

### PR4: FilterEngine（~100 行）
- **方法**: `loadAndApplyPersistedFilters`, `applyTagFilters`, `toggleAllFilterCheckboxes`, `applyFilters`, `clearAdvancedFilters`, `clearAllFilters`, `_filterScheduleData`, `filterDataByTags`, `filterDataByActiveFilters`
- **源碼行**: L401-502, L991-1036
- **依賴**: DataCollection (getAllTags)
- **外部依賴**: `AppElements.filter*`, `localStorage`
- **Module 依賴**: `this.ui.*`, `this.modals.*`, `this.tagFilterTagify`
- **DI 測試**: ✅ filterHelpers.js, dataCollectionHelpers.js
- **風險**: 中。UI callback 多，注意 `this` → `App` 替換

### PR5: DataIO（~185 行）
- **方法**: `loadVersions`, `handleLoadVersion`, `saveDataToLocal`, `loadDataFromServer`, `saveDataToServer`
- **源碼行**: L504-688
- **依賴**: UtilityFunctions, DataCollection, ScheduleManager (circular — 透過 App.xxx)
- **外部依賴**: `ServerApi.call`, `AppConfig.*`, `AppElements.versionHistorySelect`, `localStorage`
- **Module 依賴**: `this.ui.*`, `this.modals.*`, `this.historyModule.*`
- **DI 測試**: ✅ stateHelpers.js, appLifecycleHelpers.js
- **風險**: 中。與 ScheduleManager 有循環依賴 → 兩者都掛回 App，透過 `App.xxx` 互呼叫
- ⚠️ `findNextUpcomingClasses` (L690-738) 歸入 DataCollection 或此域（建議 DataCollection）

### PR6: ScheduleManager（~315 行）
- **方法**: `showFirstTimeScheduleSelector`, `handleEditClassroom`, `loadInitialSchedules`, `loadSchedule`, `saveSchedulesToLocal`, `handleAddSchedule`, `handleScheduleListClick`, `handleScheduleSelectChange`
- **源碼行**: L85-399
- **依賴**: LockManager, DataCollection, FilterEngine, DataIO (circular)
- **外部依賴**: `ServerApi.call`, `AppConfig.*`, `AppElements.*`
- **Module 依賴**: `this.ui.*`, `this.modals.*`, `this.historyModule.*`
- **DI 測試**: ✅ Partial: scheduleListHelpers.js, appLifecycleHelpers.js, stateHelpers.js
- **風險**: 高。最多跨域耦合。`this` → `App` 替換最密集
- **含**: `isCurrentUserAdmin` (L863-865), `canManageCurrentScheduleSettings` (L867-879)
- **含**: `handleDrop` (L1067-1106)

### PR7: PDFExport（~320 行）
- **方法**: `printScheduleToPdf`
- **源碼行**: L1117-1435
- **依賴**: UtilityFunctions (hexToRgb, formatTimestampForFilename)
- **外部依賴**: `ServerApi.call`, `AppConfig.*`, `window.jspdf`, DOM
- **DI 測試**: ❌ 無（DOM + jsPDF heavy）
- **風險**: 中。最大單一方法但 self-contained，無其他域依賴它

## 每個 PR 的標準步驟

1. 建立新檔案 `DomainName.js.html`，IIFE pattern
2. 從 JavaScript.html 移出方法，`this.xxx` → `App.xxx`
3. 更新 Index.html 加入 `<?!= HtmlService.createHtmlOutputFromFile('DomainName.js').getContent(); ?>` 在 Interaction 和 JavaScript 之間
4. 更新 wiring tests（appWiringContracts, syncMethodsWiring, asyncMethodsWiring 的路徑/結構）
5. `npm test` 全綠
6. Scope gate: 只改 3-4 個檔案（新 .html + JavaScript.html + Index.html + wiring tests）

## 循環依賴處理

DataIO ↔ ScheduleManager：
- DataIO 呼叫 `loadInitialSchedules`, `loadSchedule`, `saveSchedulesToLocal`
- ScheduleManager 呼叫 `saveDataToLocal`
- 解法：兩者都掛回 App，透過 `App.xxx` 互呼叫（IIFE pattern 自然支持，因為都 close over 同一個 App 物件）

## Verification（operator 手動，每 Wave 結束後）

IIFE 重構只改 scope 不改邏輯。自動化驗證 = `npm test` 全綠。手動驗證：

### Wave A 完成後（PR1-3 merge）
1. `clasp push dev`
2. 開啟試算表 → 載入頁面 → 確認載入正常
3. 切換 schedule → 確認資料載入
4. 新增/刪除 schedule → 確認 CRUD 正常
5. Lock indicator → 確認多 tab 鎖定正常

### Wave B 完成後（PR4-6 merge）
1. `clasp push dev`
2. Filter 操作 → 確認篩選正常
3. Save/Load → 確認資料持久化
4. Undo/Redo → 確認歷史正常
5. Schedule list click 四分支 → rename/delete/copy/settings

### Wave C 完成後（PR7 merge）
1. `clasp push dev`
2. 匯出 PDF → 確認格式正常
3. 全功能 smoke test

## 派工策略

- **Wave A**: PR1 (canary, solo impl) → 確認模式可行後，PR2+PR3 平行
- **Wave B**: PR4+PR5 平行 → PR6 (最複雜，solo impl)
- **Wave C**: PR7 (solo impl)
- 每 Wave 中間暫停通知 operator

## Coverage Threshold

Phase 1 啟動前上調 threshold 至 65/72/80/65（防重構退步）。作為 PR1 的一部分。
