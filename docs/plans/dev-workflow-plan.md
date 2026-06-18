# classroombooking 開發流程閉環規劃 v2

狀態: FINALIZED — v2 獲 cb-team-reviewer x 2 VERIFIED + 全 team 正反討論完成
目的: 讓 cb-team 能快速上手開發 classroombooking，定義完整的開發流程閉環
硬性邊界:
  - 嚴禁改任何產品 code（程式碼.js、*.html、classroom_viewer/ 等）
  - 嚴禁修改 ~/agend-customization（General 的工作）

協作記錄:
  - v1: Lead 起草 + impl 技術評估（Q1-Q5）整合
  - v2: 修復 cb-team-reviewer2 REJECTED（C1-C3 CRITICAL / W4-W8 WARNING）
  - 後記: 全 team 正反討論整合入第八節

---

## 一、現況快照

### 1.1 Tech Stack

| 層 | 技術 | 狀態 |
|----|------|------|
| 後端 | Google Apps Script V8 (程式碼.js, 508 行) | OK |
| 前端 | 原生 HTML + 原生 JavaScript（10 個 .html include） | OK |
| 樣式 | Tailwind CSS 3.4 | 可 build |
| GAS Deploy | clasp push + clasp deploy（手動，operator 執行） | 手動 OK |
| PHP 檢視器 | classroom_viewer/（獨立 PHP，.claspignore 排除） | 獨立 OK |
| 測試 | TestCases.md（26 個手動案例） | 純手動 |
| CI | 無 | 缺 |
| Linting | 無 | 缺 |
| Dispatch Book | 無 | 缺 |

### 1.2 核心約束

1. clasp push = operator 手動執行（GAS 無法 CI push/deploy）
2. GAS Web App 無法自動化 E2E（CSP + auth 阻擋 Playwright/Cypress）
3. 原生 JS（非 TypeScript/ES module）：全域物件模式，不可直接 Jest 測試
4. 單一 main 分支：目前無 dev/main 雙分支模型
5. 超大單檔：JavaScript.html 1443 行（副檔名 .html，非 .js.html）
6. ~/agend-customization 嚴禁修改：dispatch book 創建是 General 的工作
7. Tailwind.html 在 .gitignore：每次 clasp push 前必須先 npm run build

### 1.3 前端 HTML Include 檔案命名（關鍵）

注意：主要 JS 控制器叫 JavaScript.html（副檔名 .html），不是 .js.html。
ESLint glob 設計必須用 --ext .html . 才能覆蓋到兩種副檔名。

| 檔案 | 副檔名 | 說明 |
|------|--------|------|
| JavaScript.html | .html | App 主物件 + 整合控制（1443 行）|
| UI.js.html | .js.html | UI 渲染引擎（782 行）|
| Interaction.js.html | .js.html | 使用者互動（761 行）|
| Api.js.html | .js.html | google.script.run wrapper |
| Config.js.html | .js.html | 全域常數 |
| Elements.js.html | .js.html | DOM helper |
| Modals.js.html | .js.html | 彈出視窗 |
| History.js.html | .js.html | 版本紀錄 UI |
| Index.html | .html | 主入口 |
| CustomStyles.html | .html | 自訂 CSS |
| Tailwind.html | .html | Tailwind CSS（gitignored，build 產出）|

### 1.4 Build Chain（已驗證）

目前: npm run build-css → output.css（gitignored）→ [缺：包裝步驟] → Tailwind.html（gitignored）

問題：output.css → Tailwind.html 包裝步驟完全未腳本化。
修復：Phase 1 加 build-tailwind-html + build script（見第三節 B）。

---

## 二、目標：開發流程閉環

### 2.1 閉環全圖

Operator/General 提出需求（GitHub Issue）
         ↓
Lead 評估 complexity
  ├─ Trivial/Simple → inline 描述直接 dispatch
  └─ Complex+ → 寫 plan → push to main → plan review → dispatch
         ↓
Lead dispatch → cb-team-impl（feature branch from origin/main）
         ↓
Impl: worktree checkout（from origin/main）→ 開發 → ./workflow.sh t6 → PR
         ↓
CI 自動跑（PR→main）：t1-t5 + PHP lint 全 pass
         ↓
Lead dispatch → cb-team-reviewer（+reviewer2 若 complex+）
         ↓
Reviewer: gh pr diff 審查 → VERIFIED/REJECTED
         ↓
  REJECTED → Lead 建 rework task → Impl 修正 → 重跑
  VERIFIED + CI 綠 → Lead merge gate → admin-merge PR → main
         ↓
Operator 執行 GAS 部署：
  git pull origin main
  npm run build   ← 必須在 clasp push 前（Tailwind.html gitignored）
  clasp push
         ↓
若 PR 涉及 classroom_viewer/*.php：額外手動部署 PHP
         ↓
手動驗收（TestCases.md）→ issue close

### 2.2 與 easyorder/payroll 的關鍵差異

| 面向 | easyorder/payroll | classroombooking |
|------|-------------------|------------------|
| 預設分支 | dev + main | main（單分支，feature → main PR）|
| Worktree from_ref | origin/dev | origin/main |
| CI merge gate | tsc + lint + vitest | CSS build + ESLint + GAS lint + 結構 + PHP lint |
| 部署 | Firebase Deploy Script | npm run build && clasp push（手動）|
| Unit Test | Vitest/Jest | 無（語言架構限制）|
| E2E Test | Playwright + Emulator | 無（GAS sandbox 阻擋）|
| Type System | TypeScript strict | 原生 JS（無 tsc）|
| PHP Component | 無 | classroom_viewer/（獨立 PHP，需分開部署）|

---

## 三、缺什麼、補什麼

### 3.1 Tier 1：核心（team 能動的最低要求）

#### A. Dispatch Book

由 General 用 new-project.sh 創建（短名稱: cb，與 cb-team 命名一致）：

    bash scripts/new-project.sh cb classroombooking docs/plans main cheerc/classroombooking

PROJECT.md 需填入的值：

| 欄位 | 值 |
|------|---|
| Source | /Users/cheerc/Projects/classroombooking（daemon 不解析 ~）|
| Default branch | main（單分支，無 dev）|
| GitHub slug | cheerc/classroombooking |
| from_ref | origin/main |
| CI workflow | ci.yml（PR→main）|
| Plan dir | docs/plans/ |
| Tech Stack | GAS V8 + 原生 HTML/JS + Tailwind CSS 3.4 + PHP classroom_viewer/ |
| Test chain | t1 CSS + t2 ESLint 前端 + t3 ESLint GAS + t4 結構 + t5 Tailwind + PHP lint |
| Merge gate | CI 綠 + reviewer VERIFIED → admin-merge |
| Deploy SOP GAS | npm run build && clasp push |
| Deploy SOP PHP | 手動部署到 web server（見第三節 J）|
| Risk-Flags | 見第三節第三小節 |

LEAD.md 專案 quirk：
- Complexity 閾值：Trivial=1 檔/≤15行/純文字設定；Simple=1-2 檔/無核心邏輯；
  Complex+=3+檔/改 JavaScript.html/改 GAS 後端
- Deploy SOP: cd /Users/cheerc/Projects/classroombooking && npm run build && clasp push
- Branch model: feature → main（worktree from_ref: origin/main）
- 無 E2E；TestCases.md 是 operator clasp push 後的手動驗收清單

IMPL.md 專案 quirk：
- worktree checkout, from_ref: origin/main（非 origin/dev）
- Preflight: npm ci（root only，無 functions/）
- PHP 金鑰複製（涉及 classroom_viewer/ 時）:
  cp ~/Projects/classroombooking/classroom_viewer/credentials/*.json <worktree>/classroom_viewer/credentials/
- 送 review 前: ./workflow.sh t6（full run t1-t5）
- Phase 1 PR ESLint dry run: 先在 source repo 跑 npx eslint --ext .html . 確認 baseline noise，貼入 PR body
- 大型 JS 檔修改前: 先用 /graphify 確認 consumer 範圍（尤其 JavaScript.html）

REVIEWER.md 專案 quirk：
- Repo slug: cheerc/classroombooking
- Stage 1 特有檢查項（見第三節第四小節）
- 無 tsc/vitest；diff 觸及 Risk-Flags → depth=D3

#### B. package.json 新增 script（標準化 build chain）

新增 scripts:
- "build-css": "node ./node_modules/tailwindcss/lib/cli.js -i ./input.css -o ./output.css"
- "build-tailwind-html": wrap output.css in style tags → Tailwind.html
- "build": "npm run build-css && npm run build-tailwind-html"

#### C. ESLint 設定（.eslintrc.json）— Phase 1 必須建立

注意：ESLint config 必須在 Phase 1 建立（與 CI/workflow.sh 同步），否則 Phase 1 CI 無法跑 ESLint。

設定包含：
- plugins: ["html", "googleappsscript"]
- env: browser=true, es2020=true
- globals: google, Tagify, Sortable, AppConfig, AppElements, AppHistory（全 readonly）
- rules: no-unused-vars=warn, no-undef=error, no-console=off
- overrides for 程式碼.js: googleappsscript env

安裝: npm install --save-dev eslint eslint-plugin-html eslint-plugin-googleappsscript

.eslintignore: 加入 Tailwind.html output.css CustomStyles.html（純 CSS 無需 lint）

.claspignore 新增（確保新增目錄不被 clasp push）:
  docs/
  scripts/
  .github/
  node_modules/

#### D. GitHub Actions CI（.github/workflows/ci.yml）

PR→main 自動觸發，steps:
- actions/checkout@v4 + actions/setup-node@v4 (node 18, npm cache)
- npm ci
- t1: npm run build（CSS full build）
- t2: npx eslint --ext .html .（ESLint 前端，包含 JavaScript.html）
- t3: npx eslint 程式碼.js（ESLint GAS backend）
- t4: bash scripts/check-structure.sh（必要檔案驗證）
- t5: bash scripts/check-tailwind.sh（hash/diff 一致性）
- PHP lint: find classroom_viewer -name '*.php' -exec php -l {} \;

ESLint glob 說明：--ext .html .（掃描所有 .html 檔）= 同時包含 JavaScript.html 和 UI.js.html
CI 不做: clasp push/deploy（OAuth 限制）、GAS function 執行、E2E

#### E. workflow.sh（本地開發驗證入口）

| ID | 名稱 | 指令 | 說明 |
|----|------|------|------|
| t1 | CSS Full Build | npm run build | build-css + build-tailwind-html |
| t2 | ESLint 前端 | npx eslint --ext .html . | 所有 .html 包含 JavaScript.html |
| t3 | ESLint GAS | npx eslint 程式碼.js | GAS env |
| t4 | 結構驗證 | bash scripts/check-structure.sh | 確認必要檔案存在 |
| t5 | Tailwind 一致性 | bash scripts/check-tailwind.sh | hash/diff 驗證 Tailwind.html 非過時 |
| t6 | Full Run | t1→t2→t3→t4→t5 依序 | 送 review 前必跑 |

#### F. Branch Protection（GitHub）

- main 分支：require PR review x 1
- Forbid direct push / force push / delete

#### G. Plan 目錄

docs/plans/.gitkeep

#### H. Scripts 輔助腳本

scripts/check-structure.sh: 驗證必要檔案存在（Index.html, 程式碼.js, appsscript.json 等）
scripts/check-tailwind.sh: hash/diff 比對驗證 Tailwind.html 非過時

check-tailwind.sh 建議邏輯（reviewer1 建議）：
  先 npm run build-css 產生 output.css，再比較 Tailwind.html 與預期內容。
  比 timestamp 更可靠。

#### I. graphify 知識圖（Phase 2）

對 classroombooking JS codebase 建 graph（graphify-out/graph.json，gitignored）
特別有用：JavaScript.html（1443 行）函式依賴圖

#### J. PHP 部署 SOP

classroom_viewer/ 是獨立 PHP 應用，不受 clasp push 影響，需分開部署：
- 具體方式依 PHP hosting 環境（FTP/SSH/hosting 面板）
- 目前：operator 手動上傳 classroom_viewer/ 到 PHP 主機
- credentials/*.json 需單獨放置（不在 git 中）
- IMPL.md 提醒：涉及 classroom_viewer/*.php 的 PR body 必須說明 PHP 部署方式

---

### 3.2 Tier 2（Phase 2，Phase 1 驗收後）

graphify 知識圖：對 JS codebase 建 graph（graphify-out/graph.json）

---

### 3.3 Risk-Flags（進 dispatch book PROJECT.md）

以下任一被 diff 觸及 → review contract depth = D3：

| # | Risk Flag | 觸及條件 | 說明 |
|---|-----------|----------|------|
| 1 | 程式碼.js（GAS 後端） | 任何改動 | getData/saveData 直接操作 Google Sheets，資料損壞不可逆 |
| 2 | JavaScript.html（App 主物件） | 任何改動 | 1443 行核心控制器，所有狀態管理、存檔邏輯 |
| 3 | appsscript.json OAuth scopes | scope 新增/修改 | 權限提升，需 operator 重新授權 |
| 4 | 版本衝突邏輯（lastModified） | 相關程式碼修改 | 多 tab 防覆蓋機制，crash 導致資料遺失 |
| 5 | GAS Script Lock | 相關程式碼修改 | race condition 保護 |
| 6 | .github/workflows/* | CI 設定修改 | CI 設定錯誤影響整個開發流程 |
| 7 | classroom_viewer/credentials/ | 金鑰相關 | Service Account 機密，永不進 git |
| 8 | classroom_viewer/*.php | 任何 PHP 修改 | 需額外手動部署；CSP/frame-ancestors 設定影響安全性 |
| 9 | HARDCODED_CONFIG | 程式碼.js 中新增硬編碼設定值 | ADMIN_EMAIL 已存在為例，不得擴散 |

---

### 3.4 Reviewer Stage 1 特有檢查項

- GAS API 錯誤處理：google.script.run 的 .withFailureHandler() 是否存在
- Google Sheets 寫入保護：saveData 路徑有 Lock + 版本衝突（lastModified）保護
- 機密不進 git：classroom_viewer/credentials/*.json 永不進 git
- Tailwind/CSS 不 commit：PR diff 中不含 Tailwind.html + output.css
- PHP 部署提醒：涉及 classroom_viewer/*.php → PR body 有 PHP 部署說明
- HARDCODED_CONFIG：不得在 PR 中新增硬編碼設定值

---

## 四、分工與實施路徑

### 4.1 General 的工作（~/agend-customization）

1. 執行 bash scripts/new-project.sh cb classroombooking docs/plans main cheerc/classroombooking
2. 填入本計畫第三節 A 提供的值到 4 個 dispatch book 檔
3. 更新 instructions/general.md Projects 表新增 classroombooking row（短名 cb）
4. scripts/render-shared.sh --check && scripts/render-shared.sh --audit
5. Commit + deploy cb-team（讓 cb-team 載入新 dispatch book）

### 4.2 cb-team 的工作（~/Projects/classroombooking repo）

前提：dispatch book 已建立、cb-team 已重新載入

Phase 1（Tier 1 核心，可合一個 PR）：

| 任務 | 複雜度 | 內容 |
|------|--------|------|
| Build chain 標準化 | simple | package.json 加 build-tailwind-html + build scripts |
| ESLint 設定 | simple | .eslintrc.json + npm install plugins + .eslintignore + .claspignore 更新 |
| workflow.sh | simple | t1-t6 本地驗證腳本 |
| .github/workflows/ci.yml | simple | PR→main CI：t1-t5 + PHP lint |
| scripts/check-structure.sh | trivial | 必要檔案存在驗證 |
| scripts/check-tailwind.sh | trivial | hash/diff 一致性驗證 |
| docs/plans/.gitkeep | trivial | plan 目錄 |
| GitHub branch protection | trivial | main 設 PR require（operator 執行）|

Phase 2（Tier 2 品質基礎，Phase 1 驗收後）：

| 任務 | 複雜度 | 內容 |
|------|--------|------|
| graphify 建圖 | simple | graphify-out/graph.json |

Phase 3（按需，非緊急）：

| 任務 | 複雜度 | 內容 |
|------|--------|------|
| TestCases.md 結構化 | simple | 加 priority/owner 欄位 |
| Node.js syntax smoke check | simple | CI 萃取 .html 內 JS 做語法驗證 |

---

## 五、開發工作流程 SOP（team 上手的 day-1 指南）

### 5.1 收到需求 → 開始開發

1. Lead 讀 issue，cd /Users/cheerc/Projects/classroombooking
2. Complexity 判定：
   - Trivial: 1 檔/≤15行/純文字設定 → inline 描述直接 dispatch
   - Simple: 1-2 檔/無核心邏輯 → inline bullet dispatch
   - Complex+: 3+檔/改 JavaScript.html/改 GAS 後端 →
     用 /graphify 確認 consumer → 寫 plan → commit to main → plan review → dispatch impl
3. 確認 GitHub Issue 存在（Issue-first）

### 5.2 Impl 開發循環

1. Worktree checkout（daemon 管理，from_ref: origin/main）
2. npm ci
3. git branch --show-current（確認非 main）
4. PHP 金鑰複製（僅涉及 classroom_viewer/ 時）
5. 開發（改 *.html / 程式碼.js）
6. ./workflow.sh t6（full run）
7. git commit + gh pr create --base main
   PR body：貼入 ESLint dry run 結果（baseline noise）

### 5.3 Review → Merge → 部署

1. Lead dispatch reviewer（D1/D2/D3 依 Risk-Flags）
2. CI 自動觸發（PR→main）：t1-t5 + PHP lint 全 pass
3. Reviewer VERIFIED
4. Lead merge gate：確認 CI 綠 + VERIFIED → admin-merge PR → main
5. Operator 執行 GAS 部署：
   cd /Users/cheerc/Projects/classroombooking
   git pull origin main
   npm run build（必須在 clasp push 前）
   clasp push
6. 若 PR 涉及 classroom_viewer/*.php：額外手動部署 PHP 到 web server
7. Operator 手動驗收（TestCases.md 相關案例）
8. issue close

---

## 六、Open Questions（待 General 決策）

Q-A：ESLint 相容性
eslint-plugin-html 對 GAS-style IIFE 的相容性未實測。Phase 1 PR 時：
1. impl 先在 source repo 跑 npx eslint --ext .html . dry run
2. 記錄 baseline warnings，貼入 Phase 1 PR body
若相容性問題嚴重 → fallback：只 lint 程式碼.js，.html ESLint 延後。

Q-B：短名稱確認
建議 cb（與 cb-team 一致）。General 確認後 new-project.sh 以此為準。

Q-C：Admin Email 硬編碼
程式碼.js:4 的 ADMIN_EMAIL 已列入 Risk-Flags（HARDCODED_CONFIG）。
建議納入 Phase 2 或單獨 issue。

Q-D：PHP 部署 SOP 詳細化
目前只知道 classroom_viewer/ 要手動部署，具體方式未確認。
Operator/General 提供 PHP hosting 資訊後補完。

---

## 七、General 使用本計畫的 checklist

決策層：
- [ ] 確認第六節 Open Questions（Q-A ESLint + Q-B 短名稱 + Q-D PHP hosting）
- [ ] 確認第四節第一小節 dispatch book 呼叫參數（短名 cb）
- [ ] 決定 Phase 1/2 是否並行或嚴格依序

實施層（agend-customization，General 執行）：
- [ ] bash scripts/new-project.sh cb classroombooking docs/plans main cheerc/classroombooking
- [ ] 填入第三節 A 的值到 dispatch book 4 檔（from_ref=origin/main，Deploy SOP=npm run build && clasp push）
- [ ] 更新 instructions/general.md Projects 表
- [ ] scripts/render-shared.sh --check && --audit
- [ ] Commit + deploy cb-team

指示層（指示 cb-team 執行）：
- [ ] Phase 1：build chain + ESLint config + workflow.sh + CI + structure scripts + plan dir + branch protection
- [ ] Phase 2（Phase 1 驗收後）：graphify

---

## 八、全 team 正反討論摘要

參與者: cb-team-reviewer、cb-team-reviewer2、cb-team-impl（先前 Q1-Q5 已整合）

### 正（Pros）

1. Build chain 標準化是最高 ROI 改動：output.css → Tailwind.html 斷裂終於被自動化，消除 clasp push 過時 CSS 的風險
2. GAS 約束誠實面對：沒有硬塞不適合的自動化（E2E/unit test），符合 GAS 平台現實
3. ESLint 覆蓋完整：--ext .html . 成功將 1443 行的 JavaScript.html 納入靜態檢查
4. Risk-Flags 設計精準：9 項 flags 直接對應 D3 depth trigger，reviewer dispatch 有明確依據

### 反（Cons）

1. 手動部署 SPOF：GAS + PHP 均需 Operator 手動部署，若漏跑 npm run build 會導致 production 漂移
2. ESLint 相容性未實測：Phase 1 PR 可能需要大量 globals 調整（見 Q-A 應對方案）
3. 零自動化功能測試：功能正確性 100% 依賴手動 TestCases.md，未來重構回歸風險較高
4. 單分支模型 plan PR 走 CI：Complex+ 任務 plan commit 到 main 也走 CI（小額開銷，非阻塞）

### 可行動建議（已整合進 plan）

1. Phase 1 PR 必需 ESLint dry run：impl 送 PR 前先跑基準 noise，貼入 PR body
2. check-tailwind.sh 用 hash/diff 比對：比 timestamp 更可靠（reviewer1 建議）
3. 未來可考慮：pre-push hook 驗證 Tailwind.html hash；PHP 部署 rsync/FTP helper script

---

## 附錄：v2 修復記錄（vs v1）

| Finding | 嚴重度 | 修復內容 |
|---------|--------|----------|
| C1 ESLint glob 遺漏 JavaScript.html | CRITICAL | 改為 --ext .html .，掃全目錄所有 .html |
| C2 Phase 1/2 循環相依（CI 含 ESLint 但 config 在 Phase 2） | CRITICAL | ESLint config 移至 Phase 1 |
| C3 Deploy SOP 缺 npm run build | CRITICAL | 所有 Deploy SOP 改為 npm run build && clasp push |
| W4 Preflight 缺 PHP 金鑰複製 | WARNING | IMPL.md preflight 加 PHP credentials 複製步驟 |
| W5 短名稱改 cb | WARNING | new-project.sh 呼叫參數短名改 cb |
| W6 Risk-Flags 不完整 | WARNING | 新增 #9 HARDCODED_CONFIG；#8 擴展為 classroom_viewer/*.php |
| W7 缺 PHP deploy SOP | WARNING | 新增第三節 J PHP 部署 SOP |
| W8 CI 缺 PHP lint | WARNING | CI 加 find classroom_viewer -name *.php -exec php -l |

---

Plan v2 (finalized) by: cb-team-lead
Technical input: cb-team-impl (Q1-Q5), cb-team-reviewer2 (REJECTED → v2 fixes), team discussion (第八節)
Reviewers: cb-team-reviewer (VERIFIED v1+v2 delta), cb-team-reviewer2 (VERIFIED v2)
Status: FINALIZED — ready for commit to main + General review
