<?php

ini_set('display_errors', 1);
error_reporting(E_ALL);

header('Content-Type: text/plain; charset=utf-8');

echo "--- PHP Version Check ---
";
echo "PHP Version: " . phpversion() . "\n\n";


echo "--- Autoloader and Class Check ---
";
$autoloaderPath = __DIR__ . '/vendor/autoload.php';

if (!file_exists($autoloaderPath)) {
    echo "Error: vendor/autoload.php not found!\n";
    echo "Please make sure you have uploaded the 'vendor' directory.";
    exit;
}

require $autoloaderPath;

echo "Autoloader included successfully.
";

if (class_exists('Google\Client')) {
    echo "OK: 'Google\Client' class exists.
";
} else {
    echo "Error: 'Google\Client' class does NOT exist after including autoloader!\n";
}

