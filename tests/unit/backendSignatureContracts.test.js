/**
 * Backend Signature Contracts — verifies the existence, parameter count,
 * and API bridge consistency of all 17 top-level 程式碼.js functions.
 *
 * Ref: #107 — P0 Coverage Sprint Wave 1 (signature contracts)
 *
 * Strategy: Installs GAS mocks as globals, then require()s 程式碼.js directly
 * so v8 can instrument it for coverage. Validates:
 *   1. All 17 functions exist and are typeof 'function'
 *   2. Each function's .length matches its declared parameter count
 *   3. The 9 frontend-called functions (via ServerApi.call) exist in env
 *
 * Ref: #107 — Migrated from new Function() sandbox to direct require().
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
import { createMockSpreadsheetApp, createMockSession,
         createMockLockService, createMockPropertiesService, createMockLogger,
         createMockHtmlService, createMockDriveApp } from '../mocks/gasMocks.js';

const _require = createRequire(import.meta.url);
const backendPath = _require.resolve('../../程式碼.js');

/**
 * Create a GAS environment — mirrors backend.test.js createGasEnv.
 * Ref: #107 — direct require() for v8 coverage.
 */
function createGasEnv(opts = {}) {
  const sheets = opts.sheets || {};
  const SpreadsheetApp = createMockSpreadsheetApp(sheets);
  const Session = createMockSession(opts.userEmail ?? 'test@example.com');
  const LockService = opts.LockService || createMockLockService();
  const PropertiesService = createMockPropertiesService(opts.scriptProps || {});
  const Logger = createMockLogger();
  const HtmlService = createMockHtmlService();
  const DriveApp = createMockDriveApp(opts.driveFiles || {});

  vi.stubGlobal('SpreadsheetApp', SpreadsheetApp);
  vi.stubGlobal('Session', Session);
  vi.stubGlobal('LockService', LockService);
  vi.stubGlobal('PropertiesService', PropertiesService);
  vi.stubGlobal('Logger', Logger);
  vi.stubGlobal('HtmlService', HtmlService);
  vi.stubGlobal('DriveApp', DriveApp);

  delete _require.cache[backendPath];

  return _require(backendPath);
}

// ─── All 17 top-level functions with expected parameter counts ────────────

/**
 * Source-of-truth: extracted from 程式碼.js function declarations.
 * Format: [functionName, expectedParamCount]
 */
const EXPECTED_SIGNATURES = [
  ['_getSs', 0],
  ['getConfig', 1],
  ['_findScheduleRowInfo', 2],
  ['_checkPermission', 1],
  ['getSheet', 1],
  ['getOrCreateSheet', 1],
  ['doGet', 0],
  ['getData', 0],
  ['saveData', 1],
  ['checkMetadata', 2],
  ['addSchedule', 1],
  ['updateScheduleMetadata', 1],
  ['deleteSchedule', 1],
  ['copySchedule', 1],
  ['getVersions', 1],
  ['getVersionData', 1],
  ['getFontBase64FromDrive', 0],
];

/**
 * The 9 function names that the frontend calls via ServerApi.call().
 * Source: Api.js.html bridge + grep of JavaScript.html for ServerApi.call('...')
 */
const API_BRIDGE_FUNCTIONS = [
  'getData',
  'saveData',
  'addSchedule',
  'updateScheduleMetadata',
  'deleteSchedule',
  'copySchedule',
  'getVersions',
  'getVersionData',
  'getFontBase64FromDrive',
];

// ─── Tests ────────────────────────────────────────────────────────────────

describe('程式碼.js Signature Contracts', () => {
  let env;

  // Create the GAS env once — signature tests are read-only
  env = createGasEnv();

  // ─── 1. Function existence ──────────────────────────────────────────

  describe('all 17 functions exist and are typeof function', () => {
    it.each(EXPECTED_SIGNATURES)(
      '%s is a function',
      (fnName, _expectedLength) => {
        expect(env).toHaveProperty(fnName);
        expect(typeof env[fnName]).toBe('function');
      }
    );

    it('env exposes exactly 17 production functions (excluding test helpers)', () => {
      const fnCount = Object.keys(env)
        .filter(k => typeof env[k] === 'function' && !k.startsWith('_reset'))
        .length;
      expect(fnCount).toBe(17);
    });
  });

  // ─── 2. Parameter count (.length) ───────────────────────────────────

  describe('each function has correct .length (parameter count)', () => {
    it.each(EXPECTED_SIGNATURES)(
      '%s.length === %i',
      (fnName, expectedLength) => {
        expect(env[fnName].length).toBe(expectedLength);
      }
    );
  });

  // ─── 3. API bridge consistency ──────────────────────────────────────

  describe('API bridge consistency — 9 ServerApi.call names exist in env', () => {
    it.each(API_BRIDGE_FUNCTIONS)(
      'ServerApi.call("%s") target exists in backend',
      (fnName) => {
        expect(env).toHaveProperty(fnName);
        expect(typeof env[fnName]).toBe('function');
      }
    );

    it('API_BRIDGE_FUNCTIONS is a subset of EXPECTED_SIGNATURES', () => {
      const allNames = EXPECTED_SIGNATURES.map(([name]) => name);
      for (const apiFn of API_BRIDGE_FUNCTIONS) {
        expect(allNames).toContain(apiFn);
      }
    });
  });
});
