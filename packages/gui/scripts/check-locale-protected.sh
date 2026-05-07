#!/usr/bin/env bash
# check-locale-protected.sh
# Detects protected tokens (고유어) in locale catalog VALUES.
# Fails (exit 1) if any catalog value contains a Korean/translated label
# for terms that must stay in English in both catalogs.
#
# Protected tokens — these must NEVER appear as translated Korean labels
# in catalog values:
#   - Stage enum translated: 디자인(design), 임플(impl), 테스트(test), 배포(deploy) etc.
#   - Status enum translated: 완료(done), 진행 중(in-progress), 차단됨(blocked), 포기됨(abandoned) etc.
#   - Persona name translations: 제품 책임자(PO), 디자이너(Designer) etc.
#
# We grep for Korean translations of protected terms. The actual enum values
# themselves (design, impl, done, etc.) are NOT in the catalog — they appear
# as raw values in components. This script checks that no catalog value
# TRANSLATES them into Korean.

set -euo pipefail

LOCALES_DIR="$(dirname "$0")/../src/locales"
FAIL=0

check_pattern() {
  local pattern="$1"
  local description="$2"
  local file="$3"

  if grep -qP "$pattern" "$file" 2>/dev/null; then
    echo "FAIL: protected pattern found in $file"
    echo "  Pattern: $pattern ($description)"
    grep -nP "$pattern" "$file" | head -5
    FAIL=1
  fi
}

echo "Checking locale catalog for protected token violations..."

for catalog in "$LOCALES_DIR/en.json" "$LOCALES_DIR/ko.json"; do
  if [ ! -f "$catalog" ]; then
    echo "WARN: catalog not found: $catalog"
    continue
  fi

  # Stage enum — Korean translations of English stage names in catalog values
  check_pattern '"디자인"' 'stage:design translated to Korean' "$catalog"
  check_pattern '"구현"' 'stage:impl translated to Korean' "$catalog"
  check_pattern '"리팩터"' 'stage:refactor translated to Korean' "$catalog"
  check_pattern '"테스트"' 'stage:test translated to Korean' "$catalog"
  check_pattern '"배포"' 'stage:deploy translated to Korean' "$catalog"

  # Status enum — Korean translations in catalog values
  check_pattern '"완료"' 'status:done translated to Korean' "$catalog"
  check_pattern '"진행 중"' 'status:in-progress translated to Korean' "$catalog"
  check_pattern '"검토"' 'status:review translated to Korean' "$catalog"
  check_pattern '"차단됨"' 'status:blocked translated to Korean' "$catalog"
  check_pattern '"포기됨"' 'status:abandoned translated to Korean' "$catalog"
  check_pattern '"할 일"' 'status:todo translated to Korean' "$catalog"

  # Persona names — must not be translated
  check_pattern '"제품 책임자"' 'persona:PO translated to Korean' "$catalog"
  check_pattern '"디자이너"' 'persona:Designer translated to Korean (use Designer)' "$catalog"
  check_pattern '"개발자"' 'persona:Developer translated to Korean (use Developer)' "$catalog"

done

if [ $FAIL -eq 1 ]; then
  echo ""
  echo "ERROR: Locale catalogs contain protected token violations."
  echo "Protected tokens (persona IDs, stage/status enums, schema fields, product names)"
  echo "must remain as English literals — never translate them in catalog values."
  exit 1
else
  echo "OK: No protected token violations found."
fi
