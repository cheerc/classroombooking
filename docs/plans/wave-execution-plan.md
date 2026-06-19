# 開源準備 — Wave 執行計劃

> 本文件定義 `open-source-readiness-plan.md` 的分波執行順序。
> 每個 wave 為一個獨立 PR，完成後通知 operator。
> 原則：**每個 wave 完成後，線上服務照常運作**。

**Reference:** [open-source-readiness-plan.md](./open-source-readiness-plan.md)
**Review Status:** 待 Review

---

## Wave 分配總覽

| Wave | 包含 Task | 範圍 | 線上影響 | 需 Operator |
|------|-----------|------|----------|-------------|
| **W1** | Task 4 + Task 5 | Git housekeeping + 文件清洗 | ❌ 無 | ❌ |
| **W2** | Task 1 + Task 2 | GAS 後端 admin 重構 | ❌ 無（需先設 Script Properties） | ✅ 設 Properties → clasp push |
| **W3** | Task 3 | PHP config 外部化 | ❌ 無（需先建 config.php） | ✅ 建 config.php → 部署 |
| **W4** | Task 6 + Task 7 | AES 金鑰輪換 + 最終驗證 | ⚠️ 輕微（iframe URL 需更新） | ✅ 金鑰輪換 + 重新部署 |
| **W5** | Task 8 + 9 + 10 | 新 public repo + 文件 + GitHub | ❌ 無（新 repo） | ✅ repo 建立 |

## Wave 設計原則

### 為什麼這個順序？

1. **W1 先行**：純 git 操作（untrack .clasp.json、output.css、清洗 gemini.md），零 code 變更、零部署需求。不管後續 wave 是否執行，W1 都是正確的。

2. **W2 接著**：GAS 端重構（PropertiesService + IS_ADMIN 注入）。前置條件：operator 在 GAS Script Editor 設定 `ADMIN_EMAIL` Script Property。設定完成後 `clasp push` 即生效。**如果 Script Property 未設定就 push，admin 功能會暫時失效**——但因為只影響「管理員能否刪除/重命名他人課表」，一般使用者不受影響，且設定 Property 後立即恢復。

3. **W3 獨立**：PHP config 外部化。與 W2 完全獨立（不同語言/不同部署管道）。前置條件：在 `classroom_viewer/` 建立 `config.php`（從 config.example.php 複製並填值），然後部署。**config.php 不存在就部署 = PHP 500 錯誤**——所以必須先建 config.php 再部署。

4. **W4 最後（Phase 1 收尾）**：AES 金鑰輪換是唯一有「線上影響」的操作——所有嵌入的 iframe URL 需要重新生成。但因為 W3 已完成 config 外部化，金鑰輪換只需改 config.php 的一個值 + 重新部署 + 更新 iframe URLs。有 rollback plan（舊金鑰已備份）。

5. **W5 是 Phase 2**：在所有清洗完成後，建立新的 public repo。這不影響現有 private repo 的任何功能。

---

## W1: Git Housekeeping + 文件清洗

**對應原 Plan:** Task 4 + Task 5
**Branch:** `fix/w1-git-housekeeping`
**Complexity:** simple（2 檔修改 + git rm 操作，無邏輯變更）
**線上影響:** 無（純 git metadata + 文件內容）

### 範圍

1. 建立 `.clasp.json.example`（帶 placeholder）
2. 更新根 `.gitignore`（加入 .clasp.json、_bmad-output/、graphify-out/、*.env）
3. `git rm --cached .clasp.json output.css`（保留本地檔案）
4. 清理 `_bmad-output/`（`git rm -r --cached`）
5. 移除 `classroom_viewer/test_env.php`（`git rm`）
6. 替換 `gemini.md` 中的 `talented.mido-9.com` → `your-domain.com`

### 驗證

```bash
# 確認 .clasp.json 不在 tracked files
git ls-files .clasp.json  # 預期：空

# 確認 output.css 不在 tracked files
git ls-files output.css  # 預期：空

# 確認 gemini.md 無內部域名
grep -n 'talented\|mido-9' gemini.md  # 預期：無結果

# 確認 test_env.php 已移除
ls classroom_viewer/test_env.php  # 預期：file not found

# 本地 clasp push 仍正常（.clasp.json 本地還在）
```

### 成功標準

- PR merge 後，`origin/main` 不含任何部署識別碼
- 本地開發流程不受影響（.clasp.json 保留本地）
- gemini.md 不含內部域名

---

## W2: GAS 後端 Admin 重構

**對應原 Plan:** Task 1 + Task 2
**Branch:** `refactor/w2-gas-admin-properties`
**Complexity:** complex+（改 `程式碼.js` + `JavaScript.html` + `UI.js.html` + `Index.html`，涉 Risk-Flag #1 #2）
**線上影響:** 無（前提：operator 先設 Script Properties）

### 前置條件（Operator 手動，PR merge 前完成）

1. 開啟 GAS Script Editor → Project Settings → Script Properties
2. 新增：`ADMIN_EMAIL` = `cheerc@talented.com.tw`
3. 儲存

### 範圍

1. `程式碼.js`：移除 `ADMIN_EMAIL` 常數 → 加 `getConfig()` helper → `_checkPermission()` 改用 `getConfig('ADMIN_EMAIL')`
2. `程式碼.js`：`doGet()` 注入 `template.isAdmin`
3. `Index.html`：`<script>` 區塊加 `var IS_ADMIN = <?= isAdmin ?>;`（L12-L13 之間）
4. `JavaScript.html`：`isCurrentUserAdmin()` 簡化為 `return IS_ADMIN`
5. `UI.js.html`：L195 admin check 改用 `IS_ADMIN`
6. 建立 `config.example.js`（Script Properties 文件化範本）
7. 更新 `.claspignore`（排除 config.example.js）

### 驗證

```bash
# 無硬編碼 admin email
grep -rn 'cheerc@talented' --include='*.js' --include='*.html' .  # 預期：無結果
grep -rn "=== 'cheerc'" --include='*.html' .  # 預期：無結果

# workflow.sh 驗證
./workflow.sh t6

# Operator 驗證（clasp push 後）：
# 1. Admin 帳號開啟 → 管理功能正常
# 2. 非 admin 帳號開啟 → 僅能管理自己課表
# 3. Console 輸入 IS_ADMIN → 值正確
```

### 成功標準

- 零硬編碼 admin email / username
- Admin 判斷由後端 PropertiesService 單一控制
- `clasp push` 後所有功能正常

---

## W3: PHP Config 外部化

**對應原 Plan:** Task 3
**Branch:** `refactor/w3-php-config`
**Complexity:** simple（2 PHP 檔修改 + 2 新 config 檔，無跨模組依賴）
**線上影響:** 無（前提：config.php 建立且部署）

### 前置條件（Operator 手動，部署前完成）

1. `cp classroom_viewer/config.example.php classroom_viewer/config.php`
2. 編輯 `config.php` 填入實際值（spreadsheet_id、encryption_key、csp_domain）

### 範圍

1. 建立 `classroom_viewer/config.example.php`（含 `defined('APP_RUNNING') or die()` 阻擋）
2. 修改 `classroom_viewer/index.php`：從 `config.php` 讀取、`display_errors` → 0
3. 修改 `classroom_viewer/generate_iframe.php`：從 `config.php` 讀取、`display_errors` → 0
4. 更新 `classroom_viewer/.gitignore`：加入 `config.php`

### 驗證

```bash
# 無硬編碼機密
grep -rn '1lWqXsLY' classroom_viewer/  # 預期：無結果
grep -rn 'def000006a78468f' classroom_viewer/  # 預期：無結果
grep -rn 'talented.mido-9' classroom_viewer/  # 預期：無結果

# config.php 不在 git
git ls-files classroom_viewer/config.php  # 預期：空

# PHP syntax check
find classroom_viewer -name '*.php' -exec php -l {} \;

# Operator 驗證（部署後）：
# 1. Classroom viewer 正常顯示
# 2. iframe generator 正常運作
```

### 成功標準

- PHP 檔案無硬編碼機密
- config.php 被 gitignored
- 部署後功能正常

---

## W4: AES 金鑰輪換 + Phase 1 驗證

**對應原 Plan:** Task 6 + Task 7
**Branch:** 無（純 config + 運維操作，無 code 變更）
**Complexity:** 運維操作
**線上影響:** ⚠️ 現有 iframe URL 需重新生成

### 執行步驟

1. 備份舊金鑰到安全位置
2. `openssl rand -hex 32` 生成新金鑰
3. 更新 `classroom_viewer/config.php` 中的 `encryption_key`
4. 部署到 production
5. 用 `generate_iframe.php` 重新生成所有 iframe 碼
6. 更新嵌入頁面中的 iframe src
7. 執行 Phase 1 全面 grep 掃描（Task 7 Step 1）
8. 功能回歸測試（Task 7 Step 2）

### 成功標準

- 新金鑰生效，舊 URL 回傳解密失敗
- 新 URL 正常顯示
- grep 掃描全面通過（零機密殘留）

---

## W5: Public Repo + 開源文件

**對應原 Plan:** Task 8 + Task 9 + Task 10
**Branch:** 新 repo
**Complexity:** complex+（涉及文件撰寫、repo 建立）
**線上影響:** 無（新 repo 建立，private repo 不受影響）

### 範圍

1. 從 private repo rsync 清洗後的 codebase 到新目錄
2. 最終掃描確認無機密殘留
3. 撰寫 README.md、CONTRIBUTING.md、LICENSE (MIT)、SECURITY.md
4. gemini.md → docs/ARCHITECTURE.md
5. `gh repo create --public`
6. 安裝 gitleaks pre-commit hook（必做）
7. 建立 issue templates
8. 原 private repo 標記 archived

### 成功標準

- Public repo 零機密
- 完整的開源文件套件
- gitleaks pre-commit hook 運作正常
- GitHub Secret Scanning 啟用

---

## 執行節奏

```
W1 (30min) → 通知 operator → W2 (1.5hr + operator 設 Properties) → 通知 operator
→ W3 (2hr + operator 建 config) → 通知 operator → W4 (30min + operator 部署)
→ 通知 operator → W5 (2.5hr + operator 建 repo) → 完成
```

預計總執行時間：~7.5-8 小時（含 operator 介入）
