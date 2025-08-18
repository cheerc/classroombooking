# Gemini - 專案維護指南

本文件旨在提供維護此「教室預約系統」專案時的必要資訊，確保開發上的一致性與效率。

## 專案概覽

這是一個建立在 Google Apps Script 上的 Web App，提供一個視覺化的介面來管理多個教室的課程預約。使用者可以透過拖拉、點擊等方式新增、修改、刪除課程。所有資料都儲存在後端的 Google Sheet 中。

- **前端**: 使用 HTML、CSS (Tailwind CSS) 和原生 JavaScript 建立互動介面。
- **後端**: 使用 Google Apps Script (`.gs` 或 `.js` 檔案) 處理資料的讀取、儲存和版本控制。
- **資料庫**: 使用 Google Sheet 作為資料儲存的媒介。

---

## 檔案結構

專案的檔案主要分為後端邏輯和前端介面兩部分。

### 後端 (Server-side)

- **`程式碼.js`**:
  - 核心後端邏輯檔案。
  - 包含所有與 Google Sheet 互動的函式，例如 `getData()`、`saveData()`。
  - 處理 HTTP 請求 (`doGet`)，渲染主頁面。
  - 負責權限管理、資料版本控制等核心功能。

- **`appsscript.json`**:
  - Apps Script 的設定檔 (Manifest)。
  - 定義專案的時區、相依套件、執行權限 (`webapp`) 等元數據。

### 前端 (Client-side)

前端程式碼被拆分成多個 `.html` 檔案，最終在 `Index.html` 中被引用組合。這種模組化的方式是為了讓結構更清晰。

- **`Index.html`**:
  - 專案的主入口 HTML 檔案。
  - 負責載入所有 CSS (`Stylesheet.html`) 和 JavaScript (`.js.html`) 檔案。
  - 包含所有主要的 UI 元素骨架，如按鈕、表格、彈出視窗 (Modal) 等。

- **`Stylesheet.html`**:
  - 包含所有的 CSS 樣式。
  - 除了使用 CDN 載入的 Tailwind CSS 外，也包含一些客製化的樣式規則。

- **`JavaScript.html`**:
  - **核心前端邏輯**。
  - 包含主要的 `App` 物件，管理整個前端的狀態 (State)、事件監聽 (Event Listeners) 和 UI 渲染 (Rendering)。
  - 所有前端的主要操作，如渲染課表、處理使用者輸入、與後端 API 溝通等，都在此檔案中。

- **`Api.js.html`**:
  - 封裝了前端與後端 Apps Script (`google.script.run`) 的溝通邏輯。
  - 提供一個 Promise-based 的 `ServerApi.call` 函式，讓非同步呼叫後端變得更簡潔。

- **`Config.js.html`**:
  - 存放前端的靜態設定值。
  - 例如 App 版本號、星期常數、課程顏色列表等。

- **`Elements.js.html`**:
  - 集中管理所有 DOM 元素的獲取 (`document.getElementById`)。
  - 將所有 UI 元素的參照存放在 `AppElements` 物件中，方便在 `JavaScript.html` 中統一調用。

- **`History.js.html`**:
  - 負責管理前端的「復原/重做」(Undo/Redo) 功能。
  - 透過快照 (Snapshot) 的方式記錄每一次資料狀態的變更。

- **`Modals.js.html`**:
  - 負責管理各種彈出視窗 (Modals) 的邏輯，例如確認視窗、輸入視窗、篩選器等。

---

## 開發與維護指南

### 1. 前後端溝通

- **前端呼叫後端**:
  - 統一使用 `Api.js.html` 中定義的 `ServerApi.call('後端函式名稱', ...參數)`。
  - 這會回傳一個 Promise，可以使用 `.then()` 和 `.catch()` 或 `async/await` 來處理。

- **後端暴露函式**:
  - 在 `程式碼.js` 中定義的全域函式，可以直接被前端呼叫。
  - **注意**: 函式名稱在前後端必須完全一致。

### 2. 狀態管理

- 前端的核心狀態都存放在 `JavaScript.html` 的 `App` 物件中。
- 主要狀態包括：
  - `schedules`: 所有課表的資料。
  - `activeScheduleId`: 當前作用中的課表 ID。
  - `classrooms`: 教室列表。
  - `departments`: 部門列表。
  - `isDirty`: 一個布林值，用來追蹤目前是否有未儲存的變更。
- **修改狀態後，務必呼叫相關的渲染函式** (如 `renderScheduleTable()`, `updateClassroomList()`) 來更新 UI。

### 3. 新增功能流程

- **新增 UI 元素**:
  1. 在 `Index.html` 中加入新的 HTML 元素，並給予唯一的 `id`。
  2. 在 `Elements.js.html` 的 `AppElements` 物件中，新增一個屬性來獲取這個新元素。
  3. 在 `JavaScript.html` 的 `addEventListeners` 函式中為新元素綁定事件。

- **新增後端功能**:
  1. 在 `程式碼.js` 中撰寫新的函式。
  2. 確保函式有處理錯誤的能力，並回傳包含 `success` 或 `error` 屬性的物件。
  3. 在前端的 `JavaScript.html` 中，透過 `ServerApi.call()` 呼叫此新函式。

### 4. 注意事項

- **避免使用全域變數**: 盡量將變數和函式放在 `App` 物件內，避免污染全域命名空間。
- **程式碼風格**: 維持現有的程式碼風格，使用駝峰式命名 (camelCase)，並在適當位置加上註解。
- **部署**: 此專案使用 `clasp` CLI 工具進行部署。修改完程式碼後，需透過 `clasp push` 將本地檔案推送到 Google Apps Script 平台。
- **權限**: 部分功能 (如教室管理、部門管理) 在 `JavaScript.html` 的 `init` 函式中有寫死的 email 權限判斷，修改時需注意。

---

## 版本控制 (Git)

本專案使用 Git 進行版本控制。建議在開發過程中善用 Git 來追蹤和管理程式碼的變更。

### 推薦工作流程

1.  **檢查狀態**: 在進行任何修改後，隨時使用 `git status` 來查看哪些檔案被更動了。
2.  **檢視變更**:
    - 使用 `git diff` 來快速預覽所有檔案的修改內容。
    - 針對特定檔案，使用 `git diff <檔案路徑>` (例如: `git diff JavaScript.html`) 來深入查看該檔案的具體變更。這有助於您在不需重新閱讀整份 `gemini.md` 文件的狀況下，快速掌握程式碼的修改狀況。
3.  **撰寫提交訊息**: 根據 `git diff` 的結果，撰寫清晰、有意義的提交訊息 (Commit Message)，說明這次變更的「原因」和「內容」。
4.  **準備提交**: 當您確認變更無誤後，即可手動執行 `git add .` 與 `git commit` 來提交變更。
