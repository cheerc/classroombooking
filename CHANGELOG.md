# Changelog

## [6.8.2] — 2026-07-20

### Added
- 週檢視時間軸模式（#163）— 以時間軸排列顯示當週課程，支援橫向捲動與時段視覺化

### Changed
- 移除已退役的 Graphify ignore 規則（#161）

### Fixed
- 複製到課程後重新渲染課表（#154）

## [6.8.1] — 2026-07-19

### Changed
- 簡化權限模型：所有已登入使用者皆可編輯（#152）
- IIFE 模組提取 Phase 1（#145–#151）：拆解 JavaScript.html 為 7 個獨立模組（UtilityFunctions、LockManager、DataCollection、FilterEngine、DataIO、ScheduleManager、PDFExport）

### Fixed
- 多項測試覆蓋率補齊與 ratchet（#107、#136、#141、#143）

## [6.8.0] — 2026-07-18

### Added
- 測試基礎建設 Phase 1：Vitest + GAS mock + CI coverage gate（#48、#50、#51）
- 結構驗證（check-structure.sh）與 Tailwind 一致性檢查（check-tailwind.sh）

### Security
- 修復 innerHTML 使用者資料注入 XSS（#36）
- JSON parse error 統一回傳格式（#35）
- 多項安全性強化（#41、#42、#43）

### Fixed
- HIGH bugs 修復（#4、#38、#39）
- 效能與程式碼品質改善（#45、#46、#47）
- 每筆課表歷史限制取代全域截斷（#34）

## [6.7.3] — 2026-06-30

- 應用程式版本號更新

## [6.7.1] — 2026-06-28

- 新增編輯教室名稱功能
- 修復新增標籤後篩選列表未即時更新

## [6.6.9] — 2026-06-25

- 週檢視預設排序改為依教室

## [6.6.6] — 2026-06-22

- 調整課表選單樣式

## [6.6.4] — 2026-06-20

- 全面同步標籤狀態與篩選器

## 更早版本

6.5.3 以前版本詳見 git log (`git log --oneline -- Config.js.html`)。
