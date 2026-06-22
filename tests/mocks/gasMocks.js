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
    getRange: (...args) => {
      const cols = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      let rangeStr;
      if (typeof args[0] === 'number') {
        // getRange(row, col) or getRange(row, col, numRows, numCols)
        const row = args[0];
        const col = args[1];
        if (args.length >= 4) {
          // getRange(row, col, numRows, numCols)
          const numRows = args[2];
          const numCols = args[3];
          rangeStr = `${cols[col - 1]}${row}:${cols[col + numCols - 2]}${row + numRows - 1}`;
        } else {
          // getRange(row, col) — single cell
          rangeStr = `${cols[col - 1]}${row}`;
        }
      } else {
        rangeStr = args[0];
      }
      return createMockRange(cells, rangeStr);
    },
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
    insertRowBefore: (rowNumber) => {
      // Shift all rows >= rowNumber down by 1
      const keys = Object.keys(cells).filter(k => {
        const m = k.match(/([A-Z]+)(\d+)/);
        return m && parseInt(m[2]) >= rowNumber;
      });
      // Sort descending by row number to avoid overwriting
      keys.sort((a, b) => {
        const ra = parseInt(a.match(/\d+/)[0]);
        const rb = parseInt(b.match(/\d+/)[0]);
        return rb - ra;
      });
      for (const key of keys) {
        const m = key.match(/([A-Z]+)(\d+)/);
        const newKey = `${m[1]}${parseInt(m[2]) + 1}`;
        cells[newKey] = cells[key];
        delete cells[key];
      }
    },
    deleteRow: (rowIndex) => {
      // Delete all cells in the row, shift rows above down
      const cols = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      for (let c = 0; c < 26; c++) {
        delete cells[`${cols[c]}${rowIndex}`];
      }
      // Shift rows > rowIndex up by 1
      const maxRow = Object.keys(cells).reduce((max, key) => {
        const m = key.match(/\d+/);
        return m ? Math.max(max, parseInt(m[0])) : max;
      }, 0);
      for (let r = rowIndex + 1; r <= maxRow; r++) {
        for (let c = 0; c < 26; c++) {
          const oldKey = `${cols[c]}${r}`;
          const newKey = `${cols[c]}${r - 1}`;
          if (cells[oldKey] !== undefined) {
            cells[newKey] = cells[oldKey];
            delete cells[oldKey];
          }
        }
      }
    },
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
      deleteSheet: (sheet) => {
        const sheetName = sheet.getName();
        delete sheets[sheetName];
      },
      getSheets: () => Object.values(sheets),
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
 * Creates a mock DriveApp.
 * Supports getFileById → file.getBlob().getDataAsString() chain
 * used by getFontBase64FromDrive (程式碼.js L593-594).
 * Ref: #89 — unlock #87 getFontBase64 testing
 *
 * @param {Object<string, string>} files - Map of fileId → file content string
 */
export function createMockDriveApp(files = {}) {
  return {
    getFileById: (fileId) => {
      const content = files[fileId];
      if (content === undefined) {
        throw new Error(`File not found: ${fileId}`);
      }
      return {
        getBlob: () => ({
          getDataAsString: () => content,
          getBytes: () => [],
          getContentType: () => 'application/octet-stream',
          getName: () => fileId,
        }),
        getName: () => fileId,
        getMimeType: () => 'application/octet-stream',
      };
    },
  };
}

/**
 * Creates a mock UrlFetchApp.
 * Supports fetch(url, options) → HTTPResponse chain.
 * Ref: #89 — future feature mock
 *
 * @param {Object<string, { code: number, body: string, headers?: Object }>} responses
 *   Map of URL → response definition. Unregistered URLs return 404.
 */
export function createMockUrlFetchApp(responses = {}) {
  return {
    fetch: (url, options = {}) => {
      const resp = responses[url] || { code: 404, body: 'Not Found' };
      return {
        getResponseCode: () => resp.code,
        getContentText: () => resp.body,
        getHeaders: () => resp.headers || {},
        getBlob: () => ({
          getDataAsString: () => resp.body,
          getBytes: () => [],
        }),
      };
    },
  };
}

/**
 * Creates a mock Utilities service.
 * Supports base64Encode/base64Decode and formatDate.
 * Ref: #89 — future feature mock
 */
export function createMockUtilities() {
  return {
    base64Encode: (data) => {
      if (typeof data === 'string') {
        return Buffer.from(data).toString('base64');
      }
      return Buffer.from(data).toString('base64');
    },
    base64Decode: (encoded) => {
      return Buffer.from(encoded, 'base64').toString('utf-8');
    },
    formatDate: (date, timeZone, format) => {
      // Simplified: returns ISO string (tests should mock further if needed)
      return date.toISOString();
    },
  };
}

/**
 * Installs all GAS mocks as globals, returns a cleanup function.
 */
export function installGasMocks({
  sheets = {},
  userEmail = 'test@example.com',
  scriptProps = {},
  driveFiles = {},
  urlFetchResponses = {},
} = {}) {
  const mocks = {
    SpreadsheetApp: createMockSpreadsheetApp(sheets),
    Session: createMockSession(userEmail),
    LockService: createMockLockService(),
    PropertiesService: createMockPropertiesService(scriptProps),
    Logger: createMockLogger(),
    HtmlService: createMockHtmlService(),
    DriveApp: createMockDriveApp(driveFiles),
    UrlFetchApp: createMockUrlFetchApp(urlFetchResponses),
    Utilities: createMockUtilities(),
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

