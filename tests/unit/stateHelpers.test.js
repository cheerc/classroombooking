import { forEachCourse, countOccurrences, updateAllOccurrences, handleEditClassroom, findNextUpcomingClasses, saveDataToServer } from '../lib/stateHelpers.js';
import { describe, it, expect, vi } from 'vitest';
import { makeScheduleData, makeEditCtx, APP_CONFIG, makeFindCtx, makeSaveCtx } from './stateHelpers.fixtures.js';

// Fixtures imported from stateHelpers.fixtures.js

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

// makeEditCtx imported from stateHelpers.fixtures.js

describe('handleEditClassroom', () => {
  it('renames classroom in array, scheduleData key, and calls all side effects', () => {
    const ctx = makeEditCtx();
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
    const ctx = makeEditCtx();
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
    const ctx = makeEditCtx();
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
    const ctx = makeEditCtx({
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
    const ctx = makeEditCtx({
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
    const ctx = makeEditCtx();
    handleEditClassroom('Room A', '大教室', ctx);

    // Verify notification message format with Chinese characters
    expect(ctx.ui.showNotification).toHaveBeenCalledWith(
      '教室名稱已從 "Room A" 更新為 "大教室"'
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// findNextUpcomingClasses
// ═══════════════════════════════════════════════════════════════════

// APP_CONFIG, makeFindCtx imported from stateHelpers.fixtures.js

describe('findNextUpcomingClasses', () => {
  it('adds future courses within 30min threshold (happy path, DAY mode + today)', () => {
    // Monday 10:00 — courses at 10:15 (within 30min) and 11:00 (outside)
    const now = new Date('2026-06-22T10:00:00'); // Monday (getDay()=1 → todayIndex=0)
    const ctx = makeFindCtx({
      currentDayIndex: 0,
      scheduleData: {
        'Room A': {
          0: [
            { id: 'c1', timeStart: '10:15' },  // 15min away → within threshold
            { id: 'c2', timeStart: '11:00' },  // 60min away → outside threshold
          ],
        },
      },
    });

    findNextUpcomingClasses(ctx, APP_CONFIG, now);

    // Only c1 is within the 30min threshold
    expect(ctx.nextUpcomingClassIds.has('c1')).toBe(true);
    expect(ctx.nextUpcomingClassIds.has('c2')).toBe(false);
    expect(ctx.nextUpcomingClassIds.size).toBe(1);
  });

  it('clears set and returns when not in DAY mode', () => {
    const now = new Date('2026-06-22T10:00:00');
    const ctx = makeFindCtx({
      currentViewMode: 'week',
      currentDayIndex: 0,
    });
    ctx.nextUpcomingClassIds.add('stale-id');

    findNextUpcomingClasses(ctx, APP_CONFIG, now);

    // Set should be cleared
    expect(ctx.nextUpcomingClassIds.size).toBe(0);
  });

  it('clears set and returns when viewing a different day than today', () => {
    // Monday (todayIndex=0) but viewing day 3
    const now = new Date('2026-06-22T10:00:00');
    const ctx = makeFindCtx({
      currentDayIndex: 3, // not today
      scheduleData: {
        'Room A': { 3: [{ id: 'c1', timeStart: '10:15' }] },
      },
    });
    ctx.nextUpcomingClassIds.add('stale-id');

    findNextUpcomingClasses(ctx, APP_CONFIG, now);

    expect(ctx.nextUpcomingClassIds.size).toBe(0);
  });

  it('falls back to Rule 2 (nearest next) when no courses within 30min threshold', () => {
    // Monday 08:00 — courses at 09:00 (60min) and 10:00 (120min)
    const now = new Date('2026-06-22T08:00:00');
    const ctx = makeFindCtx({
      currentDayIndex: 0,
      scheduleData: {
        'Room A': {
          0: [
            { id: 'c1', timeStart: '09:00' },  // 60min → outside threshold
            { id: 'c2', timeStart: '10:00' },  // 120min → outside threshold
          ],
        },
      },
    });

    findNextUpcomingClasses(ctx, APP_CONFIG, now);

    // Rule 2: nearest next = 09:00 (c1)
    expect(ctx.nextUpcomingClassIds.has('c1')).toBe(true);
    expect(ctx.nextUpcomingClassIds.has('c2')).toBe(false);
    expect(ctx.nextUpcomingClassIds.size).toBe(1);
  });

  it('adds multiple courses with the same nearest start time (Rule 2)', () => {
    // Monday 08:00 — two courses at 09:00 in different classrooms
    const now = new Date('2026-06-22T08:00:00');
    const ctx = makeFindCtx({
      currentDayIndex: 0,
      scheduleData: {
        'Room A': {
          0: [{ id: 'c1', timeStart: '09:00' }],
        },
        'Room B': {
          0: [{ id: 'c2', timeStart: '09:00' }],
        },
      },
    });

    findNextUpcomingClasses(ctx, APP_CONFIG, now);

    // Both courses share the nearest start time
    expect(ctx.nextUpcomingClassIds.has('c1')).toBe(true);
    expect(ctx.nextUpcomingClassIds.has('c2')).toBe(true);
    expect(ctx.nextUpcomingClassIds.size).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════
// saveDataToServer
// ═══════════════════════════════════════════════════════════════════

// makeSaveCtx imported from stateHelpers.fixtures.js

describe('saveDataToServer', () => {
  it('saves successfully and updates state (happy path)', async () => {
    const ctx = makeSaveCtx();
    const mockApi = {
      call: vi.fn().mockResolvedValue({ success: true, lastModified: '2026-06-22T12:00:00Z' }),
    };

    await saveDataToServer(ctx, mockApi);

    // ServerApi called with correct data
    expect(mockApi.call).toHaveBeenCalledWith('saveData', expect.objectContaining({
      scheduleId: 'sched-1',
      lastModified: '2026-01-01T00:00:00Z',
    }));
    // State updated
    expect(ctx.scheduleLastModified['sched-1']).toBe('2026-06-22T12:00:00Z');
    expect(ctx.lastSyncTime).toBeInstanceOf(Date);
    // History callbacks
    expect(ctx.historyModule.updateCleanSnapshot).toHaveBeenCalledOnce();
    expect(ctx.historyModule.checkDirty).toHaveBeenCalledOnce();
    // Loading state: start then end(success)
    expect(ctx.ui.manageLoadingState).toHaveBeenCalledTimes(2);
    expect(ctx.ui.manageLoadingState).toHaveBeenNthCalledWith(1, 'start', expect.any(Object));
    expect(ctx.ui.manageLoadingState).toHaveBeenNthCalledWith(2, 'end', expect.objectContaining({ success: true }));
    // isConnecting reset
    expect(ctx.isConnecting).toBe(false);
  });

  it('returns immediately when isConnecting is true (guard)', async () => {
    const ctx = makeSaveCtx({ isConnecting: true });
    const mockApi = { call: vi.fn() };

    await saveDataToServer(ctx, mockApi);

    // ServerApi never called
    expect(mockApi.call).not.toHaveBeenCalled();
    expect(ctx.ui.manageLoadingState).not.toHaveBeenCalled();
  });

  it('handles conflict response (showConfirm + loading end with isConflict)', async () => {
    const ctx = makeSaveCtx();
    const mockApi = {
      call: vi.fn().mockResolvedValue({ conflict: true, error: 'Version conflict!' }),
    };

    await saveDataToServer(ctx, mockApi);

    // Conflict UI shown
    expect(ctx.modals.showConfirm).toHaveBeenCalledWith('Version conflict!', true);
    // Loading ended with isConflict
    expect(ctx.ui.manageLoadingState).toHaveBeenLastCalledWith('end', expect.objectContaining({
      success: false,
      isConflict: true,
    }));
    // History NOT updated (conflict = no save)
    expect(ctx.historyModule.updateCleanSnapshot).not.toHaveBeenCalled();
    // isConnecting reset
    expect(ctx.isConnecting).toBe(false);
  });

  it('handles error thrown by ServerApi.call', async () => {
    const ctx = makeSaveCtx();
    const mockApi = {
      call: vi.fn().mockRejectedValue(new Error('Network failure')),
    };

    await saveDataToServer(ctx, mockApi);

    // Loading ended with failure message
    expect(ctx.ui.manageLoadingState).toHaveBeenLastCalledWith('end', expect.objectContaining({
      success: false,
      message: expect.stringContaining('Network failure'),
    }));
    // isConnecting reset in finally
    expect(ctx.isConnecting).toBe(false);
  });

  it('throws when scheduleLastModified has no timestamp for active schedule', async () => {
    const ctx = makeSaveCtx({
      scheduleLastModified: {}, // missing timestamp for sched-1
    });
    const mockApi = { call: vi.fn() };

    await saveDataToServer(ctx, mockApi);

    // ServerApi never called (throw before call)
    expect(mockApi.call).not.toHaveBeenCalled();
    // Loading ended with error
    expect(ctx.ui.manageLoadingState).toHaveBeenLastCalledWith('end', expect.objectContaining({
      success: false,
      message: expect.stringContaining('找不到當前課表的版本資訊'),
    }));
    // isConnecting reset in finally
    expect(ctx.isConnecting).toBe(false);
  });
});

