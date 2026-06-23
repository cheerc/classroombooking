/**
 * Sync DOM/localStorage Methods Wiring Smoke Tests
 *
 * Ref: #107 — P0 Coverage Sprint Wave 3
 *
 * Strategy: Static analysis (same as Wave 2) — reads JavaScript.html source,
 * extracts each sync method body, and verifies via regex that the method
 * calls its expected dependency functions/APIs. This covers DOM wiring,
 * localStorage usage, and internal method delegation.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ─── Source loading ──────────────────────────────────────────────────────

const jsHtmlSource = readFileSync(
  resolve(import.meta.dirname, '../../JavaScript.html'),
  'utf-8'
);

// ─── Helpers (shared pattern from Wave 2) ────────────────────────────────

/**
 * Extract the body of a method from JavaScript.html source.
 * Supports both sync and async method declarations in the App object literal.
 */
function extractMethodBody(source, methodName) {
  // Match sync or async method declaration in object literal
  const declPattern = new RegExp(
    `${methodName}\\s*:\\s*(?:async\\s+)?function\\s*\\([^)]*\\)\\s*\\{`
  );
  const match = declPattern.exec(source);
  if (!match) return null;

  const startIdx = match.index + match[0].length;
  let depth = 1;
  let i = startIdx;
  while (i < source.length && depth > 0) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') depth--;
    i++;
  }

  return source.substring(match.index, i);
}

/**
 * Check if a code block contains a specific call/reference pattern.
 */
function containsCall(code, pattern) {
  return new RegExp(pattern).test(code);
}

// ─── Expected wiring map ─────────────────────────────────────────────────

/**
 * Sync methods and their expected dependency calls.
 * Format: [methodName, expectedCallPatterns[]]
 *
 * Each expectedCallPattern is a regex string that should match in the method body.
 */
const SYNC_METHOD_WIRING = [
  ['init', [
    'createModalModule',
    'createHistoryModule',
    'createUIModule',
    'createInteractionModule',
    'this\\.interaction\\.addEventListeners',
    'this\\.loadDataFromServer',
    'setInterval',
    'this\\.refreshLockHeartbeat',
    'this\\.findNextUpcomingClasses',
    'AppElements\\.versionBadge',
    'AppConfig\\.APP_VERSION',
  ]],
  ['showFirstTimeScheduleSelector', [
    'AppElements\\.firstTimeScheduleSelectModal',
    'AppElements\\.firstTimeScheduleSelect',
    'AppElements\\.firstTimeScheduleConfirmBtn',
    'document\\.createElement',
    'this\\.loadSchedule',
  ]],
  ['saveSchedulesToLocal', [
    'localStorage\\.setItem',
    'JSON\\.stringify',
    'this\\.schedules',
  ]],
  ['toggleAllFilterCheckboxes', [
    'AppElements\\.filterCourseList',
    'querySelectorAll',
    'input\\[type=.checkbox.\\]',
  ]],
  ['clearAdvancedFilters', [
    'this\\.activeFilters',
    'this\\.modals\\.populateFilterModal',
    'this\\.ui\\.renderScheduleTable',
    'this\\.ui\\.updateAdvancedFilterButtonState',
    'this\\.ui\\.updateClearAllFiltersButtonVisibility',
  ]],
  ['clearAllFilters', [
    'this\\.activeFilters',
    'localStorage\\.removeItem',
    'this\\.tagFilterTagify',
    'removeAllTags',
    'this\\.modals\\.populateFilterModal',
    'this\\.ui\\.renderScheduleTable',
  ]],
  ['_getLocks', [
    'localStorage\\.getItem',
    'JSON\\.parse',
    'gemini_schedule_locks',
  ]],
  ['_saveLocks', [
    'localStorage\\.setItem',
    'JSON\\.stringify',
    'gemini_schedule_locks',
  ]],
  ['releaseCurrentLock', [
    'this\\.releaseLock',
    'this\\.activeScheduleId',
  ]],
  ['refreshLockHeartbeat', [
    'this\\.isReadOnly',
    'this\\.activeScheduleId',
    'AppConfig\\.ALL_SCHEDULES_ID',
    'this\\._getLocks',
    'this\\._saveLocks',
    'Date\\.now',
  ]],
];

// Also verify these helper methods that support the lock system
const LOCK_HELPER_METHODS = [
  ['acquireLock', [
    'this\\._getLocks',
    'this\\._saveLocks',
    'this\\.tabId',
    'Date\\.now',
  ]],
  ['releaseLock', [
    'this\\._getLocks',
    'this\\._saveLocks',
    'this\\.tabId',
  ]],
];

const ALL_METHODS = [...SYNC_METHOD_WIRING, ...LOCK_HELPER_METHODS];

// ─── Tests ───────────────────────────────────────────────────────────────

describe('Sync App Methods — Wiring Smoke Tests (Static Analysis)', () => {

  // ─── 1. Method existence ──────────────────────────────────────────────

  describe('all sync methods exist in JavaScript.html', () => {
    it.each(ALL_METHODS)(
      '%s is declared as a method',
      (methodName, _patterns) => {
        const body = extractMethodBody(jsHtmlSource, methodName);
        expect(body).not.toBeNull();
      }
    );
  });

  // ─── 2. Wiring correctness ────────────────────────────────────────────

  describe('init — module creation and event binding', () => {
    const [, patterns] = SYNC_METHOD_WIRING.find(([n]) => n === 'init');
    const body = extractMethodBody(jsHtmlSource, 'init');

    it.each(patterns)(
      'init calls %s',
      (pattern) => {
        expect(body).not.toBeNull();
        expect(containsCall(body, pattern)).toBe(true);
      }
    );
  });

  describe('showFirstTimeScheduleSelector — DOM modal wiring', () => {
    const [, patterns] = SYNC_METHOD_WIRING.find(([n]) => n === 'showFirstTimeScheduleSelector');
    const body = extractMethodBody(jsHtmlSource, 'showFirstTimeScheduleSelector');

    it.each(patterns)(
      'showFirstTimeScheduleSelector references %s',
      (pattern) => {
        expect(body).not.toBeNull();
        expect(containsCall(body, pattern)).toBe(true);
      }
    );
  });

  describe('saveSchedulesToLocal — localStorage persistence', () => {
    const [, patterns] = SYNC_METHOD_WIRING.find(([n]) => n === 'saveSchedulesToLocal');
    const body = extractMethodBody(jsHtmlSource, 'saveSchedulesToLocal');

    it.each(patterns)(
      'saveSchedulesToLocal uses %s',
      (pattern) => {
        expect(body).not.toBeNull();
        expect(containsCall(body, pattern)).toBe(true);
      }
    );
  });

  describe('filter methods — DOM state management', () => {
    const filterMethods = ['toggleAllFilterCheckboxes', 'clearAdvancedFilters', 'clearAllFilters'];

    for (const methodName of filterMethods) {
      const [, patterns] = SYNC_METHOD_WIRING.find(([n]) => n === methodName);
      const body = extractMethodBody(jsHtmlSource, methodName);

      describe(methodName, () => {
        it.each(patterns)(
          `${methodName} references %s`,
          (pattern) => {
            expect(body).not.toBeNull();
            expect(containsCall(body, pattern)).toBe(true);
          }
        );
      });
    }
  });

  describe('lock system — localStorage JSON read/write', () => {
    const lockMethods = ['_getLocks', '_saveLocks', 'acquireLock', 'releaseLock',
                         'releaseCurrentLock', 'refreshLockHeartbeat'];

    for (const methodName of lockMethods) {
      const entry = ALL_METHODS.find(([n]) => n === methodName);
      if (!entry) continue;
      const [, patterns] = entry;
      const body = extractMethodBody(jsHtmlSource, methodName);

      describe(methodName, () => {
        it.each(patterns)(
          `${methodName} references %s`,
          (pattern) => {
            expect(body).not.toBeNull();
            expect(containsCall(body, pattern)).toBe(true);
          }
        );
      });
    }
  });

  // ─── 3. Structural contracts ───────────────────────────────────────────

  describe('structural contracts', () => {
    it('init is a sync function (not async)', () => {
      // init should be sync — it delegates to async loadDataFromServer via setTimeout
      const match = jsHtmlSource.match(/init\s*:\s*(async\s+)?function/);
      expect(match).not.toBeNull();
      expect(match[1]).toBeUndefined(); // no 'async' keyword
    });

    it('saveSchedulesToLocal is a one-liner localStorage.setItem', () => {
      const body = extractMethodBody(jsHtmlSource, 'saveSchedulesToLocal');
      expect(body).not.toBeNull();
      // Should be a simple wrapper — body should be short
      const lines = body.split('\n').filter(l => l.trim().length > 0);
      expect(lines.length).toBeLessThanOrEqual(5); // declaration + body + closing
    });

    it('releaseCurrentLock delegates to releaseLock (thin wrapper)', () => {
      const body = extractMethodBody(jsHtmlSource, 'releaseCurrentLock');
      expect(body).not.toBeNull();
      const lines = body.split('\n').filter(l => l.trim().length > 0);
      expect(lines.length).toBeLessThanOrEqual(5);
      expect(containsCall(body, 'this\\.releaseLock\\(this\\.activeScheduleId\\)')).toBe(true);
    });

    it('_getLocks and _saveLocks use the same localStorage key', () => {
      const getBody = extractMethodBody(jsHtmlSource, '_getLocks');
      const saveBody = extractMethodBody(jsHtmlSource, '_saveLocks');
      expect(getBody).not.toBeNull();
      expect(saveBody).not.toBeNull();

      const keyPattern = /gemini_schedule_locks/;
      expect(keyPattern.test(getBody)).toBe(true);
      expect(keyPattern.test(saveBody)).toBe(true);
    });

    it('init sets up two setInterval timers', () => {
      const body = extractMethodBody(jsHtmlSource, 'init');
      expect(body).not.toBeNull();
      const intervals = body.match(/setInterval/g);
      expect(intervals).not.toBeNull();
      expect(intervals.length).toBe(2);
    });

    it('init creates all 4 modules', () => {
      const body = extractMethodBody(jsHtmlSource, 'init');
      expect(body).not.toBeNull();
      const modules = ['createModalModule', 'createHistoryModule', 'createUIModule', 'createInteractionModule'];
      for (const mod of modules) {
        expect(containsCall(body, mod)).toBe(true);
      }
    });
  });
});
