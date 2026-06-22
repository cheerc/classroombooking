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
    // Ref: #67.1 — 預設 false：除非仍有未更新的 iframe URL，否則應關閉舊格式支援。
    'allow_legacy_payloads' => false,

    // CSP 允許的主機名（frame-ancestors + postMessage target origin）
    'csp_domain' => 'your-domain.com',

    // Ref: #37 — generate_iframe.php 存取 token（防止未授權的 iframe 產生）
    'access_token' => 'YOUR_RANDOM_ACCESS_TOKEN_HERE',
];
