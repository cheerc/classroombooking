// Extracted state-dependent helper functions for testing.
// Ref: #151 — ping-pong TDD trial V2 (state-dependent functions).
// Source: JavaScript.html L1038-1065 (App object methods).
//
// These functions are extracted copies of App._forEachCourse,
// App.countOccurrences, and App.updateAllOccurrences.
// The originals depend on `this.scheduleData` and `this._forEachCourse`;
// the extracted versions accept scheduleData as an explicit parameter (DI).

/**
 * Iterate over every course in a scheduleData structure.
 *
 * scheduleData shape:
 *   { [classroom: string]: { [day: string]: Array<course> } }
 *
 * callback receives (course, classroom, day).
 *
 * @param {object|null|undefined} dataSource - The scheduleData object.
 * @param {Function} callback - Called for each course entry.
 */
export function forEachCourse(dataSource, callback) {
  if (!dataSource) return;
  for (const classroom in dataSource) {
    for (const day in dataSource[classroom]) {
      dataSource[classroom][day].forEach(course => {
        callback(course, classroom, day);
      });
    }
  }
}

/**
 * Count courses matching a predicate within scheduleData.
 *
 * Original: App.countOccurrences (depends on this._forEachCourse + this.scheduleData).
 * Extracted: accepts scheduleData as parameter, calls forEachCourse internally.
 *
 * @param {object} scheduleData - The scheduleData object.
 * @param {Function} predicate - Returns true for courses to count.
 * @returns {number} Count of matching courses.
 */
export function countOccurrences(scheduleData, predicate) {
  let count = 0;
  forEachCourse(scheduleData, course => {
    if (predicate(course)) {
      count++;
    }
  });
  return count;
}

/**
 * Update all courses matching a predicate within scheduleData (in-place mutation).
 *
 * Original: App.updateAllOccurrences (depends on this._forEachCourse + this.scheduleData).
 * Extracted: accepts scheduleData as parameter, calls forEachCourse internally.
 *
 * @param {object} scheduleData - The scheduleData object (mutated in place).
 * @param {Function} predicate - Returns true for courses to update.
 * @param {Function} updateFn - Called with each matching course to mutate it.
 */
export function updateAllOccurrences(scheduleData, predicate, updateFn) {
  forEachCourse(scheduleData, course => {
    if (predicate(course)) {
      updateFn(course);
    }
  });
}

/**
 * Handle renaming a classroom (state mutation + side-effect callbacks).
 *
 * Original: App.handleEditClassroom (JavaScript.html L118-144).
 * Dependencies (injected via `ctx`):
 *   - ctx.classrooms       — Array of classroom names (mutated in place)
 *   - ctx.scheduleData     — Object keyed by classroom name (mutated in place)
 *   - ctx.ui.showNotification(msg, type) — UI notification callback
 *   - ctx.ui.updateClassroomList()       — UI refresh callback
 *   - ctx.ui.renderScheduleTable()       — UI refresh callback
 *   - ctx.saveDataToLocal()              — Persistence callback
 *   - ctx.historyModule.saveState()      — History/undo callback
 *
 * Behavior:
 *   1. Empty newName → showNotification error + return (no state change)
 *   2. newName already in classrooms → showNotification error + return
 *   3. Normal: rename in classrooms array + scheduleData key rename +
 *      UI updates + save + history + success notification
 *
 * @param {string} oldName - Current classroom name.
 * @param {string} newName - Desired new classroom name.
 * @param {object} ctx - Dependency injection context (see above).
 */
export function handleEditClassroom(oldName, newName, ctx) {
  if (!newName) {
    ctx.ui.showNotification('教室名稱不能為空！', 'error');
    return;
  }
  if (ctx.classrooms.includes(newName)) {
    ctx.ui.showNotification(`教室名稱 "${newName}" 已存在！`, 'error');
    return;
  }

  const index = ctx.classrooms.indexOf(oldName);
  if (index > -1) {
    ctx.classrooms[index] = newName;
  }

  // Rename the key in the scheduleData object
  if (ctx.scheduleData[oldName]) {
    ctx.scheduleData[newName] = ctx.scheduleData[oldName];
    delete ctx.scheduleData[oldName];
  }

  ctx.ui.updateClassroomList();
  ctx.ui.renderScheduleTable();
  ctx.saveDataToLocal();
  ctx.historyModule.saveState();
  ctx.ui.showNotification(`教室名稱已從 "${oldName}" 更新為 "${newName}"`);
}

/**
 * Find next upcoming classes and update the nextUpcomingClassIds set.
 *
 * Original: App.findNextUpcomingClasses (JavaScript.html L690-738).
 * Dependencies (injected via `ctx`):
 *   - ctx.nextUpcomingClassIds — Set (mutated: cleared then populated)
 *   - ctx.currentViewMode      — string ('day' | 'week')
 *   - ctx.currentDayIndex      — number (0=Mon … 6=Sun)
 *   - ctx.scheduleData         — { [classroom]: { [day]: course[] } }
 *   - ctx.timeToMinutes(str)   — converts 'HH:MM' to minutes-since-midnight
 *
 * @param {object} ctx - DI context (see above).
 * @param {object} AppConfig - Must have AppConfig.MODES.DAY.
 * @param {Date}   [now=new Date()] - Injectable clock for testing.
 *
 * Behavior:
 *   1. Always clears nextUpcomingClassIds first.
 *   2. Non-DAY mode OR not viewing today → return (clear only).
 *   3. Collect future courses (startTime >= nowInMinutes).
 *   4. Rule 1: courses within 30min threshold → add to set.
 *   5. Rule 2: if none within threshold, find the nearest next start time → add to set.
 */
export function findNextUpcomingClasses(ctx, AppConfig, now) {
  ctx.nextUpcomingClassIds.clear();

  const today = now || new Date();
  const todayIndex = (today.getDay() === 0) ? 6 : today.getDay() - 1;

  // Only active in DAY mode viewing today
  if (ctx.currentViewMode !== AppConfig.MODES.DAY || ctx.currentDayIndex !== todayIndex) {
    return;
  }

  const nowInMinutes = today.getHours() * 60 + today.getMinutes();
  const thresholdInMinutes = 30;
  let futureClasses = [];

  // Find all classes in the future for today
  for (const classroom in ctx.scheduleData) {
    if (ctx.scheduleData[classroom]?.[todayIndex]) {
      ctx.scheduleData[classroom][todayIndex].forEach(course => {
        const startTimeInMinutes = ctx.timeToMinutes(course.timeStart);
        if (startTimeInMinutes >= nowInMinutes) {
          futureClasses.push(course);
        }
      });
    }
  }

  if (futureClasses.length > 0) {
    // Rule 1: Prioritize classes within the 30-minute threshold
    const withinThresholdClasses = futureClasses.filter(course => {
      const startTimeInMinutes = ctx.timeToMinutes(course.timeStart);
      const timeDifference = startTimeInMinutes - nowInMinutes;
      return timeDifference >= 0 && timeDifference <= thresholdInMinutes;
    });

    if (withinThresholdClasses.length > 0) {
      withinThresholdClasses.forEach(course => ctx.nextUpcomingClassIds.add(course.id));
    } else {
      // Rule 2: If none in threshold, find the very next one(s)
      const nextStartTime = Math.min(...futureClasses.map(c => ctx.timeToMinutes(c.timeStart)));
      futureClasses.forEach(course => {
        if (ctx.timeToMinutes(course.timeStart) === nextStartTime) {
          ctx.nextUpcomingClassIds.add(course.id);
        }
      });
    }
  }
}

/**
 * Save data to the server (async, with conflict detection).
 *
 * Original: App.saveDataToServer (JavaScript.html L643-688).
 * Dependencies (injected via `ctx`):
 *   - ctx.isConnecting              — boolean guard (mutated)
 *   - ctx.activeScheduleId          — string
 *   - ctx.scheduleLastModified[id]  — timestamp per schedule (read + written)
 *   - ctx.classrooms                — string[]
 *   - ctx.scheduleData              — object
 *   - ctx.tags                      — string[]
 *   - ctx.lastSyncTime              — Date (written on success)
 *   - ctx.ui.manageLoadingState(action, opts) — loading UI callback
 *   - ctx.historyModule.updateCleanSnapshot() — history callback
 *   - ctx.historyModule.checkDirty()          — history callback
 *   - ctx.modals.showConfirm(msg, flag)       — conflict UI
 *
 * @param {object} ctx - DI context (see above).
 * @param {object} ServerApi - Must have ServerApi.call(method, data) → Promise.
 *
 * Behavior:
 *   1. isConnecting guard → return immediately.
 *   2. Missing timestamp → throw (loadingState end with error message).
 *   3. success: update lastSyncTime + scheduleLastModified + history + loadingState(end, success).
 *   4. conflict: showConfirm + loadingState(end, isConflict).
 *   5. error/throw: loadingState(end, error message).
 *   6. finally: isConnecting = false.
 */
export async function saveDataToServer(ctx, ServerApi) {
  if (ctx.isConnecting) return;
  ctx.isConnecting = true;
  ctx.ui.manageLoadingState('start', { message: '正在檢查版本並儲存至雲端...' });

  try {
    const currentScheduleTimestamp = ctx.scheduleLastModified[ctx.activeScheduleId];
    if (!currentScheduleTimestamp) {
      throw new Error("找不到當前課表的版本資訊，無法儲存。請嘗試重新載入。");
    }

    const dataToSend = {
      scheduleId: ctx.activeScheduleId,
      lastModified: currentScheduleTimestamp,
      scheduleData: {
        classrooms: ctx.classrooms,
        scheduleData: ctx.scheduleData,
        tags: ctx.tags
      }
    };

    const saveResult = await ServerApi.call('saveData', dataToSend);

    // Handle conflict error
    if (saveResult && saveResult.conflict) {
      ctx.modals.showConfirm(saveResult.error, true);
      ctx.ui.manageLoadingState('end', { success: false, isConflict: true });
      return;
    }

    if (!saveResult || !saveResult.success) {
      throw new Error(saveResult?.error || '儲存時發生未知錯誤');
    }

    ctx.lastSyncTime = new Date();
    ctx.scheduleLastModified[ctx.activeScheduleId] = saveResult.lastModified;
    ctx.historyModule.updateCleanSnapshot();
    ctx.historyModule.checkDirty();
    ctx.ui.manageLoadingState('end', { success: true, message: '數據已成功儲存到雲端！' });

  } catch (error) {
    ctx.ui.manageLoadingState('end', { success: false, message: `數據儲存失敗: ${error.message}` });
  } finally {
    ctx.isConnecting = false;
  }
}
