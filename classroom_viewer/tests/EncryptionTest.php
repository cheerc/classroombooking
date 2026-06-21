<?php
// Ref: #50, #42 — AES-256-CBC encryption tests with HMAC (encrypt-then-MAC).
// Validates the same encrypt/decrypt pattern used in generate_iframe.php and index.php.

use PHPUnit\Framework\TestCase;

class EncryptionTest extends TestCase
{
    private const CIPHER = 'aes-256-cbc';
    private string $key;
    private string $hmacKey;

    protected function setUp(): void
    {
        $this->key = 'test-key-for-unit-testing-only-32bytes!';
        $this->hmacKey = 'test-hmac-key-for-unit-testing-only!!';
    }

    // --- Legacy format tests (no HMAC) ---

    public function testLegacyEncryptDecryptRoundTrip(): void
    {
        $original = json_encode(['schedule_name' => ['Test'], 'tags' => ['A'], 'exclude_tags' => []]);
        $ivLen = openssl_cipher_iv_length(self::CIPHER);
        $iv = openssl_random_pseudo_bytes($ivLen);
        $encrypted = openssl_encrypt($original, self::CIPHER, $this->key, 0, $iv);
        $payload = base64_encode($iv . $encrypted);

        // Decrypt legacy format
        $decoded = base64_decode($payload);
        $extractedIv = substr($decoded, 0, $ivLen);
        $extractedCipher = substr($decoded, $ivLen);
        $decrypted = openssl_decrypt($extractedCipher, self::CIPHER, $this->key, 0, $extractedIv);

        $this->assertJsonStringEqualsJsonString($original, $decrypted);
    }

    public function testInvalidPayloadReturnsFailure(): void
    {
        $result = openssl_decrypt('garbage', self::CIPHER, $this->key, 0, str_repeat("\0", 16));
        $this->assertFalse($result);
    }

    // --- HMAC format tests ---

    public function testHmacEncryptDecryptRoundTrip(): void
    {
        $original = json_encode(['schedule_name' => ['Test'], 'tags' => ['A'], 'exclude_tags' => []]);
        $ivLen = openssl_cipher_iv_length(self::CIPHER);
        $iv = openssl_random_pseudo_bytes($ivLen);
        $encrypted = openssl_encrypt($original, self::CIPHER, $this->key, 0, $iv);

        // Encrypt-then-MAC (same as generate_iframe.php)
        $iv_cipher = $iv . $encrypted;
        $hmac = hash_hmac('sha256', $iv_cipher, $this->hmacKey, true);
        $payload = base64_encode($hmac . $iv_cipher);

        // Decrypt with HMAC verification (same as index.php)
        $decoded = base64_decode($payload);
        $hmacLen = 32;
        $receivedHmac = substr($decoded, 0, $hmacLen);
        $iv_cipher_extracted = substr($decoded, $hmacLen);
        $expectedHmac = hash_hmac('sha256', $iv_cipher_extracted, $this->hmacKey, true);

        $this->assertTrue(hash_equals($expectedHmac, $receivedHmac), 'HMAC verification should pass');

        $extractedIv = substr($iv_cipher_extracted, 0, $ivLen);
        $extractedCipher = substr($iv_cipher_extracted, $ivLen);
        $decrypted = openssl_decrypt($extractedCipher, self::CIPHER, $this->key, 0, $extractedIv);

        $this->assertJsonStringEqualsJsonString($original, $decrypted);
    }

    public function testTamperedPayloadFailsHmacVerification(): void
    {
        $original = 'test data';
        $ivLen = openssl_cipher_iv_length(self::CIPHER);
        $iv = openssl_random_pseudo_bytes($ivLen);
        $encrypted = openssl_encrypt($original, self::CIPHER, $this->key, 0, $iv);

        $iv_cipher = $iv . $encrypted;
        $hmac = hash_hmac('sha256', $iv_cipher, $this->hmacKey, true);
        $payload = base64_encode($hmac . $iv_cipher);

        // Tamper with the payload (flip a byte in the ciphertext area)
        $decoded = base64_decode($payload);
        $tampered = $decoded;
        $tampered[40] = chr(ord($tampered[40]) ^ 0xFF); // flip a byte after HMAC+IV

        $receivedHmac = substr($tampered, 0, 32);
        $iv_cipher_tampered = substr($tampered, 32);
        $expectedHmac = hash_hmac('sha256', $iv_cipher_tampered, $this->hmacKey, true);

        $this->assertFalse(hash_equals($expectedHmac, $receivedHmac), 'HMAC should fail for tampered payload');
    }

    public function testLegacyPayloadFallbackWhenAllowed(): void
    {
        // Create a legacy payload (no HMAC)
        $original = json_encode(['schedule_name' => ['Test']]);
        $ivLen = openssl_cipher_iv_length(self::CIPHER);
        $iv = openssl_random_pseudo_bytes($ivLen);
        $encrypted = openssl_encrypt($original, self::CIPHER, $this->key, 0, $iv);
        $legacyPayload = base64_encode($iv . $encrypted);

        // Simulate index.php decryption logic with allow_legacy=true
        $decoded = base64_decode($legacyPayload);
        $hmacLen = 32;
        $decryptedJson = false;

        // Try HMAC format first
        if (strlen($decoded) > $hmacLen + $ivLen) {
            $receivedHmac = substr($decoded, 0, $hmacLen);
            $iv_cipher = substr($decoded, $hmacLen);
            $expectedHmac = hash_hmac('sha256', $iv_cipher, $this->hmacKey, true);
            if (hash_equals($expectedHmac, $receivedHmac)) {
                $extractedIv = substr($iv_cipher, 0, $ivLen);
                $extractedCipher = substr($iv_cipher, $ivLen);
                $decryptedJson = openssl_decrypt($extractedCipher, self::CIPHER, $this->key, 0, $extractedIv);
            }
        }

        // Fallback to legacy (allow_legacy=true)
        if ($decryptedJson === false) {
            $extractedIv = substr($decoded, 0, $ivLen);
            $extractedCipher = substr($decoded, $ivLen);
            $decryptedJson = openssl_decrypt($extractedCipher, self::CIPHER, $this->key, 0, $extractedIv);
        }

        $this->assertNotFalse($decryptedJson, 'Legacy payload should be decryptable as fallback');
        $this->assertJsonStringEqualsJsonString($original, $decryptedJson);
    }

    public function testWrongKeyFailsDecryption(): void
    {
        $original = 'test data';
        $ivLen = openssl_cipher_iv_length(self::CIPHER);
        $iv = openssl_random_pseudo_bytes($ivLen);
        $encrypted = openssl_encrypt($original, self::CIPHER, $this->key, 0, $iv);

        $wrongKey = 'wrong-key-for-testing-wrong-key-32byt!';
        $result = openssl_decrypt($encrypted, self::CIPHER, $wrongKey, 0, $iv);

        // Ref: #60 — openssl_decrypt returns false on failure, not a different string
        $this->assertFalse($result);
    }
}
