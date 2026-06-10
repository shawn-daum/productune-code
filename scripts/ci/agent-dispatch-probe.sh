#!/usr/bin/env bash
# agent-dispatch-probe.sh — Agent-tool 전환(WP-G) 사전 검증 probe.
#
# worker dispatch 를 `claude --agent` CLI 에서 harness Agent tool 로 옮기기 전에,
# 각 Mac 환경에서 전제 조건을 실측한다. 결과는 PASS/FAIL 표 + 로그 디렉토리.
#
# Usage:
#   scripts/ci/agent-dispatch-probe.sh            # quick: T1 + T2 (핵심 미지수)
#   scripts/ci/agent-dispatch-probe.sh --full     # T1~T6
#
# 전제: claude CLI 로그인 상태. 각 테스트는 실제 API 콜 1회 (짧은 haiku/sonnet 작업).
# 비용/시간 절약을 위해 quick 이 기본.
#
# Tests
#   T1  print-mode 에서 Agent tool 호출 + pdt-* (커스텀 agent) 해석
#   T2  PreToolUse 훅이 Agent tool 에 발화하는 매처 이름 (Task vs Agent vs 미발화)
#   T3  per-agent model override 반영 (stream-json 의 model 필드)
#   T4  병렬 agent 2개 — stream-json 무결 + 두 결과 모두 회수
#   T5  SubagentStop 훅 발화 여부
#   T6  envelope 규율 — subagent 최종 텍스트가 순수 JSON 으로 회수되는지
#
# 수동/별도: Playwright MCP 도달(서버 기동 필요) · --resume 후 SendMessage 연속성 · 429 표면화.

set -u

MODE="${1:-quick}"
OUT="$(mktemp -d)/agent-probe"
mkdir -p "$OUT"
PASS=0; FAIL=0
note() { printf '  %s\n' "$*"; }
result() { # $1=Tn $2=PASS|FAIL $3=note
  if [ "$2" = "PASS" ]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); fi
  printf '%-4s %-5s %s\n' "$1" "$2" "$3"
}

command -v claude >/dev/null 2>&1 || { echo "claude CLI 없음"; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "jq 없음"; exit 1; }

# macOS 기본엔 GNU timeout 이 없다 — gtimeout(coreutils) → timeout → 폴백(무제한) 순.
if command -v timeout >/dev/null 2>&1; then TMOUT_CMD="timeout 240"
elif command -v gtimeout >/dev/null 2>&1; then TMOUT_CMD="gtimeout 240"
else TMOUT_CMD=""; echo "[warn] timeout/gtimeout 없음 — 무제한 실행"; fi
[ -f "$HOME/.claude/agents/pdt-qa.md" ] || echo "[warn] ~/.claude/agents/pdt-qa.md 없음 — T1 이 builtin 해석으로 빠질 수 있음"

echo "== agent-dispatch-probe ($MODE) — logs: $OUT"
echo "claude: $(claude --version 2>/dev/null | head -1)"

# 마커 훅을 가진 임시 프로젝트 (project-level .claude/settings.json 은 해당 cwd 세션에만 적용)
PROJ="$OUT/proj"; mkdir -p "$PROJ/.claude"
cat > "$PROJ/.claude/settings.json" <<EOF
{
  "hooks": {
    "PreToolUse": [
      {"matcher": "Task",  "hooks": [{"type": "command", "command": "touch $OUT/marker-pretool-Task"}]},
      {"matcher": "Agent", "hooks": [{"type": "command", "command": "touch $OUT/marker-pretool-Agent"}]}
    ],
    "SubagentStop": [
      {"hooks": [{"type": "command", "command": "touch $OUT/marker-subagentstop"}]}
    ]
  }
}
EOF

run_claude() { # $1=outfile $2=extra args string(eval-free, 미사용시 "") ; prompt = stdin
  local f="$1"; shift
  ( cd "$PROJ" && $TMOUT_CMD claude -p --output-format json --allowedTools "Task Agent" "$@" ) > "$f" 2>"$f.err"
}

# ── T1 + T2 (+T5 부수): Agent tool in print mode + pdt-qa 해석 + 훅 매처 ──────
printf 'Use the Agent tool exactly once with subagent_type "pdt-qa" and prompt "Reply with exactly: PONG". Then output the single word the agent returned, nothing else.' \
  | run_claude "$OUT/t1.json"
T1_RESULT="$(jq -r '.result // ""' "$OUT/t1.json" 2>/dev/null)"
if printf '%s' "$T1_RESULT" | grep -q "PONG"; then
  result T1 PASS "print-mode Agent tool + pdt-qa 해석 OK"
else
  result T1 FAIL "result='$(printf '%s' "$T1_RESULT" | head -c 80)' (로그: t1.json/.err)"
fi

if [ -f "$OUT/marker-pretool-Task" ] || [ -f "$OUT/marker-pretool-Agent" ]; then
  M=""; [ -f "$OUT/marker-pretool-Task" ] && M="Task"; [ -f "$OUT/marker-pretool-Agent" ] && M="$M Agent"
  result T2 PASS "PreToolUse 발화 — matcher:$M (훅 재작성 시 이 이름 사용)"
else
  result T2 FAIL "PreToolUse 훅이 Agent tool 에 미발화 — 훅 기반 가드 재설계 필요"
fi

if [ "$MODE" != "--full" ]; then
  echo "== quick 완료: PASS=$PASS FAIL=$FAIL (전체는 --full)"
  exit $([ "$FAIL" = 0 ] && echo 0 || echo 1)
fi

# ── T5: SubagentStop (T1 호출에서 이미 발화했어야 함) ─────────────────────────
if [ -f "$OUT/marker-subagentstop" ]; then
  result T5 PASS "SubagentStop 발화 (stop-verify 대체 가능)"
else
  result T5 FAIL "SubagentStop 미발화"
fi

# ── T3: model override ────────────────────────────────────────────────────────
printf 'Use the Agent tool once: subagent_type "pdt-qa", model "haiku", prompt "Reply with exactly: OK". Then output the word it returned.' \
  | ( cd "$PROJ" && $TMOUT_CMD claude -p --output-format stream-json --verbose --allowedTools "Task Agent" ) > "$OUT/t3.jsonl" 2>"$OUT/t3.err"
if grep -o '"model":"[^"]*haiku[^"]*"' "$OUT/t3.jsonl" | head -1 | grep -q haiku; then
  result T3 PASS "subagent model=haiku 가 stream 에서 확인됨"
else
  result T3 FAIL "haiku model 미확인 (override 미반영 또는 stream 에 model 필드 없음 — t3.jsonl 확인)"
fi

# ── T4: 병렬 2 agents ─────────────────────────────────────────────────────────
printf 'Use the Agent tool twice IN PARALLEL (both calls in one response): subagent_type "pdt-qa", prompts "Reply with exactly: ALPHA" and "Reply with exactly: BRAVO". Then output both returned words separated by a space.' \
  | run_claude "$OUT/t4.json"
T4_RESULT="$(jq -r '.result // ""' "$OUT/t4.json" 2>/dev/null)"
if printf '%s' "$T4_RESULT" | grep -q "ALPHA" && printf '%s' "$T4_RESULT" | grep -q "BRAVO"; then
  result T4 PASS "병렬 2-agent 결과 모두 회수"
else
  result T4 FAIL "result='$(printf '%s' "$T4_RESULT" | head -c 80)'"
fi

# ── T6: envelope 규율 ─────────────────────────────────────────────────────────
printf 'Use the Agent tool once with subagent_type "pdt-qa" and this prompt: Return ONLY this JSON, no prose: {"persona":"pdt-qa","task":"probe","summary":"ok","confidence":1}. Then output the agent return verbatim.' \
  | run_claude "$OUT/t6.json"
T6_RESULT="$(jq -r '.result // ""' "$OUT/t6.json" 2>/dev/null)"
if printf '%s' "$T6_RESULT" | python3 -c 'import json,sys,re; m=re.search(r"\{.*\}", sys.stdin.read(), re.S); json.loads(m.group(0)) if m else exit(1)' 2>/dev/null; then
  result T6 PASS "envelope JSON 회수·파싱 OK"
else
  result T6 FAIL "JSON 미회수: '$(printf '%s' "$T6_RESULT" | head -c 80)'"
fi

echo "== full 완료: PASS=$PASS FAIL=$FAIL — logs: $OUT"
exit $([ "$FAIL" = 0 ] && echo 0 || echo 1)
