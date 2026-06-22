import { forEachCourse, countOccurrences, updateAllOccurrences } from '../lib/stateHelpers.js';
import { describe, it, expect } from 'vitest';

// ── Helper: build a scheduleData fixture ──────────────────────────
function makeScheduleData() {
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

// ═══════════════════════════════════════════════════════════════════
// forEachCourse
// ═══════════════════════════════════════════════════════════════════
describe('forEachCourse', () => {
  it('iterates over every course across classrooms and days', () => {
    const data = makeScheduleData();
    const visited = [];
    forEachCourse(data, (course, classroom, day) => {
      visited.push({ id: course.id, classroom, day });
    });
    expect(visited).toHaveLength(4);
    // Verify all 4 courses were visited with correct classroom/day context
    expect(visited).toContainEqual({ id: '1', classroom: 'Room A', day: '0' });
    expect(visited).toContainEqual({ id: '2', classroom: 'Room A', day: '0' });
    expect(visited).toContainEqual({ id: '3', classroom: 'Room A', day: '1' });
    expect(visited).toContainEqual({ id: '4', classroom: 'Room B', day: '0' });
  });

  it('does nothing when dataSource is null', () => {
    const visited = [];
    forEachCourse(null, () => visited.push(true));
    expect(visited).toHaveLength(0);
  });

  it('does nothing when dataSource is undefined', () => {
    const visited = [];
    forEachCourse(undefined, () => visited.push(true));
    expect(visited).toHaveLength(0);
  });

  it('does nothing when dataSource is an empty object', () => {
    const visited = [];
    forEachCourse({}, () => visited.push(true));
    expect(visited).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// countOccurrences
// ═══════════════════════════════════════════════════════════════════
describe('countOccurrences', () => {
  it('counts courses matching the predicate', () => {
    const data = makeScheduleData();
    // Count all "Math" courses
    const count = countOccurrences(data, course => course.name === 'Math');
    expect(count).toBe(2);
  });

  it('returns 0 when no courses match', () => {
    const data = makeScheduleData();
    const count = countOccurrences(data, course => course.name === 'Physics');
    expect(count).toBe(0);
  });

  it('counts all courses when predicate always returns true', () => {
    const data = makeScheduleData();
    const count = countOccurrences(data, () => true);
    expect(count).toBe(4);
  });
});

// ═══════════════════════════════════════════════════════════════════
// updateAllOccurrences
// ═══════════════════════════════════════════════════════════════════
describe('updateAllOccurrences', () => {
  it('updates matching courses in place', () => {
    const data = makeScheduleData();
    updateAllOccurrences(
      data,
      course => course.name === 'Math',
      course => { course.teacher = 'Dave'; }
    );
    // Verify the update was applied to the matching courses
    expect(data['Room A'][0][0].teacher).toBe('Dave');
    expect(data['Room A'][1][0].teacher).toBe('Dave');
    // Non-matching courses are untouched
    expect(data['Room A'][0][1].teacher).toBe('Bob');
    expect(data['Room B'][0][0].teacher).toBe('Carol');
  });

  it('does not modify any course when none match', () => {
    const data = makeScheduleData();
    const original = JSON.parse(JSON.stringify(data));
    updateAllOccurrences(
      data,
      course => course.name === 'Physics',
      course => { course.teacher = 'Nobody'; }
    );
    expect(data).toEqual(original);
  });

  it('confirms mutation is in-place (same object reference)', () => {
    const data = makeScheduleData();
    const courseRef = data['Room B'][0][0];
    updateAllOccurrences(
      data,
      course => course.id === '4',
      course => { course.name = 'Music'; }
    );
    // Same reference, mutated
    expect(courseRef.name).toBe('Music');
    expect(data['Room B'][0][0]).toBe(courseRef);
  });
});
