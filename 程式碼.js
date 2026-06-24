const SHEET_DATA = "Data";
const SHEET_HISTORY = "History";
const MAX_HISTORY_RECORDS = 20;

// Ref: #64 — Memoize getActiveSpreadsheet per request (GAS does not share state across requests)
let _ss = null;
function _getSs() {
  return _ss || (_ss = SpreadsheetApp.getActiveSpreadsheet());
}

/**
 * Reads a configuration value from Script Properties.
 * @param {string} key The property key.
 * @returns {string} The property value.
 */
function getConfig(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

/**
 * Finds the 1-based row index for a given scheduleId in the Data sheet.
 * @param {string} scheduleId The ID of the schedule to find.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} dataSheet The Data sheet object.
 * @returns {{index: number, values: Array<any>}} An object containing the 1-based row index and the values of that row. Returns -1 if not found.
 */
function _findScheduleRowInfo(scheduleId, dataSheet) {
  const lastRow = dataSheet.getLastRow();
  if (lastRow < 2) return { index: -1, values: [] };
  const range = dataSheet.getRange(`A2:D${lastRow}`);
  const values = range.getValues();
  const rowIndex = values.findIndex(row => row[0] === scheduleId);
  return {
    index: rowIndex === -1 ? -1 : rowIndex + 2, // +2 because it's 0-based and starts from A2
    values: rowIndex === -1 ? [] : values[rowIndex]
  };
}

/**
 * Checks if the current user has permission to manage a schedule.
 * Throws an error if permission is denied.
 * @param {string} createdBy The email of the user who created the schedule.
 */
function _checkPermission(createdBy) {
  const currentUser = Session.getActiveUser().getEmail();
  // Ref: #62 — Guard against empty email (e.g. time-driven triggers return '')
  if (!currentUser) throw new Error('未登入，無法執行此操作');
  // Ref: #152 — All logged-in users can edit/delete/copy/rename
}

/**
 * Ref: #44 — Gets a sheet by name (read path). Returns null if not found.
 * @param {string} name The name of the sheet.
 * @returns {GoogleAppsScript.Spreadsheet.Sheet|null} The sheet object, or null.
 */
function getSheet(name) {
  return _getSs().getSheetByName(name);
}

/**
 * Ref: #44 — Gets or creates a sheet by name (write path).
 * @param {string} name The name of the sheet.
 * @returns {GoogleAppsScript.Spreadsheet.Sheet} The sheet object.
 */
function getOrCreateSheet(name) {
  const ss = _getSs();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    Logger.log(`已創建新的工作表: ${name}`);
    if (name === SHEET_DATA) {
      sheet.getRange("A1:E1").setValues([['Schedule ID', 'Schedule Name', 'Last Modified', 'Created By', 'Is Draft']]);
      sheet.setFrozenRows(1);
    } else if (name === SHEET_HISTORY) {
      sheet.getRange("A1:D1").setValues([["Timestamp", "SavedBy", "ScheduleData Snapshot", "Schedule ID"]]);
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

/**
 * Handles HTTP GET requests to serve the web app.
 * @returns {GoogleAppsScript.HTML.HtmlOutput} The HTML output for the web app.
 */
function doGet() {
  const template = HtmlService.createTemplateFromFile('Index');
  const currentUser = Session.getActiveUser().getEmail();
  const adminEmail = getConfig('ADMIN_EMAIL') || '';
  template.userEmail = currentUser;
  template.isAdmin = currentUser.toLowerCase() === adminEmail.toLowerCase();
  return template.evaluate()
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Retrieves all schedule data. It now reads from dedicated sheets for each schedule.
 * Ref: #67.3 — Design note: getData returns all schedules without per-user filtering.
 * This is intentional: the spreadsheet is domain-scoped (oauthScopes: spreadsheets),
 * and access control is enforced at the GAS webapp level (DOMAIN access in appsscript.json).
 * Fine-grained read ACL is not needed for this use case.
 * @returns {object} An object containing schedules, and lastModified time, or an error object.
 */
function getData() {
  try {
    Logger.log("開始獲取數據");
    const ss = _getSs();
    const dataSheet = getSheet(SHEET_DATA);
    if (!dataSheet) {
      return { success: true, schedules: {}, metadataTimestamp: new Date().toISOString() };
    }
    // Metadata timestamp migration
    let metadataTimestamp = dataSheet.getRange("F1").getValue();
    if (!metadataTimestamp) {
        metadataTimestamp = new Date().toISOString();
        dataSheet.getRange("F1").setValue(metadataTimestamp);
        dataSheet.getRange("F1").setNote('Timestamp for metadata changes (add, rename, delete schedules)');
    }

    Logger.log("以多工作表格式讀取資料。");
    const lastRow = dataSheet.getLastRow();
    if (lastRow < 2) {
      // Ref: #60 — Include success: true for consistency with normal return path
      return { success: true, schedules: {}, metadataTimestamp: metadataTimestamp };
    }
    const indexData = dataSheet.getRange(`A2:E${lastRow}`).getValues();
    const schedules = {};

    // Ref: #15 — Pre-fetch all sheets to avoid N+1 getSheetByName calls
    const allSheets = ss.getSheets();
    const sheetMap = {};
    allSheets.forEach(s => { sheetMap[s.getName()] = s; });

    indexData.forEach(row => {
      const scheduleId = row[0];
      const scheduleName = row[1];
      const lastModified = new Date(row[2]);
      const createdBy = row[3];
      const isDraft = row[4] === true;

      if (scheduleId && scheduleName) {
        const scheduleSheet = sheetMap[scheduleId];
        if (scheduleSheet) {
          const sheetDataRange = scheduleSheet.getRange("B2:B4").getValues();
          let scheduleData = {}, classrooms = [], tags = [];
          // Ref: #16 — Collect parse errors instead of silently swallowing them
          const parseErrors = [];
          try { scheduleData = JSON.parse(sheetDataRange[0][0] || '{}'); } catch(e) { Logger.log(`解析 ${scheduleId} 的 scheduleData 失敗: ${e}`); parseErrors.push(`scheduleData: ${e.message}`); }
          try { classrooms = JSON.parse(sheetDataRange[1][0] || '[]'); } catch(e) { Logger.log(`解析 ${scheduleId} 的 classrooms 失敗: ${e}`); parseErrors.push(`classrooms: ${e.message}`); }
          try { tags = JSON.parse(sheetDataRange[2][0] || '[]'); } catch(e) { Logger.log(`解析 ${scheduleId} 的 tags 失敗: ${e}`); parseErrors.push(`tags: ${e.message}`); }

          schedules[scheduleId] = {
            name: scheduleName,
            createdBy: createdBy,
            isDraft: isDraft,
            lastModified: lastModified.toISOString(),
            data: { scheduleData, classrooms, tags: tags }
          };
          if (parseErrors.length > 0) {
            schedules[scheduleId].parseErrors = parseErrors;
          }
        }
      }
    });

    const result = {
      success: true,
      schedules: schedules,
      metadataTimestamp: metadataTimestamp
    };

    Logger.log(`返回數據: ${JSON.stringify(result).substring(0, 500)}`);
    return result;

  } catch (e) {
    Logger.log(`獲取數據時發生嚴重錯誤: ${e.stack}`);
    return { error: `獲取數據失敗: ${e.toString()}`, success: false };
  }
}

/**
 * Saves a single schedule's data to its dedicated sheet.
 * @param {object} payload The data object to save, containing scheduleId and the schedule's data.
 * @returns {object} A success object with the new lastModified time, or an error object.
 */
function saveData(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    Logger.log(`無法獲取鎖: ${e}`);
    return { error: "伺服器正忙，請稍後再試。", success: false };
  }

  try {
    const { scheduleId, scheduleData, lastModified } = payload;
    if (!scheduleId || !scheduleData || !lastModified) {
      throw new Error("無效的數據格式。數據必須包含 scheduleId, scheduleData, 和 lastModified 時間戳。");
    }

    const ss = _getSs();
    const dataSheet = getOrCreateSheet(SHEET_DATA);

    const { index: rowIndex, values: rowValues } = _findScheduleRowInfo(scheduleId, dataSheet);
    if (rowIndex === -1) {
      throw new Error(`在索引中找不到 ID 為 "${scheduleId}" 的課表。`);
    }

    // Ref: #5 — Enforce admin/creator permission before modifying schedule data
    const createdBy = rowValues[3];
    _checkPermission(createdBy);
    
    const serverLastModified = new Date(rowValues[2]).toISOString();
    if (serverLastModified !== lastModified) {
      return { 
        success: false, 
        error: '儲存失敗！此課表已被他人修改。為避免覆蓋，請先從雲端讀取最新資料後再進行您的變更。',
        conflict: true 
      };
    }

    const scheduleSheet = _getSs().getSheetByName(scheduleId);
    if (!scheduleSheet) {
      throw new Error(`找不到 ID 為 "${scheduleId}" 的工作表。`);
    }

    const userEmail = Session.getActiveUser().getEmail();
    const timestamp = new Date();
    const timestampISO = timestamp.toISOString();

    const dataToSave = {
      scheduleData: scheduleData.scheduleData || {},
      classrooms: scheduleData.classrooms || [],
      tags: scheduleData.tags || []
    };

    scheduleSheet.getRange("B2:B4").setValues([
      [JSON.stringify(dataToSave.scheduleData)],
      [JSON.stringify(dataToSave.classrooms)],
      [JSON.stringify(dataToSave.tags)]
    ]);

    dataSheet.getRange(rowIndex, 3).setValue(timestampISO);
    
    const historySheet = getOrCreateSheet(SHEET_HISTORY);
    historySheet.insertRowBefore(2);
    historySheet.getRange("A2:D2").setValues([[timestampISO, userEmail, JSON.stringify(dataToSave), scheduleId]]);

    // Ref: #12, #65 — Per-schedule history limit: read only scheduleId column (D) for trimming
    const historyLastRow = historySheet.getLastRow();
    if (historyLastRow > 1) {
      const scheduleIdColumn = historySheet.getRange(2, 4, historyLastRow - 1, 1).getValues();
      // Collect 0-based indices (within allHistory) of rows matching this schedule
      const scheduleRows = [];
      for (let i = 0; i < scheduleIdColumn.length; i++) {
        if (scheduleIdColumn[i][0] === scheduleId) {
          scheduleRows.push(i);
        }
      }
      // scheduleRows is in insertion order (newest first since insertRowBefore(2))
      if (scheduleRows.length > MAX_HISTORY_RECORDS) {
        // Delete excess oldest rows (tail of scheduleRows); delete bottom-up to avoid index shift
        const rowsToDelete = scheduleRows.slice(MAX_HISTORY_RECORDS);
        rowsToDelete.sort((a, b) => b - a); // descending so deletion doesn't shift earlier indices
        for (const idx of rowsToDelete) {
          historySheet.deleteRow(idx + 2); // +2: 0-based allHistory index → 1-based sheet row with header
        }
      }
    }

    Logger.log(`數據保存成功 by ${userEmail} for schedule ${scheduleId}`);
    return { success: true, lastModified: timestampISO };

  } catch (e) {
    Logger.log(`保存數據時發生錯誤: ${e.stack}`);
    return { error: `保存數據失敗: ${e.toString()}`, success: false };
  } finally {
    lock.releaseLock();
  }
}

/**
 * A helper function to check for metadata conflicts and update the timestamp.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} dataSheet The Data sheet object.
 * @param {string} clientTimestamp The timestamp provided by the client.
 * @returns {string} The new timestamp for the client to store.
 */
function checkMetadata(dataSheet, clientTimestamp) {
  // Ref: #38 — Normalize to ISO string before comparing; getValue() may return
  // a Date object while clientTimestamp is always a string, causing spurious conflicts.
  const rawValue = dataSheet.getRange("F1").getValue();
  const currentTimestamp = rawValue ? new Date(rawValue).toISOString() : null;
  if (clientTimestamp && currentTimestamp && clientTimestamp !== currentTimestamp) {
    throw new Error('操作失敗！課表列表已被他人修改，請關閉視窗後重新打開以刷新。');
  }
  const newTimestamp = new Date().toISOString();
  dataSheet.getRange("F1").setValue(newTimestamp);
  return newTimestamp;
}

/**
 * Adds a new schedule by creating a new sheet and adding it to the index.
 * Any user can create a schedule.
 * @param {object} scheduleInfo Object containing id, name, and metadataTimestamp.
 * @returns {object} A success object or an error object.
 */
function addSchedule(scheduleInfo) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const { id, name, isDraft, metadataTimestamp } = scheduleInfo; // Added isDraft
    if (!id || !name) throw new Error("必須提供課表 ID 和名稱。");
    // Ref: #66 — Validate schedule ID format to prevent arbitrary sheet name injection
    if (!/^schedule_\d+$/.test(id)) {
      throw new Error('無效的課表 ID 格式。');
    }

    const dataSheet = getOrCreateSheet(SHEET_DATA);
    const newMetaTimestamp = checkMetadata(dataSheet, metadataTimestamp);

    const ss = _getSs();
    if (ss.getSheetByName(id)) {
      throw new Error(`ID 為 \"${id}\" 的工作表已存在。`);
    }

    const newSheet = ss.insertSheet(id);
    newSheet.getRange("A1:B4").setValues([
      ["Key", "Value"],
      ["scheduleData", "{}"],
      ["classrooms", "[]"],
      ["tags", "[]"]
    ]);

    const creatorEmail = Session.getActiveUser().getEmail();
    const timestamp = new Date().toISOString();
    dataSheet.appendRow([id, name, timestamp, creatorEmail, isDraft || false]); // Add isDraft to the row

    Logger.log(`成功新增課表: ${name} (ID: ${id}) by ${creatorEmail}`);
    return { success: true, createdBy: creatorEmail, newMetadataTimestamp: newMetaTimestamp, lastModified: timestamp };

  } catch (e) {
    Logger.log(`新增課表失敗: ${e.stack}`);
    return { error: e.toString(), success: false };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Ref: #67.5 — Renamed from renameSchedule to reflect its actual scope:
 * Updates schedule metadata (name and/or isDraft flag).
 * @param {object} scheduleInfo Object containing id, newName, isDraft, and metadataTimestamp.
 * @returns {object} A success object or an error object.
 */
function updateScheduleMetadata(scheduleInfo) { // Ref: #67.5 — Renamed from renameSchedule
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const { id, newName, isDraft, metadataTimestamp } = scheduleInfo; // Added isDraft
    if (!id) throw new Error("必須提供課表 ID。");

    const dataSheet = getOrCreateSheet(SHEET_DATA);
    const newMetaTimestamp = checkMetadata(dataSheet, metadataTimestamp);

    const { index: rowIndex, values: rowValues } = _findScheduleRowInfo(id, dataSheet);
    if (rowIndex === -1) {
      throw new Error(`在索引中找不到 ID 為 \"${id}\" 的課表。`);
    }

    const createdBy = rowValues[3];
    _checkPermission(createdBy);

    // Update name if provided
    if (newName) {
      dataSheet.getRange(rowIndex, 2).setValue(newName);
    }
    
    // Update isDraft status if provided (isDraft can be true or false, so check if it's defined)
    if (typeof isDraft !== 'undefined') {
      dataSheet.getRange(rowIndex, 5).setValue(isDraft); // Column E is the 5th column
    }

    const newTimestamp = new Date().toISOString();
    dataSheet.getRange(rowIndex, 3).setValue(newTimestamp); // Always update last modified timestamp

    Logger.log(`成功更新課表 ${id} 的元數據 by ${Session.getActiveUser().getEmail()}`);
    return { success: true, newMetadataTimestamp: newMetaTimestamp, lastModified: newTimestamp };

  } catch (e) {
    Logger.log(`更新課表元數據失敗: ${e.stack}`);
    return { error: e.toString(), success: false };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Deletes a schedule. Only admin or the creator can delete.
 * @param {object} scheduleInfo Object containing id and metadataTimestamp.
 * @returns {object} A success object or an error object.
 */
function deleteSchedule(scheduleInfo) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const { id, metadataTimestamp } = scheduleInfo;
    if (!id) throw new Error("必須提供課表 ID。");

    const dataSheet = getOrCreateSheet(SHEET_DATA);
    const newMetaTimestamp = checkMetadata(dataSheet, metadataTimestamp);

    const { index: rowIndex, values: rowValues } = _findScheduleRowInfo(id, dataSheet);
    if (rowIndex === -1) {
      // Ref: #67.6 — Intentional idempotent design: if schedule is already gone from index,
      // return success rather than error. This handles race conditions and retries gracefully.
      Logger.log(`嘗試刪除一個在索引中不存在的課表: ${id}`);
      return { success: true, newMetadataTimestamp: newMetaTimestamp };
    }

    const createdBy = rowValues[3];
    _checkPermission(createdBy);

    const ss = _getSs();
    const scheduleSheet = ss.getSheetByName(id);
    if (scheduleSheet) {
      ss.deleteSheet(scheduleSheet);
    }

    dataSheet.deleteRow(rowIndex);

    Logger.log(`成功刪除課表: ${id} by ${Session.getActiveUser().getEmail()}`);
    return { success: true, newMetadataTimestamp: newMetaTimestamp };

  } catch (e) {
    Logger.log(`刪除課表失敗: ${e.stack}`);
    return { error: e.toString(), success: false };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Copies a schedule, assigning the current user as the new owner.
 * @param {object} copyInfo Object containing sourceId, newName, and metadataTimestamp.
 * @returns {object} A success object with the new schedule's ID and owner.
 */
function copySchedule(copyInfo) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const { sourceId, newName, metadataTimestamp } = copyInfo;
    if (!sourceId || !newName) throw new Error("必須提供來源課表 ID 和新名稱。");

    const dataSheet = getOrCreateSheet(SHEET_DATA);
    const newMetaTimestamp = checkMetadata(dataSheet, metadataTimestamp);

    const { index: sourceRowIndex, values: sourceRowValues } = _findScheduleRowInfo(sourceId, dataSheet);
    if (sourceRowIndex === -1) {
      throw new Error(`在索引中找不到來源課表 (ID: ${sourceId})。`);
    }
    // Ref: #41 — Enforce permission check before copying (same pattern as rename/delete)
    const createdBy = sourceRowValues[3];
    _checkPermission(createdBy);
    const sourceIsDraft = sourceRowValues[4] === true;

    const ss = _getSs();
    const sourceSheet = ss.getSheetByName(sourceId);
    if (!sourceSheet) {
      throw new Error(`找不到來源課表 (ID: ${sourceId})。`);
    }

    const newId = `schedule_${Date.now()}`;
    const newSheet = sourceSheet.copyTo(ss);
    newSheet.setName(newId);

    const creatorEmail = Session.getActiveUser().getEmail();
    const timestamp = new Date().toISOString();
    dataSheet.appendRow([newId, newName, timestamp, creatorEmail, sourceIsDraft]);

    Logger.log(`成功複製課表 ${sourceId} 到 ${newName} (ID: ${newId}) by ${creatorEmail}`);
    return { 
      success: true, 
      newId: newId, 
      createdBy: creatorEmail, 
      newMetadataTimestamp: newMetaTimestamp,
      lastModified: timestamp,
      isDraft: sourceIsDraft
    };

  } catch (e) {
    Logger.log(`複製課表失敗: ${e.stack}`);
    return { error: e.toString(), success: false };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Retrieves a list of saved versions for a specific schedule from the history sheet.
 * @param {string} scheduleId The ID of the schedule to get versions for.
 * @returns {Array<object>|object} An array of version objects or an error object.
 */
function getVersions(scheduleId) {
  try {
    if (!scheduleId) {
      throw new Error("必須提供課表 ID 以獲取版本紀錄。");
    }
    const historySheet = getSheet(SHEET_HISTORY);
    if (!historySheet) return [];
    const lastRow = historySheet.getLastRow();
    if (lastRow < 2) return [];

    const data = historySheet.getRange(`A2:D${lastRow}`).getValues();
    
    const versions = data
      .filter(row => row[3] === scheduleId)
      .map(row => ({ id: row[0], user: row[1] || '未知使用者' }));
      
    return versions;
  } catch (e) {
    Logger.log(`獲取版本列表失敗: ${e.stack}`);
    return { success: false, error: e.toString() };
  }
}

/**
 * Retrieves the data for a specific version ID (timestamp).
 * This function will now return the data for the active schedule of that version.
 * @param {string} versionId The ISO timestamp string of the version to retrieve.
 * @returns {object} A success object with the version data, or an error object.
 */
function getVersionData(versionId) {
  try {
    if (!versionId) {
      throw new Error("未提供版本ID");
    }
    const historySheet = getSheet(SHEET_HISTORY);
    if (!historySheet) {
      return { success: false, error: "找不到指定的版本" };
    }
    // Ref: #45 — Use bounded range instead of full-column scan
    const lastRow = historySheet.getLastRow();
    if (lastRow < 2) {
      return { success: false, error: "找不到指定的版本" };
    }
    const data = historySheet.getRange(`A2:C${lastRow}`).getValues();
    
    // Ref: #39 — Validate date before calling toISOString() to prevent crash
    // on corrupt/invalid date values in the history sheet.
    const versionRow = data.find(row => {
      if (!row[0]) return false;
      const d = new Date(row[0]);
      return !isNaN(d.getTime()) && d.toISOString() === versionId;
    });

    if (versionRow) {
      const scheduleDataSnapshot = JSON.parse(versionRow[2] || '{}');

      const scheduleData = scheduleDataSnapshot.scheduleData || {};
      const classrooms = scheduleDataSnapshot.classrooms || [];
      const tags = scheduleDataSnapshot.tags || [];

      return {
        success: true,
        scheduleData: scheduleData,
        classrooms: classrooms,
        tags: tags,
        versionId: versionId
      };
    }
    
    return { success: false, error: "找不到指定的版本" };
  } catch (e) {
    Logger.log(`獲取版本數據失敗: ${e.stack}`);
    return { success: false, error: e.toString() };
  }
}

/**
 * Gets the font data from the file stored in Google Drive.
 * @returns {string} The Base64 encoded font data.
 */
function getFontBase64FromDrive() {
  try {
    // Ref: #29 — Unified access via getConfig() instead of direct PropertiesService call
    const fileId = getConfig('font_drive_file_id');
    if (!fileId) {
      throw new Error('尚未設定字體檔案的 Google Drive ID。請先執行 _setup_saveFontFileId。');
    }
    
    const file = DriveApp.getFileById(fileId);
    const content = file.getBlob().getDataAsString();
    
    const match = content.match(/const NotoSansTC_Base64 = '([^']+)';/);
    
    if (match && match[1]) {
      // Ref: #47 — Standardized return envelope { success, data }
      return { success: true, data: match[1] };
    } else {
      throw new Error('無法從 Drive 檔案中提取 Base64 字體資料。請確認檔案格式是否正確。');
    }
  } catch (e) {
    Logger.log(`從 Drive 獲取字體時發生錯誤: ${e.stack}`);
    return { success: false, error: e.toString() };
  }
}