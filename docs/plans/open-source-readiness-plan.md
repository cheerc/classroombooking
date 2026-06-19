# Classroombooking 開源準備計劃

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 classroombooking repo 中所有隱私/機密資料完全分離，使 source code 可安全公開為開源專案。

**Architecture:** 兩階段方案——Phase 1 在現有 private repo 進行架構清理與機密移除（GAS → PropertiesService、PHP → config.php、admin 判斷 → 後端單一真相源），Phase 2 以清洗後的 codebase 建立全新 public repo 並撰寫開源文件。

**Tech Stack:** Google Apps Script (PropertiesService)、PHP (config.php pattern)、Git

**Review Status:** ✅ Reviewer VERIFIED + ✅ Reviewer2 VERIFIED（已整合 8 項建議修改）

---

## 背景

### 掃描發現

| 嚴重度 | 數量 | 項目 |
|--------|------|------|
| 🔴 Critical | 7 | AES 加密金鑰×2、Spreadsheet ID×2、GAS Script ID、Admin email×1(後端)、Admin email×1(前端 JS) |
| 🟠 High | 4 | CSP 域名洩漏、gemini.md 域名、.clasp.json 整檔、UI.js.html admin username check |
| 🟡 Medium | 3 | package.json GitHub user、gemini.md 範例內容、display_errors=1 |

### 團隊討論共識

| 議題 | 決議 | 來源 |
|------|------|------|
| GAS ADMIN_EMAIL | PropertiesService + config.example.js 範本 | impl + reviewer2 |
| PHP 機密 | config.php（零依賴）+ config.example.php | impl + reviewer2 |
| 前端 admin 判斷 | 後端注入 isAdmin flag（單一真相源） | 全員一致 |
| Git History | 保留 private repo + 新建 public repo | 全員一致 |
| 分階段 | 兩階段（清理 → 公開） | impl + reviewer2 |
| AES 金鑰 | 必須輪換（不只外部化） | reviewer (P0) |
| display_errors | 須關閉 | reviewer |

---

## Phase 1: 架構清理與機密移除（在 private repo 進行）

### Task 1: GAS 後端 — ADMIN_EMAIL 遷移到 PropertiesService

**Files:**
- Modify: `程式碼.js:1-5`（移除硬編碼常數，改用 PropertiesService）
- Create: `config.example.js`（文件化所有必要 Script Properties key，`.claspignore` 排除）
- Modify: `.claspignore`（排除 `config.example.js`）

- [ ] **Step 1: 修改 `程式碼.js` — 移除硬編碼 ADMIN_EMAIL，加入 getConfig helper**

```javascript
// 移除第 4 行：
// const ADMIN_EMAIL = 'cheerc@talented.com.tw';

// 在檔案開頭（第 3 行 MAX_HISTORY_RECORDS 後面）加入：
/**
 * Reads a configuration value from Script Properties.
 * @param {string} key The property key.
 * @returns {string} The property value.
 */
function getConfig(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}
```

- [ ] **Step 2: 更新 `_checkPermission()` — 使用 getConfig**

```javascript
// 修改 _checkPermission（約 L29-35）中的 isAdmin 行：
function _checkPermission(createdBy) {
  const currentUser = Session.getActiveUser().getEmail();
  const isAdmin = currentUser.toLowerCase() === (getConfig('ADMIN_EMAIL') || '').toLowerCase();
  if (!isAdmin && currentUser !== createdBy) {
    throw new Error("權限不足。只有管理員或建立者才能執行此操作。");
  }
}
```

- [ ] **Step 3: 建立 `config.example.js`**

```javascript
/**
 * classroombooking — 必要的 GAS Script Properties 設定
 *
 * 此檔案僅供文件參考，列出所有需要在 GAS Script Editor 中設定的 Script Properties。
 * 不要直接修改此檔案中的值。
 *
 * 設定方式：
 * 1. 開啟 GAS Script Editor
 * 2. 進入 Project Settings → Script Properties
 * 3. 依序新增以下 key-value pairs
 */
const REQUIRED_SCRIPT_PROPERTIES = {
  // 管理員 email（擁有所有課表的管理權限）
  ADMIN_EMAIL: 'admin@your-domain.com',

  // Google Drive 字體檔案 ID（用於 PDF 匯出，可選）
  font_drive_file_id: 'your-google-drive-file-id',
};
```

- [ ] **Step 4: 更新 `.claspignore` — 排除 config.example.js**

在 `.claspignore` 末尾加入：
```
config.example.js
```

- [ ] **Step 5: 在 GAS Script Editor 設定 ADMIN_EMAIL**

> ⚠️ 此步驟需要 operator 手動執行

1. 開啟 https://script.google.com → 對應專案
2. Project Settings → Script Properties
3. 新增：Key = `ADMIN_EMAIL`，Value = `cheerc@talented.com.tw`
4. 儲存

- [ ] **Step 6: 驗證**

Run: `clasp push`（確認 push 成功且 config.example.js 未被推送）
驗證：開啟 Web App → 以 admin 帳號操作刪除/重新命名課表 → 確認權限檢查正常

- [ ] **Step 7: Commit**

```bash
git add 程式碼.js config.example.js .claspignore
git commit -m "refactor: migrate ADMIN_EMAIL to PropertiesService

- Remove hardcoded admin email from source code
- Add getConfig() helper for Script Properties
- Create config.example.js documenting required properties
- Update .claspignore to exclude config.example.js

Prepares for open-source by removing PII from codebase."
```

---

### Task 2: 前端 admin 判斷 — 改為後端注入 isAdmin flag

**Files:**
- Modify: `程式碼.js:63-68`（doGet 注入 isAdmin）
- Modify: `Index.html`（接收 isAdmin template variable）
- Modify: `JavaScript.html:863-866`（簡化 isCurrentUserAdmin）
- Modify: `UI.js.html:195`（移除硬編碼 admin username check）

- [ ] **Step 1: 修改 `程式碼.js` doGet() — 注入 isAdmin**

```javascript
function doGet() {
  const template = HtmlService.createTemplateFromFile('Index');
  const currentUser = Session.getActiveUser().getEmail();
  const adminEmail = getConfig('ADMIN_EMAIL') || '';
  template.userEmail = currentUser;
  template.isAdmin = currentUser.toLowerCase() === adminEmail.toLowerCase();
  return template.evaluate()
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
```

- [ ] **Step 2: 修改 `Index.html` — 接收 isAdmin**

在 `Index.html` 中找到 `var SCRIPT_USER_EMAIL = "<?= userEmail ?>";`（L12），在該行之後、`</script>` 標籤（L13）之前加入：
```html
      var IS_ADMIN = <?= isAdmin ?>;
```
> ⚠️ 必須在同一個 `<script>` 標籤內（L11-L13），不要加到標籤外面

- [ ] **Step 3: 修改 `JavaScript.html` — 簡化 isCurrentUserAdmin**

找到 `isCurrentUserAdmin` 函式（約 L863-866），替換為：
```javascript
isCurrentUserAdmin: function () {
  return typeof IS_ADMIN !== 'undefined' ? IS_ADMIN : false;
},
```

- [ ] **Step 4: 修改 `UI.js.html` L195 — 移除硬編碼 admin username**

找到 `const isAdmin = currentUser.toLowerCase() === 'cheerc';` 行，替換為：
```javascript
const isAdmin = typeof IS_ADMIN !== 'undefined' ? IS_ADMIN : false;
```

- [ ] **Step 5: 驗證**

1. `clasp push`
2. 以 admin 帳號開啟 → 確認管理功能正常
3. 以非 admin 帳號開啟 → 確認僅能管理自己的課表
4. 在瀏覽器 console 輸入 `IS_ADMIN` → 確認值正確

- [ ] **Step 6: Commit**

```bash
git add 程式碼.js Index.html JavaScript.html UI.js.html
git commit -m "refactor: centralize admin check to server-side injection

- doGet() now injects IS_ADMIN flag via template
- Frontend isCurrentUserAdmin() reads flag instead of hardcoding email
- Remove hardcoded admin email from JavaScript.html and UI.js.html
- Single source of truth: backend PropertiesService

Security improvement: admin status determined server-side."
```

---

### Task 3: PHP 端 — 機密外部化到 config.php

**Files:**
- Create: `classroom_viewer/config.example.php`
- Create: `classroom_viewer/config.php`（僅本地，gitignored）
- Modify: `classroom_viewer/index.php:1-15, 145-146`
- Modify: `classroom_viewer/generate_iframe.php:1-12`
- Modify: `classroom_viewer/.gitignore`

- [ ] **Step 1: 建立 `classroom_viewer/config.example.php`**

```php
<?php
defined('APP_RUNNING') or die('Direct access not allowed');
/**
 * classroombooking — Classroom Viewer 設定範本
 *
 * 複製此檔案為 config.php 並填入實際值：
 *   cp config.example.php config.php
 *
 * config.php 已被 .gitignore 排除，不會進入版控。
 */
return [
    // Google Spreadsheet ID（Data sheet 所在的試算表）
    'spreadsheet_id' => 'YOUR_SPREADSHEET_ID',

    // AES-256-CBC 加密金鑰（用於加密 iframe URL 參數）
    'encryption_key' => 'YOUR_ENCRYPTION_KEY',

    // 允許嵌入 iframe 的域名（Content-Security-Policy frame-ancestors）
    'csp_frame_ancestors' => 'https://your-domain.com',

    // Service Account 金鑰路徑
    'service_account_key_path' => __DIR__ . '/credentials/service-account-key.json',
];
```

- [ ] **Step 2: 建立 `classroom_viewer/config.php`（production 實際值）**

> ⚠️ 此檔案包含實際機密，不進 git

```php
<?php
defined('APP_RUNNING') or die('Direct access not allowed');
return [
    'spreadsheet_id' => '1lWqXsLYhGQiq3vOa55rWw527M2jOfNks0UdtOjGB8Ck',
    'encryption_key' => '<新生成的金鑰>',  // 見 Task 6 金鑰輪換
    'csp_frame_ancestors' => 'https://talented.mido-9.com',
    'service_account_key_path' => __DIR__ . '/credentials/service-account-key.json',
];
```

- [ ] **Step 3: 修改 `classroom_viewer/index.php` — 改為從 config.php 讀取**

替換檔案頭部（L1-14）的硬編碼設定：
```php
<?php
define('APP_RUNNING', true);
$config = require __DIR__ . '/config.php';

// Allow embedding only by specific origins for security
header("Content-Security-Policy: frame-ancestors " . $config['csp_frame_ancestors'] . ";");

ini_set('display_errors', 0);  // Production: 關閉錯誤顯示
error_reporting(E_ALL);

require __DIR__ . '/vendor/autoload.php';

// --- Configuration ---
$spreadsheetId = $config['spreadsheet_id'];
$keyFilePath = $config['service_account_key_path'];
$weekdays = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
$courseColors = ['#93c5fd', '#73EEDC', '#DBF4A7', '#fca5a5', '#92DBFA', '#C5D8D1', '#B5EBCC', '#FDE74C', '#F5AE80', '#D6D1CD'];
```

替換 L145 的硬編碼加密金鑰：
```php
// --- Security & Encryption Configuration ---
define('ENCRYPTION_KEY', $config['encryption_key']);
define('ENCRYPTION_CIPHER', 'aes-256-cbc');
```

- [ ] **Step 4: 修改 `classroom_viewer/generate_iframe.php` — 改為從 config.php 讀取**

替換檔案頭部（L1-12）：
```php
<?php
define('APP_RUNNING', true);
$config = require __DIR__ . '/config.php';

ini_set('display_errors', 0);  // Production: 關閉錯誤顯示
error_reporting(E_ALL);

require __DIR__ . '/vendor/autoload.php';

// --- Configuration ---
define('ENCRYPTION_KEY', $config['encryption_key']);
define('ENCRYPTION_CIPHER', 'aes-256-cbc');
$spreadsheetId = $config['spreadsheet_id'];
$keyFilePath = $config['service_account_key_path'];
```

- [ ] **Step 5: 更新 `classroom_viewer/.gitignore`**

```
# Ignore Composer dependencies
/vendor/

# Ignore sensitive credentials
service-account-key.json

# Ignore local configuration (contains secrets)
config.php
```

- [ ] **Step 6: 驗證**

1. 確認 `config.php` 存在且包含正確值
2. 用瀏覽器訪問 classroom viewer → 確認課表正常顯示
3. 用 iframe generator 產生 iframe 碼 → 確認加密/解密正常
4. 確認 `git status` 中 `config.php` 沒有出現（被 gitignore）

- [ ] **Step 7: Commit**

```bash
git add classroom_viewer/config.example.php classroom_viewer/index.php classroom_viewer/generate_iframe.php classroom_viewer/.gitignore
git commit -m "refactor: externalize PHP secrets to config.php

- Create config.example.php template for contributors
- Move spreadsheet ID, encryption key, CSP domain to config.php
- config.php excluded from git via .gitignore
- Disable display_errors in production (security fix)

Breaking: requires cp config.example.php config.php + fill values."
```

---

### Task 4: .clasp.json 與 .gitignore 強化

**Files:**
- Modify: `.gitignore`
- Create: `.clasp.json.example`
- Verify: `classroom_viewer/credentials/` not in git history

- [ ] **Step 1: 建立 `.clasp.json.example`**

```json
{
  "scriptId": "YOUR_GOOGLE_APPS_SCRIPT_ID",
  "scriptExtensions": [
    ".js",
    ".gs"
  ],
  "htmlExtensions": [
    ".html"
  ],
  "jsonExtensions": [
    ".json"
  ],
  "filePushOrder": [],
  "skipSubdirectories": false
}
```

- [ ] **Step 2: 更新根目錄 `.gitignore`**

```
# BMAD-Method
_bmad/
_bmad-output/

# Antigravity Agent
.agent/

# Gemini CLI
.gemini/

# Dependencies
node_modules

# Build artifacts
output.css
Tailwind.html

# OS-specific
.DS_Store

# Deployment configuration (contains project-specific IDs)
.clasp.json

# Code analysis output
graphify-out/

# Environment / config files
*.env
```

- [ ] **Step 3: 從 git tracking 移除已 tracked 但 gitignored 的檔案（保留本地檔案）**

```bash
git rm --cached .clasp.json
git rm --cached output.css
```

- [ ] **Step 4: 驗證 service-account-key.json 未曾進 git history**

```bash
git log --all --oneline -- classroom_viewer/credentials/service-account-key.json
```
Expected: 空輸出（無任何 commit）

- [ ] **Step 5: 清理 `_bmad-output/` 和 `test_env.php`**

```bash
# 移除已 tracked 的 _bmad-output/
git ls-files _bmad-output/
# 如有結果：
git rm -r --cached _bmad-output/

# 移除或 gitignore 診斷工具（暴露 PHP 版本/路徑資訊）
git rm classroom_viewer/test_env.php
```
> `test_env.php` 是部署診斷工具，包含 `display_errors=1`，開源後會暴露 PHP 版本和 class 存在性資訊——應移除

- [ ] **Step 6: Commit**

```bash
git add .gitignore .clasp.json.example
git commit -m "chore: harden .gitignore and remove deployment config from tracking

- Add .clasp.json to .gitignore, provide .clasp.json.example
- Remove .clasp.json from git tracking (keep local)
- Add _bmad-output/, graphify-out/, *.env to .gitignore
- Verify service-account-key.json never entered git history"
```

---

### Task 5: gemini.md 清洗

**Files:**
- Modify: `gemini.md`

- [ ] **Step 1: 替換所有內部域名**

搜尋替換：
- `talented.mido-9.com` → `your-domain.com`
- `talented.com.tw` → `your-domain.com`（若存在）

- [ ] **Step 2: 替換範例中的組織特定內容（可選）**

`國中部教室`、`國小部教室` 等範例名稱可保留（這是功能展示用的範例，不是機密）。

- [ ] **Step 3: 確認無其他內部路徑**

```bash
grep -n 'talented\|mido-9\|cheerc' gemini.md
```
Expected: 無結果

- [ ] **Step 4: Commit**

```bash
git add gemini.md
git commit -m "docs: sanitize gemini.md for open-source readiness

- Replace internal domain references with generic placeholders
- Remove organization-specific URLs"
```

---

### Task 6: AES 加密金鑰輪換（P0 安全要求）

> ⚠️ 此 Task 需要 operator 參與，因為涉及 production 服務

**Files:**
- Modify: `classroom_viewer/config.php`（本地，非 git）

- [ ] **Step 1: 備份舊金鑰（Rollback 保險）**

將舊金鑰記錄到安全的離線位置（如密碼管理器），以便新金鑰出問題時可臨時回退。同時記錄所有目前已部署的 iframe URL 清單。

- [ ] **Step 2: 生成新的 AES-256-CBC 金鑰**

```bash
openssl rand -hex 32
```
> 記錄輸出的 64 字元 hex 字串

- [ ] **Step 3: 更新 `classroom_viewer/config.php` 中的 encryption_key**

將 `encryption_key` 的值替換為新生成的金鑰。

- [ ] **Step 4: 在所有已嵌入的 iframe 頁面中，使用 generate_iframe.php 重新生成加密 URL**

> ⚠️ 舊金鑰加密的 URL 將無法解密——所有嵌入的 iframe 都需要更新

1. 訪問 `generate_iframe.php`
2. 重新生成所有正在使用的 iframe 碼
3. 更新嵌入頁面中的 iframe src

- [ ] **Step 5: 部署到 production**

將更新後的 `classroom_viewer/` 檔案複製到部署目錄。

- [ ] **Step 6: 驗證**

1. 舊 iframe URL 應回傳「參數解密失敗」錯誤
2. 新 iframe URL 應正常顯示課表
3. generate_iframe.php 產生的新碼應可正常使用

> **Rollback**：如果新金鑰出問題，將 config.php 中的 encryption_key 替換回 Step 1 備份的舊金鑰，重新部署即可恢復。

---

### Task 7: Phase 1 最終驗證

- [ ] **Step 1: 全面 grep 掃描**

```bash
# 在 repo 根目錄執行
grep -rn 'cheerc@talented' --include='*.js' --include='*.html' --include='*.php' --include='*.json' --include='*.md' .
grep -rn 'talented.mido-9' --include='*.js' --include='*.html' --include='*.php' --include='*.json' --include='*.md' .
grep -rn 'talented.com.tw' --include='*.js' --include='*.html' --include='*.php' --include='*.json' --include='*.md' .
grep -rn '1lWqXsLY' --include='*.js' --include='*.html' --include='*.php' --include='*.json' .
grep -rn '1x3IES_MBAdLyI7j' --include='*.js' --include='*.html' --include='*.php' --include='*.json' .
grep -rn 'def000006a78468f' --include='*.js' --include='*.html' --include='*.php' --include='*.json' .
```
Expected: 全部無結果（package.json 中的 `cheerc` GitHub username 是例外，因為 repo owner 不變）

- [ ] **Step 2: 功能回歸測試**

1. GAS Web App：開啟 → 建立課表 → 編輯 → 儲存 → 刪除 → 確認 admin 權限正常
2. PHP Viewer：訪問加密 URL → 確認課表正常顯示
3. PHP Iframe Generator：產生 iframe 碼 → 嵌入測試
4. 執行 `./workflow.sh t6`（本地 lint + 結構檢查）

- [ ] **Step 3: git status 確認**

```bash
git status
git diff --cached
```
確認：
- `config.php` 不在 staged files 中
- `.clasp.json` 不在 tracked files 中
- 所有 `.example` 檔案已 tracked

---

## Phase 2: 公開化（新建 public repo）

### Task 8: 建立新 public repo

- [ ] **Step 1: 建立新 repo**

```bash
# 在 private repo 外的目錄
mkdir classroombooking-public
cd classroombooking-public
git init

# 從 private repo 複製清洗後的檔案（排除 .git、config.php、.clasp.json 等）
rsync -av --exclude='.git' \
          --exclude='node_modules' \
          --exclude='.clasp.json' \
          --exclude='classroom_viewer/config.php' \
          --exclude='classroom_viewer/credentials/service-account-key.json' \
          --exclude='classroom_viewer/vendor/' \
          --exclude='output.css' \
          --exclude='Tailwind.html' \
          --exclude='_bmad-output/' \
          --exclude='_bmad/' \
          --exclude='graphify-out/' \
          --exclude='.DS_Store' \
          --exclude='.agent/' \
          --exclude='.gemini/' \
          /Users/cheerc/Projects/classroombooking/ .
```

- [ ] **Step 2: 最終掃描新 repo**

```bash
grep -rn 'cheerc@talented\|talented.mido-9\|talented.com.tw\|1lWqXsLY\|1x3IES_MBAdLyI7j\|def000006a78468f' .
```
Expected: 無結果

- [ ] **Step 3: Initial commit**

```bash
git add .
git commit -m "Initial commit: classroombooking — 教室預約課表管理系統

A Google Apps Script web app for visual classroom schedule management,
with a PHP-based readonly viewer for embedding.

See README.md for setup instructions."
```

---

### Task 9: 撰寫開源文件

**Files:**
- Create: `README.md`（取代或補充 gemini.md）
- Create: `CONTRIBUTING.md`
- Create: `LICENSE`
- Create: `SECURITY.md`
- Modify: `gemini.md` → rename to `docs/ARCHITECTURE.md`

- [ ] **Step 1: 撰寫 README.md**

README 應包含：
- 功能介紹 + 截圖
- 架構概覽（GAS + PHP viewer 的關係圖）
- Quick Start（GAS 部署 + PHP 部署）
- 設定說明（Script Properties + config.php）
- 技術棧

- [ ] **Step 2: 撰寫 CONTRIBUTING.md**

- 開發流程（fork → clone → clasp setup → dev → PR）
- 本地測試方式（`workflow.sh`）
- Code style（ESLint 設定）
- PR 格式要求

- [ ] **Step 3: 選擇並加入 LICENSE**

建議 MIT License（教育工具場景適合）。

- [ ] **Step 4: 撰寫 SECURITY.md**

- 責任揭露流程
- 已知安全機制（GAS OAuth、PHP Service Account、AES 加密）
- 注意事項（credentials 管理、Script Properties 使用）

- [ ] **Step 5: 移動 gemini.md**

```bash
mkdir -p docs
mv gemini.md docs/ARCHITECTURE.md
```

- [ ] **Step 6: Commit 文件**

```bash
git add README.md CONTRIBUTING.md LICENSE SECURITY.md docs/ARCHITECTURE.md
git commit -m "docs: add open-source documentation

- README with setup guide and architecture overview
- CONTRIBUTING with development workflow
- MIT LICENSE
- SECURITY with disclosure process
- Move gemini.md to docs/ARCHITECTURE.md"
```

---

### Task 10: GitHub 設定與發布

- [ ] **Step 1: 建立 GitHub repo 並推送**

```bash
gh repo create cheerc/classroombooking --public --source=. --push
```

- [ ] **Step 2: 設定 GitHub repo**

- Topics: `google-apps-script`, `classroom-management`, `schedule`, `education`
- Description: 教室預約課表管理系統 — GAS Web App + PHP Viewer
- 啟用 GitHub Secret Scanning

- [ ] **Step 3: 設定 pre-commit hooks（必做）**

安裝 `gitleaks` pre-commit hook，防止未來不小心提交機密：
```bash
# 安裝 gitleaks（macOS）
brew install gitleaks

# 建立 pre-commit hook
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/sh
gitleaks protect --staged --verbose
EOF
chmod +x .git/hooks/pre-commit
```
> 對於曾有 7 個 Critical 機密的專案，pre-commit secret detection 是必要防線，不是可選項。

- [ ] **Step 4: 建立 issue templates**

```bash
mkdir -p .github/ISSUE_TEMPLATE
```
建立 `.github/ISSUE_TEMPLATE/bug_report.md` 和 `.github/ISSUE_TEMPLATE/feature_request.md`，並在 README 說明維護狀態（如：actively maintained / accepting PRs）。

- [ ] **Step 5: 原 private repo 歸檔**

在原 private repo 的 README 加入指向新 public repo 的連結，標記為 archived。

---

## 工時估算

| Task | 估計時間 | 備註 |
|------|----------|------|
| Task 1: GAS ADMIN_EMAIL 遷移 | 30 min | 改動 ~5 行 |
| Task 2: 前端 admin 注入 | 1 hr | 改 4 個檔案各 1-3 行 |
| Task 3: PHP config 外部化 | 2 hr | 5 個硬編碼值 + 2 新檔 |
| Task 4: .gitignore 強化 | 15 min | |
| Task 5: gemini.md 清洗 | 15 min | |
| Task 6: AES 金鑰輪換 | 30 min | 需 operator 參與 |
| Task 7: Phase 1 驗證 | 30 min | |
| Task 8: 新 public repo | 15 min | |
| Task 9: 開源文件 | 2-2.5 hr | README+screenshots+4文件 |
| Task 10: GitHub 設定 | 15 min | |
| **總計** | **~7.5-8 hr** | |

## 風險與注意事項

1. **AES 金鑰輪換後**，所有現有嵌入的 iframe URL 需要重新生成（影響生產環境）
2. **GAS PropertiesService 遷移後**，需要在 GAS Script Editor 手動設定 Script Properties（一次性）
3. **Phase 1 完成前不可公開 repo**——機密清理必須全部完成
4. **package.json 中的 GitHub username `cheerc`** 可保留（如果新 repo 仍在同一帳號下）
5. **`composer.lock`** 保留在 repo 中（對 application 專案是正確做法）
