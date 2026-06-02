#!/usr/bin/env bash
set -euo pipefail

# setup-skills.sh — productune 페르소나가 활용하는 OSS skill 라이브러리 설치.
#
# 설치 대상 (vendored — 외부 네트워크 불필요):
#   1. mattpocock/skills — Real engineering 컨셉 (to-prd, to-issues, tdd,
#      triage-issue, request-refactor-plan, improve-codebase-architecture 등)
#   2. phuryn/pm-skills — PM 워크플로 (pm-product-discovery / -strategy /
#      -execution / -market-research 등)
#   3. anthropic/skills — Anthropic 공식 skill (frontend-design 등)
#      → ~/.claude/skills/anthropic/skills/frontend-design/SKILL.md
#
# 설치 방식: packages/core/skills/ 에 vendor된 .md 파일들을
#   ~/.claude/skills/<source>/ 디렉토리로 복사. git clone 불필요.
#
# Idempotent — 기존 디렉토리는 rm -rf 후 재복사 (stale clone 덮어쓰기).
# upstream 업데이트 = repo에 재vendor 후 재실행.

say()  { printf '\033[1;34m[skills]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[skills]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[skills]\033[0m %s\n' "$*" >&2; exit 1; }

# Resolve script location → packages/core/
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILLS_SRC="$ROOT/skills"
SKILLS_DEST="${PRODUCTUNE_SKILLS_ROOT:-$HOME/.claude/skills}"

# ── T-018: skip list for domain-irrelevant phuryn categories ─────────────────
# Set PRODUCTUNE_SKILL_SKIP to a colon-separated list of category paths to exclude.
# Each entry is matched as a substring of the source path.
# Default (unset or empty) = install all.
# Example: PRODUCTUNE_SKILL_SKIP="phuryn/pm-data-analytics:phuryn/pm-marketing-growth"
#
# Pre-built constant for the two doctrine-irrelevant categories (T-018):
PRODUCTUNE_IRRELEVANT_CATEGORIES="phuryn/pm-data-analytics:phuryn/pm-marketing-growth"

# Merge the pre-built irrelevant list with any user-supplied extra skips.
# User can override entirely by exporting PRODUCTUNE_SKILL_SKIP=... before calling.
_skip_list="${PRODUCTUNE_SKILL_SKIP:-$PRODUCTUNE_IRRELEVANT_CATEGORIES}"

# Returns 0 (true) if the given path matches any skip pattern, 1 otherwise.
_should_skip() {
  local check_path="$1"
  local IFS=':'
  for pattern in $_skip_list; do
    [ -z "$pattern" ] && continue
    case "$check_path" in
      *"$pattern"*) return 0 ;;
    esac
  done
  return 1
}

[ -d "$SKILLS_SRC" ] || die "vendored skills 디렉토리 없음: $SKILLS_SRC"
mkdir -p "$SKILLS_DEST"
say "skills src : $SKILLS_SRC"
say "skills dest: $SKILLS_DEST"
if [ -n "$_skip_list" ]; then
  say "skip list  : $_skip_list"
fi

for lib in mattpocock phuryn anthropic; do
  src="$SKILLS_SRC/$lib"
  dest="$SKILLS_DEST/$lib"
  if [ ! -d "$src" ]; then
    warn "$lib vendored 디렉토리 없음 — skip"
    continue
  fi
  # If the entire lib is skipped, skip it wholesale.
  if _should_skip "$lib"; then
    say "$lib — skip list 일치, 건너뜀"
    continue
  fi
  if [ -d "$dest" ]; then
    rm -rf "$dest"
  fi
  # Copy top-level lib directory first (non-category files, e.g. .claude-plugin).
  # Then copy sub-directories selectively, honouring skip list.
  mkdir -p "$dest"
  # Copy non-directory items at the lib root.
  for item in "$src"/.*; do
    [ -e "$item" ] || continue
    basename_item="$(basename "$item")"
    [ "$basename_item" = "." ] || [ "$basename_item" = ".." ] && continue
    cp -R "$item" "$dest/"
  done
  for item in "$src"/*; do
    [ -e "$item" ] || continue
    rel="${item#"$SKILLS_SRC/"}"  # e.g. "phuryn/pm-data-analytics"
    if _should_skip "$rel"; then
      say "skip: $rel"
      continue
    fi
    cp -R "$item" "$dest/"
  done
  skill_count="$(find "$dest" -name 'SKILL.md' 2>/dev/null | wc -l | tr -d ' ')"
  say "$lib vendored skills 복사 완료 (${skill_count} SKILL.md)"
done

# frontend-design 설치 확인 — 동적 탐색 (anthropic 내부 구조 변경에 유연)
FD_PATH="$(find "$SKILLS_DEST/anthropic" -name 'frontend-design' -type d 2>/dev/null | head -1)"
if [ -n "$FD_PATH" ] && [ -f "$FD_PATH/SKILL.md" ]; then
  say "frontend-design skill OK: $FD_PATH/SKILL.md"
else
  warn "frontend-design 못 찾음 — vendor 누락? find $SKILLS_DEST/anthropic -name 'frontend-design'"
fi

# Sanity check — 전체 SKILL.md 수
SKILL_COUNT="$(find "$SKILLS_DEST" -name 'SKILL.md' 2>/dev/null | wc -l | tr -d ' ')"
if [ "$SKILL_COUNT" = "0" ]; then
  warn "SKILL.md 파일을 못 찾음 — 복사 실패 가능성. 수동 확인:"
  warn "  ls $SKILLS_DEST/mattpocock/"
  warn "  ls $SKILLS_DEST/phuryn/"
  warn "  ls $SKILLS_DEST/anthropic/"
else
  say "$SKILL_COUNT 개 SKILL.md 발견 — Claude Code 가 description 매치로 자동 invoke"
fi

cat <<EOF

$(printf "\033[1;32m✓ skills setup complete\033[0m")

페르소나-skill 매핑 (productune doctrine 에 명시됨):

  productune (PO):
    - mattpocock/to-prd, grill-me, to-issues
    - phuryn/pm-product-discovery, pm-product-strategy, pm-execution

  pdt-designer:
    - mattpocock/design-an-interface
    - anthropic/skills/frontend-design

  pdt-developer:
    - mattpocock/tdd, triage-issue, request-refactor-plan,
      improve-codebase-architecture, setup-pre-commit, git-guardrails-claude-code

  pdt-qa:
    - mattpocock/tdd (검증 모드)

업데이트 (upstream 재vendor 후):
  bash $0    # idempotent, vendored 복사 재실행
EOF
