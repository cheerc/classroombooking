/**
 * Lock management helpers — DI extraction from JavaScript.html L742-795.
 * Pure logic for client-side tab locking via localStorage.
 * Dependencies injected: tabId, storage (localStorage), nowFn (Date.now).
 *
 * Ref: #136 — Lock management behaviour tests
 * Ref: JavaScript.html L742-795 (App._getLocks, _saveLocks, acquireLock,
 *      releaseLock, releaseCurrentLock, refreshLockHeartbeat)
 */

/** localStorage key used by the lock system. */
export const LOCK_STORAGE_KEY = 'gemini_schedule_locks';

/** Stale threshold in ms — locks older than this are breakable (15s). */
export const STALE_THRESHOLD_MS = 15000;

/**
 * Creates a lock manager with injected dependencies.
 * Mirrors JavaScript.html App lock methods (L742-795).
 *
 * @param {string} tabId - Unique identifier for the current tab.
 * @param {object} storage - localStorage-compatible object (getItem, setItem).
 * @param {function} [nowFn=Date.now] - Function returning current timestamp.
 * @returns {object} Lock manager API.
 */
export function createLockManager(tabId, storage, nowFn = Date.now) {
  /**
   * Read all locks from storage.
   * Ref: JavaScript.html L742-748
   */
  function _getLocks() {
    try {
      return JSON.parse(storage.getItem(LOCK_STORAGE_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  /**
   * Persist locks to storage.
   * Ref: JavaScript.html L750-752
   */
  function _saveLocks(locks) {
    storage.setItem(LOCK_STORAGE_KEY, JSON.stringify(locks));
  }

  return {
    /**
     * Attempt to acquire a lock for the given scheduleId.
     * Returns true if lock acquired, false if held by another non-stale tab.
     * Stale locks (>15s old) from other tabs are broken and re-acquired.
     * Same-tab re-acquisition always succeeds (updates timestamp).
     * Ref: JavaScript.html L754-771
     */
    acquireLock(scheduleId) {
      const locks = _getLocks();
      const existingLock = locks[scheduleId];
      const now = nowFn();

      if (existingLock && existingLock.tabId !== tabId) {
        const isStale = (now - existingLock.timestamp) > STALE_THRESHOLD_MS;
        if (!isStale) {
          return false; // Lock is held by another active tab
        }
        // Stale lock — break it and re-acquire below
      }

      // Acquire or update the lock
      locks[scheduleId] = { tabId, timestamp: now };
      _saveLocks(locks);
      return true;
    },

    /**
     * Release a lock, but only if we are the owner (matching tabId).
     * No-op if scheduleId is falsy or lock is owned by another tab.
     * Ref: JavaScript.html L773-779
     */
    releaseLock(scheduleId) {
      if (!scheduleId) return;
      const locks = _getLocks();
      if (locks[scheduleId] && locks[scheduleId].tabId === tabId) {
        delete locks[scheduleId];
        _saveLocks(locks);
      }
    },

    /**
     * Refresh the heartbeat timestamp for the given schedule's lock.
     * No-op if readOnly, no scheduleId, or lock is not ours.
     * Ref: JavaScript.html L786-795
     */
    refreshLockHeartbeat(scheduleId, isReadOnly = false) {
      if (isReadOnly || !scheduleId) return;
      const locks = _getLocks();
      if (locks[scheduleId] && locks[scheduleId].tabId === tabId) {
        locks[scheduleId].timestamp = nowFn();
        _saveLocks(locks);
      }
    },

    /** Expose for testing internal state inspection. */
    _getLocks,
  };
}
