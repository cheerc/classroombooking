// Version 6.1.5
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
      sheet.getRange("A1:B1").setValues([["Value", "Key"]]);
      sheet.getRange("A2:B5").setValues([
        ["{}", "schedules"],
        ["default", "activeScheduleId"],
        ["", "lastModified"],
        ["", ""]
      ]);
    } else if (name === SHEET_HISTORY) {
      sheet.getRange("A1:F1").setValues([["Timestamp", "SavedBy", "SchedulesData", "OldScheduleData", "OldClassrooms", "OldDepartments"]]);
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
 * Handles migration from old data format to new multi-schedule format.
 * @returns {object} An object containing schedules, activeScheduleId, and lastModified time, or an error object.
 */
function getData() {
  try {
    Logger.log("開始獲取數據");
    const dataSheet = getSheet_(SHEET_DATA);
    const range = dataSheet.getRange("A2:B5").getValues();
    const rawA2 = range[0][0];
    let isOldFormat = false;

    try {
      if (!rawA2 || rawA2.trim() === '{}') {
        isOldFormat = false; // Empty or new, treat as new format.
      } else {
        const parsedA2 = JSON.parse(rawA2);
        const firstKey = Object.keys(parsedA2)[0];
        // The definitive test: new format has a `data` property in its top-level objects.
        if (firstKey && parsedA2[firstKey] && parsedA2[firstKey].data) {
          isOldFormat = false;
        } else {
          isOldFormat = true;
        }
      }
    } catch (e) {
      Logger.log('解析 A2 儲存格 JSON 失敗，將其視為舊格式進行移轉。錯誤: ' + e);
      isOldFormat = true; // If parsing fails, it's likely old, non-standard data.
    }

    if (isOldFormat) {
      Logger.log("偵測到舊資料格式，開始進行資料轉移...");
      
      let scheduleData = {}, classrooms = [], departments = [];

      try { scheduleData = JSON.parse(range[0][0] || '{}'); } catch (e) { Logger.log('解析 scheduleData 失敗，使用預設值 {}: ' + e); scheduleData = {}; }
      try { classrooms = JSON.parse(range[1][0] || '[]'); } catch (e) { Logger.log('解析 classrooms 失敗，使用預設值 []: ' + e); classrooms = []; }
      try { departments = JSON.parse(range[3][0] || '[]'); } catch (e) { Logger.log('解析 departments 失敗，使用預設值 []: ' + e); departments = []; }

      if (typeof scheduleData !== 'object' || scheduleData === null) scheduleData = {};
      if (!Array.isArray(classrooms)) classrooms = [];
      if (!Array.isArray(departments)) departments = [];

      Object.values(scheduleData).forEach(classroom => {
        if(classroom && typeof classroom === 'object') {
          Object.values(classroom).forEach(day => {
            if(Array.isArray(day)) {
              day.forEach(course => {
                if (course && !course.departments) {
                  course.departments = [];
                }
              });
            }
          });
        }
      });

      const newSchedules = {
        'default': {
          name: '預設課表',
          data: {
            scheduleData: scheduleData,
            classrooms: classrooms,
            departments: departments
          }
        }
      };
      const newActiveScheduleId = 'default';
      
      Logger.log("資料轉移完成，正在將新格式寫回工作表...");
      
      const schedulesJson = JSON.stringify(newSchedules);
      const timestamp = new Date();
      
      dataSheet.getRange("A2:B5").setValues([
        [schedulesJson, "schedules"],
        [newActiveScheduleId, "activeScheduleId"],
        [timestamp.toISOString(), "lastModified"],
        ["", ""] 
      ]);
      
      const historySheet = getSheet_(SHEET_HISTORY);
      historySheet.insertRowBefore(2);
      historySheet.getRange("A2:F2").setValues([[
          timestamp.toISOString(), 
          "SYSTEM_MIGRATION", 
          schedulesJson, 
          "{}", 
          "[]", 
          "[]"  
      ]]);

      Logger.log("新格式寫入成功。");

      return {
        schedules: newSchedules,
        activeScheduleId: newActiveScheduleId,
        lastModified: timestamp.toISOString()
      };

    } else {
      Logger.log("偵測到新資料格式。");
      const schedulesJson = range[0][0] || '{}';
      const activeScheduleId = range[1][0];
      const lastModified = range[2][0];

      let schedules = {};
      try { if (schedulesJson) schedules = JSON.parse(schedulesJson); } catch (e) { Logger.log(`解析 schedules 失敗: ${e}`); }

      if (typeof schedules !== 'object' || schedules === null) schedules = {};
      
      if (Object.keys(schedules).length === 0) {
          schedules = {
              'default': {
                  name: '預設課表',
                  data: { scheduleData: {}, classrooms: [], departments: [] }
              }
          };
      }

      const result = {
        schedules: schedules,
        activeScheduleId: activeScheduleId || Object.keys(schedules)[0], 
        lastModified: lastModified ? new Date(lastModified).toISOString() : null
      };
      
      Logger.log("返回數據: " + JSON.stringify(result).substring(0, 500));
      return result;
    }
    
  } catch (e) {
    Logger.log(`獲取數據時發生錯誤: ${e.stack}`);
    return { error: `獲取數據失敗: ${e.toString()}`, success: false };
  }
}

/**
 * Saves schedule data to the spreadsheet and creates a history entry.
 * @param {object} data The data object to save, containing schedules and activeScheduleId.
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
    if (!data || typeof data.schedules !== 'object' || !data.activeScheduleId) {
      throw new Error("無效的數據格式。數據必須包含 schedules 和 activeScheduleId。");
    }

    const userEmail = Session.getActiveUser().getEmail();
    const userName = userEmail;
    
    const timestamp = new Date();
    const timestampISO = timestamp.toISOString();
    const schedulesJson = JSON.stringify(data.schedules);
    const activeScheduleId = data.activeScheduleId;

    // 1. 更新 "Data" 工作表
    const dataSheet = getSheet_(SHEET_DATA);
    dataSheet.getRange("A2:B4").setValues([
      [schedulesJson, "schedules"],
      [activeScheduleId, "activeScheduleId"],
      [timestampISO, "lastModified"]
    ]);

    // 2. 更新 "History" 工作表
    const historySheet = getSheet_(SHEET_HISTORY);
    historySheet.insertRowBefore(2);
    // For simplicity, we now save the entire schedules object in history.
    // The old format columns will be empty.
    historySheet.getRange("A2:F2").setValues([[timestampISO, userName, schedulesJson, "", "", ""]]);

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
      .map(row => ({ id: row[0], user: row[1] || '未知使用者' }));
    return versions;
  } catch (e) {
    Logger.log(`獲取版本列表失敗: ${e}`);
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
    const data = historySheet.getRange("A:C").getValues(); // A: Timestamp, B: User, C: Schedules JSON
    
    const versionRow = data.slice(1).find(row => row[0] && new Date(row[0]).toISOString() === versionId);

    if (versionRow) {
      const schedulesJson = versionRow[2];
      // If schedulesJson is empty, it might be a very old record before the multi-schedule feature.
      // In that case, we can't load it. This check handles future flexibility.
      if (!schedulesJson) {
        return { success: false, error: "此歷史紀錄格式過舊，無法讀取。" };
      }

      const schedules = JSON.parse(schedulesJson);
      
      // To determine the active schedule at that point in time, we need to look at the *next* save entry's active ID,
      // but that is too complex. A simpler approach is to find the active schedule ID from the main Data sheet
      // at the time of the version. But for simplicity now, we will assume the user wants to see the first schedule
      // in the list, or we can try to find a schedule named '預設課表' or 'default'.
      // Let's find the active schedule ID from the *current* data sheet for simplicity.
      const dataSheet = getSheet_(SHEET_DATA);
      const currentActiveId = dataSheet.getRange("A3").getValue();

      const scheduleToLoad = schedules[currentActiveId] || schedules[Object.keys(schedules)[0]];

      if (!scheduleToLoad) {
        return { success: false, error: "在指定的版本中找不到有效的課表資料。" };
      }

      const scheduleData = scheduleToLoad.data.scheduleData || {};
      const classrooms = scheduleToLoad.data.classrooms || [];
      const departments = scheduleToLoad.data.departments || [];

      // Data migration for just in case
      Object.values(scheduleData).forEach(classroom => {
        Object.values(classroom).forEach(day => {
          day.forEach(course => {
            if (!course.departments) {
              course.departments = [];
            }
          });
        });
      });

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
    Logger.log(`獲取版本數據失敗: ${e}`);
    return { success: false, error: e.toString() };
  }
}
