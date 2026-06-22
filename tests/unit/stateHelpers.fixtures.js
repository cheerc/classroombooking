// Shared test fixtures and factory functions for stateHelpers tests.
// Extracted during REFACTOR turn to deduplicate across SPEC/GAP test files.
import { vi } from 'vitest';

// ── AppConfig constant ───────────────────────────────────────────
export const APP_CONFIG = { MODES: { DAY: 'day', WEEK: 'week' } };

// ── timeToMinutes helper (matching production logic) ─────────────
export function timeToMinutes(timeStr) {
  try {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  } catch {
    return 0;
  }
}

// ── scheduleData fixture ─────────────────────────────────────────
export function makeScheduleData() {
  return {
    'Room A': {
      0: [
        { id: '1', name: 'Math', teacher: 'Alice', tags: ['core'] },
        { id: '2', name: 'English', teacher: 'Bob', tags: ['elective'] },
      ],
      1: [
        { id: '3', name: 'Math', teacher: 'Alice', tags: ['core'] },
      ],
    },
    'Room B': {
      0: [
        { id: '4', name: 'Art', teacher: 'Carol', tags: ['elective'] },
      ],
    },
  };
}

// ── handleEditClassroom context factory ──────────────────────────
export function makeEditCtx(overrides = {}) {
  return {
    classrooms: overrides.classrooms ?? ['Room A', 'Room B', 'Room C'],
    scheduleData: overrides.scheduleData ?? {
      'Room A': { 0: [{ id: '1', name: 'Math' }] },
      'Room B': { 0: [{ id: '2', name: 'Art' }] },
    },
    ui: {
      showNotification: overrides.showNotification ?? vi.fn(),
      updateClassroomList: overrides.updateClassroomList ?? vi.fn(),
      renderScheduleTable: overrides.renderScheduleTable ?? vi.fn(),
    },
    saveDataToLocal: overrides.saveDataToLocal ?? vi.fn(),
    historyModule: {
      saveState: overrides.saveState ?? vi.fn(),
    },
  };
}

// ── findNextUpcomingClasses context factory ───────────────────────
export function makeFindCtx(overrides = {}) {
  return {
    nextUpcomingClassIds: overrides.nextUpcomingClassIds ?? new Set(),
    currentViewMode: overrides.currentViewMode ?? 'day',
    currentDayIndex: overrides.currentDayIndex ?? 0,
    scheduleData: overrides.scheduleData ?? {},
    timeToMinutes: overrides.timeToMinutes ?? timeToMinutes,
  };
}

// ── saveDataToServer context factory ─────────────────────────────
export function makeSaveCtx(overrides = {}) {
  return {
    isConnecting: overrides.isConnecting ?? false,
    activeScheduleId: overrides.activeScheduleId ?? 'sched-1',
    scheduleLastModified: overrides.scheduleLastModified ?? { 'sched-1': '2026-01-01T00:00:00Z' },
    classrooms: overrides.classrooms ?? ['Room A'],
    scheduleData: overrides.scheduleData ?? { 'Room A': { 0: [] } },
    tags: overrides.tags ?? ['tag1'],
    lastSyncTime: overrides.lastSyncTime ?? null,
    ui: {
      manageLoadingState: overrides.manageLoadingState ?? vi.fn(),
    },
    historyModule: {
      updateCleanSnapshot: overrides.updateCleanSnapshot ?? vi.fn(),
      checkDirty: overrides.checkDirty ?? vi.fn(),
    },
    modals: {
      showConfirm: overrides.showConfirm ?? vi.fn(),
    },
  };
}
