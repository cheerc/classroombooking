<?php
/**
 * PHPUnit tests for pure helper functions extracted from index.php.
 * Ref: #61 — Wave 2 test coverage expansion
 */

use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../functions.php';

class FunctionsTest extends TestCase
{
    // ─── sortClassrooms ──────────────────────────────────────────────

    public function testSortClassroomsByHundredsDescending(): void
    {
        $classrooms = ['Room 101', 'Room 301', 'Room 201'];
        $sorted = sortClassrooms($classrooms);
        $this->assertEquals(['Room 301', 'Room 201', 'Room 101'], $sorted);
    }

    public function testSortClassroomsWithinSameHundred(): void
    {
        // Within same hundreds group, sort by remainder ascending
        $classrooms = ['Room 205', 'Room 201', 'Room 203'];
        $sorted = sortClassrooms($classrooms);
        $this->assertEquals(['Room 201', 'Room 203', 'Room 205'], $sorted);
    }

    public function testSortClassroomsEmptyArray(): void
    {
        $result = sortClassrooms([]);
        $this->assertEquals([], $result);
    }

    public function testSortClassroomsMixedFormats(): void
    {
        // Names with no digits get 0 → hundreds=0
        $classrooms = ['Lab', 'Room 302', 'Room 101'];
        $sorted = sortClassrooms($classrooms);
        // 302 (hundreds=3) first, then 101 (hundreds=1), then Lab (hundreds=0)
        $this->assertEquals(['Room 302', 'Room 101', 'Lab'], $sorted);
    }

    // ─── stringToHashCode ────────────────────────────────────────────

    public function testStringToHashCodeDeterministic(): void
    {
        $hash1 = stringToHashCode('Math');
        $hash2 = stringToHashCode('Math');
        $this->assertEquals($hash1, $hash2);
    }

    public function testStringToHashCodeDifferentStrings(): void
    {
        $hash1 = stringToHashCode('Math');
        $hash2 = stringToHashCode('English');
        $this->assertNotEquals($hash1, $hash2);
    }

    public function testStringToHashCodeEmptyString(): void
    {
        $hash = stringToHashCode('');
        // DJB2 with empty string returns initial value 5381
        $this->assertEquals(5381, $hash);
    }

    public function testStringToHashCodeChinese(): void
    {
        $hash = stringToHashCode('數學');
        $this->assertIsNumeric($hash);
        // Deterministic
        $this->assertEquals(stringToHashCode('數學'), $hash);
    }

    // ─── buildCourseColorMap ─────────────────────────────────────────

    public function testBuildCourseColorMapEmptyData(): void
    {
        $result = buildCourseColorMap([], ['#ff0000', '#00ff00']);
        $this->assertEquals([], $result);
    }

    public function testBuildCourseColorMapAssignsColors(): void
    {
        $palette = ['#93c5fd', '#73EEDC', '#DBF4A7', '#fca5a5'];
        $scheduleData = [
            'Room1' => [
                1 => [
                    ['name' => 'Math'],
                    ['name' => 'English'],
                ],
            ],
        ];
        $colorMap = buildCourseColorMap($scheduleData, $palette);

        $this->assertArrayHasKey('Math', $colorMap);
        $this->assertArrayHasKey('English', $colorMap);
        // Colors should be from the palette
        $this->assertContains($colorMap['Math'], $palette);
        $this->assertContains($colorMap['English'], $palette);
    }

    public function testBuildCourseColorMapSameCourseSameColor(): void
    {
        $palette = ['#aaa', '#bbb', '#ccc'];
        $scheduleData = [
            'Room1' => [
                1 => [['name' => 'Math']],
                2 => [['name' => 'Math']], // Same course, different day
            ],
        ];
        $colorMap = buildCourseColorMap($scheduleData, $palette);

        // Math should appear only once in the map
        $this->assertCount(1, $colorMap);
        $this->assertArrayHasKey('Math', $colorMap);
    }

    public function testBuildCourseColorMapDeterministic(): void
    {
        $palette = ['#aaa', '#bbb', '#ccc', '#ddd'];
        $scheduleData = [
            'Room1' => [
                1 => [['name' => 'Math'], ['name' => 'English']],
            ],
        ];
        // Run twice — should produce identical results
        $map1 = buildCourseColorMap($scheduleData, $palette);
        $map2 = buildCourseColorMap($scheduleData, $palette);
        $this->assertEquals($map1, $map2);
    }

    public function testBuildCourseColorMapSkipsInvalidEntries(): void
    {
        $palette = ['#aaa', '#bbb'];
        $scheduleData = [
            'Room1' => [
                1 => [
                    ['name' => 'Math'],
                    ['teacher' => 'only teacher, no name'], // no 'name' key
                    ['name' => 123], // name is not string
                ],
            ],
        ];
        $colorMap = buildCourseColorMap($scheduleData, $palette);

        // Only 'Math' should be in the map
        $this->assertCount(1, $colorMap);
        $this->assertArrayHasKey('Math', $colorMap);
    }
}
