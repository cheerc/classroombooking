<?php
/**
 * classroombooking viewer — 配置檔範本
 *
 * 複製此檔為 config.php 並填入實際值：
 *   cp config.example.php config.php
 *
 * config.php 已被 .gitignore 排除，不會被 commit。
 */

defined('APP_RUNNING') or die('Direct access not allowed.');

return [
    // Google Spreadsheet ID（從 Sheets URL 中取得）
    'spreadsheet_id' => 'YOUR_SPREADSHEET_ID',

    // AES-256 加密金鑰（用於 iframe URL 參數加解密）
    'encryption_key' => 'YOUR_ENCRYPTION_KEY',

    // Ref: #42 — HMAC 金鑰（用於 encrypt-then-MAC 完整性驗證）
    'hmac_key' => 'YOUR_HMAC_KEY_HERE',

    // 過渡期允許舊格式（無 HMAC）的 payload。
    // 部署後先設為 true，待所有 iframe URL 更新後改為 false。
    'allow_legacy_payloads' => true,

    // CSP 允許的主機名（frame-ancestors）
    'csp_domain' => 'your-domain.com',
];
