# Gemini - 專案維護指南

本文件旨在提供維護此「教室預約系統」專案時的必要資訊，確保開發上的一致性與效率。

## 專案概覽

這是一個建立在 Google Apps Script 上的 Web App，提供一個視覺化的介面來管理多個教室的課程預約。使用者可以透過拖拉、點擊等方式新增、修改、刪除課程。所有資料都儲存在後端的 Google Sheet 中。

- **前端**: 使用 HTML、CSS (Tailwind CSS) 和原生 JavaScript 建立互動介面。樣式系統透過 **npm** 與 **Tailwind CLI** 進行建置，以達到最佳化效能。
- **後端**: 使用 Google Apps Script (`.gs` 或 `.js` 檔案) 處理資料的讀取、儲存和版本控制。
- **資料庫**: 使用 Google Sheet 作為資料儲存的媒介。

---

## 檔案結構

專案的檔案主要分為後端邏輯、前端介面與開發工具三大部分。

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
  - 負責載入所有 CSS (`Tailwind.html`, `CustomStyles.html`) 和 JavaScript (`.js.html`) 檔案。
  - 包含所有主要的 UI 元素骨架，如按鈕、表格、彈出視窗 (Modal) 等。

- **`Tailwind.html`**:
  - **由 Tailwind CLI 自動產生**，包含所有專案中使用到的 Tailwind CSS 樣式。
  - **注意**: **不應手動編輯此檔案**，其內容應由 `output.css` 複製而來。

- **`CustomStyles.html`**:
  - 包含所有**手寫的客製化 CSS 樣式**。
  - 若有 Tailwind 無法輕易實現的複雜樣式，請在此檔案中撰寫。

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

- **`UI.js.html`**:
  - 負責所有與 UI 渲染相關的邏輯。
  - 包含渲染課表 (`renderScheduleTable`)、更新列表、顯示/隱藏載入動畫與通知等函式。

- **`Interaction.js.html`**:
  - 集中管理所有的事件監聽 (`addEventListeners`)。
  - 處理使用者的互動邏輯，例如點擊、雙擊、拖曳、鍵盤事件等。

### 開發工具 (Development Tools)

- **`package.json`**: `npm` 的設定檔，用於管理專案的開發依賴（例如 `tailwindcss`）。
- **`tailwind.config.js`**: Tailwind CSS 的設定檔。您可以在此客製化主題，例如新增顏色、字體等。
- **`input.css`**: Tailwind CSS 的來源檔，定義了要引入的基礎樣式。通常不需要修改。
- **`output.css`**: **建置後的暫存檔**。執行 `npm run build-css` 後會產生此檔案。
- **`.claspignore`**: `clasp` 的忽略清單，確保開發用的檔案（如 `node_modules`）不會被上傳到 Apps Script。

---

## 開發與維護指南

### 1. 前端樣式 (CSS) 開發流程

專案已從 CDN 改為使用 Tailwind CLI 進行 CSS 建置，以獲得最佳化的效能。

- **首次設定**:
  1.  確保您已安裝 [Node.js](https://nodejs.org/) (包含 npm)。
  2.  在專案根目錄執行 `npm install` 來安裝開發依賴。

- **修改 Tailwind Class**:
  1.  在任何 `.html` 檔案中新增、修改或刪除 Tailwind 的 utility class (例如 `bg-blue-500`, `text-lg`)。
  2.  修改完成後，在終端機執行 `npm run build-css`。
  3.  此指令會掃描所有 `.html` 檔案，並產生一個最佳化過的 `output.css` 檔案。
  4.  **【關鍵步驟】**: 手動將 `output.css` 的**完整內容**複製並貼上到 `Tailwind.html` 檔案中，**完全覆蓋**舊的內容。

- **新增客製化 CSS**:
  1.  若有 Tailwind 無法輕易實現的樣式，請將手寫的 CSS 規則新增到 `CustomStyles.html` 檔案中。
  2.  此操作**不需要**執行建置指令。

- **重要原則**:
  - **絕對不要手動編輯 `Tailwind.html`**，它的內容應永遠來自 `output.css`。
  - **`output.css` 是一個暫存檔**，不需要提交到版本控制中。

### 2. 前後端溝通

- **前端呼叫後端**:
  - 統一使用 `Api.js.html` 中定義的 `ServerApi.call('後端函式名稱', ...參數)`。
  - 這會回傳一個 Promise，可以使用 `.then()` 和 `.catch()` 或 `async/await` 來處理。

- **後端暴露函式**:
  - 在 `程式碼.js` 中定義的全域函式，可以直接被前端呼叫。
  - **注意**: 函式名稱在前後端必須完全一致。

### 3. 狀態管理

- 前端的核心狀態都存放在 `JavaScript.html` 的 `App` 物件中。
- 主要狀態包括：
  - `schedules`: 所有課表的資料。
  - `activeScheduleId`: 當前作用中的課表 ID。
  - `classrooms`: 教室列表。
  - `departments`: 部門列表。
  - `isDirty`: 一個布林值，用來追蹤目前是否有未儲存的變更。
- **修改狀態後，務必呼叫相關的渲染函式** (如 `renderScheduleTable()`, `updateClassroomList()`) 來更新 UI。

### 4. 新增功能流程

- **新增 UI 元素**:
  1. 在 `Index.html` 中加入新的 HTML 元素，並給予唯一的 `id`。
  2. 在 `Elements.js.html` 的 `AppElements` 物件中，新增一個屬性來獲取這個新元素。
  3. 在 `JavaScript.html` 的 `addEventListeners` 函式中為新元素綁定事件。

- **新增後端功能**:
  1. 在 `程式碼.js` 中撰寫新的函式。
  2. 確保函式有處理錯誤的能力，並回傳包含 `success` 或 `error` 屬性的物件。
  3. 在前端的 `JavaScript.html` 中，透過 `ServerApi.call()` 呼叫此新函式。

### 5. 注意事項

- **避免使用全域變數**: 盡量將變數和函式放在 `App` 物件內，避免污染全域命名空間。
- **程式碼風格**: 為了確保程式碼的一致性與可維護性，請遵循以下風格指南：
  - **命名慣例**:
    - **變數與函式**: 統一使用**小駝峰式命名 (camelCase)**，例如 `scheduleData`, `renderScheduleTable`。
    - **常數**: 統一使用**全大寫蛇形命名 (UPPER_SNAKE_CASE)**，例如 `APP_VERSION`, `TIME_REGEX`。
    - **物件/模組**: 統一使用**大駝峰式命名 (PascalCase)**，例如 `App`, `ServerApi`。
    - **禁止底線開頭**: 函式或變數名稱不應以底線 `_` 作為私有成員的標示。
  - **字串管理**:
    - **避免魔法字串**: 程式中不應出現未經定義的字串來表示狀態或模式 (例如：`'dirty'`, `'week'`)。
    - **集中管理**: 所有代表狀態、模式的字串，都應集中定義在 `Config.js.html` 的 `AppConfig` 物件中，方便統一管理與修改。
  - **字串拼接**:
    - **使用樣板字面值**: 在拼接 HTML 或包含變數的字串時，應優先使用樣板字面值 (`` ` ``) 取代傳統的 `+` 號拼接，以提升可讀性。
- **部署**:
  - 此專案使用 `clasp` CLI 工具進行部署。修改完程式碼後，需透過 `clasp push` 將本地檔案推送到 Google Apps Script 平台。
  - **重要**: 專案根目錄下的 `.claspignore` 檔案會確保 `node_modules` 等開發用檔案不會被上傳。請確保此檔案存在且內容正確。
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
