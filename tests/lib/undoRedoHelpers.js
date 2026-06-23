// Extracted Undo/Redo stack logic for testing.
// Ref: #135 — Undo/Redo state integrity tests.
// Source: History.js.html L2-62 (createHistoryModule: saveState, undo, redo, resetHistory).
//
// The original is a closure-based module factory (createHistoryModule) with
// private `history` array and `historyIndex`. This extraction exposes the
// stack management as a pure-ish class with explicit state, making it
// testable without DOM or app object dependencies.
//
// Key behavioral contracts preserved:
// - saveState: dedup identical consecutive states, truncate redo branch,
//   cap at 50 entries (shift oldest)
// - undo: decrement index if > 0, load state via structuredClone
// - redo: increment index if < length-1, load state via structuredClone
// - resetHistory: replace stack with single current state, index = 0

/**
 * Create a testable history module with injected dependencies.
 *
 * Original: createHistoryModule(app) in History.js.html L2-120.
 *
 * @param {object} opts
 * @param {function} opts.getCurrentState - Returns { classrooms, scheduleData, tags } snapshot.
 * @param {function} [opts.onLoadState] - Called with (state) when undo/redo loads a state.
 * @param {function} [opts.onUpdateButtons] - Called after stack changes.
 * @param {function} [opts.onCheckDirty] - Called after stack changes.
 * @param {function} [opts.onUpdateCleanSnapshot] - Called on resetHistory.
 * @returns {object} History module with saveState, undo, redo, resetHistory, getStack, getIndex.
 */
export function createTestableHistoryModule(opts) {
  const {
    getCurrentState,
    onLoadState = () => {},
    onUpdateButtons = () => {},
    onCheckDirty = () => {},
    onUpdateCleanSnapshot = () => {},
  } = opts;

  let history = [];
  let historyIndex = -1;

  const module = {
    saveState() {
      const currentState = getCurrentState();
      // Dedup: skip if identical to last entry
      if (history.length > 0 && JSON.stringify(currentState) === JSON.stringify(history[historyIndex])) {
        return;
      }

      // Truncate redo branch
      history = history.slice(0, historyIndex + 1);
      history.push(currentState);
      historyIndex = history.length - 1;

      // Cap at 50 entries
      if (history.length > 50) {
        history.shift();
        historyIndex--;
      }

      onUpdateButtons();
      onCheckDirty();
    },

    resetHistory() {
      const initialState = getCurrentState();
      history = [initialState];
      historyIndex = 0;
      onUpdateButtons();
      onUpdateCleanSnapshot();
      onCheckDirty();
    },

    undo() {
      if (historyIndex > 0) {
        historyIndex--;
        onLoadState(history[historyIndex]);
      }
    },

    redo() {
      if (historyIndex < history.length - 1) {
        historyIndex++;
        onLoadState(history[historyIndex]);
      }
    },

    // Test-only accessors
    getStack() {
      return history;
    },

    getIndex() {
      return historyIndex;
    },

    canUndo() {
      return historyIndex > 0;
    },

    canRedo() {
      return historyIndex < history.length - 1;
    },
  };

  return module;
}
