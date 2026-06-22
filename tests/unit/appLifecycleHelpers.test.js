/**
 * App lifecycle helpers tests — extracted pure logic from JavaScript.html App object.
 * Ref: #116 — Wave 2B DI extraction tests
 *
 * Tests the extracted decision logic from App methods that are otherwise
 * tightly coupled to DOM/GAS/localStorage. Each test mirrors the production
 * behavior without requiring browser globals.
 *
 * Closes #116
 */
import { describe, it, expect, vi } from 'vitest';
import {
  resolveInitialSchedule,
  resolveScheduleLoad,
  canManageSchedule,
  resolvePersistedFilters,
  resolveApplyFilters,
  resolveClearAdvancedFilters,
  generateUniqueId,
  resolveDropAction,
  buildSavePayload,
  processServerLoadResult,
  shouldRefreshHeartbeat,
} from '../lib/appLifecycleHelpers.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────

const ALL_SCHEDULES_ID = 'ALL_SCHEDULES';

const mockSchedules = {
  'sched-1': {
    name: '課表A',
    createdBy: 'teacher@school.edu',
    isDraft: false,
    data: {
      classrooms: ['101', '102'],
      scheduleData: {
        '101': {
          0: [{ id: 'c1', name: '數學', timeStart: '08:00', timeEnd: '09:00', tags: ['math'] }],
          1: [{ id: 'c2', name: '英文', timeStart: '10:00', timeEnd: '11:00', tags: ['english'] }],
        },
      },
      tags: ['math', 'english'],
    },
  },
  'sched-2': {
    name: '課表B',
    createdBy: 'admin@school.edu',
    isDraft: true,
    data: {
      classrooms: ['201'],
      scheduleData: {},
      tags: [],
    },
  },
};

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

// ─── resolveInitialSchedule ────────────────────────────────────────────────

describe('resolveInitialSchedule', () => {
  it('loads locally stored schedule when it exists in schedules', () => {
    const result = resolveInitialSchedule('sched-1', mockSchedules);
    expect(result).toEqual({ action: 'load', scheduleId: 'sched-1' });
  });

  it('shows firstTime selector when local ID is null but schedules exist', () => {
    const result = resolveInitialSchedule(null, mockSchedules);
    expect(result).toEqual({ action: 'firstTime' });
  });

  it('shows firstTime selector when local ID is invalid but schedules exist', () => {
    const result = resolveInitialSchedule('nonexistent', mockSchedules);
    expect(result).toEqual({ action: 'firstTime' });
  });

  it('returns empty when no schedules and no local ID', () => {
    const result = resolveInitialSchedule(null, {});
    expect(result).toEqual({ action: 'empty' });
  });

  it('returns empty when local ID exists but no schedules', () => {
    const result = resolveInitialSchedule('sched-1', {});
    expect(result).toEqual({ action: 'empty' });
  });
});

// ─── resolveScheduleLoad ───────────────────────────────────────────────────

describe('resolveScheduleLoad', () => {
  it('returns read-only state for ALL_SCHEDULES_ID', () => {
    const result = resolveScheduleLoad(ALL_SCHEDULES_ID, mockSchedules, ALL_SCHEDULES_ID, () => true);
    expect(result.isReadOnly).toBe(true);
    expect(result.isAllSchedules).toBe(true);
    expect(result.classrooms).toEqual([]);
    expect(result.scheduleData).toEqual({});
  });

  it('sets isReadOnly=false when lock is acquired', () => {
    const result = resolveScheduleLoad('sched-1', mockSchedules, ALL_SCHEDULES_ID, () => true);
    expect(result.isReadOnly).toBe(false);
    expect(result.classrooms).toEqual(['101', '102']);
  });

  it('sets isReadOnly=true when lock acquisition fails', () => {
    const result = resolveScheduleLoad('sched-1', mockSchedules, ALL_SCHEDULES_ID, () => false);
    expect(result.isReadOnly).toBe(true);
  });

  it('returns error and fallback when schedule not found', () => {
    const result = resolveScheduleLoad('nonexistent', mockSchedules, ALL_SCHEDULES_ID, () => true);
    expect(result.error).toBeDefined();
    expect(result.fallbackId).toBe('sched-1');
  });

  it('marks needsRepair when schedule.data is null', () => {
    const schedules = { 'sched-x': { name: 'Broken' } };
    const result = resolveScheduleLoad('sched-x', schedules, ALL_SCHEDULES_ID, () => true);
    expect(result.needsRepair).toBe(true);
    expect(result.classrooms).toEqual([]);
  });

  it('returns classrooms and scheduleData from schedule.data', () => {
    const result = resolveScheduleLoad('sched-1', mockSchedules, ALL_SCHEDULES_ID, () => true);
    expect(result.classrooms).toEqual(['101', '102']);
    expect(result.scheduleData).toHaveProperty('101');
  });
});

// ─── canManageSchedule ─────────────────────────────────────────────────────

describe('canManageSchedule', () => {
  const getShort = (email) => email.split('@')[0];

  it('admin can always manage', () => {
    expect(canManageSchedule(true, 'sched-1', ALL_SCHEDULES_ID, mockSchedules, 'anyone', getShort)).toBe(true);
  });

  it('non-admin cannot manage ALL_SCHEDULES view', () => {
    expect(canManageSchedule(false, ALL_SCHEDULES_ID, ALL_SCHEDULES_ID, mockSchedules, 'teacher', getShort)).toBe(false);
  });

  it('creator can manage their own schedule', () => {
    expect(canManageSchedule(false, 'sched-1', ALL_SCHEDULES_ID, mockSchedules, 'teacher', getShort)).toBe(true);
  });

  it('non-creator cannot manage others schedule', () => {
    expect(canManageSchedule(false, 'sched-1', ALL_SCHEDULES_ID, mockSchedules, 'student', getShort)).toBe(false);
  });

  it('returns false when schedule has no createdBy', () => {
    const schedules = { 'sched-x': { name: 'No Creator' } };
    expect(canManageSchedule(false, 'sched-x', ALL_SCHEDULES_ID, schedules, 'teacher', getShort)).toBe(false);
  });

  it('returns false when schedule does not exist', () => {
    expect(canManageSchedule(false, 'nonexistent', ALL_SCHEDULES_ID, mockSchedules, 'teacher', getShort)).toBe(false);
  });
});

// ─── resolvePersistedFilters ───────────────────────────────────────────────

describe('resolvePersistedFilters', () => {
  it('returns empty filters when no persisted data', () => {
    const result = resolvePersistedFilters(null, ['math', 'english']);
    expect(result.activeFilters).toEqual([]);
    expect(result.needsPersistUpdate).toBe(false);
  });

  it('parses valid persisted tags', () => {
    const result = resolvePersistedFilters(JSON.stringify(['math', 'english']), ['math', 'english', 'science']);
    expect(result.activeFilters).toEqual([
      { type: 'tag', value: 'math' },
      { type: 'tag', value: 'english' },
    ]);
    expect(result.validTags).toEqual(['math', 'english']);
    expect(result.needsPersistUpdate).toBe(false);
  });

  it('filters out tags that no longer exist', () => {
    const result = resolvePersistedFilters(JSON.stringify(['math', 'deleted-tag']), ['math', 'english']);
    expect(result.validTags).toEqual(['math']);
    expect(result.needsPersistUpdate).toBe(true);
  });

  it('handles parse errors gracefully', () => {
    const result = resolvePersistedFilters('not-valid-json{', ['math']);
    expect(result.activeFilters).toEqual([]);
    expect(result.parseError).toBe(true);
    expect(result.needsPersistUpdate).toBe(true);
  });

  it('returns empty when all persisted tags are invalid', () => {
    const result = resolvePersistedFilters(JSON.stringify(['deleted1', 'deleted2']), ['math']);
    expect(result.validTags).toEqual([]);
    expect(result.needsPersistUpdate).toBe(true);
  });
});

// ─── resolveApplyFilters ───────────────────────────────────────────────────

describe('resolveApplyFilters', () => {
  it('keeps tag filters and adds new advanced filters', () => {
    const current = [
      { type: 'tag', value: 'math' },
      { type: 'name', value: 'old-filter' },
    ];
    const result = resolveApplyFilters(current, 'teacher', ['Teacher A', 'Teacher B']);
    expect(result).toEqual([
      { type: 'tag', value: 'math' },
      { type: 'teacher', value: 'Teacher A' },
      { type: 'teacher', value: 'Teacher B' },
    ]);
  });

  it('replaces old advanced filters with new ones', () => {
    const current = [
      { type: 'tag', value: 'math' },
      { type: 'name', value: '數學' },
    ];
    const result = resolveApplyFilters(current, 'name', ['英文']);
    expect(result).toEqual([
      { type: 'tag', value: 'math' },
      { type: 'name', value: '英文' },
    ]);
  });

  it('works with no existing filters', () => {
    const result = resolveApplyFilters([], 'name', ['數學']);
    expect(result).toEqual([{ type: 'name', value: '數學' }]);
  });
});

// ─── resolveClearAdvancedFilters ────────────────────────────────────────────

describe('resolveClearAdvancedFilters', () => {
  it('removes advanced filters but keeps tag filters', () => {
    const filters = [
      { type: 'tag', value: 'math' },
      { type: 'name', value: '數學' },
      { type: 'teacher', value: 'Teacher A' },
    ];
    expect(resolveClearAdvancedFilters(filters)).toEqual([{ type: 'tag', value: 'math' }]);
  });

  it('returns empty array when no tag filters', () => {
    expect(resolveClearAdvancedFilters([{ type: 'name', value: 'test' }])).toEqual([]);
  });

  it('returns all when only tag filters', () => {
    const filters = [{ type: 'tag', value: 'a' }, { type: 'tag', value: 'b' }];
    expect(resolveClearAdvancedFilters(filters)).toEqual(filters);
  });
});

// ─── generateUniqueId ──────────────────────────────────────────────────────

describe('generateUniqueId', () => {
  it('returns a string', () => {
    expect(typeof generateUniqueId()).toBe('string');
  });

  it('is deterministic with fixed inputs', () => {
    const nowFn = () => 1000000;
    const randomFn = () => 0.123456789;
    const id1 = generateUniqueId(nowFn, randomFn);
    const id2 = generateUniqueId(nowFn, randomFn);
    expect(id1).toBe(id2);
  });

  it('generates unique IDs with default functions', () => {
    const id1 = generateUniqueId();
    const id2 = generateUniqueId();
    // Very unlikely to be equal but theoretically possible
    expect(id1.length).toBeGreaterThan(5);
  });

  it('uses timestamp base-36 encoding', () => {
    const nowFn = () => 1719100800000; // 2024-06-23
    const randomFn = () => 0.5;
    const id = generateUniqueId(nowFn, randomFn);
    expect(id).toContain(nowFn().toString(36));
  });
});

// ─── resolveDropAction ─────────────────────────────────────────────────────

describe('resolveDropAction', () => {
  const scheduleData = {
    '101': {
      0: [
        { id: 'c1', name: '數學', timeStart: '08:00', timeEnd: '09:00' },
        { id: 'c2', name: '英文', timeStart: '10:00', timeEnd: '11:00' },
      ],
    },
    '102': {
      0: [{ id: 'c3', name: '理化', timeStart: '09:00', timeEnd: '10:00' }],
    },
  };

  it('returns moved=false for same classroom+day (no-op)', () => {
    const result = resolveDropAction(scheduleData, {
      fromClassroom: '101', fromDay: 0, toClassroom: '101', toDay: 0, classId: 'c1', newIndex: 1,
    }, timeToMinutes);
    expect(result.moved).toBe(false);
  });

  it('moves item between classrooms', () => {
    const result = resolveDropAction(scheduleData, {
      fromClassroom: '101', fromDay: 0, toClassroom: '102', toDay: 0, classId: 'c1', newIndex: 0,
    }, timeToMinutes);
    expect(result.moved).toBe(true);
    // c1 should be in 102 now
    expect(result.scheduleData['102'][0].some(c => c.id === 'c1')).toBe(true);
    // c1 should not be in 101 anymore
    expect(result.scheduleData['101'][0].every(c => c.id !== 'c1')).toBe(true);
  });

  it('returns error when item not found', () => {
    const result = resolveDropAction(scheduleData, {
      fromClassroom: '101', fromDay: 0, toClassroom: '102', toDay: 0, classId: 'nonexistent', newIndex: 0,
    }, timeToMinutes);
    expect(result.moved).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('sorts target day by start time after drop', () => {
    const result = resolveDropAction(scheduleData, {
      fromClassroom: '101', fromDay: 0, toClassroom: '102', toDay: 0, classId: 'c1', newIndex: 1,
    }, timeToMinutes);
    const targetDay = result.scheduleData['102'][0];
    for (let i = 1; i < targetDay.length; i++) {
      expect(timeToMinutes(targetDay[i].timeStart)).toBeGreaterThanOrEqual(
        timeToMinutes(targetDay[i - 1].timeStart)
      );
    }
  });

  it('creates target classroom/day if they do not exist', () => {
    const result = resolveDropAction(scheduleData, {
      fromClassroom: '101', fromDay: 0, toClassroom: '103', toDay: 2, classId: 'c1', newIndex: 0,
    }, timeToMinutes);
    expect(result.moved).toBe(true);
    expect(result.scheduleData['103'][2]).toHaveLength(1);
    expect(result.scheduleData['103'][2][0].id).toBe('c1');
  });

  it('does not mutate original scheduleData', () => {
    const original = JSON.parse(JSON.stringify(scheduleData));
    resolveDropAction(scheduleData, {
      fromClassroom: '101', fromDay: 0, toClassroom: '102', toDay: 0, classId: 'c1', newIndex: 0,
    }, timeToMinutes);
    expect(scheduleData).toEqual(original);
  });
});

// ─── buildSavePayload ──────────────────────────────────────────────────────

describe('buildSavePayload', () => {
  it('builds correct payload when timestamp exists', () => {
    const result = buildSavePayload('sched-1', { 'sched-1': '2024-01-01T00:00:00Z' },
      ['101'], { '101': {} }, ['math']);
    expect(result.payload).toBeDefined();
    expect(result.payload.scheduleId).toBe('sched-1');
    expect(result.payload.lastModified).toBe('2024-01-01T00:00:00Z');
    expect(result.payload.scheduleData.classrooms).toEqual(['101']);
  });

  it('returns error when no timestamp for schedule', () => {
    const result = buildSavePayload('sched-1', {}, ['101'], {}, []);
    expect(result.error).toBeDefined();
    expect(result.payload).toBeUndefined();
  });
});

// ─── processServerLoadResult ───────────────────────────────────────────────

describe('processServerLoadResult', () => {
  it('processes valid server response', () => {
    const result = processServerLoadResult({
      schedules: {
        'sched-1': { name: 'A', lastModified: 'ts-1', data: {} },
        'sched-2': { name: 'B', data: {} },
      },
      metadataTimestamp: 'meta-ts',
    });
    expect(result.schedules['sched-1'].name).toBe('A');
    expect(result.schedules['sched-1'].lastModified).toBeUndefined(); // stripped
    expect(result.scheduleLastModified['sched-1']).toBe('ts-1');
    expect(result.scheduleLastModified['sched-2']).toBeUndefined();
    expect(result.metadataTimestamp).toBe('meta-ts');
  });

  it('returns error for null result', () => {
    expect(processServerLoadResult(null).error).toBeDefined();
  });

  it('returns error for result with error field', () => {
    expect(processServerLoadResult({ error: 'Server down' }).error).toBe('Server down');
  });

  it('defaults to empty schedules when none provided', () => {
    const result = processServerLoadResult({ metadataTimestamp: 'ts' });
    expect(result.schedules).toEqual({});
  });
});

// ─── shouldRefreshHeartbeat ────────────────────────────────────────────────

describe('shouldRefreshHeartbeat', () => {
  it('returns false when read-only', () => {
    expect(shouldRefreshHeartbeat(true, 'sched-1', ALL_SCHEDULES_ID)).toBe(false);
  });

  it('returns false when no active schedule', () => {
    expect(shouldRefreshHeartbeat(false, null, ALL_SCHEDULES_ID)).toBe(false);
  });

  it('returns false for ALL_SCHEDULES view', () => {
    expect(shouldRefreshHeartbeat(false, ALL_SCHEDULES_ID, ALL_SCHEDULES_ID)).toBe(false);
  });

  it('returns true for normal writable schedule', () => {
    expect(shouldRefreshHeartbeat(false, 'sched-1', ALL_SCHEDULES_ID)).toBe(true);
  });
});
