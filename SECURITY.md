# 安全政策

## 支援版本

| 版本 | 支援狀態 |
|------|---------|
| 最新版 | ✅ 支援 |

## 回報安全漏洞

如果你發現安全漏洞，**請不要開 public issue**。

請透過以下方式私下回報：

1. **Email**: 寄信至 cheerc@cheerc.com，標題註明 `[SECURITY] classroombooking`
2. 描述漏洞的類型、影響範圍、重現步驟

我們會在 48 小時內回覆確認收到，並在 7 個工作天內提供修復時程。

## 安全最佳實踐

使用本專案時，請確保：

- `config.php`（PHP 檢視器）和 `.clasp.json` 不要提交到 public repo
- Google Service Account Key 檔案妥善保管
- GAS Script Properties 中的機密值不要分享
- 定期檢查 `composer audit` 和 `npm audit`
