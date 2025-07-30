// Version 6.2.3
const SHEET_DATA = "Data";
const SHEET_HISTORY = "History";

/**
 * Gets a sheet by name, creating it if it doesn't exist.
 * @param {string} name The name of the sheet.
 * @returns {GoogleAppsScript.Spreadsheet.Sheet} The sheet object.
 */
function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    Logger.log(`已創建新的工作表: ${name}`);
    if (name === SHEET_DATA) {
      sheet.getRange("A1:E1").setValues([['Schedule ID', 'Schedule Name', 'Last Modified', 'Created By', 'Active Schedule ID']]);
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
  template.userEmail = Session.getActiveUser().getEmail();
  return template.evaluate()
    .setTitle('教室使用登記表')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Retrieves all schedule data. It now reads from dedicated sheets for each schedule.
 * @returns {object} An object containing schedules, activeScheduleId, and lastModified time, or an error object.
 */
function getData() {
  try {
    Logger.log("開始獲取數據");
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const dataSheet = getSheet_(SHEET_DATA);
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
      return { schedules: {}, activeScheduleId: null, lastModified: null, metadataTimestamp: metadataTimestamp };
    }
    const indexData = dataSheet.getRange("A2:D" + lastRow).getValues();
    const schedules = {};
    let latestModTime = null;

    indexData.forEach(row => {
      const scheduleId = row[0];
      const scheduleName = row[1];
      const lastModified = new Date(row[2]);
      const createdBy = row[3];

      if (scheduleId && scheduleName) {
        const scheduleSheet = ss.getSheetByName(scheduleId);
        if (scheduleSheet) {
          const sheetDataRange = scheduleSheet.getRange("B2:B4").getValues();
          let scheduleData = {}, classrooms = [], departments = [];
          try { scheduleData = JSON.parse(sheetDataRange[0][0] || '{}'); } catch(e) { Logger.log(`解析 ${scheduleId} 的 scheduleData 失敗`); }
          try { classrooms = JSON.parse(sheetDataRange[1][0] || '[]'); } catch(e) { Logger.log(`解析 ${scheduleId} 的 classrooms 失敗`); }
          try { departments = JSON.parse(sheetDataRange[2][0] || '[]'); } catch(e) { Logger.log(`解析 ${scheduleId} 的 departments 失敗`); }

          schedules[scheduleId] = {
            name: scheduleName,
            createdBy: createdBy,
            data: { scheduleData, classrooms, departments }
          };

          if (!latestModTime || lastModified > latestModTime) {
            latestModTime = lastModified;
          }
        }
      }
    });
    
    const activeScheduleId = dataSheet.getRange("E2").getValue() || (indexData.length > 0 ? indexData[0][0] : null);
    dataSheet.getRange("E1").setValue("Active Schedule ID");

    const result = {
      schedules: schedules,
      activeScheduleId: activeScheduleId,
      lastModified: latestModTime ? latestModTime.toISOString() : null,
      metadataTimestamp: metadataTimestamp
    };

    Logger.log("返回數據: " + JSON.stringify(result).substring(0, 500));
    return result;

  } catch (e) {
    Logger.log(`獲取數據時發生嚴重錯誤: ${e.stack}`);
    return { error: `獲取數據失敗: ${e.toString()}`, success: false };
  }
}

/**
 * Saves a single schedule's data to its dedicated sheet.
 * @param {object} data The data object to save, containing scheduleId and the schedule's data.
 * @returns {object} A success object with the new lastModified time, or an error object.
 */
function saveData(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    Logger.log(`無法獲取鎖: ${e}`);
    return { error: "伺服器正忙，請稍後再試。", success: false };
  }

  try {
    Logger.log("開始保存數據: " + JSON.stringify(data).substring(0, 500));
    if (!data || !data.scheduleId || !data.scheduleData) {
      throw new Error("無效的數據格式。數據必須包含 scheduleId 和 scheduleData。");
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const scheduleSheet = ss.getSheetByName(data.scheduleId);
    if (!scheduleSheet) {
      throw new Error(`找不到 ID 為 "${data.scheduleId}" 的工作表。`);
    }

    const userEmail = Session.getActiveUser().getEmail();
    const timestamp = new Date();
    const timestampISO = timestamp.toISOString();

    const scheduleDataJson = JSON.stringify(data.scheduleData.scheduleData || {});
    const classroomsJson = JSON.stringify(data.scheduleData.classrooms || []);
    const departmentsJson = JSON.stringify(data.scheduleData.departments || []);

    // 1. 更新專屬課表工作表的內容
    scheduleSheet.getRange("B2:B4").setValues([
      [scheduleDataJson],
      [classroomsJson],
      [departmentsJson]
    ]);

    // 2. 更新 Data 索引工作表的修改時間
    const dataSheet = getSheet_(SHEET_DATA);
    const scheduleIds = dataSheet.getRange("A2:A" + dataSheet.getLastRow()).getValues().flat();
    const rowIndex = scheduleIds.indexOf(data.scheduleId);
    if (rowIndex !== -1) {
      dataSheet.getRange(rowIndex + 2, 3).setValue(timestampISO);
    }
    
    // 3. 更新活動中的課表 ID
    dataSheet.getRange("D2").setValue(data.activeScheduleId);

    // 4. 更新 History 工作表 (儲存單一課表的快照)
    const historySheet = getSheet_(SHEET_HISTORY);
    historySheet.insertRowBefore(2);
    const historyData = JSON.stringify(data.scheduleData);
    historySheet.getRange("A2:C2").setValues([[timestampISO, userEmail, historyData]]);
    historySheet.getRange("D2").setValue(data.scheduleId); // 記錄是哪個課表的歷史

    const maxHistoryRecords = 20; // Increased history records
    if (historySheet.getLastRow() > maxHistoryRecords + 1) {
      historySheet.deleteRows(maxHistoryRecords + 2, historySheet.getLastRow() - (maxHistoryRecords + 1));
    }

    Logger.log(`數據保存成功 by ${userEmail} for schedule ${data.scheduleId}`);
    return { success: true, lastModified: timestampISO };

  } catch (e) {
    Logger.log(`保存數據時發生錯誤: ${e.stack}`);
    return { error: `保存數據失敗: ${e.toString()}`, success: false };
  } finally {
    lock.releaseLock();
  }
}

/**
 * A helper function to check if the current user is an admin.
 * @returns {void} Throws an error if the user is not an admin.
 */
function checkAdmin_() {
  const adminEmail = 'cheerc@talented.com.tw';
  const currentUserEmail = Session.getActiveUser().getEmail();
  if (currentUserEmail.toLowerCase() !== adminEmail.toLowerCase()) {
    throw new Error('權限不足。只有管理員才能執行此操作。');
  }
}

/**
 * A helper function to check for metadata conflicts and update the timestamp.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} dataSheet The Data sheet object.
 * @param {string} clientTimestamp The timestamp provided by the client.
 * @returns {string} The new timestamp for the client to store.
 */
function checkMetadata_(dataSheet, clientTimestamp) {
  const currentTimestamp = dataSheet.getRange("F1").getValue();
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
    const { id, name, metadataTimestamp } = scheduleInfo;
    if (!id || !name) throw new Error("必須提供課表 ID 和名稱。");

    const dataSheet = getSheet_(SHEET_DATA);
    const newMetaTimestamp = checkMetadata_(dataSheet, metadataTimestamp);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss.getSheetByName(id)) {
      throw new Error(`ID 為 "${id}" 的工作表已存在。`);
    }

    const newSheet = ss.insertSheet(id);
    newSheet.getRange("A1:B4").setValues([
      ["Key", "Value"],
      ["scheduleData", "{}"],
      ["classrooms", "[]"],
      ["departments", "[]"]
    ]);

    const creatorEmail = Session.getActiveUser().getEmail();
    dataSheet.appendRow([id, name, new Date().toISOString(), creatorEmail]);

    Logger.log(`成功新增課表: ${name} (ID: ${id}) by ${creatorEmail}`);
    return { success: true, createdBy: creatorEmail, newMetadataTimestamp: newMetaTimestamp };

  } catch (e) {
    Logger.log(`新增課表失敗: ${e.stack}`);
    return { error: e.toString(), success: false };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Renames a schedule. Only admin or the creator can rename.
 * @param {object} scheduleInfo Object containing id, newName, and metadataTimestamp.
 * @returns {object} A success object or an error object.
 */
function renameSchedule(scheduleInfo) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const { id, newName, metadataTimestamp } = scheduleInfo;
    if (!id || !newName) throw new Error("必須提供課表 ID 和新名稱。");

    const dataSheet = getSheet_(SHEET_DATA);
    const newMetaTimestamp = checkMetadata_(dataSheet, metadataTimestamp);

    const indexData = dataSheet.getRange("A2:D" + dataSheet.getLastRow()).getValues();
    const rowIndex = indexData.findIndex(row => row[0] === id);

    if (rowIndex === -1) {
      throw new Error(`在索引中找不到 ID 為 "${id}" 的課表。`);
    }

    const createdBy = indexData[rowIndex][3];
    const currentUser = Session.getActiveUser().getEmail();
    const isAdmin = currentUser.toLowerCase() === 'cheerc@talented.com.tw';

    if (!isAdmin && currentUser !== createdBy) {
      throw new Error("權限不足。只有管理員或建立者才能重新命名此課表。");
    }

    dataSheet.getRange(rowIndex + 2, 2).setValue(newName);
    dataSheet.getRange(rowIndex + 2, 3).setValue(new Date().toISOString());

    Logger.log(`成功將課表 ${id} 重新命名為: ${newName} by ${currentUser}`);
    return { success: true, newMetadataTimestamp: newMetaTimestamp };

  } catch (e) {
    Logger.log(`重新命名課表失敗: ${e.stack}`);
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

    const dataSheet = getSheet_(SHEET_DATA);
    const newMetaTimestamp = checkMetadata_(dataSheet, metadataTimestamp);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const indexData = dataSheet.getRange("A2:D" + dataSheet.getLastRow()).getValues();
    const rowIndex = indexData.findIndex(row => row[0] === id);

    if (rowIndex === -1) {
      // If it's not in the index, maybe it was already deleted. This is not an error.
      Logger.log(`嘗試刪除一個在索引中不存在的課表: ${id}`);
      return { success: true, newMetadataTimestamp: newMetaTimestamp };
    }

    const createdBy = indexData[rowIndex][3];
    const currentUser = Session.getActiveUser().getEmail();
    const isAdmin = currentUser.toLowerCase() === 'cheerc@talented.com.tw';

    if (!isAdmin && currentUser !== createdBy) {
      throw new Error("權限不足。只有管理員或建立者才能刪除此課表。");
    }

    const scheduleSheet = ss.getSheetByName(id);
    if (scheduleSheet) {
      ss.deleteSheet(scheduleSheet);
    }

    dataSheet.deleteRow(rowIndex + 2);

    Logger.log(`成功刪除課表: ${id} by ${currentUser}`);
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

    const dataSheet = getSheet_(SHEET_DATA);
    const newMetaTimestamp = checkMetadata_(dataSheet, metadataTimestamp);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sourceSheet = ss.getSheetByName(sourceId);
    if (!sourceSheet) {
      throw new Error(`找不到來源課表 (ID: ${sourceId})。`);
    }

    const newId = 'schedule_' + Date.now();
    const newSheet = sourceSheet.copyTo(ss);
    newSheet.setName(newId);

    const creatorEmail = Session.getActiveUser().getEmail();
    dataSheet.appendRow([newId, newName, new Date().toISOString(), creatorEmail]);

    Logger.log(`成功複製課表 ${sourceId} 到 ${newName} (ID: ${newId}) by ${creatorEmail}`);
    return { success: true, newId: newId, createdBy: creatorEmail, newMetadataTimestamp: newMetaTimestamp };

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
    const historySheet = getSheet_(SHEET_HISTORY);
    const lastRow = historySheet.getLastRow();
    if (lastRow < 2) return []; // No data rows

    // Get all data, including the schedule ID column (D)
    const data = historySheet.getRange("A2:D" + lastRow).getValues();
    
    const versions = data
      .filter(row => row[3] === scheduleId) // Filter by scheduleId in column D
      .map(row => ({ id: row[0], user: row[1] || '未知使用者' }));
      
    return versions;
  } catch (e) {
    Logger.log(`獲取版本列表失敗: ${e.stack}`);
    return { error: e.toString() };
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
    const historySheet = getSheet_(SHEET_HISTORY);
    const data = historySheet.getRange("A:C").getValues(); // A: Timestamp, B: User, C: ScheduleData JSON
    
    const versionRow = data.slice(1).find(row => row[0] && new Date(row[0]).toISOString() === versionId);

    if (versionRow) {
      const scheduleDataSnapshot = JSON.parse(versionRow[2] || '{}');

      const scheduleData = scheduleDataSnapshot.scheduleData || {};
      const classrooms = scheduleDataSnapshot.classrooms || [];
      const departments = scheduleDataSnapshot.departments || [];

      return {
        success: true,
        scheduleData: scheduleData,
        classrooms: classrooms,
        departments: departments,
        versionId: versionId
      };
    }
    
    return { success: false, error: "找不到指定的版本" };
  } catch (e) {
    Logger.log(`獲取版本數據失敗: ${e.stack}`);
    return { success: false, error: e.toString() };
  }
}
