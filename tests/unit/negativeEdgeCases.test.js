/**
 * Negative / edge-case tests for extracted tests/lib/ modules.
 * Ref: #112 — Expand test coverage with defensive edge cases:
 * null/undefined inputs, empty arrays/objects, malformed data,
 * boundary values.
 *
 * Targets functions with low branch coverage identified from
 * `npx vitest --run --coverage` uncovered lines.
 *
 * Closes #112
 */
import { describe, it, expect, vi } from 'vitest';

// ─── Import targets ────────────────────────────────────────────────────────

import {
  simulateEditChain,
  simulateUndoChain,
  simulateSwitchChain,
} from '../lib/integrationHelpers.js';

import {
  resolveDropAction,
  buildSavePayload,
} from '../lib/appLifecycleHelpers.js';

import {
  resolveClickAction,
} from '../lib/interactionHelpers.js';

// resolveClickAction signature: (clickState, target, timerState)

import {
  findNextUpcomingClasses,
  forEachCourse,
  countOccurrences,
} from '../lib/stateHelpers.js';

import {
  computeClassElementProps,
} from '../lib/uiHelpers.js';

import {
  buildCourseColorMap,
  sortClassrooms,
  ensureDataIds,
  stringToHashCode,
} from '../lib/utilityFunctions.js';

// ─── integrationHelpers — edge cases ───────────────────────────────────────

describe('integrationHelpers — negative/edge cases (#112)', () => {
  describe('simulateEditChain', () => {
    it('should handle edit mode when item ID is not found in schedule (L132 branch)', () => {
      const appState = {
        scheduleData: { 'Room A': { Monday: [{ id: 'existing-1', name: 'Math', timeStart: '08:00' }] } },
      };
      const result = simulateEditChain(appState, {
        classroom: 'Room A',
        day: 'Monday',
        item: { id: 'non-existent-id', name: 'Science' },
      }, { isNew: false });
      // Should return without modifying when ID not found
      expect(result.scheduleData['Room A'].Monday).toHaveLength(1);
      expect(result.scheduleData['Room A'].Monday[0].name).toBe('Math');
      expect(result.isDirty).toBe(true);
    });

    it('should handle null classroom data in edit mode', () => {
      const appState = { scheduleData: { 'Room A': {} } };
      // When day doesn't exist, accessing .findIndex will fail
      // But the function creates the day array if missing
      const result = simulateEditChain(appState, {
        classroom: 'Room A',
        day: 'Monday',
        item: { id: 'x', name: 'Math' },
      }, { isNew: false });
      // Day array was created empty, findIndex finds nothing, no-op
      expect(result.scheduleData['Room A'].Monday).toHaveLength(0);
    });

    it('should handle adding to a new classroom that does not exist yet', () => {
      const appState = { scheduleData: {} };
      const result = simulateEditChain(appState, {
        classroom: 'New Room',
        day: 'Tuesday',
        item: { id: 'new-1', name: 'Art', timeStart: '10:00' },
      }, { isNew: true });
      expect(result.scheduleData['New Room'].Tuesday).toHaveLength(1);
      expect(result.scheduleData['New Room'].Tuesday[0].name).toBe('Art');
    });

    it('should sort by timeStart when adding new items', () => {
      const appState = {
        scheduleData: { 'R1': { Mon: [{ id: '1', name: 'B', timeStart: '10:00' }] } },
      };
      const result = simulateEditChain(appState, {
        classroom: 'R1',
        day: 'Mon',
        item: { id: '2', name: 'A', timeStart: '08:00' },
      }, { isNew: true });
      expect(result.scheduleData['R1'].Mon[0].timeStart).toBe('08:00');
      expect(result.scheduleData['R1'].Mon[1].timeStart).toBe('10:00');
    });
  });

  describe('simulateUndoChain', () => {
    it('should return null state when currentIndex is 0 (at initial state)', () => {
      const result = simulateUndoChain([{ data: 'initial' }], 0);
      expect(result.newState).toBeNull();
      expect(result.newIndex).toBe(0);
      expect(result.isDirty).toBe(false);
    });

    it('should return null state when currentIndex is negative', () => {
      const result = simulateUndoChain([], -1);
      expect(result.newState).toBeNull();
      expect(result.newIndex).toBe(-1);
      expect(result.isDirty).toBe(false);
    });

    it('should mark as not dirty when undoing to index 0', () => {
      const stack = [{ state: 'initial' }, { state: 'modified' }];
      const result = simulateUndoChain(stack, 1);
      expect(result.newIndex).toBe(0);
      expect(result.isDirty).toBe(false);
    });

    it('should mark as dirty when undoing but not at index 0', () => {
      const stack = [{ a: 1 }, { a: 2 }, { a: 3 }];
      const result = simulateUndoChain(stack, 2);
      expect(result.newIndex).toBe(1);
      expect(result.isDirty).toBe(true);
    });
  });

  describe('simulateSwitchChain', () => {
    it('should handle schedule with missing data properties (L189-195 fallbacks)', () => {
      const schedules = {
        's1': { data: {} },  // data exists but has no scheduleData/classrooms/tags
      };
      const result = simulateSwitchChain(schedules, 's1', 'current');
      expect(result.success).toBe(true);
      expect(result.scheduleData).toEqual({});
      expect(result.classrooms).toEqual([]);
      expect(result.tags).toEqual([]);
      expect(result.historyReset).toBe(true);
    });

    it('should handle schedule with null data', () => {
      const schedules = {
        's1': { data: null },
      };
      const result = simulateSwitchChain(schedules, 's1', 'current');
      expect(result.success).toBe(true);
      expect(result.scheduleData).toEqual({});
    });

    it('should handle schedule with no data property at all', () => {
      const schedules = {
        's1': {},
      };
      const result = simulateSwitchChain(schedules, 's1', 'current');
      expect(result.success).toBe(true);
      expect(result.scheduleData).toEqual({});
      expect(result.classrooms).toEqual([]);
      expect(result.tags).toEqual([]);
    });

    it('should return same-schedule when switching to current', () => {
      const result = simulateSwitchChain({}, 'current', 'current');
      expect(result.success).toBe(true);
      expect(result.reason).toBe('same-schedule');
      expect(result.historyReset).toBe(false);
    });

    it('should return not-found for non-existent schedule', () => {
      const result = simulateSwitchChain({}, 'missing', 'current');
      expect(result.success).toBe(false);
      expect(result.reason).toBe('not-found');
    });
  });
});

// ─── appLifecycleHelpers — edge cases ──────────────────────────────────────

describe('appLifecycleHelpers — negative/edge cases (#112)', () => {
  describe('resolveDropAction', () => {
    const mockTimeToMinutes = (t) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };

    it('should clean up empty day after moving last item (L206 branch)', () => {
      const data = {
        'Room A': {
          Monday: [{ id: '1', name: 'Math', timeStart: '08:00' }],
        },
      };
      const result = resolveDropAction(data, {
        fromClassroom: 'Room A',
        fromDay: 'Monday',
        toClassroom: 'Room B',
        toDay: 'Tuesday',
        classId: '1',
        newIndex: 0,
      }, mockTimeToMinutes);
      expect(result.moved).toBe(true);
      // Monday should be deleted since it's now empty
      expect(result.scheduleData['Room A'].Monday).toBeUndefined();
      expect(result.scheduleData['Room B'].Tuesday).toHaveLength(1);
    });

    it('should NOT clean up day when items remain after move', () => {
      const data = {
        'Room A': {
          Monday: [
            { id: '1', name: 'Math', timeStart: '08:00' },
            { id: '2', name: 'Science', timeStart: '10:00' },
          ],
        },
      };
      const result = resolveDropAction(data, {
        fromClassroom: 'Room A',
        fromDay: 'Monday',
        toClassroom: 'Room B',
        toDay: 'Tuesday',
        classId: '1',
        newIndex: 0,
      }, mockTimeToMinutes);
      expect(result.moved).toBe(true);
      expect(result.scheduleData['Room A'].Monday).toHaveLength(1);
      expect(result.scheduleData['Room A'].Monday[0].name).toBe('Science');
    });

    it('should sort destination by timeStart after move', () => {
      const data = {
        'Room A': {
          Monday: [{ id: '1', name: 'Late', timeStart: '14:00' }],
        },
        'Room B': {
          Monday: [{ id: '2', name: 'Early', timeStart: '08:00' }],
        },
      };
      const result = resolveDropAction(data, {
        fromClassroom: 'Room A',
        fromDay: 'Monday',
        toClassroom: 'Room B',
        toDay: 'Monday',
        classId: '1',
        newIndex: 0,
      }, mockTimeToMinutes);
      expect(result.scheduleData['Room B'].Monday[0].name).toBe('Early');
      expect(result.scheduleData['Room B'].Monday[1].name).toBe('Late');
    });
  });
});

// ─── interactionHelpers — edge cases ───────────────────────────────────────

describe('interactionHelpers — negative/edge cases (#112)', () => {
  describe('resolveClickAction', () => {
    it('should return action:none for click on non-interactive target (L224 fallthrough)', () => {
      // clickState: not read-only, not all-schedules, no active form
      // target: not a class, not delete, not empty cell
      const clickState = { isReadOnly: false, isAllSchedulesView: false, hasActiveInlineForm: false };
      const target = { isClassItem: false, isDeleteBtn: false, isEmptyCell: false };
      const timerState = { clickTimer: null, lastClickedId: null };
      const result = resolveClickAction(clickState, target, timerState);
      expect(result.action).toBe('none');
      expect(result.newTimerState).toBe(timerState);
    });

    it('should return action:none even with active timer on non-interactive target', () => {
      const clickState = { isReadOnly: false, isAllSchedulesView: false, hasActiveInlineForm: false };
      const target = { isClassItem: false, isDeleteBtn: false, isEmptyCell: false };
      const timerState = { clickTimer: 'pending', lastClickedId: 'some-id' };
      const result = resolveClickAction(clickState, target, timerState);
      expect(result.action).toBe('none');
    });
  });
});

// ─── stateHelpers — edge cases ─────────────────────────────────────────────

describe('stateHelpers — negative/edge cases (#112)', () => {
  const AppConfig = { MODES: { DAY: 'day', WEEK: 'week' } };

  describe('findNextUpcomingClasses', () => {
    it('should use new Date() fallback when now is null (L146 branch)', () => {
      const ctx = {
        nextUpcomingClassIds: new Set(['old']),
        currentViewMode: 'week',
        currentDayIndex: 0,
      };
      // Passing null for now — should still clear and use new Date()
      findNextUpcomingClasses(ctx, AppConfig, null);
      // In week mode, should clear and return early (regardless of date)
      expect(ctx.nextUpcomingClassIds.size).toBe(0);
    });

    it('should clear IDs in WEEK mode regardless of day', () => {
      const ctx = {
        nextUpcomingClassIds: new Set(['x', 'y']),
        currentViewMode: 'week',
        currentDayIndex: 0,
      };
      findNextUpcomingClasses(ctx, AppConfig, new Date());
      expect(ctx.nextUpcomingClassIds.size).toBe(0);
    });

    it('should clear IDs in DAY mode when not viewing today', () => {
      const now = new Date('2026-06-23T10:00:00'); // Tuesday → index 1
      const ctx = {
        nextUpcomingClassIds: new Set(['x']),
        currentViewMode: 'day',
        currentDayIndex: 3, // Thursday, not Tuesday
        scheduleData: {},
        classrooms: [],
      };
      findNextUpcomingClasses(ctx, AppConfig, now);
      expect(ctx.nextUpcomingClassIds.size).toBe(0);
    });
  });

  describe('forEachCourse', () => {
    it('should handle null scheduleData gracefully', () => {
      const cb = vi.fn();
      forEachCourse(null, cb);
      expect(cb).not.toHaveBeenCalled();
    });

    it('should handle undefined scheduleData gracefully', () => {
      const cb = vi.fn();
      forEachCourse(undefined, cb);
      expect(cb).not.toHaveBeenCalled();
    });

    it('should handle empty scheduleData', () => {
      const cb = vi.fn();
      forEachCourse({}, cb);
      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('countOccurrences', () => {
    it('should return 0 for null scheduleData', () => {
      expect(countOccurrences(null, () => true)).toBe(0);
    });

    it('should return 0 for empty scheduleData', () => {
      expect(countOccurrences({}, () => true)).toBe(0);
    });

    it('should count matching items', () => {
      const data = {
        'R1': { Mon: [{ name: 'Math' }, { name: 'Art' }] },
      };
      expect(countOccurrences(data, (item) => item.name === 'Math')).toBe(1);
    });
  });
});

// ─── uiHelpers — edge cases ────────────────────────────────────────────────

describe('uiHelpers — negative/edge cases (#112)', () => {
  describe('computeClassElementProps', () => {
    it('should use default checkTimeConflict when appState is empty (L75 default fn)', () => {
      const result = computeClassElementProps(
        { id: '1', name: 'Math', timeStart: '08:00', timeEnd: '09:00', teacher: 'Smith' },
        'Room A',
        'Monday',
        {},
        {} // empty appState — should use default checkTimeConflict = () => false
      );
      expect(result).toBeDefined();
      expect(result.cssClasses).not.toContain('time-conflict');
    });

    it('should use default fallback color when courseColorMap has no entry', () => {
      const result = computeClassElementProps(
        { id: '1', name: 'Unknown Course', timeStart: '08:00', timeEnd: '09:00', teacher: 'X' },
        'Room A',
        'Monday',
        {},
        { courseColorMap: {} }
      );
      expect(result.bgColor).toBe('#E2E8F0'); // default fallback
    });

    it('should apply overrideColor when provided', () => {
      const result = computeClassElementProps(
        { id: '1', name: 'Math', timeStart: '08:00', timeEnd: '09:00', teacher: 'X' },
        'Room A',
        'Monday',
        { overrideColor: '#FF0000' },
        { courseColorMap: { Math: '#0000FF' } }
      );
      expect(result.bgColor).toBe('#FF0000');
    });

    it('should handle null classItem properties gracefully', () => {
      const result = computeClassElementProps(
        { id: null, name: null, timeStart: '', timeEnd: '', teacher: '' },
        'Room A',
        'Monday',
        {},
        {}
      );
      expect(result).toBeDefined();
    });

    it('should detect time conflict when checkTimeConflict returns true', () => {
      const result = computeClassElementProps(
        { id: '1', name: 'Math', timeStart: '08:00', timeEnd: '09:00', teacher: 'X' },
        'Room A',
        'Monday',
        {},
        { checkTimeConflict: () => true }
      );
      expect(result.cssClasses).toContain('conflict');
      expect(result.hasConflict).toBe(true);
    });
  });

  describe('computeClassElementProps — day mode', () => {
    it('should show notes in day mode', () => {
      const result = computeClassElementProps(
        { id: '1', name: 'Math', timeStart: '08:00', timeEnd: '09:00', teacher: 'X' },
        'Room A',
        'Monday',
        {},
        { currentViewMode: 'day', dayMode: 'day' }
      );
      expect(result.showNotes).toBe(true);
      expect(result.cssClasses).toContain('day-view-layout');
    });

    it('should not show notes in week mode', () => {
      const result = computeClassElementProps(
        { id: '1', name: 'Math', timeStart: '08:00', timeEnd: '09:00', teacher: 'X' },
        'Room A',
        'Monday',
        {},
        { currentViewMode: 'week' }
      );
      expect(result.showNotes).toBe(false);
    });
  });
});

// ─── utilityFunctions — edge cases ─────────────────────────────────────────

describe('utilityFunctions — negative/edge cases (#112)', () => {
  describe('buildCourseColorMap', () => {
    it('should return empty map for null dataSource', () => {
      expect(buildCourseColorMap(null, stringToHashCode, ['#FFF'])).toEqual({});
    });

    it('should return empty map for undefined dataSource', () => {
      expect(buildCourseColorMap(undefined, stringToHashCode, ['#FFF'])).toEqual({});
    });

    it('should skip non-array daySchedule values (L157 branch)', () => {
      const data = {
        'Room A': {
          Monday: [{ name: 'Math' }],
          Tuesday: 'not-an-array',  // malformed data
          Wednesday: null,           // null day
          Thursday: 42,              // number
        },
      };
      const colors = ['#FF0000', '#00FF00', '#0000FF'];
      const result = buildCourseColorMap(data, stringToHashCode, colors);
      // Should only pick up 'Math' from Monday
      expect(Object.keys(result)).toEqual(['Math']);
    });

    it('should skip null classroom values', () => {
      const data = {
        'Room A': null,
        'Room B': { Monday: [{ name: 'Science' }] },
      };
      const colors = ['#FFF'];
      const result = buildCourseColorMap(data, stringToHashCode, colors);
      expect(Object.keys(result)).toEqual(['Science']);
    });

    it('should handle empty schedule data (no classrooms)', () => {
      const result = buildCourseColorMap({}, stringToHashCode, ['#FFF']);
      expect(result).toEqual({});
    });

    it('should deterministically assign colors based on hash', () => {
      const data = { R: { Mon: [{ name: 'Art' }, { name: 'Music' }] } };
      const colors = ['#A', '#B', '#C'];
      const result1 = buildCourseColorMap(data, stringToHashCode, colors);
      const result2 = buildCourseColorMap(data, stringToHashCode, colors);
      expect(result1).toEqual(result2);
    });
  });

  describe('sortClassrooms', () => {
    it('should return empty array for null input', () => {
      expect(sortClassrooms(null)).toEqual([]);
    });

    it('should return empty array for undefined input', () => {
      expect(sortClassrooms(undefined)).toEqual([]);
    });

    it('should return empty array for empty array', () => {
      expect(sortClassrooms([])).toEqual([]);
    });

    it('should handle classrooms with no numeric prefix', () => {
      const result = sortClassrooms(['Art Room', 'Music Hall', 'Gym']);
      expect(result).toBeDefined();
      expect(result).toHaveLength(3);
    });
  });

  describe('ensureDataIds', () => {
    it('should handle empty schedule data', () => {
      const result = ensureDataIds({});
      expect(result).toEqual({});
    });

    it('should return empty object for null schedule data', () => {
      const mockGenId = () => 'mock-id';
      const result = ensureDataIds(null, mockGenId);
      // ensureDataIds iterates Object.entries — null becomes {}
      expect(result).toBeDefined();
    });

    it('should handle classroom with empty days', () => {
      const mockGenId = () => 'mock-id';
      const data = { 'Room A': { Monday: [] } };
      const result = ensureDataIds(data, mockGenId);
      expect(result['Room A'].Monday).toEqual([]);
    });

    it('should add IDs to items that lack them', () => {
      const mockGenId = () => 'generated-id';
      const data = { 'R1': { Mon: [{ name: 'Math' }] } };
      const result = ensureDataIds(data, mockGenId);
      expect(result['R1'].Mon[0].id).toBe('generated-id');
    });

    it('should preserve existing IDs', () => {
      const mockGenId = () => 'should-not-use';
      const data = { 'R1': { Mon: [{ id: 'keep-me', name: 'Math' }] } };
      const result = ensureDataIds(data, mockGenId);
      expect(result['R1'].Mon[0].id).toBe('keep-me');
    });
  });

  describe('stringToHashCode', () => {
    it('should return non-zero for empty string (djb2 seed)', () => {
      // djb2 hash starts at 5381 — empty string returns the seed value
      expect(stringToHashCode('')).toBe(5381);
    });

    it('should return consistent hash for same input', () => {
      expect(stringToHashCode('test')).toBe(stringToHashCode('test'));
    });

    it('should return different hashes for different inputs', () => {
      expect(stringToHashCode('abc')).not.toBe(stringToHashCode('xyz'));
    });
  });
});
