---
ticket_id: T-PATCH-159
version: v0.5
slug: gui-build-button
title: GUI Build(+Smoke) 버튼 — surfaces config 기반 직접 실행 (zero-token)
type: code
status: review
phase: 3
assignee: pdt-designer
requires_qa: true
qa_status:
requires_user_gate: false
area_tag: gui-build-button
risk_flags: [design-needed, child-process-exec]
estimated_complexity: L4
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-159: GUI Build 버튼 (design-first)

## 동기 (user)
PO가 매번 빌드해주는 것도 아니고, 빌드 커맨드를 매번 까먹음 → GUI에 Build 버튼. config의 surfaces build 커맨드 참조.

## ★PO 설계 판단 (user "생각좀해주라"에 대한 답)

**Q: 버튼 누르면 PO가 빌드 → build에 토큰 소모?**
**A: 아니오. PO/LLM 거치지 말 것.** 빌드는 결정적 shell 커맨드(`surfaces.<s>.build`) — electron `child_process`로 **직접 실행**하면 됨. LLM 무관 → **토큰 0**. PO turn과 완전 별개의 dev-tool 액션.

**config 소스**: `.productune/config.json`의 `surfaces` (이미 존재):
- `gui.build` = "pnpm --filter @productune/gui build", `gui.smoke` = "pnpm --filter @productune/gui smoke"
- `core.build` = "pnpm --filter @productune/core build"
→ 버튼이 이걸 읽어 실행. surface가 여러 개라 **surface picker**(gui/core) 또는 "build all".

**env**: spawn `cwd = projectDir` + `process.env` 상속. 빌드 커맨드 자체가 필요한 env(.env 등)는 그 도구(pnpm 등)가 알아서 읽음 → 별도 env 배선 불필요. (특정 surface가 추가 env 필요하면 surface-config에 env 키 확장 검토 — 현재는 불요.)

**PO Log Terminal(T-P4-054 backlog)와 관계**: 빌드 출력 패널 = 로그/터미널 뷰. 이 버튼의 output 패널이 그 터미널 인프라의 선구/공유가 될 수 있음.

## Designer가 plan-first로 결정할 UX (open)
1. **버튼 위치**: status bar / 툴바 / Surfaces 패널 中. surface picker(gui/core) 형태.
2. **출력 패널**: stdout/stderr 스트리밍 표시 + running/pass/fail 상태. (어디에 — 새 탭? 하단 패널?)
3. **Smoke 버튼**: build와 같은 패턴으로 `surfaces.<s>.smoke`도 (smoke_driver 고려 — playwright-electron 등).
4. **동시 실행/취소**: 빌드 중 재클릭/취소 처리.
5. **결과 알림**: B3 OS 알림 연동 여부.

## 아키텍처 (dev, designer plan 후)
- 신규 IPC `surface:build(projectDir, surfaceKey)` (+ `surface:smoke`) → `child_process.spawn`(shell, cwd=projectDir, env 상속) → stdout/stderr 이벤트 스트리밍 → renderer 패널. **LLM 무관, 토큰 0.**
- surfaces 스키마: `qa/bookshelf/surface-config-schema.md` 참조.

## Note
- design-first: Designer가 UX(위치/패널/picker) 확정 + 티켓 spec 보강 → dev IPC/exec/패널 구현 → QA.
- 핵심 원칙(못박음): **빌드는 직접 exec, PO/토큰 경유 금지.**

---

## Designer 확정 spec (plan-first, T-PATCH-159 · 2026-06-16)

코드베이스 그라운딩 후 dev가 파일·라인 수준으로 바로 구현 가능하도록 확정. **.ts/.tsx 작성 금지(plan-only)** — 아래는 구현 계약(contract)만.

### D0. zero-token 원칙 (★못박힘 — 코드 레벨 보장)
- 신규 IPC `surface:build` / `surface:smoke`는 **`@productune/core` LLM·claude·po-runner를 절대 import 하지 않는다.** child_process.spawn 만 사용. → claude CLI 미기동 → **토큰 0**.
- po-runner.ts 의 `runPoTurn`/`spawnClaude` 경로와 **완전 분리**된 별도 모듈(`electron/surface-runner.ts`). deploy:execute 처럼 `assertNotPoTurn()` 가드를 둘 필요는 **없음**(빌드는 PO turn 중 사용자가 눌러도 무해 — claude child 와 무관, 동시 실행 가능). 단 renderer 버튼은 `event.isTrusted` 확인(자동 호출 차단, 아래 D5 보안).
- 근거 패턴: deploy.ts 는 core API(LLM 무관 네트워크 호출)를 쓰지만, 본 기능은 그보다 더 단순 — 순수 shell spawn.

### D1. 버튼 위치 + surface picker — **하단 StatusBar 우측 클러스터**
- 후보 비교: ActivityBar(좌측 48px 아이콘바)는 전역 네비라 부적합 / 별도 툴바 신설은 chrome 추가비용 큼 / **StatusBar.tsx 우측 `placeholder` 자리**가 "run status"용으로 이미 예약됨(StatusBar.tsx:116 주석 "future: auto-save / deploy status"). → **여기 확정.**
- 신규 컴포넌트 `src/components/workspace/BuildSegment.tsx` (SessionHealthSegment.tsx 패턴 미러):
  - StatusBar.tsx:116-119 의 `<span style={placeholder}>` 를 `<BuildSegment />` 로 교체(placeholder 텍스트는 BuildSegment 내부 idle 상태로 흡수).
  - 렌더: `▶ Build` 1차 버튼 + 우측에 surface drop-up(StatusBar 는 화면 최하단이므로 dropdown 은 **위로** 열림 — StatusBar.tsx:188 `dropdownPanel { bottom: 28 }` 패턴 재사용).
- **surface picker 형태(드롭업)**: config.surfaces 키를 읽어 동적 생성. 각 surface 행 = `[surfaceKey] · Build · Smoke` (Build/Smoke 분리 버튼). `smoke===null` 인 surface(core)는 Smoke 버튼 **disabled**(dimmed, title="smoke 미정의"). "Build all" 항목은 **v1 OOS**(open question OQ-1).
- surface 가 1개뿐이면 drop-up 생략하고 인라인 `▶ Build [surface]` 직접 노출(점진적 개선, v1 은 항상 drop-up 으로 통일해도 무방 — dev 재량, 단순쪽 권장).

### D2. config.surfaces 읽기 IPC (신규 — 현재 없음)
- 그라운딩 결과: surfaces 를 renderer 로 주는 IPC가 **없음**(project.ts 에 config 일부만 산발 노출, surfaces 미노출). → 신규 필요.
- 신규 IPC `surface:list(projectDir)` → `{ ok: boolean; surfaces?: Record<string,{ type:string; build:string|null; smoke:string|null; smoke_driver:string }>; error?: string }`.
  - 구현: `path.join(projectDir,'.productune','config.json')` 읽어 `config.surfaces` 반환(project.ts 의 readFileSync+JSON.parse 패턴 재사용, ipc/project.ts:135/205/430 참조). 파일 부재/파싱실패 → `{ok:false}`.
- BuildSegment 마운트(또는 drop-up 첫 오픈) 시 1회 호출 → 메모리 캐시. project 전환 시 재호출(workspace store `project.projectDir` 의존).

### D3. 실행 IPC + spawn 아키텍처 (zero-token 핵심)
신규 파일 **`packages/gui/electron/surface-runner.ts`** (po-runner.ts 와 형제, 단 LLM 의존 0):
- export `runSurfaceCommand(opts:{ projectDir:string; surfaceKey:string; kind:'build'|'smoke' }, cb)` — po-runner.ts `spawnClaude` 의 stdout/stderr 라인버퍼 + close 핸들러 골격을 **그대로 차용**(po-runner.ts:484-557 패턴), 단 claude 가 아니라 surface 커맨드를 spawn.
- spawn 방식: 커맨드는 `"pnpm --filter @productune/gui build"` 같은 **공백 포함 shell 문자열** → `spawn(cmd, { shell:true, cwd: opts.projectDir, env: process.env, stdio:['ignore','pipe','pipe'] })`. (po-runner 는 args 배열+shell 없이 spawn 하지만, surface 커맨드는 shell 문자열이라 `shell:true` 필요 — D5 보안 참조.)
- env: `process.env` **상속만**(po-runner 가 NO_COLOR 추가하듯, 여기선 `{ ...process.env, FORCE_COLOR:'0' }` 권장 — ANSI 패널 오염 방지). 추가 env 배선 불요(티켓 동기 §env 확정).
- 신규 IPC handler (신규 파일 `electron/ipc/surface.ts`, main.ts 에 `registerSurface()` 추가 — main.ts:14/62 패턴):
  - `surface:list` (D2)
  - `surface:run` (args: `{ projectDir, surfaceKey, kind }`) → 활성 child 가 이미 있으면 `{ok:false, error:'already-running'}`(D4). 아니면 `runSurfaceCommand` 기동, 즉시 `{ok:true, runId}` 반환.
  - `surface:cancel` (args: `{ runId }`) → 해당 child `SIGTERM`(po-runner abortActiveTurn:244 패턴).
- 스트리밍 이벤트(po-runner emitToWebContents:1309 미러):
  - `surface:onStart`  `{ runId, surfaceKey, kind, command }`
  - `surface:onOutput` `{ runId, stream:'stdout'|'stderr', chunk }`  (라인 단위)
  - `surface:onDone`   `{ runId, code:number|null, status:'pass'|'fail'|'cancelled' }`  (exit 0 → pass / 0 아님 → fail / SIGTERM → cancelled)
- preload.ts: `api.surface = { list, run, cancel, onStart, onOutput, onDone }` 노출(preload.ts:926 `deploy:{...}` 블록 + :958 `ipcRenderer.on` 구독+unsubscribe 패턴 미러).

### D4. 출력 패널 — **신규 탭 type `'build-output'`** (PO Log Terminal 공유 인프라 선구)
- 결정: 하단 패널 신설(새 grid area)은 WorkspaceShell 레이아웃 침습 큼 / 챗 패널 오염 금지. → **pane-tree 탭 시스템 재사용**(workspace.ts TabType). 이미 `'terminal'` type 자리가 PlaceholderTab 으로 비어있음(TabContent.tsx:108) — **이를 빌드 로그 터미널의 첫 실구현으로 채운다**(티켓 §PO Log Terminal "선구/공유" 의도와 정합).
- 구현:
  - workspace.ts:10-37 `TabType` 에 `'build-output'` 추가(또는 기존 `'terminal'` 재사용 — **권장: 신규 `'build-output'`** 두고 장차 PO Log Terminal 이 `'terminal'` 차지. 두 type 이 같은 `<LogTerminal>` 컴포넌트 공유 가능).
  - workspace.ts `defaultTitle` (757-)에 `case 'build-output': return \`Build: ${props?.surfaceKey}\`` 추가.
  - 신규 `src/components/workspace/main/panes/BuildOutputTab.tsx` — props `{ runId, surfaceKey, kind }`. `api.surface.onOutput/onDone` 구독, append-only 로그 뷰(monospace, auto-scroll, ANSI 미파싱 — 단순 textContent v1). 상단 status chip: **running(스피너)/pass(녹색 exit 0)/fail(적색)/cancelled**. running 중 `취소` 버튼(→ `api.surface.cancel`).
  - TabContent.tsx:50- switch 에 `case 'build-output': return <BuildOutputTab props={tab.props} />` 추가 + import.
- BuildSegment 가 `▶ Build` 클릭 → `api.surface.run` → 반환 runId 로 `useWorkspace.openTab(\`build-${runId}\`, 'build-output', { runId, surfaceKey, kind })`(workspace.ts openTab:424, 전역 dedupe 있음). 기존 동일 runId 탭이면 focus.

### D5. 동시 실행 / 취소
- **단일 in-flight 모델**(po-runner 와 동일 단순화): surface-runner 에 module-level `activeRuns: Map<runId, ChildProcess>`. v1 은 **surface×kind 당 1개**까지 허용(서로 다른 surface 빌드 병렬은 무해하나, v1 은 전역 1개로 단순화 권장 — OQ-2). 이미 실행 중 재클릭 → BuildSegment 가 `already-running` 받으면 해당 탭 focus(새 spawn 안 함).
- 취소: BuildOutputTab `취소` → `surface:cancel(runId)` → `child.kill('SIGTERM')` → close 핸들러가 `status:'cancelled'` emit(po-runner wasAborted:536 패턴 미러).
- 앱 종료 가드: 빌드 child 가 떠 있어도 PO turn 가드(main.ts isPoRunning)와 **별개** — v1 은 SIGTERM 정리만(quit 시 activeRuns 순회 kill). 종료 확인 모달은 OOS(OQ-3).

### D6. 결과 알림 (B3 OS 알림 연동 — 옵션 ON)
- notifications.ts 인프라 재사용. `NotifyKind` (notifications.ts:40)에 `'build-done'` 추가, 설정 토글 types 에 동반 추가(core getNotificationSettings).
- surface:onDone 의 main-process 핸들러(emitToWebContents 미러 위치)에서 `fireNotification({ kind:'build-done', title: status==='pass'?'빌드 완료':'빌드 실패', body:\`${surfaceKey} ${kind} — exit ${code}\`, route:{ surface:'chat' } })`. **isBackgrounded 게이트로 포그라운드 땐 자동 무음**(이미 패널 보고 있음) — notifications.ts:92 동작 그대로.
- route surface 는 'chat'/'ticket-review'/'phase-gate' 만 허용(NotifyRoute:49) — build-output 탭으로 직접 라우팅하려면 route 타입 확장 필요 → v1 은 `'chat'` 으로(클릭 시 창 포커스만, 탭 라우팅은 OQ-4). 또는 알림 클릭 라우팅을 build 탭 focus 로 하려면 poEvents.ts notification:navigate 핸들러 확장. v1 권장: route='chat' + 창 포커스만.

### D7. react / 구현 노트 (react-best-practices — TSX 작성은 dev 몫)
- BuildSegment / BuildOutputTab: `api.surface.onOutput` 등 구독은 `useEffect` 안에서 등록하고 **반드시 cleanup 으로 unsubscribe**(preload 가 unsubscribe fn 반환 — deploy:progress 패턴 preload.ts:958). 의존성 배열에 `runId`.
- 로그 누적은 큰 빌드에서 수천 줄 → `useState` 문자열 append 보다 **ref + 주기적 flush** 또는 가상 스크롤 고려(v1 은 단순 배열 + 상한 5000줄 ring buffer 권장). 메모리/리렌더 폭주 방지.
- status 는 파생값(props.code 로 계산) — 별도 state 중복 금지.
- 절대 `dangerouslySetInnerHTML` 로 stdout 렌더 금지(ANSI/HTML 인젝션) — textContent only.

### D8. 보안 (spawn shell=true)
- `shell:true` 는 인젝션 표면. **surface 커맨드 문자열은 config 신뢰값**(프로젝트 소유자가 작성)이라 그 자체는 신뢰 가능. 단:
  - **projectDir 가드**: `surface:run`/`surface:list` 진입 시 projectDir 이 실제 productune 프로젝트인지 검증 — `fs.existsSync(path.join(projectDir,'.productune','config.json'))` (project.ts:329 패턴). 아니면 거부.
  - surfaceKey 는 **config.surfaces 의 키 화이트리스트**로만 — renderer 가 보낸 임의 문자열로 커맨드 합성 금지. main 에서 `config.surfaces[surfaceKey]?.[kind]` 조회해 **config 에 실재하는 커맨드만** spawn(renderer 가 커맨드 문자열을 직접 보내지 않음 — surfaceKey+kind 만 전달).
  - renderer 트리거는 `event.isTrusted` 확인(assertUserInitiated 패턴, po-deploy-guard.ts:56) — 자동/합성 호출 차단.

## Acceptance Criteria (보강)
1. StatusBar 우측에 `▶ Build` 세그먼트 노출, 클릭 시 surface drop-up(gui/core) — core 의 Smoke 는 disabled. (D1)
2. Build/Smoke 클릭 → `surface:run` IPC → child_process.spawn(shell, cwd=projectDir, env 상속) 실행. **claude/po-runner/core-LLM import 0 — 토큰 0** (코드 grep 로 검증: surface-runner.ts 가 claude/anthropic/po-runner 미참조). (D0/D3)
3. `build-output` 탭이 열려 stdout/stderr 라인 스트리밍 + running/pass(exit0)/fail/cancelled status chip. (D4)
4. 실행 중 재클릭 → `already-running`, 기존 탭 focus(중복 spawn 없음). 취소 버튼 → SIGTERM → cancelled. (D5)
5. surfaceKey 화이트리스트 + projectDir config.json 가드 + isTrusted 검증 통과(임의 커맨드 spawn 불가). (D8)
6. (옵션) 백그라운드 시 build-done OS 알림, 포그라운드 시 무음. (D6)

## Open Questions (dev/PO 판단 위임)
- OQ-1: "Build all"(모든 surface 순차/병렬) — v1 OOS. 필요 시 follow-up 티켓.
- OQ-2: 동시 실행 정책 — v1 전역 1개 vs surface×kind 당 1개. 권장: 전역 1개(단순).
- OQ-3: 빌드 중 앱 종료 확인 모달 — v1 OOS(SIGTERM 정리만).
- OQ-4: build-done 알림 클릭 → build-output 탭 라우팅 vs chat 포커스. v1: chat 포커스.
- OQ-5: `'terminal'` type 재사용 vs 신규 `'build-output'` — 권장 신규(장차 PO Log Terminal 과 공유 컴포넌트).
