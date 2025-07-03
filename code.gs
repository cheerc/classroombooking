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
    
    Logger.log("從試算表獲取的原始數據: scheduleData=" + scheduleDataJson + ", classrooms=" + classroomsJson);
    
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
      classrooms: classrooms
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
  try {
    Logger.log("開始保存數據");
    Logger.log("接收到的數據: " + JSON.stringify(data));
    
    // 獲取 SpreadsheetApp 對象
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var dataSheet = ss.getSheetByName("Data");
    
    // 如果沒有 Data 表，創建一個
    if (!dataSheet) {
      Logger.log("未找到 Data 表，創建新表");
      dataSheet = ss.insertSheet("Data");
      dataSheet.getRange("A1").setValue("Data");
    }
    
    // 確保數據有效
    var scheduleData = data.scheduleData || {};
    var classrooms = data.classrooms || [];
    
    // 將數據轉換為 JSON 字符串
    var scheduleDataJson = JSON.stringify(scheduleData);
    var classroomsJson = JSON.stringify(classrooms);
    
    // 保存數據
    dataSheet.getRange("A2").setValue(scheduleDataJson);
    dataSheet.getRange("A3").setValue(classroomsJson);
    
    Logger.log("數據保存成功");
    
    return {
      success: true
    };
    
  } catch (e) {
    Logger.log("保存數據時發生錯誤: " + e);
    return {
      error: "保存數據失敗: " + e.toString(),
      success: false
    };
  }
}