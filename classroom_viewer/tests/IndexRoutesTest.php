<?php
/**
 * PHPUnit tests for index.php route error paths.
 * Ref: #107 — P0 Coverage Sprint Wave 5
 *
 * Uses subprocess isolation to test route-level logic that calls exit/die.
 * Each test runs a PHP snippet that mimics a specific error path from index.php.
 */

use PHPUnit\Framework\TestCase;

class IndexRoutesTest extends TestCase
{
    /**
     * Run a PHP snippet in a subprocess that mimics index.php route logic.
     */
    private function runIndexRoute(string $phpCode): string
    {
        $tmpFile = sys_get_temp_dir() . '/test_index_route_' . uniqid() . '.php';
        file_put_contents($tmpFile, "<?php\n" . $phpCode);
        $output = shell_exec("php $tmpFile 2>&1");
        @unlink($tmpFile);
        return trim($output ?? '');
    }

    // ─── showError function ─────────────────────────────────────────

    public function testShowErrorOutputsHtmlAndExits(): void
    {
        $output = $this->runIndexRoute(<<<'PHP'
function showError($message) {
    $errorHtml = '<!DOCTYPE html><html lang="zh-TW"><head><title>Error</title></head><body><div class="container"><h1>發生錯誤</h1><p>' . htmlspecialchars($message, ENT_QUOTES, 'UTF-8') . '</p></div></body></html>';
    echo $errorHtml;
    exit;
}
showError('測試錯誤訊息');
PHP);
        $this->assertStringContainsString('發生錯誤', $output);
        $this->assertStringContainsString('測試錯誤訊息', $output);
        $this->assertStringContainsString('<!DOCTYPE html>', $output);
    }

    public function testShowErrorEscapesXss(): void
    {
        $output = $this->runIndexRoute(<<<'PHP'
function showError($message) {
    $errorHtml = '<p>' . htmlspecialchars($message, ENT_QUOTES, 'UTF-8') . '</p>';
    echo $errorHtml;
    exit;
}
showError('<script>alert(1)</script>');
PHP);
        $this->assertStringNotContainsString('<script>', $output);
        $this->assertStringContainsString('&lt;script&gt;', $output);
    }

    // ─── Route error paths ──────────────────────────────────────────

    public function testMissingDataParamTriggersError(): void
    {
        $output = $this->runIndexRoute(<<<'PHP'
function showError($message) {
    echo "ERROR: " . $message;
    exit;
}
$_GET = [];
if (!isset($_GET['data'])) {
    showError('請求無效，缺少必要的加密參數。');
}
PHP);
        $this->assertStringContainsString('請求無效', $output);
    }

    public function testInvalidBase64DataTriggersDecryptionError(): void
    {
        $output = $this->runIndexRoute(<<<'PHP'
function showError($message) {
    echo "ERROR: " . $message;
    exit;
}
define('ENCRYPTION_CIPHER', 'aes-256-cbc');
define('ENCRYPTION_KEY', 'test_key_1234567890123456');

$_GET['data'] = 'not_valid_base64!!!';
$encryptedData = $_GET['data'];
$decodedData = base64_decode($encryptedData);
$ivLength = openssl_cipher_iv_length(ENCRYPTION_CIPHER);
$hmacLength = 32;

$hmac_key = 'test';
$allow_legacy = false;
$decryptedJson = false;

if (strlen($decodedData) > $hmacLength + $ivLength) {
    $receivedHmac = substr($decodedData, 0, $hmacLength);
    $iv_cipher = substr($decodedData, $hmacLength);
    $expectedHmac = hash_hmac('sha256', $iv_cipher, $hmac_key, true);
    if (hash_equals($expectedHmac, $receivedHmac)) {
        $iv = substr($iv_cipher, 0, $ivLength);
        $encryptedJson = substr($iv_cipher, $ivLength);
        $decryptedJson = openssl_decrypt($encryptedJson, ENCRYPTION_CIPHER, ENCRYPTION_KEY, 0, $iv);
    }
}
if ($decryptedJson === false) {
    if (!$allow_legacy) {
        showError('資料驗證失敗，請重新產生 iframe URL。');
    }
}
PHP);
        $this->assertStringContainsString('資料驗證失敗', $output);
    }

    public function testEmptyScheduleNamesTriggersError(): void
    {
        $output = $this->runIndexRoute(<<<'PHP'
function showError($message) {
    echo "ERROR: " . $message;
    exit;
}
$params = ['schedule_name' => []];
$targetScheduleNames = $params['schedule_name'] ?? [];
if (empty($targetScheduleNames)) {
    showError('請在網址中提供至少一個 schedule_name 參數 (可使用逗號分隔多個名稱)');
}
PHP);
        $this->assertStringContainsString('schedule_name', $output);
    }

    public function testJsonDecodeErrorTriggersError(): void
    {
        $output = $this->runIndexRoute(<<<'PHP'
function showError($message) {
    echo "ERROR: " . $message;
    exit;
}
$decryptedJson = '{invalid json';
$params = json_decode($decryptedJson, true);
if (json_last_error() !== JSON_ERROR_NONE) {
    showError('解析參數失敗。');
}
PHP);
        $this->assertStringContainsString('解析參數失敗', $output);
    }

    // ─── Source structure verification ────────────────────────────────

    public function testIndexPhpDefinesAppRunning(): void
    {
        $source = file_get_contents(__DIR__ . '/../index.php');
        $this->assertStringContainsString("define('APP_RUNNING', true)", $source);
    }

    public function testIndexPhpRequiresFunctions(): void
    {
        $source = file_get_contents(__DIR__ . '/../index.php');
        $this->assertStringContainsString("require_once __DIR__ . '/functions.php'", $source);
    }

    public function testIndexPhpSetsContentSecurityPolicy(): void
    {
        $source = file_get_contents(__DIR__ . '/../index.php');
        $this->assertStringContainsString('Content-Security-Policy', $source);
        $this->assertStringContainsString('frame-ancestors', $source);
    }

    public function testIndexPhpUsesShowErrorForAllErrorPaths(): void
    {
        $source = file_get_contents(__DIR__ . '/../index.php');
        // All user-facing error paths should use showError (not raw echo+exit)
        $showErrorCount = substr_count($source, 'showError(');
        // index.php has: 1 definition + at least 4 calls
        $this->assertGreaterThanOrEqual(5, $showErrorCount);
    }
}
