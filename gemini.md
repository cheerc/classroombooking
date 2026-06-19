# Gemini - 專案維護指南

本文件旨在提供維護此「教室預約系統」專案時的必要資訊，確保開發上的一致性與效率。

## 專案概覽

此專案包含兩個主要部分：

1.  **Google Apps Script 課表編輯器**：一個建立在 Google Apps Script 上的 Web App，提供一個視覺化的介面來管理**多個獨立課表**的課程預約。使用者可以透過拖拉、點擊等方式新增、修改、刪除課程。此編輯器支援**預排課表 (Draft Mode)**，讓管理者可以在不影響公開畫面的情況下進行規劃。所有資料都儲存在後端的 Google Sheet 中。
2.  **PHP 唯讀課表檢視器 (`classroom_viewer/`)**：一個輕量的、基於 PHP 的獨立應用，用於生成課表的唯讀視圖。它透過 Google API Service Account 直接讀取 Google Sheet 資料，專為嵌入到其他網站 (`iframe`) 而設計，並具備響應式與高度自動調整功能。此檢視器會**自動隱藏**所有被標示為「預排」的課表。

### 核心應用 (Apps Script 編輯器)

- **前端**: 使用 HTML、CSS (Tailwind CSS) 和原生 JavaScript 建立互動介面。樣式系統透過 **npm** 與 **Tailwind CLI** 進行建置。
- **後端**: 使用 Google Apps Script (`.gs` 或 `.js` 檔案) 處理資料的讀取、儲存和版本控制。
- **資料庫**: 使用 Google Sheet。其中一個 `Data` 工作表作為所有課表的**索引**，而每一個獨立的課表則有其**專屬的工作表**來儲存詳細資料。

---

## 主要功能詳述

### 預排課表 (Draft Mode)

- **目的**：允許管理者在規劃新學期或進行大幅度調整時，先建立一個「預排」版本的課表，而不會影響到目前正在使用的公開課表。
- **設定方式**：在「課表管理」中新增或編輯課表時，勾選「**設為預排課表**」即可。
- **效果**：
    - 被標示為「預排」的課表，在編輯器中會以「(預排)」字樣標示。
    - 「預排課表」的內容**不會**顯示在 PHP 唯讀檢視器中。
    - 在編輯器的「所有課程 (排除預排)」合併檢視模式下，也會被自動過濾。

### 版本控制

- **功能**：每次成功「儲存至雲端」時，系統都會為該課表建立一個時間戳版本的快照。
- **用途**：管理者可以透過「版本紀錄」功能，瀏覽特定課表的歷史存檔紀錄，並選擇將課表內容還原到過去的某個版本。
- **注意**：此功能只會還原課表的**內容**（課程、教室、標籤等），不會還原課表的**元數據**（例如課表名稱、是否為預排狀態）。

### 兩階段篩選系統

- **主要標籤篩選**：位於頂部的主要篩選框，可快速依據「標籤」篩選出當前課表的課程。
- **進階篩選**：點擊篩選圖示後，可從第一步的結果中，再依「課程名稱」或「使用人」進行更精確的二次篩選。

---

## 檔案結構

專案的檔案主要分為 Apps Script 應用、PHP 檢視器與通用開發工具三大部分。

### 1. Apps Script 應用 (根目錄)

- **`程式碼.js`**: 核心後端邏輯，負責與 Google Sheet 互動、處理 `doGet` 請求、權限管理等。
- **`Index.html`**: 前端主入口 HTML 檔案，載入所有 CSS 與 JS。
- **`JavaScript.html`**: 核心前端邏輯，管理狀態、篩選、與後端溝通等。
- **`UI.js.html`, `Interaction.js.html`, `Modals.js.html`**: 其他前端模組化檔案，分別處理 UI 渲染、使用者互動、彈出視窗等邏輯。

### 2. 唯讀課表檢視器 (PHP)

位於 `classroom_viewer/` 目錄下，是一個獨立的 PHP 應用。

- **`index.php`**: 整個應用的單一進入點。負責處理 URL 參數、透過 Google API 讀取試算表資料、篩選課程、並生成最終的 HTML 課表視圖。
- **`composer.json` / `composer.lock`**: PHP 的依賴管理設定檔，定義了專案所需的函式庫 (例如 `google/apiclient`)。
- **`vendor/`**: Composer 安裝的 PHP 函式庫目錄。
- **`credentials/`**: 用於存放 Google Service Account 的 `service-account-key.json` 金鑰檔案。**此目錄下的金鑰檔案已被 `.gitignore` 忽略，切勿提交至版本控制。**

### 3. 開發工具 (根目錄)

- **`package.json`**: `npm` 的設定檔，用於管理前端開發依賴 (例如 `tailwindcss`)。
- **`tailwind.config.js`**: Tailwind CSS 的設定檔。
- **`.gitignore`**: Git 忽略清單，確保 `node_modules` 等檔案不會被提交。

---

## 課表檢視器 (`classroom_viewer`) 使用指南

此 PHP 應用程式可生成一個乾淨、可嵌入的課表視圖。

### 功能亮點

- **唯讀顯示**：僅供檢視，無法編輯，確保資料安全。
- **自動排除預排**：自動過濾掉所有在編輯器中被標示為「預排」的課表。
- **多課表合併**：可在一個視圖中，同時顯示來自多個不同課表的課程資料。
- **獨立運作**：透過 Service Account 運作，不需使用者登入 Google 帳號。
- **標籤篩選**：支援透過 `tags` (包含) 和 `exclude_tags` (排除) 進行內容篩選。
- **嵌入優化**：專為 `iframe` 嵌入設計，並提供高度自動調整腳本。
- **行動裝置瀏覽**：採用固定寬度桌面佈局，在手機上會自動縮小，使用者可自行縮放，確保排版不變形。

### 使用方式 (URL 參數)

檢視器透過 URL 的 GET 參數來控制顯示的內容。

- **`schedule_name`** (必要)
  - 要顯示的課表名稱。 
  - 若要同時顯示多個課表，請用**逗號 (`,`)** 分隔。
  - 範例：`?schedule_name=國中部教室`
  - 範例 (多課表)：`?schedule_name=國中部教室,國小部教室`

- **`tags`** (可選)
  - 只顯示包含至少一個指定標籤的課程。
  - 範例：`&tags=國一`

- **`exclude_tags`** (可選)
  - 從結果中，排除包含任何指定標籤的課程。
  - 範例：`&exclude_tags=停課,補課`

**完整範例 URL：**
```
https://your-domain.com/classroom_viewer/?schedule_name=國中部教室,國小部教室&tags=國一&exclude_tags=停課
```

### 嵌入指南 (`iframe`)

您可以將檢視器嵌入到任何支援 `iframe` 的網頁中。

#### 1. `iframe` 標籤

在您的父層網頁中，加入以下 HTML。請注意，為了讓高度自動調整腳本能找到目標，`iframe` 必須包含 `class="auto-resize-iframe"`。

```html
<iframe 
  class="auto-resize-iframe"
  id="schedule1-iframe" 
  src="https://your-domain.com/classroom_viewer/?schedule_name=..." 
  width="100%" 
  style="border: 1px solid #ccc; min-height: 600px;"
  title="課表">
</iframe>
```
*建議設定 `min-height`，在 `iframe` 內容載入完成前，可以先撐開一個初始高度，避免畫面跳動過於劇烈。*

#### 2. 父層網頁腳本 (高度自動調整)

為了讓 `iframe` 的高度能根據其內容自動調整，請將以下腳本加到您父層網頁的 `</body>` 標籤正前方。

```html
<script>
document.addEventListener('DOMContentLoaded', function() {
  // 尋找所有需要自動調整高度的 iframe
  const autoResizeIframes = document.querySelectorAll('.auto-resize-iframe');

  // 監聽來自 iframe 的身高回報
  window.addEventListener('message', function(event) {
    // 可在此處增加對 event.origin 的檢查來加強安全性

    if (event.data && event.data.type === 'iframe-resize' && event.data.height) {
      // 遍歷所有 iframe，找出是哪一個傳來的訊息
      for (let i = 0; i < autoResizeIframes.length; i++) {
        const iframe = autoResizeIframes[i];
        
        // 透過比對訊息來源來找到正確的 iframe
        if (iframe.contentWindow === event.source) {
          const newHeight = event.data.height + 20; // 加上 20px 的緩衝空間
          iframe.style.setProperty('height', newHeight + 'px', 'important');
          break; 
        }
      }
    }
  });
});
</script>
```

#### 3. 安全性限制

`index.php` 檔案已設定 `Content-Security-Policy: frame-ancestors` 標頭，只允許特定網域 (例如 `https://your-domain.com`) 嵌入此 `iframe`，防止未經授權的網站使用。

---

## Apps Script 編輯器開發指南

(此處省略，維持原文件關於 Apps Script 編輯器的開發、部署、版本控制等詳細說明...)