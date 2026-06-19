# 教室課表管理系統 (Classroom Booking)

教室課表管理系統是一個基於 Google Apps Script 的 Web App，提供視覺化介面來管理多個教室的課程預約。搭配 PHP 唯讀檢視器，可將課表嵌入至外部網站。

## 功能特色

- 📅 **多課表管理** — 建立、編輯、複製多個獨立課表
- 🎨 **拖拉式排課** — 直覺的視覺化課程編輯
- 📋 **預排課表 (Draft Mode)** — 規劃新學期而不影響現有課表
- 🔄 **版本控制** — 自動快照，可還原到歷史版本
- 🏷️ **標籤篩選** — 兩階段篩選系統（主要標籤 + 進階篩選）
- 📱 **嵌入式檢視器** — PHP 唯讀檢視器，專為 iframe 嵌入設計
- 🔒 **權限管理** — 管理員 / 建立者權限區分

## 架構

| 元件 | 技術 | 說明 |
|------|------|------|
| 前端 | HTML + Tailwind CSS + JavaScript | GAS Web App 互動介面 |
| 後端 | Google Apps Script | 資料讀寫、權限管理、版本控制 |
| 資料庫 | Google Sheets | Data 索引表 + 各課表專屬工作表 |
| 檢視器 | PHP + Google API | 唯讀課表視圖，支援 iframe 嵌入 |

## 快速開始

### 前置需求

- [Node.js](https://nodejs.org/) (用於 Tailwind CSS 建置)
- [clasp](https://github.com/google/clasp) (Google Apps Script CLI)
- Google 帳號 + Google Sheet
- PHP 7.4+ 及 Composer (若需要 PHP 檢視器)

### 1. Clone 與安裝

```bash
git clone https://github.com/cheerc/classroombooking.git
cd classroombooking
npm install
npm run build
```

### 2. 設定 clasp

```bash
# 複製範例設定檔
cp .clasp.json.example .clasp.json

# 編輯 .clasp.json，填入你的 Google Apps Script Project ID
# scriptId 可從 GAS Editor → Project Settings 取得
```

### 3. 設定 Script Properties

在 Google Apps Script Editor 中設定必要的 Script Properties：

1. 開啟 GAS Script Editor
2. 進入 **Project Settings → Script Properties**
3. 新增以下 key-value pairs（參考 `config.example.js`）：

| Key | 說明 |
|-----|------|
| `ADMIN_EMAIL` | 管理員 email |
| `font_drive_file_id` | Google Drive 字體檔案 ID（PDF 匯出用，可選）|

### 4. 部署

```bash
clasp push
clasp deploy
```

### 5. PHP 檢視器（選用）

```bash
cd classroom_viewer
composer install
cp config.example.php config.php
# 編輯 config.php 填入實際值
```

詳細架構說明請參考 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 開發

```bash
# 建置 Tailwind CSS
npm run build

# ESLint 檢查
npx eslint --ext .html .        # 前端
npx eslint 程式碼.js              # GAS 後端

# 完整驗證
./workflow.sh t6
```

## 貢獻

歡迎貢獻！請先閱讀 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 安全

如果發現安全漏洞，請參閱 [SECURITY.md](SECURITY.md) 的報告流程。

## 授權

本專案採用 [MIT License](LICENSE) 授權。
