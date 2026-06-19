# 貢獻指南

感謝你對教室課表管理系統的興趣！以下是參與貢獻的指南。

## 回報 Bug

1. 先搜尋 [Issues](https://github.com/cheerc/classroombooking/issues) 確認是否已有相同問題
2. 使用 Bug Report 模板建立新 issue
3. 提供：重現步驟、預期行為、實際行為、螢幕截圖（如適用）

## 提交 Pull Request

1. Fork 此 repo
2. 建立 feature branch：`git checkout -b feat/your-feature`
3. 確保通過驗證：`./workflow.sh t6`
4. Commit 使用 [Conventional Commits](https://www.conventionalcommits.org/) 格式：
   - `feat:` 新功能
   - `fix:` 修復
   - `docs:` 文件
   - `refactor:` 重構
   - `chore:` 雜務
5. Push 並建立 PR

## 開發環境

```bash
npm install
npm run build
```

## 程式碼風格

- JavaScript：遵循 ESLint 設定（`.eslintrc.json`）
- GAS 後端：`npx eslint 程式碼.js`
- 前端 HTML：`npx eslint --ext .html .`
- PHP：標準 PSR-12

## 注意事項

- **不要** 在程式碼中硬編碼機密資訊（API key、email、密碼等）
- GAS 設定使用 `PropertiesService`，PHP 使用 `config.php`
- PR 必須通過 `workflow.sh t6` 驗證
- 涉及 `程式碼.js` 的變更請附上手動測試步驟

## 問題？

歡迎在 Issues 中提問，或參考 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 了解系統架構。
