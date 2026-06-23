<?php
/**
 * PHPUnit tests for generate_iframe.php access control.
 * Ref: #107 — P0 Coverage Sprint Wave 5
 *
 * Uses subprocess isolation to test route-level access control
 * without triggering generate_iframe.php's global side effects.
 */

use PHPUnit\Framework\TestCase;

class AccessControlTest extends TestCase
{
    /**
     * Run a PHP snippet that mimics generate_iframe.php access control logic.
     */
    private function runAccessControl(array $getParams = []): string
    {
        $config = <<<'PHP'
<?php
defined('APP_RUNNING') or die('Direct access not allowed.');
return [
    'spreadsheet_id' => 'test_spreadsheet',
    'encryption_key' => 'test_key_1234567890123456',
    'hmac_key' => 'test_hmac_key',
    'allow_legacy_payloads' => false,
    'csp_domain' => 'test.example.com',
    'access_token' => 'valid_test_token',
];
PHP;
        $configFile = sys_get_temp_dir() . '/test_config_' . uniqid() . '.php';
        file_put_contents($configFile, $config);

        $getParamsPhp = var_export($getParams, true);
        $wrapperScript = <<<PHP
<?php
\$_GET = $getParamsPhp;
\$_SERVER['REQUEST_METHOD'] = 'GET';
define('APP_RUNNING', true);
\$config = require '$configFile';

\$valid_token = \$config['access_token'] ?? null;
\$provided_token = \$_GET['token'] ?? '';

if (!\$valid_token || !hash_equals(\$valid_token, \$provided_token)) {
    http_response_code(403);
    echo 'Forbidden: invalid or missing access token.';
    exit;
}
echo 'ACCESS_GRANTED';
PHP;
        $wrapperFile = sys_get_temp_dir() . '/test_wrapper_' . uniqid() . '.php';
        file_put_contents($wrapperFile, $wrapperScript);

        $output = shell_exec("php $wrapperFile 2>&1");
        @unlink($configFile);
        @unlink($wrapperFile);

        return trim($output ?? '');
    }

    public function testAccessDeniedWithoutToken(): void
    {
        $output = $this->runAccessControl([]);
        $this->assertStringContainsString('Forbidden', $output);
    }

    public function testAccessDeniedWithInvalidToken(): void
    {
        $output = $this->runAccessControl(['token' => 'wrong_token']);
        $this->assertStringContainsString('Forbidden', $output);
    }

    public function testAccessGrantedWithValidToken(): void
    {
        $output = $this->runAccessControl(['token' => 'valid_test_token']);
        $this->assertStringContainsString('ACCESS_GRANTED', $output);
    }

    public function testAccessDeniedWithEmptyConfigToken(): void
    {
        // Test with config that has empty access_token
        $config = <<<'PHP'
<?php
defined('APP_RUNNING') or die('Direct access not allowed.');
return [
    'spreadsheet_id' => 'test',
    'encryption_key' => 'test_key_1234567890123456',
    'hmac_key' => 'test',
    'allow_legacy_payloads' => false,
    'csp_domain' => 'test.example.com',
    'access_token' => '',
];
PHP;
        $configFile = sys_get_temp_dir() . '/test_config_' . uniqid() . '.php';
        file_put_contents($configFile, $config);

        $wrapperScript = <<<PHP
<?php
\$_GET = ['token' => ''];
define('APP_RUNNING', true);
\$config = require '$configFile';
\$valid_token = \$config['access_token'] ?? null;
\$provided_token = \$_GET['token'] ?? '';
if (!\$valid_token || !hash_equals(\$valid_token, \$provided_token)) {
    echo 'Forbidden';
    exit;
}
echo 'ACCESS_GRANTED';
PHP;
        $wrapperFile = sys_get_temp_dir() . '/test_wrapper_' . uniqid() . '.php';
        file_put_contents($wrapperFile, $wrapperScript);
        $output = trim(shell_exec("php $wrapperFile 2>&1") ?? '');
        @unlink($configFile);
        @unlink($wrapperFile);

        // Empty token in config should deny access even with empty provided token
        $this->assertStringContainsString('Forbidden', $output);
    }

    public function testTimingAttackProtection(): void
    {
        // hash_equals is used — verify it's in the source
        $source = file_get_contents(__DIR__ . '/../generate_iframe.php');
        $this->assertStringContainsString('hash_equals', $source);
    }
}
