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
    
    // 獲取 SpreadsheetApp 對象
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var dataSheet = ss.getSheetByName("Data");
    
    // 如果沒有 Data 表，創建一個
    if (!dataSheet) {
      Logger.log("未找到 Data 表，創建新表");
      dataSheet = ss.insertSheet("Data");
      dataSheet.getRange("A1").setValue("Data");
      dataSheet.getRange("A2").setValue("{}");
      dataSheet.getRange("A3").setValue("[]");
    }
    
    // 獲取數據
    var scheduleDataJson = dataSheet.getRange("A2").getValue();
    var classroomsJson = dataSheet.getRange("A3").getValue();
    var lastModified = dataSheet.getRange("A4").getValue(); // 讀取修改時間
    
    Logger.log("從試算表獲取的原始數據: scheduleData=" + scheduleDataJson + ", classrooms=" + classroomsJson + ", lastModified=" + lastModified);
    
    // 解析數據
    var scheduleData = {};
    var classrooms = [];
    
    try {
      if (scheduleDataJson && scheduleDataJson !== "{}") {
        scheduleData = JSON.parse(scheduleDataJson);
      }
    } catch (e) {
      Logger.log("解析 scheduleData 失敗: " + e);
      scheduleData = {};
    }
    
    try {
      if (classroomsJson && classroomsJson !== "[]") {
        classrooms = JSON.parse(classroomsJson);
      }
    } catch (e) {
      Logger.log("解析 classrooms 失敗: " + e);
      classrooms = [];
    }
    
    // 確保數據是正確的類型
    if (!Array.isArray(classrooms)) {
      Logger.log("classrooms 不是數組，重置為空數組");
      classrooms = [];
    }
    
    if (typeof scheduleData !== 'object' || scheduleData === null) {
      Logger.log("scheduleData 不是對象，重置為空對象");
      scheduleData = {};
    }
    
    // 返回數據
    var result = {
      scheduleData: scheduleData,
      classrooms: classrooms,
      lastModified: lastModified ? new Date(lastModified).toISOString() : null // 回傳 ISO 格式時間
    };
    
    Logger.log("返回數據: " + JSON.stringify(result));
    return result;
    
  } catch (e) {
    Logger.log("獲取數據時發生錯誤: " + e);
    return {
      error: "獲取數據失敗: " + e.toString(),
      success: false
    };
  }
}

// 保存數據
function saveData(data) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    Logger.log('無法獲取鎖: ' + e);
    return { error: "伺服器正忙，請稍後再試。", success: false };
  }

  try {
    Logger.log("開始保存數據 v5.3");
    if (!data || typeof data.scheduleData !== 'object' || !Array.isArray(data.classrooms)) {
      throw new Error("無效的數據格式。");
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var userEmail = Session.getActiveUser().getEmail();
    var userName = userEmail; // Initialize userName with email as fallback

    try {
      // Attempt to get user's display name using People API
      // Ensure People API is enabled in your Apps Script project (Services -> People API)
      const person = People.People.get('people/me', {personFields: 'names'});
      if (person.names && person.names.length > 0 && person.names[0].displayName) {
        userName = person.names[0].displayName;
      }
    } catch (e) {
      Logger.log("無法獲取使用者姓名，將使用Email: " + e.message);
      // userName already initialized with userEmail, so no need to re-assign here
    }
    
    var timestamp = new Date();

    // 1. 更新 "Data" 工作表 (永遠是最新版)
    var dataSheet = ss.getSheetByName("Data");
    if (!dataSheet) {
      dataSheet = ss.insertSheet("Data");
      dataSheet.getRange("A1").setValue("Latest Data");
    }
    var scheduleDataJson = JSON.stringify(data.scheduleData);
    var classroomsJson = JSON.stringify(data.classrooms);
    dataSheet.getRange("A2").setValue(scheduleDataJson);
    dataSheet.getRange("A3").setValue(classroomsJson);
    dataSheet.getRange("A4").setValue(timestamp.toISOString());

    // 2. 更新 "History" 工作表
    var historySheet = ss.getSheetByName("History");
    if (!historySheet) {
      historySheet = ss.insertSheet("History");
      historySheet.getRange("A1:D1").setValues([["Timestamp", "SavedBy", "ScheduleData", "Classrooms"]]);
      historySheet.setFrozenRows(1);
    }
    
    historySheet.insertRowBefore(2); // 在標題下方插入新的一行
    historySheet.getRange("A2:D2").setValues([[
      timestamp.toISOString(),
      userName, // Use userName (either display name or email)
      scheduleDataJson,
      classroomsJson
    ]]);

    // 3. 維護歷史紀錄，只保留最新的10筆
    var maxHistory = 11; // 10筆紀錄 + 1個標題列
    if (historySheet.getMaxRows() > maxHistory) {
      historySheet.deleteRows(maxHistory + 1, historySheet.getMaxRows() - maxHistory);
    }

    Logger.log("數據保存成功 by " + userName);
    return {
      success: true,
      lastModified: timestamp.toISOString()
    };

  } catch (e) {
    Logger.log("保存數據時發生錯誤: " + e);
    return { error: "保存數據失敗: " + e.toString(), success: false };
  } finally {
    lock.releaseLock();
  }
}

// 獲取版本歷史列表
function getVersions() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var historySheet = ss.getSheetByName("History");
    if (!historySheet) {
      return []; // 如果沒有歷史紀錄表，返回空陣列
    }
    var data = historySheet.getRange("A2:B").getValues(); // 只取時間戳和儲存者
    var versions = data.filter(function(row) {
      return row[0]; // 確保時間戳存在
    }).map(function(row) {
      return { id: row[0], user: row[1] };
    });
    return versions;
  } catch (e) {
    Logger.log("獲取版本列表失敗: " + e);
    return { error: e.toString() };
  }
}

// 根據版本ID(時間戳)獲取特定版本的數據
function getVersionData(versionId) {
  try {
    if (!versionId) {
      throw new Error("未提供版本ID");
    }
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var historySheet = ss.getSheetByName("History");
    if (!historySheet) {
      throw new Error("找不到歷史紀錄表");
    }
    var data = historySheet.getRange("A:D").getValues();
    for (var i = 1; i < data.length; i++) { // 從第二行開始找
      if (data[i][0] && data[i][0].toString() === versionId) {
        var scheduleData = JSON.parse(data[i][2]);
        var classrooms = JSON.parse(data[i][3]);
        return {
          success: true,
          scheduleData: scheduleData,
          classrooms: classrooms,
          versionId: versionId
        };
      }
    }
    return { success: false, error: "找不到指定的版本" };
  } catch (e) {
    Logger.log("獲取版本數據失敗: " + e);
    return { success: false, error: e.toString() };
  }
}

