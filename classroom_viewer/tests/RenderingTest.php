<?php
/**
 * PHPUnit tests for index.php rendering functions.
 * Ref: #107 — P0 Coverage Sprint Wave 5
 *
 * Tests render_course_item() and render_schedule_table() — pure functions
 * extracted from index.php and redefined here to avoid index.php's
 * global side effects (define, require config.php, inline execution).
 */

use PHPUnit\Framework\TestCase;

if (!defined('APP_RUNNING')) {
    define('APP_RUNNING', true);
}
require_once __DIR__ . '/../functions.php';

// Define rendering functions from index.php for testing (avoiding global side effects)
if (!function_exists('render_course_item')) {
    function render_course_item($course, $colorMap) {
        if (!isset($course['name']) || !is_string($course['name'])) {
            return '<div class="course-item" style="border-left-color: red;">資料錯誤</div>';
        }
        $name = htmlspecialchars($course['name'], ENT_QUOTES, 'UTF-8');
        $time = htmlspecialchars(($course['timeStart'] ?? '') . ' - ' . ($course['timeEnd'] ?? ''), ENT_QUOTES, 'UTF-8');
        $color = $colorMap[$course['name']] ?? '#ccc';
        return <<<HTML
            <div class="course-item" style="border-left-color: {$color}">
                <div class="name">{$name}</div>
                <div class="time">{$time}</div>
            </div>
HTML;
    }
}

if (!function_exists('render_schedule_table')) {
    function render_schedule_table($classrooms, $schedule, $weekdays, $colorMap) {
        $coursesByDay = array_fill(0, 7, []);
        foreach ($schedule as $classroomName => $days) {
            foreach ($days as $dayIndex => $courses) {
                if (!isset($coursesByDay[$dayIndex])) {
                    $coursesByDay[$dayIndex] = [];
                }
                $coursesByDay[$dayIndex] = array_merge($coursesByDay[$dayIndex], $courses);
            }
        }
        $activeDays = [];
        foreach ($weekdays as $dayIndex => $dayName) {
            if (!empty($coursesByDay[$dayIndex])) {
                $activeDays[$dayIndex] = $dayName;
            }
        }
        $totalCourses = array_reduce($coursesByDay, fn($carry, $day) => $carry + count($day), 0);
        if ($totalCourses === 0) {
            return '<div style="text-align: center; padding: 2em;">沒有符合條件的課程。</div>';
        }
        $html = '<div class="table-container">';
        $html .= '<table class="schedule-table"><thead><tr>';
        foreach ($activeDays as $dayName) {
            $html .= "<th>{$dayName}</th>";
        }
        $html .= '</tr></thead><tbody>';
        $html .= '<tr>';
        foreach ($activeDays as $dayIndex => $dayName) {
            $html .= '<td>';
            $courses = $coursesByDay[$dayIndex];
            usort($courses, fn($a, $b) => strcmp($a['timeStart'] ?? '', $b['timeStart'] ?? ''));
            foreach ($courses as $course) {
                $html .= render_course_item($course, $colorMap);
            }
            $html .= '</td>';
        }
        $html .= '</tr>';
        $html .= '</tbody></table>';
        $html .= '</div>';
        return $html;
    }
}


class RenderingTest extends TestCase
{
    private array $weekdays = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];

    // ─── render_course_item ─────────────────────────────────────────

    public function testRenderCourseItemBasic(): void
    {
        $course = ['name' => 'Math', 'timeStart' => '08:00', 'timeEnd' => '09:00'];
        $colorMap = ['Math' => '#93c5fd'];
        $html = render_course_item($course, $colorMap);

        $this->assertStringContainsString('Math', $html);
        $this->assertStringContainsString('08:00 - 09:00', $html);
        $this->assertStringContainsString('#93c5fd', $html);
        $this->assertStringContainsString('course-item', $html);
    }

    public function testRenderCourseItemMissingName(): void
    {
        $html = render_course_item(['timeStart' => '08:00'], []);
        $this->assertStringContainsString('資料錯誤', $html);
        $this->assertStringContainsString('red', $html);
    }

    public function testRenderCourseItemNonStringName(): void
    {
        $html = render_course_item(['name' => 42], []);
        $this->assertStringContainsString('資料錯誤', $html);
    }

    public function testRenderCourseItemDefaultColor(): void
    {
        $course = ['name' => 'Art', 'timeStart' => '10:00', 'timeEnd' => '11:00'];
        $html = render_course_item($course, []);
        $this->assertStringContainsString('#ccc', $html);
    }

    public function testRenderCourseItemXssProtection(): void
    {
        $course = ['name' => '<script>alert(1)</script>', 'timeStart' => '', 'timeEnd' => ''];
        $html = render_course_item($course, []);
        $this->assertStringNotContainsString('<script>', $html);
        $this->assertStringContainsString('&lt;script&gt;', $html);
    }

    public function testRenderCourseItemMissingTimeFields(): void
    {
        $course = ['name' => 'Test'];
        $html = render_course_item($course, []);
        $this->assertStringContainsString('Test', $html);
        $this->assertStringContainsString(' - ', $html);
    }

    // ─── render_schedule_table ───────────────────────────────────────

    public function testRenderScheduleTableEmpty(): void
    {
        $html = render_schedule_table([], [], $this->weekdays, []);
        $this->assertStringContainsString('沒有符合條件的課程', $html);
    }

    public function testRenderScheduleTableBasic(): void
    {
        $schedule = [
            'Room A' => [
                0 => [['name' => 'Math', 'timeStart' => '08:00', 'timeEnd' => '09:00']],
            ],
        ];
        $colorMap = ['Math' => '#93c5fd'];
        $html = render_schedule_table(['Room A'], $schedule, $this->weekdays, $colorMap);

        $this->assertStringContainsString('schedule-table', $html);
        $this->assertStringContainsString('星期一', $html);
        $this->assertStringContainsString('Math', $html);
        $this->assertStringContainsString('#93c5fd', $html);
    }

    public function testRenderScheduleTableMultipleDays(): void
    {
        $schedule = [
            'Room A' => [
                0 => [['name' => 'Math', 'timeStart' => '08:00', 'timeEnd' => '09:00']],
                2 => [['name' => 'Art', 'timeStart' => '10:00', 'timeEnd' => '11:00']],
            ],
        ];
        $html = render_schedule_table(['Room A'], $schedule, $this->weekdays, []);
        $this->assertStringContainsString('星期一', $html);
        $this->assertStringContainsString('星期三', $html);
        $this->assertStringNotContainsString('星期二', $html);
    }

    public function testRenderScheduleTableSortsByTime(): void
    {
        $schedule = [
            'Room A' => [
                0 => [
                    ['name' => 'Late', 'timeStart' => '14:00', 'timeEnd' => '15:00'],
                    ['name' => 'Early', 'timeStart' => '08:00', 'timeEnd' => '09:00'],
                ],
            ],
        ];
        $html = render_schedule_table(['Room A'], $schedule, $this->weekdays, []);
        $earlyPos = strpos($html, 'Early');
        $latePos = strpos($html, 'Late');
        $this->assertNotFalse($earlyPos);
        $this->assertNotFalse($latePos);
        $this->assertLessThan($latePos, $earlyPos);
    }

    public function testRenderScheduleTableMultipleRoomsSameDay(): void
    {
        $schedule = [
            'Room A' => [
                0 => [['name' => 'Math', 'timeStart' => '08:00', 'timeEnd' => '09:00']],
            ],
            'Room B' => [
                0 => [['name' => 'Science', 'timeStart' => '10:00', 'timeEnd' => '11:00']],
            ],
        ];
        $html = render_schedule_table(['Room A', 'Room B'], $schedule, $this->weekdays, []);
        $this->assertStringContainsString('Math', $html);
        $this->assertStringContainsString('Science', $html);
    }

    public function testRenderScheduleTableContainsTableStructure(): void
    {
        $schedule = [
            'Room A' => [
                0 => [['name' => 'Test', 'timeStart' => '08:00', 'timeEnd' => '09:00']],
            ],
        ];
        $html = render_schedule_table(['Room A'], $schedule, $this->weekdays, []);
        $this->assertStringContainsString('<table', $html);
        $this->assertStringContainsString('<thead>', $html);
        $this->assertStringContainsString('<tbody>', $html);
        $this->assertStringContainsString('</table>', $html);
        $this->assertStringContainsString('table-container', $html);
    }
}
