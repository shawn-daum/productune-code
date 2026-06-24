---
ticket_id: T-PATCH-221
version: v0.5
slug: po-turn-hang-detect-and-compacting-label
title: PO turn hang 감지/타임아웃 + "Compacting" 라벨 정확화 (침묵≠압축, 이른 트리거)
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: skipped
qa_loops: 1
requires_user_gate: false
area_tag: po-chat
estimated_complexity: L3
risk_flags: []
created_at: 2026-06-19T00:00:00Z
---

# T-PATCH-221: PO turn hang 감지 + Compacting 라벨

## Request

shawn 보고(2026-06-19): PO 응답 중 하단에 "Compacting conversation"이 **10분 넘게**
떠 있고, 그동안 입력이 잠긴다. "몇 마디 했다고 벌써 compacting" — 너무 이르게 뜸.

cua VM 진단: claude(`--agent pdt-po`)가 **13분째 살아있으나 STAT=S(sleeping), CPU 17초/13분,
자식 프로세스 없음, 세션 jsonl 수 분째 미갱신** = 출력 없이 네트워크/API 또는 MCP에서
**블록(hang)**된 상태. 앱엔 타임아웃/hang 감지가 없어 무한 "compacting" + 입력잠금.

3중 문제:
1. **라벨 오표기** — `po-runner.ts` `SILENCE_TIMEOUT_MS=15_000` 침묵 휴리스틱이 무출력
   15초를 곧장 `emitHealth('compacting')`로 표시. 실제론 thinking/대기/hang일 수 있음.
2. **이른 트리거** — 15초는 짧음(특히 turn1: pdt-po 시스템프롬프트=doctrine로 첫 토큰까지 김).
3. **hang 감지 부재** — claude가 sleeping-blocked로 장시간 무출력이어도 타임아웃·복구 UX 없음.

## 설계 방향

- 침묵 휴리스틱 라벨을 **"Thinking…"**(또는 "Working…")로, **진짜 `compact_pre`/`compact===true`
  이벤트일 때만 "Compacting"**으로 분리(po-runner 713행 실 이벤트는 이미 있음).
- 첫 토큰 전 침묵 임계 상향/적응형(예: turn1 관대).
- **hang 워치독**: N초(예 90~120s) 무출력 + claude sleeping이면 "응답 지연/멈춤 가능 —
  Reset session?" 상태 노출(+선택적 자동 헬스 경고). 입력 잠금 무한 방지.
- (조사) 왜 hang하는가 — pdt-po가 참조하는 MCP(메모리 backend 등)가 VM 미가동이라
  연결 대기로 멈추는지 root-cause 확인(별도일 수 있음).

## Acceptance

- **AC-1**: 무출력 침묵 시 라벨이 "Compacting"이 아니라 "Thinking/Working"으로 표시된다.
- **AC-2**: 실제 compact 이벤트(`compact_pre`)에서만 "Compacting"이 표시된다.
- **AC-3**: 장시간(임계 초과) 무출력+blocked 시 사용자에게 멈춤 가능성 + Reset 경로가 노출된다(무한 잠금 X).
- **AC-4**: turn1 첫 토큰 지연으로 인한 즉시 오표기가 없다.

## Out of scope

- hang root-cause(MCP/API) 자체 수정(조사 후 별도 티켓 가능).

## 구현 (2026-06-19)

- `po-runner.ts`: PoHealthState += `'thinking'|'stalled'`. armSilenceTimeout가 침묵 15s →
  **'thinking'**(healthy일 때만; 'delegating' 다운그레이드 안 함), 추가로 **90s 침묵 →
  'stalled'** 워치독. stdout 재개 시 thinking/stalled → 'healthy' 복귀(무한잠금 해소).
  clearSilenceTimeout가 두 타이머 모두 정리. 진짜 compact는 기존 compact_pre 이벤트만.
- `store/sessionHealth.ts`: 타입 + HEALTH_PRIORITY + severityOf(thinking→info, stalled→warn).
- `SessionHealthSegment.tsx`: thinking(Loader2 spin)·stalled(Clock) icon/label/hint.
- `ChatPanel.tsx` verbForHealth: thinking·stalled 라벨.
- locales en/ko: sessionHealth.thinking/stalled + chat.working.thinking/stalled.

## ⚠️ QA FAIL (2026-06-19, cua 라이브) — 1차 구현 실효 0, status todo로 되돌림

1차 구현(thinking/stalled state + 라벨 + 로케일, build green·smoke PASS)이 **라이브에서
작동 안 함.** cua VM 2 turn 관찰:
- **AC-1**: "정리 중/Compacting"은 안 뜸(하드페일 회피 ✓) — 그러나 의도한 "생각 중/Thinking"도
  안 뜨고 침묵 내내 `"✴ Working · <경과>"`(healthy default)에 머묾.
- **AC-3 FAIL**: turn2가 **~144초 침묵**(90s 임계 한참 초과) 후 스트리밍 시작했는데, 그 동안
  stall 라벨/"평소보다 오래…"/Reset 안내로 **전환 없음** — 무한 카운트업만.

### Root cause (코드 확정)
`po-runner.ts`: `armSilenceTimeout`은 `child.stdout.on('data')`(line ~562) **안에서만** 호출
= "첫 stdout이 와야" 침묵 타이머가 arm됨. 그런데 **토큰-전 순수 침묵**이면 stdout data가
아예 안 와서 armSilenceTimeout이 한 번도 안 불림 → thinking/stalled 타이머 시작 안 됨.
(기존 'compacting' 휴리스틱도 동일 결함을 갖고 있었음 — 라벨만 바꾼 1차 fix는 이 arm-타이밍
버그를 못 고쳐 실효 0.) `WorkingIndicator`는 `verbForHealth(healthState)`를 올바로 쓰므로
state만 emit되면 라벨은 정상 표시됨 — emit이 안 된 게 문제.

### 재수정 방향 (다음 구현)
- **spawnClaude 시작 시점**(spawn 직후, `emitHealth('healthy')` 부근)에 `armSilenceTimeout`를
  1회 호출 → 토큰-전 침묵도 15s→thinking, 90s→stalled로 잡힘. 그 외 thinking/stalled state·
  로케일·복귀 로직은 이미 구현됨(머지된 `673b57f`)이라 재사용.
- AC-1 카피: 사양은 "생각 중/Thinking" 리터럴 기대 — 1차 코드도 그 라벨이나 emit 미발생으로
  미표시였음. arm-타이밍 fix 후 재확인.
- 재검증: cua에서 토큰-전 장침묵 turn 재현(무거운 PRD 프롬프트) → 15s/90s 전환 관찰.

### ⚠️ 정정 (2026-06-22) — 2·3차 QA의 "code 1"은 T-221과 무관(keychain 401 아티팩트)
2·3차 cua QA에서 PO turn이 "claude exited code 1"로 죽어 라벨 검증이 또 막혔는데, 격리
진단 결과 **cua VM의 stale keychain 토큰으로 인한 claude API 401**(하니스 셋업 한계,
제품 버그 아님 — `cua-vm-harness.md` GUI=keychain 교훈 + T-PATCH-231 참조)이었음. arm-on-spawn
fix(branch `fix/T-PATCH-221-arm-on-spawn`, commit ce349e6)나 stdin 가설과 무관. **VM keychain을
fresh 토큰으로 교체하면 turn 정상** → 그 위에서 T-221 라벨(thinking/stalled)을 비로소 검증 가능.
- 남은 작업: clean env(keychain 정상)에서 arm-on-spawn 빌드로 무거운 토큰-전 침묵 turn 재현 →
  15s "생각 중", 90s+ "평소보다 오래…/stalled" 전환 관찰. 통과 시 arm-on-spawn(branch
  `verify/T-PATCH-221-clean`) 머지 + status done.
- **라이브 검증 미완(2026-06-22)**: clean-room(VM 리셋→keychain 인증→온보딩→새 프로젝트 t221test)에서
  arm-on-spawn 빌드로 turn 시도했으나 (a) 침묵 라벨 라이브 윈도우를 cua 스크린샷 캡처로 계속 놓침,
  (b) fresh 프로젝트의 바뀐 레이아웃에서 입력 클릭 landing이 불안정해 turn send 신뢰성 확보 실패.
  cuatest(기존 프로젝트, --resume)에선 clean 빌드+keychain으로 실제 PO 응답 렌더 확인됨(GUI 정상).
  → **라벨 전환 관찰은 human VNC 1회 또는 별도 집중 세션 권장**(cua 자동조작으로는 캡처-타이밍/
  입력-포커스 한계). arm-on-spawn 코드 자체는 빌드 green, 머지 보류(미검증).

### QA 인계 메모 (cua 조작)
- composer 포커스: placeholder 라인(y≈1411) 클릭은 포커스 못 잡음 → **y≈1420(입력박스 하단)** 클릭해야 캐럿 진입(+`pbcopy`/`cmd v`).
- titlebar 포커스는 **(700,86)** (700,48은 Help 메뉴 오발).
- `osascript`/System Events 호출 금지 — TCC Automation 프롬프트가 포커스 가로챔(Don't Allow로 닫기).
- **GUI turn 검증 전 VM Keychain 인증 fresh 확인 필수**(cua-vm-harness.md). 안 그러면 401 code-1로 오진.

## QA 노트
cua VM: PO turn 중 라벨/타임아웃 거동 관찰. 참고: `docs/qa/bookshelf/cua-vm-harness.md`.

## Close (2026-06-22) — MERGE-WITH-CAVEAT (라이브 미검증)

유저 결정(2026-06-22): cua 자동조작 3회 모두 캡처-타이밍/입력-포커스 한계로 라이브 라벨 검증 실패 → **arm-on-spawn fix를 미검증 머지(caveat)로 진행.**
- arm-on-spawn 1줄(`spawnClaude` 내 `activeChild = child` 직후 `armSilenceTimeout(hCtx, cb)`)을 working tree에 적용 — branch `verify/T-PATCH-221-clean` commit e3a883e의 fix를 dev가 T-231 인접편집과 한 패스로 반영(po-runner.ts 동시편집 충돌 회피). idempotency 확인됨(`armSilenceTimeout` 첫 줄이 `clearSilenceTimeout` → stdout data 재arm 안전). build EXIT0.
- thinking/stalled state·로케일·복귀 로직은 기존 머지본(`673b57f`) 재사용. 이번 fix가 토큰-전 순수 침묵에도 타이머 arm되게 해 1차 실효-0 버그(arm이 stdout data 핸들러 안에서만 호출되던 것) 교정.
- ⚠️ **잔여(미검증)**: 무거운 토큰-전 침묵 turn에서 15s "생각 중" / 90s+ "stalled" **라이브 라벨 전환 관찰**은 안 됨 → human VNC 1회 또는 집중 세션 권장(qa_status: skipped = 라이브 re-verify 의도적 deferral). branch `verify/T-PATCH-221-clean`은 코드가 main tree에 반영됐으므로 정리 가능. 미커밋(commit-on-request).

## Deploy live-verify (2026-06-23, cua-VM + VNC) — healthy-path 확인 · 15s/90s 전환 미캡처(caveat 유지)

fresh arm64 dmg + fresh keychain 인증에서 PO turn 다수 관찰:
- **healthy-path ✅**: 정상 turn 동안 라벨 = `"✴ Working · Ns · ↓ tok"` (스트리밍). **거짓 "Compacting" 미발생**(AC-1 핵심 하드페일 회피 확인). 트레이도 idle 점→작업중 persona 스프라이트 정상 전환.
- **15s "Thinking" / 90s "stalled" 전환 ⚠️ 미캡처**: 이 티켓이 기록한 캡처난점 실증. 결정적 repro 3종 모두 하니스 제약에 막힘 — (a) 네트워크 블랙홀(`/etc/hosts`/pf) = **sudo 비번 필요**, (b) claude `UserPromptSubmit` sleep 훅 = **`--print`(headless) 모드에서 블록 안 함**, (c) 일반 무거운 turn = claude가 첫 토큰 전 init/MCP stdout("Added user:design…")을 내보내 **침묵 타이머 리셋** → 순수 15s+ 침묵 안 생김. arm-on-spawn 코드는 main tree 반영본 그대로.
- **결론**: qa_status: skipped(merge-with-caveat) 유지가 타당. 진짜 토큰-전 장침묵/hang이 자연발생할 때 human VNC로 라벨 전환 1회 관찰 권장. 하니스 절차는 `docs/qa/bookshelf/cua-vm-harness.md` §6 참조.
