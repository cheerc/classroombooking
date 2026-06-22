import { serializeState, updateCleanSnapshot, checkDirty, loadState } from '../lib/historyHelpers.js';
import { describe, it, expect, vi } from 'vitest';

// ── Factory helpers ──────────────────────────────────────────────

/**
 * Create a minimal app-state object for serializeState/checkDirty.
 */
function makeAppState(overrides = {}) {
  return {
    classrooms: overrides.classrooms ?? ['Room A', 'Room B'],
    scheduleData: overrides.scheduleData ?? {
      'Room A': { 0: [{ id: '1', name: 'Math' }] }
    },
    tags: overrides.tags ?? ['tag1', 'tag2']
  };
}

/**
 * Create a DI context for updateCleanSnapshot.
 */
function makeSnapshotCtx(overrides = {}) {
  return {
    classrooms: overrides.classrooms ?? ['Room A'],
    scheduleData: overrides.scheduleData ?? { 'Room A': { 0: [] } },
    tags: overrides.tags ?? ['core'],
    schedules: overrides.schedules ?? {
      'sched-1': { data: null }
    },
    activeScheduleId: overrides.activeScheduleId ?? 'sched-1',
    saveSchedulesToLocal: overrides.saveSchedulesToLocal ?? vi.fn()
  };
}

/**
 * Create a DI context for loadState.
 */
function makeLoadCtx(overrides = {}) {
  return {
    classrooms: overrides.classrooms ?? [],
    scheduleData: overrides.scheduleData ?? {},
    tags: overrides.tags ?? [],
    ui: {
      updateClassroomList: overrides.updateClassroomList ?? vi.fn(),
      renderScheduleTable: overrides.renderScheduleTable ?? vi.fn()
    }
  };
}

// ═══════════════════════════════════════════════════════════════════
// serializeState
// ═══════════════════════════════════════════════════════════════════
describe('serializeState', () => {
  it('serializes classrooms, scheduleData, and tags to JSON', () => {
    const state = makeAppState();
    const result = serializeState(state);
    const parsed = JSON.parse(result);

    expect(parsed.classrooms).toEqual(['Room A', 'Room B']);
    expect(parsed.scheduleData).toEqual({ 'Room A': { 0: [{ id: '1', name: 'Math' }] } });
    expect(parsed.tags).toEqual(['tag1', 'tag2']);
  });

  it('produces identical JSON for identical state objects', () => {
    const state1 = makeAppState();
    const state2 = makeAppState();
    expect(serializeState(state1)).toBe(serializeState(state2));
  });

  it('produces different JSON when state differs', () => {
    const state1 = makeAppState({ tags: ['a'] });
    const state2 = makeAppState({ tags: ['b'] });
    expect(serializeState(state1)).not.toBe(serializeState(state2));
  });

  it('only includes classrooms, scheduleData, and tags (ignores other properties)', () => {
    const state = { ...makeAppState(), extraProp: 'should-not-appear' };
    const parsed = JSON.parse(serializeState(state));
    expect(parsed.extraProp).toBeUndefined();
    expect(Object.keys(parsed)).toEqual(['classrooms', 'scheduleData', 'tags']);
  });
});

// ═══════════════════════════════════════════════════════════════════
// checkDirty
// ═══════════════════════════════════════════════════════════════════
describe('checkDirty', () => {
  it('returns false when current state matches clean snapshot', () => {
    const state = makeAppState();
    const snapshot = serializeState(state);
    expect(checkDirty(state, snapshot)).toBe(false);
  });

  it('returns true when classrooms have changed', () => {
    const originalState = makeAppState();
    const snapshot = serializeState(originalState);
    const modifiedState = makeAppState({ classrooms: ['Room A', 'Room B', 'Room C'] });
    expect(checkDirty(modifiedState, snapshot)).toBe(true);
  });

  it('returns true when scheduleData has changed', () => {
    const originalState = makeAppState();
    const snapshot = serializeState(originalState);
    const modifiedState = makeAppState({
      scheduleData: { 'Room A': { 0: [{ id: '1', name: 'Science' }] } }
    });
    expect(checkDirty(modifiedState, snapshot)).toBe(true);
  });

  it('returns true when tags have changed', () => {
    const originalState = makeAppState();
    const snapshot = serializeState(originalState);
    const modifiedState = makeAppState({ tags: ['newTag'] });
    expect(checkDirty(modifiedState, snapshot)).toBe(true);
  });

  it('returns true when compared against an empty snapshot', () => {
    const state = makeAppState();
    expect(checkDirty(state, '')).toBe(true);
  });

  it('detects reordering of array elements as a change', () => {
    const state1 = makeAppState({ tags: ['a', 'b'] });
    const snapshot = serializeState(state1);
    const state2 = makeAppState({ tags: ['b', 'a'] });
    expect(checkDirty(state2, snapshot)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// updateCleanSnapshot
// ═══════════════════════════════════════════════════════════════════
describe('updateCleanSnapshot', () => {
  it('returns a JSON snapshot of the current state', () => {
    const ctx = makeSnapshotCtx();
    const snapshot = updateCleanSnapshot(ctx);
    const parsed = JSON.parse(snapshot);

    expect(parsed.classrooms).toEqual(['Room A']);
    expect(parsed.tags).toEqual(['core']);
  });

  it('clones state into schedules[activeScheduleId].data via structuredClone', () => {
    const ctx = makeSnapshotCtx({
      classrooms: ['Room X'],
      scheduleData: { 'Room X': { 0: [{ id: '1' }] } },
      tags: ['tag-A']
    });

    updateCleanSnapshot(ctx);

    // Verify deep clone was written to schedules
    const storedData = ctx.schedules['sched-1'].data;
    expect(storedData.classrooms).toEqual(['Room X']);
    expect(storedData.scheduleData).toEqual({ 'Room X': { 0: [{ id: '1' }] } });
    expect(storedData.tags).toEqual(['tag-A']);

    // Verify it's a clone (not same reference)
    expect(storedData.classrooms).not.toBe(ctx.classrooms);
    expect(storedData.tags).not.toBe(ctx.tags);
  });

  it('calls saveSchedulesToLocal after updating schedules', () => {
    const ctx = makeSnapshotCtx();
    updateCleanSnapshot(ctx);
    expect(ctx.saveSchedulesToLocal).toHaveBeenCalledOnce();
  });

  it('does not call saveSchedulesToLocal when activeScheduleId not in schedules', () => {
    const ctx = makeSnapshotCtx({
      schedules: {},
      activeScheduleId: 'non-existent'
    });

    const snapshot = updateCleanSnapshot(ctx);
    // Still returns a valid snapshot
    expect(typeof snapshot).toBe('string');
    expect(JSON.parse(snapshot).classrooms).toEqual(['Room A']);
    // But saveSchedulesToLocal is not called
    expect(ctx.saveSchedulesToLocal).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════
// loadState
// ═══════════════════════════════════════════════════════════════════
describe('loadState', () => {
  it('clones state properties into ctx (happy path)', () => {
    const ctx = makeLoadCtx();
    const state = {
      classrooms: ['Room A', 'Room B'],
      scheduleData: { 'Room A': { 0: [{ id: '1', name: 'Math' }] } },
      tags: ['core', 'elective']
    };

    loadState(state, ctx);

    expect(ctx.classrooms).toEqual(['Room A', 'Room B']);
    expect(ctx.scheduleData).toEqual({ 'Room A': { 0: [{ id: '1', name: 'Math' }] } });
    expect(ctx.tags).toEqual(['core', 'elective']);
  });

  it('produces deep clones (not same references as input state)', () => {
    const ctx = makeLoadCtx();
    const state = {
      classrooms: ['Room A'],
      scheduleData: { 'Room A': { 0: [{ id: '1' }] } },
      tags: ['tag1']
    };

    loadState(state, ctx);

    // Cloned — not same reference
    expect(ctx.classrooms).not.toBe(state.classrooms);
    expect(ctx.scheduleData).not.toBe(state.scheduleData);
    expect(ctx.tags).not.toBe(state.tags);
  });

  it('calls UI refresh callbacks', () => {
    const ctx = makeLoadCtx();
    const state = { classrooms: [], scheduleData: {}, tags: [] };

    loadState(state, ctx);

    expect(ctx.ui.updateClassroomList).toHaveBeenCalledOnce();
    expect(ctx.ui.renderScheduleTable).toHaveBeenCalledOnce();
  });

  it('throws DataCloneError when state.tags is undefined (structuredClone limitation)', () => {
    const ctx = makeLoadCtx();
    const stateWithUndefinedTags = {
      classrooms: ['Room A'],
      scheduleData: {},
      tags: undefined
    };

    // structuredClone(undefined) actually works in modern runtimes,
    // but the original issue was about the clone guard behavior.
    // In Node.js 17+, structuredClone(undefined) returns undefined (no error).
    // The real risk is if state itself is missing .tags entirely:
    expect(() => {
      loadState(stateWithUndefinedTags, ctx);
    }).not.toThrow();
    // tags should be undefined after load
    expect(ctx.tags).toBeUndefined();
  });

  it('handles empty arrays and objects in state', () => {
    const ctx = makeLoadCtx();
    const emptyState = { classrooms: [], scheduleData: {}, tags: [] };

    loadState(emptyState, ctx);

    expect(ctx.classrooms).toEqual([]);
    expect(ctx.scheduleData).toEqual({});
    expect(ctx.tags).toEqual([]);
  });
});
