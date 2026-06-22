// Extracted interaction handler logic for testing.
// Ref: #86 — Frontend interaction handlers coverage.
// Source: JavaScript.html (handleDrop), Interaction.js.html (handleCourseFormSave propagation,
//         handleScheduleBodyClick decision logic, handleGlobalKeydown key→action mapping).
//
// Strategy: Extract pure data mutation / decision logic from DOM-coupled handlers.
// Tests verify data flow, not DOM side effects.

/**
 * Apply a drag-and-drop move on scheduleData (pure data mutation).
 *
 * Ref: JavaScript.html L1067-1106 — handleDrop
 *
 * @param {object} scheduleData - { [classroom]: { [day]: courseItem[] } }
 * @param {string} fromClassroom
 * @param {number} fromDay
 * @param {string} toClassroom
 * @param {number} toDay
 * @param {string} classId - ID of the course being moved
 * @param {number} newIndex - Insert position in target day array
 * @param {Function} timeToMinutesFn - Time comparator for sort
 * @returns {{ success: boolean, reason?: string }} Result of the operation
 */
export function applyDrop(scheduleData, fromClassroom, fromDay, toClassroom, toDay, classId, newIndex, timeToMinutesFn) {
  // Same-cell drop: no-op
  if (fromClassroom === toClassroom && fromDay === toDay) {
    return { success: true, reason: 'same-cell' };
  }

  const fromDaySchedule = scheduleData[fromClassroom]?.[fromDay] || [];
  const itemIndex = fromDaySchedule.findIndex(c => c.id === classId);

  if (itemIndex === -1) {
    return { success: false, reason: 'item-not-found' };
  }

  // Remove from source
  const [movedItem] = fromDaySchedule.splice(itemIndex, 1);

  // Ensure target exists
  if (!scheduleData[toClassroom]) scheduleData[toClassroom] = {};
  if (!scheduleData[toClassroom][toDay]) scheduleData[toClassroom][toDay] = [];

  // Insert at target position
  scheduleData[toClassroom][toDay].splice(newIndex, 0, movedItem);

  // Clean up empty source day
  if (scheduleData[fromClassroom]?.[fromDay]?.length === 0) {
    delete scheduleData[fromClassroom][fromDay];
  }

  // Sort by time
  scheduleData[toClassroom][toDay].sort(
    (a, b) => timeToMinutesFn(a.timeStart) - timeToMinutesFn(b.timeStart)
  );

  return { success: true, reason: 'moved' };
}

/**
 * Apply batch name rename across all occurrences in scheduleData.
 *
 * Ref: Interaction.js.html L239-242 — handleCourseFormSave name propagation
 *
 * @param {object} scheduleData - { [classroom]: { [day]: courseItem[] } }
 * @param {string} oldName - Original course name
 * @param {string} newName - New course name
 * @param {Array<{type: string, value: string}>} activeFilters - Active filter list (mutated in place)
 * @returns {number} Number of occurrences renamed
 */
export function applyNameRename(scheduleData, oldName, newName, activeFilters) {
  let count = 0;
  for (const classroom of Object.values(scheduleData)) {
    if (!classroom) continue;
    for (const daySchedule of Object.values(classroom)) {
      if (!Array.isArray(daySchedule)) continue;
      for (const item of daySchedule) {
        if (item.name === oldName) {
          item.name = newName;
          count++;
        }
      }
    }
  }

  // Also update active filter if present
  if (activeFilters) {
    const filterIndex = activeFilters.findIndex(f => f.type === 'name' && f.value === oldName);
    if (filterIndex > -1) {
      activeFilters[filterIndex].value = newName;
    }
  }

  return count;
}

/**
 * Apply batch teacher rename for all courses with matching name + teacher.
 *
 * Ref: Interaction.js.html L256-260 — handleCourseFormSave teacher propagation
 *
 * @param {object} scheduleData - { [classroom]: { [day]: courseItem[] } }
 * @param {string} courseName - Course name to match
 * @param {string} oldTeacher - Original teacher
 * @param {string} newTeacher - New teacher
 * @returns {number} Number of occurrences updated
 */
export function applyTeacherRename(scheduleData, courseName, oldTeacher, newTeacher) {
  let count = 0;
  for (const classroom of Object.values(scheduleData)) {
    if (!classroom) continue;
    for (const daySchedule of Object.values(classroom)) {
      if (!Array.isArray(daySchedule)) continue;
      for (const item of daySchedule) {
        if (item.name === courseName && item.teacher === oldTeacher) {
          item.teacher = newTeacher;
          count++;
        }
      }
    }
  }
  return count;
}

/**
 * Resolve what action a keyboard event should trigger.
 *
 * Ref: Interaction.js.html L112-137 — handleGlobalKeydown
 *
 * @param {object} keyEvent - { key, ctrlKey, metaKey, shiftKey }
 * @param {object} uiState - { confirmModalVisible, hasActiveInlineForm, openModalCount }
 * @returns {{ action: string, target?: string } | null}
 *   action: 'close-confirm' | 'close-inline-form' | 'close-modal' | 'undo' | 'redo' | null
 */
export function resolveKeyAction(keyEvent, uiState) {
  const { key, ctrlKey = false, metaKey = false, shiftKey = false } = keyEvent;

  if (key === 'Escape') {
    if (uiState.confirmModalVisible) {
      return { action: 'close-confirm' };
    }
    if (uiState.hasActiveInlineForm) {
      return { action: 'close-inline-form' };
    }
    if (uiState.openModalCount > 0) {
      return { action: 'close-modal' };
    }
    return null; // Escape with nothing to close
  }

  const mod = ctrlKey || metaKey;
  if (mod && key.toLowerCase() === 'z' && !shiftKey) {
    return { action: 'undo' };
  }
  if (mod && (key.toLowerCase() === 'y' || (key.toLowerCase() === 'z' && shiftKey))) {
    return { action: 'redo' };
  }

  return null;
}

/**
 * Resolve what action a schedule body click should trigger.
 *
 * Ref: Interaction.js.html L577-659 — handleScheduleBodyClick
 *
 * @param {object} clickState - { isReadOnly, isAllSchedulesView, hasActiveInlineForm }
 * @param {object} target - { isClassItem, isDeleteBtn, isEmptyCell, classId?, cellKey? }
 * @param {object} timerState - { clickTimer, lastClickedId }
 * @returns {{ action: string, newTimerState: object }}
 */
export function resolveClickAction(clickState, target, timerState) {
  // Read-only or all-schedules: only selection
  if (clickState.isReadOnly || clickState.isAllSchedulesView) {
    if (target.isClassItem) {
      return { action: 'toggle-selection', newTimerState: timerState };
    }
    return { action: 'clear-selections', newTimerState: timerState };
  }

  // Active inline form blocks all clicks
  if (clickState.hasActiveInlineForm) {
    return { action: 'blocked', newTimerState: timerState };
  }

  // Delete button click
  if (target.isDeleteBtn) {
    return { action: 'delete', newTimerState: timerState };
  }

  // Empty cell click
  if (!target.isClassItem && target.isEmptyCell) {
    const cellKey = target.cellKey;
    if (timerState.clickTimer && timerState.lastClickedId === cellKey) {
      // Double-click on empty cell
      return {
        action: 'double-click-empty-cell',
        newTimerState: { clickTimer: null, lastClickedId: null }
      };
    }
    // Single click on empty cell → start timer
    return {
      action: 'single-click-empty-cell',
      newTimerState: { clickTimer: 'pending', lastClickedId: cellKey }
    };
  }

  // Class item click
  if (target.isClassItem) {
    if (timerState.clickTimer && timerState.lastClickedId === target.classId) {
      // Double-click on class item
      return {
        action: 'double-click-class',
        newTimerState: { clickTimer: null, lastClickedId: null }
      };
    }
    // Single click → start timer for selection
    return {
      action: 'single-click-class',
      newTimerState: { clickTimer: 'pending', lastClickedId: target.classId }
    };
  }

  return { action: 'none', newTimerState: timerState };
}
