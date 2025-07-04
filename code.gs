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
  // 等待最多 30 秒
  try {
    lock.waitLock(30000);
  } catch (e) {
    Logger.log('無法獲取鎖: ' + e);
    return {
      error: "伺服器正忙，請稍後再試。 Could not obtain lock.",
      success: false
    };
  }

  try {
    Logger.log("開始保存數據");
    
    // 基本的數據驗證
    if (!data || typeof data.scheduleData !== 'object' || !Array.isArray(data.classrooms)) {
      Logger.log("接收到的數據格式不正確: " + JSON.stringify(data));
      throw new Error("無效的數據格式。");
    }
    
    Logger.log("接收到的數據 (前500字元): " + JSON.stringify(data).substring(0, 500));
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var dataSheet = ss.getSheetByName("Data");
    
    if (!dataSheet) {
      Logger.log("未找到 Data 表，創建新表");
      dataSheet = ss.insertSheet("Data");
      dataSheet.getRange("A1").setValue("Data");
    }
    
    var scheduleData = data.scheduleData;
    var classrooms = data.classrooms;
    
    var scheduleDataJson = JSON.stringify(scheduleData);
    var classroomsJson = JSON.stringify(classrooms);
    
    var lastModified = new Date();
    dataSheet.getRange("A2").setValue(scheduleDataJson);
    dataSheet.getRange("A3").setValue(classroomsJson);
    dataSheet.getRange("A4").setValue(lastModified.toISOString()); // 寫入 ISO 格式時間
    
    Logger.log("數據保存成功");
    
    return {
      success: true,
      lastModified: lastModified.toISOString() // 將新時間回傳給前端
    };
    
  } catch (e) {
    Logger.log("保存數據時發生錯誤: " + e);
    return {
      error: "保存數據失敗: " + e.toString(),
      success: false
    };
  } finally {
    // 確保釋放鎖
    lock.releaseLock();
  }
}