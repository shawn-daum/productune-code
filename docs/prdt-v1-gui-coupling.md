# prdt v1 — GUI↔discipline 결합 감사 (§12 실행 계획 2번)

> 목적: GUI(`packages/gui`)가 full discipline을 하드코딩한 지점을 전수 목록화 → **flip 시 어댑터 수정 범위 확정**.
> 전제(§13): GUI의 prdt 네이티브 재작업은 v1.1+ — v1은 **어댑터만**.
> 감사 기준 커밋: `00342cb` (v1 분기점). ⚠️ v0.6 워킹트리의 미커밋 GUI 변경은 미포함 — **flip 직전 main 기준 재검증 1회 필요** (§12.6 체크리스트에 반영).
>
> 상태: 작성 완료 (2026-07-02). 처분표(prdt-v1-disposition.md) 다음 단계.

## 어댑터 등급 정의

| 등급 | 의미 | 성격 |
|---|---|---|
| **T1 rename** | 이름/경로 치환 | 상수화 후 기계적 교체 |
| **T2 mapping** | 값·필드 매핑 코드 소량 | enum 동의어, 필드명 변환, 디렉토리 규칙 |
| **T3 institution-gone** | 뒷받침 제도 자체가 v1에서 폐지 | prdt 프로젝트에서 해당 UI 숨김/대체 — 네이티브 대체는 v1.1+ |

**총괄 전략**: 프로젝트 종류 감지(`.prdt/` vs `.productune/` 존재)로 store 레벨에서 분기하는 **dual-mode 어댑터**. 옛 프로젝트는 기존 코드 그대로(옵트인 마이그레이션 원칙과 정합), prdt 프로젝트만 아래 조치 적용.

---

## 1. Agent 이름 (T1)

`pdt-po` 등 persona id의 정의 지점은 4곳뿐 — 나머지는 전부 `.replace('pdt-','')` 파생.

| 정의 지점 | 조치 |
|---|---|
| `electron/po-runner.ts:43` `PO_AGENT='pdt-po'` (+`:1061` spawn args, `:1988` QA envelope 판별) | `prdt-po`로 교체, 상수화 |
| `src/store/personaPresence.ts:44-47` subagent_type→PersonaId 맵 (renderer 단일 SoT) | prdt-* 키 추가 |
| `electron/ipc/settings.ts:50` `PERSONA_SPEC_IDS` + `~/.claude/agents/<id>.md` 경로 | prdt-* 추가 |
| `electron/ipc/doctrine.ts:14` persona 디렉토리 whitelist (bare 이름 — prefix 무관) | 무수정 가능성 높음 (경로만 §2로) |

- `onboarding.ts:361-384` 심링크 대상 `pdt-*.md` → `prdt-*.md` (T1).
- 전환기 공존(§2: pdt-*/pdtl-*과 충돌 없이 공존): 맵에 **양쪽 id를 함께** 등록하는 방식이 안전 — 치환이 아니라 추가.
- 주의: CSS 클래스 `pdt-spin` 등 ~40건은 스타일 네임스페이스로 **결합 아님** (오탐 제외됨).

## 2. 상태 디렉토리·파일 (T1+T2)

- `.productune` 문자열이 **electron ~15개 파일에 산재, 중앙 상수 없음** → 어댑터 1단계 = 중앙 경로 상수 도입 후 project-kind에 따라 `.prdt`/`.productune` 분기 (T1이지만 선행 리팩토링 필요).
- 파일명은 대부분 보존: `po-state.json`·`config.json` 동명 유지(§2) → 경로 상수만으로 해결.
- GUI 자체 소유 파일(`chat.json`·`attachments/`·`onboarding.json`·`recents.json`)은 디렉토리만 따라가면 됨 (T1).
- **`usage-state.json` (usageWatch.ts:32, UsageBar)**: full statusline의 부수효과 산출물 — v1 statusline은 순수 표시 전용(§10)이라 **이 파일이 사라짐**. 대체 원천 = hook#3의 기록(turns.jsonl 계열). UsageBar 데이터 소스 교체 (T2).
- `turns.jsonl` (subagent-cost.ts, CostArchivePanel): v1 hook#3이 동일 개념 기록 유지 — 경로/스키마 확정 시 필드 검증 (T2).
- 프로젝트 감지 로직 `project.ts:114-177` (`.productune`/`po.lock`/`briefs/` 마커): `.prdt` 마커 추가, `briefs/`·`po.lock`은 v1에 없음 — prdt 감지에서 제외 (T2).

## 3. po-state 스키마 (T3 — 최대 파괴 지점)

GUI의 `PoState` 타입(`src/lib/types.ts:339-365`, 13+키) vs v1 po-state **4필드** `{schema_version, stage, version, current_task}` (§2).

| GUI가 읽는 키 | v1 | 조치 |
|---|---|---|
| `current_phase`(1..5) + `phase_history` | `stage`(define/build/ship/retro 문자열) | T2: stage→표시 매핑. EntryGate·phase-mapping·workspace store 분기 |
| `pending_gate` + `phase:approve` IPC (state.ts:256-272 in-place write) | **제도 폐지** (§3 gate 없음) | T3: PendingGateChip·PhaseTransitionGate·`phase:approve` 숨김/무효화 |
| `close_gate[]` (4-step) | **폐지** | T3: GateMarker 숨김 |
| `versions[]` (배열·outcome) | 단일 `version` 값 | T3: VersionsPanel/VersionDetailView/SidePanelCurrentVersion → 단일 버전 + 위키 `retro--v*` 파일 나열로 대체 표시 |
| `pending_promotions` (+ drain IPC 6종, preload.ts:209-235) | **폐지** (위키 대체 §7) | T3: PendingPromotionDrain 등 숨김 |
| `current_task` 서브필드 (ticket_id·qa_status·assignee_persona·persona_session_meta) | current_task 축소형 (§2, contracts에서 확정) | T2: 필드 존재 여부로 방어적 렌더 (이미 optional 처리 다수) |
| `past_tickets` (deprecated 선언만) | 없음 | 무조치 |

## 4. Ticket 결합 (T2)

- 경로 `docs/tickets/<version>/T-*.md` **유지** — 스캐너(tickets.ts:159-223)는 디렉토리 무차별 순회라 `backlog/`·`v1.5/` 디렉토리(§6 개정)도 자동 포착. 단 "디렉토리=버전" 가정으로 표시하는 곳에서 `backlog` 라벨 처리 1건 (T2).
- frontmatter: GUI는 20키 파싱(tickets.ts:233-259) — v1은 7±1(`id·slug·type·status·assignee·feature?·deps?·created/closed`). 파서는 없는 키를 undefined로 두므로 **파싱은 안전**, 표시 컬럼 축소만 (T2).
- **status enum**: GUI 7값(types.ts:54) + 동의어 테이블(useTicketScan.ts:30-47). v1 3값 중 `open`·`dropped`가 GUI 미지의 값 → **동의어 테이블에 2줄 추가** (`open→in-progress`, `dropped→abandoned`) (T2, 최소 어댑터의 모범 사례).
- `type` 9값→4값: 부분집합이라 안전. `TYPE_TO_PHASE`(phase-mapping.ts:87-106)는 phase 폐지로 무의미 → stage 추론으로 교체 or 제거 (T3 부속).
- `qa_status`·`phase:` frontmatter: v1에 없음 — optional이라 안전.

## 5. Docs 경로 (T2+T3)

| 결합 | v1 | 조치 |
|---|---|---|
| `docs/prd/PRD.md` (PrdSection·helpers·state.ts probe) | **동일 경로 유지** (§2) | 무수정 |
| `docs/prd/versions/<v>.md` (PrdSection:45, 닫힌 버전 뷰) | **스냅샷 제도 폐지** (Q2·§5c 계보) | T3: 닫힌 버전 뷰 → 위키 `retro--v<N>.md` 표시로 대체 or 숨김 |
| `docs/artifacts/<v>/manifest.json` (artifacts.ts·ArtifactsPane) | v1 = `docs/artifacts/<slug>.<ext>` — **manifest·버전 서브디렉토리 없음** (§2) | T3: manifest 기반 pane → 디렉토리 리스팅 fallback (design.ts:9의 일반 walk가 이미 존재 — 재사용) |
| `docs/wiki/` | 신설 (§7) | v1.1+ (일반 MarkdownTab으로 열람은 이미 가능 — 전용 뷰는 네이티브 재작업 몫) |
| `docs/<persona>/habit.md` mechanical-write (mechanical-write.ts:54) | promotion 폐지 | T3: 해당 IPC prdt에서 무효화 |
| `docs/backlog.md`·calibration-log 경로 리터럴 | GUI에 없음 (감사 확인) | 무조치 |

## 6. Phase/lifecycle 개념 (T3)

- `Phase = PRD|Design|Build|Deploy|Close` + `PHASE_NAMES{1..5}` (types.ts:13-21), `PHASE_DEFS`·색상(phase-mapping.ts:28-34), `GATE_BOUNDARIES`(:179-191, gate step 키 4종 하드코딩) → v1 4-stage로 전면 교체 대상. 어댑터에선 **stage 4종의 표시 정의 추가 + 기존 5-phase 코드는 legacy 분기에 격리**.
- gate step 키는 locale(`workspace.gateMarker.items.*`, en.json:217-232)에도 박혀 있음 — T3 숨김이면 locale은 방치 가능, 정리는 v1.1+.
- 알림 kind `phase-gate-entry`(notifications.ts:43) — prdt에서 발생 원천 소멸, 무해.

## 7. Scripts/hooks/CLI (T1+T2)

- **`onboarding.ts:279-336` `installClaudeHooks`가 hook 18개 basename + matcher를 전부 하드코딩** (`PDT_BASENAMES`) → prdt install은 **hook 3종 + statusline-prdt.sh**로 교체 (처분표 1부와 1:1 대응). 어댑터라기보다 **prdt용 온보딩 경로 신설** — 기존 목록은 legacy 분기에 유지 (T2).
- `stop-verify.sh` matcher `pdt-developer`(onboarding.ts:326): hook 자체 폐기(처분표 #18) — prdt 목록에서 제외.
- `spawn('claude', --agent pdt-po)`(po-runner.ts:1053-1088) → agent id만 T1. `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 유지.
- `~/.productune/productune.env`(onboarding.ts:265,351; po-runner.ts:351): v1 미규정 — **열린 항목 ①** 참조.
- statusline: `statusline-productune.sh`(:290,334) → `statusline-prdt.sh`(§10, 포맷 변경 포함) (T1+T2).

## 8. Locale (T2 소량)

- persona 키는 bare(`workspace.team.persona.{po,designer,developer,qa}`)라 **prefix 비결합** — 무수정.
- stage 4종 표시 문자열 추가 필요. gate/phase 키는 T3 숨김과 함께 방치 가능.

## 9. Return envelope 파싱 (T2+T3) — po-runner.ts 집중

| GUI 파서 | v1 envelope (§4) | 조치 |
|---|---|---|
| `changed_files[]` (:1941) | `files_written[]`로 개명 | T2: 필드명 양쪽 수용 |
| `QaEnvelope` (`persona==='pdt-qa'`·qa_status·browser_url·auth_required) (:1960-1998) | v1 envelope에 qa_status 없음 — `summary·confidence·blocked` 일반형 | T2: persona id 추가 + 필드 유무 방어. browser_url/verify_url은 **유용 — contracts 확정 시 v1 envelope에 계승 검토 (열린 항목 ②)** |
| `parsePendingGate` (:2009) | 제도 폐지 | T3: prdt에서 비활성 |
| `parsePromotionCandidates` + 7필드 스키마 (:156-177, :2037-2074) | `memory_notes[]`로 대체 | T3: promotion UI 숨김. memory_notes 표시는 v1.1+ (위키 뷰와 함께) |
| ticket dispatch 감지 `ticket_id` (:1914) | ticket id 체계 유지 | 무수정 근접 |

---

## 요약 — 어댑터 작업 목록 (flip 전 완료 조건)

| # | 작업 | 등급 | 대표 지점 |
|---|---|---|---|
| A1 | 중앙 경로 상수 도입 (`.productune` 산재 ~15파일) + project-kind 감지 분기 | 선행 | electron 전반 |
| A2 | persona id prdt-* 추가 (정의 4곳 + 온보딩 심링크) | T1 | po-runner·personaPresence·settings·doctrine |
| A3 | status 동의어 2줄 (`open`·`dropped`) + backlog 디렉토리 라벨 | T2 | useTicketScan·tickets.ts |
| A4 | stage 4종 표시 매핑 (phase 1..5 코드는 legacy 분기 격리) | T2 | phase-mapping·types |
| A5 | envelope 필드 수용 (`files_written`) + QA envelope 방어화 | T2 | po-runner |
| A6 | prdt 온보딩 경로 (hook 3종 + statusline-prdt) | T2 | onboarding.ts |
| A7 | UsageBar 데이터 소스 교체 (usage-state.json 소멸) | T2 | usageWatch·UsageBar |
| A8 | 제도 소멸 UI 숨김: gate(chip/marker/approve IPC)·promotion drain·versions 배열 뷰·PRD 스냅샷 뷰·manifest pane(→디렉토리 fallback)·mechanical-write IPC | T3 | 다수 (표 3·5·6·9) |

**열린 항목 (코어 구축 §12.3에서 확정 필요):**
1. `productune.env`(엔진 설정)의 v1 대응 — `.prdt` 쪽 동등물 미규정.
2. QA envelope의 `browser_url`·`verify_url`·`auth_required` — GUI 기능(브라우저 자동 열기·인증 안내)이 유용하므로 contracts return envelope에 계승할지.
3. turns.jsonl의 v1 스키마 — hook#3 재작성 시 GUI CostArchive 필드와 대조.

**최다 결합 파일 Top 5** (어댑터 PR 리뷰 중심): `electron/po-runner.ts` · `src/lib/types.ts` · `electron/ipc/onboarding.ts` · `src/lib/phase-mapping.ts` · `electron/ipc/tickets.ts`.
