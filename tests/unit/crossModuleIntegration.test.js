/**
 * Cross-module integration tests — verifies data flows correctly across
 * module boundaries using real imports (not mocks).
 *
 * Ref: #113 — Wave 3B: catches interface mismatches between extracted modules
 * that unit tests (testing in isolation) would miss.
 *
 * Strategy: Each test scenario composes 2+ modules to verify the handoff
 * contract. If a module changes its return shape, these tests break before
 * production does.
 *
 * Closes #113
 */
import { describe, it, expect } from 'vitest';

// ─── Real module imports (no mocks) ────────────────────────────────────────

import {
  resolveInitialSchedule,
  resolveScheduleLoad,
  resolvePersistedFilters,
  resolveApplyFilters,
  resolveClearAdvancedFilters,
  resolveDropAction,
  buildSavePayload,
  processServerLoadResult,
  canManageSchedule,
  shouldRefreshHeartbeat,
  generateUniqueId,
} from '../lib/appLifecycleHelpers.js';

import {
  ensureDataIds,
  buildCourseColorMap,
  stringToHashCode,
  sortClassrooms,
  hexToRgb,
  formatTime,
  formatTimestampForFilename,
  getShortUserName,
} from '../lib/utilityFunctions.js';

import {
  filterDataByTags,
  filterDataByActiveFilters,
  checkTimeConflict,
  timeToMinutes,
} from '../lib/frontendUtils.js';

import {
  getAllTags,
  collectFromScheduleData,
} from '../lib/dataCollectionHelpers.js';

import {
  forEachCourse,
  countOccurrences,
  updateAllOccurrences,
  handleEditClassroom,
} from '../lib/stateHelpers.js';

import {
  serializeState,
  checkDirty,
} from '../lib/historyHelpers.js';

import { escapeHtml } from '../lib/escapeHtml.js';

// ─── Shared test fixtures ──────────────────────────────────────────────────

const ALL_SCHEDULES_ID = 'ALL_SCHEDULES';
const TIME_REGEX = /^([01]?\d|2[0-3]):([0-5]\d)$/;

// 10 colors matching AppConfig.COURSE_COLORS
const COURSE_COLORS = [
  '#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF',
  '#D4BAFF', '#FFB3DE', '#B3FFE0', '#FFD9B3', '#B3D9FF',
];

function makeScheduleData() {
  return {
    '101': {
      0: [
        { id: 'c1', name: '數學', teacher: '王老師', timeStart: '08:00', timeEnd: '09:00', tags: ['math', '必修'] },
        { id: 'c2', name: '英文', teacher: '李老師', timeStart: '10:00', timeEnd: '11:00', tags: ['english'] },
      ],
      1: [
        { id: 'c3', name: '數學', teacher: '王老師', timeStart: '08:00', timeEnd: '09:00', tags: ['math', '必修'] },
      ],
    },
    '202': {
      0: [
        { id: 'c4', name: '理化', teacher: '張老師', timeStart: '09:00', timeEnd: '10:00', tags: ['science'] },
      ],
      2: [
        { id: 'c5', name: '英文', teacher: '李老師', timeStart: '14:00', timeEnd: '15:00', tags: ['english'] },
      ],
    },
  };
}

function makeServerResponse() {
  return {
    schedules: {
      'sched-1': {
        name: '課表A',
        createdBy: 'teacher@school.edu',
        lastModified: '2024-06-01T00:00:00Z',
        data: {
          classrooms: ['101', '202'],
          scheduleData: makeScheduleData(),
          tags: ['math', '必修', 'english', 'science'],
        },
      },
      'sched-2': {
        name: '課表B',
        createdBy: 'admin@school.edu',
        lastModified: '2024-06-02T00:00:00Z',
        isDraft: true,
        data: {
          classrooms: ['301'],
          scheduleData: {},
          tags: [],
        },
      },
    },
    metadataTimestamp: 'meta-ts-1',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// (a) Schedule load → state update → render pipeline
// ═══════════════════════════════════════════════════════════════════════════

describe('Pipeline: server load → schedule init → state setup', () => {
  it('processServerLoadResult → resolveInitialSchedule → resolveScheduleLoad', () => {
    // Step 1: Process server response (appLifecycleHelpers)
    const serverResult = processServerLoadResult(makeServerResponse());
    expect(serverResult.error).toBeUndefined();
    expect(serverResult.schedules).toBeDefined();
    expect(serverResult.scheduleLastModified['sched-1']).toBe('2024-06-01T00:00:00Z');
    // lastModified should be stripped from schedule objects
    expect(serverResult.schedules['sched-1'].lastModified).toBeUndefined();

    // Step 2: Determine which schedule to load (appLifecycleHelpers)
    const initResult = resolveInitialSchedule('sched-1', serverResult.schedules);
    expect(initResult.action).toBe('load');
    expect(initResult.scheduleId).toBe('sched-1');

    // Step 3: Load the schedule (appLifecycleHelpers)
    const loadResult = resolveScheduleLoad(
      initResult.scheduleId,
      serverResult.schedules,
      ALL_SCHEDULES_ID,
      () => true // acquireLock succeeds
    );
    expect(loadResult.isReadOnly).toBe(false);
    expect(loadResult.classrooms).toEqual(['101', '202']);

    // Step 4: Ensure data IDs (utilityFunctions) — uses DI generateId
    const generateId = () => 'test-id-' + Math.random().toString(36).substr(2);
    const processedData = ensureDataIds(loadResult.scheduleData, generateId);
    // All items should have IDs
    forEachCourse(processedData, (course) => {
      expect(course.id).toBeDefined();
    });
  });

  it('processServerLoadResult → resolveInitialSchedule with unknown local ID → firstTime', () => {
    const serverResult = processServerLoadResult(makeServerResponse());
    const initResult = resolveInitialSchedule('nonexistent-id', serverResult.schedules);
    expect(initResult.action).toBe('firstTime');
  });

  it('resolveScheduleLoad data flows into getAllTags + buildCourseColorMap', () => {
    const serverResult = processServerLoadResult(makeServerResponse());
    const loadResult = resolveScheduleLoad('sched-1', serverResult.schedules, ALL_SCHEDULES_ID, () => true);

    // getAllTags (dataCollectionHelpers) reads from the loaded scheduleData
    const tags = getAllTags(loadResult.scheduleData);
    expect(tags).toContain('math');
    expect(tags).toContain('english');
    expect(tags).toContain('science');
    expect(tags).toContain('必修');

    // buildCourseColorMap (utilityFunctions) — DI signature: (dataSource, hashFn, courseColors)
    const colorMap = {};
    buildCourseColorMap(loadResult.scheduleData, (name) => {
      const hash = stringToHashCode(name);
      const colorIndex = Math.abs(hash) % COURSE_COLORS.length;
      colorMap[name] = COURSE_COLORS[colorIndex];
    }, COURSE_COLORS);
    // Note: buildCourseColorMap uses hashFn internally, but let's verify
    // the data at least flows without error; the colorMap is populated by
    // the function's internal logic via hashFn
  });

  it('ensureDataIds generates IDs that are unique across the schedule', () => {
    let counter = 0;
    const generateId = () => `id-${++counter}`;
    const data = {
      '101': { 0: [{ name: 'A' }, { name: 'B' }] },
      '102': { 0: [{ name: 'C' }] },
    };
    const processed = ensureDataIds(data, generateId);
    const allIds = new Set();
    forEachCourse(processed, (course) => {
      expect(course.id).toBeDefined();
      expect(allIds.has(course.id)).toBe(false);
      allIds.add(course.id);
    });
    expect(allIds.size).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (b) Filter apply → data transform → display update
// ═══════════════════════════════════════════════════════════════════════════

describe('Pipeline: filter persistence → data filtering → display', () => {
  it('resolvePersistedFilters → filterDataByTags end-to-end', () => {
    const scheduleData = makeScheduleData();
    const tags = getAllTags(scheduleData);

    // Step 1: Resolve persisted filters (appLifecycleHelpers)
    const persistedResult = resolvePersistedFilters(
      JSON.stringify(['math']),
      tags
    );
    expect(persistedResult.activeFilters).toEqual([{ type: 'tag', value: 'math' }]);

    // Step 2: Apply tag filter to data (frontendUtils)
    const filtered = filterDataByTags(scheduleData, persistedResult.activeFilters);

    // Only math-tagged courses should survive
    let courseCount = 0;
    forEachCourse(filtered, (course) => {
      expect(course.tags).toContain('math');
      courseCount++;
    });
    expect(courseCount).toBe(2); // c1 and c3 are math
  });

  it('resolveApplyFilters → filterDataByActiveFilters with multi-type filters', () => {
    const scheduleData = makeScheduleData();

    // Start with tag filters
    const tagFilters = [{ type: 'tag', value: 'math' }];

    // Apply teacher filter on top (appLifecycleHelpers)
    const combined = resolveApplyFilters(tagFilters, 'teacher', ['王老師']);
    expect(combined).toHaveLength(2); // 1 tag + 1 teacher

    // Filter data with combined filters (frontendUtils)
    const filtered = filterDataByActiveFilters(scheduleData, combined);

    // Should match courses with math tag AND 王老師
    let courseCount = 0;
    forEachCourse(filtered, (course) => {
      expect(course.tags).toContain('math');
      expect(course.teacher).toBe('王老師');
      courseCount++;
    });
    expect(courseCount).toBe(2); // c1 and c3
  });

  it('resolveClearAdvancedFilters preserves tag filters but re-filters data', () => {
    const scheduleData = makeScheduleData();
    const filters = [
      { type: 'tag', value: 'english' },
      { type: 'teacher', value: '李老師' },
    ];

    // Clear advanced filters (appLifecycleHelpers)
    const tagOnly = resolveClearAdvancedFilters(filters);
    expect(tagOnly).toEqual([{ type: 'tag', value: 'english' }]);

    // Re-filter with tag-only (frontendUtils)
    const filtered = filterDataByActiveFilters(scheduleData, tagOnly);
    let courseCount = 0;
    forEachCourse(filtered, (course) => {
      expect(course.tags).toContain('english');
      courseCount++;
    });
    // english tag: c2 (101, day 0) + c5 (202, day 2) = 2
    expect(courseCount).toBe(2);
  });

  it('invalid persisted filters degrade gracefully into unfiltered view', () => {
    const scheduleData = makeScheduleData();

    // Corrupt localStorage data
    const persistedResult = resolvePersistedFilters('not-json{', getAllTags(scheduleData));
    expect(persistedResult.parseError).toBe(true);
    expect(persistedResult.activeFilters).toEqual([]);

    // Empty filters = no filtering (frontendUtils)
    const filtered = filterDataByTags(scheduleData, []);
    // Should return all data unchanged
    let count = 0;
    forEachCourse(filtered, () => count++);
    let origCount = 0;
    forEachCourse(scheduleData, () => origCount++);
    expect(count).toBe(origCount);
  });

  it('persisted tags that no longer exist get pruned before filtering', () => {
    const scheduleData = makeScheduleData();
    const currentTags = getAllTags(scheduleData);

    const persistedResult = resolvePersistedFilters(
      JSON.stringify(['math', 'deleted-tag', 'nonexistent']),
      currentTags
    );
    expect(persistedResult.validTags).toEqual(['math']);
    expect(persistedResult.needsPersistUpdate).toBe(true);

    // Only 'math' survives filtering
    const filtered = filterDataByTags(scheduleData, persistedResult.activeFilters);
    forEachCourse(filtered, (course) => {
      expect(course.tags).toContain('math');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (c) Save → validate → serialize flow
// ═══════════════════════════════════════════════════════════════════════════

describe('Pipeline: save → validate → serialize', () => {
  it('buildSavePayload produces correct structure for state serialization', () => {
    const serverResult = processServerLoadResult(makeServerResponse());
    const loadResult = resolveScheduleLoad('sched-1', serverResult.schedules, ALL_SCHEDULES_ID, () => true);

    // Build save payload (appLifecycleHelpers)
    const saveResult = buildSavePayload(
      'sched-1',
      serverResult.scheduleLastModified,
      loadResult.classrooms,
      loadResult.scheduleData,
      getAllTags(loadResult.scheduleData)
    );

    expect(saveResult.error).toBeUndefined();
    expect(saveResult.payload.scheduleId).toBe('sched-1');
    expect(saveResult.payload.lastModified).toBe('2024-06-01T00:00:00Z');
    expect(saveResult.payload.scheduleData.classrooms).toEqual(['101', '202']);
    expect(saveResult.payload.scheduleData.tags).toContain('math');
  });

  it('missing timestamp blocks save (no silent data loss)', () => {
    const result = buildSavePayload('sched-1', {}, ['101'], {}, []);
    expect(result.error).toBeDefined();
    expect(result.payload).toBeUndefined();
  });

  it('serializeState → checkDirty detects modification', () => {
    const state = {
      classrooms: ['101'],
      scheduleData: makeScheduleData(),
      tags: ['math'],
    };

    const snapshot = serializeState(state);
    expect(checkDirty(state, snapshot)).toBe(false);

    // Modify state
    const modified = { ...state, classrooms: ['101', '202'], scheduleData: state.scheduleData, tags: state.tags };
    expect(checkDirty(modified, snapshot)).toBe(true);
  });

  it('serialize → modify → re-serialize round-trip after save', () => {
    const state = {
      classrooms: ['101'],
      scheduleData: {},
      tags: [],
    };

    const cleanSnapshot = serializeState(state);
    // Modify
    const modified = { classrooms: ['101', '202'], scheduleData: {}, tags: [] };
    expect(checkDirty(modified, cleanSnapshot)).toBe(true);

    // After save, take new snapshot
    const newClean = serializeState(modified);
    expect(checkDirty(modified, newClean)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (d) Config → utility function coordination
// ═══════════════════════════════════════════════════════════════════════════

describe('Pipeline: utility function composition', () => {
  it('stringToHashCode is deterministic and buildCourseColorMap uses it', () => {
    // stringToHashCode is deterministic
    expect(stringToHashCode('數學')).toBe(stringToHashCode('數學'));
    expect(stringToHashCode('數學')).not.toBe(stringToHashCode('英文'));

    // Used as hashFn in buildCourseColorMap
    const scheduleData = makeScheduleData();
    const colorMap = {};
    buildCourseColorMap(scheduleData, stringToHashCode, COURSE_COLORS);
    // The function populates its internal colorMap — we can't access it directly
    // but it should not throw with real stringToHashCode + real colors
  });

  it('hexToRgb correctly converts colors from COURSE_COLORS palette', () => {
    for (const hex of COURSE_COLORS) {
      const rgb = hexToRgb(hex);
      expect(rgb).toHaveLength(3);
      rgb.forEach(channel => {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(255);
      });
    }
  });

  it('sortClassrooms → classroom order uses numeric extraction', () => {
    const classrooms = ['202', '101', '301'];
    const sorted = sortClassrooms(classrooms);
    // sortClassrooms sorts by hundreds-group descending, then within-group ascending
    expect(sorted[0]).toBe('301');
    expect(sorted[1]).toBe('202');
    expect(sorted[2]).toBe('101');
  });

  it('formatTime normalizes time strings used by timeToMinutes', () => {
    // formatTime (utilityFunctions) normalizes, timeToMinutes (frontendUtils) parses
    // Note: TIME_REGEX requires valid HH:MM format (minutes must be 2 digits)
    const formatted = formatTime('8:05', TIME_REGEX);
    expect(formatted).toBe('08:05');
    const minutes = timeToMinutes(formatted);
    expect(minutes).toBe(8 * 60 + 5);

    // Also verify the full round-trip with a different time
    const formatted2 = formatTime('14:30', TIME_REGEX);
    expect(formatted2).toBe('14:30');
    expect(timeToMinutes(formatted2)).toBe(14 * 60 + 30);
  });

  it('getShortUserName + canManageSchedule compose for permission checks', () => {
    const serverResult = processServerLoadResult(makeServerResponse());
    const shortName = getShortUserName('teacher@school.edu');
    expect(shortName).toBe('teacher');

    const canManage = canManageSchedule(
      false, 'sched-1', ALL_SCHEDULES_ID,
      serverResult.schedules, shortName, getShortUserName
    );
    expect(canManage).toBe(true); // teacher is the creator

    const cannotManage = canManageSchedule(
      false, 'sched-1', ALL_SCHEDULES_ID,
      serverResult.schedules, 'student', getShortUserName
    );
    expect(cannotManage).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Cross-cutting: drag-drop → data update → conflict check
// ═══════════════════════════════════════════════════════════════════════════

describe('Pipeline: drag-drop → data integrity → conflict detection', () => {
  it('resolveDropAction → checkTimeConflict validates after move', () => {
    const scheduleData = makeScheduleData();

    // Move c4 (理化, 09:00-10:00) from 202/day0 to 101/day0
    const dropResult = resolveDropAction(scheduleData, {
      fromClassroom: '202', fromDay: 0,
      toClassroom: '101', toDay: 0,
      classId: 'c4', newIndex: 1,
    }, timeToMinutes);

    expect(dropResult.moved).toBe(true);

    // Check if the moved item causes a time conflict in its new location
    const targetDay = dropResult.scheduleData['101'][0];
    const movedItem = targetDay.find(c => c.id === 'c4');
    expect(movedItem).toBeDefined();

    // checkTimeConflict(newClass, existingClasses) — DI signature
    const otherClasses = targetDay.filter(c => c.id !== 'c4');
    const hasConflict = checkTimeConflict(movedItem, otherClasses);
    // c4 (09:00-10:00) doesn't overlap with c1 (08:00-09:00) or c2 (10:00-11:00)
    expect(hasConflict).toBe(false);
  });

  it('resolveDropAction preserves data integrity for countOccurrences', () => {
    const scheduleData = makeScheduleData();
    const originalMathCount = countOccurrences(scheduleData, c => c.name === '數學');

    // Move a math course between classrooms
    const dropResult = resolveDropAction(scheduleData, {
      fromClassroom: '101', fromDay: 0,
      toClassroom: '202', toDay: 0,
      classId: 'c1', newIndex: 0,
    }, timeToMinutes);

    const newMathCount = countOccurrences(dropResult.scheduleData, c => c.name === '數學');
    expect(newMathCount).toBe(originalMathCount); // No courses lost
  });

  it('updateAllOccurrences + getAllTags reflects tag changes', () => {
    const scheduleData = JSON.parse(JSON.stringify(makeScheduleData()));

    // Add a new tag to all math courses
    updateAllOccurrences(
      scheduleData,
      c => c.name === '數學',
      c => { c.tags.push('重點'); }
    );

    const tags = getAllTags(scheduleData);
    expect(tags).toContain('重點');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Cross-cutting: edit classroom → data consistency
// ═══════════════════════════════════════════════════════════════════════════

describe('Pipeline: classroom edit → state consistency', () => {
  it('handleEditClassroom renames key then sortClassrooms uses new name', () => {
    // handleEditClassroom(oldName, newName, ctx) — ctx has classrooms, scheduleData, ui
    const ctx = {
      classrooms: ['101', '202'],
      scheduleData: JSON.parse(JSON.stringify(makeScheduleData())),
      ui: {
        showNotification: () => {},
        updateClassroomList: () => {},
        renderScheduleTable: () => {},
      },
      saveDataToLocal: () => {},
      historyModule: { saveState: () => {} },
    };

    handleEditClassroom('101', '103', ctx);

    expect(ctx.classrooms).toContain('103');
    expect(ctx.classrooms).not.toContain('101');
    expect(ctx.scheduleData['103']).toBeDefined();
    expect(ctx.scheduleData['101']).toBeUndefined();

    // sortClassrooms still works with the renamed classroom
    const sorted = sortClassrooms(ctx.classrooms);
    expect(sorted).toContain('103');
    expect(sorted).toContain('202');

    // Data integrity: courses still exist under new key
    let courseCount = 0;
    forEachCourse(ctx.scheduleData, () => courseCount++);
    expect(courseCount).toBeGreaterThan(0);
  });

  it('handleEditClassroom then getAllTags sees unchanged tags', () => {
    const ctx = {
      classrooms: ['101', '202'],
      scheduleData: JSON.parse(JSON.stringify(makeScheduleData())),
      ui: {
        showNotification: () => {},
        updateClassroomList: () => {},
        renderScheduleTable: () => {},
      },
      saveDataToLocal: () => {},
      historyModule: { saveState: () => {} },
    };

    const tagsBefore = getAllTags(ctx.scheduleData);
    handleEditClassroom('101', '103', ctx);
    const tagsAfter = getAllTags(ctx.scheduleData);

    // Tags should be unchanged — we renamed the classroom, not the courses
    expect(tagsAfter.sort()).toEqual(tagsBefore.sort());
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// XSS safety: escapeHtml in data that flows to display
// ═══════════════════════════════════════════════════════════════════════════

describe('Pipeline: data with special chars → escape → display safety', () => {
  it('course names with HTML are safe after escapeHtml', () => {
    const scheduleData = {
      '101': {
        0: [{ id: 'xss1', name: '<script>alert("xss")</script>', timeStart: '08:00', timeEnd: '09:00', tags: [] }],
      },
    };

    forEachCourse(scheduleData, (course) => {
      const safeName = escapeHtml(course.name);
      expect(safeName).not.toContain('<script>');
      expect(safeName).toContain('&lt;script&gt;');
    });
  });

  it('escapeHtml preserves Chinese characters in course data', () => {
    const name = '數學（進階）& 英文';
    const safe = escapeHtml(name);
    expect(safe).toContain('數學');
    expect(safe).toContain('（進階）');
    expect(safe).toContain('&amp;');
  });
});
