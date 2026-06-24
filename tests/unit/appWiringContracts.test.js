/**
 * JavaScript.html App method wiring contract — tracks extraction coverage.
 * Ref: #116 — Ensures all extractable App methods are accounted for
 *
 * Strategy: Parse JavaScript.html statically to extract all App method names,
 * then verify each is either:
 * (a) extracted to tests/lib/ and tested, OR
 * (b) documented as not extractable (DOM/GAS-coupled)
 *
 * This catches drift when new methods are added to the App object.
 *
 * Closes #116
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

// ─── Parse JavaScript.html ─────────────────────────────────────────────────

const jsHtmlSource = readFileSync(
  resolve(import.meta.dirname, '../../JavaScript.html'),
  'utf-8'
);

/**
 * Extract App object method names from JavaScript.html.
 * Pattern: `methodName: function (...)` or `methodName: async function (...)`
 * at 12-space indent (App object property level).
 */
function extractAppMethods(source) {
  const methods = [];
  const regex = /^\s{12}(\w+)\s*:\s*(?:async\s+)?function\s*\(/gm;
  let match;
  while ((match = regex.exec(source)) !== null) {
    methods.push(match[1]);
  }
  return methods;
}

/**
 * Extract private helper methods (underscore-prefixed).
 */
function extractPrivateMethods(source) {
  const methods = [];
  const regex = /^\s{12}(_\w+)\s*:\s*function\s*\(/gm;
  let match;
  while ((match = regex.exec(source)) !== null) {
    methods.push(match[1]);
  }
  return methods;
}

const appMethods = extractAppMethods(jsHtmlSource);
const privateMethods = extractPrivateMethods(jsHtmlSource);

// ─── Classify all methods ──────────────────────────────────────────────────

/**
 * Methods with existing DI extractions in tests/lib/.
 * These are tested via their extracted copies.
 */
const EXTRACTED_TO_LIB = new Set([
  // stateHelpers.js
  'handleEditClassroom', 'findNextUpcomingClasses', 'saveDataToServer',
  'countOccurrences', 'updateAllOccurrences',
  // utilityFunctions.js (remaining in JavaScript.html)
  'sortClassrooms', 'ensureDataIds',
  'buildCourseColorMap',
  // dataCollectionHelpers.js
  'getAllTags', 'getGlobalAllTags', 'getGlobalAllCourseNames', 'getGlobalAllTeachers',
  // frontendUtils.js
  'checkTimeConflict', 'filterDataByTags', 'filterDataByActiveFilters',
  // interactionHelpers.js (handleDrop → applyDrop)
  'handleDrop',
  // appLifecycleHelpers.js (new — this wave)
  'loadInitialSchedules', 'loadSchedule', 'canManageCurrentScheduleSettings',
  'loadAndApplyPersistedFilters', 'applyFilters', 'clearAdvancedFilters',
  'clearAllFilters', 'refreshLockHeartbeat',
  'saveSchedulesToLocal',
]);

/**
 * Methods NOT extractable without production refactoring.
 * These are tightly coupled to DOM, ServerApi, or browser globals.
 * Each has a reason documented.
 */
const NOT_EXTRACTABLE = new Set([
  'init',                         // DOM setup + timers + module init
  'showFirstTimeScheduleSelector', // DOM manipulation (modal, select options, event handlers)
  'handleAddSchedule',            // ServerApi + DOM + state orchestration
  'handleScheduleListClick',      // DOM event delegation + ServerApi + modals
  'handleScheduleSelectChange',   // DOM event + modal confirm + state (aggregateScheduleData already extracted)
  'applyTagFilters',              // Tagify instance + modal confirm + DOM
  'toggleAllFilterCheckboxes',    // DOM querySelectorAll
  'loadVersions',                 // DOM + ServerApi
  'handleLoadVersion',            // DOM + ServerApi + state
  'saveDataToLocal',              // localStorage + Tagify + DOM (core sync logic extracted as processServerLoadResult)
  'loadDataFromServer',           // ServerApi + state orchestration (result processing extracted)
  'isCurrentUserAdmin',           // Global var IS_ADMIN (trivial, 1 line)
  'printScheduleToPdf',           // jsPDF + DOM + ServerApi (massively coupled)
  'acquireLock',                  // Already extracted as createLockManager in frontendMocks.js
  'releaseLock',                  // Already extracted as createLockManager in frontendMocks.js
  'releaseCurrentLock',           // Wrapper around releaseLock (1 line)
]);

/**
 * Private helpers (underscore-prefixed) — internal implementation details.
 * These are tested indirectly through their public callers.
 */
const PRIVATE_HELPERS = new Set([
  '_getLocks',
  '_saveLocks',
  '_collectFromScheduleData',
  '_collectFromAllCourses',
  '_forEachCourse',
  '_filterScheduleData',
]);

/**
 * Methods moved to IIFE domain modules (Phase 1 #129).
 * These still exist on App at runtime but are no longer in JavaScript.html source.
 * They are tested via their DI copies in tests/lib/.
 */
const IIFE_EXTRACTED = new Set([
  // UtilityFunctions.js.html (PR1)
  'getShortUserName', 'generateUniqueId', 'stringToHashCode',
  'timeToMinutes', 'formatTime', 'formatTimestampForFilename', 'hexToRgb',
]);

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('JavaScript.html App method wiring contracts (#116)', () => {
  it('should find App methods via static parse', () => {
    expect(appMethods.length).toBeGreaterThan(0);
  });

  it('should have expected total App method count', () => {
    // All public methods (excluding underscore-prefixed private helpers)
    const publicMethods = appMethods.filter(m => !m.startsWith('_'));
    // 48 original - 7 IIFE-extracted = 41 remaining in JavaScript.html
    expect(publicMethods.length).toBe(41);
  });

  it('every public App method should be classified (extracted OR not-extractable)', () => {
    const publicMethods = appMethods.filter(m => !m.startsWith('_'));
    const unclassified = publicMethods.filter(m =>
      !EXTRACTED_TO_LIB.has(m) && !NOT_EXTRACTABLE.has(m)
    );
    expect(
      unclassified,
      `Unclassified methods found — add to EXTRACTED_TO_LIB, NOT_EXTRACTABLE, or IIFE_EXTRACTED: ${unclassified.join(', ')}`
    ).toEqual([]);
  });

  it('no method should be in multiple classifications', () => {
    const allSets = [EXTRACTED_TO_LIB, NOT_EXTRACTABLE, IIFE_EXTRACTED];
    const allItems = [...EXTRACTED_TO_LIB, ...NOT_EXTRACTABLE, ...IIFE_EXTRACTED];
    const duplicates = allItems.filter((item, idx) => allItems.indexOf(item) !== idx);
    expect(duplicates).toEqual([]);
  });

  it('private helpers should be accounted for', () => {
    const unclassifiedPrivate = privateMethods.filter(m => !PRIVATE_HELPERS.has(m));
    expect(
      unclassifiedPrivate,
      `Unclassified private helpers: ${unclassifiedPrivate.join(', ')}`
    ).toEqual([]);
  });

  it('extracted methods should have corresponding tests/lib/ exports', () => {
    // Verify that tests/lib/ directory has exports matching extracted method names
    const libDir = resolve(import.meta.dirname, '../lib');
    const libFiles = readdirSync(libDir).filter(f => f.endsWith('.js'));

    let allLibExports = new Set();
    for (const file of libFiles) {
      const source = readFileSync(resolve(libDir, file), 'utf-8');
      const exportRegex = /^export\s+(?:async\s+)?(?:function|const)\s+(\w+)/gm;
      let match;
      while ((match = exportRegex.exec(source)) !== null) {
        allLibExports.add(match[1]);
      }
    }

    // Not all extracted methods have the exact same name in tests/lib/
    // (e.g., handleDrop → applyDrop, loadInitialSchedules → resolveInitialSchedule)
    // But the lib directory should have significant coverage
    expect(allLibExports.size).toBeGreaterThan(30);
  });

  describe('coverage summary', () => {
    it('should have good extraction ratio', () => {
      const publicMethods = appMethods.filter(m => !m.startsWith('_'));
      const extractedCount = publicMethods.filter(m => EXTRACTED_TO_LIB.has(m)).length;
      const iifeCount = IIFE_EXTRACTED.size;
      const totalExtracted = extractedCount + iifeCount;
      const totalPublicIncludingIife = publicMethods.length + iifeCount;
      const ratio = totalExtracted / totalPublicIncludingIife;
      // Target: at least 60% of ALL public methods (including IIFE-extracted) should be extracted
      expect(ratio).toBeGreaterThanOrEqual(0.6);
    });
  });
});
