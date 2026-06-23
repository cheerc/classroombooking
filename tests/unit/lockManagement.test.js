/**
 * Lock management behaviour tests — #136
 *
 * Tests the client-side tab locking system extracted from JavaScript.html L742-795.
 * Covers: acquireLock, releaseLock, refreshLockHeartbeat, lock expiry,
 * multi-tab concurrency, localStorage data format, edge cases.
 *
 * Ref: JavaScript.html L742-795 (App lock methods)
 * Ref: tests/mocks/frontendMocks.js (createMockStorage)
 * Closes #136
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createLockManager,
  LOCK_STORAGE_KEY,
  STALE_THRESHOLD_MS,
} from '../lib/lockHelpers.js';
import { createMockStorage } from '../mocks/frontendMocks.js';

// ─── Test Fixtures ──────────────────────────────────────────────────────────

const TAB_A = 'tab-aaa-111';
const TAB_B = 'tab-bbb-222';
const TAB_C = 'tab-ccc-333';
const SCHEDULE_1 = 'sched-001';
const SCHEDULE_2 = 'sched-002';
const BASE_TIME = 1700000000000; // Fixed base timestamp for deterministic tests

// ─── acquireLock ────────────────────────────────────────────────────────────

describe('Lock Management (#136)', () => {
  let storage;

  beforeEach(() => {
    storage = createMockStorage();
  });

  describe('acquireLock', () => {
    it('should acquire lock on uncontested schedule', () => {
      const mgr = createLockManager(TAB_A, storage);
      const result = mgr.acquireLock(SCHEDULE_1);
      expect(result).toBe(true);
    });

    it('should store correct data format in localStorage', () => {
      let currentTime = BASE_TIME;
      const mgr = createLockManager(TAB_A, storage, () => currentTime);
      mgr.acquireLock(SCHEDULE_1);

      const raw = storage.getItem(LOCK_STORAGE_KEY);
      const parsed = JSON.parse(raw);
      expect(parsed[SCHEDULE_1]).toEqual({
        tabId: TAB_A,
        timestamp: BASE_TIME,
      });
    });

    it('should allow same tab to re-acquire (update timestamp)', () => {
      let currentTime = BASE_TIME;
      const mgr = createLockManager(TAB_A, storage, () => currentTime);
      mgr.acquireLock(SCHEDULE_1);

      currentTime = BASE_TIME + 5000;
      const result = mgr.acquireLock(SCHEDULE_1);
      expect(result).toBe(true);

      const locks = mgr._getLocks();
      expect(locks[SCHEDULE_1].timestamp).toBe(BASE_TIME + 5000);
    });

    it('should reject lock held by another active tab', () => {
      let currentTime = BASE_TIME;
      const mgrA = createLockManager(TAB_A, storage, () => currentTime);
      mgrA.acquireLock(SCHEDULE_1);

      currentTime = BASE_TIME + 1000; // 1s later, well within threshold
      const mgrB = createLockManager(TAB_B, storage, () => currentTime);
      const result = mgrB.acquireLock(SCHEDULE_1);
      expect(result).toBe(false);
    });

    it('should break stale lock from another tab', () => {
      let currentTime = BASE_TIME;
      const mgrA = createLockManager(TAB_A, storage, () => currentTime);
      mgrA.acquireLock(SCHEDULE_1);

      // Advance past stale threshold
      currentTime = BASE_TIME + STALE_THRESHOLD_MS + 1;
      const mgrB = createLockManager(TAB_B, storage, () => currentTime);
      const result = mgrB.acquireLock(SCHEDULE_1);
      expect(result).toBe(true);

      // Verify lock is now owned by TAB_B
      const locks = mgrB._getLocks();
      expect(locks[SCHEDULE_1].tabId).toBe(TAB_B);
    });

    it('should not break lock at exactly stale threshold', () => {
      let currentTime = BASE_TIME;
      const mgrA = createLockManager(TAB_A, storage, () => currentTime);
      mgrA.acquireLock(SCHEDULE_1);

      // Exactly at threshold — not stale yet (> not >=)
      currentTime = BASE_TIME + STALE_THRESHOLD_MS;
      const mgrB = createLockManager(TAB_B, storage, () => currentTime);
      const result = mgrB.acquireLock(SCHEDULE_1);
      expect(result).toBe(false);
    });

    it('should allow acquiring different schedules independently', () => {
      const mgr = createLockManager(TAB_A, storage);
      expect(mgr.acquireLock(SCHEDULE_1)).toBe(true);
      expect(mgr.acquireLock(SCHEDULE_2)).toBe(true);

      const locks = mgr._getLocks();
      expect(Object.keys(locks)).toHaveLength(2);
      expect(locks[SCHEDULE_1].tabId).toBe(TAB_A);
      expect(locks[SCHEDULE_2].tabId).toBe(TAB_A);
    });

    it('should handle corrupt localStorage gracefully (_getLocks catch)', () => {
      storage.setItem(LOCK_STORAGE_KEY, '{invalid json');
      const mgr = createLockManager(TAB_A, storage);

      // _getLocks returns {} on parse error → acquireLock should succeed
      const result = mgr.acquireLock(SCHEDULE_1);
      expect(result).toBe(true);
    });

    it('should handle empty localStorage', () => {
      const mgr = createLockManager(TAB_A, storage);
      // No prior data — should acquire cleanly
      const result = mgr.acquireLock(SCHEDULE_1);
      expect(result).toBe(true);
    });
  });

  // ─── releaseLock ────────────────────────────────────────────────────────────

  describe('releaseLock', () => {
    it('should release own lock', () => {
      const mgr = createLockManager(TAB_A, storage);
      mgr.acquireLock(SCHEDULE_1);
      mgr.releaseLock(SCHEDULE_1);

      const locks = mgr._getLocks();
      expect(locks[SCHEDULE_1]).toBeUndefined();
    });

    it('should not release lock owned by another tab', () => {
      let currentTime = BASE_TIME;
      const mgrA = createLockManager(TAB_A, storage, () => currentTime);
      mgrA.acquireLock(SCHEDULE_1);

      const mgrB = createLockManager(TAB_B, storage, () => currentTime);
      mgrB.releaseLock(SCHEDULE_1);

      // Lock should still exist, owned by TAB_A
      const locks = mgrA._getLocks();
      expect(locks[SCHEDULE_1]).toBeDefined();
      expect(locks[SCHEDULE_1].tabId).toBe(TAB_A);
    });

    it('should no-op when scheduleId is falsy (null)', () => {
      const mgr = createLockManager(TAB_A, storage);
      mgr.acquireLock(SCHEDULE_1);
      mgr.releaseLock(null);

      // SCHEDULE_1 lock should still exist
      const locks = mgr._getLocks();
      expect(locks[SCHEDULE_1]).toBeDefined();
    });

    it('should no-op when scheduleId is falsy (undefined)', () => {
      const mgr = createLockManager(TAB_A, storage);
      mgr.acquireLock(SCHEDULE_1);
      mgr.releaseLock(undefined);

      const locks = mgr._getLocks();
      expect(locks[SCHEDULE_1]).toBeDefined();
    });

    it('should no-op when scheduleId is falsy (empty string)', () => {
      const mgr = createLockManager(TAB_A, storage);
      mgr.acquireLock(SCHEDULE_1);
      mgr.releaseLock('');

      const locks = mgr._getLocks();
      expect(locks[SCHEDULE_1]).toBeDefined();
    });

    it('should no-op when releasing non-existent schedule', () => {
      const mgr = createLockManager(TAB_A, storage);
      mgr.acquireLock(SCHEDULE_1);

      // Release a schedule that was never locked — should not throw
      mgr.releaseLock('non-existent-schedule');

      const locks = mgr._getLocks();
      expect(locks[SCHEDULE_1]).toBeDefined();
    });

    it('should only remove the specific schedule lock, not others', () => {
      const mgr = createLockManager(TAB_A, storage);
      mgr.acquireLock(SCHEDULE_1);
      mgr.acquireLock(SCHEDULE_2);

      mgr.releaseLock(SCHEDULE_1);

      const locks = mgr._getLocks();
      expect(locks[SCHEDULE_1]).toBeUndefined();
      expect(locks[SCHEDULE_2]).toBeDefined();
    });
  });

  // ─── refreshLockHeartbeat ─────────────────────────────────────────────────

  describe('refreshLockHeartbeat', () => {
    it('should update timestamp for owned lock', () => {
      let currentTime = BASE_TIME;
      const mgr = createLockManager(TAB_A, storage, () => currentTime);
      mgr.acquireLock(SCHEDULE_1);

      currentTime = BASE_TIME + 5000;
      mgr.refreshLockHeartbeat(SCHEDULE_1);

      const locks = mgr._getLocks();
      expect(locks[SCHEDULE_1].timestamp).toBe(BASE_TIME + 5000);
    });

    it('should not update lock owned by another tab', () => {
      let currentTime = BASE_TIME;
      const mgrA = createLockManager(TAB_A, storage, () => currentTime);
      mgrA.acquireLock(SCHEDULE_1);

      currentTime = BASE_TIME + 5000;
      const mgrB = createLockManager(TAB_B, storage, () => currentTime);
      mgrB.refreshLockHeartbeat(SCHEDULE_1);

      // Timestamp should remain as TAB_A set it
      const locks = mgrA._getLocks();
      expect(locks[SCHEDULE_1].timestamp).toBe(BASE_TIME);
      expect(locks[SCHEDULE_1].tabId).toBe(TAB_A);
    });

    it('should no-op when isReadOnly is true', () => {
      let currentTime = BASE_TIME;
      const mgr = createLockManager(TAB_A, storage, () => currentTime);
      mgr.acquireLock(SCHEDULE_1);

      currentTime = BASE_TIME + 5000;
      mgr.refreshLockHeartbeat(SCHEDULE_1, true);

      const locks = mgr._getLocks();
      expect(locks[SCHEDULE_1].timestamp).toBe(BASE_TIME);
    });

    it('should no-op when scheduleId is falsy (null)', () => {
      const mgr = createLockManager(TAB_A, storage);
      mgr.acquireLock(SCHEDULE_1);
      mgr.refreshLockHeartbeat(null);

      const locks = mgr._getLocks();
      expect(locks[SCHEDULE_1]).toBeDefined();
    });

    it('should no-op when scheduleId is falsy (empty string)', () => {
      const mgr = createLockManager(TAB_A, storage);
      mgr.acquireLock(SCHEDULE_1);
      mgr.refreshLockHeartbeat('');

      const locks = mgr._getLocks();
      expect(locks[SCHEDULE_1]).toBeDefined();
    });

    it('should no-op when schedule has no lock entry', () => {
      const mgr = createLockManager(TAB_A, storage);
      // No lock acquired — refreshing should not throw or create a lock
      mgr.refreshLockHeartbeat(SCHEDULE_1);

      const locks = mgr._getLocks();
      expect(locks[SCHEDULE_1]).toBeUndefined();
    });
  });

  // ─── Lock Expiry Behavior ─────────────────────────────────────────────────

  describe('Lock expiry behavior', () => {
    it('lock should be breakable after stale threshold', () => {
      let currentTime = BASE_TIME;
      const mgrA = createLockManager(TAB_A, storage, () => currentTime);
      mgrA.acquireLock(SCHEDULE_1);

      // 14.999s — not stale
      currentTime = BASE_TIME + STALE_THRESHOLD_MS - 1;
      const mgrB = createLockManager(TAB_B, storage, () => currentTime);
      expect(mgrB.acquireLock(SCHEDULE_1)).toBe(false);

      // 15.001s — stale
      currentTime = BASE_TIME + STALE_THRESHOLD_MS + 1;
      expect(mgrB.acquireLock(SCHEDULE_1)).toBe(true);
    });

    it('heartbeat should prevent expiry', () => {
      let currentTime = BASE_TIME;
      const mgrA = createLockManager(TAB_A, storage, () => currentTime);
      mgrA.acquireLock(SCHEDULE_1);

      // Advance 10s, heartbeat
      currentTime = BASE_TIME + 10000;
      mgrA.refreshLockHeartbeat(SCHEDULE_1);

      // Another 10s (20s total from start, but only 10s from heartbeat)
      currentTime = BASE_TIME + 20000;
      const mgrB = createLockManager(TAB_B, storage, () => currentTime);
      // 10s since last heartbeat — not stale (threshold is 15s)
      expect(mgrB.acquireLock(SCHEDULE_1)).toBe(false);
    });

    it('heartbeat lapse should allow expiry', () => {
      let currentTime = BASE_TIME;
      const mgrA = createLockManager(TAB_A, storage, () => currentTime);
      mgrA.acquireLock(SCHEDULE_1);

      // Heartbeat at 10s
      currentTime = BASE_TIME + 10000;
      mgrA.refreshLockHeartbeat(SCHEDULE_1);

      // 26s from start, 16s from last heartbeat → stale
      currentTime = BASE_TIME + 26000;
      const mgrB = createLockManager(TAB_B, storage, () => currentTime);
      expect(mgrB.acquireLock(SCHEDULE_1)).toBe(true);
    });

    it('stale threshold constant should be 15000ms', () => {
      expect(STALE_THRESHOLD_MS).toBe(15000);
    });
  });

  // ─── Multi-tab Concurrency ────────────────────────────────────────────────

  describe('Multi-tab concurrency', () => {
    it('two tabs should not hold same schedule lock simultaneously', () => {
      let currentTime = BASE_TIME;
      const mgrA = createLockManager(TAB_A, storage, () => currentTime);
      const mgrB = createLockManager(TAB_B, storage, () => currentTime);

      expect(mgrA.acquireLock(SCHEDULE_1)).toBe(true);
      expect(mgrB.acquireLock(SCHEDULE_1)).toBe(false);
    });

    it('different tabs can hold locks on different schedules', () => {
      const mgrA = createLockManager(TAB_A, storage);
      const mgrB = createLockManager(TAB_B, storage);

      expect(mgrA.acquireLock(SCHEDULE_1)).toBe(true);
      expect(mgrB.acquireLock(SCHEDULE_2)).toBe(true);

      const locks = mgrA._getLocks();
      expect(locks[SCHEDULE_1].tabId).toBe(TAB_A);
      expect(locks[SCHEDULE_2].tabId).toBe(TAB_B);
    });

    it('tab B can acquire after tab A releases', () => {
      const mgrA = createLockManager(TAB_A, storage);
      const mgrB = createLockManager(TAB_B, storage);

      mgrA.acquireLock(SCHEDULE_1);
      mgrA.releaseLock(SCHEDULE_1);
      expect(mgrB.acquireLock(SCHEDULE_1)).toBe(true);

      const locks = mgrB._getLocks();
      expect(locks[SCHEDULE_1].tabId).toBe(TAB_B);
    });

    it('three tabs competing for same schedule — only first succeeds', () => {
      let currentTime = BASE_TIME;
      const mgrA = createLockManager(TAB_A, storage, () => currentTime);
      const mgrB = createLockManager(TAB_B, storage, () => currentTime);
      const mgrC = createLockManager(TAB_C, storage, () => currentTime);

      expect(mgrA.acquireLock(SCHEDULE_1)).toBe(true);
      expect(mgrB.acquireLock(SCHEDULE_1)).toBe(false);
      expect(mgrC.acquireLock(SCHEDULE_1)).toBe(false);
    });

    it('tab stealing stale lock should not affect other schedules', () => {
      let currentTime = BASE_TIME;
      const mgrA = createLockManager(TAB_A, storage, () => currentTime);
      mgrA.acquireLock(SCHEDULE_1);
      mgrA.acquireLock(SCHEDULE_2);

      // Tab B steals stale SCHEDULE_1 but SCHEDULE_2 is also stale
      currentTime = BASE_TIME + STALE_THRESHOLD_MS + 1;
      const mgrB = createLockManager(TAB_B, storage, () => currentTime);
      mgrB.acquireLock(SCHEDULE_1);

      // SCHEDULE_2 should still show TAB_A (though stale)
      const locks = mgrB._getLocks();
      expect(locks[SCHEDULE_1].tabId).toBe(TAB_B);
      expect(locks[SCHEDULE_2].tabId).toBe(TAB_A);
    });

    it('releasing from wrong tab should not affect lock holder', () => {
      const mgrA = createLockManager(TAB_A, storage);
      const mgrB = createLockManager(TAB_B, storage);

      mgrA.acquireLock(SCHEDULE_1);
      // Tab B tries to release Tab A's lock
      mgrB.releaseLock(SCHEDULE_1);

      // Tab A's lock should still be intact
      const locks = mgrA._getLocks();
      expect(locks[SCHEDULE_1].tabId).toBe(TAB_A);
    });
  });

  // ─── localStorage Data Format ─────────────────────────────────────────────

  describe('localStorage data format', () => {
    it('should use correct storage key', () => {
      expect(LOCK_STORAGE_KEY).toBe('gemini_schedule_locks');
    });

    it('should store locks as JSON object keyed by scheduleId', () => {
      let currentTime = BASE_TIME;
      const mgr = createLockManager(TAB_A, storage, () => currentTime);
      mgr.acquireLock(SCHEDULE_1);

      const raw = storage.getItem(LOCK_STORAGE_KEY);
      const parsed = JSON.parse(raw);

      expect(typeof parsed).toBe('object');
      expect(parsed).not.toBeNull();
      expect(Object.keys(parsed)).toEqual([SCHEDULE_1]);
    });

    it('each lock entry should have tabId and timestamp', () => {
      let currentTime = BASE_TIME;
      const mgr = createLockManager(TAB_A, storage, () => currentTime);
      mgr.acquireLock(SCHEDULE_1);

      const locks = mgr._getLocks();
      const entry = locks[SCHEDULE_1];
      expect(entry).toHaveProperty('tabId', TAB_A);
      expect(entry).toHaveProperty('timestamp', BASE_TIME);
      expect(Object.keys(entry).sort()).toEqual(['tabId', 'timestamp']);
    });

    it('multiple schedules should co-exist in storage', () => {
      let currentTime = BASE_TIME;
      const mgrA = createLockManager(TAB_A, storage, () => currentTime);
      mgrA.acquireLock(SCHEDULE_1);

      currentTime = BASE_TIME + 100;
      const mgrB = createLockManager(TAB_B, storage, () => currentTime);
      mgrB.acquireLock(SCHEDULE_2);

      const raw = storage.getItem(LOCK_STORAGE_KEY);
      const parsed = JSON.parse(raw);
      expect(Object.keys(parsed).sort()).toEqual([SCHEDULE_1, SCHEDULE_2].sort());
    });

    it('storage should be empty object after releasing all locks', () => {
      const mgr = createLockManager(TAB_A, storage);
      mgr.acquireLock(SCHEDULE_1);
      mgr.acquireLock(SCHEDULE_2);
      mgr.releaseLock(SCHEDULE_1);
      mgr.releaseLock(SCHEDULE_2);

      const raw = storage.getItem(LOCK_STORAGE_KEY);
      const parsed = JSON.parse(raw);
      expect(parsed).toEqual({});
    });

    it('_getLocks should return empty object on null storage value', () => {
      // Storage never written to
      const mgr = createLockManager(TAB_A, storage);
      const locks = mgr._getLocks();
      expect(locks).toEqual({});
    });

    it('_getLocks should return empty object on corrupt JSON', () => {
      storage.setItem(LOCK_STORAGE_KEY, 'not{valid}json[');
      const mgr = createLockManager(TAB_A, storage);
      const locks = mgr._getLocks();
      expect(locks).toEqual({});
    });
  });

  // ─── Edge Cases ───────────────────────────────────────────────────────────

  describe('Edge cases', () => {
    it('should handle scheduleId with special characters', () => {
      const mgr = createLockManager(TAB_A, storage);
      const weirdId = 'sched/with spaces & "quotes"';
      expect(mgr.acquireLock(weirdId)).toBe(true);

      const locks = mgr._getLocks();
      expect(locks[weirdId]).toBeDefined();
      expect(locks[weirdId].tabId).toBe(TAB_A);
    });

    it('should handle numeric scheduleId', () => {
      const mgr = createLockManager(TAB_A, storage);
      expect(mgr.acquireLock(12345)).toBe(true);
    });

    it('should handle rapid acquire-release-acquire cycle', () => {
      let currentTime = BASE_TIME;
      const mgr = createLockManager(TAB_A, storage, () => currentTime);

      mgr.acquireLock(SCHEDULE_1);
      mgr.releaseLock(SCHEDULE_1);
      mgr.acquireLock(SCHEDULE_1);

      const locks = mgr._getLocks();
      expect(locks[SCHEDULE_1]).toBeDefined();
      expect(locks[SCHEDULE_1].tabId).toBe(TAB_A);
    });

    it('should handle release after storage is cleared externally', () => {
      const mgr = createLockManager(TAB_A, storage);
      mgr.acquireLock(SCHEDULE_1);

      // Simulate external clear (e.g., user clears browser data)
      storage.clear();

      // Should not throw
      mgr.releaseLock(SCHEDULE_1);
      expect(mgr._getLocks()).toEqual({});
    });

    it('should handle heartbeat after storage is cleared externally', () => {
      const mgr = createLockManager(TAB_A, storage);
      mgr.acquireLock(SCHEDULE_1);

      storage.clear();

      // Should not throw, should no-op (lock not found)
      mgr.refreshLockHeartbeat(SCHEDULE_1);
      expect(mgr._getLocks()).toEqual({});
    });
  });
});
