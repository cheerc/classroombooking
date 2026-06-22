/**
 * App lifecycle helpers — extracted pure logic from JavaScript.html's App object.
 * Ref: #116 — Wave 2B DI extraction for un-tested App methods
 *
 * These functions extract the testable decision logic from App methods that
 * are otherwise tightly coupled to DOM/GAS/localStorage. The production code
 * stays untouched; these are testing-only copies following the established
 * DI extraction pattern (see stateHelpers.js, utilityFunctions.js, etc.).
 */

/**
 * Determine which schedule to load on startup.
 * Extracted from App.loadInitialSchedules (JavaScript.html L146-167).
 *
 * @param {string|null} localActiveId - Value from localStorage('activeScheduleId')
 * @param {Object} schedules - Map of schedule objects { [id]: { name, data, ... } }
 * @returns {{ action: string, scheduleId?: string }}
 *   - { action: 'load', scheduleId } — load a known schedule
 *   - { action: 'firstTime' } — show first-time schedule selector
 *   - { action: 'empty' } — no schedules available
 */
export function resolveInitialSchedule(localActiveId, schedules) {
  const scheduleIds = Object.keys(schedules);
  if (localActiveId && schedules[localActiveId]) {
    return { action: 'load', scheduleId: localActiveId };
  }
  if (scheduleIds.length > 0) {
    return { action: 'firstTime' };
  }
  return { action: 'empty' };
}

/**
 * Determine the state changes when loading a schedule.
 * Extracted from App.loadSchedule (JavaScript.html L169-221).
 *
 * @param {string} scheduleId - The schedule to load
 * @param {Object} schedules - Map of schedule objects
 * @param {string} ALL_SCHEDULES_ID - Sentinel value for "all schedules" mode
 * @param {function} acquireLock - Lock acquisition function (returns boolean)
 * @returns {{ isReadOnly: boolean, classrooms: Array, scheduleData: Object, scheduleId: string, isAllSchedules: boolean, error?: string }}
 */
export function resolveScheduleLoad(scheduleId, schedules, ALL_SCHEDULES_ID, acquireLock) {
  if (scheduleId === ALL_SCHEDULES_ID) {
    return {
      scheduleId: ALL_SCHEDULES_ID,
      isReadOnly: true,
      isAllSchedules: true,
      classrooms: [],
      scheduleData: {},
    };
  }

  const hasLock = acquireLock(scheduleId);
  const schedule = schedules[scheduleId];

  if (!schedule) {
    const firstId = Object.keys(schedules)[0] || null;
    return {
      scheduleId: firstId,
      isReadOnly: true,
      isAllSchedules: false,
      classrooms: [],
      scheduleData: {},
      error: `找不到指定的課表 ID: ${scheduleId}`,
      fallbackId: firstId,
    };
  }

  const data = schedule.data || { classrooms: [], scheduleData: {}, tags: [] };
  const needsRepair = !schedule.data;

  return {
    scheduleId,
    isReadOnly: !hasLock,
    isAllSchedules: false,
    classrooms: data.classrooms || [],
    scheduleData: data.scheduleData || {},
    needsRepair,
  };
}

/**
 * Determine permission to manage current schedule settings.
 * Extracted from App.canManageCurrentScheduleSettings (JavaScript.html L867-879).
 *
 * @param {boolean} isAdmin - Whether current user is admin
 * @param {string} activeScheduleId - Currently active schedule ID
 * @param {string} ALL_SCHEDULES_ID - Sentinel for "all schedules" mode
 * @param {Object} schedules - Map of schedule objects
 * @param {string} currentUserEmail - Short email of current user
 * @param {function} getShortUserName - Function to extract short name from email
 * @returns {boolean}
 */
export function canManageSchedule(isAdmin, activeScheduleId, ALL_SCHEDULES_ID, schedules, currentUserEmail, getShortUserName) {
  if (isAdmin) return true;
  if (activeScheduleId === ALL_SCHEDULES_ID) return false;
  const schedule = schedules[activeScheduleId];
  if (!schedule || !schedule.createdBy) return false;
  return currentUserEmail === getShortUserName(schedule.createdBy);
}

/**
 * Validate and filter persisted tag filters against current available tags.
 * Extracted from App.loadAndApplyPersistedFilters (JavaScript.html L402-431).
 *
 * @param {string|null} persistedTagsJSON - Raw JSON string from localStorage
 * @param {string[]} allCurrentTags - Currently available tags
 * @returns {{ activeFilters: Array<{type: string, value: string}>, validTags: string[], needsPersistUpdate: boolean, parseError: boolean }}
 */
export function resolvePersistedFilters(persistedTagsJSON, allCurrentTags) {
  if (!persistedTagsJSON) {
    return { activeFilters: [], validTags: [], needsPersistUpdate: false, parseError: false };
  }

  try {
    const persistedTags = JSON.parse(persistedTagsJSON);
    const allCurrentSet = new Set(allCurrentTags);
    const validTags = persistedTags.filter(tag => allCurrentSet.has(tag));
    const activeFilters = validTags.map(tag => ({ type: 'tag', value: tag }));
    const needsPersistUpdate = persistedTags.length !== validTags.length;

    return { activeFilters, validTags, needsPersistUpdate, parseError: false };
  } catch {
    return { activeFilters: [], validTags: [], needsPersistUpdate: true, parseError: true };
  }
}

/**
 * Resolve the new filter state after applying filters from the filter modal.
 * Extracted from App.applyFilters (JavaScript.html L469-481).
 *
 * @param {Array<{type: string, value: string}>} currentFilters - Current active filters
 * @param {string} filterType - The type of filter being applied ('name', 'teacher', etc.)
 * @param {string[]} selectedItems - Items selected in the filter modal
 * @returns {Array<{type: string, value: string}>}
 */
export function resolveApplyFilters(currentFilters, filterType, selectedItems) {
  const tagFilters = currentFilters.filter(f => f.type === 'tag');
  const newAdvancedFilters = selectedItems.map(item => ({ type: filterType, value: item }));
  return [...tagFilters, ...newAdvancedFilters];
}

/**
 * Resolve the filter state after clearing advanced filters (keep tag filters only).
 * Extracted from App.clearAdvancedFilters (JavaScript.html L483-488).
 *
 * @param {Array<{type: string, value: string}>} currentFilters
 * @returns {Array<{type: string, value: string}>}
 */
export function resolveClearAdvancedFilters(currentFilters) {
  return currentFilters.filter(f => f.type === 'tag');
}

/**
 * Generate a unique ID (non-crypto, for UI elements).
 * Extracted from App.generateUniqueId (JavaScript.html L898-900).
 *
 * @param {function} [nowFn] - Optional function returning Date.now() (for testing)
 * @param {function} [randomFn] - Optional function returning Math.random() (for testing)
 * @returns {string}
 */
export function generateUniqueId(nowFn = Date.now, randomFn = Math.random) {
  return nowFn().toString(36) + randomFn().toString(36).substr(2, 9);
}

/**
 * Resolve the handleDrop data model changes.
 * Extracted from App.handleDrop (JavaScript.html L1067-1106).
 *
 * Note: The core data manipulation is already available as applyDrop in
 * interactionHelpers.js. This function covers the additional validation
 * and sorting that happens in the App-level handleDrop.
 *
 * @param {Object} scheduleData - The schedule data model
 * @param {Object} dropEvent - { fromClassroom, fromDay, toClassroom, toDay, classId, newIndex }
 * @param {function} timeToMinutesFn - Function to convert time string to minutes
 * @returns {{ scheduleData: Object, moved: boolean, error?: string }}
 */
export function resolveDropAction(scheduleData, dropEvent, timeToMinutesFn) {
  const { fromClassroom, fromDay, toClassroom, toDay, classId, newIndex } = dropEvent;

  // Same list = no-op (re-render only)
  if (fromClassroom === toClassroom && fromDay === toDay) {
    return { scheduleData, moved: false };
  }

  const fromDaySchedule = scheduleData[fromClassroom]?.[fromDay] || [];
  const itemIndex = fromDaySchedule.findIndex(c => c.id === classId);

  if (itemIndex === -1) {
    return { scheduleData, moved: false, error: 'Item not found in data model' };
  }

  // Clone to avoid mutation
  const newData = JSON.parse(JSON.stringify(scheduleData));
  const [movedItem] = (newData[fromClassroom]?.[fromDay] || []).splice(itemIndex, 1);

  if (!newData[toClassroom]) newData[toClassroom] = {};
  if (!newData[toClassroom][toDay]) newData[toClassroom][toDay] = [];

  newData[toClassroom][toDay].splice(newIndex, 0, movedItem);

  // Clean up empty day
  if (newData[fromClassroom]?.[fromDay]?.length === 0) {
    delete newData[fromClassroom][fromDay];
  }

  // Sort by start time
  newData[toClassroom][toDay].sort(
    (a, b) => timeToMinutesFn(a.timeStart) - timeToMinutesFn(b.timeStart)
  );

  return { scheduleData: newData, moved: true };
}

/**
 * Build the server-save payload.
 * Extracted from App.saveDataToServer (JavaScript.html L643-687) — payload construction only.
 *
 * @param {string} activeScheduleId - Current schedule ID
 * @param {Object} scheduleLastModified - Map of schedule ID to lastModified timestamp
 * @param {string[]} classrooms - Current classrooms
 * @param {Object} scheduleData - Current schedule data
 * @param {string[]} tags - Current tags
 * @returns {{ payload: Object } | { error: string }}
 */
export function buildSavePayload(activeScheduleId, scheduleLastModified, classrooms, scheduleData, tags) {
  const currentScheduleTimestamp = scheduleLastModified[activeScheduleId];
  if (!currentScheduleTimestamp) {
    return { error: '找不到當前課表的版本資訊，無法儲存。請嘗試重新載入。' };
  }

  return {
    payload: {
      scheduleId: activeScheduleId,
      lastModified: currentScheduleTimestamp,
      scheduleData: { classrooms, scheduleData, tags },
    },
  };
}

/**
 * Process server load result — extract schedules and lastModified timestamps.
 * Extracted from App.loadDataFromServer (JavaScript.html L604-641) — result processing.
 *
 * @param {Object} result - Server response from getData()
 * @returns {{ schedules: Object, scheduleLastModified: Object, metadataTimestamp: any } | { error: string }}
 */
export function processServerLoadResult(result) {
  if (!result || result.error) {
    return { error: result ? result.error : '從服務器獲取的數據為空' };
  }

  const schedules = result.schedules || {};
  const scheduleLastModified = {};

  for (const id in schedules) {
    if (schedules[id].lastModified) {
      scheduleLastModified[id] = schedules[id].lastModified;
      delete schedules[id].lastModified;
    }
  }

  return {
    schedules,
    scheduleLastModified,
    metadataTimestamp: result.metadataTimestamp,
  };
}

/**
 * Determine whether the lock heartbeat should fire.
 * Extracted from App.refreshLockHeartbeat (JavaScript.html L786-795).
 *
 * @param {boolean} isReadOnly
 * @param {string|null} activeScheduleId
 * @param {string} ALL_SCHEDULES_ID
 * @returns {boolean} Whether heartbeat should proceed
 */
export function shouldRefreshHeartbeat(isReadOnly, activeScheduleId, ALL_SCHEDULES_ID) {
  if (isReadOnly || !activeScheduleId || activeScheduleId === ALL_SCHEDULES_ID) {
    return false;
  }
  return true;
}
