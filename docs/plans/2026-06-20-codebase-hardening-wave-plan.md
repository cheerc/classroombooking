# Classroombooking Codebase Hardening — Wave Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依序修復 codebase-review V1 發現的 15 個 issues（4 HIGH + 10 MED），建立 test baseline，並在每個 wave 結束後執行 `/retro` 回顧。

**Architecture:** 6 waves，按依賴順序排列 — 先建 test 基礎（W1），再修 HIGH bugs（W2），再強化 security（W3），再補測試鏈（W4），再建 GAS mock tests（W5），最後 performance/code-quality 優化（W6）。

**Tech Stack:** GAS V8 (程式碼.js) + 原生 HTML/JS (.js.html includes) + PHP (classroom_viewer/) + Vitest + PHPUnit

**Excluded (LOCK):** #40 App God Object、#44 getSheet() auto-create — 待 operator 討論後另行處理。

---

## Wave 1: Test Infrastructure（Phase 1）

**Issues:** #50

**Goal:** 建立 Vitest + PHPUnit 基線，為後續修復提供回歸保護。

**Branch:** `feat/test-infrastructure-phase1`

### Task 1.1: Vitest 設定

**Files:**
- Create: `vitest.config.js`
- Modify: `package.json`（新增 devDependency + test script）
- Create: `tests/setup.js`

- [ ] **Step 1: 安裝 Vitest**
```bash
npm install -D vitest
```

- [ ] **Step 2: 建 vitest.config.js**
```javascript
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    globals: true,
  },
});
```

- [ ] **Step 3: 在 package.json 加 test script**
```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 4: 驗證 `npm test` 可執行（0 tests found，exit 0）**

- [ ] **Step 5: Commit**
```bash
git commit -m "feat: add Vitest testing infrastructure — #50"
```

### Task 1.2: 抽出純邏輯函式 + 撰寫 unit tests

**Files:**
- Create: `tests/lib/escapeHtml.js` — 從 Modals.js.html 抽出
- Create: `tests/lib/dateUtils.js` — 從 程式碼.js 抽出 date 比較/驗證邏輯
- Create: `tests/unit/escapeHtml.test.js`
- Create: `tests/unit/dateUtils.test.js`

- [ ] **Step 1: 抽出 escapeHtml 為獨立模組**
```javascript
// tests/lib/escapeHtml.js
export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

- [ ] **Step 2: 撰寫 escapeHtml tests**
```javascript
// tests/unit/escapeHtml.test.js
import { escapeHtml } from '../lib/escapeHtml.js';
import { describe, it, expect } from 'vitest';

describe('escapeHtml', () => {
  it('escapes angle brackets', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
  it('escapes quotes', () => {
    expect(escapeHtml('"hello" & \'world\'')).toBe('&quot;hello&quot; &amp; &#39;world&#39;');
  });
  it('handles null/undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
  it('handles non-string input', () => {
    expect(escapeHtml(123)).toBe('123');
  });
});
```

- [ ] **Step 3: 抽出 date 比較邏輯**
```javascript
// tests/lib/dateUtils.js
export function normalizeTimestamp(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  return String(value);
}

export function isValidDate(value) {
  if (!value) return false;
  const d = new Date(value);
  return !isNaN(d.getTime());
}

export function safeToISOString(value) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}
```

- [ ] **Step 4: 撰寫 dateUtils tests**（覆蓋 #38 和 #39 的邏輯）
```javascript
// tests/unit/dateUtils.test.js
import { normalizeTimestamp, isValidDate, safeToISOString } from '../lib/dateUtils.js';
import { describe, it, expect } from 'vitest';

describe('normalizeTimestamp', () => {
  it('normalizes Date object to ISO string', () => {
    const d = new Date('2026-01-01T00:00:00.000Z');
    expect(normalizeTimestamp(d)).toBe('2026-01-01T00:00:00.000Z');
  });
  it('normalizes ISO string to ISO string', () => {
    expect(normalizeTimestamp('2026-01-01T00:00:00.000Z')).toBe('2026-01-01T00:00:00.000Z');
  });
  it('both types produce equal output for same timestamp', () => {
    const iso = '2026-06-01T12:00:00.000Z';
    const dateObj = new Date(iso);
    expect(normalizeTimestamp(iso)).toBe(normalizeTimestamp(dateObj));
  });
});

describe('isValidDate', () => {
  it('returns false for empty string', () => { expect(isValidDate('')).toBe(false); });
  it('returns false for null', () => { expect(isValidDate(null)).toBe(false); });
  it('returns false for garbage', () => { expect(isValidDate('not-a-date')).toBe(false); });
  it('returns true for valid ISO', () => { expect(isValidDate('2026-01-01T00:00:00.000Z')).toBe(true); });
});

describe('safeToISOString', () => {
  it('returns null for invalid', () => { expect(safeToISOString('bad')).toBe(null); });
  it('returns null for empty', () => { expect(safeToISOString('')).toBe(null); });
  it('returns ISO for valid', () => {
    expect(safeToISOString('2026-01-01')).toMatch(/^2026-01-01/);
  });
});
```

- [ ] **Step 5: 執行 `npm test` — 預期全部 PASS**

- [ ] **Step 6: Commit**
```bash
git commit -m "feat: add escapeHtml + dateUtils unit tests — #50"
```

### Task 1.3: PHPUnit 設定 + 加解密測試

**Files:**
- Modify: `classroom_viewer/composer.json`
- Create: `classroom_viewer/tests/EncryptionTest.php`
- Create: `classroom_viewer/phpunit.xml`

- [ ] **Step 1: 安裝 PHPUnit**
```bash
cd classroom_viewer && composer require --dev phpunit/phpunit
```

- [ ] **Step 2: 建 phpunit.xml**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<phpunit bootstrap="vendor/autoload.php" colors="true">
  <testsuites>
    <testsuite name="Viewer Tests">
      <directory>tests</directory>
    </testsuite>
  </testsuites>
</phpunit>
```

- [ ] **Step 3: 撰寫加解密 round-trip 測試**
```php
// classroom_viewer/tests/EncryptionTest.php
<?php
use PHPUnit\Framework\TestCase;

class EncryptionTest extends TestCase {
    private const CIPHER = 'aes-256-cbc';
    private string $key;

    protected function setUp(): void {
        $this->key = 'test-key-for-unit-testing-only-32bytes!';
    }

    public function testEncryptDecryptRoundTrip(): void {
        $original = json_encode(['schedule_name' => ['Test'], 'tags' => ['A'], 'exclude_tags' => []]);
        $ivLen = openssl_cipher_iv_length(self::CIPHER);
        $iv = openssl_random_pseudo_bytes($ivLen);
        $encrypted = openssl_encrypt($original, self::CIPHER, $this->key, 0, $iv);
        $payload = base64_encode($iv . $encrypted);

        // Decrypt
        $decoded = base64_decode($payload);
        $extractedIv = substr($decoded, 0, $ivLen);
        $extractedCipher = substr($decoded, $ivLen);
        $decrypted = openssl_decrypt($extractedCipher, self::CIPHER, $this->key, 0, $extractedIv);

        $this->assertJsonStringEqualsJsonString($original, $decrypted);
    }

    public function testInvalidPayloadReturnsFailure(): void {
        $result = openssl_decrypt('garbage', self::CIPHER, $this->key, 0, str_repeat("\0", 16));
        $this->assertFalse($result);
    }
}
```

- [ ] **Step 4: 執行 `cd classroom_viewer && vendor/bin/phpunit` — 預期 PASS**

- [ ] **Step 5: Commit**
```bash
git commit -m "feat: add PHPUnit + encryption round-trip test — #50"
```

### Task 1.4: CI 整合 + workflow.sh 更新

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `workflow.sh`

- [ ] **Step 1: ci.yml 加 Vitest + PHPUnit jobs**

- [ ] **Step 2: workflow.sh 加 t7 (PHP lint), t8 (Vitest), t9 (PHPUnit)，更新 t6 全跑**

- [ ] **Step 3: 本地跑 `./workflow.sh t6` 驗證全部 PASS**

- [ ] **Step 4: Commit**
```bash
git commit -m "ci: integrate Vitest + PHPUnit into CI and workflow.sh — #50 #48"
```

### Task 1.5: PR + Review + Merge

- [ ] **Step 1: 開 PR，title `feat: test infrastructure Phase 1 — Closes #50 Closes #48`**
- [ ] **Step 2: CI 通過 + Reviewer VERIFIED → Lead merge**

### Wave 1 結束

- [ ] **執行 `/retro` — 回顧 Wave 1 test infrastructure 建立過程**

---

## Wave 2: HIGH Bug Fixes

**Issues:** #4 (XSS residual), #38 (checkMetadata), #39 (getVersionData)

**Goal:** 修復 3 個 HIGH bugs，有 Wave 1 tests 提供回歸保護。

**Branch:** `fix/high-bugs-w2`

### Task 2.1: 修復 #4 — Interaction.js.html XSS 殘留

**Files:**
- Modify: `Interaction.js.html`（所有 template literal 中的使用者資料加 `escapeHtml()`）

- [ ] **Step 1: 掃描 Interaction.js.html 所有未 escape 的插值**
重點位置：L186-196 `buildCourseFormHtml()`、L238/255 `showConfirm()` 呼叫

- [ ] **Step 2: 對每個使用者資料插值加 `escapeHtml()`**
```javascript
// L186: ${escapeHtml(classroom)}
// L188: value="${escapeHtml(isEditMode ? classItemToEdit.name : '')}"
// L194: value="${escapeHtml(isEditMode ? classItemToEdit.teacher : '')}"
// L196: <textarea ...>${escapeHtml(isEditMode ? classItemToEdit.notes || '' : '')}</textarea>
// L238: showConfirm(`...「${escapeHtml(originalData.name)}」...「${escapeHtml(name)}」...`)
// L255: showConfirm(`...「${escapeHtml(originalData.teacher)}」...「${escapeHtml(teacher)}」...`)
```

- [ ] **Step 3: `./workflow.sh t2` ESLint 驗證**

- [ ] **Step 4: Commit**
```bash
git commit -m "fix: escape user data in Interaction.js.html — Closes #4"
```

### Task 2.2: 修復 #38 — checkMetadata date 比較

**Files:**
- Modify: `程式碼.js:260-268`

- [ ] **Step 1: 修正 checkMetadata 統一轉 ISO string**
```javascript
function checkMetadata(dataSheet, clientTimestamp) {
  const rawValue = dataSheet.getRange("F1").getValue();
  const currentTimestamp = rawValue ? new Date(rawValue).toISOString() : null;
  if (clientTimestamp && currentTimestamp && clientTimestamp !== currentTimestamp) {
    throw new Error('操作失敗！課表列表已被他人修改，請關閉視窗後重新打開以刷新。');
  }
  const newTimestamp = new Date().toISOString();
  dataSheet.getRange("F1").setValue(newTimestamp);
  return newTimestamp;
}
```

- [ ] **Step 2: `./workflow.sh t3` ESLint 驗證**

- [ ] **Step 3: Commit**
```bash
git commit -m "fix: normalize timestamp types in checkMetadata — Closes #38"
```

### Task 2.3: 修復 #39 — getVersionData date 驗證

**Files:**
- Modify: `程式碼.js:496-500`

- [ ] **Step 1: 加 date validity 檢查**
```javascript
const versionRow = data.slice(1).find(row => {
  if (!row[0]) return false;
  const d = new Date(row[0]);
  return !isNaN(d.getTime()) && d.toISOString() === versionId;
});
```

- [ ] **Step 2: `./workflow.sh t3` ESLint 驗證**

- [ ] **Step 3: Commit**
```bash
git commit -m "fix: validate dates in getVersionData — Closes #39"
```

### Task 2.4: PR + Review + Merge

- [ ] **Step 1: 開 PR，title `fix: HIGH bugs — Closes #4 #38 #39`**
- [ ] **Step 2: CI + Reviewer VERIFIED → merge**
- [ ] **Step 3: `clasp push` 部署 dev**

### Wave 2 結束

- [ ] **執行 `/retro` — 回顧 Wave 2 HIGH bug 修復過程**

---

## Wave 3: Security Improvements

**Issues:** #41 (copySchedule auth), #42 (AES HMAC), #43 (ENT_QUOTES)

**Branch:** `fix/security-w3`

### Task 3.1: 修復 #41 — copySchedule 加 _checkPermission

**Files:**
- Modify: `程式碼.js:409`（copySchedule 函式開頭）

- [ ] **Step 1: 在 copySchedule 開頭加權限檢查**
```javascript
function copySchedule(params) {
  _checkPermission(params);
  // ... existing code ...
}
```

- [ ] **Step 2: `./workflow.sh t3`**
- [ ] **Step 3: Commit** `fix: add _checkPermission to copySchedule — Closes #41`

### Task 3.2: 修復 #42 — AES-CBC 加 HMAC

**Files:**
- Modify: `classroom_viewer/generate_iframe.php`（加密端）
- Modify: `classroom_viewer/index.php`（解密端）
- Modify: `classroom_viewer/config.example.php`（新增 hmac_key）
- Update: `classroom_viewer/tests/EncryptionTest.php`（加 HMAC 測試）

- [ ] **Step 1: config.example.php 加 hmac_key**
- [ ] **Step 2: generate_iframe.php — encrypt-then-MAC**
- [ ] **Step 3: index.php — verify-MAC-then-decrypt**
- [ ] **Step 4: 更新 PHPUnit 測試涵蓋 HMAC round-trip + tamper detection**
- [ ] **Step 5: `php -l` + PHPUnit PASS**
- [ ] **Step 6: Commit** `fix: add HMAC to AES-CBC encryption — Closes #42`

### Task 3.3: 修復 #43 — htmlspecialchars ENT_QUOTES

**Files:**
- Modify: `classroom_viewer/generate_iframe.php:158,162,166`

- [ ] **Step 1: 加 ENT_QUOTES flag**
```php
htmlspecialchars($_POST['schedule_name'] ?? '', ENT_QUOTES, 'UTF-8')
```

- [ ] **Step 2: `php -l` 驗證**
- [ ] **Step 3: Commit** `fix: add ENT_QUOTES to htmlspecialchars — Closes #43`

### Task 3.4: PR + Review + Merge + PHP 部署

- [ ] **Step 1: PR `fix: security improvements — Closes #41 #42 #43`**
- [ ] **Step 2: CI + Reviewer VERIFIED → merge**
- [ ] **Step 3: `clasp push` + PHP 複製到 Google Drive 部署**

### Wave 3 結束

- [ ] **執行 `/retro` — 回顧 Wave 3 security 改善過程**

---

## Wave 4: Test Chain Improvements

**Issues:** #49 (check-structure.sh)

**Goal:** 補強驗證鏈覆蓋度（#48 已在 W1 一併解決）。

**Branch:** `fix/test-chain-w4`

### Task 4.1: 修復 #49 — 擴充 check-structure.sh

**Files:**
- Modify: `scripts/check-structure.sh`

- [ ] **Step 1: 擴充 REQUIRED_FILES 陣列**
```bash
REQUIRED_FILES=(
  "Index.html"
  "程式碼.js"
  "appsscript.json"
  "input.css"
  "package.json"
  "tailwind.config.js"
  "JavaScript.html"
  "Api.js.html"
  "Config.js.html"
  "Elements.js.html"
  "Modals.js.html"
  "History.js.html"
  "UI.js.html"
  "Interaction.js.html"
  "classroom_viewer/index.php"
  "classroom_viewer/generate_iframe.php"
  "classroom_viewer/config.example.php"
  "classroom_viewer/composer.json"
)
```

- [ ] **Step 2: `./workflow.sh t4` 驗證 PASS**
- [ ] **Step 3: Commit** `fix: expand check-structure.sh required files — Closes #49`

### Task 4.2: PR + Review + Merge

- [ ] **PR `fix: test chain improvements — Closes #49`**

### Wave 4 結束

- [ ] **執行 `/retro` — 回顧 Wave 4**

---

## Wave 5: GAS Mock Testing（Phase 2）

**Issues:** #51

**Goal:** 建立 GAS API mock layer，覆蓋 saveData / getData / checkMetadata 等後端邏輯。

**Branch:** `feat/gas-mock-tests-phase2`

### Task 5.1: 建 GAS Runtime Mock

**Files:**
- Create: `tests/mocks/gas-runtime.js`

- [ ] **Step 1: 實作 SpreadsheetApp / Session / LockService mocks**
- [ ] **Step 2: Commit** `feat: add GAS runtime mock layer — #51`

### Task 5.2: 後端邏輯測試

**Files:**
- Create: `tests/backend/checkMetadata.test.js`
- Create: `tests/backend/getVersionData.test.js`
- Create: `tests/backend/copySchedule.test.js`
- Create: `tests/backend/getData.test.js`

- [ ] **Step 1: 撰寫 checkMetadata mock test**（驗證 #38 修復正確性）
- [ ] **Step 2: 撰寫 getVersionData mock test**（驗證 #39 修復正確性）
- [ ] **Step 3: 撰寫 copySchedule mock test**（驗證 #41 權限檢查）
- [ ] **Step 4: 撰寫 getData baseline test**（記錄 N+1 行為 snapshot for #15）
- [ ] **Step 5: `npm test` 全部 PASS**
- [ ] **Step 6: Commit** `feat: add GAS backend mock tests — Closes #51`

### Task 5.3: PR + Review + Merge

- [ ] **PR `feat: GAS mock testing Phase 2 — Closes #51`**

### Wave 5 結束

- [ ] **執行 `/retro` — 回顧 Wave 5 GAS mock testing 建立過程**

---

## Wave 6: Performance + Code Quality

**Issues:** #45 (unbounded range), #46 (History serialization), #47 (getFontBase64 return type)

**Branch:** `fix/perf-quality-w6`

### Task 6.1: 修復 #45 — getVersionData 限定範圍

**Files:**
- Modify: `程式碼.js:496`

- [ ] **Step 1: 改為 bounded range**
```javascript
const lastRow = historySheet.getLastRow();
const data = lastRow > 0 ? historySheet.getRange(1, 1, lastRow, 3).getValues() : [];
```

- [ ] **Step 2: Commit** `fix: bound getVersionData range — Closes #45`

### Task 6.2: 修復 #46 — History.js 改用 structuredClone

**Files:**
- Modify: `History.js.html`

- [ ] **Step 1: 替換 JSON.parse(JSON.stringify(...)) 為 structuredClone()**
- [ ] **Step 2: 狀態比較改用 dirty flag**（減少 stringify 比較）
- [ ] **Step 3: Commit** `perf: replace JSON deep-clone with structuredClone — Closes #46`

### Task 6.3: 修復 #47 — getFontBase64FromDrive 統一回傳型別

**Files:**
- Modify: `程式碼.js:527-548`

- [ ] **Step 1: 統一為 { success, data/error } 格式**
```javascript
function getFontBase64FromDrive() {
  try {
    // ... existing logic ...
    return { success: true, data: match[1] };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}
```

- [ ] **Step 2: 更新所有 callers 處理新格式**
- [ ] **Step 3: Commit** `fix: unify getFontBase64FromDrive return type — Closes #47`

### Task 6.4: PR + Review + Merge

- [ ] **PR `fix: performance + code quality — Closes #45 #46 #47`**
- [ ] **CI + Reviewer VERIFIED → merge**
- [ ] **`clasp push` 部署 dev**

### Wave 6 結束

- [ ] **執行 `/retro` — 回顧 Wave 6 及整體 codebase hardening 成果**

---

## 總覽

| Wave | Issues | Severity | 預估 |
|------|--------|----------|------|
| W1 | #50, #48 | MED | Test 基礎設施 |
| W2 | #4, #38, #39 | HIGH | 最急迫 bug 修復 |
| W3 | #41, #42, #43 | MED | Security 強化 |
| W4 | #49 | MED | 驗證鏈補強 |
| W5 | #51 | MED | GAS mock 測試 |
| W6 | #45, #46, #47 | MED | Performance + 品質 |

**排除：** #40 (God Object LOCK), #44 (getSheet LOCK) — 待 operator 決定
**既有：** #15 (N+1 getData) — 已補充證據，待獨立處理
**已建：** #37 (generate_iframe access) — 獨立排程

## Operator 手動驗證

每個 wave merge + `clasp push` 後，需 operator 手動驗證：
- 驗證清單已輸出至 `~/Downloads/classroombooking-verification-checklist.md`
- 用 dev deployment 測試（GAS 編輯器 → 「以網路應用程式執行」）
