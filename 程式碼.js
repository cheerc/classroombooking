// Version 6.1.1
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
      sheet.getRange("A1:A5").setValues([["Latest Data"], ["{}"], ["[]"], ["Last Modified"], ["{}"]]);
      sheet.getRange("B1:B5").setValues([["scheduleData"], ["classrooms"], [""], ["filterPresets"]]);
    } else if (name === SHEET_HISTORY) {
      sheet.getRange("A1:E1").setValues([["Timestamp", "SavedBy", "ScheduleData", "Classrooms", "FilterPresets"]]);
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
 * Retrieves the latest schedule data from the spreadsheet.
 * @returns {object} An object containing scheduleData, classrooms, filterPresets, and lastModified time, or an error object.
 */
function getData() {
  try {
    Logger.log("開始獲取數據");
    const dataSheet = getSheet_(SHEET_DATA);
    
    const range = dataSheet.getRange("A2:A5").getValues();
    const scheduleDataJson = range[0][0];
    const classroomsJson = range[1][0];
    const lastModified = range[2][0];
    const filterPresetsJson = range[3][0];
    
    Logger.log(`從試算表獲取的原始數據: scheduleData=${scheduleDataJson}, classrooms=${classroomsJson}, filterPresets=${filterPresetsJson}, lastModified=${lastModified}`);
    
    let scheduleData = {};
    let classrooms = [];
    let filterPresets = {};
    
    try { if (scheduleDataJson) scheduleData = JSON.parse(scheduleDataJson); } catch (e) { Logger.log(`解析 scheduleData 失敗: ${e}`); }
    try { if (classroomsJson) classrooms = JSON.parse(classroomsJson); } catch (e) { Logger.log(`解析 classrooms 失敗: ${e}`); }
    try { if (filterPresetsJson) filterPresets = JSON.parse(filterPresetsJson); } catch (e) { Logger.log(`解析 filterPresets 失敗: ${e}`); }
    
    if (!Array.isArray(classrooms)) classrooms = [];
    if (typeof scheduleData !== 'object' || scheduleData === null) scheduleData = {};
    if (typeof filterPresets !== 'object' || filterPresets === null) filterPresets = {};
    
    const result = {
      scheduleData: scheduleData,
      classrooms: classrooms,
      filterPresets: filterPresets,
      lastModified: lastModified ? new Date(lastModified).toISOString() : null
    };
    
    Logger.log("返回數據: " + JSON.stringify(result));
    return result;
    
  } catch (e) {
    Logger.log(`獲取數據時發生錯誤: ${e}`);
    return { error: `獲取數據失敗: ${e.toString()}`, success: false };
  }
}

/**
 * Saves schedule data to the spreadsheet and creates a history entry.
 * @param {object} data The data object to save, containing scheduleData, classrooms, and filterPresets.
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
    Logger.log("開始保存數據");
    if (!data || typeof data.scheduleData !== 'object' || !Array.isArray(data.classrooms) || typeof data.filterPresets !== 'object') {
      throw new Error("無效的數據格式。");
    }

    const userEmail = Session.getActiveUser().getEmail();
    const userName = userEmail;
    
    const timestamp = new Date();
    const timestampISO = timestamp.toISOString();
    const scheduleDataJson = JSON.stringify(data.scheduleData);
    const classroomsJson = JSON.stringify(data.classrooms);
    const filterPresetsJson = JSON.stringify(data.filterPresets);

    // 1. 更新 "Data" 工作表
    const dataSheet = getSheet_(SHEET_DATA);
    dataSheet.getRange("A2:A5").setValues([[scheduleDataJson], [classroomsJson], [timestampISO], [filterPresetsJson]]);

    // 2. 更新 "History" 工作表
    const historySheet = getSheet_(SHEET_HISTORY);
    historySheet.insertRowBefore(2);
    historySheet.getRange("A2:E2").setValues([[timestampISO, userName, scheduleDataJson, classroomsJson, filterPresetsJson]]);

    // 3. 維護歷史紀錄，只保留最新的10筆
    const maxHistoryRecords = 10;
    const headerRows = 1;
    const totalAllowedRows = maxHistoryRecords + headerRows;
    if (historySheet.getLastRow() > totalAllowedRows) {
      historySheet.deleteRows(totalAllowedRows + 1, historySheet.getLastRow() - totalAllowedRows);
    }

    Logger.log(`數據保存成功 by ${userName}`);
    return { success: true, lastModified: timestampISO };

  } catch (e) {
    Logger.log(`保存數據時發生錯誤: ${e}`);
    return { error: `保存數據失敗: ${e.toString()}`, success: false };
  } finally {
    lock.releaseLock();
  }
}

function getShortUserName_(email) {
  if (!email || email.indexOf('@') === -1) return email;
  return email.split('@')[0];
}

/**
 * Retrieves a list of saved versions from the history sheet.
 * @returns {Array<object>|object} An array of version objects or an error object.
 */
function getVersions() {
  try {
    const historySheet = getSheet_(SHEET_HISTORY);
    const lastRow = historySheet.getLastRow();
    if (lastRow < 2) return []; // No data rows
    const data = historySheet.getRange("A2:B" + lastRow).getValues();
    const versions = data
      .filter(row => row[0]) // 確保時間戳存在
      .map(row => ({ id: row[0], user: getShortUserName_(row[1]) || '未知使用者' }));
    return versions;
  } catch (e) {
    Logger.log(`獲取版本列表失敗: ${e}`);
    return { error: e.toString() };
  }
}

/**
 * Retrieves the data for a specific version ID (timestamp).
 * @param {string} versionId The ISO timestamp string of the version to retrieve.
 * @returns {object} A success object with the version data, or an error object.
 */
function getVersionData(versionId) {
  try {
    if (!versionId) {
      throw new Error("未提供版本ID");
    }
    const historySheet = getSheet_(SHEET_HISTORY);
    const data = historySheet.getRange("A:E").getValues();
    
    // Find the row matching the versionId. Comparing by string representation is safer.
    const versionRow = data.slice(1).find(row => row[0] && new Date(row[0]).toISOString() === versionId);

    if (versionRow) {
      return {
        success: true,
        scheduleData: JSON.parse(versionRow[2]),
        classrooms: JSON.parse(versionRow[3]),
        filterPresets: versionRow[4] ? JSON.parse(versionRow[4]) : {},
        versionId: versionId
      };
    }
    
    return { success: false, error: "找不到指定的版本" };
  } catch (e) {
    Logger.log(`獲取版本數據失敗: ${e}`);
    return { success: false, error: e.toString() };
  }
}
