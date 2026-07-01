---
ticket_id: T-PATCH-281
version: v0.6
slug: worker-slot-ux-redesign
title: worker live-stream slot UX 재설계 — scroll+expand · per-persona anchor · prose 우선 · turn 후 결과 유지(cost/duration)
type: impl
status: user-verify
phase: 3
assignee: pdt-developer
requires_qa: true
requires_user_gate: false  # mockup gate WAIVED (user call) — live app-review replaces it; this is dogfooding the GUI itself, user rebuilds + reviews the running app
area_tag: gui
estimated_complexity: L4
risk_flags: [gui]
created_at: 2026-07-01T00:00:00Z
---

# T-PATCH-281: worker live-stream slot UX 재설계

## Request

shawn 요청(worker live-stream 슬롯 — dispatch 시 뜨는 "Designer · live" 패널, T-PATCH-279에서 sprite presence + stream 슬롯 방금 shipped). 동작은 만족, UX 재설계 5건:

1. **Overflow** — 줄이 많아지면 슬롯이 눌려 찌부러짐. **스크롤**로 바꿀 것. 그리고 슬롯을 **클릭하면 큰 모달/툴팁형 오버레이로 확장**해 크게 읽고, 다시 클릭하면 닫기(토글).
2. **per-persona 위치** — 슬롯이 지금 고정 위치(Designer·Developer 사이에 떠 있음)가 아니라, **작업 중인 그 페르소나 sprite 바로 오른쪽에** 붙어 나타날 것.
3. **"READ-ONLY" 배지 텍스트 제거**.
4. **내용: raw tool call 대신 output/자연어를 보여줄 것.** 지금은 tool trace("Read x", "Bash find …")만 뜸. 워커의 실제 산출/무엇을 하는지를 자연어로 보이게 할 수 있나? — **타당성 평가 필요.**
5. **turn 종료 후에도 결과 유지 + 비용 표시.** parent turn 이 돌아와 페르소나가 회색/idle 이 돼도 결과 패널은 **남아서 읽을 수 있게** — 다음 turn(유저 채팅 or 다음 task 시작) 때만 지워질 것. **토큰 사용량 + 작업 소요시간**도 패널에 표시.

## Acceptance

- **AC-1 (scroll)**: Given 워커가 STREAM_TAIL_MAX 초과 분량을 출력 / When 슬롯이 렌더 / Then 슬롯은 고정 높이를 유지하고 내부가 세로 스크롤되며(최신 줄이 바닥에 auto-follow), 슬롯 자체 높이가 늘거나 chip 행을 밀지 않는다. 콘텐츠가 슬롯을 찌부러뜨리지 않는다.
- **AC-2 (expand toggle)**: Given 슬롯이 보이는 상태 / When 슬롯 본문을 클릭 / Then 더 큰 오버레이(확장 뷰)가 열려 전체 스트림을 크게 읽을 수 있고, 다시 클릭 또는 Esc 또는 backdrop 클릭으로 닫힌다(토글). 확장 뷰는 명시적 닫기 affordance(×)를 가진다(ux §5 no dead end). 확장 중에도 새 줄이 실시간 반영된다.
- **AC-3 (per-persona anchor)**: Given 특정 워커(designer/dev/qa) 하나가 working / When 슬롯이 뜸 / Then 슬롯(또는 그 앵커 표식)이 **그 페르소나 chip의 오른쪽에** 위치 인지되도록 렌더된다 — 두 chip 사이에 무관하게 떠 있지 않는다. bar 폭이 좁아 inline이 불가하면 stacked fallback으로 강등하되(현행 STREAM_INLINE_BP 로직 유지), 이때도 "어느 페르소나의 출력인지" 헤더 라벨/색으로 명확해야 한다.
- **AC-4 (no READ-ONLY badge)**: Given 슬롯 헤더 / When 렌더 / Then "READ-ONLY"(streamRoStyle / `workspace.presence.readOnly`) 배지 텍스트가 보이지 않는다. (읽기전용 성격은 non-interactive 본문 + 커서 없음으로 이미 전달됨.)
- **AC-5 (content: prose 우선/hybrid)**: Given 워커가 자연어 출력과 tool call을 섞어 냄 / When 슬롯 렌더 / Then #4 타당성 결론(아래 Plan §Feasibility)에 따라 결정된 표시 정책이 적용된다 — 최소 요건: 워커 prose 줄이 tool 줄과 시각적으로 구분(예: tool 줄은 mono + faint, prose 줄은 sans + muted)되고, prose가 있을 때 prose가 우선 노출된다. (순수 tool-only 구간은 tool 줄 fallback 유지 — 빈 슬롯 금지, ux §4 pending≠empty.)
- **AC-6 (persist after turn)**: Given 워커 완료로 페르소나가 done→idle 전이 / When parent turn이 종료 / Then 그 워커의 결과 패널은 **즉시 사라지지 않고 유지**된다. 다음 turn 신호(유저가 채팅 전송 OR 어떤 페르소나가 새 task로 working 진입) 도착 시에만 clear된다. 현행 2s done→idle auto-collapse가 슬롯을 접지 않도록 재조정(아래 Plan §Persist-reconcile).
- **AC-7 (cost + duration)**: Given 워커 완료 / When 결과 패널이 유지되는 동안 / Then 토큰 사용량(input/output, 가능하면 cache 포함)과 작업 소요시간(task_started→완료)이 패널에 표시된다. 데이터 미도착(usage 없음)이면 해당 필드는 조용히 생략(garbage/0 금지, ux §4).
- **AC-8 (a11y/motion 무회귀)**: role="log" aria-live 유지, 확장 오버레이는 focusable + Esc, prefers-reduced-motion 존중. 대비 ≥ 4.5:1(본문)·≥3:1(상태 도트/보더). WCAG 무회귀.
- **AC-9 (무회귀)**: PO는 이 슬롯에서 HARD-EXCLUDED(selectActiveWorker) 유지. 병렬 워커(designer+dev 동시)에서 latest-active-1 규칙 유지 또는 명시적 개선. sprite chip working/idle/done 애니메이션 무회귀. i18n en/ko 동시 갱신, protected vocab 보존.

## Out of scope

- 여러 워커 슬롯 동시 표시(멀티 슬롯). 현행 latest-active-1 유지 — 병렬 워커 각각의 앵커드 슬롯은 별도 후속(unresolved에 기록).
- 워커 출력의 chat.json 영속화/히스토리 재생. 슬롯은 in-session ephemeral 유지(다음 turn에 clear).
- cost archive(turns.jsonl) 파이프라인 변경. AC-7은 presence 경로로 usage/duration을 **추가 전달**할 뿐, subagent-cost.ts의 turns.jsonl 기록은 건드리지 않는다.
- 새 시각 아이덴티티/시그니처. 이 표면은 utility UI → anti-default 기준 "restraint"가 정답(loud signature 금지).

## Plan

### Design decisions (designer 확정)

- **표면 성격 = utility UI** → anti-default.md 기준 **restraint**. 기존 DS 토큰(--surface-base/-panel, --border, --txt-muted, PERSONA_COLORS, --font-mono)만 사용. 새 palette/gradient/card-spam 금지. 시그니처 요소 강제 금지(utility에 loud = fail).
- **읽기전용 전달 방식 전환(#3)**: 배지 텍스트 제거 대신 non-interactive 본문(pointer 커서 없음, 텍스트 선택만 허용) + live 도트로 성격 전달. 헤더 우측 공간은 #7 메타(토큰/소요시간)로 재활용 → 배지 제거가 헤더에 빈칸을 남기지 않음.

### §Feasibility — #4 (raw tool calls → natural language) 판정: **FEASIBLE (hybrid, prose-first)**

근거(코드 확인):
- `po:worker-stream` 채널은 이미 **두 소스**를 실어 나른다 — (a) 워커 **prose**(nested text_delta) → `handleWorkerText` 가 '\n' 경계로 whole-line coalesce(po-runner.ts:1266-1275, 772-789); (b) 워커 **tool call** → `buildWorkerToolLine`("Read x"/"Bash …")(po-runner.ts:1394-1398). 둘 다 실행순서로 `streamTail[persona]` 한 ring에 평평하게 쌓인다.
- 즉 **자연어 output은 이미 available** — 지금 슬롯이 tool 줄만 보이는 듯한 건, prose와 tool 줄이 한 배열에 섞여 들어와 renderer가 둘을 구분하지 못해서다. prose가 실제로 흐르는지는 워커별로 다름(prose를 거의 안 내는 워커도 있음) → 순수 tool-only 구간 대비 필요.
- **결론(표시 정책)**: **hybrid, prose-first**. 채널 payload에 line **kind**(`'prose' | 'tool'`)를 실어 store가 구분 → renderer가 prose 줄 우선(sans, muted, 강조)·tool 줄 종속(mono, faint, 접힘/축약). prose 없을 때만 tool 줄로 fallback(빈 슬롯 금지). 완료 시 `task_notification.summary`(워커 최종 요약, po-runner.ts:1296)를 결과 패널의 headline prose로 승격 검토(AC-5/AC-6 결합점).
- **불가능한 것**: 워커의 "최종 산출물 자체"(예: 완성된 mockup HTML) 렌더링은 out — 슬롯은 진행 스트림 tail이지 산출물 뷰어가 아니다. summary/prose 텍스트까지가 realistic.

dev 작업(택1/조합, prose-first hybrid 권장):
- **main(po-runner.ts)**: `onWorkerStream(persona, line)` payload에 `kind: 'prose'|'tool'` 추가 — `handleWorkerText`→'prose', `buildWorkerToolLine`→'tool'. `emitWorkerStream` 시그니처 확장. **cost/duration(AC-7)**: `task_started` 타임스탬프를 delegation 바인딩 시 기록(`toolUseIdByTaskId` 이웃에 startedAt 맵), `task_notification`/`task_progress`의 `usage` 를 presence로도 전달하는 신호 추가(예: `onWorkerMeta(persona, {usage, startedAt, completedAt})`) — turns.jsonl 경로(subagent-cost.ts)는 무변경, 별도 read-only 전달.
- **preload.ts**: `poOnWorkerStream` payload 타입 확장 + `poOnWorkerMeta` 신설.
- **store(personaPresence.ts)**: `streamTail` 요소를 `{text, kind}` 로(또는 병렬 kind 배열). STREAM_TAIL_MAX 유지하되 **확장 뷰용 더 긴 buffer**(예: STREAM_LOG_MAX ~200) 추가 검토 — 슬롯 tail은 짧게, expand는 길게. per-persona `workerMeta`(usage/startedAt/completedAt) 필드 추가. **persist(AC-6)**: 아래 §Persist-reconcile.
- **renderer(PersonaPresenceBar.tsx)**: WorkerStreamSlot을 (a) 고정높이+내부 overflow-y scroll+auto-follow(AC-1), (b) 클릭→확장 오버레이 토글(AC-2, `BaseDirtyModal` 계열 or portal+backdrop 재사용; Esc/backdrop/× 닫기), (c) prose/tool kind별 스타일 분기(AC-5), (d) READ-ONLY 제거→헤더 우측에 토큰/소요시간 메타(AC-7), (e) **앵커링(AC-3)**: 슬롯을 chip 행 바깥 고정슬롯이 아니라 active worker chip 오른쪽에 배치 — inline layout에서 chip 순서를 이용해 해당 chip 직후에 슬롯을 렌더(PERSONA_ORDER 순회 중 activeWorker chip 뒤에 삽입) 또는 chip의 getBoundingClientRect로 앵커(PhaseBreadcrumb 팝오버 패턴 참고). stacked fallback은 현행 유지 + 헤더 라벨/색으로 소속 명시.

### §Persist-reconcile — AC-6 vs 현행 2s done→idle auto-collapse (핵심 충돌 해소)

현행 충돌: `personaPresence.ts` `setPersonaState('done')` → 2s 후 `dismissDone` → `streamTail[persona]=[]` (슬롯 즉시 소멸). 또 `poEvents.ts` subagent-done 핸들러가 `clearStreamTail` 즉시 호출. 이 둘이 AC-6(다음 turn까지 유지)와 정면 충돌.

해소안(권장):
- **tail(진행중 라이브)과 result(완료 후 유지)를 분리**. done 전이 시 `streamTail`을 비우지 말고 **`workerResult[persona] = {lines(마지막 N), summary, usage, startedAt, completedAt, doneAt}`** 로 **승격(freeze)**. auto-idle(sprite grey)은 지금대로 2s 후 진행(sprite는 idle, 하지만 result 패널은 별도 생존).
- `clearStreamTail`(poEvents subagent-done)은 라이브 ring만 정리 — result 승격 후 호출되도록 순서 조정(승격 → clear tail).
- **result clear 트리거(다음 turn)**: (i) 유저 채팅 전송 = `workspace.streaming` false→true 전이(onMsgId) 또는 handleSubmit, (ii) 어떤 워커가 새로 `working` 진입(setPersonaState working). 둘 중 먼저 오는 신호에서 `clearWorkerResult(all)`. 구현: workspace turn-start 훅 또는 personaPresence의 working 전이에서 stale result 청소.
- **엣지**: 병렬 워커가 순차 완료 → 각 result는 자기 doneAt으로 독립 freeze, 슬롯은 latest-active-1 규칙상 마지막 것 표시(멀티 동시표시는 out-of-scope). session restart(resetAll)는 result도 clear.

### §QA scope table (type=impl)

| # | 검증 항목 | 방법 |
|:--|:--|:--|
| 1 | AC-1 scroll: STREAM_TAIL_MAX 초과 시 슬롯 고정높이+내부스크롤, chip행 안 밀림 | 워커 다량 출력 재현, DOM 높이 확인 |
| 2 | AC-2 expand: 클릭 토글 open/close, Esc/backdrop/× 닫기, 확장중 실시간 갱신 | 수동 인터랙션 |
| 3 | AC-3 anchor: 슬롯이 active worker chip 오른쪽 인지, stacked fallback 소속 명확 | designer/dev/qa 각각 dispatch, 위치 확인 |
| 4 | AC-4 no badge: READ-ONLY 텍스트 부재 | 헤더 DOM grep |
| 5 | AC-5 content: prose/tool kind 구분, prose-first, tool-only fallback | prose 내는 워커 + tool-only 구간 둘 다 |
| 6 | AC-6 persist: done→idle 후 패널 생존, 다음 turn(채팅/새 working)에만 clear | turn 경계 재현, 2s 경과 후 패널 잔존 확인 |
| 7 | AC-7 cost/duration: 토큰/소요시간 표시, usage 미도착 시 조용히 생략 | 완료 워커 메타 확인 |
| 8 | AC-8 a11y: role/aria-live, focus/Esc, reduced-motion, 대비 | axe/수동 |
| 9 | AC-9 무회귀: PO 제외, 병렬, sprite anim, i18n en/ko | 회귀 스윕 |

### Mockup gate (designer→user, dev 착수 전)

#1(expand 모달) + #3(per-persona anchoring)은 **layout-heavy 구조 변경** → **정적 렌더 mockup 1건이 dev 착수 전에 필요**(designer 산출, user gate). 3안 full 시퀀스(phase2-3-ticket-sequence)까지는 불요 — patch-tier 재설계라 **단일 목업 후보 1**로 (a) inline anchored slot(collapsed, scroll, cost/duration 헤더) + (b) expanded overlay 상태 2뷰를 한 화면에 제시. requires_user_gate:true 는 이 목업 게이트를 가리킴. anti-default: utility=restraint 기준으로 self-check + reverse-slop 통과 후 surface.

## Outcome
**Code-complete + QA CLEAN (static+build). Pending user live-review.**

dev(4-layer): po-runner.ts(worker-stream payload `kind:'prose'|'tool'` + task_started `startedAt` + `onWorkerMeta` usage/duration 전달, turns.jsonl 무변경) · preload.ts(payload 타입 + `poOnWorkerMeta`) · personaPresence.ts(`streamTail{text,kind}` + `STREAM_LOG_MAX=200` + `workerResult` freeze + clear 트리거: 다음 turn onMsgId / 새 worker working / resetAll) · PersonaPresenceBar.tsx(고정높이+내부 scroll+auto-follow / 클릭→portal 오버레이 토글 Esc·backdrop·× / prose-first hybrid 스타일 / READ-ONLY 제거→헤더우측 cost·duration / active-worker chip 우측 앵커 + stacked fallback). AC-1~9 코드상 충족, build(pnpm build tsc+locale+vite)+vitest 3/3 pass. T-275/276 파일 미접촉.

**QA (qa-static, CLEAN):** AC-1~9 전부 PASS. build PASS(tsc+locale+vite+electron exit0), vitest 3/3. 핵심 검증: AC-6 persist — freeze-BEFORE-clear 순서 정확(poEvents subagent-done → freezeWorkerResult THEN clearStreamTail), dismissDone(2s)는 streamTail만 비우고 workerResult 불변, clear는 next-turn onMsgId/새 worker working/resetAll에서만 → mid-turn race 없음. AC-9 PO HARD-EXCLUDED + parallel latest-active-1 + sprite anim + i18n en/ko parity 무회귀.

**남은 일:**
1. **live 리뷰(사용자)** — dev가 실물 확인 필요라 명시: (a) 앵커 슬롯 레이아웃(active worker chip 우측, 순서 변할 때 시프트 읽힘), (b) prose vs tool 실제 흐름(워커가 prose 충분히 내는지), (c) cost/duration 값 현실성, (d) txt-faint meta-badge 대비 ≥4.5:1(render-judged).

## Unresolved
- MINOR/low (AC-7 legacy path): legacy BLOCKING dispatch(po-runner.ts:1737-1748, non-agent-teams CLI)는 `forwardWorkerCompletionMeta` 없이 `completeDelegation` 호출 → sync CLI에선 frozen result에 cost/duration/summary 미표시. AC-7이 usage 부재 시 silent omit 허용 + default runtime=agent-teams(primary 경로 완전 배선)라 non-blocking. legacy-CLI parity 원하면 optional 후속.
- 멀티 워커 슬롯 동시 표시(현행 latest-active-1) — out-of-scope, 별도 후속.

## Persona Activity
PO orchestrated. designer-ux(plan; 목업은 user가 waive) · dev-bugfix(impl, 279+280도 담당).

## Persona Activity
(PO-managed)
