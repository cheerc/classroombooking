<?php
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
