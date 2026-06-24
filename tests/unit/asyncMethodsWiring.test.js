/**
 * Async Not-Extractable Methods Wiring Smoke Tests
 *
 * Ref: #107 — P0 Coverage Sprint Wave 2
 *
 * Strategy: Static analysis approach — reads JavaScript.html source, extracts
 * each async App method's body, and verifies via regex that ServerApi.call()
 * invocations reference known 程式碼.js backend functions. This avoids heavy
 * DOM dependencies while still providing a wiring safety net.
 *
 * Also cross-references against the 17 known backend function names from
 * Wave 1 (backendSignatureContracts.test.js).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ─── Source loading ──────────────────────────────────────────────────────

const jsHtmlSource = readFileSync(
  resolve(import.meta.dirname, '../../JavaScript.html'),
  'utf-8'
);

// DataIO methods moved to IIFE module (Phase 1 PR5)
const dataIOSource = readFileSync(
  resolve(import.meta.dirname, '../../DataIO.js.html'),
  'utf-8'
);

// ScheduleManager methods moved to IIFE module (Phase 1 PR6)
const scheduleManagerSource = readFileSync(
  resolve(import.meta.dirname, '../../ScheduleManager.js.html'),
  'utf-8'
);

const gasSource = readFileSync(
  resolve(import.meta.dirname, '../../程式碼.js'),
  'utf-8'
);

// ─── Known backend functions (source of truth: 程式碼.js) ─────────────────

/** Extract all top-level function names from 程式碼.js */
function extractGasFunctionNames(source) {
  const names = [];
  const regex = /^function (\w+)\(/gm;
  let match;
  while ((match = regex.exec(source)) !== null) {
    names.push(match[1]);
  }
  return names;
}

const KNOWN_BACKEND_FUNCTIONS = extractGasFunctionNames(gasSource);

// ─── Expected wiring map ─────────────────────────────────────────────────

/**
 * Source-of-truth mapping: each async App method → the ServerApi.call()
 * function name(s) it should invoke.
 *
 * Extracted by reading JavaScript.html lines 227-688, 1117-1200.
 * Format: [methodName, startLine, expectedCalls[]]
 *
 * Note: applyTagFilters has NO ServerApi calls (pure frontend).
 * handleScheduleSelectChange has NO direct ServerApi calls (delegates to loadSchedule/loadDataFromServer).
 */
// Methods in JavaScript.html
const JS_HTML_ASYNC_METHODS = [
  ['applyTagFilters', 433, []], // Pure frontend, no ServerApi
  ['printScheduleToPdf', 1117, ['getFontBase64FromDrive']],
];

// Methods moved to ScheduleManager.js.html (Phase 1 PR6)
const SCHEDULE_MANAGER_ASYNC_METHODS = [
  ['handleAddSchedule', 0, ['addSchedule']],
  ['handleScheduleListClick', 0, ['updateScheduleMetadata', 'deleteSchedule', 'copySchedule']],
  ['handleScheduleSelectChange', 0, []], // No direct ServerApi.call — delegates to loadSchedule
];

// Methods moved to DataIO.js.html (Phase 1 PR5)
const DATA_IO_ASYNC_METHODS = [
  ['loadVersions', 0, ['getVersions']],
  ['handleLoadVersion', 0, ['getVersionData']],
  ['loadDataFromServer', 0, ['getData']],
  ['saveDataToServer', 0, ['saveData']],
];

const ASYNC_METHOD_WIRING = [...JS_HTML_ASYNC_METHODS, ...SCHEDULE_MANAGER_ASYNC_METHODS, ...DATA_IO_ASYNC_METHODS];

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Extract the body of an async method from source.
 * Supports both object literal (`methodName: async function`) and
 * IIFE-extracted (`App.methodName = async function`) patterns.
 */
function extractMethodBody(source, methodName) {
  // Try object literal pattern first
  const declPattern = new RegExp(
    `${methodName}\\s*:\\s*async\\s+function\\s*\\([^)]*\\)\\s*\\{`
  );
  let match = declPattern.exec(source);

  // Try IIFE-extracted pattern: App.methodName = async function(...) {
  if (!match) {
    const iifePattern = new RegExp(
      `App\\.${methodName}\\s*=\\s*async\\s+function\\s*\\([^)]*\\)\\s*\\{`
    );
    match = iifePattern.exec(source);
  }

  if (!match) return null;

  // Find the balanced closing brace
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
 * Extract all ServerApi.call('functionName', ...) invocations from a code block.
 * Returns an array of function name strings.
 */
function extractServerApiCalls(code) {
  const calls = [];
  const regex = /ServerApi\.call\(\s*['"](\w+)['"]/g;
  let match;
  while ((match = regex.exec(code)) !== null) {
    calls.push(match[1]);
  }
  return calls;
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe('Async App Methods — Wiring Smoke Tests (Static Analysis)', () => {

  // ─── 1. Method existence in source ────────────────────────────────────

  describe('all 2 JavaScript.html async methods exist', () => {
    it.each(JS_HTML_ASYNC_METHODS)(
      '%s is declared as async method in JavaScript.html',
      (methodName, _line, _expectedCalls) => {
        const body = extractMethodBody(jsHtmlSource, methodName);
        expect(body).not.toBeNull();
        expect(body).toContain('async function');
      }
    );
  });

  describe('all 3 ScheduleManager.js.html async methods exist', () => {
    it.each(SCHEDULE_MANAGER_ASYNC_METHODS)(
      '%s is declared as async method in ScheduleManager.js.html',
      (methodName, _line, _expectedCalls) => {
        const body = extractMethodBody(scheduleManagerSource, methodName);
        expect(body).not.toBeNull();
        expect(body).toContain('async function');
      }
    );
  });

  describe('all 4 DataIO.js.html async methods exist', () => {
    it.each(DATA_IO_ASYNC_METHODS)(
      '%s is declared as async method in DataIO.js.html',
      (methodName, _line, _expectedCalls) => {
        const body = extractMethodBody(dataIOSource, methodName);
        expect(body).not.toBeNull();
        expect(body).toContain('async function');
      }
    );
  });

  // ─── 2. ServerApi.call wiring ──────────────────────────────────────────

  /**
   * Helper: resolve the correct source for a method
   */
  function resolveSource(methodName) {
    if (DATA_IO_ASYNC_METHODS.some(([n]) => n === methodName)) return dataIOSource;
    if (SCHEDULE_MANAGER_ASYNC_METHODS.some(([n]) => n === methodName)) return scheduleManagerSource;
    return jsHtmlSource;
  }

  describe('each method calls expected ServerApi.call targets', () => {
    it.each(
      ASYNC_METHOD_WIRING.filter(([, , calls]) => calls.length > 0)
    )(
      '%s calls ServerApi.call with correct function name(s)',
      (methodName, _line, expectedCalls) => {
        const body = extractMethodBody(resolveSource(methodName), methodName);
        expect(body).not.toBeNull();

        const actualCalls = extractServerApiCalls(body);

        // Each expected call must appear in the method body
        for (const expected of expectedCalls) {
          expect(actualCalls).toContain(expected);
        }
      }
    );

    it.each(
      ASYNC_METHOD_WIRING.filter(([, , calls]) => calls.length === 0)
    )(
      '%s has no ServerApi.call (pure frontend / delegator)',
      (methodName, _line, _expectedCalls) => {
        const body = extractMethodBody(resolveSource(methodName), methodName);
        expect(body).not.toBeNull();

        const actualCalls = extractServerApiCalls(body);
        expect(actualCalls).toHaveLength(0);
      }
    );
  });

  // ─── 3. All called functions exist in backend ──────────────────────────

  describe('all ServerApi.call targets are known 程式碼.js functions', () => {
    const allCalledFunctions = ASYNC_METHOD_WIRING
      .flatMap(([, , calls]) => calls)
      .filter((v, i, a) => a.indexOf(v) === i); // unique

    it.each(allCalledFunctions)(
      'ServerApi.call("%s") → exists in 程式碼.js',
      (fnName) => {
        expect(KNOWN_BACKEND_FUNCTIONS).toContain(fnName);
      }
    );
  });

  // ─── 4. No unexpected ServerApi.call in source files ────────────────

  describe('completeness — no undocumented ServerApi.call targets', () => {
    it('all ServerApi.call targets in JavaScript.html + DataIO.js.html are in our wiring map', () => {
      // Extract ALL ServerApi.call from JavaScript.html and DataIO.js.html
      const allCalls = [
        ...extractServerApiCalls(jsHtmlSource),
        ...extractServerApiCalls(dataIOSource),
      ];
      const uniqueCalls = [...new Set(allCalls)];

      // All targets documented in ASYNC_METHOD_WIRING
      const documentedCalls = new Set(
        ASYNC_METHOD_WIRING.flatMap(([, , calls]) => calls)
      );

      for (const call of uniqueCalls) {
        expect(documentedCalls).toContain(call);
      }
    });

    it('ASYNC_METHOD_WIRING covers all 9 async methods', () => {
      expect(ASYNC_METHOD_WIRING).toHaveLength(9);
    });
  });

  // ─── 5. Cross-reference: wiring map ↔ backend signature contracts ─────

  describe('cross-reference with backend signature contracts', () => {
    it('known backend has exactly 17 top-level functions', () => {
      expect(KNOWN_BACKEND_FUNCTIONS).toHaveLength(17);
    });

    it('all 7 unique ServerApi targets are a subset of 17 backend functions', () => {
      const apiTargets = ASYNC_METHOD_WIRING
        .flatMap(([, , calls]) => calls)
        .filter((v, i, a) => a.indexOf(v) === i);

      for (const target of apiTargets) {
        expect(KNOWN_BACKEND_FUNCTIONS).toContain(target);
      }
    });
  });
});
