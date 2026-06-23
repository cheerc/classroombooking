// Filter pipeline end-to-end behaviour tests.
// Ref: #132 — Filter pipeline E2E tests.
// Tests: filterScheduleData, filterDataByTags, filterDataByActiveFilters
// Source: JavaScript.html L991-1036, extracted to tests/lib/filterHelpers.js (DI pattern).

import { describe, it, expect } from 'vitest';
import {
  filterScheduleData,
  filterDataByTags,
  filterDataByActiveFilters,
} from '../lib/filterHelpers.js';

// ── Test Data Factories ──────────────────────────────────────────

/**
 * Creates a standard scheduleData fixture with courses having various tags,
 * names, and teachers spread across multiple classrooms and days.
 */
function makeFilterTestData() {
  return {
    'Room A': {
      0: [
        { id: '1', name: 'Math', teacher: 'Alice', tags: ['core', 'required'] },
        { id: '2', name: 'English', teacher: 'Bob', tags: ['elective'] },
      ],
      1: [
        { id: '3', name: 'Math', teacher: 'Alice', tags: ['core'] },
        { id: '4', name: 'Science', teacher: 'Carol', tags: ['core', 'lab'] },
      ],
    },
    'Room B': {
      0: [
        { id: '5', name: 'Art', teacher: 'Carol', tags: ['elective', 'creative'] },
      ],
      2: [
        { id: '6', name: 'Music', teacher: 'Dave', tags: ['elective'] },
      ],
    },
    'Room C': {
      0: [
        { id: '7', name: 'PE', teacher: 'Eve', tags: ['required'] },
        { id: '8', name: 'History', teacher: 'Frank', tags: [] },
      ],
    },
  };
}

/** Helper to collect all course IDs from a scheduleData structure. */
function collectIds(data) {
  const ids = [];
  for (const classroom in data) {
    for (const day in data[classroom]) {
      data[classroom][day].forEach(course => ids.push(course.id));
    }
  }
  return ids.sort();
}

// ── filterScheduleData (base filter engine) ──────────────────────

describe('filterScheduleData', () => {
  it('returns empty object when no courses match', () => {
    const data = makeFilterTestData();
    const result = filterScheduleData(data, () => false);
    expect(result).toEqual({});
  });

  it('returns all courses when predicate always true', () => {
    const data = makeFilterTestData();
    const result = filterScheduleData(data, () => true);
    expect(collectIds(result).sort()).toEqual(collectIds(data).sort());
  });

  it('omits classrooms with no matching courses', () => {
    const data = makeFilterTestData();
    // Only keep courses with teacher 'Eve' → only Room C day 0 id=7
    const result = filterScheduleData(data, c => c.teacher === 'Eve');
    expect(Object.keys(result)).toEqual(['Room C']);
    expect(collectIds(result)).toEqual(['7']);
  });

  it('omits days with no matching courses within a classroom', () => {
    const data = makeFilterTestData();
    // Only keep courses with name 'Math' → Room A day 0 id=1, day 1 id=3
    const result = filterScheduleData(data, c => c.name === 'Math');
    expect(Object.keys(result)).toEqual(['Room A']);
    expect(Object.keys(result['Room A']).sort()).toEqual(['0', '1']);
    expect(collectIds(result)).toEqual(['1', '3']);
  });

  it('handles empty scheduleData', () => {
    const result = filterScheduleData({}, () => true);
    expect(result).toEqual({});
  });

  it('handles classroom with empty day arrays', () => {
    const data = { 'Room X': { 0: [] } };
    const result = filterScheduleData(data, () => true);
    // Day 0 has no courses after filter → classroom omitted
    expect(result).toEqual({});
  });

  it('does not mutate original data', () => {
    const data = makeFilterTestData();
    const original = JSON.parse(JSON.stringify(data));
    filterScheduleData(data, c => c.name === 'Math');
    expect(data).toEqual(original);
  });
});

// ── filterDataByTags ─────────────────────────────────────────────

describe('filterDataByTags', () => {
  it('returns data unchanged when no tag filters active', () => {
    const data = makeFilterTestData();
    const result = filterDataByTags(data, []);
    expect(result).toBe(data); // identity — same reference
  });

  it('returns data unchanged when activeFilters has only non-tag types', () => {
    const data = makeFilterTestData();
    const filters = [{ type: 'name', value: 'Math' }];
    const result = filterDataByTags(data, filters);
    expect(result).toBe(data); // tag-only filter ignores name filters
  });

  it('filters to courses with a single tag', () => {
    const data = makeFilterTestData();
    const filters = [{ type: 'tag', value: 'core' }];
    const result = filterDataByTags(data, filters);
    // core courses: id 1 (core, required), 3 (core), 4 (core, lab)
    expect(collectIds(result)).toEqual(['1', '3', '4']);
  });

  it('filters with multiple tags using OR logic', () => {
    const data = makeFilterTestData();
    const filters = [
      { type: 'tag', value: 'lab' },
      { type: 'tag', value: 'creative' },
    ];
    const result = filterDataByTags(data, filters);
    // lab: id 4, creative: id 5
    expect(collectIds(result)).toEqual(['4', '5']);
  });

  it('excludes courses with empty tags array', () => {
    const data = makeFilterTestData();
    const filters = [{ type: 'tag', value: 'core' }];
    const result = filterDataByTags(data, filters);
    // id 8 has tags: [] → excluded
    expect(collectIds(result)).not.toContain('8');
  });

  it('excludes courses with undefined tags', () => {
    const data = {
      'Room X': {
        0: [{ id: '99', name: 'NoTags', teacher: 'Z' }], // no tags property
      },
    };
    const filters = [{ type: 'tag', value: 'core' }];
    const result = filterDataByTags(data, filters);
    expect(result).toEqual({});
  });

  it('handles tag that does not exist on any course', () => {
    const data = makeFilterTestData();
    const filters = [{ type: 'tag', value: 'nonexistent' }];
    const result = filterDataByTags(data, filters);
    expect(result).toEqual({});
  });

  it('preserves classroom/day structure for matching courses', () => {
    const data = makeFilterTestData();
    const filters = [{ type: 'tag', value: 'required' }];
    const result = filterDataByTags(data, filters);
    // required: id 1 (Room A day 0), id 7 (Room C day 0)
    expect(Object.keys(result).sort()).toEqual(['Room A', 'Room C']);
    expect(result['Room A'][0]).toHaveLength(1);
    expect(result['Room A'][0][0].id).toBe('1');
    expect(result['Room C'][0]).toHaveLength(1);
    expect(result['Room C'][0][0].id).toBe('7');
  });
});

// ── filterDataByActiveFilters ────────────────────────────────────

describe('filterDataByActiveFilters', () => {
  // -- Identity / no-op cases --

  it('returns data unchanged when no filters active (empty array)', () => {
    const data = makeFilterTestData();
    const result = filterDataByActiveFilters(data, []);
    expect(result).toBe(data);
  });

  it('returns data unchanged when all filter types have 0 entries', () => {
    const data = makeFilterTestData();
    // No name/tag/teacher filters → identity
    const result = filterDataByActiveFilters(data, []);
    expect(result).toBe(data);
  });

  // -- Single filter type --

  it('filters by name only', () => {
    const data = makeFilterTestData();
    const filters = [{ type: 'name', value: 'Math' }];
    const result = filterDataByActiveFilters(data, filters);
    // Math: id 1, 3
    expect(collectIds(result)).toEqual(['1', '3']);
  });

  it('filters by teacher only', () => {
    const data = makeFilterTestData();
    const filters = [{ type: 'teacher', value: 'Carol' }];
    const result = filterDataByActiveFilters(data, filters);
    // Carol teaches: id 4 (Science), id 5 (Art)
    expect(collectIds(result)).toEqual(['4', '5']);
  });

  it('filters by tag only (same as filterDataByTags)', () => {
    const data = makeFilterTestData();
    const filters = [{ type: 'tag', value: 'elective' }];
    const result = filterDataByActiveFilters(data, filters);
    // elective: id 2, 5, 6
    expect(collectIds(result)).toEqual(['2', '5', '6']);
  });

  // -- Multiple filters of same type (OR within type) --

  it('multiple name filters use OR logic', () => {
    const data = makeFilterTestData();
    const filters = [
      { type: 'name', value: 'Math' },
      { type: 'name', value: 'Art' },
    ];
    const result = filterDataByActiveFilters(data, filters);
    // Math: 1, 3; Art: 5
    expect(collectIds(result)).toEqual(['1', '3', '5']);
  });

  it('multiple teacher filters use OR logic', () => {
    const data = makeFilterTestData();
    const filters = [
      { type: 'teacher', value: 'Alice' },
      { type: 'teacher', value: 'Dave' },
    ];
    const result = filterDataByActiveFilters(data, filters);
    // Alice: 1, 3; Dave: 6
    expect(collectIds(result)).toEqual(['1', '3', '6']);
  });

  // -- Multiple filter types stacked (AND across types) --

  it('tag + name stacked → AND logic', () => {
    const data = makeFilterTestData();
    const filters = [
      { type: 'tag', value: 'core' },
      { type: 'name', value: 'Math' },
    ];
    const result = filterDataByActiveFilters(data, filters);
    // core courses: 1, 3, 4. Of those, name=Math: 1, 3
    expect(collectIds(result)).toEqual(['1', '3']);
  });

  it('tag + teacher stacked → AND logic', () => {
    const data = makeFilterTestData();
    const filters = [
      { type: 'tag', value: 'core' },
      { type: 'teacher', value: 'Carol' },
    ];
    const result = filterDataByActiveFilters(data, filters);
    // core: 1, 3, 4. teacher Carol: 4, 5. Intersection: 4
    expect(collectIds(result)).toEqual(['4']);
  });

  it('all three types stacked → AND logic', () => {
    const data = makeFilterTestData();
    const filters = [
      { type: 'tag', value: 'core' },
      { type: 'name', value: 'Science' },
      { type: 'teacher', value: 'Carol' },
    ];
    const result = filterDataByActiveFilters(data, filters);
    // core + Science + Carol → only id 4
    expect(collectIds(result)).toEqual(['4']);
  });

  it('three types stacked with no intersection → empty result', () => {
    const data = makeFilterTestData();
    const filters = [
      { type: 'tag', value: 'core' },
      { type: 'name', value: 'Art' },     // Art is not core
      { type: 'teacher', value: 'Carol' },
    ];
    const result = filterDataByActiveFilters(data, filters);
    expect(result).toEqual({});
  });

  // -- Filter cleared → back to full data --

  it('removing all filters returns to full dataset', () => {
    const data = makeFilterTestData();
    // First apply filters
    const filtered = filterDataByActiveFilters(data, [{ type: 'tag', value: 'core' }]);
    expect(collectIds(filtered)).toHaveLength(3);
    // Then clear filters
    const cleared = filterDataByActiveFilters(data, []);
    expect(cleared).toBe(data);
    expect(collectIds(cleared)).toEqual(collectIds(data));
  });

  // -- Edge cases --

  it('empty scheduleData with filters → empty result', () => {
    const result = filterDataByActiveFilters({}, [{ type: 'tag', value: 'core' }]);
    expect(result).toEqual({});
  });

  it('course with no tags property → excluded by tag filter', () => {
    const data = {
      'Room X': {
        0: [{ id: '99', name: 'NoTags', teacher: 'Z' }],
      },
    };
    const filters = [{ type: 'tag', value: 'core' }];
    const result = filterDataByActiveFilters(data, filters);
    expect(result).toEqual({});
  });

  it('course with empty tags array → excluded by tag filter', () => {
    const data = {
      'Room X': {
        0: [{ id: '99', name: 'NoTags', teacher: 'Z', tags: [] }],
      },
    };
    const filters = [{ type: 'tag', value: 'core' }];
    const result = filterDataByActiveFilters(data, filters);
    expect(result).toEqual({});
  });

  it('course with no tags property → included when only name filter active', () => {
    const data = {
      'Room X': {
        0: [{ id: '99', name: 'Special', teacher: 'Z' }],
      },
    };
    const filters = [{ type: 'name', value: 'Special' }];
    const result = filterDataByActiveFilters(data, filters);
    expect(collectIds(result)).toEqual(['99']);
  });

  it('unknown filter type is ignored (treated as no-op)', () => {
    const data = makeFilterTestData();
    const filters = [{ type: 'unknown', value: 'anything' }];
    const result = filterDataByActiveFilters(data, filters);
    // unknown type → nameFilters/tagFilters/teacherFilters all empty → identity
    expect(result).toBe(data);
  });

  it('does not mutate original data', () => {
    const data = makeFilterTestData();
    const original = JSON.parse(JSON.stringify(data));
    filterDataByActiveFilters(data, [
      { type: 'tag', value: 'core' },
      { type: 'name', value: 'Math' },
    ]);
    expect(data).toEqual(original);
  });

  it('handles single-course single-classroom data', () => {
    const data = {
      'Only Room': {
        3: [{ id: '1', name: 'Solo', teacher: 'One', tags: ['only'] }],
      },
    };
    const filters = [{ type: 'tag', value: 'only' }];
    const result = filterDataByActiveFilters(data, filters);
    expect(collectIds(result)).toEqual(['1']);
  });

  it('handles multiple days in same classroom', () => {
    const data = {
      'Room A': {
        0: [{ id: '1', name: 'Math', teacher: 'Alice', tags: ['core'] }],
        1: [{ id: '2', name: 'Art', teacher: 'Bob', tags: ['elective'] }],
        2: [{ id: '3', name: 'Math', teacher: 'Alice', tags: ['core'] }],
      },
    };
    const filters = [{ type: 'tag', value: 'core' }];
    const result = filterDataByActiveFilters(data, filters);
    expect(Object.keys(result['Room A']).sort()).toEqual(['0', '2']);
    expect(collectIds(result)).toEqual(['1', '3']);
  });
});
