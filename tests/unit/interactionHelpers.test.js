import { applyDrop, applyNameRename, applyTeacherRename, resolveKeyAction, resolveClickAction } from '../lib/interactionHelpers.js';
import { describe, it, expect } from 'vitest';

// ── Helper: timeToMinutes ───────────────────────────────────────
function timeToMinutes(timeStr) {
  try {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  } catch { return 0; }
}

// ── Helper: create schedule data ────────────────────────────────
function makeScheduleData() {
  return {
    'Room A': {
      0: [
        { id: '1', name: 'Math', timeStart: '08:00', timeEnd: '09:00', teacher: 'Alice' },
        { id: '2', name: 'English', timeStart: '09:00', timeEnd: '10:00', teacher: 'Bob' },
      ],
      1: [
        { id: '3', name: 'Science', timeStart: '10:00', timeEnd: '11:00', teacher: 'Carol' },
      ],
    },
    'Room B': {
      0: [
        { id: '4', name: 'Art', timeStart: '14:00', timeEnd: '15:00', teacher: 'Dave' },
      ],
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// applyDrop — drag-and-drop data mutation
// ═══════════════════════════════════════════════════════════════════
describe('applyDrop (#86)', () => {
  it('moves item from one classroom/day to another (happy path)', () => {
    const data = makeScheduleData();
    const result = applyDrop(data, 'Room A', 0, 'Room B', 0, '1', 0, timeToMinutes);

    expect(result.success).toBe(true);
    expect(result.reason).toBe('moved');
    // Math should be in Room B day 0
    expect(data['Room B'][0].some(c => c.id === '1')).toBe(true);
    // Math should be gone from Room A day 0
    expect(data['Room A'][0].some(c => c.id === '1')).toBe(false);
  });

  it('returns same-cell for same classroom and day', () => {
    const data = makeScheduleData();
    const result = applyDrop(data, 'Room A', 0, 'Room A', 0, '1', 0, timeToMinutes);

    expect(result.success).toBe(true);
    expect(result.reason).toBe('same-cell');
    // Data unchanged
    expect(data['Room A'][0].length).toBe(2);
  });

  it('returns item-not-found when classId does not exist', () => {
    const data = makeScheduleData();
    const result = applyDrop(data, 'Room A', 0, 'Room B', 0, 'nonexistent', 0, timeToMinutes);

    expect(result.success).toBe(false);
    expect(result.reason).toBe('item-not-found');
  });

  it('creates target classroom/day if they do not exist', () => {
    const data = makeScheduleData();
    const result = applyDrop(data, 'Room A', 0, 'Room C', 2, '1', 0, timeToMinutes);

    expect(result.success).toBe(true);
    expect(data['Room C']).toBeDefined();
    expect(data['Room C'][2]).toBeDefined();
    expect(data['Room C'][2][0].id).toBe('1');
  });

  it('cleans up empty source day after move', () => {
    const data = makeScheduleData();
    // Room A day 1 has only 1 item (id: '3')
    const result = applyDrop(data, 'Room A', 1, 'Room B', 0, '3', 0, timeToMinutes);

    expect(result.success).toBe(true);
    // Day 1 should be deleted (was emptied)
    expect(data['Room A'][1]).toBeUndefined();
  });

  it('does not clean up source day if items remain', () => {
    const data = makeScheduleData();
    // Room A day 0 has 2 items, remove 1
    applyDrop(data, 'Room A', 0, 'Room B', 0, '1', 0, timeToMinutes);

    // Day 0 still has English (id: '2')
    expect(data['Room A'][0]).toBeDefined();
    expect(data['Room A'][0].length).toBe(1);
    expect(data['Room A'][0][0].id).toBe('2');
  });

  it('sorts target day by timeStart after insertion', () => {
    const data = {
      'Room A': {
        0: [{ id: '1', name: 'Late', timeStart: '14:00', timeEnd: '15:00' }],
      },
      'Room B': {
        0: [{ id: '2', name: 'Early', timeStart: '08:00', timeEnd: '09:00' }],
      },
    };

    // Move Late (14:00) into Room B which has Early (08:00)
    applyDrop(data, 'Room A', 0, 'Room B', 0, '1', 0, timeToMinutes);

    // After sort, Early should be first
    expect(data['Room B'][0][0].name).toBe('Early');
    expect(data['Room B'][0][1].name).toBe('Late');
  });

  it('handles move from empty source array gracefully', () => {
    const data = { 'Room A': { 0: [] } };
    const result = applyDrop(data, 'Room A', 0, 'Room B', 0, 'x', 0, timeToMinutes);

    expect(result.success).toBe(false);
    expect(result.reason).toBe('item-not-found');
  });
});

// ═══════════════════════════════════════════════════════════════════
// applyNameRename — batch name propagation
// ═══════════════════════════════════════════════════════════════════
describe('applyNameRename (#86)', () => {
  it('renames all occurrences of a course name across schedule', () => {
    const data = {
      'Room A': { 0: [{ name: 'Math' }, { name: 'Math' }] },
      'Room B': { 0: [{ name: 'Math' }, { name: 'Art' }] },
    };

    const count = applyNameRename(data, 'Math', 'Mathematics', []);
    expect(count).toBe(3);
    expect(data['Room A'][0][0].name).toBe('Mathematics');
    expect(data['Room A'][0][1].name).toBe('Mathematics');
    expect(data['Room B'][0][0].name).toBe('Mathematics');
    expect(data['Room B'][0][1].name).toBe('Art'); // unchanged
  });

  it('updates active filter when name filter matches', () => {
    const data = { 'Room A': { 0: [{ name: 'Math' }] } };
    const filters = [
      { type: 'name', value: 'Math' },
      { type: 'tag', value: 'core' },
    ];

    applyNameRename(data, 'Math', 'Mathematics', filters);
    expect(filters[0].value).toBe('Mathematics');
    expect(filters[1].value).toBe('core'); // unchanged
  });

  it('does not crash when no matching filter exists', () => {
    const data = { 'Room A': { 0: [{ name: 'Math' }] } };
    const filters = [{ type: 'tag', value: 'core' }];

    const count = applyNameRename(data, 'Math', 'Mathematics', filters);
    expect(count).toBe(1);
    expect(filters.length).toBe(1); // no new filter added
  });

  it('returns 0 when no occurrences match', () => {
    const data = { 'Room A': { 0: [{ name: 'Art' }] } };
    const count = applyNameRename(data, 'Math', 'Mathematics', []);
    expect(count).toBe(0);
  });

  it('handles null activeFilters gracefully', () => {
    const data = { 'Room A': { 0: [{ name: 'Math' }] } };
    const count = applyNameRename(data, 'Math', 'Mathematics', null);
    expect(count).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// applyTeacherRename — batch teacher propagation
// ═══════════════════════════════════════════════════════════════════
describe('applyTeacherRename (#86)', () => {
  it('renames teacher for matching course name + teacher combo', () => {
    const data = {
      'Room A': { 0: [
        { name: 'Math', teacher: 'Alice' },
        { name: 'Math', teacher: 'Bob' },  // different teacher
      ]},
      'Room B': { 0: [
        { name: 'Math', teacher: 'Alice' },
      ]},
    };

    const count = applyTeacherRename(data, 'Math', 'Alice', 'Dr. Alice');
    expect(count).toBe(2);
    expect(data['Room A'][0][0].teacher).toBe('Dr. Alice');
    expect(data['Room A'][0][1].teacher).toBe('Bob'); // unchanged
    expect(data['Room B'][0][0].teacher).toBe('Dr. Alice');
  });

  it('returns 0 when no match found', () => {
    const data = { 'Room A': { 0: [{ name: 'Art', teacher: 'Carol' }] } };
    const count = applyTeacherRename(data, 'Math', 'Alice', 'Dr. Alice');
    expect(count).toBe(0);
  });

  it('only matches exact course name (not partial)', () => {
    const data = {
      'Room A': { 0: [
        { name: 'Math', teacher: 'Alice' },
        { name: 'Mathematics', teacher: 'Alice' },
      ]},
    };

    const count = applyTeacherRename(data, 'Math', 'Alice', 'Dr. Alice');
    expect(count).toBe(1);
    expect(data['Room A'][0][1].teacher).toBe('Alice'); // unchanged
  });
});

// ═══════════════════════════════════════════════════════════════════
// resolveKeyAction — keyboard shortcut decision logic
// ═══════════════════════════════════════════════════════════════════
describe('resolveKeyAction (#86)', () => {
  it('Escape closes confirm modal first (highest priority)', () => {
    const result = resolveKeyAction(
      { key: 'Escape' },
      { confirmModalVisible: true, hasActiveInlineForm: true, openModalCount: 1 }
    );
    expect(result.action).toBe('close-confirm');
  });

  it('Escape closes inline form when no confirm modal', () => {
    const result = resolveKeyAction(
      { key: 'Escape' },
      { confirmModalVisible: false, hasActiveInlineForm: true, openModalCount: 0 }
    );
    expect(result.action).toBe('close-inline-form');
  });

  it('Escape closes modal when no confirm or inline form', () => {
    const result = resolveKeyAction(
      { key: 'Escape' },
      { confirmModalVisible: false, hasActiveInlineForm: false, openModalCount: 2 }
    );
    expect(result.action).toBe('close-modal');
  });

  it('Escape returns null when nothing to close', () => {
    const result = resolveKeyAction(
      { key: 'Escape' },
      { confirmModalVisible: false, hasActiveInlineForm: false, openModalCount: 0 }
    );
    expect(result).toBeNull();
  });

  it('Ctrl+Z triggers undo', () => {
    const result = resolveKeyAction(
      { key: 'z', ctrlKey: true, shiftKey: false },
      { confirmModalVisible: false, hasActiveInlineForm: false, openModalCount: 0 }
    );
    expect(result.action).toBe('undo');
  });

  it('Cmd+Z triggers undo (Mac)', () => {
    const result = resolveKeyAction(
      { key: 'z', metaKey: true, shiftKey: false },
      { confirmModalVisible: false, hasActiveInlineForm: false, openModalCount: 0 }
    );
    expect(result.action).toBe('undo');
  });

  it('Ctrl+Y triggers redo', () => {
    const result = resolveKeyAction(
      { key: 'y', ctrlKey: true },
      { confirmModalVisible: false, hasActiveInlineForm: false, openModalCount: 0 }
    );
    expect(result.action).toBe('redo');
  });

  it('Ctrl+Shift+Z triggers redo', () => {
    const result = resolveKeyAction(
      { key: 'z', ctrlKey: true, shiftKey: true },
      { confirmModalVisible: false, hasActiveInlineForm: false, openModalCount: 0 }
    );
    expect(result.action).toBe('redo');
  });

  it('returns null for unhandled keys', () => {
    const result = resolveKeyAction(
      { key: 'a' },
      { confirmModalVisible: false, hasActiveInlineForm: false, openModalCount: 0 }
    );
    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════
// resolveClickAction — schedule body click decision logic
// ═══════════════════════════════════════════════════════════════════
describe('resolveClickAction (#86)', () => {
  const noTimer = { clickTimer: null, lastClickedId: null };

  it('read-only mode: class item click → toggle-selection', () => {
    const result = resolveClickAction(
      { isReadOnly: true, isAllSchedulesView: false, hasActiveInlineForm: false },
      { isClassItem: true, classId: '1' },
      noTimer
    );
    expect(result.action).toBe('toggle-selection');
  });

  it('read-only mode: non-class click → clear-selections', () => {
    const result = resolveClickAction(
      { isReadOnly: true, isAllSchedulesView: false, hasActiveInlineForm: false },
      { isClassItem: false, isDeleteBtn: false, isEmptyCell: false },
      noTimer
    );
    expect(result.action).toBe('clear-selections');
  });

  it('all-schedules view: class item click → toggle-selection', () => {
    const result = resolveClickAction(
      { isReadOnly: false, isAllSchedulesView: true, hasActiveInlineForm: false },
      { isClassItem: true, classId: '1' },
      noTimer
    );
    expect(result.action).toBe('toggle-selection');
  });

  it('active inline form blocks all clicks', () => {
    const result = resolveClickAction(
      { isReadOnly: false, isAllSchedulesView: false, hasActiveInlineForm: true },
      { isClassItem: true, classId: '1' },
      noTimer
    );
    expect(result.action).toBe('blocked');
  });

  it('delete button click → delete action', () => {
    const result = resolveClickAction(
      { isReadOnly: false, isAllSchedulesView: false, hasActiveInlineForm: false },
      { isDeleteBtn: true },
      noTimer
    );
    expect(result.action).toBe('delete');
  });

  it('first click on class item → single-click-class with timer', () => {
    const result = resolveClickAction(
      { isReadOnly: false, isAllSchedulesView: false, hasActiveInlineForm: false },
      { isClassItem: true, classId: '42' },
      noTimer
    );
    expect(result.action).toBe('single-click-class');
    expect(result.newTimerState.clickTimer).toBe('pending');
    expect(result.newTimerState.lastClickedId).toBe('42');
  });

  it('second click on same class item → double-click-class', () => {
    const timerActive = { clickTimer: 'pending', lastClickedId: '42' };
    const result = resolveClickAction(
      { isReadOnly: false, isAllSchedulesView: false, hasActiveInlineForm: false },
      { isClassItem: true, classId: '42' },
      timerActive
    );
    expect(result.action).toBe('double-click-class');
    expect(result.newTimerState.clickTimer).toBeNull();
    expect(result.newTimerState.lastClickedId).toBeNull();
  });

  it('click on different class item resets timer', () => {
    const timerActive = { clickTimer: 'pending', lastClickedId: '42' };
    const result = resolveClickAction(
      { isReadOnly: false, isAllSchedulesView: false, hasActiveInlineForm: false },
      { isClassItem: true, classId: '99' },
      timerActive
    );
    expect(result.action).toBe('single-click-class');
    expect(result.newTimerState.lastClickedId).toBe('99');
  });

  it('first click on empty cell → single-click-empty-cell with timer', () => {
    const result = resolveClickAction(
      { isReadOnly: false, isAllSchedulesView: false, hasActiveInlineForm: false },
      { isClassItem: false, isDeleteBtn: false, isEmptyCell: true, cellKey: 'empty-RoomA-0' },
      noTimer
    );
    expect(result.action).toBe('single-click-empty-cell');
    expect(result.newTimerState.clickTimer).toBe('pending');
    expect(result.newTimerState.lastClickedId).toBe('empty-RoomA-0');
  });

  it('double click on empty cell → double-click-empty-cell', () => {
    const timerActive = { clickTimer: 'pending', lastClickedId: 'empty-RoomA-0' };
    const result = resolveClickAction(
      { isReadOnly: false, isAllSchedulesView: false, hasActiveInlineForm: false },
      { isClassItem: false, isDeleteBtn: false, isEmptyCell: true, cellKey: 'empty-RoomA-0' },
      timerActive
    );
    expect(result.action).toBe('double-click-empty-cell');
    expect(result.newTimerState.clickTimer).toBeNull();
  });
});
