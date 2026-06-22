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
