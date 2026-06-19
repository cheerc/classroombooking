<?php
// Ref: #50 — AES-256-CBC encryption round-trip test validating the same
// encrypt/decrypt pattern used in classroom_viewer/index.php (L148-164).

use PHPUnit\Framework\TestCase;

class EncryptionTest extends TestCase
{
    private const CIPHER = 'aes-256-cbc';
    private string $key;

    protected function setUp(): void
    {
        $this->key = 'test-key-for-unit-testing-only-32bytes!';
    }

    public function testEncryptDecryptRoundTrip(): void
    {
        $original = json_encode([
            'schedule_name' => ['Test Schedule'],
            'tags' => ['A'],
            'exclude_tags' => [],
        ]);
        $ivLen = openssl_cipher_iv_length(self::CIPHER);
        $iv = openssl_random_pseudo_bytes($ivLen);
        $encrypted = openssl_encrypt($original, self::CIPHER, $this->key, 0, $iv);
        $payload = base64_encode($iv . $encrypted);

        // Decrypt — mirrors index.php L158-164
        $decoded = base64_decode($payload);
        $extractedIv = substr($decoded, 0, $ivLen);
        $extractedCipher = substr($decoded, $ivLen);
        $decrypted = openssl_decrypt($extractedCipher, self::CIPHER, $this->key, 0, $extractedIv);

        $this->assertJsonStringEqualsJsonString($original, $decrypted);
    }

    public function testDifferentPayloadsProduceDifferentCiphertext(): void
    {
        $ivLen = openssl_cipher_iv_length(self::CIPHER);

        $iv1 = openssl_random_pseudo_bytes($ivLen);
        $enc1 = openssl_encrypt('payload1', self::CIPHER, $this->key, 0, $iv1);

        $iv2 = openssl_random_pseudo_bytes($ivLen);
        $enc2 = openssl_encrypt('payload2', self::CIPHER, $this->key, 0, $iv2);

        // Different IVs + different plaintext → different ciphertext
        $this->assertNotEquals(base64_encode($iv1 . $enc1), base64_encode($iv2 . $enc2));
    }

    public function testInvalidPayloadReturnsFailure(): void
    {
        $result = openssl_decrypt('garbage', self::CIPHER, $this->key, 0, str_repeat("\0", 16));
        $this->assertFalse($result);
    }

    public function testWrongKeyFailsDecryption(): void
    {
        $original = 'test data';
        $ivLen = openssl_cipher_iv_length(self::CIPHER);
        $iv = openssl_random_pseudo_bytes($ivLen);
        $encrypted = openssl_encrypt($original, self::CIPHER, $this->key, 0, $iv);

        // Decrypt with wrong key
        $wrongKey = 'wrong-key-for-testing-wrong-key-32byt!';
        $result = openssl_decrypt($encrypted, self::CIPHER, $wrongKey, 0, $iv);

        $this->assertNotEquals($original, $result);
    }
}
