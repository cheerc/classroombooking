/**
 * Tests for data collection helpers and filter persistence.
 * Ref: #95 — Wave 2B test coverage
 */
import {
  collectFromScheduleData,
  getAllTags,
  collectFromAllCourses,
  getGlobalAllTags,
  getGlobalAllCourseNames,
  getGlobalAllTeachers,
  loadPersistedFilters,
} from '../lib/dataCollectionHelpers.js';
import { createMockStorage } from '../mocks/frontendMocks.js';

// --- Shared fixtures ---

/** Single schedule data structure: { classroom: { dayIndex: [courses] } } */
function makeScheduleData() {
  return {
    'Room A': {
      0: [
        { id: '1', name: 'Math', teacher: 'Alice', tags: ['core', 'math'] },
        { id: '2', name: 'English', teacher: 'Bob', tags: ['core'] },
      ],
      1: [
        { id: '3', name: 'Science', teacher: 'Alice', tags: ['science'] },
      ],
    },
    'Room B': {
      0: [
        { id: '4', name: 'Math', teacher: 'Charlie', tags: ['math'] },
      ],
      2: [
        { id: '5', name: 'Art', teacher: 'Diana', tags: [] },
      ],
    },
  };
}

/** Multi-schedule structure: { scheduleId: { data: { scheduleData: {...} } } } */
function makeSchedules() {
  return {
    schedule1: {
      data: {
        scheduleData: {
          'Room A': {
            0: [
              { id: '1', name: 'Math', teacher: 'Alice', tags: ['core'] },
              { id: '2', name: 'English', teacher: 'Bob', tags: ['language'] },
            ],
          },
        },
      },
    },
    schedule2: {
      data: {
        scheduleData: {
          'Room X': {
            1: [
              { id: '3', name: 'Physics', teacher: 'Alice', tags: ['science'] },
              { id: '4', name: 'Math', teacher: 'Eve', tags: ['core'] },
            ],
          },
        },
      },
    },
  };
}

// ============================================================
// collectFromScheduleData
// ============================================================
describe('collectFromScheduleData', () => {
  it('collects unique values via collector function', () => {
    const data = makeScheduleData();
    const result = collectFromScheduleData(data, (course, set) => {
      if (course.teacher) set.add(course.teacher);
    });
    expect(result).toEqual(['Alice', 'Bob', 'Charlie', 'Diana']);
  });

  it('returns sorted results', () => {
    const data = {
      'Room A': {
        0: [
          { id: '1', name: 'Zebra' },
          { id: '2', name: 'Apple' },
          { id: '3', name: 'Mango' },
        ],
      },
    };
    const result = collectFromScheduleData(data, (course, set) => {
      set.add(course.name);
    });
    expect(result).toEqual(['Apple', 'Mango', 'Zebra']);
  });

  it('returns empty array for null dataSource', () => {
    const result = collectFromScheduleData(null, (course, set) => {
      set.add(course.name);
    });
    expect(result).toEqual([]);
  });

  it('returns empty array for undefined dataSource', () => {
    const result = collectFromScheduleData(undefined, (course, set) => {
      set.add(course.name);
    });
    expect(result).toEqual([]);
  });

  it('returns empty array for empty dataSource', () => {
    const result = collectFromScheduleData({}, (course, set) => {
      set.add(course.name);
    });
    expect(result).toEqual([]);
  });

  it('deduplicates values via Set', () => {
    const data = {
      'Room A': {
        0: [{ id: '1', name: 'Math' }],
        1: [{ id: '2', name: 'Math' }],
      },
    };
    const result = collectFromScheduleData(data, (course, set) => {
      set.add(course.name);
    });
    expect(result).toEqual(['Math']);
  });
});

// ============================================================
// getAllTags
// ============================================================
describe('getAllTags', () => {
  it('collects all unique tags from schedule data', () => {
    const result = getAllTags(makeScheduleData());
    expect(result).toEqual(['core', 'math', 'science']);
  });

  it('returns empty array when no courses have tags', () => {
    const data = {
      'Room A': { 0: [{ id: '1', name: 'Math' }] },
    };
    expect(getAllTags(data)).toEqual([]);
  });

  it('handles courses with tags: null gracefully', () => {
    const data = {
      'Room A': { 0: [{ id: '1', name: 'Math', tags: null }] },
    };
    expect(getAllTags(data)).toEqual([]);
  });

  it('handles courses with tags: undefined gracefully', () => {
    const data = {
      'Room A': { 0: [{ id: '1', name: 'Math' }] },
    };
    expect(getAllTags(data)).toEqual([]);
  });

  it('handles empty tags array', () => {
    const data = {
      'Room A': { 0: [{ id: '1', name: 'Art', tags: [] }] },
    };
    expect(getAllTags(data)).toEqual([]);
  });

  it('returns empty array for null data', () => {
    expect(getAllTags(null)).toEqual([]);
  });

  it('returns sorted tags', () => {
    const data = {
      'Room A': {
        0: [{ id: '1', tags: ['z-tag', 'a-tag', 'm-tag'] }],
      },
    };
    expect(getAllTags(data)).toEqual(['a-tag', 'm-tag', 'z-tag']);
  });
});

// ============================================================
// collectFromAllCourses
// ============================================================
describe('collectFromAllCourses', () => {
  it('collects across multiple schedules', () => {
    const schedules = makeSchedules();
    const result = collectFromAllCourses(schedules, (item, set) => {
      if (item.name) set.add(item.name);
    });
    expect(result).toEqual(['English', 'Math', 'Physics']);
  });

  it('returns empty array for null schedules', () => {
    expect(collectFromAllCourses(null, () => {})).toEqual([]);
  });

  it('returns empty array for undefined schedules', () => {
    expect(collectFromAllCourses(undefined, () => {})).toEqual([]);
  });

  it('returns empty array for empty schedules', () => {
    expect(collectFromAllCourses({}, () => {})).toEqual([]);
  });

  it('skips schedules without data', () => {
    const schedules = {
      s1: {},
      s2: { data: { scheduleData: { 'R': { 0: [{ name: 'Math' }] } } } },
    };
    const result = collectFromAllCourses(schedules, (item, set) => {
      if (item.name) set.add(item.name);
    });
    expect(result).toEqual(['Math']);
  });

  it('skips schedules with null data', () => {
    const schedules = {
      s1: { data: null },
      s2: { data: { scheduleData: { 'R': { 0: [{ name: 'Art' }] } } } },
    };
    const result = collectFromAllCourses(schedules, (item, set) => {
      if (item.name) set.add(item.name);
    });
    expect(result).toEqual(['Art']);
  });

  it('handles classroom with null value', () => {
    const schedules = {
      s1: { data: { scheduleData: { 'R': null } } },
    };
    const result = collectFromAllCourses(schedules, (item, set) => {
      set.add(item.name);
    });
    expect(result).toEqual([]);
  });

  it('handles day with non-array value', () => {
    const schedules = {
      s1: { data: { scheduleData: { 'R': { 0: 'not-array' } } } },
    };
    const result = collectFromAllCourses(schedules, (item, set) => {
      set.add(item.name);
    });
    expect(result).toEqual([]);
  });

  it('deduplicates across schedules', () => {
    const schedules = {
      s1: { data: { scheduleData: { 'R': { 0: [{ name: 'Math' }] } } } },
      s2: { data: { scheduleData: { 'R': { 0: [{ name: 'Math' }] } } } },
    };
    const result = collectFromAllCourses(schedules, (item, set) => {
      set.add(item.name);
    });
    expect(result).toEqual(['Math']);
  });
});

// ============================================================
// getGlobalAllTags
// ============================================================
describe('getGlobalAllTags', () => {
  it('collects all unique tags across schedules', () => {
    const result = getGlobalAllTags(makeSchedules());
    expect(result).toEqual(['core', 'language', 'science']);
  });

  it('returns empty for null schedules', () => {
    expect(getGlobalAllTags(null)).toEqual([]);
  });

  it('handles courses without tags', () => {
    const schedules = {
      s1: { data: { scheduleData: { 'R': { 0: [{ name: 'Math' }] } } } },
    };
    expect(getGlobalAllTags(schedules)).toEqual([]);
  });
});

// ============================================================
// getGlobalAllCourseNames
// ============================================================
describe('getGlobalAllCourseNames', () => {
  it('collects all unique course names across schedules', () => {
    const result = getGlobalAllCourseNames(makeSchedules());
    expect(result).toEqual(['English', 'Math', 'Physics']);
  });

  it('returns empty for null schedules', () => {
    expect(getGlobalAllCourseNames(null)).toEqual([]);
  });

  it('skips courses without name', () => {
    const schedules = {
      s1: { data: { scheduleData: { 'R': { 0: [{ teacher: 'Bob' }] } } } },
    };
    expect(getGlobalAllCourseNames(schedules)).toEqual([]);
  });
});

// ============================================================
// getGlobalAllTeachers
// ============================================================
describe('getGlobalAllTeachers', () => {
  it('collects all unique teachers across schedules', () => {
    const result = getGlobalAllTeachers(makeSchedules());
    expect(result).toEqual(['Alice', 'Bob', 'Eve']);
  });

  it('returns empty for null schedules', () => {
    expect(getGlobalAllTeachers(null)).toEqual([]);
  });

  it('skips courses without teacher', () => {
    const schedules = {
      s1: { data: { scheduleData: { 'R': { 0: [{ name: 'Math' }] } } } },
    };
    expect(getGlobalAllTeachers(schedules)).toEqual([]);
  });
});

// ============================================================
// loadPersistedFilters
// ============================================================
describe('loadPersistedFilters', () => {
  it('returns empty filters when no persisted data', () => {
    const storage = createMockStorage();
    const result = loadPersistedFilters(storage, ['tag1', 'tag2']);
    expect(result).toEqual({
      activeFilters: [],
      storageAction: 'none',
    });
  });

  it('loads and validates persisted tags against current tags', () => {
    const storage = createMockStorage();
    storage.setItem('activeTagFilters', JSON.stringify(['core', 'math']));
    const result = loadPersistedFilters(storage, ['core', 'math', 'science']);
    expect(result.activeFilters).toEqual([
      { type: 'tag', value: 'core' },
      { type: 'tag', value: 'math' },
    ]);
    expect(result.storageAction).toBe('none');
  });

  it('filters out tags that no longer exist', () => {
    const storage = createMockStorage();
    storage.setItem('activeTagFilters', JSON.stringify(['core', 'deleted-tag']));
    const result = loadPersistedFilters(storage, ['core', 'science']);
    expect(result.activeFilters).toEqual([
      { type: 'tag', value: 'core' },
    ]);
    expect(result.storageAction).toBe('update');
    expect(result.updatedValue).toBe(JSON.stringify(['core']));
  });

  it('returns remove action on invalid JSON', () => {
    const storage = createMockStorage();
    storage.setItem('activeTagFilters', 'not-valid-json{{{');
    const result = loadPersistedFilters(storage, ['core']);
    expect(result.activeFilters).toEqual([]);
    expect(result.storageAction).toBe('remove');
  });

  it('handles all tags being removed (all invalid)', () => {
    const storage = createMockStorage();
    storage.setItem('activeTagFilters', JSON.stringify(['old1', 'old2']));
    const result = loadPersistedFilters(storage, ['new1', 'new2']);
    expect(result.activeFilters).toEqual([]);
    expect(result.storageAction).toBe('update');
    expect(result.updatedValue).toBe('[]');
  });

  it('handles empty persisted array', () => {
    const storage = createMockStorage();
    storage.setItem('activeTagFilters', '[]');
    const result = loadPersistedFilters(storage, ['core']);
    expect(result.activeFilters).toEqual([]);
    expect(result.storageAction).toBe('none');
  });

  it('handles empty current tags (all persisted become invalid)', () => {
    const storage = createMockStorage();
    storage.setItem('activeTagFilters', JSON.stringify(['core']));
    const result = loadPersistedFilters(storage, []);
    expect(result.activeFilters).toEqual([]);
    expect(result.storageAction).toBe('update');
  });

  it('preserves order of valid persisted tags', () => {
    const storage = createMockStorage();
    storage.setItem('activeTagFilters', JSON.stringify(['z-tag', 'a-tag', 'm-tag']));
    const result = loadPersistedFilters(storage, ['a-tag', 'z-tag', 'm-tag']);
    expect(result.activeFilters).toEqual([
      { type: 'tag', value: 'z-tag' },
      { type: 'tag', value: 'a-tag' },
      { type: 'tag', value: 'm-tag' },
    ]);
    expect(result.storageAction).toBe('none');
  });
});
