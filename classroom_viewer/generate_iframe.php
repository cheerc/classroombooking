<?php
define('APP_RUNNING', true);
$config = require __DIR__ . '/config.php';

ini_set('display_errors', 0);
error_reporting(E_ALL);

require __DIR__ . '/vendor/autoload.php';

// --- Configuration ---
define('ENCRYPTION_KEY', $config['encryption_key']);
define('ENCRYPTION_CIPHER', 'aes-256-cbc');
$spreadsheetId = $config['spreadsheet_id'];
$keyFilePath = __DIR__ . '/credentials/service-account-key.json';

$all_schedules = [];
$all_tags = [];
$error_message = '';

// --- Data Fetching --- 
try {
    if (!file_exists($keyFilePath)) {
        throw new Exception('Service account key file not found!');
    }
    $client = new Google\Client();
    $client->setApplicationName('Iframe Generator Sheets Reader');
    $client->setScopes([Google\Service\Sheets::SPREADSHEETS_READONLY]);
    $client->setAuthConfig($keyFilePath);
    $service = new Google\Service\Sheets($client);

    // 1. Fetch all non-draft schedules
    $indexRange = 'Data!A:E';
    $indexResponse = $service->spreadsheets_values->get($spreadsheetId, $indexRange);
    $indexValues = $indexResponse->getValues() ?? [];
    
    $non_draft_schedules = [];
    $non_draft_sheet_ids = [];

    foreach (array_slice($indexValues, 1) as $row) { // Skip header row
        // Ref: #6 — Sheets API FORMATTED_VALUE returns booleans as strings "TRUE"/"FALSE"
        if (isset($row[0]) && isset($row[1]) && (!isset($row[4]) || strtoupper(trim($row[4])) !== 'TRUE')) {
            $all_schedules[] = $row[1]; // Schedule Name
            $non_draft_sheet_ids[] = $row[0]; // Schedule ID
        }
    }
    sort($all_schedules);

    // 2. Fetch all tags from non-draft schedules
    if (!empty($non_draft_sheet_ids)) {
        $tag_ranges = [];
        foreach ($non_draft_sheet_ids as $sheetId) {
            $tag_ranges[] = $sheetId . '!B4'; // Cell B4 contains the tags JSON
        }
        $batchGetResponse = $service->spreadsheets_values->batchGet($spreadsheetId, ['ranges' => $tag_ranges]);
        $valueRanges = $batchGetResponse->getValueRanges();

        $tags_set = [];
        foreach ($valueRanges as $valueRange) {
            $dataValues = $valueRange->getValues();
            if (empty($dataValues)) continue;
            $tags_json = $dataValues[0][0] ?? '[]';
            $tags_array = json_decode($tags_json, true);
            if (is_array($tags_array)) {
                foreach ($tags_array as $tag) {
                    $tags_set[$tag] = true;
                }
            }
        }
        $all_tags = array_keys($tags_set);
        sort($all_tags);
    }

} catch (Exception $e) {
    $error_message = '讀取 Google Sheet 資料失敗: ' . $e->getMessage();
}


$generated_iframe = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Form processing logic from before
    $schedule_names_str = $_POST['schedule_name'] ?? '';
    $tags_str = $_POST['tags'] ?? '';
    $exclude_tags_str = $_POST['exclude_tags'] ?? '';

    // Tagify sends data as a JSON string of an array of objects
    $schedule_names = array_map(fn($t) => $t['value'], json_decode($schedule_names_str, true) ?: []);
    $tags = array_map(fn($t) => $t['value'], json_decode($tags_str, true) ?: []);
    $exclude_tags = array_map(fn($t) => $t['value'], json_decode($exclude_tags_str, true) ?: []);

    $iframe_attrs = [
        'class' => $_POST['iframe_class'] ?? 'auto-resize-iframe',
        'id' => $_POST['iframe_id'] ?? 'schedule-iframe',
        'width' => $_POST['iframe_width'] ?? '100%',
        'height' => $_POST['iframe_height'] ?? '100',
        'title' => $_POST['iframe_title'] ?? '課表',
        'style' => $_POST['iframe_style'] ?? 'border: 1px solid #ccc; border-radius: 8px;'
    ];

    $params_to_encrypt = ['schedule_name' => $schedule_names, 'tags' => $tags, 'exclude_tags' => $exclude_tags];
    $json_params = json_encode($params_to_encrypt);

    $ivLength = openssl_cipher_iv_length(ENCRYPTION_CIPHER);
    $iv = openssl_random_pseudo_bytes($ivLength);
    $encrypted_json = openssl_encrypt($json_params, ENCRYPTION_CIPHER, ENCRYPTION_KEY, 0, $iv);
    // Ref: #42 — Encrypt-then-MAC: HMAC-SHA256 over iv+ciphertext for integrity
    $hmac_key = $config['hmac_key'] ?? '';
    $iv_cipher = $iv . $encrypted_json;
    $hmac = hash_hmac('sha256', $iv_cipher, $hmac_key, true); // 32 bytes
    $encrypted_payload = base64_encode($hmac . $iv_cipher);

    $protocol = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? "https" : "http";
    $base_url = $protocol . '://' . $_SERVER['HTTP_HOST'] . dirname($_SERVER['PHP_SELF']) . '/index.php';
    $final_url = $base_url . '?data=' . urlencode($encrypted_payload);

    $iframe_tag = '<iframe src="' . htmlspecialchars($final_url, ENT_QUOTES, 'UTF-8') . '"';
    foreach ($iframe_attrs as $key => $value) {
        $iframe_tag .= ' ' . $key . '="' . htmlspecialchars($value, ENT_QUOTES, 'UTF-8') . '"';
    }
    $iframe_tag .= '></iframe>';
    $generated_iframe = $iframe_tag;
}
?>
<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Iframe 產生器</title>
    <link href="https://cdn.jsdelivr.net/npm/@yaireo/tagify/dist/tagify.css" rel="stylesheet" type="text/css" />
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #f4f7f9; color: #333; line-height: 1.6; margin: 0; padding: 2em; }
        .container { max-width: 800px; margin: 0 auto; background: #fff; padding: 2em; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
        h1, h2 { color: #2c3e50; border-bottom: 2px solid #e0e0e0; padding-bottom: 10px; }
        .form-grid { display: grid; grid-template-columns: 1fr; gap: 20px; }
        .form-group { margin-bottom: 1em; }
        label { display: block; margin-bottom: .5em; font-weight: bold; color: #555; }
        input.tagify-input { width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
        .btn { display: inline-block; background-color: #3498db; color: #fff; padding: 12px 20px; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; text-align: center; text-decoration: none; transition: background-color 0.3s; }
        .btn:hover { background-color: #2980b9; }
        #result-container { margin-top: 2em; background-color: #ecf0f1; padding: 1.5em; border-radius: 5px; position: relative; }
        #result-code { white-space: pre-wrap; word-wrap: break-word; background: #2c3e50; color: #f8f8f2; padding: 1em; border-radius: 4px; }
        #copy-btn { position: absolute; top: 15px; right: 15px; background: #95a5a6; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; }
        #copy-btn:hover { background: #7f8c8d; }
        .error-box { background-color: #fbe9e7; color: #c62828; border: 1px solid #e57373; padding: 1em; border-radius: 4px; margin-bottom: 1em; }
        .tagify{ --tag-bg: #3498db; --tag-hover: #2980b9; --tags-border-color: #ccc; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Iframe 產生器</h1>
        <p>此工具用於生成安全的 iframe 嵌入碼，可從資料庫讀取可用選項，並隱藏原始參數。</p>

        <?php if ($error_message): ?>
            <div class="error-box"><?= htmlspecialchars($error_message, ENT_QUOTES, 'UTF-8') ?></div>
        <?php endif; ?>
        
        <form action="" method="POST">
            <h2>課表篩選參數</h2>
            <div class="form-grid">
                <div class="form-group">
                    <label for="schedule_name">課表名稱 (schedule_name)</label>
                    <input type="text" id="schedule_name" name="schedule_name" class="tagify-input" value='<?= htmlspecialchars($_POST['schedule_name'] ?? '', ENT_QUOTES, 'UTF-8') ?>' required>
                </div>
                <div class="form-group">
                    <label for="tags">包含標籤 (tags)</label>
                    <input type="text" id="tags" name="tags" class="tagify-input" value='<?= htmlspecialchars($_POST['tags'] ?? '', ENT_QUOTES, 'UTF-8') ?>'>
                </div>
                <div class="form-group">
                    <label for="exclude_tags">排除標籤 (exclude_tags)</label>
                    <input type="text" id="exclude_tags" name="exclude_tags" class="tagify-input" value='<?= htmlspecialchars($_POST['exclude_tags'] ?? '', ENT_QUOTES, 'UTF-8') ?>'>
                </div>
            </div>

            <h2>Iframe 屬性 (選填)</h2>
            <div class="form-grid" style="grid-template-columns: 1fr 1fr; gap: 20px;">
                <div class="form-group">
                    <label for="iframe_title">標題 (title)</label>
                    <input type="text" id="iframe_title" name="iframe_title" value="<?= htmlspecialchars($_POST['iframe_title'] ?? '課表', ENT_QUOTES, 'UTF-8') ?>">
                </div>
                <div class="form-group">
                    <label for="iframe_id">ID</label>
                    <input type="text" id="iframe_id" name="iframe_id" value="<?= htmlspecialchars($_POST['iframe_id'] ?? 'schedule-iframe', ENT_QUOTES, 'UTF-8') ?>">
                </div>
            </div>

            <button type="submit" class="btn">產生 Iframe 程式碼</button>
        </form>

        <?php if (!empty($generated_iframe)): ?>
        <div id="result-container">
            <h2>產生的程式碼</h2>
            <button id="copy-btn">複製</button>
            <pre><code id="result-code"><?= htmlspecialchars($generated_iframe, ENT_QUOTES, 'UTF-8') ?></code></pre>
        </div>
        <?php endif; ?>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/@yaireo/tagify"></script>
    <script>
        const allSchedules = <?= json_encode($all_schedules) ?>;
        const allTags = <?= json_encode($all_tags) ?>;

        // Helper to initialize Tagify
        function initTagify(selector, whitelist) {
            const input = document.querySelector(selector);
            if (input) {
                new Tagify(input, {
                    whitelist: whitelist,
                    dropdown: {
                        maxItems: 20,
                        enabled: 0, // Show suggestion list on focus
                        closeOnSelect: false
                    }
                });
            }
        }

        initTagify('input[name="schedule_name"]', allSchedules);
        initTagify('input[name="tags"]', allTags);
        initTagify('input[name="exclude_tags"]', allTags);

        const copyBtn = document.getElementById('copy-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                const codeToCopy = document.getElementById('result-code').textContent;
                navigator.clipboard.writeText(codeToCopy).then(() => {
                    copyBtn.textContent = '已複製!';
                    setTimeout(() => {
                        copyBtn.textContent = '複製';
                    }, 2000);
                }).catch(err => {
                    console.error('複製失敗: ', err);
                    alert('複製失敗');
                });
            });
        }
    </script>
</body>
</html>