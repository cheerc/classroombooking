# 架構文件

## 系統概觀

教室課表管理系統由兩個主要元件組成：

1. **Google Apps Script 課表編輯器** — Web App，提供視覺化課程管理介面
2. **PHP 唯讀課表檢視器** — 輕量級 PHP 應用，用於 iframe 嵌入顯示

```
┌─────────────────────────────────────────┐
│           GAS Web App (Editor)          │
│  ┌──────────┐  ┌──────────────────────┐ │
│  │ 程式碼.js │  │ Index.html           │ │
│  │ (Backend) │  │ JavaScript.html      │ │
│  │           │  │ UI.js.html           │ │
│  │ doGet()   │  │ Interaction.js.html  │ │
│  │ getData() │  │ Modals.js.html       │ │
│  │ saveData()│  │ Tailwind.html (CSS)  │ │
│  └─────┬─────┘  └──────────────────────┘ │
│        │                                  │
│        ▼                                  │
│  ┌──────────┐                             │
│  │ Google    │◄──────────────────────┐    │
│  │ Sheets   │                       │    │
│  └──────────┘                       │    │
│                                     │    │
└─────────────────────────────────────┼────┘
                                      │
┌─────────────────────────────────────┼────┐
│     PHP Viewer (classroom_viewer/)  │    │
│  ┌──────────────┐  ┌───────────┐   │    │
│  │ index.php    │  │ Service   │───┘    │
│  │ (Renderer)   │  │ Account   │        │
│  │              │  │ Key       │        │
│  │ generate_    │  └───────────┘        │
│  │ iframe.php   │                       │
│  └──────────────┘                       │
└─────────────────────────────────────────┘
```

## 檔案結構

### Apps Script 應用（根目錄）

| 檔案 | 用途 |
|------|------|
| `程式碼.js` | 核心後端：doGet、getData、saveData、權限管理、版本控制 |
| `Index.html` | 前端主入口，載入所有 CSS 與 JS |
| `JavaScript.html` | 核心前端邏輯：狀態管理、篩選、後端通訊 |
| `UI.js.html` | UI 渲染模組 |
| `Interaction.js.html` | 使用者互動模組 |
| `Modals.js.html` | 彈出視窗模組 |
| `Config.js.html` | 設定常數 |
| `Elements.js.html` | DOM 元素參照 |
| `Api.js.html` | 後端 API 呼叫封裝 |
| `History.js.html` | 版本歷史模組 |
| `CustomStyles.html` | 自訂 CSS |
| `Tailwind.html` | Tailwind CSS 建置產物 |
| `appsscript.json` | GAS 專案設定（OAuth scopes 等）|

### PHP 檢視器（`classroom_viewer/`）

| 檔案 | 用途 |
|------|------|
| `index.php` | 主進入點：解密參數、讀取 Sheets、渲染課表 |
| `generate_iframe.php` | iframe 嵌入碼產生器（管理工具）|
| `config.example.php` | 設定檔範本（複製為 `config.php` 使用）|
| `credentials/` | Service Account 金鑰目錄 |

### 開發工具

| 檔案 | 用途 |
|------|------|
| `package.json` | npm 設定（Tailwind CSS、ESLint）|
| `tailwind.config.js` | Tailwind 設定 |
| `.eslintrc.json` | ESLint 規則 |
| `workflow.sh` | 本地驗證腳本（t1-t6）|
| `config.example.js` | GAS Script Properties 文件範本 |

## 資料流

### 編輯流程

```
使用者 → Index.html → JavaScript.html (google.script.run)
  → 程式碼.js (saveData/getData) → Google Sheets
```

### 檢視器流程

```
外部網站 (iframe) → index.php
  → 解密 URL 參數 (AES-256-CBC)
  → Google Sheets API (Service Account)
  → 渲染 HTML 課表
  → postMessage (iframe 高度自適應)
```

## 權限模型

- **管理員**：由 GAS Script Properties 的 `ADMIN_EMAIL` 定義，擁有所有課表的管理權限
- **一般使用者**：只能管理自己建立的課表
- **權限檢查**：`_checkPermission()` 在後端（`程式碼.js`）執行
- **前端標示**：`IS_ADMIN` 由 `doGet()` 注入，控制 UI 顯示

## 建置流程

```bash
npm run build
# 等同於：
# 1. npm run build-css    → input.css → output.css (Tailwind CLI)
# 2. npm run build-tailwind-html → output.css → Tailwind.html (<style> wrapper)
```

`Tailwind.html` 必須 git-tracked（clasp push 需要它），但 `output.css` 是中間產物（已 gitignored）。
