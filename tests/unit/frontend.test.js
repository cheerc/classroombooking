/**
 * Frontend tests — Wave A: P0 pure logic + P1 mock infra
 * Ref: #72, #73, #74, #75, #76
 */
import { describe, it, expect, vi } from 'vitest';
import {
  timeToMinutes,
  checkTimeConflict,
  filterScheduleData,
  filterDataByTags,
  filterDataByActiveFilters,
} from '../lib/frontendUtils.js';
import {
  createMockServerApi,
  createMockStorage,
  createLockManager,
} from '../mocks/frontendMocks.js';

// ─── Sample data fixtures ────────────────────────────────────────────────

const sampleScheduleData = {
  'Room A': {
    'Monday': [
      { id: 'c1', name: 'Math', teacher: 'Alice', tags: ['core', 'stem'], timeStart: '08:00', timeEnd: '09:00' },
      { id: 'c2', name: 'English', teacher: 'Bob', tags: ['core', 'language'], timeStart: '09:00', timeEnd: '10:00' },
    ],
    'Tuesday': [
      { id: 'c3', name: 'Science', teacher: 'Alice', tags: ['stem'], timeStart: '10:00', timeEnd: '11:00' },
    ],
  },
  'Room B': {
    'Monday': [
      { id: 'c4', name: 'Art', teacher: 'Carol', tags: ['elective'], timeStart: '08:00', timeEnd: '09:00' },
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// #73 — timeToMinutes / checkTimeConflict
// ═══════════════════════════════════════════════════════════════════════════

describe('timeToMinutes (#73)', () => {
  it('converts "08:00" to 480', () => {
    expect(timeToMinutes('08:00')).toBe(480);
  });

  it('converts "23:59" to 1439', () => {
    expect(timeToMinutes('23:59')).toBe(1439);
  });

  it('converts "00:00" to 0', () => {
    expect(timeToMinutes('00:00')).toBe(0);
  });

  it('returns 0 for invalid input', () => {
    expect(timeToMinutes(null)).toBe(0);
    expect(timeToMinutes(undefined)).toBe(0);
  });
});

describe('checkTimeConflict (#73)', () => {
  const existing = [
    { id: 'e1', timeStart: '08:00', timeEnd: '09:00' },
    { id: 'e2', timeStart: '10:00', timeEnd: '11:00' },
  ];

  it('returns false when no existing classes', () => {
    expect(checkTimeConflict({ id: 'n1', timeStart: '08:00', timeEnd: '09:00' }, [])).toBe(false);
    expect(checkTimeConflict({ id: 'n1', timeStart: '08:00', timeEnd: '09:00' }, null)).toBe(false);
  });

  it('returns false for no conflict (after all)', () => {
    expect(checkTimeConflict({ id: 'n1', timeStart: '11:00', timeEnd: '12:00' }, existing)).toBe(false);
  });

  it('returns false for adjacent time slot (no overlap)', () => {
    expect(checkTimeConflict({ id: 'n1', timeStart: '09:00', timeEnd: '10:00' }, existing)).toBe(false);
  });

  it('returns true for exact overlap', () => {
    expect(checkTimeConflict({ id: 'n1', timeStart: '08:00', timeEnd: '09:00' }, existing)).toBe(true);
  });

  it('returns true for partial overlap', () => {
    expect(checkTimeConflict({ id: 'n1', timeStart: '08:30', timeEnd: '09:30' }, existing)).toBe(true);
  });

  it('skips self-conflict (same id)', () => {
    expect(checkTimeConflict({ id: 'e1', timeStart: '08:00', timeEnd: '09:00' }, existing)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// #72 — Filter pipeline
// ═══════════════════════════════════════════════════════════════════════════

describe('filterScheduleData (#72)', () => {
  it('returns empty when no courses match', () => {
    const result = filterScheduleData(sampleScheduleData, () => false);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('returns all when predicate always true', () => {
    const result = filterScheduleData(sampleScheduleData, () => true);
    expect(Object.keys(result)).toHaveLength(2);
    expect(result['Room A']['Monday']).toHaveLength(2);
  });

  it('removes empty classrooms', () => {
    // Only match Room B courses
    const result = filterScheduleData(sampleScheduleData, course => course.name === 'Art');
    expect(Object.keys(result)).toHaveLength(1);
    expect(result['Room B']).toBeTruthy();
    expect(result['Room A']).toBeUndefined();
  });
});

describe('filterDataByTags (#72)', () => {
  it('returns all data when no tag filters', () => {
    const result = filterDataByTags(sampleScheduleData, []);
    expect(result).toBe(sampleScheduleData); // Same reference — no filtering
  });

  it('filters by single tag', () => {
    const result = filterDataByTags(sampleScheduleData, [{ type: 'tag', value: 'stem' }]);
    expect(result['Room A']['Monday']).toHaveLength(1); // Only Math
    expect(result['Room A']['Monday'][0].name).toBe('Math');
    expect(result['Room A']['Tuesday']).toHaveLength(1); // Science
    expect(result['Room B']).toBeUndefined(); // Art has no stem tag
  });

  it('filters by tag with OR logic (any tag matches)', () => {
    const result = filterDataByTags(sampleScheduleData, [
      { type: 'tag', value: 'stem' },
      { type: 'tag', value: 'language' },
    ]);
    expect(result['Room A']['Monday']).toHaveLength(2); // Math + English
  });

  it('ignores non-tag filters', () => {
    const result = filterDataByTags(sampleScheduleData, [{ type: 'name', value: 'Math' }]);
    expect(result).toBe(sampleScheduleData);
  });
});

describe('filterDataByActiveFilters (#72)', () => {
  it('returns all data when no filters', () => {
    const result = filterDataByActiveFilters(sampleScheduleData, []);
    expect(result).toBe(sampleScheduleData);
  });

  it('filters by name only', () => {
    const result = filterDataByActiveFilters(sampleScheduleData, [{ type: 'name', value: 'Math' }]);
    expect(result['Room A']['Monday']).toHaveLength(1);
    expect(result['Room A']['Monday'][0].name).toBe('Math');
  });

  it('filters by teacher only', () => {
    const result = filterDataByActiveFilters(sampleScheduleData, [{ type: 'teacher', value: 'Alice' }]);
    expect(result['Room A']['Monday']).toHaveLength(1); // Math
    expect(result['Room A']['Tuesday']).toHaveLength(1); // Science
    expect(result['Room B']).toBeUndefined();
  });

  it('filters by combined name + tag (AND logic)', () => {
    const result = filterDataByActiveFilters(sampleScheduleData, [
      { type: 'name', value: 'Math' },
      { type: 'tag', value: 'core' },
    ]);
    expect(result['Room A']['Monday']).toHaveLength(1);
    expect(result['Room A']['Monday'][0].name).toBe('Math');
  });

  it('returns empty when combined filters match nothing', () => {
    const result = filterDataByActiveFilters(sampleScheduleData, [
      { type: 'name', value: 'Math' },
      { type: 'teacher', value: 'Carol' }, // Carol teaches Art, not Math
    ]);
    expect(Object.keys(result)).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// #74 — ServerApi mock infra
// ═══════════════════════════════════════════════════════════════════════════

describe('ServerApi mock (#74)', () => {
  it('resolves with handler result', async () => {
    const api = createMockServerApi({
      getData: () => ({ success: true, schedules: {} }),
    });
    const result = await api.call('getData');
    expect(result.success).toBe(true);
  });

  it('rejects for unmocked function', async () => {
    const api = createMockServerApi({});
    await expect(api.call('unknownFn')).rejects.toThrow('not mocked');
  });

  it('passes arguments to handler', async () => {
    const handler = vi.fn().mockReturnValue({ success: true });
    const api = createMockServerApi({ saveData: handler });
    await api.call('saveData', { id: 'schedule_1' }, 'ts');
    expect(handler).toHaveBeenCalledWith({ id: 'schedule_1' }, 'ts');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// #75 — Lock mechanism
// ═══════════════════════════════════════════════════════════════════════════

describe('Lock mechanism (#75)', () => {
  const TAB_A = 'tab-aaa';
  const TAB_B = 'tab-bbb';
  const SCHEDULE = 'schedule_1';

  it('acquires fresh lock', () => {
    const storage = createMockStorage();
    const lock = createLockManager(TAB_A, storage);
    expect(lock.acquireLock(SCHEDULE)).toBe(true);
    const locks = lock._getLocks();
    expect(locks[SCHEDULE].tabId).toBe(TAB_A);
  });

  it('allows same tab to re-acquire', () => {
    const storage = createMockStorage();
    const lock = createLockManager(TAB_A, storage);
    lock.acquireLock(SCHEDULE);
    expect(lock.acquireLock(SCHEDULE)).toBe(true);
  });

  it('rejects when other tab holds active lock', () => {
    const storage = createMockStorage();
    const now = 1000000;
    const lockA = createLockManager(TAB_A, storage, () => now);
    lockA.acquireLock(SCHEDULE);
    const lockB = createLockManager(TAB_B, storage, () => now + 5000); // 5s later
    expect(lockB.acquireLock(SCHEDULE)).toBe(false);
  });

  it('breaks stale lock (>15s)', () => {
    const storage = createMockStorage();
    const lockA = createLockManager(TAB_A, storage, () => 1000000);
    lockA.acquireLock(SCHEDULE);
    const lockB = createLockManager(TAB_B, storage, () => 1000000 + 16000); // 16s later
    expect(lockB.acquireLock(SCHEDULE)).toBe(true);
    expect(lockB._getLocks()[SCHEDULE].tabId).toBe(TAB_B);
  });

  it('releases own lock', () => {
    const storage = createMockStorage();
    const lock = createLockManager(TAB_A, storage);
    lock.acquireLock(SCHEDULE);
    lock.releaseLock(SCHEDULE);
    expect(lock._getLocks()[SCHEDULE]).toBeUndefined();
  });

  it('refuses to release other tab lock', () => {
    const storage = createMockStorage();
    const lockA = createLockManager(TAB_A, storage);
    lockA.acquireLock(SCHEDULE);
    const lockB = createLockManager(TAB_B, storage);
    lockB.releaseLock(SCHEDULE);
    expect(lockA._getLocks()[SCHEDULE].tabId).toBe(TAB_A); // Still held by A
  });

  it('heartbeat updates timestamp', () => {
    const storage = createMockStorage();
    let now = 1000000;
    const lock = createLockManager(TAB_A, storage, () => now);
    lock.acquireLock(SCHEDULE);
    const initialTs = lock._getLocks()[SCHEDULE].timestamp;

    now = 1005000;
    lock.refreshLockHeartbeat(SCHEDULE);
    expect(lock._getLocks()[SCHEDULE].timestamp).toBe(1005000);
    expect(lock._getLocks()[SCHEDULE].timestamp).not.toBe(initialTs);
  });

  it('heartbeat skips when read-only', () => {
    const storage = createMockStorage();
    const lock = createLockManager(TAB_A, storage, () => 1000000);
    lock.acquireLock(SCHEDULE);
    lock.refreshLockHeartbeat(SCHEDULE, true); // isReadOnly
    // Should not update (we verify by checking the original timestamp is unchanged)
    expect(lock._getLocks()[SCHEDULE].timestamp).toBe(1000000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// #76 — History undo/redo
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Creates a minimal history manager for testing.
 * Extracted from History.js.html L1-121, simplified to remove DOM/app dependencies.
 */
function createTestHistory(maxSize = 50) {
  let history = [];
  let historyIndex = -1;

  return {
    saveState(state) {
      const stateStr = JSON.stringify(state);
      if (history.length > 0 && JSON.stringify(history[historyIndex]) === stateStr) {
        return; // No duplicate
      }
      history = history.slice(0, historyIndex + 1);
      history.push(JSON.parse(stateStr)); // Deep clone via JSON
      historyIndex = history.length - 1;
      if (history.length > maxSize) {
        history.shift();
        historyIndex--;
      }
    },

    undo() {
      if (historyIndex > 0) {
        historyIndex--;
        return structuredClone(history[historyIndex]);
      }
      return null;
    },

    redo() {
      if (historyIndex < history.length - 1) {
        historyIndex++;
        return structuredClone(history[historyIndex]);
      }
      return null;
    },

    canUndo() { return historyIndex > 0; },
    canRedo() { return historyIndex < history.length - 1; },
    size() { return history.length; },
    currentIndex() { return historyIndex; },
  };
}

describe('History undo/redo (#76)', () => {
  it('starts empty, cannot undo or redo', () => {
    const h = createTestHistory();
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBeNull();
  });

  it('push → undo → redo cycle', () => {
    const h = createTestHistory();
    h.saveState({ v: 1 });
    h.saveState({ v: 2 });
    expect(h.canUndo()).toBe(true);
    expect(h.canRedo()).toBe(false);

    const undone = h.undo();
    expect(undone.v).toBe(1);
    expect(h.canRedo()).toBe(true);

    const redone = h.redo();
    expect(redone.v).toBe(2);
    expect(h.canRedo()).toBe(false);
  });

  it('push after undo truncates future', () => {
    const h = createTestHistory();
    h.saveState({ v: 1 });
    h.saveState({ v: 2 });
    h.saveState({ v: 3 });
    h.undo(); // back to v:2
    h.saveState({ v: 4 }); // branch off — v:3 discarded
    expect(h.canRedo()).toBe(false);
    expect(h.size()).toBe(3); // [v:1, v:2, v:4]
  });

  it('skips duplicate consecutive states', () => {
    const h = createTestHistory();
    h.saveState({ v: 1 });
    h.saveState({ v: 1 }); // duplicate
    expect(h.size()).toBe(1);
  });

  it('respects max size overflow', () => {
    const h = createTestHistory(3);
    h.saveState({ v: 1 });
    h.saveState({ v: 2 });
    h.saveState({ v: 3 });
    h.saveState({ v: 4 }); // overflow → oldest dropped
    expect(h.size()).toBe(3);
    // Earliest should now be v:2
    const s1 = h.undo(); // → v:3
    const s2 = h.undo(); // → v:2
    expect(s2.v).toBe(2);
    expect(h.canUndo()).toBe(false);
  });
});
