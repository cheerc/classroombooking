/**
 * Frontend mock infrastructure for testing GAS HTML scriptlet code.
 * Ref: #74, #75 — Wave A P1 mock infra
 */

/**
 * Creates a mock ServerApi that replaces google.script.run.
 * Ref: Api.js.html L1-24
 * @param {Object<string, function>} handlers - Map of function names to mock implementations.
 * @returns {{ call: function, _handlers: object }}
 */
export function createMockServerApi(handlers = {}) {
  const call = async (functionName, ...args) => {
    const handler = handlers[functionName];
    if (!handler) {
      throw new Error(`Server function "${functionName}" not mocked.`);
    }
    return handler(...args);
  };

  return { call, _handlers: handlers };
}

/**
 * Creates a mock localStorage for tab lock testing.
 * Ref: JavaScript.html L742-795
 * @returns {object} A mock localStorage with getItem, setItem, removeItem, clear.
 */
export function createMockStorage() {
  const store = {};
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    _store: store,
  };
}

/**
 * Creates a lock manager extracted from JavaScript.html L742-795.
 * Pure logic, only depends on localStorage + Date.now + tabId.
 * @param {string} tabId - The current tab's unique ID.
 * @param {object} storage - A localStorage-like object.
 * @param {function} [nowFn] - Optional function returning current timestamp (default: Date.now).
 * @returns {object} Lock manager with acquireLock, releaseLock, refreshLockHeartbeat.
 */
export function createLockManager(tabId, storage, nowFn = Date.now) {
  const LOCK_KEY = 'gemini_schedule_locks';
  const STALE_THRESHOLD = 15000;

  function _getLocks() {
    try {
      return JSON.parse(storage.getItem(LOCK_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  function _saveLocks(locks) {
    storage.setItem(LOCK_KEY, JSON.stringify(locks));
  }

  return {
    acquireLock(scheduleId) {
      const locks = _getLocks();
      const existingLock = locks[scheduleId];
      const now = nowFn();

      if (existingLock && existingLock.tabId !== tabId) {
        const isStale = (now - existingLock.timestamp) > STALE_THRESHOLD;
        if (!isStale) {
          return false;
        }
      }

      locks[scheduleId] = { tabId, timestamp: now };
      _saveLocks(locks);
      return true;
    },

    releaseLock(scheduleId) {
      if (!scheduleId) return;
      const locks = _getLocks();
      if (locks[scheduleId] && locks[scheduleId].tabId === tabId) {
        delete locks[scheduleId];
        _saveLocks(locks);
      }
    },

    refreshLockHeartbeat(scheduleId, isReadOnly = false) {
      if (isReadOnly || !scheduleId) return;
      const locks = _getLocks();
      if (locks[scheduleId] && locks[scheduleId].tabId === tabId) {
        locks[scheduleId].timestamp = nowFn();
        _saveLocks(locks);
      }
    },

    _getLocks,
  };
}
