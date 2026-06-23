/**
 * #130 — saveDataToServer ↔ loadDataFromServer round-trip 行為測試
 * 驗資料完整性：save 出去的 payload → backend 回應 → load 回來的 state = 原始 state
 *
 * Uses existing extracted helpers:
 * - saveDataToServer (tests/lib/stateHelpers.js:L220-265)
 * - processServerLoadResult (tests/lib/appLifecycleHelpers.js:L250-270)
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

  // save context — matches actual saveDataToServer(ctx, ServerApi) DI signature
  // ctx needs: isConnecting, activeScheduleId, scheduleLastModified, classrooms,
  //            scheduleData, tags, lastSyncTime, ui.manageLoadingState,
  //            historyModule.{updateCleanSnapshot, checkDirty}, modals.showConfirm
  const saveCtx = {
    isConnecting: false,
    activeScheduleId: scheduleId,
    scheduleLastModified: { [scheduleId]: originalTimestamp },
    classrooms: data.classrooms,
    scheduleData: data.scheduleData,
    tags: data.tags,
    lastSyncTime: null,
    ui: {
      manageLoadingState: vi.fn(),
    },
    historyModule: {
      updateCleanSnapshot: vi.fn(),
      checkDirty: vi.fn(),
    },
    modals: { showConfirm: vi.fn() },
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

    it('load 後 lastModified 被抽取到 scheduleLastModified、不殘留在 schedule 物件內', async () => {
      const { saveCtx, mockServerApi } = makeRoundTripEnv();

      await saveDataToServer(saveCtx, mockServerApi);
      const loadResult = await mockServerApi.call('getData');
      const processed = processServerLoadResult(loadResult);

      const loadedSchedule = Object.values(processed.schedules)[0];
      // lastModified should be extracted into scheduleLastModified map, not in schedule
      expect(loadedSchedule).not.toHaveProperty('lastModified');
      expect(Object.keys(processed.scheduleLastModified).length).toBeGreaterThan(0);
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
    it('timestamp 衝突（conflict）→ saveDataToServer 不更新 timestamp、呼叫 modals.showConfirm', async () => {
      const { saveCtx, mockServerApi, scheduleId, originalTimestamp } = makeRoundTripEnv();

      // Override to return conflict
      mockServerApi.call.mockResolvedValueOnce({ conflict: true, error: '版本衝突' });

      await saveDataToServer(saveCtx, mockServerApi);

      // Timestamp should NOT have changed (conflict = no save)
      expect(saveCtx.scheduleLastModified[scheduleId]).toBe(originalTimestamp);
      // Conflict calls modals.showConfirm with the error message
      expect(saveCtx.modals.showConfirm).toHaveBeenCalledWith('版本衝突', true);
    });

    it('API error → state 保持不變', async () => {
      const { saveCtx, mockServerApi, scheduleId, originalTimestamp } = makeRoundTripEnv();

      mockServerApi.call.mockRejectedValueOnce(new Error('Network error'));

      await saveDataToServer(saveCtx, mockServerApi);

      // State should be unchanged
      expect(saveCtx.scheduleLastModified[scheduleId]).toBe(originalTimestamp);
    });

    it('missing timestamp → 報錯（manageLoadingState end + error message）', async () => {
      const { saveCtx, mockServerApi } = makeRoundTripEnv();
      saveCtx.scheduleLastModified = {}; // no timestamp

      await saveDataToServer(saveCtx, mockServerApi);

      // Should have shown error via manageLoadingState (not thrown to caller)
      expect(saveCtx.ui.manageLoadingState).toHaveBeenCalledWith('end', expect.objectContaining({
        success: false,
        message: expect.stringContaining('找不到當前課表的版本資訊'),
      }));
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
