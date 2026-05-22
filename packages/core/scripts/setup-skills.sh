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

[ -d "$SKILLS_SRC" ] || die "vendored skills 디렉토리 없음: $SKILLS_SRC"
mkdir -p "$SKILLS_DEST"
say "skills src : $SKILLS_SRC"
say "skills dest: $SKILLS_DEST"

for lib in mattpocock phuryn anthropic; do
  src="$SKILLS_SRC/$lib"
  dest="$SKILLS_DEST/$lib"
  if [ ! -d "$src" ]; then
    warn "$lib vendored 디렉토리 없음 — skip"
    continue
  fi
  if [ -d "$dest" ]; then
    rm -rf "$dest"
  fi
  cp -R "$src" "$dest"
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
