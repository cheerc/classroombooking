<?php
/**
 * PHPUnit tests for PHP runtime paths — tag filtering, XSS safety, access control.
 * Ref: #88 — Wave 4B PHP runtime paths
 */

use PHPUnit\Framework\TestCase;

// APP_RUNNING may already be defined by FunctionsTest
if (!defined('APP_RUNNING')) {
    define('APP_RUNNING', true);
}
require_once __DIR__ . '/../functions.php';

class RuntimePathsTest extends TestCase
{
    // ─── filterScheduleByTags ────────────────────────────────────────

    private function makeScheduleData(): array
    {
        return [
            'Room A' => [
                0 => [
                    ['name' => 'Math', 'tags' => ['core', 'math']],
                    ['name' => 'English', 'tags' => ['core', 'language']],
                ],
                1 => [
                    ['name' => 'Art', 'tags' => ['elective']],
                ],
            ],
            'Room B' => [
                0 => [
                    ['name' => 'Science', 'tags' => ['core', 'science']],
                ],
            ],
        ];
    }

    public function testFilterByTagsNoFiltersReturnsOriginal(): void
    {
        $data = $this->makeScheduleData();
        $result = filterScheduleByTags($data, [], []);
        $this->assertEquals($data, $result);
    }

    public function testFilterByTagsIncludeFilter(): void
    {
        $data = $this->makeScheduleData();
        $result = filterScheduleByTags($data, ['math'], []);
        // Only Math course should remain
        $this->assertCount(1, $result);
        $this->assertArrayHasKey('Room A', $result);
        $this->assertCount(1, $result['Room A']); // only day 0
        $this->assertCount(1, $result['Room A'][0]); // only Math
        $this->assertEquals('Math', $result['Room A'][0][0]['name']);
    }

    public function testFilterByTagsExcludeFilter(): void
    {
        $data = $this->makeScheduleData();
        $result = filterScheduleByTags($data, [], ['core']);
        // Only Art (elective) should remain
        $this->assertCount(1, $result);
        $this->assertArrayHasKey('Room A', $result);
        $this->assertCount(1, $result['Room A'][1]); // Art on day 1
        $this->assertEquals('Art', $result['Room A'][1][0]['name']);
    }

    public function testFilterByTagsCombinedIncludeExclude(): void
    {
        $data = $this->makeScheduleData();
        // Include 'core' but exclude 'language' → Math + Science
        $result = filterScheduleByTags($data, ['core'], ['language']);
        $this->assertArrayHasKey('Room A', $result);
        $this->assertArrayHasKey('Room B', $result);
        // Room A day 0: only Math (English excluded)
        $this->assertCount(1, $result['Room A'][0]);
        $this->assertEquals('Math', $result['Room A'][0][0]['name']);
        // Room B: Science
        $this->assertEquals('Science', $result['Room B'][0][0]['name']);
    }

    public function testFilterByTagsAllExcludedReturnsEmpty(): void
    {
        $data = $this->makeScheduleData();
        // Exclude everything
        $result = filterScheduleByTags($data, [], ['core', 'elective']);
        $this->assertEmpty($result);
    }

    public function testFilterByTagsNoMatchingIncludeReturnsEmpty(): void
    {
        $data = $this->makeScheduleData();
        $result = filterScheduleByTags($data, ['nonexistent'], []);
        $this->assertEmpty($result);
    }

    public function testFilterByTagsCourseMissingTagsField(): void
    {
        $data = [
            'Room A' => [
                0 => [
                    ['name' => 'NoTags'], // no 'tags' key
                    ['name' => 'Math', 'tags' => ['math']],
                ],
            ],
        ];
        // Include 'math' — NoTags course excluded (has no tags)
        $result = filterScheduleByTags($data, ['math'], []);
        $this->assertCount(1, $result['Room A'][0]);
        $this->assertEquals('Math', $result['Room A'][0][0]['name']);
    }

    public function testFilterByTagsNonStringTagsFiltered(): void
    {
        // Type guard: non-string tags should be filtered out (prevents array_intersect warning)
        $data = [
            'Room A' => [
                0 => [
                    ['name' => 'Mixed', 'tags' => ['valid', ['nested-array'], 42]],
                ],
            ],
        ];
        // Include 'valid' — should match despite mixed types
        $result = filterScheduleByTags($data, ['valid'], []);
        $this->assertCount(1, $result['Room A'][0]);
        $this->assertEquals('Mixed', $result['Room A'][0][0]['name']);
    }

    public function testFilterByTagsReindexesCourses(): void
    {
        $data = [
            'Room A' => [
                0 => [
                    ['name' => 'A', 'tags' => ['x']],
                    ['name' => 'B', 'tags' => ['y']],
                    ['name' => 'C', 'tags' => ['x']],
                ],
            ],
        ];
        // Include 'x' — B excluded. Results should be re-indexed 0,1 not 0,2
        $result = filterScheduleByTags($data, ['x'], []);
        $courses = $result['Room A'][0];
        $this->assertCount(2, $courses);
        $this->assertEquals('A', $courses[0]['name']);
        $this->assertEquals('C', $courses[1]['name']); // re-indexed
    }

    // ─── jsonEncodeSafe (XSS prevention) ─────────────────────────────

    public function testJsonEncodeSafeEscapesScriptTag(): void
    {
        $data = ['content' => '</script><script>alert(1)</script>'];
        $encoded = jsonEncodeSafe($data);
        $this->assertIsString($encoded);
        // Must NOT contain literal </script>
        $this->assertStringNotContainsString('</script>', $encoded);
        // Must contain hex-escaped version
        $this->assertStringContainsString('\u003C', $encoded);
    }

    public function testJsonEncodeSafeEscapesAmpersand(): void
    {
        $data = ['text' => 'A & B'];
        $encoded = jsonEncodeSafe($data);
        $this->assertStringNotContainsString('&', $encoded);
        $this->assertStringContainsString('\u0026', $encoded);
    }

    public function testJsonEncodeSafeEscapesQuotes(): void
    {
        $data = ['text' => "it's a \"test\""];
        $encoded = jsonEncodeSafe($data);
        $this->assertStringNotContainsString("'", $encoded);
        $this->assertStringContainsString('\u0027', $encoded);
    }

    public function testJsonEncodeSafeRoundtrips(): void
    {
        $data = ['name' => 'Math', 'tags' => ['core', '<b>bold</b>']];
        $encoded = jsonEncodeSafe($data);
        $decoded = json_decode($encoded, true);
        // Should decode back to original data
        $this->assertEquals($data, $decoded);
    }

    public function testJsonEncodeSafeEmptyData(): void
    {
        $this->assertEquals('[]', jsonEncodeSafe([]));
        $this->assertEquals('{}', jsonEncodeSafe(new \stdClass()));
    }
}
