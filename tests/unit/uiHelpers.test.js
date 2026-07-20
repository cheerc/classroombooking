/**
 * Tests for UI rendering core — pure decision/transform logic.
 * Ref: #92 — Wave 3B UI rendering core
 */
import {
  resolveRenderTarget,
  resolveRestoredSort,
  computeClassElementProps,
  resolveLoadingActions,
  resolveHeaderState,
  flattenCoursesForDays,
  groupCoursesByStartTime,
  resolvePdfBottomText,
  resolvePdfDiagonalLabel,
} from '../lib/uiHelpers.js';
import { timeToMinutes } from '../lib/frontendUtils.js';

// ============================================================
// resolveRenderTarget
// ============================================================
describe('resolveRenderTarget', () => {
  const ALL_ID = '__ALL__';
  const base = {
    activeScheduleId: 'schedule1',
    allSchedulesId: ALL_ID,
    activeFilters: [],
    viewSortMode: 'classroom',
    currentViewMode: 'week',
    dayMode: 'day',
  };

  it('routes to allSchedules when activeScheduleId matches allSchedulesId', () => {
    const result = resolveRenderTarget({ ...base, activeScheduleId: ALL_ID });
    expect(result).toEqual({ renderer: 'allSchedules', shouldFilter: false });
  });

  it('routes to classroom renderer by default', () => {
    const result = resolveRenderTarget(base);
    expect(result).toEqual({ renderer: 'classroom', shouldFilter: false });
  });

  it('routes to teacher renderer', () => {
    const result = resolveRenderTarget({ ...base, viewSortMode: 'teacher' });
    expect(result).toEqual({ renderer: 'teacher', shouldFilter: false });
  });

  it('routes to time renderer in day mode', () => {
    const result = resolveRenderTarget({
      ...base,
      viewSortMode: 'time',
      currentViewMode: 'day',
    });
    expect(result).toEqual({ renderer: 'time', shouldFilter: false });
  });

  it('routes week + time to the week-time renderer', () => {
    const result = resolveRenderTarget({
      ...base,
      viewSortMode: 'time',
      currentViewMode: 'week',
    });
    expect(result).toEqual({ renderer: 'weekTime', shouldFilter: false });
  });

  it('sets shouldFilter true when activeFilters non-empty', () => {
    const result = resolveRenderTarget({
      ...base,
      activeFilters: [{ type: 'tag', value: 'math' }],
    });
    expect(result.shouldFilter).toBe(true);
  });

  it('shouldFilter false for allSchedules even with filters', () => {
    const result = resolveRenderTarget({
      ...base,
      activeScheduleId: ALL_ID,
      activeFilters: [{ type: 'tag', value: 'math' }],
    });
    expect(result.shouldFilter).toBe(false);
  });

  it('falls back to classroom for unknown viewSortMode', () => {
    const result = resolveRenderTarget({ ...base, viewSortMode: 'unknown' });
    expect(result.renderer).toBe('classroom');
  });
});

// ============================================================
// resolveRestoredSort
// ============================================================
describe('resolveRestoredSort', () => {
  const base = { dayMode: 'day', weekMode: 'week' };

  it('week + stored time restores time (week+time persists)', () => {
    expect(resolveRestoredSort({ ...base, currentViewMode: 'week', storedSort: 'time' })).toBe('time');
  });

  it('day forces time regardless of stored teacher (day behavior unchanged)', () => {
    expect(resolveRestoredSort({ ...base, currentViewMode: 'day', storedSort: 'teacher' })).toBe('time');
  });

  it('week + illegal stored falls back to classroom', () => {
    expect(resolveRestoredSort({ ...base, currentViewMode: 'week', storedSort: 'bogus' })).toBe('classroom');
  });

  it('week + missing key (null) falls back to classroom (back-compat)', () => {
    expect(resolveRestoredSort({ ...base, currentViewMode: 'week', storedSort: null })).toBe('classroom');
  });
});

// ============================================================
// computeClassElementProps
// ============================================================
describe('computeClassElementProps', () => {
  const classItem = {
    id: 'c1',
    name: 'Math',
    teacher: 'Alice',
    timeStart: '09:00',
    timeEnd: '10:00',
    tags: ['core', 'math'],
    notes: 'Review chapter 3',
  };

  const defaultAppState = {
    nextUpcomingClassIds: new Set(),
    courseColorMap: {},
    currentViewMode: 'week',
    dayMode: 'day',
    checkTimeConflict: () => false,
  };

  it('returns default props for basic input', () => {
    const result = computeClassElementProps(classItem, 'Room A', 0, {}, defaultAppState);
    expect(result.bgColor).toBe('#E2E8F0');
    expect(result.isUpcoming).toBe(false);
    expect(result.hasConflict).toBe(false);
    expect(result.showNotes).toBe(false);
    expect(result.showTeacher).toBe(true);
    expect(result.showClassroom).toBe(false);
    expect(result.tags).toEqual(['core', 'math']);
    expect(result.dataAttributes).toEqual({
      id: 'c1', name: 'Math', classroom: 'Room A', day: 0,
    });
  });

  it('uses courseColorMap for background color', () => {
    const state = { ...defaultAppState, courseColorMap: { 'Math': '#FF5733' } };
    const result = computeClassElementProps(classItem, 'Room A', 0, {}, state);
    expect(result.bgColor).toBe('#FF5733');
  });

  it('overrideColor takes precedence over courseColorMap', () => {
    const state = { ...defaultAppState, courseColorMap: { 'Math': '#FF5733' } };
    const result = computeClassElementProps(classItem, 'Room A', 0, { overrideColor: '#00FF00' }, state);
    expect(result.bgColor).toBe('#00FF00');
  });

  it('marks upcoming class', () => {
    const state = { ...defaultAppState, nextUpcomingClassIds: new Set(['c1']) };
    const result = computeClassElementProps(classItem, 'Room A', 0, {}, state);
    expect(result.isUpcoming).toBe(true);
    expect(result.cssClasses).toContain('upcoming-highlight');
  });

  it('marks conflict', () => {
    const state = { ...defaultAppState, checkTimeConflict: () => true };
    const result = computeClassElementProps(classItem, 'Room A', 0, {}, state);
    expect(result.hasConflict).toBe(true);
    expect(result.cssClasses).toContain('conflict');
  });

  it('shows notes in day view', () => {
    const state = { ...defaultAppState, currentViewMode: 'day' };
    const result = computeClassElementProps(classItem, 'Room A', 0, {}, state);
    expect(result.showNotes).toBe(true);
    expect(result.cssClasses).toContain('day-view-layout');
  });

  it('shows classroom in teacher sort view context', () => {
    const result = computeClassElementProps(
      classItem, 'Room A', 0, { viewContext: 'teacherSort' }, defaultAppState
    );
    expect(result.showTeacher).toBe(false);
    expect(result.showClassroom).toBe(true);
  });

  it('shows both teacher and classroom in time sort view context', () => {
    const result = computeClassElementProps(
      classItem, 'Room A', 0, { viewContext: 'timeSort' }, defaultAppState
    );
    expect(result.showTeacher).toBe(true);
    expect(result.showClassroom).toBe(true);
  });

  it('handles course with no tags', () => {
    const item = { ...classItem, tags: undefined };
    const result = computeClassElementProps(item, 'Room A', 0, {}, defaultAppState);
    expect(result.tags).toEqual([]);
  });

  it('handles course with null tags', () => {
    const item = { ...classItem, tags: null };
    const result = computeClassElementProps(item, 'Room A', 0, {}, defaultAppState);
    expect(result.tags).toEqual([]);
  });

  it('includes both conflict and upcoming classes', () => {
    const state = {
      ...defaultAppState,
      nextUpcomingClassIds: new Set(['c1']),
      checkTimeConflict: () => true,
    };
    const result = computeClassElementProps(classItem, 'Room A', 0, {}, state);
    expect(result.cssClasses).toContain('conflict');
    expect(result.cssClasses).toContain('upcoming-highlight');
  });
});

// ============================================================
// flattenCoursesForDays / groupCoursesByStartTime
// ============================================================
describe('flattenCoursesForDays', () => {
  const data = {
    R1: { 0: [{ id: 'a', timeStart: '09:10' }], 6: [{ id: 'b', timeStart: '19:00' }] },
    R2: { 0: [{ id: 'c', timeStart: '09:10' }] },
  };

  it('flattens all 7 days, tagging classroom + day (7-day placement)', () => {
    const flat = flattenCoursesForDays(data, [0, 1, 2, 3, 4, 5, 6]);
    expect(flat).toHaveLength(3);
    expect(flat.find(c => c.id === 'b')).toMatchObject({ classroom: 'R1', day: 6 });
    expect(flat.find(c => c.id === 'a')).toMatchObject({ classroom: 'R1', day: 0 });
    expect(flat.find(c => c.id === 'c')).toMatchObject({ classroom: 'R2', day: 0 });
  });

  it('single-day slice returns only that day (day-view reuse)', () => {
    expect(flattenCoursesForDays(data, [0])).toHaveLength(2);
  });

  it('empty data yields empty flat', () => {
    expect(flattenCoursesForDays({}, [0, 1, 2, 3, 4, 5, 6])).toEqual([]);
  });

  it('filtered-to-empty containers yield empty flat', () => {
    const filtered = { R1: { 0: [], 3: [] }, R2: {} };
    expect(flattenCoursesForDays(filtered, [0, 1, 2, 3, 4, 5, 6])).toEqual([]);
  });
});

describe('groupCoursesByStartTime', () => {
  it('groups by timeStart, sorts ascending, keeps day for placement', () => {
    const flat = [
      { id: '1', timeStart: '13:30', classroom: 'R2', day: 1 },
      { id: '2', timeStart: '09:10', classroom: 'R1', day: 0 },
      { id: '3', timeStart: '09:10', classroom: 'R3', day: 2 },
    ];
    const groups = groupCoursesByStartTime(flat, timeToMinutes);
    expect(groups.map(x => x.timeStart)).toEqual(['09:10', '13:30']);
    expect(groups[0].courses.map(c => c.day).sort()).toEqual([0, 2]);
  });

  it('sorts irregular non-aligned start times correctly', () => {
    const flat = [
      { timeStart: '09:10', day: 0 }, { timeStart: '08:55', day: 0 }, { timeStart: '13:05', day: 0 },
    ];
    expect(groupCoursesByStartTime(flat, timeToMinutes).map(x => x.timeStart))
      .toEqual(['08:55', '09:10', '13:05']);
  });

  it('groups same start with different end times together', () => {
    const flat = [
      { timeStart: '09:10', timeEnd: '11:00', day: 0 },
      { timeStart: '09:10', timeEnd: '10:00', day: 0 },
    ];
    expect(groupCoursesByStartTime(flat, timeToMinutes)).toHaveLength(1);
  });

  it('returns empty groups for empty input', () => {
    expect(groupCoursesByStartTime([], timeToMinutes)).toEqual([]);
  });

  it('filtered-to-empty yields zero groups', () => {
    const filtered = { R1: { 0: [], 3: [] }, R2: {} };
    const flat = flattenCoursesForDays(filtered, [0, 1, 2, 3, 4, 5, 6]);
    expect(groupCoursesByStartTime(flat, timeToMinutes)).toEqual([]);
  });

  it('groups abnormal timeStart without throwing', () => {
    const flat = [
      { timeStart: '09:10', day: 0 },
      { timeStart: 'N/A', day: 1 },
    ];
    const groups = groupCoursesByStartTime(flat, timeToMinutes);
    expect(groups.map(x => x.timeStart)).toContain('N/A');
    expect(groups).toHaveLength(2);
  });
});

// ============================================================
// PDF view decisions
// ============================================================
describe('resolvePdfBottomText (week PDF card bottom line)', () => {
  const base = { teacher: '張老師', classroom: '301教室' };

  it('teacher sort prints classroom only', () => {
    expect(resolvePdfBottomText({ ...base, viewSortMode: 'teacher' })).toBe('(教室：301教室)');
  });

  it('time sort prints both teacher and classroom', () => {
    const output = resolvePdfBottomText({ ...base, viewSortMode: 'time' });
    expect(output).toContain('張老師');
    expect(output).toContain('301教室');
  });

  it('classroom sort prints teacher only', () => {
    expect(resolvePdfBottomText({ ...base, viewSortMode: 'classroom' })).toBe('(張老師)');
  });

  it('missing classroom does not crash time sort', () => {
    expect(() => resolvePdfBottomText({ teacher: '王', classroom: '', viewSortMode: 'time' })).not.toThrow();
  });
});

describe('resolvePdfDiagonalLabel (shared day/week hook)', () => {
  const base = { weekMode: 'week' };

  it('week + time uses 時間', () => {
    expect(resolvePdfDiagonalLabel({ ...base, currentViewMode: 'week', viewSortMode: 'time' })).toBe('時間');
  });

  it('day + time keeps 教室 for day-time PDF', () => {
    expect(resolvePdfDiagonalLabel({ ...base, currentViewMode: 'day', viewSortMode: 'time' })).toBe('教室');
  });

  it('teacher sort uses 老師 in both views', () => {
    expect(resolvePdfDiagonalLabel({ ...base, currentViewMode: 'week', viewSortMode: 'teacher' })).toBe('老師');
    expect(resolvePdfDiagonalLabel({ ...base, currentViewMode: 'day', viewSortMode: 'teacher' })).toBe('老師');
  });

  it('classroom sort uses 教室', () => {
    expect(resolvePdfDiagonalLabel({ ...base, currentViewMode: 'week', viewSortMode: 'classroom' })).toBe('教室');
  });
});

// ============================================================
// resolveLoadingActions
// ============================================================
describe('resolveLoadingActions', () => {
  describe('state: start', () => {
    it('shows loading and disables buttons', () => {
      const result = resolveLoadingActions('start', { message: 'Loading...' });
      expect(result.showLoading).toBe(true);
      expect(result.loadingMessage).toBe('Loading...');
      expect(result.syncStatus).toBe('syncing');
      expect(result.buttonsDisabled).toBe(true);
      expect(result.notification).toBeNull();
    });

    it('works with no options', () => {
      const result = resolveLoadingActions('start');
      expect(result.showLoading).toBe(true);
      expect(result.loadingMessage).toBe('');
    });
  });

  describe('state: end (success)', () => {
    it('hides loading with success notification', () => {
      const result = resolveLoadingActions('end', { success: true, message: 'Saved!' });
      expect(result.showLoading).toBe(false);
      expect(result.buttonsDisabled).toBe(false);
      expect(result.syncStatus).toBe('synced');
      expect(result.notification).toEqual({ message: 'Saved!', type: 'success' });
    });
  });

  describe('state: end (failure)', () => {
    it('shows error status and notification', () => {
      const result = resolveLoadingActions('end', { success: false, message: 'Network error' });
      expect(result.syncStatus).toBe('error');
      expect(result.notification).toEqual({ message: 'Network error', type: 'error' });
    });
  });

  describe('state: end (conflict)', () => {
    it('shows conflict status without notification', () => {
      const result = resolveLoadingActions('end', { success: false, isConflict: true });
      expect(result.syncStatus).toBe('conflict');
      expect(result.notification).toBeNull();
    });
  });

  describe('unknown state', () => {
    it('returns no-op for unknown state', () => {
      const result = resolveLoadingActions('unknown');
      expect(result.showLoading).toBe(false);
      expect(result.syncStatus).toBeNull();
      expect(result.buttonsDisabled).toBe(false);
    });
  });
});

// ============================================================
// resolveHeaderState
// ============================================================
describe('resolveHeaderState', () => {
  const ALL_ID = '__ALL__';

  it('normal mode — buttons enabled, no banner, check-dirty', () => {
    const result = resolveHeaderState({
      activeScheduleId: 'schedule1',
      allSchedulesId: ALL_ID,
      isReadOnly: false,
    });
    expect(result.buttonsDisabled).toBe(false);
    expect(result.showReadOnlyBanner).toBe(false);
    expect(result.syncStatusMode).toBe('check-dirty');
    expect(result.syncStatusText).toBeNull();
  });

  it('all-schedules mode — buttons disabled, no banner, readonly-mode', () => {
    const result = resolveHeaderState({
      activeScheduleId: ALL_ID,
      allSchedulesId: ALL_ID,
      isReadOnly: false,
    });
    expect(result.buttonsDisabled).toBe(true);
    expect(result.showReadOnlyBanner).toBe(false);
    expect(result.syncStatusMode).toBe('readonly-mode');
    expect(result.syncStatusText).toBe('👀 唯讀總覽模式');
    expect(result.syncTooltip).toBe('合併顯示所有課表');
  });

  it('lock-based read-only — buttons disabled, banner shown, readonly-mode', () => {
    const result = resolveHeaderState({
      activeScheduleId: 'schedule1',
      allSchedulesId: ALL_ID,
      isReadOnly: true,
    });
    expect(result.buttonsDisabled).toBe(true);
    expect(result.showReadOnlyBanner).toBe(true);
    expect(result.syncStatusMode).toBe('readonly-mode');
    expect(result.syncStatusText).toBe('🔒 唯讀模式');
    expect(result.syncTooltip).toBe('此課表正在另一分頁編輯中');
  });

  it('all-schedules + readOnly — no banner (all-schedules takes priority)', () => {
    const result = resolveHeaderState({
      activeScheduleId: ALL_ID,
      allSchedulesId: ALL_ID,
      isReadOnly: true,
    });
    // Banner should NOT show in all-schedules mode even if isReadOnly
    expect(result.showReadOnlyBanner).toBe(false);
    expect(result.buttonsDisabled).toBe(true);
    expect(result.syncStatusText).toBe('👀 唯讀總覽模式');
  });

  it('defaults isReadOnly to false when not provided', () => {
    const result = resolveHeaderState({
      activeScheduleId: 'schedule1',
      allSchedulesId: ALL_ID,
    });
    expect(result.buttonsDisabled).toBe(false);
    expect(result.showReadOnlyBanner).toBe(false);
  });
});
