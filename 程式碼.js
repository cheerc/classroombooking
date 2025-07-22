// Version 6.2.1
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
      sheet.getRange("A1:D1").setValues([['Schedule ID', 'Schedule Name', 'Last Modified', 'Active Schedule ID']]);
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
 * Handles migration from the single-cell JSON format to the multi-sheet format.
 * @returns {object} An object containing schedules, activeScheduleId, and lastModified time, or an error object.
 */
function getData() {
  try {
    Logger.log("開始獲取數據");
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const dataSheet = getSheet_(SHEET_DATA);
    const headerRange = dataSheet.getRange("A1:B1").getValues();
    
    // The definitive test for the new format is the header of the Data sheet.
    const isNewFormat = headerRange[0][0] === 'Schedule ID' && headerRange[0][1] === 'Schedule Name';

    if (!isNewFormat) {
      Logger.log("偵測到舊的單一儲存格格式，開始進行多工作表移轉...");
      const range = dataSheet.getRange("A2:B3").getValues();
      const schedulesJson = range[0][0] || '{}';
      const activeScheduleId = range[1][0];
      let schedules = {};
      try { schedules = JSON.parse(schedulesJson); } catch(e) { /* ignore */ }

      // 1. Clear and re-header the Data sheet to be an index
      dataSheet.clear();
      dataSheet.getRange("A1:C1").setValues([['Schedule ID', 'Schedule Name', 'Last Modified']]);
      dataSheet.setFrozenRows(1);

      // 2. Iterate through schedules, create a sheet for each, and write data
      for (const scheduleId in schedules) {
        const schedule = schedules[scheduleId];
        const newSheet = ss.insertSheet(scheduleId);
        
        const scheduleDataJson = JSON.stringify(schedule.data.scheduleData || {});
        const classroomsJson = JSON.stringify(schedule.data.classrooms || []);
        const departmentsJson = JSON.stringify(schedule.data.departments || []);
        
        newSheet.getRange("A1:B4").setValues([
          ["Key", "Value"],
          ["scheduleData", scheduleDataJson],
          ["classrooms", classroomsJson],
          ["departments", departmentsJson]
        ]);

        // 3. Add an entry to the new index in the Data sheet
        const timestamp = new Date().toISOString();
        dataSheet.appendRow([scheduleId, schedule.name, timestamp]);
      }

      Logger.log("資料庫移轉至多工作表格式成功。");
      // After migration, fall through to read the data in the new format.
    }

    // --- Read data in the new, multi-sheet format ---
    Logger.log("以多工作表格式讀取資料。");
    const lastRow = dataSheet.getLastRow();
    if (lastRow < 2) { // No schedules exist
      Logger.log("在 Data 索引中找不到任何課表。");
      return { schedules: {}, activeScheduleId: null, lastModified: null };
    }
    const indexData = dataSheet.getRange("A2:C" + lastRow).getValues();
    const schedules = {};
    let latestModTime = null;

    indexData.forEach(row => {
      const scheduleId = row[0];
      const scheduleName = row[1];
      const lastModified = new Date(row[2]);

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
            data: { scheduleData, classrooms, departments }
          };

          if (!latestModTime || lastModified > latestModTime) {
            latestModTime = lastModified;
          }
        }
      }
    });
    
    const activeScheduleId = dataSheet.getRange("D2").getValue() || (indexData.length > 0 ? indexData[0][0] : null);
    dataSheet.getRange("D1").setValue("Active Schedule ID");

    const result = {
      schedules: schedules,
      activeScheduleId: activeScheduleId,
      lastModified: latestModTime ? latestModTime.toISOString() : null
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
 * Adds a new schedule by creating a new sheet and adding it to the index.
 * @param {object} scheduleInfo Object containing the new schedule's id and name.
 * @returns {object} A success object or an error object.
 */
function addSchedule(scheduleInfo) {
  const lock = LockService.getScriptLock();
  try {
    checkAdmin_(); // Permission check
    lock.waitLock(30000);
    const { id, name } = scheduleInfo;
    if (!id || !name) throw new Error("必須提供課表 ID 和名稱。");

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss.getSheetByName(id)) {
      throw new Error(`ID 為 "${id}" 的工作表已存在。`);
    }

    // 1. Create the new sheet for the schedule
    const newSheet = ss.insertSheet(id);
    newSheet.getRange("A1:B4").setValues([
      ["Key", "Value"],
      ["scheduleData", "{}"],
      ["classrooms", "[]"],
      ["departments", "[]"]
    ]);

    // 2. Add the new schedule to the index in the Data sheet
    const dataSheet = getSheet_(SHEET_DATA);
    dataSheet.appendRow([id, name, new Date().toISOString()]);

    Logger.log(`成功新增課表: ${name} (ID: ${id})`);
    return { success: true };

  } catch (e) {
    Logger.log(`新增課表失敗: ${e.stack}`);
    return { error: e.toString(), success: false };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Renames a schedule in the Data index sheet.
 * @param {object} scheduleInfo Object containing the schedule's id and new name.
 * @returns {object} A success object or an error object.
 */
function renameSchedule(scheduleInfo) {
  const lock = LockService.getScriptLock();
  try {
    checkAdmin_(); // Permission check
    lock.waitLock(30000);
    const { id, newName } = scheduleInfo;
    if (!id || !newName) throw new Error("必須提供課表 ID 和新名稱。");

    const dataSheet = getSheet_(SHEET_DATA);
    const scheduleIds = dataSheet.getRange("A2:A" + dataSheet.getLastRow()).getValues().flat();
    const rowIndex = scheduleIds.indexOf(id);

    if (rowIndex === -1) {
      throw new Error(`在索引中找不到 ID 為 "${id}" 的課表。`);
    }

    // Update the name in the Data sheet (column B)
    dataSheet.getRange(rowIndex + 2, 2).setValue(newName);
    dataSheet.getRange(rowIndex + 2, 3).setValue(new Date().toISOString()); // Also update modified time

    Logger.log(`成功將課表 ${id} 重新命名為: ${newName}`);
    return { success: true };

  } catch (e) {
    Logger.log(`重新命名課表失敗: ${e.stack}`);
    return { error: e.toString(), success: false };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Deletes a schedule's sheet and removes it from the index.
 * @param {object} scheduleInfo Object containing the ID of the schedule to delete.
 * @returns {object} A success object or an error object.
 */
function deleteSchedule(scheduleInfo) {
  const lock = LockService.getScriptLock();
  try {
    checkAdmin_(); // Permission check
    lock.waitLock(30000);
    const { id } = scheduleInfo;
    if (!id) throw new Error("必須提供課表 ID。");

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const dataSheet = getSheet_(SHEET_DATA);

    // 1. Delete the actual schedule sheet
    const scheduleSheet = ss.getSheetByName(id);
    if (scheduleSheet) {
      ss.deleteSheet(scheduleSheet);
    } else {
      Logger.log(`嘗試刪除一個不存在的工作表: ${id}`);
    }

    // 2. Remove the schedule from the index in the Data sheet
    const scheduleIds = dataSheet.getRange("A2:A" + dataSheet.getLastRow()).getValues().flat();
    const rowIndex = scheduleIds.indexOf(id);

    if (rowIndex !== -1) {
      dataSheet.deleteRow(rowIndex + 2);
    }

    Logger.log(`成功刪除課表: ${id}`);
    return { success: true };

  } catch (e) {
    Logger.log(`刪除課表失敗: ${e.stack}`);
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
