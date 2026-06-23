/**
 * #131 — handleScheduleListClick 三分支行為測試
 * Tests extracted helpers from scheduleListHelpers.js
 * Covers: rename (7 tests), delete (6 tests), copy (7 tests), loading lifecycle (3 tests)
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

    it('API error → showNotification error', async () => {
      const ctx = makeScheduleListCtx();
      const deps = makeScheduleListDeps();
      deps.modals.showScheduleEditor.mockResolvedValue({ name: '新名稱', isDraft: false });
      deps.ServerApi.call.mockRejectedValueOnce(new Error('Server error'));

      await renameSchedule('schedule_1', ctx, deps);

      expect(deps.ui.showNotification).toHaveBeenCalledWith(expect.stringContaining('更新失敗'), 'error');
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

    it('刪除 active schedule → 設 activeScheduleId 為第一個剩餘 + 呼叫 loadSchedule', async () => {
      const ctx = makeScheduleListCtx({ activeScheduleId: 'schedule_1' });
      const deps = makeScheduleListDeps();
      deps.modals.showConfirm.mockResolvedValue(true);

      await deleteSchedule('schedule_1', ctx, deps);

      // Source: this.activeScheduleId = Object.keys(this.schedules)[0]
      // then: this.loadSchedule(this.activeScheduleId)
      expect(ctx.activeScheduleId).toBe('schedule_2');
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

      expect(deps.ui.showNotification).toHaveBeenCalledWith(expect.stringContaining('刪除失敗'), 'error');
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

    it('空白名稱（newName.trim() 為空）→ 不呼叫 API', async () => {
      const ctx = makeScheduleListCtx();
      const deps = makeScheduleListDeps();
      deps.modals.showPrompt.mockResolvedValue('   ');

      await copySchedule('schedule_1', ctx, deps);

      expect(deps.ServerApi.call).not.toHaveBeenCalled();
    });

    it('API error → showNotification error、不新增 schedule', async () => {
      const ctx = makeScheduleListCtx();
      const deps = makeScheduleListDeps();
      deps.modals.showPrompt.mockResolvedValue('副本');
      deps.ServerApi.call.mockRejectedValueOnce(new Error('Quota exceeded'));

      await copySchedule('schedule_1', ctx, deps);

      expect(deps.ui.showNotification).toHaveBeenCalledWith(expect.stringContaining('複製失敗'), 'error');
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

      expect(deps.ui.showLoading).toHaveBeenCalled();
      expect(deps.ui.hideLoading).toHaveBeenCalled();
    });

    it('delete: showLoading → [API] → hideLoading（即使 error）', async () => {
      const ctx = makeScheduleListCtx();
      const deps = makeScheduleListDeps();
      deps.modals.showConfirm.mockResolvedValue(true);
      deps.ServerApi.call.mockRejectedValueOnce(new Error('fail'));

      await deleteSchedule('schedule_1', ctx, deps);

      expect(deps.ui.showLoading).toHaveBeenCalled();
      expect(deps.ui.hideLoading).toHaveBeenCalled();
    });

    it('copy: showLoading → [API] → hideLoading（即使 error）', async () => {
      const ctx = makeScheduleListCtx();
      const deps = makeScheduleListDeps();
      deps.modals.showPrompt.mockResolvedValue('副本');
      deps.ServerApi.call.mockRejectedValueOnce(new Error('fail'));

      await copySchedule('schedule_1', ctx, deps);

      expect(deps.ui.showLoading).toHaveBeenCalled();
      expect(deps.ui.hideLoading).toHaveBeenCalled();
    });
  });

  describe('backendResult.error check（F1 reviewer finding）', () => {
    it('rename: backendResult.error → throws → showNotification error', async () => {
      const ctx = makeScheduleListCtx();
      const deps = makeScheduleListDeps();
      deps.modals.showScheduleEditor.mockResolvedValue({ name: '新名稱', isDraft: false });
      deps.ServerApi.call.mockResolvedValueOnce({ error: '權限不足' });

      await renameSchedule('schedule_1', ctx, deps);

      expect(deps.ui.showNotification).toHaveBeenCalledWith(expect.stringContaining('權限不足'), 'error');
    });

    it('delete: result.error → throws → showNotification error', async () => {
      const ctx = makeScheduleListCtx();
      const deps = makeScheduleListDeps();
      deps.modals.showConfirm.mockResolvedValue(true);
      deps.ServerApi.call.mockResolvedValueOnce({ error: '課表被鎖定' });

      await deleteSchedule('schedule_1', ctx, deps);

      expect(deps.ui.showNotification).toHaveBeenCalledWith(expect.stringContaining('課表被鎖定'), 'error');
      // Schedule should NOT have been deleted since error occurred before state mutation
      expect(ctx.schedules).toHaveProperty('schedule_1');
    });

    it('copy: result.error → throws → showNotification error', async () => {
      const ctx = makeScheduleListCtx();
      const deps = makeScheduleListDeps();
      deps.modals.showPrompt.mockResolvedValue('副本');
      deps.ServerApi.call.mockResolvedValueOnce({ error: '超過配額' });

      await copySchedule('schedule_1', ctx, deps);

      expect(deps.ui.showNotification).toHaveBeenCalledWith(expect.stringContaining('超過配額'), 'error');
      expect(Object.keys(ctx.schedules).length).toBe(2); // unchanged
    });
  });
});
