#!/bin/bash
# check-structure.sh — Verify required files exist in the classroombooking project
set -euo pipefail

REQUIRED_FILES=(
  "Index.html"
  "程式碼.js"
  "appsscript.json"
  "input.css"
  "package.json"
  "tailwind.config.js"
  "JavaScript.html"
  "Api.js.html"
  "Config.js.html"
  "Elements.js.html"
  "Modals.js.html"
  "History.js.html"
  "UI.js.html"
  "Interaction.js.html"
  "classroom_viewer/index.php"
  "classroom_viewer/generate_iframe.php"
  "classroom_viewer/config.example.php"
  "classroom_viewer/composer.json"
)

EXIT_CODE=0

for file in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$file" ]; then
    echo "FAIL: Missing required file: $file"
    EXIT_CODE=1
  else
    echo "OK: $file"
  fi
done

if [ $EXIT_CODE -eq 0 ]; then
  echo ""
  echo "All required files present."
else
  echo ""
  echo "Structure check FAILED."
fi

exit $EXIT_CODE
