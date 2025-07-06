// 共用函式：獲取或創建指定名稱的工作表
function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    Logger.log(`已創建新的工作表: ${name}`);
    // 可在此處進行新表的初始化，例如設定標頭
    if (name === "Data") {
      sheet.getRange("A1").setValue("Latest Data");
      sheet.getRange("A2").setValue("{}"); // scheduleData
      sheet.getRange("A3").setValue("[]"); // classrooms
    } else if (name === "History") {
      sheet.getRange("A1:D1").setValues([["Timestamp", "SavedBy", "ScheduleData", "Classrooms"]]);
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

// 處理 Web App 請求
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('教室使用登記表')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// 獲取數據
function getData() {
  try {
    Logger.log("開始獲取數據");
    const dataSheet = getSheet_("Data");
    
    const scheduleDataJson = dataSheet.getRange("A2").getValue();
    const classroomsJson = dataSheet.getRange("A3").getValue();
    const lastModified = dataSheet.getRange("A4").getValue();
    
    Logger.log(`從試算表獲取的原始數據: scheduleData=${scheduleDataJson}, classrooms=${classroomsJson}, lastModified=${lastModified}`);
    
    let scheduleData = {};
    let classrooms = [];
    
    try {
      if (scheduleDataJson) scheduleData = JSON.parse(scheduleDataJson);
    } catch (e) {
      Logger.log(`解析 scheduleData 失敗: ${e}`);
    }
    
    try {
      if (classroomsJson) classrooms = JSON.parse(classroomsJson);
    } catch (e) {
      Logger.log(`解析 classrooms 失敗: ${e}`);
    }
    
    if (!Array.isArray(classrooms)) classrooms = [];
    if (typeof scheduleData !== 'object' || scheduleData === null) scheduleData = {};
    
    const result = {
      scheduleData: scheduleData,
      classrooms: classrooms,
      lastModified: lastModified ? new Date(lastModified).toISOString() : null
    };
    
    Logger.log("返回數據: " + JSON.stringify(result));
    return result;
    
  } catch (e) {
    Logger.log(`獲取數據時發生錯誤: ${e}`);
    return { error: `獲取數據失敗: ${e.toString()}`, success: false };
  }
}

// 保存數據
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
    if (!data || typeof data.scheduleData !== 'object' || !Array.isArray(data.classrooms)) {
      throw new Error("無效的數據格式。");
    }

    const userEmail = Session.getActiveUser().getEmail();
    let userName = userEmail;
    try {
      const person = People.People.get('people/me', {personFields: 'names'});
      if (person.names && person.names.length > 0 && person.names[0].displayName) {
        userName = person.names[0].displayName;
      }
    } catch (e) {
      Logger.log(`無法獲取使用者姓名，將使用Email: ${e.message}`);
    }
    
    const timestamp = new Date();
    const timestampISO = timestamp.toISOString();
    const scheduleDataJson = JSON.stringify(data.scheduleData);
    const classroomsJson = JSON.stringify(data.classrooms);

    // 1. 更新 "Data" 工作表
    const dataSheet = getSheet_("Data");
    dataSheet.getRange("A2:A4").setValues([[scheduleDataJson], [classroomsJson], [timestampISO]]);

    // 2. 更新 "History" 工作表
    const historySheet = getSheet_("History");
    historySheet.insertRowBefore(2);
    historySheet.getRange("A2:D2").setValues([[timestampISO, userName, scheduleDataJson, classroomsJson]]);

    // 3. 維護歷史紀錄，只保留最新的10筆
    const maxHistory = 11; // 10筆紀錄 + 1個標題列
    if (historySheet.getMaxRows() > maxHistory) {
      historySheet.deleteRows(maxHistory + 1, historySheet.getMaxRows() - maxHistory);
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

// 獲取版本歷史列表
function getVersions() {
  try {
    const historySheet = getSheet_("History");
    const data = historySheet.getRange("A2:B" + historySheet.getLastRow()).getValues();
    const versions = data
      .filter(row => row[0]) // 確保時間戳存在
      .map(row => ({ id: row[0], user: row[1] || '未知使用者' }));
    return versions;
  } catch (e) {
    Logger.log(`獲取版本列表失敗: ${e}`);
    return { error: e.toString() };
  }
}

// 根據版本ID(時間戳)獲取特定版本的數據
function getVersionData(versionId) {
  try {
    if (!versionId) throw new Error("未提供版本ID");
    
    const historySheet = getSheet_("History");
    const data = historySheet.getRange("A:D").getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString() === versionId) {
        return {
          success: true,
          scheduleData: JSON.parse(data[i][2]),
          classrooms: JSON.parse(data[i][3]),
          versionId: versionId
        };
      }
    }
    return { success: false, error: "找不到指定的版本" };
  } catch (e) {
    Logger.log(`獲取版本數據失敗: ${e}`);
    return { success: false, error: e.toString() };
  }
}