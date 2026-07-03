#!/usr/bin/env bash
# prdt v1 flip (§12.6) — retire pdt-*/pdtl-* from this machine's ~/.claude, make prdt the default.
# Non-destructive to projects: legacy project state (.productune*/, docs) is untouched;
# each project opts in later via `prdt migrate`. See docs/prdt-v1-flip.md for the checklist.
#
# Usage:  prdt-flip.sh              # flip this machine (backs up first)
#         prdt-flip.sh --rollback <backup-dir>
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"   # packages/core
PRDT_HOME="${PRDT_HOME:-$HOME/.prdt}"
CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
SETTINGS="$CLAUDE_DIR/settings.json"
say() { printf '%s\n' "$*"; }

command -v jq >/dev/null 2>&1 || { echo "prdt-flip: jq is required" >&2; exit 1; }

# ── rollback mode ──────────────────────────────────────────────────────────────
if [ "${1:-}" = "--rollback" ]; then
  BK="${2:?usage: prdt-flip.sh --rollback <backup-dir>}"
  [ -f "$BK/settings.json" ] || { echo "no settings.json in $BK" >&2; exit 1; }
  cp "$BK/settings.json" "$SETTINGS"
  [ -f "$BK/legacy-agents.tar" ] && tar -xf "$BK/legacy-agents.tar" -C "$CLAUDE_DIR/agents"
  say "rolled back from $BK (settings + legacy agents 복원)"
  exit 0
fi

# ── 0. backup ──────────────────────────────────────────────────────────────────
TS="$(date +%s)"
BK="$PRDT_HOME/flip-backup-$TS"
mkdir -p "$BK" "$CLAUDE_DIR/agents"
[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"   # 완전 새 기기 방어
cp "$SETTINGS" "$BK/settings.json"
LEGACY_AGENTS="$(cd "$CLAUDE_DIR/agents" 2>/dev/null && ls pdt-*.md* pdtl-*.md* 2>/dev/null || true)"
if [ -n "$LEGACY_AGENTS" ]; then
  # shellcheck disable=SC2086 — agent 파일명엔 공백 없음
  (cd "$CLAUDE_DIR/agents" && tar -cf "$BK/legacy-agents.tar" $LEGACY_AGENTS)
fi
say "0) 백업: $BK"

# ── 실패 시 자동 롤백 (백업 생성 이후의 모든 단계에 적용) ────────────────────
on_err() {
  code=$?
  say ""
  say "✖ flip 실패 (단계: ${STEP:-?}, exit=$code) — 자동 롤백합니다"
  cp "$BK/settings.json" "$SETTINGS" 2>/dev/null || true
  if [ -f "$BK/legacy-agents.tar" ]; then
    tar -xf "$BK/legacy-agents.tar" -C "$CLAUDE_DIR/agents" 2>/dev/null || true
  fi
  if [ -f "$BK/legacy-home.tar.gz" ]; then
    tar -xzf "$BK/legacy-home.tar.gz" -C "$HOME" 2>/dev/null || true
  fi
  say "  롤백 완료 — 기존 productune 환경은 그대로 사용 가능합니다."
  say "  대안: ① 그대로 재시도  ② 수동 절차: docs/prdt-v1-flip.md  ③ 원인 공유 후 지원 요청"
  say "  (백업 보존: $BK — 'prdt-flip.sh --rollback $BK' 로 언제든 수동 원복)"
  exit "$code"
}
trap on_err ERR
fail_at() {
  if [ "${PRDT_FLIP_FAIL_AT:-}" = "$1" ]; then
    say "   (테스트 주입: $1 실패)"
    return 1
  fi
}

# ── 1. ensure prdt is installed (mirror + hooks + agents) ─────────────────────
STEP="install"; say "1) prdt 설치/갱신"; fail_at install
"$ROOT/scripts/prdt-install.sh" >/dev/null

# ── 2. strip legacy full/lite hooks + swap statusline ─────────────────────────
STEP="hooks"; say "2) legacy hook 제거 + statusline 교체"; fail_at hooks
TMP="$(mktemp)"
jq --arg sl "$PRDT_HOME/bin/statusline-prdt.sh" '
  def is_legacy: (.command // "")
    | test("/productune/packages/core/scripts/|/productune-lite/scripts/|statusline-productune");
  .hooks = ((.hooks // {}) | with_entries(
    .value |= (map(.hooks = ((.hooks // []) | map(select(is_legacy | not))))
               | map(select((.hooks | length) > 0)))
  ) | with_entries(select((.value | length) > 0))) |
  .statusLine = {type: "command", command: ("\"" + $sl + "\"")}
' "$SETTINGS" > "$TMP" && mv "$TMP" "$SETTINGS"

# ── 3. retire legacy agents ────────────────────────────────────────────────────
STEP="agents"; say "3) legacy agent 제거 (pdt-*/pdtl-*)"; fail_at agents
rm -f "$CLAUDE_DIR"/agents/pdt-designer.md* "$CLAUDE_DIR"/agents/pdt-developer.md* \
      "$CLAUDE_DIR"/agents/pdt-po.md* "$CLAUDE_DIR"/agents/pdt-qa.md* \
      "$CLAUDE_DIR"/agents/pdtl-designer.md* "$CLAUDE_DIR"/agents/pdtl-developer.md* \
      "$CLAUDE_DIR"/agents/pdtl-po.md* "$CLAUDE_DIR"/agents/pdtl-qa.md*

# ── 3.5 legacy CLI 폐기 안내 shim ──────────────────────────────────────────────
# 구 명령(productune/my-po/productune-lite)은 PATH의 구 repo scripts 디렉토리에서
# 살아있다(freeze 원칙상 그 파일들은 안 지움). ~/.local/bin이 보통 그보다 앞서므로
# 같은 이름의 shim으로 가려서, 실행 시 반쯤 깨지는 대신 전환 안내를 출력한다.
STEP="shim"; say "3.5) legacy CLI shim (폐기 안내)"; fail_at shim
mkdir -p "$HOME/.local/bin"
for cmd in productune my-po productune-lite; do
  rm -f "$HOME/.local/bin/$cmd"
  cat > "$HOME/.local/bin/$cmd" <<'SHIM'
#!/usr/bin/env bash
echo "⏹  이 명령은 은퇴했습니다 — productune v1(prdt)로 대체됐어요."
echo "   새 프로젝트 시작:      prdt   (그리고 claude --agent prdt-po)"
echo "   기존 프로젝트 전환:    prdt migrate   (옵트인, --dry-run 지원)"
echo "   유의점/롤백:           productune repo v1 브랜치 docs/prdt-v1-flip.md"
exit 1
SHIM
  chmod +x "$HOME/.local/bin/$cmd"
done
for cmd in productune my-po productune-lite; do
  R="$(command -v "$cmd" || true)"
  [ "$R" = "$HOME/.local/bin/$cmd" ] || say "   ⚠ '$cmd'이 shim보다 앞선 경로($R)에 있음 — 셸 rc의 구 PATH 항목 제거 필요"
done

# ── 3.7 legacy 홈 정리 (~/.productune, ~/.productune-lite) ─────────────────────
# post-flip에 살아있는 것은 productune.env(GUI legacy 조회 참조)·GUI 앱 상태
# (settings/recents.json)·핸드오프 거절 플래그뿐. 나머지(doctrine 미러, Tier2 개인
# habit, state/usage/스탬프류)는 tar로 통째 백업 후 제거 — 롤백 시 그대로 복원.
STEP="tidy"; say "3.7) legacy 홈 정리 (백업 후)"; fail_at tidy
LEGACY_DIRS=""
[ -d "$HOME/.productune" ] && LEGACY_DIRS=".productune"
[ -d "$HOME/.productune-lite" ] && LEGACY_DIRS="$LEGACY_DIRS .productune-lite"
if [ -n "$LEGACY_DIRS" ]; then
  # shellcheck disable=SC2086
  tar -czf "$BK/legacy-home.tar.gz" -C "$HOME" $LEGACY_DIRS
  if [ -d "$HOME/.productune" ]; then
    KEEP='productune.env|settings.json|recents.json|.prdt-handoff-declined'
    for f in "$HOME/.productune"/* "$HOME/.productune"/.[!.]*; do
      [ -e "$f" ] || continue
      printf '%s' "$(basename "$f")" | grep -qE "^($KEEP)$" || rm -rf "$f"
    done
  fi
  rm -rf "$HOME/.productune-lite"
  # 개인 습관(옛 Tier2)은 백업에 보존 — 살릴 내용은 ~/.prdt/overrides/<persona>.md 로 직접 이관
  say "   정리 완료 (전체 백업: $BK/legacy-home.tar.gz — 개인 습관 이관은 ~/.prdt/overrides/)"
else
  say "   legacy 홈 없음 — 건너뜀"
fi

# ── 4. verify ──────────────────────────────────────────────────────────────────
STEP="verify"; say "4) 검증"; fail_at verify
python3 - "$SETTINGS" "$CLAUDE_DIR" <<'PYEOF'
import json, os, sys
s = json.load(open(sys.argv[1]))
cmds = [h.get("command","") for ev in s.get("hooks",{}).values() for m in ev for h in m.get("hooks",[])]
legacy = [c for c in cmds if "/productune/packages" in c or "productune-lite" in c]
prdt = [c for c in cmds if "/.prdt/" in c]
assert not legacy, f"legacy hook 잔존: {legacy}"
sl = s.get("statusLine",{}).get("command","")
assert sl.rstrip(chr(34)).endswith("statusline-prdt.sh"), f"statusline 미교체: {sl}"
agents = sorted(f for f in os.listdir(os.path.join(sys.argv[2], "agents")) if f.endswith(".md"))
legacy_agents = [a for a in agents if a.startswith(("pdt-","pdtl-"))]
assert not legacy_agents, f"legacy agent 잔존: {legacy_agents}"
print(f"   prdt hook {len(prdt)}개 · statusline=prdt · agents={agents}")
PYEOF

say ""
say "flip 완료. 롤백: prdt-flip.sh --rollback $BK"
say "다음: 각 legacy 프로젝트는 재개 시 'prdt migrate' 1회 (docs/prdt-v1-flip.md 참고)"
