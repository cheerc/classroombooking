# P0 Coverage Sprint — God Object 重構前測試安全網

> **For agentic workers:** Read this plan + dispatch-book Required Reads before starting each wave.

**Goal:** 補足 God Object (#40) 重構前的測試安全網——覆蓋 16 個 not-extractable App methods + 程式碼.js 後端，確保重構時 regression 可被自動測試捕捉。

**Architecture:** 以現有 DI extraction + `createGasEnv` sandbox pattern 為基礎，新增 wiring smoke tests（驗方法存在 + call signature + 依賴呼叫 + side effects）。不改 production code，只新增測試。

**Tech Stack:** Vitest + happy-dom + gasMocks.js IIFE factory

**Baseline:** Stmts 64.42% / Branches 73.35% / Funcs 83.44% / Lines 63.76% (685 tests)

**refs:** #107 (Phase 2 coverage), #40 (God Object)

---

## Required Reads（全 wave 通用）

```yaml
required_reads:
  - 程式碼.js                          # 17 GAS backend functions, 608 lines
  - JavaScript.html                    # App object, 1443 lines, 53 methods
  - Api.js.html                        # ServerApi.call bridge (24 lines)
  - tests/unit/backend.test.js         # existing GAS sandbox pattern (1140 lines)
  - tests/mocks/gasMocks.js            # IIFE factory mocks
  - tests/mocks/appTestDouble.js       # App test double
  - tests/setup/dom.js                 # happy-dom setup
  - tests/unit/wiringContracts.test.js # existing wiring contract pattern
  - vitest.config.js                   # coverage scope + thresholds
```

---

## Wave 拆分

| Wave | Scope | Target | 預估 PR |
|------|-------|--------|---------|
| **1** | `程式碼.js` signature contracts | 驗 17 exported functions 簽名與 API bridge 呼叫一致 | 1 PR |
| **2** | 9 async not-extractable methods | wiring smoke: happy-dom + mock ServerApi → 驗 side effects | 1 PR |
| **3** | 7 sync DOM/localStorage methods | wiring smoke: happy-dom + mock localStorage → 驗 side effects | 1 PR |
| **4 (P1)** | DOM event binding lifecycle | init→load→render→interact→save regression | 1 PR |
| **5 (P2)** | PHP routes coverage | index.php routing + generate_iframe access control paths | 1 PR |

**⚠️ Retro-gated:** 每 wave 完成 → 報 general → 等 /retro + go → 下一 wave。

---

## Wave 1: `程式碼.js` Signature Contracts

**目的:** 程式碼.js 現為 0% 覆蓋（608 行 / 17 functions / 303 statements）。已有 `backend.test.js` (1140 行) 用 `createGasEnv` sandbox 測試邏輯，但 v8 追蹤的是 sandbox 內複本、不是 `程式碼.js` 本身。此 wave 新增 signature contract test，驗證：
1. `程式碼.js` 的 17 個 top-level function **存在且 callable**
2. 每個 function 的 **parameter count** 與 `backend.test.js` / `Api.js.html` 呼叫端一致
3. **ServerApi bridge 一致性** — 前端 `ServerApi.call('functionName', ...)` 呼叫的 9 個函式名都能在 `程式碼.js` 找到對應 function

**Files:**
- Create: `tests/unit/backendSignatureContracts.test.js`
- Read: `程式碼.js`, `Api.js.html`, `tests/unit/backend.test.js`

**Strategy:**
- 使用 `createGasEnv()` 初始化 sandbox（與 `backend.test.js` 同 pattern）
- `Object.keys(env)` 取得所有 exported functions
- 對每個 function 驗 `typeof === 'function'` + `.length`（parameter count）
- 對 API bridge 的 9 個呼叫名（`getData`, `saveData`, `addSchedule`, `updateScheduleMetadata`, `deleteSchedule`, `copySchedule`, `getVersions`, `getVersionData`, `getFontBase64FromDrive`）驗證存在

**Verification:**
- `npx vitest --run tests/unit/backendSignatureContracts.test.js`
- `npx vitest --run --coverage` → `程式碼.js` coverage 應上升（createGasEnv 的 Function wrapper 會 instrument 源碼）
- `./workflow.sh t6` 全綠

**Success criteria:**
- 17 個 function 的 signature contract tests 全通過
- 9 個 API bridge function 名一致性通過
- `workflow.sh t6` 全綠
- PR Closes 或 refs #107

---

## Wave 2: Async Not-Extractable Methods Wiring Smoke

**目的:** 驗證 9 個 async App methods 的 wiring — 它們呼叫 `ServerApi.call` → 預期的 GAS function。這些方法因 async + DOM + GAS API 依賴而無法抽取到 `tests/lib/`。用 happy-dom + mock ServerApi 在 Vitest 中直接測試。

**9 個 async methods（JavaScript.html）：**

| Method | Line | ServerApi calls |
|--------|------|-----------------|
| `handleAddSchedule` | 227 | `addSchedule` |
| `handleScheduleListClick` | 259 | `updateScheduleMetadata`, `deleteSchedule`, `copySchedule` |
| `handleScheduleSelectChange` | 359 | (indirect via `loadDataFromServer`) |
| `applyTagFilters` | 433 | (pure frontend, no ServerApi) |
| `loadVersions` | 505 | `getVersions` |
| `handleLoadVersion` | 532 | `getVersionData` |
| `loadDataFromServer` | 604 | `getData` |
| `saveDataToServer` | 643 | `saveData` |
| `printScheduleToPdf` | 1117 | `getFontBase64FromDrive` |

**Files:**
- Create: `tests/unit/asyncMethodsWiring.test.js`
- Read: `JavaScript.html:227-680,1117-1200`, `tests/mocks/appTestDouble.js`

**Strategy:**
- 建立 minimal App-like object，注入 mock `ServerApi`（spy on `call`）
- 對每個 async method：呼叫 → 驗 `ServerApi.call` 被 called with 正確 function name
- DOM 依賴用 happy-dom + minimal stubs
- **不測邏輯正確性**（那是 `backend.test.js` 和 `tests/lib/` 的職責）——只測 wiring

**Verification:**
- `npx vitest --run tests/unit/asyncMethodsWiring.test.js`
- `./workflow.sh t6` 全綠

**Success criteria:**
- 9 個 async method 的 ServerApi wiring 驗證通過
- 每個 method 呼叫預期的 GAS function name
- `workflow.sh t6` 全綠
- PR refs #107

---

## Wave 3: Sync DOM/localStorage Methods Wiring Smoke

**目的:** 驗證 7+ 個 sync not-extractable methods 的 wiring — DOM 操作、localStorage 讀寫。

**Methods（JavaScript.html）：**

| Method | Line | 主要依賴 |
|--------|------|----------|
| `init` | 45 | DOM + event listeners + loadInitialSchedules |
| `showFirstTimeScheduleSelector` | 85 | DOM (modal) |
| `saveSchedulesToLocal` | 223 | localStorage |
| `toggleAllFilterCheckboxes` | 463 | DOM checkboxes |
| `clearAdvancedFilters` | 483 | DOM state reset |
| `clearAllFilters` | 491 | DOM state reset + applyFilters |
| `_getLocks` / `_saveLocks` | 742/750 | localStorage JSON |
| `releaseCurrentLock` | 782 | thin wrapper → releaseLock |
| `refreshLockHeartbeat` | 786 | setInterval + acquireLock |

**Files:**
- Create: `tests/unit/syncMethodsWiring.test.js`
- Read: `JavaScript.html:45-100,223-230,463-500,742-795`, `tests/setup/dom.js`

**Strategy:**
- happy-dom 提供 DOM 環境
- mock `localStorage`（`vi.stubGlobal`）
- 對每個 method：呼叫 → 驗預期 side effects（DOM 變更 / localStorage 寫入 / 依賴函式被 called）
- `init` 最複雜：驗 event listeners 綁定 + loadInitialSchedules 被呼叫

**Verification:**
- `npx vitest --run tests/unit/syncMethodsWiring.test.js`
- `./workflow.sh t6` 全綠

**Success criteria:**
- 所有 sync wiring smoke tests 通過
- `workflow.sh t6` 全綠
- PR refs #107

---

## Wave 4 (P1): DOM Event Binding Lifecycle Regression

**目的:** 驗證 init → load → render → interact → save 的完整生命週期，確保重構不會打斷事件綁定鏈。

**Files:**
- Create: `tests/unit/lifecycleRegression.test.js`
- Read: `JavaScript.html` (init sequence), `UI.js.html` (render), `Interaction.js.html` (events)

**Strategy:**
- 完整 App test double + happy-dom
- 模擬 init → loadDataFromServer → render → user interaction → save 流程
- 驗每個階段的 state transitions 和 event handler 綁定

**Verification:**
- `npx vitest --run tests/unit/lifecycleRegression.test.js`
- `./workflow.sh t6` 全綠

---

## Wave 5 (P2): PHP Routes Coverage

**目的:** `classroom_viewer/` PHP coverage 從 13.2% → 40%+。

**Files:**
- Create/modify: `classroom_viewer/tests/` PHPUnit test files
- Read: `classroom_viewer/index.php`, `classroom_viewer/generate_iframe.php`

**Strategy:**
- index.php routing paths (GET params, schedule loading)
- generate_iframe.php access control (email whitelist, POST handling)
- Error paths (missing config, invalid input)

**Verification:**
- `cd classroom_viewer && vendor/bin/phpunit`
- `./workflow.sh t6` 全綠

---

## Coverage 預期提升

| Wave | 新增覆蓋 | 預估 Stmts 增幅 |
|------|----------|-----------------|
| 1 | 程式碼.js 17 函式 signature | +5-8%（303 stmts 進入 instrumentation） |
| 2 | 9 async methods 間接 | +2-3% |
| 3 | 7 sync methods 間接 | +1-2% |
| 4 | lifecycle integration | +1-2% |
| 5 | PHP routes | PHPUnit 獨立計 |
| **合計** | | ~70-75% stmts（估） |

## Affected Callers / Blast Radius

- **No production code changes** — 只新增 test files
- **Affected CI**: `ci.yml` t8 (Vitest) — 新增 tests 會自動跑
- **Coverage thresholds**: 可在最後一個 wave 之後 ratchet up

## Risk Notes

- `程式碼.js` 的 `createGasEnv` sandbox 用 `new Function()` 包裝——signature test 的 parameter count (`.length`) 取決於 wrapping 是否保留原始 function 的 `.length`。需 impl 先 spike 確認。
- `.html` files 不在 v8 coverage scope（vitest.config.js 排除）——Wave 2/3 的 async/sync method tests 不會直接提升 `.html` coverage %，但提供 **wiring safety net**（重構時拆分這些 methods 到 ES module 後 coverage 才會反映）。
