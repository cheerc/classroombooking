#!/bin/bash
# workflow.sh — Local development verification script for classroombooking
# Usage: ./workflow.sh [t1|t2|t3|t4|t5|t6|t7|t8|t9]
#   t1: CSS Full Build (npm run build)
#   t2: ESLint frontend (npx eslint --ext .html .)
#   t3: ESLint GAS backend (npx eslint 程式碼.js)
#   t4: Structure check (bash scripts/check-structure.sh)
#   t5: Tailwind consistency (bash scripts/check-tailwind.sh)
#   t6: Full run (t1→t2→t3→t4→t5→t7→t8→t9)
#   t7: PHP lint (find classroom_viewer -name '*.php' ! -path '*/vendor/*' -exec php -l {} \;)
#   t8: Vitest (npm test)
#   t9: PHPUnit (cd classroom_viewer && vendor/bin/phpunit)
set -euo pipefail

PASS_COUNT=0
FAIL_COUNT=0
RESULTS=()

run_step() {
  local id="$1"
  local name="$2"
  shift 2
  echo ""
  echo "========================================="
  echo "[$id] $name"
  echo "========================================="
  if "$@"; then
    RESULTS+=("✅ [$id] $name")
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    RESULTS+=("❌ [$id] $name")
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

t1() { run_step "t1" "CSS Full Build" npm run build; }
t2() { run_step "t2" "ESLint frontend" npx eslint --ext .html .; }
t3() { run_step "t3" "ESLint GAS backend" npx eslint 程式碼.js; }
t4() { run_step "t4" "Structure check" bash scripts/check-structure.sh; }
t5() { run_step "t5" "Tailwind consistency" bash scripts/check-tailwind.sh; }
t7() { run_step "t7" "PHP lint" find classroom_viewer -name '*.php' ! -path '*/vendor/*' -exec php -l {} \;; }
t8() { run_step "t8" "Vitest" npm test; }
t9() { run_step "t9" "PHPUnit" bash -c 'cd classroom_viewer && vendor/bin/phpunit'; }

t6() {
  t1
  t2
  t3
  t4
  t5
  t7
  t8
  t9
}

show_summary() {
  echo ""
  echo "========================================="
  echo "Summary"
  echo "========================================="
  for result in "${RESULTS[@]}"; do
    echo "  $result"
  done
  echo ""
  echo "Passed: $PASS_COUNT  Failed: $FAIL_COUNT"
  if [ $FAIL_COUNT -gt 0 ]; then
    echo "RESULT: FAIL"
    exit 1
  else
    echo "RESULT: PASS"
    exit 0
  fi
}

TARGET="${1:-t6}"

case "$TARGET" in
  t1) t1 ;;
  t2) t2 ;;
  t3) t3 ;;
  t4) t4 ;;
  t5) t5 ;;
  t6) t6 ;;
  t7) t7 ;;
  t8) t8 ;;
  t9) t9 ;;
  *)
    echo "Unknown target: $TARGET"
    echo "Usage: ./workflow.sh [t1|t2|t3|t4|t5|t6|t7|t8|t9]"
    exit 1
    ;;
esac

show_summary
