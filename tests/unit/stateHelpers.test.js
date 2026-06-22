import { forEachCourse, countOccurrences, updateAllOccurrences, handleEditClassroom } from '../lib/stateHelpers.js';
import { describe, it, expect, vi } from 'vitest';

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

// ═══════════════════════════════════════════════════════════════════
// handleEditClassroom
// ═══════════════════════════════════════════════════════════════════

// ── Helper: build a mock context for handleEditClassroom ──────────
function makeCtx(overrides = {}) {
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

describe('handleEditClassroom', () => {
  it('renames classroom in array, scheduleData key, and calls all side effects', () => {
    const ctx = makeCtx();
    handleEditClassroom('Room A', 'Room Z', ctx);

    // classrooms array updated
    expect(ctx.classrooms).toContain('Room Z');
    expect(ctx.classrooms).not.toContain('Room A');
    expect(ctx.classrooms).toHaveLength(3);

    // scheduleData key renamed
    expect(ctx.scheduleData['Room Z']).toBeDefined();
    expect(ctx.scheduleData['Room Z']).toEqual({ 0: [{ id: '1', name: 'Math' }] });
    expect(ctx.scheduleData['Room A']).toBeUndefined();

    // All side-effect callbacks called
    expect(ctx.ui.updateClassroomList).toHaveBeenCalledOnce();
    expect(ctx.ui.renderScheduleTable).toHaveBeenCalledOnce();
    expect(ctx.saveDataToLocal).toHaveBeenCalledOnce();
    expect(ctx.historyModule.saveState).toHaveBeenCalledOnce();

    // Success notification
    expect(ctx.ui.showNotification).toHaveBeenCalledWith(
      '教室名稱已從 "Room A" 更新為 "Room Z"'
    );
  });

  it('shows error and returns when newName is empty string', () => {
    const ctx = makeCtx();
    const originalClassrooms = [...ctx.classrooms];
    const originalData = JSON.parse(JSON.stringify(ctx.scheduleData));

    handleEditClassroom('Room A', '', ctx);

    // Error notification with correct message
    expect(ctx.ui.showNotification).toHaveBeenCalledWith('教室名稱不能為空！', 'error');

    // State unchanged
    expect(ctx.classrooms).toEqual(originalClassrooms);
    expect(ctx.scheduleData).toEqual(originalData);

    // No side effects called
    expect(ctx.ui.updateClassroomList).not.toHaveBeenCalled();
    expect(ctx.ui.renderScheduleTable).not.toHaveBeenCalled();
    expect(ctx.saveDataToLocal).not.toHaveBeenCalled();
    expect(ctx.historyModule.saveState).not.toHaveBeenCalled();
  });

  it('shows error and returns when newName already exists in classrooms', () => {
    const ctx = makeCtx();
    const originalClassrooms = [...ctx.classrooms];
    const originalData = JSON.parse(JSON.stringify(ctx.scheduleData));

    handleEditClassroom('Room A', 'Room B', ctx);

    // Error notification with duplicate name
    expect(ctx.ui.showNotification).toHaveBeenCalledWith(
      '教室名稱 "Room B" 已存在！', 'error'
    );

    // State unchanged
    expect(ctx.classrooms).toEqual(originalClassrooms);
    expect(ctx.scheduleData).toEqual(originalData);

    // No side effects called
    expect(ctx.ui.updateClassroomList).not.toHaveBeenCalled();
  });

  it('proceeds without array change when oldName not in classrooms (but still renames scheduleData)', () => {
    const ctx = makeCtx({
      classrooms: ['Room B', 'Room C'],  // Room A not in array
      scheduleData: {
        'Room A': { 0: [{ id: '1', name: 'Math' }] },
      },
    });

    handleEditClassroom('Room A', 'Room Z', ctx);

    // classrooms array unchanged (Room A wasn't in it)
    expect(ctx.classrooms).toEqual(['Room B', 'Room C']);

    // scheduleData still renamed
    expect(ctx.scheduleData['Room Z']).toBeDefined();
    expect(ctx.scheduleData['Room A']).toBeUndefined();

    // Side effects still called
    expect(ctx.ui.updateClassroomList).toHaveBeenCalledOnce();
    expect(ctx.saveDataToLocal).toHaveBeenCalledOnce();
  });

  it('proceeds without scheduleData change when oldName not in scheduleData (but still renames array)', () => {
    const ctx = makeCtx({
      classrooms: ['Room A', 'Room B'],
      scheduleData: {
        'Room B': { 0: [{ id: '2', name: 'Art' }] },
        // Room A not in scheduleData
      },
    });

    handleEditClassroom('Room A', 'Room Z', ctx);

    // classrooms array updated
    expect(ctx.classrooms).toContain('Room Z');
    expect(ctx.classrooms).not.toContain('Room A');

    // scheduleData unchanged (Room A wasn't in it, no Room Z added)
    expect(ctx.scheduleData['Room Z']).toBeUndefined();
    expect(ctx.scheduleData['Room B']).toBeDefined();

    // Side effects still called
    expect(ctx.ui.renderScheduleTable).toHaveBeenCalledOnce();
    expect(ctx.historyModule.saveState).toHaveBeenCalledOnce();
  });

  it('success notification includes both old and new names', () => {
    const ctx = makeCtx();
    handleEditClassroom('Room A', '大教室', ctx);

    // Verify notification message format with Chinese characters
    expect(ctx.ui.showNotification).toHaveBeenCalledWith(
      '教室名稱已從 "Room A" 更新為 "大教室"'
    );
  });
});
