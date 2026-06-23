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
const ASYNC_METHOD_WIRING = [
  ['handleAddSchedule', 227, ['addSchedule']],
  ['handleScheduleListClick', 259, ['updateScheduleMetadata', 'deleteSchedule', 'copySchedule']],
  ['handleScheduleSelectChange', 359, []], // No direct ServerApi.call — delegates to loadSchedule
  ['applyTagFilters', 433, []], // Pure frontend, no ServerApi
  ['loadVersions', 505, ['getVersions']],
  ['handleLoadVersion', 532, ['getVersionData']],
  ['loadDataFromServer', 604, ['getData']],
  ['saveDataToServer', 643, ['saveData']],
  ['printScheduleToPdf', 1117, ['getFontBase64FromDrive']],
];

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Extract the body of an async method from JavaScript.html source.
 * Searches for `methodName: async function` and captures the balanced braces body.
 */
function extractMethodBody(source, methodName) {
  // Match the method declaration pattern in the App object literal
  const declPattern = new RegExp(
    `${methodName}\\s*:\\s*async\\s+function\\s*\\([^)]*\\)\\s*\\{`
  );
  const match = declPattern.exec(source);
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

  describe('all 9 async methods exist in JavaScript.html', () => {
    it.each(ASYNC_METHOD_WIRING)(
      '%s is declared as async method',
      (methodName, _line, _expectedCalls) => {
        const body = extractMethodBody(jsHtmlSource, methodName);
        expect(body).not.toBeNull();
        expect(body).toContain('async function');
      }
    );
  });

  // ─── 2. ServerApi.call wiring ──────────────────────────────────────────

  describe('each method calls expected ServerApi.call targets', () => {
    it.each(
      ASYNC_METHOD_WIRING.filter(([, , calls]) => calls.length > 0)
    )(
      '%s calls ServerApi.call with correct function name(s)',
      (methodName, _line, expectedCalls) => {
        const body = extractMethodBody(jsHtmlSource, methodName);
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
        const body = extractMethodBody(jsHtmlSource, methodName);
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

  // ─── 4. No unexpected ServerApi.call in JavaScript.html ────────────────

  describe('completeness — no undocumented ServerApi.call targets', () => {
    it('all ServerApi.call targets in JavaScript.html are in our wiring map', () => {
      // Extract ALL ServerApi.call from entire JavaScript.html
      const allCalls = extractServerApiCalls(jsHtmlSource);
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
