import { findNextUpcomingClasses, saveDataToServer } from '../lib/stateHelpers.js';
import { describe, it, expect, vi } from 'vitest';
import { APP_CONFIG, timeToMinutes, makeFindCtx, makeSaveCtx } from './stateHelpers.fixtures.js';

// Fixtures imported from stateHelpers.fixtures.js

// ═══════════════════════════════════════════════════════════════════
// findNextUpcomingClasses — GAP
// ═══════════════════════════════════════════════════════════════════
describe('findNextUpcomingClasses (GAP)', () => {
  it('set remains empty when all courses are in the past', () => {
    // Monday 15:00 — all courses already passed
    const now = new Date('2026-06-22T15:00:00');
    const ctx = makeFindCtx({
      currentDayIndex: 0,
      scheduleData: {
        'Room A': {
          0: [
            { id: 'c1', timeStart: '08:00' },
            { id: 'c2', timeStart: '12:00' },
          ],
        },
      },
    });

    findNextUpcomingClasses(ctx, APP_CONFIG, now);

    expect(ctx.nextUpcomingClassIds.size).toBe(0);
  });

  it('includes course starting exactly at current time (>= boundary)', () => {
    // Monday 10:00 — course at exactly 10:00
    const now = new Date('2026-06-22T10:00:00');
    const ctx = makeFindCtx({
      currentDayIndex: 0,
      scheduleData: {
        'Room A': {
          0: [{ id: 'c1', timeStart: '10:00' }],
        },
      },
    });

    findNextUpcomingClasses(ctx, APP_CONFIG, now);

    // timeDifference = 0, which is >= 0 AND <= 30 → within threshold
    expect(ctx.nextUpcomingClassIds.has('c1')).toBe(true);
  });

  it('includes course at exactly 30min threshold boundary (<=30)', () => {
    // Monday 10:00 — course at 10:30 (exactly 30min away)
    const now = new Date('2026-06-22T10:00:00');
    const ctx = makeFindCtx({
      currentDayIndex: 0,
      scheduleData: {
        'Room A': {
          0: [{ id: 'c1', timeStart: '10:30' }],
        },
      },
    });

    findNextUpcomingClasses(ctx, APP_CONFIG, now);

    // timeDifference = 30, which is <= 30 → within threshold
    expect(ctx.nextUpcomingClassIds.has('c1')).toBe(true);
    expect(ctx.nextUpcomingClassIds.size).toBe(1);
  });

  it('excludes course at 31min (just outside threshold) — falls to Rule 2', () => {
    // Monday 10:00 — course at 10:31 (31min away, outside threshold)
    const now = new Date('2026-06-22T10:00:00');
    const ctx = makeFindCtx({
      currentDayIndex: 0,
      scheduleData: {
        'Room A': {
          0: [{ id: 'c1', timeStart: '10:31' }],
        },
      },
    });

    findNextUpcomingClasses(ctx, APP_CONFIG, now);

    // 31min > 30 → not in threshold, but it's the only future course → Rule 2
    expect(ctx.nextUpcomingClassIds.has('c1')).toBe(true);
    expect(ctx.nextUpcomingClassIds.size).toBe(1);
  });

  it('handles Sunday correctly (getDay()=0 → todayIndex=6)', () => {
    // Sunday: getDay() = 0 → todayIndex = 6
    const now = new Date('2026-06-28T10:00:00'); // Sunday
    expect(now.getDay()).toBe(0); // sanity check
    const ctx = makeFindCtx({
      currentDayIndex: 6, // viewing Sunday
      scheduleData: {
        'Room A': {
          6: [{ id: 'c1', timeStart: '10:15' }],
        },
      },
    });

    findNextUpcomingClasses(ctx, APP_CONFIG, now);

    expect(ctx.nextUpcomingClassIds.has('c1')).toBe(true);
  });

  it('handles Saturday correctly (getDay()=6 → todayIndex=5)', () => {
    // Saturday: getDay() = 6 → todayIndex = 5
    const now = new Date('2026-06-27T10:00:00'); // Saturday
    expect(now.getDay()).toBe(6); // sanity check
    const ctx = makeFindCtx({
      currentDayIndex: 5,
      scheduleData: {
        'Room A': {
          5: [{ id: 'c1', timeStart: '10:15' }],
        },
      },
    });

    findNextUpcomingClasses(ctx, APP_CONFIG, now);

    expect(ctx.nextUpcomingClassIds.has('c1')).toBe(true);
  });

  it('clears pre-existing stale IDs even on happy path (clear + refill)', () => {
    const now = new Date('2026-06-22T10:00:00');
    const staleSet = new Set(['old-1', 'old-2']);
    const ctx = makeFindCtx({
      nextUpcomingClassIds: staleSet,
      currentDayIndex: 0,
      scheduleData: {
        'Room A': {
          0: [{ id: 'c1', timeStart: '10:15' }],
        },
      },
    });

    findNextUpcomingClasses(ctx, APP_CONFIG, now);

    // Stale IDs gone, only new one present
    expect(ctx.nextUpcomingClassIds.has('old-1')).toBe(false);
    expect(ctx.nextUpcomingClassIds.has('old-2')).toBe(false);
    expect(ctx.nextUpcomingClassIds.has('c1')).toBe(true);
    expect(ctx.nextUpcomingClassIds.size).toBe(1);
  });

  it('handles classroom with no courses for todayIndex (optional chaining)', () => {
    const now = new Date('2026-06-22T10:00:00');
    const ctx = makeFindCtx({
      currentDayIndex: 0,
      scheduleData: {
        'Room A': {
          // day 0 doesn't exist, only day 1
          1: [{ id: 'c1', timeStart: '10:15' }],
        },
        'Room B': {
          0: [{ id: 'c2', timeStart: '10:15' }],
        },
      },
    });

    findNextUpcomingClasses(ctx, APP_CONFIG, now);

    // Room A's day 0 missing → skipped via ?. ; Room B's day 0 found
    expect(ctx.nextUpcomingClassIds.has('c1')).toBe(false);
    expect(ctx.nextUpcomingClassIds.has('c2')).toBe(true);
  });

  it('multiple courses within threshold are all included', () => {
    // Monday 10:00 — three courses within 30min
    const now = new Date('2026-06-22T10:00:00');
    const ctx = makeFindCtx({
      currentDayIndex: 0,
      scheduleData: {
        'Room A': {
          0: [
            { id: 'c1', timeStart: '10:05' },
            { id: 'c2', timeStart: '10:20' },
          ],
        },
        'Room B': {
          0: [{ id: 'c3', timeStart: '10:29' }],
        },
      },
    });

    findNextUpcomingClasses(ctx, APP_CONFIG, now);

    expect(ctx.nextUpcomingClassIds.has('c1')).toBe(true);
    expect(ctx.nextUpcomingClassIds.has('c2')).toBe(true);
    expect(ctx.nextUpcomingClassIds.has('c3')).toBe(true);
    expect(ctx.nextUpcomingClassIds.size).toBe(3);
  });

  it('empty scheduleData → set stays empty', () => {
    const now = new Date('2026-06-22T10:00:00');
    const ctx = makeFindCtx({
      currentDayIndex: 0,
      scheduleData: {},
    });

    findNextUpcomingClasses(ctx, APP_CONFIG, now);

    expect(ctx.nextUpcomingClassIds.size).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// saveDataToServer — GAP
// ═══════════════════════════════════════════════════════════════════
describe('saveDataToServer (GAP)', () => {
  it('handles null response from ServerApi.call (saveResult is null)', async () => {
    const ctx = makeSaveCtx();
    const mockApi = {
      call: vi.fn().mockResolvedValue(null),
    };

    await saveDataToServer(ctx, mockApi);

    // null saveResult → !saveResult is true → throws '儲存時發生未知錯誤'
    expect(ctx.ui.manageLoadingState).toHaveBeenLastCalledWith('end', expect.objectContaining({
      success: false,
      message: expect.stringContaining('未知錯誤'),
    }));
    expect(ctx.isConnecting).toBe(false);
  });

  it('handles saveResult.success=false with custom error message', async () => {
    const ctx = makeSaveCtx();
    const mockApi = {
      call: vi.fn().mockResolvedValue({ success: false, error: '伺服器忙碌中' }),
    };

    await saveDataToServer(ctx, mockApi);

    expect(ctx.ui.manageLoadingState).toHaveBeenLastCalledWith('end', expect.objectContaining({
      success: false,
      message: expect.stringContaining('伺服器忙碌中'),
    }));
    expect(ctx.historyModule.updateCleanSnapshot).not.toHaveBeenCalled();
    expect(ctx.isConnecting).toBe(false);
  });

  it('handles saveResult.success=false without error field (fallback message)', async () => {
    const ctx = makeSaveCtx();
    const mockApi = {
      call: vi.fn().mockResolvedValue({ success: false }),
    };

    await saveDataToServer(ctx, mockApi);

    // Uses fallback: '儲存時發生未知錯誤'
    expect(ctx.ui.manageLoadingState).toHaveBeenLastCalledWith('end', expect.objectContaining({
      success: false,
      message: expect.stringContaining('未知錯誤'),
    }));
    expect(ctx.isConnecting).toBe(false);
  });

  it('sets isConnecting to true during execution (then false in finally)', async () => {
    let capturedIsConnecting;
    const ctx = makeSaveCtx();
    const mockApi = {
      call: vi.fn().mockImplementation(async () => {
        // Capture isConnecting state during API call
        capturedIsConnecting = ctx.isConnecting;
        return { success: true, lastModified: '2026-01-02T00:00:00Z' };
      }),
    };

    await saveDataToServer(ctx, mockApi);

    expect(capturedIsConnecting).toBe(true);  // was true during call
    expect(ctx.isConnecting).toBe(false);     // reset in finally
  });

  it('verifies manageLoadingState start message contains Chinese text', async () => {
    const ctx = makeSaveCtx();
    const mockApi = {
      call: vi.fn().mockResolvedValue({ success: true, lastModified: '2026-01-02T00:00:00Z' }),
    };

    await saveDataToServer(ctx, mockApi);

    // First call is 'start' with specific message
    expect(ctx.ui.manageLoadingState).toHaveBeenNthCalledWith(1, 'start', {
      message: '正在檢查版本並儲存至雲端...',
    });
  });

  it('sends correct nested data payload to ServerApi', async () => {
    const ctx = makeSaveCtx({
      classrooms: ['Room A', 'Room B'],
      scheduleData: { 'Room A': { 0: [{ id: '1' }] } },
      tags: ['math', 'art'],
    });
    const mockApi = {
      call: vi.fn().mockResolvedValue({ success: true, lastModified: '2026-01-02T00:00:00Z' }),
    };

    await saveDataToServer(ctx, mockApi);

    const payload = mockApi.call.mock.calls[0][1];
    // Verify nested scheduleData structure
    expect(payload.scheduleData).toEqual({
      classrooms: ['Room A', 'Room B'],
      scheduleData: { 'Room A': { 0: [{ id: '1' }] } },
      tags: ['math', 'art'],
    });
    expect(payload.scheduleId).toBe('sched-1');
    expect(payload.lastModified).toBe('2026-01-01T00:00:00Z');
  });

  it('conflict path also resets isConnecting in finally block', async () => {
    const ctx = makeSaveCtx();
    const mockApi = {
      call: vi.fn().mockResolvedValue({ conflict: true, error: 'conflict' }),
    };

    await saveDataToServer(ctx, mockApi);

    // Verify isConnecting is reset even after conflict (via finally)
    expect(ctx.isConnecting).toBe(false);
    // Verify conflict was handled (showConfirm called)
    expect(ctx.modals.showConfirm).toHaveBeenCalledOnce();
  });

  it('success path updates scheduleLastModified with server-returned timestamp', async () => {
    const ctx = makeSaveCtx({
      scheduleLastModified: { 'sched-1': 'old-timestamp' },
    });
    const mockApi = {
      call: vi.fn().mockResolvedValue({ success: true, lastModified: 'new-server-timestamp' }),
    };

    await saveDataToServer(ctx, mockApi);

    expect(ctx.scheduleLastModified['sched-1']).toBe('new-server-timestamp');
    expect(ctx.lastSyncTime).toBeInstanceOf(Date);
  });
});
