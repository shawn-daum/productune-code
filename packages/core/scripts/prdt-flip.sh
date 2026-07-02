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
mkdir -p "$BK"
cp "$SETTINGS" "$BK/settings.json"
if ls "$CLAUDE_DIR"/agents/pdt-*.md "$CLAUDE_DIR"/agents/pdtl-*.md >/dev/null 2>&1; then
  (cd "$CLAUDE_DIR/agents" && tar -cf "$BK/legacy-agents.tar" pdt-*.md* pdtl-*.md* 2>/dev/null || true)
fi
say "0) 백업: $BK"

# ── 1. ensure prdt is installed (mirror + hooks + agents) ─────────────────────
say "1) prdt 설치/갱신"
"$ROOT/scripts/prdt-install.sh" >/dev/null

# ── 2. strip legacy full/lite hooks + swap statusline ─────────────────────────
say "2) legacy hook 제거 + statusline 교체"
TMP="$(mktemp)"
jq --arg sl "$PRDT_HOME/bin/statusline-prdt.sh" '
  def is_legacy: (.command // "")
    | test("/productune/packages/core/scripts/|/productune-lite/scripts/|statusline-productune");
  .hooks = ((.hooks // {}) | with_entries(
    .value |= (map(.hooks = ((.hooks // []) | map(select(is_legacy | not))))
               | map(select((.hooks | length) > 0)))
  ) | with_entries(select((.value | length) > 0))) |
  .statusLine = {type: "command", command: $sl}
' "$SETTINGS" > "$TMP" && mv "$TMP" "$SETTINGS"

# ── 3. retire legacy agents ────────────────────────────────────────────────────
say "3) legacy agent 제거 (pdt-*/pdtl-*)"
rm -f "$CLAUDE_DIR"/agents/pdt-designer.md* "$CLAUDE_DIR"/agents/pdt-developer.md* \
      "$CLAUDE_DIR"/agents/pdt-po.md* "$CLAUDE_DIR"/agents/pdt-qa.md* \
      "$CLAUDE_DIR"/agents/pdtl-designer.md* "$CLAUDE_DIR"/agents/pdtl-developer.md* \
      "$CLAUDE_DIR"/agents/pdtl-po.md* "$CLAUDE_DIR"/agents/pdtl-qa.md*

# ── 4. verify ──────────────────────────────────────────────────────────────────
say "4) 검증"
python3 - "$SETTINGS" "$CLAUDE_DIR" <<'PYEOF'
import json, os, sys
s = json.load(open(sys.argv[1]))
cmds = [h.get("command","") for ev in s.get("hooks",{}).values() for m in ev for h in m.get("hooks",[])]
legacy = [c for c in cmds if "/productune/packages" in c or "productune-lite" in c]
prdt = [c for c in cmds if "/.prdt/" in c]
assert not legacy, f"legacy hook 잔존: {legacy}"
sl = s.get("statusLine",{}).get("command","")
assert sl.endswith("statusline-prdt.sh"), f"statusline 미교체: {sl}"
agents = sorted(f for f in os.listdir(os.path.join(sys.argv[2], "agents")) if f.endswith(".md"))
legacy_agents = [a for a in agents if a.startswith(("pdt-","pdtl-"))]
assert not legacy_agents, f"legacy agent 잔존: {legacy_agents}"
print(f"   prdt hook {len(prdt)}개 · statusline=prdt · agents={agents}")
PYEOF

say ""
say "flip 완료. 롤백: prdt-flip.sh --rollback $BK"
say "다음: 각 legacy 프로젝트는 재개 시 'prdt migrate' 1회 (docs/prdt-v1-flip.md 참고)"
