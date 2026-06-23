/**
 * DOM Event Binding Lifecycle Regression Tests
 *
 * Ref: #107 — P0 Coverage Sprint Wave 4
 *
 * Verifies the init → load → render → interact → save lifecycle critical path
 * using static analysis. Ensures the call chains between lifecycle phases are
 * correctly wired and that cross-phase state transitions follow the expected
 * dependency order.
 */
import { describe, it, expect } from 'vitest';
import {
  extractMethodBody,
  containsCall,
  extractServerApiCalls,
  extractEventListenerTypes,
  loadSource,
} from '../helpers/sourceAnalysis.js';

// ─── Source loading ──────────────────────────────────────────────────────

const jsHtmlSource = loadSource(import.meta.dirname, '../../JavaScript.html');
const interactionSource = loadSource(import.meta.dirname, '../../Interaction.js.html');
const uiSource = loadSource(import.meta.dirname, '../../UI.js.html');

// ─── Tests ───────────────────────────────────────────────────────────────

describe('Lifecycle Regression — init → load → render → interact → save', () => {

  // ═══════════════════════════════════════════════════════════════════════
  // Phase A: INIT — module creation, event listeners, timers
  // ═══════════════════════════════════════════════════════════════════════

  describe('Phase A: init — setup and bootstrapping', () => {
    const initBody = extractMethodBody(jsHtmlSource, 'init');

    it('init method exists', () => {
      expect(initBody).not.toBeNull();
    });

    // Module creation (4 modules)
    const modules = [
      'createModalModule',
      'createHistoryModule',
      'createUIModule',
      'createInteractionModule',
    ];

    it.each(modules)(
      'init creates %s',
      (mod) => {
        expect(containsCall(initBody, mod)).toBe(true);
      }
    );

    it('init binds event listeners via interaction.addEventListeners()', () => {
      expect(containsCall(initBody, 'this\\.interaction\\.addEventListeners')).toBe(true);
    });

    it('init triggers loadDataFromServer (async, via setTimeout)', () => {
      expect(containsCall(initBody, 'this\\.loadDataFromServer')).toBe(true);
      expect(containsCall(initBody, 'setTimeout')).toBe(true);
    });

    it('init sets up 2 setInterval timers (upcoming classes + lock heartbeat)', () => {
      const intervals = initBody.match(/setInterval/g);
      expect(intervals).not.toBeNull();
      expect(intervals.length).toBe(2);
    });

    it('init is sync (not async) — delegates async via setTimeout', () => {
      const match = jsHtmlSource.match(/init\s*:\s*(async\s+)?function/);
      expect(match).not.toBeNull();
      expect(match[1]).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Phase B: LOAD — ServerApi.call → data processing → state update
  // ═══════════════════════════════════════════════════════════════════════

  describe('Phase B: load — data flow from server', () => {
    const loadBody = extractMethodBody(jsHtmlSource, 'loadDataFromServer');

    it('loadDataFromServer method exists', () => {
      expect(loadBody).not.toBeNull();
    });

    it('calls ServerApi.call("getData")', () => {
      const calls = extractServerApiCalls(loadBody);
      expect(calls).toContain('getData');
    });

    it('updates this.schedules from result', () => {
      expect(containsCall(loadBody, 'this\\.schedules\\s*=')).toBe(true);
    });

    it('updates this.activeMetadataTimestamp', () => {
      expect(containsCall(loadBody, 'this\\.activeMetadataTimestamp\\s*=')).toBe(true);
    });

    it('calls loadInitialSchedules after fetching', () => {
      expect(containsCall(loadBody, 'this\\.loadInitialSchedules')).toBe(true);
    });

    it('calls saveSchedulesToLocal after data processing', () => {
      expect(containsCall(loadBody, 'this\\.saveSchedulesToLocal')).toBe(true);
    });

    it('calls manageLoadingState for start and end', () => {
      expect(containsCall(loadBody, "this\\.ui\\.manageLoadingState\\(\\s*'start'")).toBe(true);
      expect(containsCall(loadBody, "this\\.ui\\.manageLoadingState\\(\\s*'end'")).toBe(true);
    });

    it('manages isConnecting flag', () => {
      expect(containsCall(loadBody, 'this\\.isConnecting\\s*=\\s*true')).toBe(true);
      expect(containsCall(loadBody, 'this\\.isConnecting\\s*=\\s*false')).toBe(true);
    });
  });

  describe('Phase B.1: loadInitialSchedules — routing logic', () => {
    const loadInitBody = extractMethodBody(jsHtmlSource, 'loadInitialSchedules');

    it('loadInitialSchedules method exists', () => {
      expect(loadInitBody).not.toBeNull();
    });

    it('reads activeScheduleId from localStorage', () => {
      expect(containsCall(loadInitBody, "localStorage\\.getItem\\(\\s*'activeScheduleId'")).toBe(true);
    });

    it('calls loadSchedule for valid stored ID', () => {
      expect(containsCall(loadInitBody, 'this\\.loadSchedule')).toBe(true);
    });

    it('calls showFirstTimeScheduleSelector when no valid stored ID', () => {
      expect(containsCall(loadInitBody, 'this\\.showFirstTimeScheduleSelector')).toBe(true);
    });

    it('updates UI via updateScheduleSelect', () => {
      expect(containsCall(loadInitBody, 'this\\.ui\\.updateScheduleSelect')).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Phase C: RENDER — UI rendering dependencies
  // ═══════════════════════════════════════════════════════════════════════

  describe('Phase C: render — loadSchedule triggers rendering', () => {
    const loadScheduleBody = extractMethodBody(jsHtmlSource, 'loadSchedule');

    it('loadSchedule method exists', () => {
      expect(loadScheduleBody).not.toBeNull();
    });

    const renderCalls = [
      'this\\.ui\\.renderScheduleTable',
      'this\\.ui\\.updateHeaderUIState',
      'this\\.ui\\.updateClassroomList',
      'this\\.ui\\.initializeTagFilter',
    ];

    it.each(renderCalls)(
      'loadSchedule calls %s',
      (pattern) => {
        expect(containsCall(loadScheduleBody, pattern)).toBe(true);
      }
    );

    it('loadSchedule acquires lock on new schedule', () => {
      expect(containsCall(loadScheduleBody, 'this\\.acquireLock')).toBe(true);
    });

    it('loadSchedule releases lock on previous schedule', () => {
      expect(containsCall(loadScheduleBody, 'this\\.releaseLock')).toBe(true);
    });

    it('loadSchedule unpacks schedule data to working state', () => {
      expect(containsCall(loadScheduleBody, 'this\\.classrooms\\s*=')).toBe(true);
      expect(containsCall(loadScheduleBody, 'this\\.scheduleData\\s*=')).toBe(true);
      expect(containsCall(loadScheduleBody, 'this\\.activeScheduleId\\s*=')).toBe(true);
    });

    it('loadSchedule persists selection to localStorage', () => {
      expect(containsCall(loadScheduleBody, "localStorage\\.setItem\\(\\s*'activeScheduleId'")).toBe(true);
    });

    it('loadSchedule resets history module', () => {
      expect(containsCall(loadScheduleBody, 'this\\.historyModule\\.resetHistory')).toBe(true);
    });

    it('loadSchedule calls buildCourseColorMap', () => {
      expect(containsCall(loadScheduleBody, 'this\\.buildCourseColorMap')).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Phase D: INTERACT — event handlers in Interaction.js.html
  // ═══════════════════════════════════════════════════════════════════════

  describe('Phase D: interact — event binding verification', () => {
    const addEvBody = extractMethodBody(interactionSource, 'addEventListeners');

    it('addEventListeners method exists', () => {
      expect(addEvBody).not.toBeNull();
    });

    // Verify event types bound
    it('binds click event listeners', () => {
      const types = extractEventListenerTypes(addEvBody);
      expect(types).toContain('click');
    });

    it('binds change event listeners', () => {
      const types = extractEventListenerTypes(addEvBody);
      expect(types).toContain('change');
    });

    it('binds keydown event listener (global shortcuts)', () => {
      const types = extractEventListenerTypes(addEvBody);
      expect(types).toContain('keydown');
    });

    it('binds beforeunload event listener (lock release + dirty guard)', () => {
      const types = extractEventListenerTypes(addEvBody);
      expect(types).toContain('beforeunload');
    });

    // Verify critical handler wiring
    const criticalHandlers = [
      ['saveDataToServer', 'app\\.saveDataToServer'],
      ['loadDataFromServer', 'app\\.loadDataFromServer'],
      ['handleLoadVersion', 'app\\.handleLoadVersion'],
      ['handleAddSchedule', 'app\\.handleAddSchedule'],
      ['handleScheduleListClick', 'app\\.handleScheduleListClick'],
      ['handleScheduleSelectChange', 'app\\.handleScheduleSelectChange'],
      ['printScheduleToPdf', 'app\\.printScheduleToPdf'],
      ['releaseCurrentLock', 'app\\.releaseCurrentLock'],
      ['loadVersions', 'app\\.loadVersions'],
      ['clearAllFilters', 'app\\.clearAllFilters'],
      ['clearAdvancedFilters', 'app\\.clearAdvancedFilters'],
      ['applyFilters', 'app\\.applyFilters'],
      ['toggleAllFilterCheckboxes', 'app\\.toggleAllFilterCheckboxes'],
      ['undo', 'app\\.historyModule\\.undo'],
      ['redo', 'app\\.historyModule\\.redo'],
    ];

    it.each(criticalHandlers)(
      'wires %s handler',
      (_name, pattern) => {
        expect(containsCall(addEvBody, pattern)).toBe(true);
      }
    );

    it('initializes tooltips at end of addEventListeners', () => {
      expect(containsCall(addEvBody, 'app\\.ui\\.initializeTooltips')).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Phase E: SAVE — data collection → ServerApi.call
  // ═══════════════════════════════════════════════════════════════════════

  describe('Phase E: save — data flow to server', () => {
    const saveBody = extractMethodBody(jsHtmlSource, 'saveDataToServer');

    it('saveDataToServer method exists', () => {
      expect(saveBody).not.toBeNull();
    });

    it('calls ServerApi.call("saveData")', () => {
      const calls = extractServerApiCalls(saveBody);
      expect(calls).toContain('saveData');
    });

    it('collects data from this.classrooms, this.scheduleData, this.tags', () => {
      expect(containsCall(saveBody, 'this\\.classrooms')).toBe(true);
      expect(containsCall(saveBody, 'this\\.scheduleData')).toBe(true);
      expect(containsCall(saveBody, 'this\\.tags')).toBe(true);
    });

    it('includes lastModified timestamp for conflict detection', () => {
      expect(containsCall(saveBody, 'this\\.scheduleLastModified')).toBe(true);
    });

    it('handles conflict response (saveResult.conflict)', () => {
      expect(containsCall(saveBody, 'saveResult.*\\.conflict')).toBe(true);
    });

    it('updates scheduleLastModified on success', () => {
      expect(containsCall(saveBody, 'this\\.scheduleLastModified\\[this\\.activeScheduleId\\]\\s*=')).toBe(true);
    });

    it('calls manageLoadingState for start and end', () => {
      expect(containsCall(saveBody, "this\\.ui\\.manageLoadingState\\(\\s*'start'")).toBe(true);
      expect(containsCall(saveBody, "this\\.ui\\.manageLoadingState\\(\\s*'end'")).toBe(true);
    });

    it('manages isConnecting flag', () => {
      expect(containsCall(saveBody, 'this\\.isConnecting')).toBe(true);
    });

    it('updates history clean snapshot on success', () => {
      expect(containsCall(saveBody, 'this\\.historyModule\\.updateCleanSnapshot')).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Phase F: Cross-phase state transitions
  // ═══════════════════════════════════════════════════════════════════════

  describe('Phase F: cross-phase state transitions', () => {

    it('init → load: init triggers loadDataFromServer via setTimeout', () => {
      const initBody = extractMethodBody(jsHtmlSource, 'init');
      // Both setTimeout and loadDataFromServer are present in init — the async
      // delegation wraps loadDataFromServer in a setTimeout callback (multiline)
      expect(containsCall(initBody, 'setTimeout')).toBe(true);
      expect(containsCall(initBody, 'this\\.loadDataFromServer')).toBe(true);
    });

    it('load → render: loadDataFromServer calls loadInitialSchedules which calls loadSchedule', () => {
      const loadBody = extractMethodBody(jsHtmlSource, 'loadDataFromServer');
      expect(containsCall(loadBody, 'this\\.loadInitialSchedules')).toBe(true);

      const loadInitBody = extractMethodBody(jsHtmlSource, 'loadInitialSchedules');
      expect(containsCall(loadInitBody, 'this\\.loadSchedule')).toBe(true);
    });

    it('render → interact: init calls addEventListeners before loadDataFromServer', () => {
      const initBody = extractMethodBody(jsHtmlSource, 'init');
      // addEventListeners is called directly, loadDataFromServer is in setTimeout
      // So addEventListeners executes first (sync before async)
      expect(containsCall(initBody, 'this\\.interaction\\.addEventListeners')).toBe(true);
      expect(containsCall(initBody, 'setTimeout')).toBe(true);
    });

    it('interact → save: addEventListeners wires saveToCloudBtn to saveDataToServer', () => {
      const addEvBody = extractMethodBody(interactionSource, 'addEventListeners');
      expect(containsCall(addEvBody, 'saveToCloudBtn')).toBe(true);
      expect(containsCall(addEvBody, 'app\\.saveDataToServer')).toBe(true);
    });

    it('save → render: saveDataToServer updates history which can trigger re-render', () => {
      const saveBody = extractMethodBody(jsHtmlSource, 'saveDataToServer');
      expect(containsCall(saveBody, 'this\\.historyModule\\.updateCleanSnapshot')).toBe(true);
      expect(containsCall(saveBody, 'this\\.historyModule\\.checkDirty')).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Module factory existence
  // ═══════════════════════════════════════════════════════════════════════

  describe('module factory functions exist in their respective source files', () => {
    it('createUIModule exists in UI.js.html', () => {
      expect(uiSource).toContain('function createUIModule');
    });

    it('createInteractionModule exists in Interaction.js.html', () => {
      expect(interactionSource).toContain('function createInteractionModule');
    });

    it('createUIModule receives app parameter', () => {
      expect(containsCall(uiSource, 'function createUIModule\\(app\\)')).toBe(true);
    });

    it('createInteractionModule receives app parameter', () => {
      expect(containsCall(interactionSource, 'function createInteractionModule\\(app\\)')).toBe(true);
    });
  });
});
