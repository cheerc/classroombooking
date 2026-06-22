# Plan: Test Coverage 80%+ Critical Path — classroombooking

> **目標**：實作 issues #85-#90 + #92-#95（10 個 test-coverage issues），讓 critical path coverage 達 80%+。
> **前置**：先修 #91（clasp push blocker）。
> **預估新增**：~95-110 tests，從現有 90 tests 提升至 ~200 tests。

## 背景

兩輪 codebase review（V1+V2）透過 5 人並行分析產出 97 raw findings，經 LEAD-TRIAGE 去重後建立 10 個 test-coverage issues + 1 個 blocker bug。

### 現有測試分佈
- `tests/unit/backend.test.js` — GAS 後端（45 tests）
- `tests/unit/frontend.test.js` — 前端 pure logic（~26 tests，由 #72-#75 新增）
- `tests/unit/dateUtils.test.js` — 日期工具（16 tests）
- `tests/unit/escapeHtml.test.js` — HTML escaping（10 tests）
- `tests/mocks/gasMocks.js` — GAS service mocks
- `tests/mocks/frontendMocks.js` — 前端 mock 工具
- `classroom_viewer/tests/` — PHPUnit（19 tests）

### Tech Stack 約束
- GAS V8 runtime — 無 ES modules，用 function extraction pattern
- 前端 flat HTML includes — 無 bundler，靠 `tests/lib/` 提取副本
- PHP 用 Composer + PHPUnit

---

## Phase 0: 前置修復（Blocker）

### Step 0.1 — 修復 #91 clasp push vendor JS
- **問題**：`classroom_viewer/vendor/` 的 PHPUnit JS 檔案被 clasp 推入 GAS
- **修正**：調整 `.claspignore` 格式或加 `classroom_viewer/**`
- **驗證**：`clasp push` 不再報 ReferenceError
- **PR**：獨立 PR，不與測試混合

---

## Phase 1: 基礎設施（解鎖後續所有測試）

### Step 1.1 — #89 Test infrastructure improvements
- [ ] `npm install -D @vitest/coverage-v8`
- [ ] 更新 `vitest.config.js`：加 `coverage` provider + threshold（先設 25% 基線）
- [ ] 擴充 `gasMocks.js`：加 `createMockDriveApp`、`createMockUrlFetchApp`
- [ ] 建立 DOM testing setup：`tests/setup/dom.js`（happy-dom 或 jsdom）
- [ ] 建立 `tests/mocks/appTestDouble.js`：mock App object for module factory tests
- [ ] PHPUnit：更新 `phpunit.xml` 加 coverage config
- **驗證**：`npx vitest --run --coverage` 產出 coverage 報告
- **PR**：獨立 PR

---

## Phase 2: 後端測試（HIGH — 資料安全）

### Step 2.1 — #85 Backend mutating error paths
- [ ] saveData() history trimming：deleteRow(idx+2) 算術驗證、MAX_HISTORY_RECORDS=20 boundary
- [ ] Lock waitLock(30000) failure path：mock LockService throw across 5 mutating functions
- [ ] saveData() missing schedule sheet：null sheet throw
- [ ] copySchedule() missing source sheet：null source throw
- [ ] getOrCreateSheet() header init：Data + History 兩種 header branch
- **檔案**：`tests/unit/backend.test.js`（擴充）
- **預估**：~8-10 tests
- **驗證**：`npx vitest --run tests/unit/backend.test.js`

### Step 2.2 — #87 Backend utility zero-coverage
- [ ] doGet()：template rendering + isAdmin 判定（需 HtmlService mock）
- [ ] getFontBase64FromDrive()：happy path + missing config + regex fail（需 DriveApp mock from Step 1.1）
- [ ] getData() JSON parse error collection：各 field 的 try/catch + parseErrors[]
- **檔案**：`tests/unit/backend.test.js`（擴充）
- **預估**：~6-8 tests

---

## Phase 3: 前端互動測試（HIGH — 最大 0% 區域）

### Step 3.1 — #86 Frontend interaction handlers
- [ ] 提取 handleDrop data mutation 為 pure function → `tests/lib/interactionHelpers.js`
- [ ] handleScheduleBodyClick double-click state machine（mock setTimeout）
- [ ] handleCourseFormSave batch rename propagation（依賴 updateAllOccurrences）
- [ ] handleGlobalKeydown escape stacking [Residual #81]
- **檔案**：新增 `tests/unit/interaction.test.js` + `tests/lib/interactionHelpers.js`
- **預估**：~12-15 tests
- **依賴**：Step 1.1（DOM setup + appTestDouble）

### Step 3.2 — #92 UI 渲染核心
- [ ] renderScheduleTable 4 路 dispatch（按 viewSortMode + currentViewMode）
- [ ] createClassElement 課程卡（XSS escaping 驗證、conflict highlight、viewContext branching）
- [ ] manageLoadingState start/end 狀態機
- [ ] updateHeaderUIState 權限 UI gating
- **檔案**：新增 `tests/unit/ui.test.js` + `tests/lib/uiHelpers.js`
- **預估**：~12-15 tests
- **依賴**：Step 1.1（DOM setup）

### Step 3.3 — #93 Module factory contracts + integration
- [ ] 4 個 factory 的 contract tests（returned object shape 驗證）
- [ ] Edit chain integration：handleCourseFormSave → saveDataToLocal → renderScheduleGrid
- [ ] Undo chain integration：undo → restoreState → renderScheduleGrid
- [ ] Switch chain integration：loadSchedule → lock → loadData → render
- **檔案**：新增 `tests/unit/integration.test.js`
- **預估**：~10-12 tests
- **依賴**：Step 1.1（appTestDouble）

---

## Phase 4: 前端 state + PHP（MEDIUM）

### Step 4.1 — #94 Frontend state logic
- [ ] findNextUpcomingClasses：30min threshold + day-of-week + fallback
- [ ] History dirty-state + loadState validation（structuredClone guard）[Residual #76]
- [ ] handleEditClassroom rename data migration
- [ ] saveDataToServer error recovery [Residual #78]
- [ ] countOccurrences / updateAllOccurrences
- **檔案**：`tests/unit/frontend.test.js`（擴充）+ `tests/lib/stateHelpers.js`
- **預估**：~15-18 tests

### Step 4.2 — #88 PHP runtime paths
- [ ] index.php tag filtering（include/exclude + type guard edge cases）
- [ ] generate_iframe.php access control + POST processing
- [ ] generate_iframe.php json_encode XSS safety（加 JSON_HEX_TAG）
- **檔案**：`classroom_viewer/tests/` 擴充
- **預估**：~8-10 tests
- **驗證**：`cd classroom_viewer && vendor/bin/phpunit`

---

## Phase 5: 收尾（LOW）

### Step 5.1 — #90 + #95 Frontend utility extraction + data helpers
- [ ] 提取 8+ pure functions 到 `tests/lib/`（stringToHashCode, sortClassrooms, hexToRgb, getShortUserName, ensureDataIds, buildCourseColorMap 等）
- [ ] Data collection utilities（_collectFromScheduleData, getAllTags 等 6 functions）
- [ ] UI grouping（groupByTeacher, groupByTime）
- [ ] Modals content rendering [Residual #81]
- [ ] formatTime / formatTimestampForFilename
- [ ] loadAndApplyPersistedFilters localStorage edge cases
- **檔案**：`tests/lib/*.js` + `tests/unit/*.test.js`
- **預估**：~18-24 tests

### Step 5.2 — 收尾驗證
- [ ] `npx vitest --run --coverage` 確認 coverage ≥ 80% critical path
- [ ] 調高 `vitest.config.js` coverage threshold 到 60%
- [ ] 確認 `clasp push` 正常（#91 修復後）
- [ ] 更新 #61 issue comment 回報最終 coverage 數字
- [ ] Close #61

---

## PR 策略

| PR | 包含 Issues | 分支名 | 複雜度 |
|----|------------|--------|--------|
| PR-0 | #91 | fix/clasp-ignore-vendor | trivial |
| PR-1 | #89 | feat/test-infra-coverage | simple |
| PR-2 | #85, #87 | feat/backend-test-coverage | simple |
| PR-3 | #86, #92, #93 | feat/frontend-test-coverage | complex |
| PR-4 | #94, #88 | feat/state-php-test-coverage | simple |
| PR-5 | #90, #95 | feat/utility-test-coverage | simple |

每個 PR 需通過：
1. `npx vitest --run`（全 pass）
2. `cd classroom_viewer && vendor/bin/phpunit`（如果改 PHP）
3. Coverage 不低於前一個 PR 的 threshold
4. 1 reviewer VERIFIED

## 注意事項

- GAS 無 module system — 所有提取到 `tests/lib/` 的函式是**副本**，原檔不動
- `tests/lib/` 提取要遵循既有 `dateUtils.js` / `escapeHtml.js` pattern
- 前端 DOM 測試需要 happy-dom + mock App object — Phase 1 infra 解鎖後才能做 Phase 3
- PHP vendor 目錄不進 git（.gitignore），但需確認 .claspignore 也排除
