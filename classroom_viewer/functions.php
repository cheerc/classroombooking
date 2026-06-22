<?php
defined('APP_RUNNING') or die('Direct access not allowed.');
/**
 * Pure helper functions extracted from index.php for testability.
 * Ref: #61 — Wave 2 test coverage expansion
 */

/**
 * Sorts classrooms by hundreds digit (descending) then remainder (ascending).
 * @param array $classrooms Array of classroom name strings
 * @return array Sorted array
 */
function sortClassrooms($classrooms) {
    usort($classrooms, function($a, $b) {
        preg_match('/\d+/', $a, $numA);
        preg_match('/\d+/', $b, $numB);
        $numA = isset($numA[0]) ? (int)$numA[0] : 0;
        $numB = isset($numB[0]) ? (int)$numB[0] : 0;
        $hundredsA = floor($numA / 100);
        $hundredsB = floor($numB / 100);
        if ($hundredsA !== $hundredsB) {
            return $hundredsB - $hundredsA;
        }
        return ($numA % 100) - ($numB % 100);
    });
    return $classrooms;
}

/**
 * Computes a hash code for a string (DJB2 algorithm).
 * @param string $str Input string
 * @return float Hash value (may exceed PHP_INT_MAX, so float)
 */
function stringToHashCode($str) {
    $hash = 5381;
    $length = strlen($str);
    for ($i = 0; $i < $length; $i++) {
        $hash = ($hash * 33) + ord($str[$i]);
    }
    return $hash;
}

/**
 * Builds a deterministic color map for course names using DJB2 hash.
 * @param array $scheduleData Nested schedule data [classroom => [day => [courses]]]
 * @param array $colorPalette Array of color hex strings
 * @return array Map of course name => color hex
 */
function buildCourseColorMap($scheduleData, $colorPalette) {
    $colorMap = [];
    $uniqueNames = [];
    if (empty($scheduleData)) return [];

    foreach ($scheduleData as $days) {
        if (!is_array($days)) continue;
        foreach ($days as $courses) {
            if (!is_array($courses)) continue;
            foreach ($courses as $course) {
                if (isset($course['name']) && is_string($course['name']) && !in_array($course['name'], $uniqueNames)) {
                    $uniqueNames[] = $course['name'];
                }
            }
        }
    }
    sort($uniqueNames);
    foreach ($uniqueNames as $name) {
        $hash = stringToHashCode($name);
        // Use fmod() for modulo on large numbers (floats) to avoid precision loss
        $colorIndex = (int) fmod(abs($hash), count($colorPalette));
        $colorMap[$name] = $colorPalette[$colorIndex];
    }
    return $colorMap;
}

/**
 * Filters schedule data by include/exclude tag lists.
 * Extracted from index.php L249-275 for testability.
 * Ref: #88 — PHP runtime paths
 *
 * @param array $scheduleData Nested schedule: [classroom => [day => [courses]]]
 * @param array $filterTags Tags to include (empty = no include filter)
 * @param array $excludeTags Tags to exclude (empty = no exclude filter)
 * @return array Filtered schedule data (same structure)
 */
function filterScheduleByTags(array $scheduleData, array $filterTags, array $excludeTags): array
{
    if (empty($filterTags) && empty($excludeTags)) {
        return $scheduleData;
    }

    $result = [];
    foreach ($scheduleData as $classroomName => $days) {
        $filteredDays = [];
        foreach ($days as $dayIndex => $courses) {
            $filteredCourses = array_filter($courses, function ($course) use ($filterTags, $excludeTags) {
                $courseTags = $course['tags'] ?? [];
                // Ensure all tags are strings to prevent 'Array to string conversion' warning
                $courseTags = array_filter($courseTags, 'is_string');
                if (!empty($excludeTags) && !empty(array_intersect($excludeTags, $courseTags))) {
                    return false;
                }
                if (!empty($filterTags) && empty(array_intersect($filterTags, $courseTags))) {
                    return false;
                }
                return true;
            });
            if (!empty($filteredCourses)) {
                $filteredDays[$dayIndex] = array_values($filteredCourses);
            }
        }
        if (!empty($filteredDays)) {
            $result[$classroomName] = $filteredDays;
        }
    }
    return $result;
}

/**
 * JSON-encodes data with XSS-safe flags for embedding in <script> contexts.
 * Ref: #88 — prevents </script> breakout via JSON_HEX_TAG and related flags.
 *
 * @param mixed $data Data to encode
 * @return string|false JSON string with HTML-unsafe chars hex-escaped
 */
function jsonEncodeSafe($data): string|false
{
    return json_encode($data, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
}
