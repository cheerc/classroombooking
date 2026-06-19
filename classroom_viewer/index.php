<?php
define('APP_RUNNING', true);
$config = require __DIR__ . '/config.php';

// Allow embedding only by specific origins for security
header("Content-Security-Policy: frame-ancestors https://" . $config['csp_domain'] . ";");

ini_set('display_errors', 0);
error_reporting(E_ALL);

require __DIR__ . '/vendor/autoload.php';

// --- Configuration ---
$spreadsheetId = $config['spreadsheet_id'];
$keyFilePath = __DIR__ . '/credentials/service-account-key.json';
$weekdays = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
$courseColors = ['#93c5fd', '#73EEDC', '#DBF4A7', '#fca5a5', '#92DBFA', '#C5D8D1', '#B5EBCC', '#FDE74C', '#F5AE80', '#D6D1CD'];

// --- Helper Functions ---
function showError($message) {
    header('Content-Type: text/html; charset=utf-8');
    $errorHtml = '<!DOCTYPE html><html lang="zh-TW"><head><title>Error</title><style>body{font-family:sans-serif;padding:2em;background-color:#fbe9e7;color:#c62828;}.container{max-width:800px;margin:auto;background:white;padding:2em;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,0.1);}</style></head><body><div class="container"><h1>發生錯誤</h1><p>' . htmlspecialchars($message, ENT_QUOTES, 'UTF-8') . '</p></div></body></html>';
    echo $errorHtml;
    exit;
}

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

function stringToHashCode($str) {
    $hash = 5381;
    $length = strlen($str);
    for ($i = 0; $i < $length; $i++) {
        $hash = ($hash * 33) + ord($str[$i]);
    }
    return $hash;
}

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

// --- Rendering Functions ---
function render_course_item($course, $colorMap) {
    if (!isset($course['name']) || !is_string($course['name'])) {
        return '<div class="course-item" style="border-left-color: red;">資料錯誤</div>';
    }

    $name = htmlspecialchars($course['name']);
    $time = htmlspecialchars(($course['timeStart'] ?? '') . ' - ' . ($course['timeEnd'] ?? ''));

    $color = $colorMap[$course['name']] ?? '#ccc';

    return <<<HTML
        <div class="course-item" style="border-left-color: {$color}">
            <div class="name">{$name}</div>
            <div class="time">{$time}</div>
        </div>
HTML;
}

function render_schedule_table($classrooms, $schedule, $weekdays, $colorMap) {
    // 1. Aggregate all courses into a daily structure
    $coursesByDay = array_fill(0, 7, []);
    foreach ($schedule as $classroomName => $days) {
        foreach ($days as $dayIndex => $courses) {
            if (!isset($coursesByDay[$dayIndex])) {
                $coursesByDay[$dayIndex] = [];
            }
            $coursesByDay[$dayIndex] = array_merge($coursesByDay[$dayIndex], $courses);
        }
    }

    // 2. Identify which days have courses
    $activeDays = [];
    foreach ($weekdays as $dayIndex => $dayName) {
        if (!empty($coursesByDay[$dayIndex])) {
            $activeDays[$dayIndex] = $dayName;
        }
    }

    // 3. Build HTML
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

// --- Security & Encryption Configuration ---
define('ENCRYPTION_KEY', $config['encryption_key']); // 256-bit key
define('ENCRYPTION_CIPHER', 'aes-256-cbc');

// --- Main Logic ---
try {
    // --- 1. Decrypt Parameters & Authenticate ---
    if (!isset($_GET['data'])) {
        showError('請求無效，缺少必要的加密參數。');
    }

    $encryptedData = $_GET['data'];
    $decodedData = base64_decode($encryptedData);
    $ivLength = openssl_cipher_iv_length(ENCRYPTION_CIPHER);
    $iv = substr($decodedData, 0, $ivLength);
    $encryptedJson = substr($decodedData, $ivLength);

    $decryptedJson = openssl_decrypt($encryptedJson, ENCRYPTION_CIPHER, ENCRYPTION_KEY, 0, $iv);

    if ($decryptedJson === false) {
        showError('參數解密失敗，請確認您的請求來源是否正確。');
    }

    $params = json_decode($decryptedJson, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        showError('解析參數失敗。');
    }

    $targetScheduleNames = $params['schedule_name'] ?? [];
    $filterTags = $params['tags'] ?? [];
    $excludeTags = $params['exclude_tags'] ?? [];

    if (empty($targetScheduleNames)) {
        showError('請在網址中提供至少一個 schedule_name 參數 (可使用逗號分隔多個名稱)');
    }
    if (!file_exists($keyFilePath)) {
        throw new Exception('Service account key file not found');
    }

    $client = new Google\Client();
    $client->setApplicationName('PHP Sheets Reader');
    $client->setScopes([Google\Service\Sheets::SPREADSHEETS_READONLY]);
    $client->setAuthConfig($keyFilePath);
    $service = new Google\Service\Sheets($client);

    // --- 2. Find Target Sheet IDs (and filter out draft schedules) ---
    $indexRange = 'Data!A:E'; // Read up to column E to get the 'Is Draft' status
    $indexResponse = $service->spreadsheets_values->get($spreadsheetId, $indexRange);
    $indexValues = $indexResponse->getValues();
    $targetSheetIds = [];

    if (!empty($indexValues)) {
        $scheduleDetailsMap = [];
        // Create a map of schedule names to their details: [id, isDraft]
        foreach ($indexValues as $row) {
            // Ensure the row has at least name (col 1) and id (col 0)
            if (!isset($row[0]) || !isset($row[1])) continue;
            
            $id = $row[0];
            $name = $row[1];
            // Ref: #6 — Sheets API FORMATTED_VALUE returns booleans as strings "TRUE"/"FALSE"
            $isDraft = isset($row[4]) && strtoupper(trim($row[4])) === 'TRUE';
            
            $scheduleDetailsMap[$name] = ['id' => $id, 'isDraft' => $isDraft];
        }

        // Find the IDs of the requested schedules, excluding drafts
        foreach ($targetScheduleNames as $nameToFind) {
            if (isset($scheduleDetailsMap[$nameToFind]) && $scheduleDetailsMap[$nameToFind]['isDraft'] === false) {
                $targetSheetIds[] = $scheduleDetailsMap[$nameToFind]['id'];
            }
        }
    }

    if (empty($targetSheetIds)) {
        throw new Exception('找不到任何指定的課表: ' . htmlspecialchars(implode(', ', $targetScheduleNames)));
    }

    // --- 3. Fetch and Combine Data ---
    $ranges = [];
    foreach ($targetSheetIds as $sheetId) {
        $ranges[] = $sheetId . '!B2:B4';
    }

    $batchGetResponse = $service->spreadsheets_values->batchGet($spreadsheetId, ['ranges' => $ranges, 'valueRenderOption' => 'UNFORMATTED_VALUE']);
    $valueRanges = $batchGetResponse->getValueRanges();

    $scheduleData = [];
    $classrooms = [];

    foreach ($valueRanges as $valueRange) {
        $dataValues = $valueRange->getValues();
        if (empty($dataValues)) continue;

        $singleScheduleData = json_decode($dataValues[0][0] ?? '{}', true);
        $singleClassrooms = json_decode($dataValues[1][0] ?? '[]', true);

        $classrooms = array_merge($classrooms, $singleClassrooms);

        foreach ($singleScheduleData as $classroomName => $days) {
            if (!isset($scheduleData[$classroomName])) {
                $scheduleData[$classroomName] = $days;
            } else {
                foreach ($days as $dayIndex => $courses) {
                    if (!isset($scheduleData[$classroomName][$dayIndex])) {
                        $scheduleData[$classroomName][$dayIndex] = [];
                    }
                    $scheduleData[$classroomName][$dayIndex] = array_merge($scheduleData[$classroomName][$dayIndex], $courses);
                }
            }
        }
    }
    $classrooms = array_values(array_unique($classrooms));

    

    // --- 4. Filter Data ---
    $finalSchedule = [];

    if (!empty($filterTags) || !empty($excludeTags)) {
        foreach ($scheduleData as $classroomName => $days) {
            $filteredDays = [];
            foreach ($days as $dayIndex => $courses) {
                $filteredCourses = array_filter($courses, function($course) use ($filterTags, $excludeTags) {
                    $courseTags = $course['tags'] ?? [];
                    // Ensure all tags are strings to prevent 'Array to string conversion' warning in array_intersect
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
                $finalSchedule[$classroomName] = $filteredDays;
            }
        }
    } else {
        $finalSchedule = $scheduleData;
    }

    $classroomsToShow = sortClassrooms(array_keys($finalSchedule));
    $courseColorMap = buildCourseColorMap($finalSchedule, $courseColors);

} catch (Exception $e) {
    showError($e->getMessage());
}

// --- 5. Render HTML Page ---
header('Content-Type: text/html; charset=utf-8');
?>
<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=1280">
    <title>課表檢視</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; margin: 0; background-color: #f8f9fa; color: #212529; }
        .container { padding: 1.5em; max-width: 1600px; margin: auto; }
        h1 { color: #343a40; text-align: center; }
        .schedule-table { width: 100%; min-width: 1200px; border-collapse: collapse; table-layout: fixed; }
        .schedule-table th, .schedule-table td { border: 1px solid #dee2e6; padding: 0.5em; text-align: left; vertical-align: top; }
        .schedule-table thead { background-color: #e9ecef; }
        .schedule-table th { font-weight: 600; }
        .course-item {
            background-color: #fff;
            border-left: 5px solid #ccc;
            padding: 0.8em;
            margin-bottom: 0.6em;
            border-radius: 4px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.06);
        }
        .course-item .name {
            font-size: 1.1em;
            font-weight: 600;
            color: #343a40;
            margin-bottom: 0.25em;
        }
        .course-item .time {
            font-size: 1em;
            color: #495057;
            margin-bottom: 0.6em;
        }
        .table-container {
            overflow-x: auto; /* Enable horizontal scrolling */
            -webkit-overflow-scrolling: touch; /* Smooth scrolling on iOS */
        }

        /* Style the scrollbar to be visible but subtle */
        .table-container::-webkit-scrollbar {
            height: 8px; /* Height of the horizontal scrollbar */
        }

        .table-container::-webkit-scrollbar-track {
            background: #f1f1f1; /* Track color */
            border-radius: 10px;
        }

        .table-container::-webkit-scrollbar-thumb {
            background: #ccc; /* Handle color */
            border-radius: 10px;
        }

        .table-container::-webkit-scrollbar-thumb:hover {
            background: #aaa; /* Handle color on hover */
        }
        
    </style>
</head>
<body>
    <div class="container">
        <?php echo render_schedule_table($classroomsToShow, $finalSchedule, $weekdays, $courseColorMap); ?>
    </div>
<script>
    function sendHeight() {
        const contentWrapper = document.querySelector('.container');
        if (contentWrapper) {
            const height = contentWrapper.scrollHeight;
            if (window.parent) {
                const message = { type: 'iframe-resize', height: height };
                // Ref: #9 — Restrict postMessage to known embedding origin
                window.parent.postMessage(message, 'https://talented.mido-9.com');
            }
        }
    }

    // Send height at different stages to ensure accuracy
    window.addEventListener('load', () => {
        sendHeight();
        // Call a few more times to handle slow-loading content or fonts
        setTimeout(sendHeight, 150);
        setTimeout(sendHeight, 500);
    });

    // Use ResizeObserver for dynamic content changes
    if (window.ResizeObserver) {
        const resizeObserver = new ResizeObserver(sendHeight);
        resizeObserver.observe(document.body);
    } else {
        // Fallback for older browsers
        window.addEventListener('resize', sendHeight);
    }
</script>
</body>
</html>
