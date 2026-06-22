import { forEachCourse, countOccurrences, updateAllOccurrences } from '../lib/stateHelpers.js';
import { describe, it, expect, vi } from 'vitest';

// ── GAP tests: adversarial edge cases missed by SPEC ──────────────

// ═══════════════════════════════════════════════════════════════════
// forEachCourse — GAP
// ═══════════════════════════════════════════════════════════════════
describe('forEachCourse (GAP)', () => {
  it('skips days with empty arrays (no callback invocation)', () => {
    const data = {
      'Room A': {
        0: [],       // empty day — .forEach iterates 0 times
        1: [{ id: '1', name: 'Math' }],
      },
    };
    const visited = [];
    forEachCourse(data, (course) => visited.push(course.id));
    expect(visited).toEqual(['1']);
  });

  it('handles classroom with no days (empty day-object)', () => {
    const data = {
      'Room A': {},  // classroom exists but has no day keys
      'Room B': {
        0: [{ id: '1', name: 'Art' }],
      },
    };
    const visited = [];
    forEachCourse(data, (course) => visited.push(course.id));
    expect(visited).toEqual(['1']);
  });

  it('does NOT skip inherited prototype properties (for...in pitfall)', () => {
    // for...in iterates own + inherited enumerable properties.
    // If scheduleData has an inherited classroom, forEachCourse will visit it.
    // This documents current behavior (potential bug in production).
    const proto = { 'Ghost Room': { 0: [{ id: 'ghost', name: 'Phantom' }] } };
    const data = Object.create(proto);
    data['Room A'] = { 0: [{ id: '1', name: 'Math' }] };

    const visited = [];
    forEachCourse(data, (course) => visited.push(course.id));
    // Current behavior: for...in DOES iterate inherited props
    expect(visited).toContain('ghost');
    expect(visited).toContain('1');
    expect(visited).toHaveLength(2);
  });

  it('passes the actual course object reference to callback (not a copy)', () => {
    const course = { id: '1', name: 'Math' };
    const data = { 'Room A': { 0: [course] } };
    forEachCourse(data, (c) => {
      expect(c).toBe(course); // strict reference equality
    });
  });

  it('visits each course exactly once (no duplicates)', () => {
    const data = {
      'Room A': {
        0: [{ id: '1' }, { id: '2' }],
        1: [{ id: '3' }],
      },
      'Room B': {
        0: [{ id: '4' }],
      },
    };
    const ids = [];
    forEachCourse(data, (course) => ids.push(course.id));
    // Check uniqueness
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(4);
  });

  it('handles non-numeric day keys (string property names)', () => {
    // In production, day keys come from for...in on a plain object,
    // so they're always strings. Verify non-numeric keys work.
    const data = {
      'Room A': {
        'monday': [{ id: '1', name: 'Math' }],
        'tuesday': [{ id: '2', name: 'Art' }],
      },
    };
    const visited = [];
    forEachCourse(data, (_course, _classroom, day) => visited.push(day));
    expect(visited).toContain('monday');
    expect(visited).toContain('tuesday');
    expect(visited).toHaveLength(2);
  });

  it('day keys are always strings even when defined as numeric', () => {
    // for...in converts numeric keys to strings
    const data = {
      'Room A': {
        0: [{ id: '1' }],
        1: [{ id: '2' }],
      },
    };
    const dayTypes = [];
    forEachCourse(data, (_course, _classroom, day) => {
      dayTypes.push(typeof day);
    });
    // All day values from for...in should be strings
    expect(dayTypes.every(t => t === 'string')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// countOccurrences — GAP
// ═══════════════════════════════════════════════════════════════════
describe('countOccurrences (GAP)', () => {
  it('returns 0 for null scheduleData (delegates to forEachCourse null guard)', () => {
    const count = countOccurrences(null, () => true);
    expect(count).toBe(0);
  });

  it('returns 0 for undefined scheduleData', () => {
    const count = countOccurrences(undefined, () => true);
    expect(count).toBe(0);
  });

  it('returns 0 for empty scheduleData', () => {
    const count = countOccurrences({}, () => true);
    expect(count).toBe(0);
  });

  it('predicate only receives course, not (course, classroom, day)', () => {
    // The implementation wraps forEachCourse's 3-arg callback
    // but only passes `course` to the predicate.
    // Verify that predicate CANNOT filter by classroom or day.
    const data = {
      'Room A': { 0: [{ id: '1', name: 'Math' }] },
      'Room B': { 0: [{ id: '2', name: 'Math' }] },
    };
    const predicate = vi.fn(() => true);
    countOccurrences(data, predicate);
    // Predicate is called with only 1 argument (the course object)
    for (const call of predicate.mock.calls) {
      expect(call).toHaveLength(1);
      expect(call[0]).toHaveProperty('id');
    }
  });

  it('handles single-course scheduleData', () => {
    const data = { 'Room A': { 0: [{ id: '1', name: 'Math' }] } };
    expect(countOccurrences(data, c => c.name === 'Math')).toBe(1);
    expect(countOccurrences(data, c => c.name === 'Art')).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// updateAllOccurrences — GAP
// ═══════════════════════════════════════════════════════════════════
describe('updateAllOccurrences (GAP)', () => {
  it('is a no-op for null scheduleData (no crash)', () => {
    // Should not throw
    expect(() => {
      updateAllOccurrences(null, () => true, (c) => { c.name = 'X'; });
    }).not.toThrow();
  });

  it('is a no-op for undefined scheduleData (no crash)', () => {
    expect(() => {
      updateAllOccurrences(undefined, () => true, (c) => { c.name = 'X'; });
    }).not.toThrow();
  });

  it('updateFn can add new properties to matching courses', () => {
    const data = {
      'Room A': { 0: [{ id: '1', name: 'Math' }] },
    };
    updateAllOccurrences(
      data,
      () => true,
      (course) => { course.priority = 'high'; course.credits = 3; }
    );
    expect(data['Room A'][0][0]).toEqual({
      id: '1', name: 'Math', priority: 'high', credits: 3,
    });
  });

  it('updateFn can delete properties from matching courses', () => {
    const data = {
      'Room A': { 0: [{ id: '1', name: 'Math', teacher: 'Alice' }] },
    };
    updateAllOccurrences(
      data,
      () => true,
      (course) => { delete course.teacher; }
    );
    expect(data['Room A'][0][0]).toEqual({ id: '1', name: 'Math' });
    expect(data['Room A'][0][0]).not.toHaveProperty('teacher');
  });

  it('predicate only receives course, not classroom/day args', () => {
    const data = {
      'Room A': { 0: [{ id: '1' }] },
      'Room B': { 1: [{ id: '2' }] },
    };
    const predicate = vi.fn(() => false);
    updateAllOccurrences(data, predicate, () => {});
    for (const call of predicate.mock.calls) {
      expect(call).toHaveLength(1);
    }
  });

  it('updateFn is not called for non-matching courses (mock verification)', () => {
    const data = {
      'Room A': {
        0: [
          { id: '1', name: 'Math' },
          { id: '2', name: 'Art' },
        ],
      },
    };
    const updateFn = vi.fn();
    updateAllOccurrences(data, c => c.name === 'Physics', updateFn);
    expect(updateFn).not.toHaveBeenCalled();
  });

  it('updateFn is called exactly once per matching course', () => {
    const data = {
      'Room A': {
        0: [{ id: '1', name: 'Math' }],
        1: [{ id: '2', name: 'Math' }],
      },
      'Room B': {
        0: [{ id: '3', name: 'Art' }],
      },
    };
    const updateFn = vi.fn();
    updateAllOccurrences(data, c => c.name === 'Math', updateFn);
    expect(updateFn).toHaveBeenCalledTimes(2);
    // Verify the exact courses passed
    expect(updateFn.mock.calls[0][0].id).toBe('1');
    expect(updateFn.mock.calls[1][0].id).toBe('2');
  });
});
