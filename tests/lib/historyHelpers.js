// Extracted History dirty-state functions for testing.
// Ref: #94 — History dirty-state residual coverage.
// Source: History.js.html L64-105 (HistoryModule methods).
//
// These functions are extracted copies of:
// - updateCleanSnapshot (L82-96)
// - checkDirty (L98-105)
// - loadState (L64-75)
//
// The originals depend on `app` (closure) and `cleanStateSnapshot` (private);
// the extracted versions accept explicit parameters (DI) for testability.

/**
 * Serialize app state into a JSON snapshot string.
 * Used by both updateCleanSnapshot and checkDirty internally.
 *
 * @param {object} appState - { classrooms, scheduleData, tags }
 * @returns {string} JSON string representation.
 */
export function serializeState(appState) {
  return JSON.stringify({
    classrooms: appState.classrooms,
    scheduleData: appState.scheduleData,
    tags: appState.tags
  });
}

/**
 * Create a clean state snapshot and sync to schedules storage.
 *
 * Original: HistoryModule.updateCleanSnapshot (History.js.html L82-96).
 * Dependencies (injected via `ctx`):
 *   - ctx.classrooms          — current classrooms array
 *   - ctx.scheduleData        — current schedule data object
 *   - ctx.tags                — current tags array
 *   - ctx.schedules           — { [id]: { data } } schedules map
 *   - ctx.activeScheduleId    — string, key into schedules
 *   - ctx.saveSchedulesToLocal() — persistence callback
 *
 * @param {object} ctx - DI context (see above).
 * @returns {string} The new clean state snapshot (JSON string).
 */
export function updateCleanSnapshot(ctx) {
  const snapshot = serializeState(ctx);

  if (ctx.schedules[ctx.activeScheduleId]) {
    ctx.schedules[ctx.activeScheduleId].data = {
      classrooms: structuredClone(ctx.classrooms),
      scheduleData: structuredClone(ctx.scheduleData),
      tags: structuredClone(ctx.tags)
    };
    ctx.saveSchedulesToLocal();
  }

  return snapshot;
}

/**
 * Check whether current state differs from the clean snapshot.
 *
 * Original: HistoryModule.checkDirty (History.js.html L98-105).
 *
 * @param {object} appState - { classrooms, scheduleData, tags }
 * @param {string} cleanSnapshot - The clean state snapshot to compare against.
 * @returns {boolean} True if state differs from snapshot (dirty).
 */
export function checkDirty(appState, cleanSnapshot) {
  const currentSnapshot = serializeState(appState);
  return currentSnapshot !== cleanSnapshot;
}

/**
 * Load a history state back into the app.
 *
 * Original: HistoryModule.loadState (History.js.html L64-75).
 * The original uses structuredClone on state.classrooms, state.scheduleData,
 * and state.tags. If state.tags is undefined, structuredClone throws
 * a DataCloneError.
 *
 * Dependencies (injected via `ctx`):
 *   - ctx.classrooms          — written (replaced with clone)
 *   - ctx.scheduleData        — written (replaced with clone)
 *   - ctx.tags                — written (replaced with clone)
 *   - ctx.ui.updateClassroomList() — UI refresh callback
 *   - ctx.ui.renderScheduleTable() — UI refresh callback
 *
 * @param {object} state - { classrooms, scheduleData, tags } state snapshot to load.
 * @param {object} ctx - DI context (see above).
 * @returns {object} The updated ctx with cloned state applied.
 */
export function loadState(state, ctx) {
  ctx.classrooms = structuredClone(state.classrooms);
  ctx.scheduleData = structuredClone(state.scheduleData);
  ctx.tags = structuredClone(state.tags);

  ctx.ui.updateClassroomList();
  ctx.ui.renderScheduleTable();

  return ctx;
}
