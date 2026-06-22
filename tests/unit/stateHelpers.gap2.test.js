import { handleEditClassroom } from '../lib/stateHelpers.js';
import { describe, it, expect, vi } from 'vitest';

// ── Helper: build a mock context for handleEditClassroom GAP tests ──
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

describe('handleEditClassroom — GAP', () => {
  // ── Falsy newName guard: SPEC only tested '', these cover other falsy values ──

  it('shows error when newName is null', () => {
    const ctx = makeCtx();
    handleEditClassroom('Room A', null, ctx);
    expect(ctx.ui.showNotification).toHaveBeenCalledWith('教室名稱不能為空！', 'error');
    expect(ctx.ui.updateClassroomList).not.toHaveBeenCalled();
  });

  it('shows error when newName is undefined', () => {
    const ctx = makeCtx();
    handleEditClassroom('Room A', undefined, ctx);
    expect(ctx.ui.showNotification).toHaveBeenCalledWith('教室名稱不能為空！', 'error');
    expect(ctx.saveDataToLocal).not.toHaveBeenCalled();
  });

  // ── Rename to self: oldName === newName ──
  // classrooms already contains oldName, so includes(newName) triggers duplicate guard
  it('treats rename-to-self as duplicate (oldName === newName)', () => {
    const ctx = makeCtx();
    handleEditClassroom('Room A', 'Room A', ctx);
    expect(ctx.ui.showNotification).toHaveBeenCalledWith(
      '教室名稱 "Room A" 已存在！', 'error'
    );
    // State unchanged
    expect(ctx.classrooms).toEqual(['Room A', 'Room B', 'Room C']);
    expect(ctx.scheduleData['Room A']).toBeDefined();
    expect(ctx.ui.updateClassroomList).not.toHaveBeenCalled();
  });

  // ── Side-effect call ORDER ──
  // Production code: updateClassroomList → renderScheduleTable → saveDataToLocal → saveState → showNotification(success)
  it('calls side effects in the correct order', () => {
    const callOrder = [];
    const ctx = makeCtx({
      showNotification: vi.fn(() => callOrder.push('showNotification')),
      updateClassroomList: vi.fn(() => callOrder.push('updateClassroomList')),
      renderScheduleTable: vi.fn(() => callOrder.push('renderScheduleTable')),
      saveDataToLocal: vi.fn(() => callOrder.push('saveDataToLocal')),
      saveState: vi.fn(() => callOrder.push('saveState')),
    });
    handleEditClassroom('Room A', 'Room Z', ctx);
    expect(callOrder).toEqual([
      'updateClassroomList',
      'renderScheduleTable',
      'saveDataToLocal',
      'saveState',
      'showNotification',
    ]);
  });

  // ── scheduleData reference preservation ──
  // After rename, the value at the new key should be the SAME reference (not a deep copy)
  it('preserves scheduleData value reference after rename (not a copy)', () => {
    const dayData = { 0: [{ id: '1', name: 'Math' }] };
    const ctx = makeCtx({
      scheduleData: { 'Room A': dayData },
    });
    handleEditClassroom('Room A', 'Room Z', ctx);
    expect(ctx.scheduleData['Room Z']).toBe(dayData); // same reference
  });

  // ── Success notification has no type arg (unlike error which passes 'error') ──
  it('success notification is called without a type argument', () => {
    const ctx = makeCtx();
    handleEditClassroom('Room A', 'Room Z', ctx);
    // showNotification is called twice: never for error in success path, just once for success
    expect(ctx.ui.showNotification).toHaveBeenCalledTimes(1);
    // Verify it was called with exactly 1 argument (no type parameter)
    const call = ctx.ui.showNotification.mock.calls[0];
    expect(call).toHaveLength(1);
    expect(call[0]).toContain('Room A');
    expect(call[0]).toContain('Room Z');
  });

  // ── Whitespace-only newName passes the falsy guard ──
  // '  ' is truthy, so !newName is false → proceeds with rename (documenting behavior)
  it('allows whitespace-only newName (truthy, passes guard)', () => {
    const ctx = makeCtx();
    handleEditClassroom('Room A', '   ', ctx);
    // Should proceed (no error notification for empty-guard)
    // classrooms array updated
    expect(ctx.classrooms).toContain('   ');
    expect(ctx.classrooms).not.toContain('Room A');
    // Side effects called
    expect(ctx.ui.updateClassroomList).toHaveBeenCalledOnce();
    expect(ctx.saveDataToLocal).toHaveBeenCalledOnce();
  });

  // ── Both oldName missing from classrooms AND scheduleData ──
  // Side effects still fire even when neither state structure contains oldName
  it('fires side effects even when oldName is in neither classrooms nor scheduleData', () => {
    const ctx = makeCtx({
      classrooms: ['Room B', 'Room C'],
      scheduleData: {
        'Room B': { 0: [{ id: '2', name: 'Art' }] },
      },
    });
    handleEditClassroom('NonExistent', 'Room Z', ctx);
    // classrooms unchanged (NonExistent wasn't in it)
    expect(ctx.classrooms).toEqual(['Room B', 'Room C']);
    // scheduleData: no Room Z added (NonExistent wasn't a key)
    expect(ctx.scheduleData['Room Z']).toBeUndefined();
    // But all side effects still called
    expect(ctx.ui.updateClassroomList).toHaveBeenCalledOnce();
    expect(ctx.ui.renderScheduleTable).toHaveBeenCalledOnce();
    expect(ctx.saveDataToLocal).toHaveBeenCalledOnce();
    expect(ctx.historyModule.saveState).toHaveBeenCalledOnce();
    // Success notification still fires with the names
    expect(ctx.ui.showNotification).toHaveBeenCalledWith(
      '教室名稱已從 "NonExistent" 更新為 "Room Z"'
    );
  });

  // ── Duplicate check is case-sensitive ──
  // 'room a' !== 'Room A' per includes() default behavior
  it('duplicate check is case-sensitive (allows case-different name)', () => {
    const ctx = makeCtx();
    handleEditClassroom('Room A', 'room a', ctx);
    // Should succeed (no error)
    expect(ctx.classrooms).toContain('room a');
    expect(ctx.ui.updateClassroomList).toHaveBeenCalledOnce();
  });

  // ── scheduleData with multiple classrooms: only target key renamed ──
  it('only renames the target classroom key, leaves others intact', () => {
    const ctx = makeCtx();
    const roomBDataBefore = ctx.scheduleData['Room B'];
    handleEditClassroom('Room A', 'Room Z', ctx);
    // Room B untouched (same reference)
    expect(ctx.scheduleData['Room B']).toBe(roomBDataBefore);
    // Old key gone, new key present
    expect(Object.keys(ctx.scheduleData)).toContain('Room Z');
    expect(Object.keys(ctx.scheduleData)).not.toContain('Room A');
  });
});
