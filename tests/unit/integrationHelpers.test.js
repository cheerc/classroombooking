/**
 * Factory contract + integration chain tests.
 * Ref: #93 — Module factory contracts + cross-module integration chains.
 *
 * Strategy:
 * 1. Contract tests verify expected method lists (catches silent renames)
 * 2. Integration chain tests verify cross-module data flow patterns
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  FACTORY_CONTRACTS,
  simulateEditChain,
  simulateUndoChain,
  simulateSwitchChain,
} from '../lib/integrationHelpers.js';

// ── Helper: read source and extract method names from factory return ──

function extractFactoryMethods(filename) {
  const src = readFileSync(
    resolve(import.meta.dirname, `../../${filename}`),
    'utf-8'
  );

  // Match patterns like `methodName: function` or `methodName: async function`
  // Also match property-only patterns like `clickTimer: null`
  const methodPattern = /^\s{4}(\w+)\s*:/gm;
  const methods = new Set();
  let match;
  while ((match = methodPattern.exec(src)) !== null) {
    methods.add(match[1]);
  }
  return [...methods];
}

// ═══════════════════════════════════════════════════════════════════
// Factory Contract Tests — verify returned object shape
// ═══════════════════════════════════════════════════════════════════

describe('Factory contract: createHistoryModule (#93)', () => {
  const actualMethods = extractFactoryMethods('History.js.html');

  it('exports all expected public methods', () => {
    for (const method of FACTORY_CONTRACTS.history) {
      expect(actualMethods, `Missing method: ${method}`).toContain(method);
    }
  });

  it('has no unexpected methods (detect untracked additions)', () => {
    for (const method of actualMethods) {
      expect(FACTORY_CONTRACTS.history, `Untracked method in History: ${method}`).toContain(method);
    }
  });
});

describe('Factory contract: createInteractionModule (#93)', () => {
  const actualMethods = extractFactoryMethods('Interaction.js.html');

  it('exports all expected public methods', () => {
    for (const method of FACTORY_CONTRACTS.interaction) {
      expect(actualMethods, `Missing method: ${method}`).toContain(method);
    }
  });

  it('has no unexpected methods (detect untracked additions)', () => {
    for (const method of actualMethods) {
      expect(FACTORY_CONTRACTS.interaction, `Untracked method in Interaction: ${method}`).toContain(method);
    }
  });
});

describe('Factory contract: createUIModule (#93)', () => {
  const actualMethods = extractFactoryMethods('UI.js.html');

  it('exports all expected public methods', () => {
    for (const method of FACTORY_CONTRACTS.ui) {
      expect(actualMethods, `Missing method: ${method}`).toContain(method);
    }
  });

  it('has no unexpected methods (detect untracked additions)', () => {
    for (const method of actualMethods) {
      expect(FACTORY_CONTRACTS.ui, `Untracked method in UI: ${method}`).toContain(method);
    }
  });
});

describe('Factory contract: createModalModule (#93)', () => {
  const actualMethods = extractFactoryMethods('Modals.js.html');

  it('exports all expected public methods', () => {
    for (const method of FACTORY_CONTRACTS.modals) {
      expect(actualMethods, `Missing method: ${method}`).toContain(method);
    }
  });

  it('has no unexpected methods (detect untracked additions)', () => {
    for (const method of actualMethods) {
      expect(FACTORY_CONTRACTS.modals, `Untracked method in Modals: ${method}`).toContain(method);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// Integration Chain Tests — cross-module data flow
// ═══════════════════════════════════════════════════════════════════

describe('Edit chain (#93)', () => {
  it('adds new course to correct position (add mode)', () => {
    const appState = {
      scheduleData: {
        'Room A': { 0: [{ id: '1', name: 'Math', timeStart: '08:00', timeEnd: '09:00' }] },
      },
      isDirty: false,
    };

    const result = simulateEditChain(appState, {
      classroom: 'Room A',
      day: 0,
      item: { id: '2', name: 'English', timeStart: '10:00', timeEnd: '11:00' },
    }, { isNew: true });

    expect(result.isDirty).toBe(true);
    expect(result.historySaved).toBe(true);
    expect(result.scheduleData['Room A'][0]).toHaveLength(2);
    // Sorted by time: Math (08:00) first, English (10:00) second
    expect(result.scheduleData['Room A'][0][0].name).toBe('Math');
    expect(result.scheduleData['Room A'][0][1].name).toBe('English');
  });

  it('inserts new course before existing when earlier start time', () => {
    const appState = {
      scheduleData: {
        'Room A': { 0: [{ id: '1', name: 'Math', timeStart: '10:00', timeEnd: '11:00' }] },
      },
      isDirty: false,
    };

    const result = simulateEditChain(appState, {
      classroom: 'Room A',
      day: 0,
      item: { id: '2', name: 'Early', timeStart: '07:00', timeEnd: '08:00' },
    }, { isNew: true });

    // Early (07:00) should be first
    expect(result.scheduleData['Room A'][0][0].name).toBe('Early');
  });

  it('updates existing course in-place (edit mode)', () => {
    const appState = {
      scheduleData: {
        'Room A': { 0: [
          { id: '1', name: 'Math', timeStart: '08:00', teacher: 'Alice' },
        ]},
      },
      isDirty: false,
    };

    const result = simulateEditChain(appState, {
      classroom: 'Room A',
      day: 0,
      item: { id: '1', name: 'Mathematics', teacher: 'Dr. Alice' },
    }, { isNew: false });

    expect(result.isDirty).toBe(true);
    expect(result.scheduleData['Room A'][0][0].name).toBe('Mathematics');
    expect(result.scheduleData['Room A'][0][0].teacher).toBe('Dr. Alice');
  });

  it('creates classroom/day structure if missing', () => {
    const appState = { scheduleData: {}, isDirty: false };

    const result = simulateEditChain(appState, {
      classroom: 'New Room',
      day: 3,
      item: { id: '1', name: 'Art', timeStart: '14:00', timeEnd: '15:00' },
    }, { isNew: true });

    expect(result.scheduleData['New Room']).toBeDefined();
    expect(result.scheduleData['New Room'][3]).toHaveLength(1);
  });
});

describe('Undo chain (#93)', () => {
  it('restores previous state on undo', () => {
    const states = [
      { classrooms: ['A'], scheduleData: { A: { 0: [] } }, tags: [] },
      { classrooms: ['A', 'B'], scheduleData: { A: { 0: [{ id: '1' }] } }, tags: ['core'] },
    ];

    const result = simulateUndoChain(states, 1);
    expect(result.newIndex).toBe(0);
    expect(result.newState.classrooms).toEqual(['A']);
    expect(result.newState.tags).toEqual([]);
  });

  it('returns null state when at beginning of history', () => {
    const states = [{ classrooms: [], scheduleData: {}, tags: [] }];
    const result = simulateUndoChain(states, 0);
    expect(result.newState).toBeNull();
    expect(result.newIndex).toBe(0);
  });

  it('returns deep clone (mutations do not affect history)', () => {
    const states = [
      { classrooms: ['A'], scheduleData: {}, tags: ['t1'] },
      { classrooms: ['A', 'B'], scheduleData: {}, tags: ['t1', 't2'] },
    ];

    const result = simulateUndoChain(states, 1);
    result.newState.classrooms.push('MUTATED');
    // Original history entry should be unaffected
    expect(states[0].classrooms).toEqual(['A']);
  });

  it('marks dirty=false when returning to initial state', () => {
    const states = [
      { classrooms: [], scheduleData: {}, tags: [] },
      { classrooms: ['A'], scheduleData: {}, tags: [] },
    ];

    const result = simulateUndoChain(states, 1);
    expect(result.isDirty).toBe(false); // back to index 0 = initial
  });
});

describe('Switch chain (#93)', () => {
  const schedules = {
    'sched_1': {
      name: 'Schedule 1',
      data: {
        scheduleData: { 'Room A': { 0: [{ id: '1', name: 'Math' }] } },
        classrooms: ['Room A'],
        tags: ['core'],
      },
    },
    'sched_2': {
      name: 'Schedule 2',
      data: {
        scheduleData: {},
        classrooms: ['Room X'],
        tags: [],
      },
    },
  };

  it('loads target schedule data on switch', () => {
    const result = simulateSwitchChain(schedules, 'sched_2', 'sched_1');
    expect(result.success).toBe(true);
    expect(result.activeScheduleId).toBe('sched_2');
    expect(result.classrooms).toEqual(['Room X']);
    expect(result.historyReset).toBe(true);
  });

  it('returns same-schedule when switching to current', () => {
    const result = simulateSwitchChain(schedules, 'sched_1', 'sched_1');
    expect(result.success).toBe(true);
    expect(result.reason).toBe('same-schedule');
    expect(result.historyReset).toBe(false);
  });

  it('returns not-found for non-existent schedule', () => {
    const result = simulateSwitchChain(schedules, 'sched_999', 'sched_1');
    expect(result.success).toBe(false);
    expect(result.reason).toBe('not-found');
    expect(result.activeScheduleId).toBe('sched_1'); // stays on current
  });

  it('deep clones schedule data (mutations isolated)', () => {
    const result = simulateSwitchChain(schedules, 'sched_1', 'sched_2');
    result.scheduleData['Room A'][0].push({ id: 'mutated' });
    // Original should be unaffected
    expect(schedules['sched_1'].data.scheduleData['Room A'][0]).toHaveLength(1);
  });
});
