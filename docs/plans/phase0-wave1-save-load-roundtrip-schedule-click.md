# Phase 0 Wave 1 — #130 Round-Trip + #131 handleScheduleListClick 行為測試

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add behavioral tests for the two Tier-1 blockers identified in #129: save↔load round-trip data integrity (#130) and handleScheduleListClick branch coverage (#131).

**Architecture:** Pure test addition — **zero production code changes**. Follow the established DI extraction pattern: extract pure logic from `JavaScript.html` App methods into `tests/lib/*.js` files with injected deps, then write unit tests calling extracted functions with mock dependencies.

**Tech Stack:** Vitest, existing mock infrastructure (`tests/mocks/frontendMocks.js`, `tests/mocks/gasMocks.js`, `tests/mocks/appTestDouble.js`)

**Closes:** #130, #131
**refs:** #129 (Phase 0 umbrella)

---

## Required Reads

```yaml
required_reads:
  - JavaScript.html:L604-688     # saveDataToServer + loadDataFromServer
  - JavaScript.html:L259-357     # handleScheduleListClick (3 branches)
  - 程式碼.js:L106-181           # getData() backend
  - 程式碼.js:L188-282           # saveData() backend
  - 程式碼.js:L357-498           # updateScheduleMetadata / deleteSchedule / copySchedule
  - tests/lib/stateHelpers.js    # existing saveDataToServer extraction
  - tests/lib/appLifecycleHelpers.js  # existing processServerLoadResult extraction
  - tests/lib/frontendUtils.js   # existing extractTimestamps
  - tests/unit/stateHelpers.gap.test.js  # existing save tests pattern
  - tests/unit/stateHelpers.fixtures.js  # makeSaveCtx factory
  - tests/mocks/frontendMocks.js # createMockServerApi, createMockStorage
  - tests/mocks/appTestDouble.js # createAppTestDouble
  - Api.js.html                  # ServerApi.call wrapper
```

---

## Scope Correction: #131 有 3 個分支，非 4 個

Issue #131 描述 "四分支"（rename/delete/copy/settings），但實際程式碼 `JavaScript.html:L259-357` 只有 **3 個分支**：
1. **Rename** (L264-301) — 透過 `showScheduleEditor` modal 處理名稱 + isDraft 設定
2. **Delete** (L304-326) — 確認後刪除
3. **Copy** (L328-356) — 提示新名稱後複製

「settings」不是獨立分支 — rename 分支已透過 `showScheduleEditor` modal 涵蓋設定功能（名稱 + isDraft）。

---

## File Structure

### New Files (create)
| File | Responsibility |
|------|---------------|
| `tests/lib/scheduleListHelpers.js` | DI 抽取 handleScheduleListClick 3 分支邏輯 |
| `tests/unit/saveLoadRoundTrip.test.js` | #130 round-trip 整合測試 |
| `tests/unit/scheduleListHelpers.test.js` | #131 分支行為測試 |
| `tests/unit/scheduleListHelpers.fixtures.js` | #131 fixture factories |

### Modified Files (extend)
| File | Changes |
|------|---------|
| (none) | 純新增測試，不改任何現有檔案 |

---

## Task 1: saveDataToServer ↔ loadDataFromServer Round-Trip 測試 (#130)

**Files:**
- Create: `tests/unit/saveLoadRoundTrip.test.js`

**Context:** `saveDataToServer` 已有 13+ 隔離測試（`stateHelpers.gap.test.js`），`loadDataFromServer` 有部分抽取（`processServerLoadResult`、`extractTimestamps`）。缺的是驗「save 出去的 payload → backend 回應 → load 回來的 state = 原始 state」的 round-trip。

**Affected callers:** 獨立新檔、不修改既有檔案，不影響現有 consumer。

### Round-Trip Test Strategy

用已抽取的 helper 組合：
1. `saveDataToServer`（`tests/lib/stateHelpers.js:L220`）— 呼叫 ServerApi.call('saveData', payload) 並更新 state
2. `processServerLoadResult`（`tests/lib/appLifecycleHelpers.js:L250`）— 處理 getData 回應、抽取 timestamp、清理 schedule 物件
3. 中間用 mock ServerApi 模擬 backend 行為（save → 回 lastModified → load 用該 timestamp）

- [ ] **Step 1: 建立 round-trip 測試檔並寫第一批 failing tests**

Create `tests/unit/saveLoadRoundTrip.test.js`:

```javascript
/**
 * #130 — saveDataToServer ↔ loadDataFromServer round-trip 行為測試
 * 驗資料完整性：save 出去的 payload → backend 回應 → load 回來的 state = 原始 state
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveDataToServer } from '../lib/stateHelpers.js';
import { processServerLoadResult } from '../lib/appLifecycleHelpers.js';

// --- Fixture Factories ---

function makeScheduleData() {
  return {
    classrooms: ['101', '102', '201'],
    scheduleData: [
      {
        id: 'course_1',
        name: '數學',
        teacher: '王老師',
        day: 1,
        period: 1,
        classroom: '101',
        duration: 1,
      },
      {
        id: 'course_2',
        name: '英文',
        teacher: '林老師',
        day: 2,
        period: 3,
        classroom: '102',
        duration: 2,
      },
    ],
    tags: [
      { name: '必修', color: '#FF0000' },
      { name: '選修', color: '#00FF00' },
    ],
  };
}

function makeRoundTripEnv(scheduleDataOverride) {
  const data = scheduleDataOverride || makeScheduleData();
  const scheduleId = 'schedule_test1';
  const originalTimestamp = '2024-01-01T00:00:00.000Z';
  const newTimestamp = '2024-01-01T00:01:00.000Z';

  // save context (matches makeSaveCtx pattern from stateHelpers.fixtures.js)
  const saveCtx = {
    isConnecting: false,
    activeScheduleId: scheduleId,
    scheduleLastModified: { [scheduleId]: originalTimestamp },
    classrooms: data.classrooms,
    scheduleData: data.scheduleData,
    tags: data.tags,
    lastSyncTime: null,
    historyModule: {
      updateCleanSnapshot: vi.fn(),
      checkDirty: vi.fn(),
    },
    modals: { showConfirm: vi.fn() },
    showLoading: vi.fn(),
    hideLoading: vi.fn(),
    showNotification: vi.fn(),
  };

  // Mock ServerApi that captures save payload and returns it in load
  let capturedPayload = null;

  const mockServerApi = {
    call: vi.fn(async (fnName, ...args) => {
      if (fnName === 'saveData') {
        capturedPayload = args[0];
        return { success: true, lastModified: newTimestamp };
      }
      if (fnName === 'getData') {
        // Simulate backend returning what was saved
        if (!capturedPayload) throw new Error('Nothing saved yet');
        return {
          success: true,
          schedules: {
            [scheduleId]: {
              name: '測試課表',
              createdBy: 'test@example.com',
              isDraft: false,
              lastModified: newTimestamp,
              data: capturedPayload.scheduleData, // backend stores and returns this
            },
          },
          metadataTimestamp: newTimestamp,
        };
      }
      throw new Error(`Unknown function: ${fnName}`);
    }),
  };

  return { saveCtx, mockServerApi, scheduleId, originalTimestamp, newTimestamp, data, getCapturedPayload: () => capturedPayload };
}

// --- Tests ---

describe('#130 saveDataToServer ↔ loadDataFromServer round-trip', () => {
  describe('資料完整性 round-trip', () => {
    it('save → load → scheduleData 內容一致', async () => {
      const { saveCtx, mockServerApi, data } = makeRoundTripEnv();

      // Step 1: Save
      await saveDataToServer(saveCtx, mockServerApi);

      // Step 2: Load (process the server response)
      const loadResult = await mockServerApi.call('getData');
      const processed = processServerLoadResult(loadResult);

      // Step 3: Verify round-trip integrity
      const loadedSchedule = Object.values(processed.schedules)[0];
      expect(loadedSchedule.data.scheduleData).toEqual(data.scheduleData);
      expect(loadedSchedule.data.classrooms).toEqual(data.classrooms);
      expect(loadedSchedule.data.tags).toEqual(data.tags);
    });

    it('save payload 格式正確（scheduleId + lastModified + scheduleData 三層結構）', async () => {
      const { saveCtx, mockServerApi, scheduleId, originalTimestamp, data, getCapturedPayload } = makeRoundTripEnv();

      await saveDataToServer(saveCtx, mockServerApi);

      const payload = getCapturedPayload();
      expect(payload).toHaveProperty('scheduleId', scheduleId);
      expect(payload).toHaveProperty('lastModified', originalTimestamp);
      expect(payload).toHaveProperty('scheduleData');
      expect(payload.scheduleData).toHaveProperty('classrooms', data.classrooms);
      expect(payload.scheduleData).toHaveProperty('scheduleData', data.scheduleData);
      expect(payload.scheduleData).toHaveProperty('tags', data.tags);
    });

    it('save 後 scheduleLastModified 更新為 server 回傳的新 timestamp', async () => {
      const { saveCtx, mockServerApi, scheduleId, newTimestamp } = makeRoundTripEnv();

      await saveDataToServer(saveCtx, mockServerApi);

      expect(saveCtx.scheduleLastModified[scheduleId]).toBe(newTimestamp);
    });

    it('load 後 timestamp 被正確抽取、不殘留在 schedule 物件內', async () => {
      const { saveCtx, mockServerApi } = makeRoundTripEnv();

      await saveDataToServer(saveCtx, mockServerApi);
      const loadResult = await mockServerApi.call('getData');
      const processed = processServerLoadResult(loadResult);

      const loadedSchedule = Object.values(processed.schedules)[0];
      // lastModified should be extracted into timestamps map, not in schedule
      expect(loadedSchedule).not.toHaveProperty('lastModified');
      expect(Object.values(processed.timestamps).length).toBeGreaterThan(0);
    });

    it('空 scheduleData (無課程) round-trip 一致', async () => {
      const emptyData = { classrooms: [], scheduleData: [], tags: [] };
      const { saveCtx, mockServerApi } = makeRoundTripEnv(emptyData);

      await saveDataToServer(saveCtx, mockServerApi);
      const loadResult = await mockServerApi.call('getData');
      const processed = processServerLoadResult(loadResult);

      const loadedSchedule = Object.values(processed.schedules)[0];
      expect(loadedSchedule.data.scheduleData).toEqual([]);
      expect(loadedSchedule.data.classrooms).toEqual([]);
      expect(loadedSchedule.data.tags).toEqual([]);
    });
  });

  describe('error path round-trip', () => {
    it('timestamp 衝突（conflict）→ saveDataToServer 不更新 state、不破壞 load', async () => {
      const { saveCtx, mockServerApi, scheduleId, originalTimestamp } = makeRoundTripEnv();

      // Override to return conflict
      mockServerApi.call.mockResolvedValueOnce({ conflict: true, error: '版本衝突' });

      await saveDataToServer(saveCtx, mockServerApi);

      // Timestamp should NOT have changed (conflict = no save)
      expect(saveCtx.scheduleLastModified[scheduleId]).toBe(originalTimestamp);
    });

    it('API error → state 保持不變', async () => {
      const { saveCtx, mockServerApi, scheduleId, originalTimestamp } = makeRoundTripEnv();
      const originalData = { ...saveCtx };

      mockServerApi.call.mockRejectedValueOnce(new Error('Network error'));

      await saveDataToServer(saveCtx, mockServerApi);

      // State should be unchanged
      expect(saveCtx.scheduleLastModified[scheduleId]).toBe(originalTimestamp);
    });

    it('missing timestamp → throws 找不到版本資訊', async () => {
      const { saveCtx, mockServerApi } = makeRoundTripEnv();
      saveCtx.scheduleLastModified = {}; // no timestamp

      await saveDataToServer(saveCtx, mockServerApi);

      // Should have shown error notification (not thrown to caller)
      expect(saveCtx.showNotification).toHaveBeenCalled();
    });
  });

  describe('isConnecting guard', () => {
    it('isConnecting=true → save 被阻擋、不發 API 呼叫', async () => {
      const { saveCtx, mockServerApi } = makeRoundTripEnv();
      saveCtx.isConnecting = true;

      await saveDataToServer(saveCtx, mockServerApi);

      expect(mockServerApi.call).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail/pass correctly**

Run: `npx vitest run tests/unit/saveLoadRoundTrip.test.js`
Expected: Tests should mostly pass (using existing extracted helpers), some may need adjustment based on actual helper signatures.

- [ ] **Step 3: Adjust based on actual helper signatures**

Read `tests/lib/stateHelpers.js:L220-265` and `tests/lib/appLifecycleHelpers.js:L250-270` carefully. Adjust the test factory (`makeRoundTripEnv`) to match the exact `saveDataToServer(ctx, ServerApi)` DI signature and `processServerLoadResult(result)` signature. Ensure the mock context has all required properties.

- [ ] **Step 4: Run full test to verify green**

Run: `npx vitest run tests/unit/saveLoadRoundTrip.test.js`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/saveLoadRoundTrip.test.js
git commit -m "test: add saveDataToServer ↔ loadDataFromServer round-trip behavioral tests (#130)

Closes #130
Co-authored-by: Gemini <noreply@google.com>"
```

---

## Task 2: handleScheduleListClick DI 抽取 (#131)

**Files:**
- Create: `tests/lib/scheduleListHelpers.js`
- Create: `tests/unit/scheduleListHelpers.fixtures.js`

**Context:** `handleScheduleListClick` (JavaScript.html:L259-357) 目前完全沒有 DI 抽取。需要把 3 個分支（rename/delete/copy）各自抽取為可注入依賴的純函式。

**Affected callers:** 獨立新檔、不修改 `JavaScript.html` 生產碼。

### Extraction Strategy

依據已建立的 DI extraction pattern（如 `saveDataToServer` 在 `stateHelpers.js` 中），把每個分支抽取為獨立函式，注入：
- `ctx` — App state (schedules, scheduleLastModified, activeScheduleId, activeMetadataTimestamp, etc.)
- `ServerApi` — mock-able API layer
- `modals` — showScheduleEditor / showConfirm / showPrompt
- `ui` — renderScheduleList / updateScheduleSelect

- [ ] **Step 1: 建立 fixture factory 檔案**

Create `tests/unit/scheduleListHelpers.fixtures.js`:

```javascript
/**
 * Fixture factories for #131 handleScheduleListClick branch tests
 */
import { vi } from 'vitest';

export function makeScheduleListCtx(overrides = {}) {
  return {
    schedules: {
      schedule_1: {
        name: '測試課表一',
        createdBy: 'test@example.com',
        isDraft: false,
        data: { scheduleData: [{ id: 'c1', name: '數學' }], classrooms: ['101'], tags: [] },
      },
      schedule_2: {
        name: '測試課表二',
        createdBy: 'test@example.com',
        isDraft: true,
        data: { scheduleData: [], classrooms: [], tags: [] },
      },
    },
    scheduleLastModified: {
      schedule_1: '2024-01-01T00:00:00.000Z',
      schedule_2: '2024-01-01T00:00:00.000Z',
    },
    activeScheduleId: 'schedule_1',
    activeMetadataTimestamp: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makeScheduleListDeps(handlerOverrides = {}) {
  return {
    ServerApi: {
      call: vi.fn(async (fnName, ...args) => {
        const handlers = {
          updateScheduleMetadata: () => ({
            success: true,
            newMetadataTimestamp: '2024-01-01T00:01:00.000Z',
            lastModified: '2024-01-01T00:01:00.000Z',
          }),
          deleteSchedule: () => ({
            success: true,
            newMetadataTimestamp: '2024-01-01T00:01:00.000Z',
          }),
          copySchedule: () => ({
            success: true,
            newId: 'schedule_new_' + Date.now(),
            createdBy: 'test@example.com',
            newMetadataTimestamp: '2024-01-01T00:01:00.000Z',
            lastModified: '2024-01-01T00:01:00.000Z',
            isDraft: false,
          }),
          ...handlerOverrides,
        };
        const handler = handlers[fnName];
        if (!handler) throw new Error(`Unmocked function: ${fnName}`);
        return handler(...args);
      }),
    },
    modals: {
      showScheduleEditor: vi.fn().mockResolvedValue(null),
      showConfirm: vi.fn().mockResolvedValue(false),
      showPrompt: vi.fn().mockResolvedValue(null),
    },
    ui: {
      renderScheduleList: vi.fn(),
      updateScheduleSelect: vi.fn(),
    },
    loadSchedule: vi.fn(),
    showLoading: vi.fn(),
    hideLoading: vi.fn(),
    showNotification: vi.fn(),
  };
}
```

- [ ] **Step 2: 建立 DI 抽取檔**

Create `tests/lib/scheduleListHelpers.js`.

Read `JavaScript.html:L259-357` 逐行提取。注意：
- 每個分支用 `e.target.closest('.xxx-btn')` 找按鈕 → 抽取為直接傳 `scheduleId` 的函式
- `this.xxx` 改為 `ctx.xxx`（DI）
- `ServerApi.call` / `this.modals.xxx` / `ui.xxx` 從 deps 注入

```javascript
/**
 * #131 — handleScheduleListClick DI extraction
 * Extracted from JavaScript.html L259-357 for testability
 * 3 branches: rename, delete, copy
 */

/**
 * Rename branch — shows schedule editor modal, updates metadata on server
 * Source: JavaScript.html L264-301
 *
 * @param {string} scheduleId - ID of schedule to rename
 * @param {object} ctx - App state { schedules, scheduleLastModified, activeMetadataTimestamp }
 * @param {object} deps - { ServerApi, modals, ui, showLoading, hideLoading, showNotification }
 */
export async function renameSchedule(scheduleId, ctx, deps) {
  const { ServerApi, modals, ui, showLoading, hideLoading, showNotification } = deps;

  const oldSchedule = ctx.schedules[scheduleId];
  if (!oldSchedule) return;

  const result = await modals.showScheduleEditor({
    id: scheduleId,
    name: oldSchedule.name,
    isDraft: oldSchedule.isDraft,
  });

  if (!result) return; // user cancelled

  const nameChanged = result.name !== oldSchedule.name;
  const isDraftChanged = result.isDraft !== oldSchedule.isDraft;
  if (!nameChanged && !isDraftChanged) return; // no changes

  try {
    showLoading('正在更新課表資訊...');
    const response = await ServerApi.call('updateScheduleMetadata', {
      id: scheduleId,
      newName: result.name,
      isDraft: result.isDraft,
      metadataTimestamp: ctx.activeMetadataTimestamp,
    });

    ctx.activeMetadataTimestamp = response.newMetadataTimestamp;
    ctx.schedules[scheduleId].name = result.name;
    ctx.schedules[scheduleId].isDraft = result.isDraft;
    ctx.scheduleLastModified[scheduleId] = response.lastModified;

    ui.renderScheduleList();
    ui.updateScheduleSelect();
    showNotification('課表資訊已更新', 'success');
  } catch (error) {
    showNotification('更新失敗: ' + error.message, 'error');
  } finally {
    hideLoading();
  }
}

/**
 * Delete branch — confirms, deletes schedule from server and state
 * Source: JavaScript.html L304-326
 */
export async function deleteSchedule(scheduleId, ctx, deps) {
  const { ServerApi, modals, ui, loadSchedule, showLoading, hideLoading, showNotification } = deps;

  const schedule = ctx.schedules[scheduleId];
  if (!schedule) return;

  const confirmed = await modals.showConfirm(`確定要刪除「${schedule.name}」嗎？此操作無法復原。`);
  if (!confirmed) return;

  try {
    showLoading('正在刪除課表...');
    const response = await ServerApi.call('deleteSchedule', {
      id: scheduleId,
      metadataTimestamp: ctx.activeMetadataTimestamp,
    });

    ctx.activeMetadataTimestamp = response.newMetadataTimestamp;
    delete ctx.schedules[scheduleId];

    // If deleting active schedule, switch to first available
    if (ctx.activeScheduleId === scheduleId) {
      const remaining = Object.keys(ctx.schedules);
      if (remaining.length > 0) {
        await loadSchedule(remaining[0]);
      }
    }

    ui.renderScheduleList();
    ui.updateScheduleSelect();
    showNotification('課表已刪除', 'success');
  } catch (error) {
    showNotification('刪除失敗: ' + error.message, 'error');
  } finally {
    hideLoading();
  }
}

/**
 * Copy branch — prompts for name, copies schedule on server
 * Source: JavaScript.html L328-356
 */
export async function copySchedule(scheduleId, ctx, deps) {
  const { ServerApi, modals, ui, showLoading, hideLoading, showNotification } = deps;

  const sourceSchedule = ctx.schedules[scheduleId];
  if (!sourceSchedule) return;

  const newName = await modals.showPrompt('請輸入新課表名稱：', sourceSchedule.name + ' (副本)');
  if (!newName) return; // user cancelled

  try {
    showLoading('正在複製課表...');
    const result = await ServerApi.call('copySchedule', {
      sourceId: scheduleId,
      newName,
      metadataTimestamp: ctx.activeMetadataTimestamp,
    });

    ctx.activeMetadataTimestamp = result.newMetadataTimestamp;
    ctx.schedules[result.newId] = {
      name: newName,
      createdBy: result.createdBy,
      isDraft: result.isDraft,
      data: JSON.parse(JSON.stringify(sourceSchedule.data)), // deep clone
    };
    ctx.scheduleLastModified[result.newId] = result.lastModified;

    ui.renderScheduleList();
    ui.updateScheduleSelect();
    showNotification('課表已複製', 'success');
  } catch (error) {
    showNotification('複製失敗: ' + error.message, 'error');
  } finally {
    hideLoading();
  }
}
```

⚠️ **重要**：上述抽取是基於 research 分析的 **approximate extraction**。Impl 必須**逐行比對 `JavaScript.html:L259-357` 原始碼**，確保：
- 所有 state mutations 被正確映射
- error handling 路徑完整
- loading state lifecycle 正確
- 如有與上述不符之處，以原始碼為準修正抽取

- [ ] **Step 3: Commit fixture + extraction**

```bash
git add tests/lib/scheduleListHelpers.js tests/unit/scheduleListHelpers.fixtures.js
git commit -m "test: extract handleScheduleListClick DI helpers for behavioral testing (#131)

Three extracted functions: renameSchedule, deleteSchedule, copySchedule
Following established DI pattern from stateHelpers.js

refs #131
Co-authored-by: Gemini <noreply@google.com>"
```

---

## Task 3: handleScheduleListClick 分支行為測試 (#131)

**Files:**
- Create: `tests/unit/scheduleListHelpers.test.js`

**Context:** 用 Task 2 抽取的 helper + fixture factory 測試 3 個分支的行為。

- [ ] **Step 1: 寫 rename 分支 failing tests**

Create `tests/unit/scheduleListHelpers.test.js`:

```javascript
/**
 * #131 — handleScheduleListClick 三分支行為測試
 * Tests extracted helpers from scheduleListHelpers.js
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renameSchedule, deleteSchedule, copySchedule } from '../lib/scheduleListHelpers.js';
import { makeScheduleListCtx, makeScheduleListDeps } from './scheduleListHelpers.fixtures.js';

describe('#131 handleScheduleListClick 行為測試', () => {

  describe('rename 分支', () => {
    it('使用者修改名稱 → 呼叫 updateScheduleMetadata → state 更新', async () => {
      const ctx = makeScheduleListCtx();
      const deps = makeScheduleListDeps();
      deps.modals.showScheduleEditor.mockResolvedValue({ name: '新名稱', isDraft: false });

      await renameSchedule('schedule_1', ctx, deps);

      expect(deps.ServerApi.call).toHaveBeenCalledWith('updateScheduleMetadata', expect.objectContaining({
        id: 'schedule_1',
        newName: '新名稱',
      }));
      expect(ctx.schedules.schedule_1.name).toBe('新名稱');
      expect(deps.ui.renderScheduleList).toHaveBeenCalled();
      expect(deps.ui.updateScheduleSelect).toHaveBeenCalled();
    });

    it('使用者修改 isDraft → state.isDraft 更新', async () => {
      const ctx = makeScheduleListCtx();
      const deps = makeScheduleListDeps();
      deps.modals.showScheduleEditor.mockResolvedValue({ name: '測試課表一', isDraft: true });

      await renameSchedule('schedule_1', ctx, deps);

      expect(ctx.schedules.schedule_1.isDraft).toBe(true);
    });

    it('使用者取消 modal → 不呼叫 API、不更新 state', async () => {
      const ctx = makeScheduleListCtx();
      const deps = makeScheduleListDeps();
      deps.modals.showScheduleEditor.mockResolvedValue(null);

      await renameSchedule('schedule_1', ctx, deps);

      expect(deps.ServerApi.call).not.toHaveBeenCalled();
      expect(ctx.schedules.schedule_1.name).toBe('測試課表一');
    });

    it('名稱和 isDraft 都沒改 → 不呼叫 API', async () => {
      const ctx = makeScheduleListCtx();
      const deps = makeScheduleListDeps();
      deps.modals.showScheduleEditor.mockResolvedValue({ name: '測試課表一', isDraft: false });

      await renameSchedule('schedule_1', ctx, deps);

      expect(deps.ServerApi.call).not.toHaveBeenCalled();
    });

    it('API error → showNotification error、state 不變', async () => {
      const ctx = makeScheduleListCtx();
      const deps = makeScheduleListDeps();
      deps.modals.showScheduleEditor.mockResolvedValue({ name: '新名稱', isDraft: false });
      deps.ServerApi.call.mockRejectedValueOnce(new Error('Server error'));

      const originalName = ctx.schedules.schedule_1.name;
      await renameSchedule('schedule_1', ctx, deps);

      expect(deps.showNotification).toHaveBeenCalledWith(expect.stringContaining('失敗'), 'error');
      // Note: state may have been partially updated before error - verify actual behavior
    });

    it('不存在的 scheduleId → 直接 return、不觸發任何操作', async () => {
      const ctx = makeScheduleListCtx();
      const deps = makeScheduleListDeps();

      await renameSchedule('nonexistent', ctx, deps);

      expect(deps.modals.showScheduleEditor).not.toHaveBeenCalled();
    });

    it('activeMetadataTimestamp 在 rename 後更新', async () => {
      const ctx = makeScheduleListCtx();
      const deps = makeScheduleListDeps();
      deps.modals.showScheduleEditor.mockResolvedValue({ name: '新名', isDraft: false });

      const oldTimestamp = ctx.activeMetadataTimestamp;
      await renameSchedule('schedule_1', ctx, deps);

      expect(ctx.activeMetadataTimestamp).not.toBe(oldTimestamp);
    });
  });

  describe('delete 分支', () => {
    it('確認刪除 → 呼叫 deleteSchedule → schedule 從 state 移除', async () => {
      const ctx = makeScheduleListCtx();
      const deps = makeScheduleListDeps();
      deps.modals.showConfirm.mockResolvedValue(true);

      await deleteSchedule('schedule_2', ctx, deps);

      expect(deps.ServerApi.call).toHaveBeenCalledWith('deleteSchedule', expect.objectContaining({
        id: 'schedule_2',
      }));
      expect(ctx.schedules).not.toHaveProperty('schedule_2');
      expect(deps.ui.renderScheduleList).toHaveBeenCalled();
    });

    it('取消確認 → 不呼叫 API、不刪除', async () => {
      const ctx = makeScheduleListCtx();
      const deps = makeScheduleListDeps();
      deps.modals.showConfirm.mockResolvedValue(false);

      await deleteSchedule('schedule_2', ctx, deps);

      expect(deps.ServerApi.call).not.toHaveBeenCalled();
      expect(ctx.schedules).toHaveProperty('schedule_2');
    });

    it('刪除 active schedule → 自動切換到第一個剩餘的 schedule', async () => {
      const ctx = makeScheduleListCtx({ activeScheduleId: 'schedule_1' });
      const deps = makeScheduleListDeps();
      deps.modals.showConfirm.mockResolvedValue(true);

      await deleteSchedule('schedule_1', ctx, deps);

      expect(deps.loadSchedule).toHaveBeenCalledWith('schedule_2');
    });

    it('刪除非 active schedule → 不觸發 loadSchedule', async () => {
      const ctx = makeScheduleListCtx({ activeScheduleId: 'schedule_1' });
      const deps = makeScheduleListDeps();
      deps.modals.showConfirm.mockResolvedValue(true);

      await deleteSchedule('schedule_2', ctx, deps);

      expect(deps.loadSchedule).not.toHaveBeenCalled();
    });

    it('API error → showNotification error', async () => {
      const ctx = makeScheduleListCtx();
      const deps = makeScheduleListDeps();
      deps.modals.showConfirm.mockResolvedValue(true);
      deps.ServerApi.call.mockRejectedValueOnce(new Error('Permission denied'));

      await deleteSchedule('schedule_1', ctx, deps);

      expect(deps.showNotification).toHaveBeenCalledWith(expect.stringContaining('失敗'), 'error');
    });

    it('不存在的 scheduleId → 直接 return', async () => {
      const ctx = makeScheduleListCtx();
      const deps = makeScheduleListDeps();

      await deleteSchedule('nonexistent', ctx, deps);

      expect(deps.modals.showConfirm).not.toHaveBeenCalled();
    });
  });

  describe('copy 分支', () => {
    it('輸入新名稱 → 呼叫 copySchedule → 新 schedule 出現在 state', async () => {
      const ctx = makeScheduleListCtx();
      const deps = makeScheduleListDeps();
      deps.modals.showPrompt.mockResolvedValue('複製的課表');

      await copySchedule('schedule_1', ctx, deps);

      expect(deps.ServerApi.call).toHaveBeenCalledWith('copySchedule', expect.objectContaining({
        sourceId: 'schedule_1',
        newName: '複製的課表',
      }));
      // A new schedule should exist (key returned by server)
      const keys = Object.keys(ctx.schedules);
      expect(keys.length).toBe(3); // original 2 + 1 new
      expect(deps.ui.renderScheduleList).toHaveBeenCalled();
    });

    it('新 schedule 的 data 是 source 的 deep clone（修改不互相影響）', async () => {
      const ctx = makeScheduleListCtx();
      const deps = makeScheduleListDeps();
      deps.modals.showPrompt.mockResolvedValue('副本');

      await copySchedule('schedule_1', ctx, deps);

      const newScheduleId = Object.keys(ctx.schedules).find(k => k !== 'schedule_1' && k !== 'schedule_2');
      const newSchedule = ctx.schedules[newScheduleId];

      // Deep clone: mutating copy should not affect original
      newSchedule.data.classrooms.push('999');
      expect(ctx.schedules.schedule_1.data.classrooms).not.toContain('999');
    });

    it('取消 prompt → 不呼叫 API', async () => {
      const ctx = makeScheduleListCtx();
      const deps = makeScheduleListDeps();
      deps.modals.showPrompt.mockResolvedValue(null);

      await copySchedule('schedule_1', ctx, deps);

      expect(deps.ServerApi.call).not.toHaveBeenCalled();
    });

    it('API error → showNotification error、不新增 schedule', async () => {
      const ctx = makeScheduleListCtx();
      const deps = makeScheduleListDeps();
      deps.modals.showPrompt.mockResolvedValue('副本');
      deps.ServerApi.call.mockRejectedValueOnce(new Error('Quota exceeded'));

      await copySchedule('schedule_1', ctx, deps);

      expect(deps.showNotification).toHaveBeenCalledWith(expect.stringContaining('失敗'), 'error');
      expect(Object.keys(ctx.schedules).length).toBe(2); // unchanged
    });

    it('不存在的 scheduleId → 直接 return', async () => {
      const ctx = makeScheduleListCtx();
      const deps = makeScheduleListDeps();

      await copySchedule('nonexistent', ctx, deps);

      expect(deps.modals.showPrompt).not.toHaveBeenCalled();
    });

    it('activeMetadataTimestamp 在 copy 後更新', async () => {
      const ctx = makeScheduleListCtx();
      const deps = makeScheduleListDeps();
      deps.modals.showPrompt.mockResolvedValue('副本');

      const oldTimestamp = ctx.activeMetadataTimestamp;
      await copySchedule('schedule_1', ctx, deps);

      expect(ctx.activeMetadataTimestamp).not.toBe(oldTimestamp);
    });

    it('新 schedule 的 scheduleLastModified 被正確設定', async () => {
      const ctx = makeScheduleListCtx();
      const deps = makeScheduleListDeps();
      deps.modals.showPrompt.mockResolvedValue('副本');

      await copySchedule('schedule_1', ctx, deps);

      const newScheduleId = Object.keys(ctx.schedules).find(k => k !== 'schedule_1' && k !== 'schedule_2');
      expect(ctx.scheduleLastModified[newScheduleId]).toBeDefined();
    });
  });

  describe('loading state lifecycle（全分支共通）', () => {
    it('rename: showLoading → [API] → hideLoading（即使 error）', async () => {
      const ctx = makeScheduleListCtx();
      const deps = makeScheduleListDeps();
      deps.modals.showScheduleEditor.mockResolvedValue({ name: '新', isDraft: false });
      deps.ServerApi.call.mockRejectedValueOnce(new Error('fail'));

      await renameSchedule('schedule_1', ctx, deps);

      expect(deps.showLoading).toHaveBeenCalled();
      expect(deps.hideLoading).toHaveBeenCalled();
    });

    it('delete: showLoading → [API] → hideLoading（即使 error）', async () => {
      const ctx = makeScheduleListCtx();
      const deps = makeScheduleListDeps();
      deps.modals.showConfirm.mockResolvedValue(true);
      deps.ServerApi.call.mockRejectedValueOnce(new Error('fail'));

      await deleteSchedule('schedule_1', ctx, deps);

      expect(deps.showLoading).toHaveBeenCalled();
      expect(deps.hideLoading).toHaveBeenCalled();
    });

    it('copy: showLoading → [API] → hideLoading（即使 error）', async () => {
      const ctx = makeScheduleListCtx();
      const deps = makeScheduleListDeps();
      deps.modals.showPrompt.mockResolvedValue('副本');
      deps.ServerApi.call.mockRejectedValueOnce(new Error('fail'));

      await copySchedule('schedule_1', ctx, deps);

      expect(deps.showLoading).toHaveBeenCalled();
      expect(deps.hideLoading).toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail (helpers not yet committed)**

Run: `npx vitest run tests/unit/scheduleListHelpers.test.js`
Expected: FAIL (imports should resolve since helpers created in Task 2)

- [ ] **Step 3: Fix any signature mismatches after reading actual source**

Compare extracted helpers against `JavaScript.html:L259-357` line by line. Adjust:
- Property names (ctx fields)
- Method signatures
- Return value handling
- Loading text strings

- [ ] **Step 4: Run full test suite to verify green**

Run: `npx vitest run`
Expected: All 905+ existing tests PASS + new tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/scheduleListHelpers.test.js
git commit -m "test: add handleScheduleListClick behavioral tests for rename/delete/copy (#131)

7 rename tests, 6 delete tests, 7 copy tests, 3 loading lifecycle tests
= 23 new behavioral test cases

Closes #131
Co-authored-by: Gemini <noreply@google.com>"
```

---

## Task 4: 全面驗證 + PR

- [ ] **Step 1: Run full workflow.sh t6**

Run: `./workflow.sh t6`
Expected: t1-t5 + t7 + t8 + t9 all PASS.

- [ ] **Step 2: Verify coverage**

Run: `npx vitest run --coverage`
Expected: Coverage thresholds (55% lines, 75% functions, 65% branches, 55% statements) all met.

- [ ] **Step 3: Create PR**

```bash
git push origin HEAD
gh pr create --base main --title "test: Phase 0 Wave 1 — save/load round-trip + handleScheduleListClick behavioral tests (#130, #131)" \
  --body "## Summary

Phase 0 Wave 1 behavioral tests for refactor readiness (#129).

### #130 — saveDataToServer ↔ loadDataFromServer round-trip
- Round-trip data integrity (save → load → verify)
- Payload format verification
- Timestamp lifecycle
- Error paths (conflict, API error, missing timestamp)
- isConnecting guard

### #131 — handleScheduleListClick 三分支行為測試
- Rename: modal → API → state update (7 tests)
- Delete: confirm → API → state cleanup + active switch (6 tests)
- Copy: prompt → API → deep clone + new entry (7 tests)
- Loading state lifecycle across all branches (3 tests)

**Scope correction**: Issue #131 described 4 branches but actual code has 3 (rename/delete/copy). 'Settings' is handled within the rename/schedule-editor modal.

### Test Infrastructure
- New DI extraction: \`tests/lib/scheduleListHelpers.js\`
- New fixtures: \`tests/unit/scheduleListHelpers.fixtures.js\`

Closes #130
Closes #131
refs #129"
```

---

## Per-Item Verification Steps

| Task | Verification | Command | Expected |
|------|-------------|---------|----------|
| T1 | Round-trip tests | `npx vitest run tests/unit/saveLoadRoundTrip.test.js` | All ~9 tests PASS |
| T2 | Helpers importable | `node -e "require('./tests/lib/scheduleListHelpers.js')"` | No error |
| T3 | Branch tests | `npx vitest run tests/unit/scheduleListHelpers.test.js` | All ~23 tests PASS |
| T4 | Full suite | `npx vitest run` | 905+ tests + new tests all PASS |
| T4 | Coverage | `npx vitest run --coverage` | Thresholds met |
| T4 | workflow.sh | `./workflow.sh t6` | All checks PASS |
