/**
 * GAS Runtime Mock — provides SpreadsheetApp, Session, LockService, Logger,
 * PropertiesService, and HtmlService stubs for testing 程式碼.js functions.
 *
 * Ref: #51 — Wave 5 GAS mock testing phase 2
 */

/**
 * Creates a mock Sheet object with in-memory cell storage.
 * @param {string} name - Sheet name
 * @param {Object} [opts] - Options: { data: Record<string, any> }
 */
export function createMockSheet(name, data = {}) {
  const cells = { ...data }; // key = "A1", value = any
  const frozenRows = 0;

  return {
    getName: () => name,
    setName: (n) => { /* no-op for mock */ },
    getRange: (rangeStr) => createMockRange(cells, rangeStr),
    getLastRow: () => {
      // Compute last row from stored cells
      let maxRow = 1;
      for (const key of Object.keys(cells)) {
        const match = key.match(/\d+/);
        if (match) maxRow = Math.max(maxRow, parseInt(match[0]));
      }
      return maxRow;
    },
    setFrozenRows: (n) => { /* no-op */ },
    appendRow: (values) => {
      // Find next empty row and write values
      const lastRow = Object.keys(cells).reduce((max, key) => {
        const m = key.match(/\d+/);
        return m ? Math.max(max, parseInt(m[0])) : max;
      }, 1);
      const newRow = lastRow + 1;
      const cols = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      values.forEach((v, i) => {
        cells[`${cols[i]}${newRow}`] = v;
      });
    },
    copyTo: () => createMockSheet(`Copy of ${name}`),
  };
}

/**
 * Creates a mock Range object.
 */
function createMockRange(cells, rangeStr) {
  return {
    getValue: () => {
      // Single cell like "F1"
      return cells[rangeStr] ?? '';
    },
    setValue: (val) => {
      cells[rangeStr] = val;
    },
    setNote: () => { /* no-op */ },
    getValues: () => {
      // Parse range like "A2:D5" or "B2:B4" or "A:C"
      const match = rangeStr.match(/([A-Z]+)(\d+)?:([A-Z]+)(\d+)?/);
      if (!match) return [[cells[rangeStr] ?? '']];

      const startCol = match[1].charCodeAt(0) - 65; // A=0
      const endCol = match[3].charCodeAt(0) - 65;
      const startRow = match[2] ? parseInt(match[2]) : 1;
      // For unbounded ranges like "A:C", compute end row from data
      const endRow = match[4] ? parseInt(match[4]) : Object.keys(cells).reduce((max, key) => {
        const m = key.match(/\d+/);
        return m ? Math.max(max, parseInt(m[0])) : max;
      }, startRow);

      const rows = [];
      const cols = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      for (let r = startRow; r <= endRow; r++) {
        const row = [];
        for (let c = startCol; c <= endCol; c++) {
          row.push(cells[`${cols[c]}${r}`] ?? '');
        }
        rows.push(row);
      }
      return rows;
    },
    setValues: (vals) => {
      const match = rangeStr.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/);
      if (!match) return;
      const startCol = match[1].charCodeAt(0) - 65;
      const startRow = parseInt(match[2]);
      const cols = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      vals.forEach((row, ri) => {
        row.forEach((val, ci) => {
          cells[`${cols[startCol + ci]}${startRow + ri}`] = val;
        });
      });
    },
  };
}

/**
 * Creates a mock SpreadsheetApp with named sheets.
 * @param {Object<string, ReturnType<createMockSheet>>} sheets
 */
export function createMockSpreadsheetApp(sheets) {
  return {
    getActiveSpreadsheet: () => ({
      getSheetByName: (name) => sheets[name] || null,
      insertSheet: (name) => {
        const sheet = createMockSheet(name);
        sheets[name] = sheet;
        return sheet;
      },
    }),
  };
}

/**
 * Creates a mock Session.
 * @param {string} email - Current user email
 */
export function createMockSession(email) {
  return {
    getActiveUser: () => ({
      getEmail: () => email,
    }),
  };
}

/**
 * Creates a mock LockService.
 */
export function createMockLockService() {
  return {
    getScriptLock: () => ({
      waitLock: () => { /* no-op */ },
      releaseLock: () => { /* no-op */ },
    }),
  };
}

/**
 * Creates a mock PropertiesService.
 * @param {Object<string, string>} props
 */
export function createMockPropertiesService(props = {}) {
  return {
    getScriptProperties: () => ({
      getProperty: (key) => props[key] ?? null,
    }),
  };
}

/**
 * Creates a mock Logger.
 */
export function createMockLogger() {
  const logs = [];
  return {
    log: (msg) => logs.push(msg),
    getLogs: () => logs,
  };
}

/**
 * Creates a mock HtmlService.
 */
export function createMockHtmlService() {
  return {
    createTemplateFromFile: () => ({
      evaluate: () => ({
        addMetaTag: () => ({}),
      }),
    }),
  };
}

/**
 * Installs all GAS mocks as globals, returns a cleanup function.
 */
export function installGasMocks({
  sheets = {},
  userEmail = 'test@example.com',
  scriptProps = {},
} = {}) {
  const mocks = {
    SpreadsheetApp: createMockSpreadsheetApp(sheets),
    Session: createMockSession(userEmail),
    LockService: createMockLockService(),
    PropertiesService: createMockPropertiesService(scriptProps),
    Logger: createMockLogger(),
    HtmlService: createMockHtmlService(),
  };

  for (const [key, val] of Object.entries(mocks)) {
    globalThis[key] = val;
  }

  return {
    mocks,
    cleanup: () => {
      for (const key of Object.keys(mocks)) {
        delete globalThis[key];
      }
    },
  };
}
