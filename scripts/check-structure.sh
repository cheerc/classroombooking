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
