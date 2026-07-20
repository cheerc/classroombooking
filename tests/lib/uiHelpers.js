/**
 * ⚠️ mirror-only: 本檔為 UI 決策邏輯的平行實作。本檔綠不代表 production
 * (.html) 正確——.html 被 coverage 排除。production HTML 正確性由
 * TestCases.md 的 WT-1~WT-9 手動案例（provenance-bound 證據）gate。
 *
 * UI helpers — extracted pure decision/transform logic from UI.js.html.
 * Ref: #92 — Wave 3B UI rendering core
 *
 * These functions extract the data→decision mapping from DOM-heavy UI
 * methods, making the logic testable without a real DOM.
 */

/**
 * Determines which render function should be called based on app state.
 * Original: renderScheduleTable dispatch logic (UI.js.html L489-525)
 *
 * @param {Object} state
 * @param {string|null} state.activeScheduleId
 * @param {string} state.allSchedulesId - AppConfig.ALL_SCHEDULES_ID
 * @param {Array} state.activeFilters
 * @param {string} state.viewSortMode - 'classroom' | 'teacher' | 'time'
 * @param {string} state.currentViewMode - 'week' | 'day'
 * @param {string} state.dayMode - AppConfig.MODES.DAY value
 * @returns {{ renderer: string, shouldFilter: boolean }}
 */
export function resolveRenderTarget(state) {
  const {
    activeScheduleId,
    allSchedulesId,
    activeFilters = [],
    viewSortMode,
    currentViewMode,
    dayMode,
  } = state;

  if (activeScheduleId === allSchedulesId) {
    return { renderer: 'allSchedules', shouldFilter: false };
  }

  const shouldFilter = activeFilters && activeFilters.length > 0;

  if (viewSortMode === 'classroom') {
    return { renderer: 'classroom', shouldFilter };
  } else if (viewSortMode === 'teacher') {
    return { renderer: 'teacher', shouldFilter };
  } else if (currentViewMode === dayMode && viewSortMode === 'time') {
    return { renderer: 'time', shouldFilter };
  } else if (viewSortMode === 'time') {
    return { renderer: 'weekTime', shouldFilter };
  }

  // Fallback
  return { renderer: 'classroom', shouldFilter };
}

/**
 * View-scoped sort restore. Day always forces 'time' (day behavior unchanged);
 * only week reads the persisted sort with legal-value fallback.
 * Mirror of production restore in JavaScript.html:26-35.
 */
export function resolveRestoredSort({ currentViewMode, storedSort, dayMode, weekMode }) {
  if (currentViewMode === dayMode) return 'time';
  const legal = ['classroom', 'teacher', 'time'];
  return legal.includes(storedSort) ? storedSort : 'classroom';
}

/** Flatten { classroom → day → course[] } into tagged course records. */
export function flattenCoursesForDays(dataToRender, days) {
  const out = [];
  for (const classroom in dataToRender) {
    for (const day of days) {
      const list = dataToRender[classroom] && dataToRender[classroom][day];
      if (list) list.forEach(course => out.push({ ...course, classroom, day }));
    }
  }
  return out;
}

/** Group flat courses by timeStart, ascending by injected time converter. */
export function groupCoursesByStartTime(flatCourses, timeToMinutes) {
  const map = new Map();
  for (const course of flatCourses) {
    if (!map.has(course.timeStart)) map.set(course.timeStart, []);
    map.get(course.timeStart).push(course);
  }
  return [...map.entries()]
    .sort((a, b) => timeToMinutes(a[0]) - timeToMinutes(b[0]))
    .map(([timeStart, courses]) => ({ timeStart, courses }));
}

/** Bottom line of a course card in the week PDF. */
export function resolvePdfBottomText({ viewSortMode, teacher = '', classroom = '' }) {
  if (viewSortMode === 'teacher') return `(教室：${classroom})`;
  if (viewSortMode === 'time') return `${teacher} · ${classroom}`;
  return `(${teacher})`;
}

/** Diagonal header label; only week + time uses 時間. */
export function resolvePdfDiagonalLabel({ currentViewMode, viewSortMode, weekMode }) {
  if (currentViewMode === weekMode && viewSortMode === 'time') return '時間';
  return viewSortMode === 'teacher' ? '老師' : '教室';
}

/**
 * Computes the CSS classes, background color, and content flags for a class element.
 * Original: createClassElement data→props (UI.js.html L338-376)
 *
 * @param {Object} classItem - Course data object
 * @param {string} classroom
 * @param {number} day
 * @param {Object} [options]
 * @param {string|null} [options.overrideColor]
 * @param {string} [options.viewContext] - 'default' | 'teacherSort'
 * @param {Object} appState
 * @param {Set} appState.nextUpcomingClassIds
 * @param {Object} appState.courseColorMap
 * @param {string} appState.currentViewMode
 * @param {string} appState.dayMode - AppConfig.MODES.DAY value
 * @param {function} appState.checkTimeConflict - (classroom, day, classItem) => boolean
 * @returns {Object} Computed props for element creation
 */
export function computeClassElementProps(classItem, classroom, day, options = {}, appState = {}) {
  const { overrideColor = null, viewContext = 'default' } = options;
  const {
    nextUpcomingClassIds = new Set(),
    courseColorMap = {},
    currentViewMode = 'week',
    dayMode = 'day',
    checkTimeConflict = () => false,
  } = appState;

  const isUpcoming = nextUpcomingClassIds.has(classItem.id);
  const hasConflict = checkTimeConflict(classroom, day, classItem);
  const bgColor = overrideColor || courseColorMap[classItem.name] || '#E2E8F0';
  const viewModeClass = currentViewMode === dayMode ? 'day-view-layout' : '';
  const showNotes = currentViewMode === dayMode;
  const showTeacher = viewContext === 'default' || viewContext === 'timeSort';
  const showClassroom = viewContext === 'teacherSort' || viewContext === 'timeSort';

  const cssClasses = [
    'class-item',
    hasConflict ? 'conflict' : '',
    isUpcoming ? 'upcoming-highlight' : '',
    viewModeClass,
  ].filter(Boolean).join(' ');

  return {
    cssClasses,
    bgColor,
    isUpcoming,
    hasConflict,
    showNotes,
    showTeacher,
    showClassroom,
    tags: classItem.tags || [],
    dataAttributes: {
      id: classItem.id,
      name: classItem.name,
      classroom,
      day,
    },
  };
}

/**
 * Determines the actions to take for a loading state transition.
 * Original: manageLoadingState state machine (UI.js.html L77-98)
 *
 * @param {string} state - 'start' | 'end'
 * @param {Object} [options]
 * @param {boolean} [options.success]
 * @param {string} [options.message]
 * @param {boolean} [options.isConflict]
 * @returns {Object} Actions to perform
 */
export function resolveLoadingActions(state, options = {}) {
  const { success = true, message = '', isConflict = false } = options;

  if (state === 'start') {
    return {
      showLoading: true,
      loadingMessage: message,
      syncStatus: 'syncing',
      buttonsDisabled: true,
      notification: null,
    };
  }

  if (state === 'end') {
    const result = {
      showLoading: false,
      loadingMessage: null,
      buttonsDisabled: false,
      syncStatus: null,
      notification: null,
    };

    if (success) {
      result.syncStatus = 'synced';
      result.notification = { message, type: 'success' };
    } else if (isConflict) {
      result.syncStatus = 'conflict';
    } else {
      result.syncStatus = 'error';
      result.notification = { message, type: 'error' };
    }

    return result;
  }

  // Unknown state — no actions
  return {
    showLoading: false,
    loadingMessage: null,
    syncStatus: null,
    buttonsDisabled: false,
    notification: null,
  };
}

/**
 * Determines header UI state based on schedule mode and read-only status.
 * Original: updateHeaderUIState (UI.js.html L100-137)
 *
 * @param {Object} state
 * @param {string|null} state.activeScheduleId
 * @param {string} state.allSchedulesId - AppConfig.ALL_SCHEDULES_ID
 * @param {boolean} state.isReadOnly
 * @returns {Object} UI state decisions
 */
export function resolveHeaderState(state) {
  const { activeScheduleId, allSchedulesId, isReadOnly = false } = state;
  const isAllSchedulesMode = activeScheduleId === allSchedulesId;
  const shouldBeReadOnly = isAllSchedulesMode || isReadOnly;

  // Read-only banner: show only for lock-based read-only, NOT all-schedules
  const showReadOnlyBanner = isReadOnly && !isAllSchedulesMode;

  let syncStatusMode;
  let syncStatusText;
  let syncTooltip;

  if (isAllSchedulesMode) {
    syncStatusMode = 'readonly-mode';
    syncStatusText = '👀 唯讀總覽模式';
    syncTooltip = '合併顯示所有課表';
  } else if (isReadOnly) {
    syncStatusMode = 'readonly-mode';
    syncStatusText = '🔒 唯讀模式';
    syncTooltip = '此課表正在另一分頁編輯中';
  } else {
    syncStatusMode = 'check-dirty';
    syncStatusText = null;
    syncTooltip = null;
  }

  return {
    showReadOnlyBanner,
    buttonsDisabled: shouldBeReadOnly,
    syncStatusMode,
    syncStatusText,
    syncTooltip,
  };
}
