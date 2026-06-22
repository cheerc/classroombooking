// Extracted integration chain logic for testing.
// Ref: #93 — Module factory contracts + cross-module integration chains.
//
// Strategy: Extract pure data flow patterns from cross-module call chains.
// These represent the data transformations that happen during edit → save,
// undo → restore, and schedule switch operations.

/**
 * Expected public method lists for each module factory.
 * These are the contracts that factories must fulfil — if a method is
 * renamed or removed, the contract test fails.
 *
 * Source:
 * - History.js.html: createHistoryModule
 * - Interaction.js.html: createInteractionModule
 * - UI.js.html: createUIModule
 * - Modals.js.html: createModalModule
 */
export const FACTORY_CONTRACTS = {
  history: [
    'saveState',
    'resetHistory',
    'undo',
    'redo',
    'loadState',
    'updateUndoRedoButtons',
    'updateCleanSnapshot',
    'checkDirty',
    'setDirty',
  ],

  interaction: [
    'addEventListeners',
    'handleGlobalKeydown',
    'handleClassroomManagerClick',
    'handleDocumentClick',
    'buildCourseFormHtml',
    'handleCourseFormSave',
    'createInlineNotesEditor',
    'createOrEditCourseForm',
    'handleEmptyCellDoubleClick',
    'handleEditFieldClick',
    'handleScheduleBodyClick',
    'handleDeleteClassClick',
    'handleAddItem',
    'handleAddClassroom',
    'handleItemDelete',
    // Internal state
    'clickTimer',
    'lastClickedId',
  ],

  ui: [
    'hideActiveTooltip',
    'showLoading',
    'hideLoading',
    'showNotification',
    'initializeTooltips',
    'manageLoadingState',
    'updateHeaderUIState',
    'updateSyncStatus',
    'updateScheduleSelect',
    'renderScheduleList',
    'renderManagerList',
    'updateClearFilterButtonVisibility',
    'updateClearAllFiltersButtonVisibility',
    'updateAdvancedFilterButtonState',
    'renderList',
    'updateClassroomList',
    'initializeTagFilter',
    'createClassElement',
    'toggleSelection',
    'clearAllSelections',
    'setViewMode',
    'setViewSortMode',
    'changeDay',
    'updateViewControls',
    'renderScheduleTable',
    'renderAllSchedulesView',
    'addUpcomingClassIndicators',
    'renderDayViewByTime',
    'renderByTeacher',
    'renderByClassroom',
    'setupDragAndDrop',
  ],

  modals: [
    'setupModalListeners',
    'showConfirm',
    'showPrompt',
    'showAlert',
    'showScheduleEditor',
    'showPdfOptions',
    'populateFilterModal',
    'showCopyCourseModal',
  ],
};

/**
 * Simulate the edit chain data flow.
 *
 * Ref: #93 — Edit chain: user edit → form data → state update → dirty flag
 *
 * The edit chain captures what happens when a user saves a course form:
 * 1. Form data is extracted (name, time, teacher, tags)
 * 2. scheduleData is mutated (add or update course item)
 * 3. isDirty flag is set
 * 4. History state is saved
 *
 * @param {object} appState - { scheduleData, classrooms, isDirty }
 * @param {object} courseData - { classroom, day, item }
 * @param {object} options - { isNew }
 * @returns {{ scheduleData: object, isDirty: boolean, historySaved: boolean }}
 */
export function simulateEditChain(appState, courseData, options = {}) {
  const { classroom, day, item } = courseData;
  const data = appState.scheduleData;

  if (!data[classroom]) data[classroom] = {};
  if (!data[classroom][day]) data[classroom][day] = [];

  if (options.isNew) {
    // Add mode: insert at sorted position
    const daySchedule = data[classroom][day];
    daySchedule.push(item);
    // Sort by timeStart (simplified: string comparison works for HH:MM)
    daySchedule.sort((a, b) => a.timeStart.localeCompare(b.timeStart));
  } else {
    // Edit mode: find and update existing
    const daySchedule = data[classroom][day];
    const index = daySchedule.findIndex(c => c.id === item.id);
    if (index !== -1) {
      Object.assign(daySchedule[index], item);
    }
  }

  return {
    scheduleData: data,
    isDirty: true,
    historySaved: true,
  };
}

/**
 * Simulate the undo chain data flow.
 *
 * Ref: #93 — Undo chain: undo → restore previous state → update dirty flag
 *
 * @param {Array<object>} historyStack - Array of state snapshots
 * @param {number} currentIndex - Current position in history
 * @returns {{ newState: object|null, newIndex: number, isDirty: boolean }}
 */
export function simulateUndoChain(historyStack, currentIndex) {
  if (currentIndex <= 0) {
    return { newState: null, newIndex: currentIndex, isDirty: false };
  }

  const newIndex = currentIndex - 1;
  const newState = structuredClone(historyStack[newIndex]);

  return {
    newState,
    newIndex,
    isDirty: newIndex > 0, // dirty if not at initial state
  };
}

/**
 * Simulate the schedule switch chain data flow.
 *
 * Ref: #93 — Switch chain: select schedule → load data → reset history
 *
 * @param {object} schedules - { [id]: { data, name, ... } }
 * @param {string} targetId - Schedule ID to switch to
 * @param {string} currentId - Currently active schedule ID
 * @returns {{ success: boolean, activeScheduleId: string, scheduleData: object,
 *             classrooms: string[], tags: string[], historyReset: boolean, reason?: string }}
 */
export function simulateSwitchChain(schedules, targetId, currentId) {
  if (targetId === currentId) {
    return { success: true, activeScheduleId: currentId, historyReset: false, reason: 'same-schedule' };
  }

  const schedule = schedules[targetId];
  if (!schedule) {
    return { success: false, activeScheduleId: currentId, historyReset: false, reason: 'not-found' };
  }

  const data = schedule.data || {};
  return {
    success: true,
    activeScheduleId: targetId,
    scheduleData: structuredClone(data.scheduleData || {}),
    classrooms: structuredClone(data.classrooms || []),
    tags: structuredClone(data.tags || []),
    historyReset: true,
  };
}
