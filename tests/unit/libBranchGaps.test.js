/**
 * Branch coverage gap tests for tests/lib/ helpers (#107 P0).
 *
 * Targets the lowest-coverage branches in:
 * - undoRedoHelpers.js (71.42% branch → L33-36 default params)
 * - dataCollectionHelpers.js (92.06% branch → L58/77-78 null guards)
 * - scheduleListHelpers.js (96.66% branch → L59 lastModified falsy)
 */

import { describe, it, expect, vi } from 'vitest';
import { createTestableHistoryModule } from '../lib/undoRedoHelpers.js';
import {
  collectFromAllCourses,
  getGlobalAllTags,
  getGlobalAllCourseNames,
  getGlobalAllTeachers,
} from '../lib/dataCollectionHelpers.js';
import { renameSchedule } from '../lib/scheduleListHelpers.js';
import { makeScheduleListCtx, makeScheduleListDeps } from './scheduleListHelpers.fixtures.js';

// ═══════════════════════════════════════════════════════════════════
// undoRedoHelpers — default parameter branches (L33-36)
// ═══════════════════════════════════════════════════════════════════

describe('undoRedoHelpers — default parameter branches (#107)', () => {
  it('uses default no-op callbacks when optional opts are omitted', () => {
    // L33-36: onLoadState, onUpdateButtons, onCheckDirty, onUpdateCleanSnapshot
    // all default to () => {} when not provided
    let stateCounter = 0;
    const mod = createTestableHistoryModule({
      getCurrentState: () => {
        stateCounter++;
        return JSON.stringify({ v: stateCounter });
      },
      // Deliberately omit: onLoadState, onUpdateButtons, onCheckDirty, onUpdateCleanSnapshot
    });

    // saveState should work without optional callbacks
    mod.saveState();
    mod.saveState();
    expect(mod.getStack().length).toBe(2);
    expect(mod.getIndex()).toBe(1);

    // undo should work — onLoadState default is () => {} (no-op)
    mod.undo();
    expect(mod.getIndex()).toBe(0);

    // redo should work
    mod.redo();
    expect(mod.getIndex()).toBe(1);

    // resetHistory should work — onUpdateCleanSnapshot default is () => {}
    mod.resetHistory();
    // resetHistory captures current state as initial: stack = [currentState], index = 0
    expect(mod.getStack().length).toBe(1);
    expect(mod.getIndex()).toBe(0);
  });

  it('uses provided callbacks when all opts are given', () => {
    const loadCalls = [];
    const updateBtnCalls = [];
    const checkDirtyCalls = [];
    const updateSnapshotCalls = [];

    const mod = createTestableHistoryModule({
      getCurrentState: () => JSON.stringify({ v: 1 }),
      onLoadState: (state) => loadCalls.push(state),
      onUpdateButtons: () => updateBtnCalls.push(true),
      onCheckDirty: () => checkDirtyCalls.push(true),
      onUpdateCleanSnapshot: () => updateSnapshotCalls.push(true),
    });

    mod.saveState();
    // After saveState: onUpdateButtons + onCheckDirty called
    expect(updateBtnCalls.length).toBeGreaterThan(0);
    expect(checkDirtyCalls.length).toBeGreaterThan(0);

    mod.resetHistory();
    expect(updateSnapshotCalls.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// dataCollectionHelpers — null/missing data branches
// ═══════════════════════════════════════════════════════════════════

describe('dataCollectionHelpers — branch gaps (#107)', () => {
  // L58: schedule.data && schedule.data.scheduleData → false (missing data)
  it('collectFromAllCourses skips schedule without data property', () => {
    const schedules = {
      s1: { name: 'No Data' },  // missing .data entirely
      s2: { data: {} },          // .data exists but no .scheduleData
    };
    const result = collectFromAllCourses(schedules, (item, set) => {
      set.add(item.name);
    });
    expect(result).toEqual([]);
  });

  it('collectFromAllCourses handles null schedules', () => {
    expect(collectFromAllCourses(null, () => {})).toEqual([]);
  });

  // L77-78: classItem.tags && Array.isArray(classItem.tags) → false
  it('getGlobalAllTags skips courses without tags property', () => {
    const schedules = {
      s1: {
        data: {
          scheduleData: {
            'Room A': { 0: [{ name: 'Math' }] },  // no .tags
          },
        },
      },
    };
    expect(getGlobalAllTags(schedules)).toEqual([]);
  });

  it('getGlobalAllTags skips courses with non-array tags', () => {
    const schedules = {
      s1: {
        data: {
          scheduleData: {
            'Room A': { 0: [{ name: 'Math', tags: 'not-an-array' }] },
          },
        },
      },
    };
    expect(getGlobalAllTags(schedules)).toEqual([]);
  });

  // Verify normal flow still works
  it('getGlobalAllTags collects tags from valid courses', () => {
    const schedules = {
      s1: {
        data: {
          scheduleData: {
            'Room A': {
              0: [
                { name: 'Math', tags: ['algebra', 'core'] },
                { name: 'Art', tags: [] },
              ],
            },
          },
        },
      },
    };
    expect(getGlobalAllTags(schedules)).toEqual(['algebra', 'core']);
  });

  // L98: classItem.name falsy branch
  it('getGlobalAllCourseNames skips courses without name', () => {
    const schedules = {
      s1: {
        data: {
          scheduleData: {
            'Room A': { 0: [{ teacher: 'T1' }] },  // no .name
          },
        },
      },
    };
    expect(getGlobalAllCourseNames(schedules)).toEqual([]);
  });

  // L113: classItem.teacher falsy branch
  it('getGlobalAllTeachers skips courses without teacher', () => {
    const schedules = {
      s1: {
        data: {
          scheduleData: {
            'Room A': { 0: [{ name: 'Math' }] },  // no .teacher
          },
        },
      },
    };
    expect(getGlobalAllTeachers(schedules)).toEqual([]);
  });

  // collectFromAllCourses with null classroom entry
  it('collectFromAllCourses skips null classroom entries', () => {
    const schedules = {
      s1: {
        data: {
          scheduleData: {
            'Room A': null,  // L60: if (!classroom) return
            'Room B': { 0: [{ name: 'Art' }] },
          },
        },
      },
    };
    const result = collectFromAllCourses(schedules, (item, set) => {
      set.add(item.name);
    });
    expect(result).toEqual(['Art']);
  });

  // collectFromAllCourses with non-array day schedule
  it('collectFromAllCourses skips non-array day schedules', () => {
    const schedules = {
      s1: {
        data: {
          scheduleData: {
            'Room A': { 0: 'not-an-array', 1: [{ name: 'Science' }] },
          },
        },
      },
    };
    const result = collectFromAllCourses(schedules, (item, set) => {
      set.add(item.name);
    });
    expect(result).toEqual(['Science']);
  });
});

// ═══════════════════════════════════════════════════════════════════
// scheduleListHelpers — L59 lastModified falsy branch
// ═══════════════════════════════════════════════════════════════════

describe('scheduleListHelpers — branch gaps (#107)', () => {
  it('renameSchedule does not update scheduleLastModified when backend omits lastModified', async () => {
    const ctx = makeScheduleListCtx();
    const originalTimestamp = ctx.scheduleLastModified.schedule_1;

    // Override ServerApi to return result WITHOUT lastModified
    const deps = makeScheduleListDeps({
      updateScheduleMetadata: () => ({
        success: true,
        newMetadataTimestamp: '2024-01-01T00:02:00.000Z',
        // lastModified deliberately omitted → L59 branch false
      }),
    });
    deps.modals.showScheduleEditor.mockResolvedValue({ name: '新名稱', isDraft: false });

    await renameSchedule('schedule_1', ctx, deps);

    // Name should be updated
    expect(ctx.schedules.schedule_1.name).toBe('新名稱');
    // But scheduleLastModified should NOT have been updated (L59 branch false)
    expect(ctx.scheduleLastModified.schedule_1).toBe(originalTimestamp);
  });
});

// ═══════════════════════════════════════════════════════════════════
// appLifecycleHelpers — branch gap coverage (#107 P1)
// ═══════════════════════════════════════════════════════════════════

import { resolveScheduleLoad, resolveDropAction } from '../lib/appLifecycleHelpers.js';

describe('appLifecycleHelpers — branch gaps (#107 P1)', () => {
  // L58: Object.keys(schedules)[0] || null — when schedules is empty
  it('resolveScheduleLoad falls back to null when schedule not found and no other schedules exist', () => {
    const result = resolveScheduleLoad('missing_id', {}, 'ALL', () => true);
    expect(result.scheduleId).toBeNull();
    expect(result.isReadOnly).toBe(true);
    expect(result.error).toContain('missing_id');
  });

  // L77: data.classrooms || [] — when classrooms is undefined
  it('resolveScheduleLoad defaults classrooms to [] when schedule.data has no classrooms', () => {
    const schedules = {
      s1: { data: { scheduleData: { room: {} } } }, // no classrooms key
    };
    const result = resolveScheduleLoad('s1', schedules, 'ALL', () => true);
    expect(result.classrooms).toEqual([]);
    expect(result.needsRepair).toBe(false);
  });

  // L78: data.scheduleData || {} — when scheduleData is undefined
  it('resolveScheduleLoad defaults scheduleData to {} when schedule.data has no scheduleData', () => {
    const schedules = {
      s1: { data: { classrooms: ['A'] } }, // no scheduleData key
    };
    const result = resolveScheduleLoad('s1', schedules, 'ALL', () => true);
    expect(result.scheduleData).toEqual({});
    expect(result.classrooms).toEqual(['A']);
  });

  // L188: scheduleData[fromClassroom]?.[fromDay] || [] — fromClassroom missing
  it('resolveDropAction returns not-found when fromClassroom does not exist', () => {
    const scheduleData = {};
    const result = resolveDropAction(scheduleData, {
      fromClassroom: 'nonexistent', fromDay: '0',
      toClassroom: 'Room B', toDay: '1',
      classId: 'c1', newIndex: 0,
    }, () => 0);
    expect(result.moved).toBe(false);
    expect(result.error).toBe('Item not found in data model');
  });

  // L197: newData[fromClassroom]?.[fromDay] || [] — deep clone splice fallback
  it('resolveDropAction moves item between classrooms successfully', () => {
    const scheduleData = {
      'Room A': { '0': [{ id: 'c1', name: 'Math' }] },
    };
    const result = resolveDropAction(scheduleData, {
      fromClassroom: 'Room A', fromDay: '0',
      toClassroom: 'Room B', toDay: '1',
      classId: 'c1', newIndex: 0,
    }, () => 0);
    expect(result.moved).toBe(true);
    expect(result.scheduleData['Room B']['1'][0].name).toBe('Math');
    expect(result.scheduleData['Room A']['0']).toBeUndefined(); // cleaned up L205
  });
});

// ═══════════════════════════════════════════════════════════════════
// interactionHelpers — branch gap coverage (#107 P1)
// ═══════════════════════════════════════════════════════════════════

import { applyDrop, applyNameRename, applyTeacherRename } from '../lib/interactionHelpers.js';

describe('interactionHelpers — branch gaps (#107 P1)', () => {
  // L30: scheduleData[fromClassroom]?.[fromDay] || [] — null classroom
  it('applyDrop returns item-not-found when fromClassroom is missing from scheduleData', () => {
    const scheduleData = {};
    const result = applyDrop(scheduleData, {
      fromClassroom: 'nonexistent', fromDay: '0',
      toClassroom: 'Room B', toDay: '1',
      classId: 'c1', newIndex: 0,
    });
    expect(result.success).toBe(false);
    expect(result.reason).toBe('item-not-found');
  });

  // L74-76: null classroom + non-array daySchedule in applyNameRename
  it('applyNameRename skips null classrooms and non-array day schedules', () => {
    const scheduleData = {
      'Room A': null,
      'Room B': { '0': 'not-an-array', '1': [{ name: 'old', teacher: 'T' }] },
    };
    const count = applyNameRename(scheduleData, 'old', 'new', []);
    expect(count).toBe(1);
    expect(scheduleData['Room B']['1'][0].name).toBe('new');
  });

  // L111-113: null classroom + non-array daySchedule in applyTeacherRename
  it('applyTeacherRename skips null classrooms and non-array day schedules', () => {
    const scheduleData = {
      'Room A': null,
      'Room B': { '0': 'not-an-array', '1': [{ name: 'Math', teacher: 'old' }] },
    };
    const count = applyTeacherRename(scheduleData, 'Math', 'old', 'new');
    expect(count).toBe(1);
    expect(scheduleData['Room B']['1'][0].teacher).toBe('new');
  });
});
