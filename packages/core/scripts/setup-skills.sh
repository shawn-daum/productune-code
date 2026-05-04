#!/usr/bin/env bash
set -euo pipefail

# setup-skills.sh — productune 페르소나가 활용하는 OSS skill 라이브러리 설치.
#
# 설치 대상:
#   1. mattpocock/skills — Real engineering 컨셉 (to-prd, to-issues, tdd,
#      triage-issue, request-refactor-plan, improve-codebase-architecture 등 23개)
#   2. phuryn/pm-skills — PM 워크플로 (pm-product-discovery / -strategy /
#      -execution / -market-research 등 65 skill, 8 plugin)
#
# 설치 방식: ~/.claude/skills/<source>/ 디렉토리에 git clone. Claude Code 가
# description 매치로 자동 invoke (per Claude Code skills doc).
#
# Idempotent — 이미 클론돼 있으면 git pull 만. 사용자가 자기 fork 를 쓰고 싶으면
# 환경변수로 override 가능.

say()  { printf '\033[1;34m[skills]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[skills]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[skills]\033[0m %s\n' "$*" >&2; exit 1; }

command -v git >/dev/null || die "git not found."

SKILLS_ROOT="${PRODUCTUNE_SKILLS_ROOT:-$HOME/.claude/skills}"
mkdir -p "$SKILLS_ROOT"
say "skills root: $SKILLS_ROOT"

# Repo URL override 가능 (fork 등)
MATTPOCOCK_URL="${PRODUCTUNE_MATTPOCOCK_URL:-https://github.com/mattpocock/skills.git}"
PHURYN_URL="${PRODUCTUNE_PHURYN_URL:-https://github.com/phuryn/pm-skills.git}"

clone_or_pull() {
  local NAME="$1" URL="$2"
  local DIR="$SKILLS_ROOT/$NAME"
  if [ -d "$DIR/.git" ]; then
    say "$NAME 이미 클론돼있음 — git pull"
    git -C "$DIR" pull --ff-only || warn "$NAME pull 실패; 기존 checkout 유지"
  else
    say "$NAME 클론 중 ($URL)..."
    git clone --depth 1 "$URL" "$DIR"
  fi
}

clone_or_pull "mattpocock" "$MATTPOCOCK_URL"
clone_or_pull "phuryn"     "$PHURYN_URL"

# Sanity check — Claude Code 가 SKILL.md 들을 찾을 수 있는지
SKILL_COUNT=$(find "$SKILLS_ROOT" -name "SKILL.md" 2>/dev/null | wc -l | tr -d ' ')
if [ "$SKILL_COUNT" = "0" ]; then
  warn "SKILL.md 파일을 못 찾음 — repo 구조가 예상과 다를 수 있음. 수동 확인 필요:"
  warn "  ls $SKILLS_ROOT/mattpocock/"
  warn "  ls $SKILLS_ROOT/phuryn/"
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

  pdt-developer:
    - mattpocock/tdd, triage-issue, request-refactor-plan,
      improve-codebase-architecture, setup-pre-commit, git-guardrails-claude-code

  pdt-qa:
    - mattpocock/tdd (검증 모드)

부족하면 productune 의 quality escalation Path 2 가 'skill-fetch search'
로 9 registry 확장 검색 (skill-fetch CLI 설치 시).

skill-fetch 설치 (선택):
  npm i -g skill-fetch    # 또는 사용자 환경에 맞춰

이후 productune 호출 시 description 매치되는 skill 이 자동 surface 됨.

업데이트:
  bash $0    # idempotent, git pull 만 수행
EOF
