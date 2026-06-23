/**
 * #131 — handleScheduleListClick DI extraction
 * Extracted from JavaScript.html L259-357 for testability.
 * 3 branches: rename, delete, copy
 *
 * Each function receives:
 * - scheduleId: string — the target schedule ID
 * - ctx: object — App state (schedules, scheduleLastModified, activeScheduleId, activeMetadataTimestamp)
 * - deps: object — injected dependencies (ServerApi, modals, ui, loadSchedule, etc.)
 *
 * DI pattern follows established convention from stateHelpers.js.
 * All UI functions go through deps (ui.showLoading, ui.hideLoading, ui.showNotification,
 * ui.renderScheduleList, ui.updateScheduleSelect) matching the source's this.ui.xxx pattern.
 */

/**
 * Rename branch — shows schedule editor modal, updates metadata on server.
 * Source: JavaScript.html L264-301
 *
 * @param {string} scheduleId - ID of schedule to rename
 * @param {object} ctx - App state { schedules, scheduleLastModified, activeMetadataTimestamp }
 * @param {object} deps - { ServerApi, modals, ui }
 *   - modals: { showScheduleEditor }
 *   - ui: { showLoading, hideLoading, showNotification, renderScheduleList, updateScheduleSelect }
 */
export async function renameSchedule(scheduleId, ctx, deps) {
  const { ServerApi, modals, ui } = deps;

  const oldSchedule = ctx.schedules[scheduleId];
  if (!oldSchedule) return;

  const result = await modals.showScheduleEditor({
    id: scheduleId,
    name: oldSchedule.name,
    isDraft: oldSchedule.isDraft || false,
  });

  if (!result) return; // user cancelled

  const hasChanged = result.name !== oldSchedule.name || result.isDraft !== oldSchedule.isDraft;
  if (!hasChanged) return; // no changes

  ui.showLoading('正在更新課表...');
  try {
    const backendResult = await ServerApi.call('updateScheduleMetadata', {
      id: scheduleId,
      newName: result.name,
      isDraft: result.isDraft,
      metadataTimestamp: ctx.activeMetadataTimestamp,
    });

    if (backendResult.error) { throw new Error(backendResult.error); }

    ctx.activeMetadataTimestamp = backendResult.newMetadataTimestamp;
    ctx.schedules[scheduleId].name = result.name;
    ctx.schedules[scheduleId].isDraft = result.isDraft;

    // CRITICAL FIX: Update the lastModified timestamp after a metadata change
    if (backendResult.lastModified) {
      ctx.scheduleLastModified[scheduleId] = backendResult.lastModified;
    }

    ui.renderScheduleList();
    ui.updateScheduleSelect();
    ui.showNotification('課表已更新');
  } catch (err) {
    ui.showNotification(`更新失敗: ${err.message}`, 'error');
  } finally {
    ui.hideLoading();
  }
}

/**
 * Delete branch — confirms, deletes schedule from server and state.
 * Source: JavaScript.html L304-326
 *
 * @param {string} scheduleId - ID of schedule to delete
 * @param {object} ctx - App state { schedules, activeScheduleId, activeMetadataTimestamp }
 * @param {object} deps - { ServerApi, modals, ui, loadSchedule }
 *   - modals: { showConfirm }
 *   - ui: { showLoading, hideLoading, showNotification, renderScheduleList, updateScheduleSelect }
 */
export async function deleteSchedule(scheduleId, ctx, deps) {
  const { ServerApi, modals, ui, loadSchedule } = deps;

  const schedule = ctx.schedules[scheduleId];
  if (!schedule) return;

  const confirmed = await modals.showConfirm(`確定要刪除課表 "${schedule.name}" 嗎？此操作無法復原。`);
  if (!confirmed) return;

  ui.showLoading('正在刪除課表...');
  try {
    const result = await ServerApi.call('deleteSchedule', {
      id: scheduleId,
      metadataTimestamp: ctx.activeMetadataTimestamp,
    });

    if (result.error) { throw new Error(result.error); }

    ctx.activeMetadataTimestamp = result.newMetadataTimestamp;
    delete ctx.schedules[scheduleId];

    // If deleting active schedule, switch to first available
    if (scheduleId === ctx.activeScheduleId) {
      ctx.activeScheduleId = Object.keys(ctx.schedules)[0];
      loadSchedule(ctx.activeScheduleId);
    }

    ui.renderScheduleList();
    ui.updateScheduleSelect();
    ui.showNotification('課表已刪除');
  } catch (err) {
    ui.showNotification(`刪除失敗: ${err.message}`, 'error');
  } finally {
    ui.hideLoading();
  }
}

/**
 * Copy branch — prompts for name, copies schedule on server.
 * Source: JavaScript.html L328-356
 *
 * @param {string} scheduleId - ID of schedule to copy
 * @param {object} ctx - App state { schedules, activeMetadataTimestamp, scheduleLastModified }
 * @param {object} deps - { ServerApi, modals, ui }
 *   - modals: { showPrompt }
 *   - ui: { showLoading, hideLoading, showNotification, renderScheduleList, updateScheduleSelect }
 */
export async function copySchedule(scheduleId, ctx, deps) {
  const { ServerApi, modals, ui } = deps;

  const sourceSchedule = ctx.schedules[scheduleId];
  if (!sourceSchedule) return;

  const newName = await modals.showPrompt('請為複製的課表命名：', `${sourceSchedule.name} (複製)`);
  // Source: if (newName && newName.trim()) — both null/empty check AND trim check
  if (!newName || !newName.trim()) return;

  ui.showLoading('正在複製課表，請稍候...');
  try {
    const result = await ServerApi.call('copySchedule', {
      sourceId: scheduleId,
      newName: newName.trim(),
      metadataTimestamp: ctx.activeMetadataTimestamp,
    });

    if (result.error) { throw new Error(result.error); }

    ctx.activeMetadataTimestamp = result.newMetadataTimestamp;
    const newId = result.newId;
    ctx.schedules[newId] = {
      name: newName.trim(),
      createdBy: result.createdBy,
      isDraft: result.isDraft,
      data: JSON.parse(JSON.stringify(sourceSchedule.data)),
    };

    // CRITICAL FIX: Set the lastModified timestamp for the new schedule
    ctx.scheduleLastModified[newId] = result.lastModified;

    ui.renderScheduleList();
    ui.updateScheduleSelect();
    ui.showNotification('課表複製成功！');
  } catch (err) {
    ui.showNotification(`複製失敗: ${err.message}`, 'error');
  } finally {
    ui.hideLoading();
  }
}
