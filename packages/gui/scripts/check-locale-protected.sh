#!/usr/bin/env bash
# check-locale-protected.sh v2 — macOS BSD + Linux GNU compatible
# Detects protected token Korean translations in locale catalog VALUES.
# Replaces grep -P (BSD unsupported) with perl -CSDA -ne for portability.
#
# Protected tokens — these must NEVER appear as translated Korean labels
# in catalog values:
#   - Status enum: done, in-progress, review, blocked, abandoned, todo
#   - Stage enum: design, impl, refactor, test, qa, deploy
#   - Persona ID: PO, Designer, Developer, QA
#   - Doctrine units: Version, Phase, Round, Ticket, Slot
#   - Product/tech name: productune, Vercel, Docker
#   - Schema field (1st pass): north_star, observed, validation_method

set -euo pipefail

# Graceful perl check — exit 2 if perl not available
command -v perl >/dev/null 2>&1 || {
  echo "ERROR: perl is required for locale linter but was not found in PATH."
  echo "  macOS: perl ships with the OS (/usr/bin/perl). If missing, install via Homebrew: brew install perl"
  exit 2
}

LOCALES_DIR="$(dirname "$0")/../src/locales"
FAIL=0

check_pattern() {
  local pattern="$1"          # perl regex (Korean literal or PCRE)
  local description="$2"
  local file="$3"

  # perl -CSDA -Mutf8: -CSDA enables UTF-8 on all I/O handles; -Mutf8 marks
  # the source (including the inlined regex pattern) as UTF-8 so that Korean
  # literals in the pattern are interpreted as Unicode chars, matching the
  # Unicode-decoded input. Without -Mutf8 the byte-pattern vs char-string
  # mismatch causes silent no-match on macOS perl 5.30+.
  # -ne: read each line; if regex matches, print line number + line.
  # We capture matches into a variable, then check if any output was produced.
  # `|| true` prevents set -e from aborting on perl non-zero exit.
  local matches
  matches=$(perl -CSDA -Mutf8 -ne '
    # Skip kanban column label lines + version-state labels — UI labels, not enum translations.
    # "closed" key added T-P4-097: side-panel version closed/completed state (≠ ticket status).
    # Status enum display keys added T-P4-138: workspace.tickets.status.* UI labels need translation.
    next if /^\s+"(?:todo|inProgress|qa|done|closed|in-progress|review|user-verify|blocked|abandoned)"\s*:\s*/;
    print "$.: $_" if /'"$pattern"'/
  ' "$file" 2>/dev/null || true)

  if [ -n "$matches" ]; then
    echo "FAIL: protected pattern found in $file"
    echo "  Pattern: $pattern ($description)"
    echo "$matches" | head -5
    FAIL=1
  fi
}

echo "Checking locale catalog for protected token violations..."

for catalog in "$LOCALES_DIR/en.json" "$LOCALES_DIR/ko.json"; do
  [ -f "$catalog" ] || { echo "WARN: catalog not found: $catalog"; continue; }

  # Korean translations of protected English tokens — must NOT appear in
  # catalog VALUES of either language. (en.json keeps tokens as English
  # literals; ko.json must also keep tokens as English literals.)
  #
  # Pattern format: literal Korean string wrapped in double-quotes —
  # this matches the JSON value form `"<KOREAN>"` (quote-strict, single word).
  # Partial matches inside longer strings are NOT caught — intentional
  # false-positive trade-off: see design doc §4.3.

  # --- status enum ---
  check_pattern '"완료"'       'status:done → "완료"'           "$catalog"
  check_pattern '"진행 중"'    'status:in-progress → "진행 중"' "$catalog"
  check_pattern '"검토 중"'    'status:review → "검토 중"'      "$catalog"
  check_pattern '"차단됨"'     'status:blocked → "차단됨"'      "$catalog"
  check_pattern '"포기됨"'     'status:abandoned → "포기됨"'    "$catalog"
  check_pattern '"할 일"'      'status:todo → "할 일"'          "$catalog"

  # --- stage enum ---
  check_pattern '"디자인"'     'stage:design → "디자인"'        "$catalog"
  check_pattern '"구현"'       'stage:impl → "구현"'            "$catalog"
  check_pattern '"리팩터"'     'stage:refactor → "리팩터"'      "$catalog"
  check_pattern '"리팩토링"'   'stage:refactor → "리팩토링"'    "$catalog"
  check_pattern '"테스트"'     'stage:test → "테스트"'          "$catalog"
  check_pattern '"품질"'       'stage:qa → "품질"'              "$catalog"
  check_pattern '"배포"'       'stage:deploy → "배포"'          "$catalog"

  # --- persona ID ---
  check_pattern '"제품 책임자"' 'persona:PO → "제품 책임자"'    "$catalog"
  check_pattern '"기획자"'     'persona:PO → "기획자"'          "$catalog"
  check_pattern '"디자이너"'   'persona:Designer → "디자이너"'  "$catalog"
  check_pattern '"개발자"'     'persona:Developer → "개발자"'   "$catalog"
  check_pattern '"검수자"'     'persona:QA → "검수자"'          "$catalog"
  check_pattern '"품질 담당자"' 'persona:QA → "품질 담당자"'    "$catalog"

  # --- doctrine units (Version / Phase / Round / Ticket / Slot) ---
  check_pattern '"버전"'       'unit:Version → "버전"'          "$catalog"
  check_pattern '"단계"'       'unit:Phase → "단계"'            "$catalog"
  check_pattern '"라운드"'     'unit:Round → "라운드"'          "$catalog"
  check_pattern '"회차"'       'unit:Round → "회차"'            "$catalog"
  check_pattern '"티켓"'       'unit:Ticket → "티켓"'           "$catalog"
  check_pattern '"슬롯"'       'unit:Slot → "슬롯"'             "$catalog"

  # --- product / tech name ---
  check_pattern '"프로덕튠"'   'product:productune → "프로덕튠"' "$catalog"
  check_pattern '"버셀"'       'tech:Vercel → "버셀"'           "$catalog"
  check_pattern '"도커"'       'tech:Docker → "도커"'           "$catalog"

  # --- schema field (1st pass — conservative: only clear candidates) ---
  # General Korean words are not caught here; only unambiguous doctrine terms.
  check_pattern '"북극성"'     'schema:north_star → "북극성"'   "$catalog"
  check_pattern '"관찰값"'     'schema:observed → "관찰값"'     "$catalog"
  check_pattern '"검증 방법"'  'schema:validation_method → "검증 방법"' "$catalog"

done

if [ $FAIL -eq 1 ]; then
  echo ""
  echo "ERROR: Locale catalogs contain protected token violations."
  echo "Protected tokens (persona IDs, doctrine units, stage/status enums,"
  echo "schema fields, product/tech names) must remain as English literals"
  echo "— never translate them in catalog values."
  exit 1
fi

echo "OK: No protected token violations found."
