/**
 * App Test Double — mock App object for module factory tests.
 * Ref: #89 — unlock #93 factory contract testing
 *
 * The real App (JavaScript.html L4) is a large object literal inside an IIFE.
 * Module factories (createModalModule, createHistoryModule, createUIModule,
 * createInteractionModule) receive `app` as their sole dependency.
 *
 * This test double provides the minimal App state surface that factories
 * depend on, so tests can verify factory contracts without loading the
 * full 1443-line JavaScript.html.
 *
 * Usage:
 *   import { createAppTestDouble } from '../mocks/appTestDouble.js';
 *   const app = createAppTestDouble({ overrides });
 *   const module = createSomeModule(app);
 */

/**
 * Creates a minimal App test double.
 * All state properties match JavaScript.html L4-37 defaults.
 *
 * @param {Object} [overrides] - Properties to override on the default App state
 * @returns {Object} A mock App object suitable for module factory injection
 */
export function createAppTestDouble(overrides = {}) {
  const app = {
    // --- STATE (JavaScript.html L6-37) ---
    tabId: 'test_tab_001',
    isReadOnly: false,
    schedules: {},
    activeScheduleId: null,
    activeMetadataTimestamp: null,
    classrooms: [],
    scheduleData: {},
    tags: [],
    tagFilterTagify: null,
    courseColorMap: {},
    lastSyncTime: null,
    scheduleLastModified: {},
    loadingTimeout: null,
    isConnecting: false,
    activeInlineForm: null,
    originalSourceListElement: null,
    isDirty: false,
    cleanStateSnapshot: '',
    activeFilters: [],
    currentUserEmail: 'test@example.com',
    currentViewMode: 'week',
    viewSortMode: 'classroom',
    currentDayIndex: 0,
    nextUpcomingClassIds: new Set(),
    pdfFontBase64: null,

    // --- MODULES (JavaScript.html L40-43) ---
    modals: null,
    historyModule: null,
    ui: null,
    interaction: null,

    // --- STUB METHODS ---
    // Common methods that modules call back on App.
    // Override these in individual tests as needed.
    init: function () {},

    // Apply overrides
    ...overrides,
  };

  return app;
}
