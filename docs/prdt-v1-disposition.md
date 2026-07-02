# prdt v1 — 처분표 (disposition table)

> 설계 SoT `docs/prdt-v1-design.md` §12 실행 계획 1번의 산출물.
> 대상: full의 hook 18개 (`packages/core/scripts/hooks/`, 3,160줄) + PO bookshelf 규칙 전수
> (`packages/core/doctrine/persona/po/bookshelf/`, 13개 파일 + habit.md, ~785줄).
> 원칙: **유실은 실수가 아니라 결정** — 모든 항목에 처분과 사유를 남긴다.
>
> 상태: 작성 완료, 사용자 리뷰 대기 (2026-07-02). 승인 후 §12 2번(GUI↔discipline 결합 감사)으로.

## 분류 기준 (설계 §12.1)

| 분류 | 의미 |
|---|---|
| **contract 승격** | `discipline/contracts.md`(≤80줄)에 규칙으로 명문화 |
| **playbook 이동** | persona playbook 본문/frontmatter로 이동 (지식 소유 = persona) |
| **hook 유지** | v1 hook 3개(§9)로 존속 — session-start 주입 · post-compact 재주입 · post-dispatch state 기록 |
| **doctor 흡수** | `prdt doctor` non-blocking lint 항목으로 |
| **폐기** | 사유와 함께 제거. 전제 소멸 / 설계 대체물 존재 / YAGNI |

**보조 표기 2개** (설계 5분류의 목적지를 세분화한 것 — 새 분류가 아님, 리뷰 질문 Q1):
- `habit 재작성` — 규칙이 새 PO/worker habit(§12.3에서 신설)에 판단 원칙으로 잔류해야 하는 경우.
- `CLI/wiki 이관` — 기능이 `prdt` 서브커맨드(migrate/wiki/init) 또는 위키 구조 자체로 대체되는 경우 (기술적으로는 "폐기 + 대체물"이지만 유실이 아님을 명시).

---

## 1부 — hook 18개

### 유지 3개 (§9 그대로)

| # | hook (줄수) | 처분 | 비고 |
|---|---|---|---|
| 1 | `session-start-doctrine.sh` (197) | **hook 유지** = v1 hook#1 | 재작성: 주입 대상을 `doctrine.md + contracts.md + habit + overrides(§8) + 메뉴판`으로 교체. Tier1(project habit)/Tier2(personal) 3-tier 체계는 폐기 — overrides 단일 overlay가 대체. 내장 migration-scan 블록은 **`prdt migrate`(옵트인, §12.5)로 이관** — session-start가 마이그레이션을 제안하는 구조 자체를 제거(init이 결정론적이므로 불필요). fail-loud(파일 누락 시 STOP 주입)는 유지. |
| 2 | `post-compact-doctrine.sh` (105) | **hook 유지** = v1 hook#2 | 재작성: hook#1과 같은 주입 셋을 재주입. persona 판별/tier 로직 단순화. |
| 3 | `post-delegate-state-write.sh` (329) | **hook 유지** = v1 hook#3 | 재작성: session_id·last_seen 기록 + §10 statusline에서 이관되는 부수효과(usage/turns 기록) 흡수. dispatch 감지를 `claude --agent` 문자열 매칭이 아닌 Agent tool 기반으로 재설계. persona_sessions 스키마는 새 po-state shape(§2 4필드)에 맞춰 축소. transcript 기반 token 집계(T-PATCH-202 블록)는 이 hook의 정규 기능으로 정리. |

### 처분 15개

| # | hook (줄수) | 처분 | 사유 |
|---|---|---|---|
| 4 | `post-bash-strip-cost.sh` (41) | **폐기** | 전제 소멸: cost envelope는 shell dispatch(`claude -p`) 출력물인데 v1 기본 채널은 Agent tool. "사용자에게 내부 메커니즘 노출 금지"는 PO habit의 voice 규칙(판단)이 담당. 비용 *기록*은 hook#3이 담당하므로 기능 유실 없음. |
| 5 | `post-edit-format.sh` (61) | **playbook 이동** → developer `implement` | format 실행은 DoD의 일부(§5b)이지 전 프로젝트 무차별 side-effect가 아니다. "커밋 전 format script 실행" 1줄이면 충분; 반복 위반 관찰 시에만 warn hook 재도입(§1.4 사후·증거 기반). |
| 6 | `post-po-state-shape-guard.sh` (196) | **doctor 흡수** → `state` 검사 | §9 doctor 항목에 명시(po-state shape · stage 값). v1 po-state는 4필드(§2)라 canonical-14/top-level-13 whitelist 전제 자체가 소멸 — 검사 로직은 새 스키마 기준으로 신작. |
| 7 | `post-ticket-status-verify.sh` (104) | **doctor 흡수** + 인덱스 CHECK | §6 명시: "인덱싱 시 CHECK 제약이 enum을 기계 검증 — lint hook 불요". 3값 enum(open/done/dropped)은 SQLite CHECK가, 잔여 이상(blocked 장기화 등)은 doctor가. |
| 8 | `pre-chunking-warn.sh` (83) | **폐기** | 전제 소멸: chunking ceiling은 PO가 산출물 목록을 지시하던 시대의 규칙. v1 PO는 intent만 전달(§4)하고 분할 판단은 designer playbook 소유. 키워드 카운트 휴리스틱 자체도 취약(자백된 FP 회피 로직 다수). |
| 9 | `pre-delegate-ctx-lang.sh` (133) | **contract 승격** → contracts.md `[ctx]` envelope | `user_lang`은 §4 계약의 [ctx] 필수 필드로 이미 명문화. dispatch envelope 정의가 항상 주입층(contracts)에 있으므로 "규칙이 안 보여서 어긴다" 원인이 제거됨. 반복 위반 관찰 시에만 warn hook 재도입. |
| 10 | `pre-delegate-task-check.sh` (227) | **폐기** (일부 CLI 이관) | R1(current_task 사전 기록 강제+auto-fill): hook#3이 사후 기계 기록하므로 사전 강제 불필요. R4(resume UUID 검증): Agent tool/SendMessage가 세션 연속성을 네이티브 관리 — UUID 수동 관리 체계 소멸. R5(pending_verification 게이트): gate 없음(§3), PO 판단+위키 log가 대체. 내장 스키마 마이그레이션 2종(round→version, 5→4 phase)은 **`prdt migrate`로 이관**. |
| 11 | `pre-doctrine-guard.sh` (49) | **폐기** (fail-loud는 hook#1에 흡수) | "doctrine 없으면 행동 차단"의 사전 block. hook#1의 MISSING 시 STOP 주입(유지)과 doctor의 discipline 미러 무결성 검사로 대체. block hook은 §1.4에 따라 반복 위반 관찰 후에만. |
| 12 | `pre-frontmatter-lint.sh` (539) | **doctor 흡수** + 인덱스 CHECK | 최대 hook(539줄)이 존재하는 이유 = 7값 status enum + worker/PO 혼합 write + legacy 이력. v1은 frontmatter 7±1 필드·3값 enum·**PO만 frontmatter write**(§6)로 전제를 제거. 기계 검증은 인덱싱 CHECK, 잔여(고아 ticket 등)는 doctor. Write/Edit/Bash 3채널 사전 차단과 FM-diff gate 곡예는 전부 불필요해짐. |
| 13 | `pre-git-posture.sh` (235) | **contract 승격**(commit 규약) + **폐기**(posture gate) | commit 규약(Conventional Commits, §5b)은 contracts.md 명문화. Gate A(ticket branch checkout 차단): worktree가 "티켓마다"에서 "트리거 3개만, Agent 네이티브"(§4)로 바뀌어 시나리오 소멸. Gate B(main 직커밋 warn): 자백된 식별 불가 신호(tooling repo/initial commit과 구분 불능) — 폐기, git 판단은 PO habit. |
| 14 | `pre-phase-gate-guard.sh` (244) | **폐기** (일부 doctor 흡수) | phase gate 제도 자체가 폐지(§3: gate 없음, open-gate는 진입 ritual + 판단). G1/G2/G3(close_gate 강제·self-heal) → readiness는 PO 판단 + 위키 log. G4/G5(PRD snapshot 강제) → PRD 스냅샷 제도 폐기(단일 living PRD §2; 버전 서사는 `retro--v<N>` 위키). G6(setter-only) → po-state 4필드로 전제 소멸, doctor state 검사로. G7(design artifact 채택 강제) → doctor "artifact 있는데 참조 ticket 없음" 경고(§6) + designer ds-conformance playbook. |
| 15 | `pre-po-state-shape-guard.sh` (261) | **doctor 흡수** → `state` 검사 | #6과 동일 계열(사전 차단판). §1.4 원칙상 사전 block보다 doctor 경고가 기본값. 새 4필드 스키마 기준으로 신작. |
| 16 | `prompt-gate-inject.sh` (54) | **폐기** | close_gate 제도 폐지(§3)로 주입할 gate 자체가 없음. "턴마다 상태를 컨텍스트에" 요구는 statusline(§10) + PO turn-open의 위키 index 읽기(§7)가 대체. |
| 17 | `session-start-po-state-migrate.sh` (211) | **폐기** → `prdt migrate` CLI 이관 | §12.5 명시: 마이그레이션은 옵트인 CLI. session-start마다 자동 변환+.bak 생성하는 구조는 침묵 부작용(자백된 .bak 누적 문제 포함) — 결정론적 1회 실행으로 전환. shape 이상 *검출*은 doctor. |
| 18 | `stop-verify.sh` (91) | **contract 승격**(DoD) + **playbook 이동**(self-verify) | DoD(build·lint·typecheck green)는 contracts.md 명문화(§5b). 실행 절차는 developer implement playbook의 self-verify 단계. Stop hook 강제는 dogfood에서 "알고도 반복 위반" 관찰 시에만 재도입. |

**집계**: hook 유지 3 · contract 승격 3(부분 포함) · playbook 이동 2(부분 포함) · doctor 흡수 4 · 폐기 9(부분 중복 포함, CLI 이관 2 포함).

---

## 2부 — PO bookshelf 규칙 전수

파일 단위가 아니라 **규칙 단위**로 처분한다. 목적지 열의 파일명은 §2 트리 기준.

### 2.1 `delegation.md` (116줄)

| 규칙 | 처분 | 목적지 / 사유 |
|---|---|---|
| "절차 지시 금지, persona output을 author하지 않는다" | **contract 승격** | contracts.md — §4 계약의 제1원칙(PO는 intent만) |
| `[ctx]` inline JSON 필드 정의 | **contract 승격** | contracts.md — §4의 새 정의로 교체: `{slug, goal, change_meta, acceptance, wiki_refs, user_lang, prd_path}`. 기존 필드 중 persona_sessions/next_ticket_id/audience는 폐기(세션은 hook#3+엔진, ticket id는 PO frontmatter 소유) |
| return envelope 검사(confidence/unresolved) | **contract 승격** | contracts.md — §4 return envelope에 정의됨 |
| Agent tool 우선 / portable shell fallback 채널 규칙 | **폐기** | 전제 소멸: v1 dispatch는 Agent tool 기본. shell dispatch 문법·SID 8-4-4-4-12·따옴표 안전수칙 전부 불필요 |
| post-delegate hook이 세션 기록 (수기 금지) | **hook 유지** | hook#3의 존재 이유 그대로 |
| current_task canonical 14 + scratch 5키 | **폐기** | po-state가 `{schema_version, stage, version, current_task}` 4필드로 축소(§2). current_task 최소 shape은 contracts 고정 경로 맵에 1줄 |
| AskUserQuestion PO-only / needs-info 릴레이 | **contract 승격** | contracts.md — return envelope의 `needs_info/next_question` + "worker 간 직접 호출 없음, PO 단일 창구"(§4) |
| Design-sequence는 S1 지정, ad-hoc 금지 + anchor provenance 검사 | **playbook 이동** | designer `ds-3up` playbook — 진입점·provenance는 designer 지식. PO는 메뉴판 `when`만 봄. **PO가 S1을 지정하는 구조 자체가 §4 위반(절차 지시)이므로 방향 역전: designer가 `when`으로 스스로 선택** |
| Plan mode L5+ 5단계 절차 | **playbook 이동** | developer `plan-first` — PO가 plan→review→revise→impl을 지휘하는 구조 폐기, worker가 플로우 소유. 리뷰(fresh-eyes)는 `code-review` playbook(§5b) |
| Dev-QA auto-loop (impl 후 QA 자동, cap) | **contract 승격** | contracts.md — §4 명시: "user-facing/risky 변경은 QA 자동 dispatch, 재시도 cap ~3" |
| Session lifecycle (per-ticket fresh / SendMessage-first) | **폐기** | 엔진 네이티브(Agent tool 연속성) + hook#3 기록으로 대체 |
| Chunking (Designer당 1–2 artifacts) | **폐기** | hook#8과 동일 사유 — 분할 판단은 worker playbook |
| PRD delegation (fresh idea → opus/max L7) | **playbook 이동** | designer `prd-clarity` frontmatter(`model_floor: opus, effort: max`) — 메뉴판이 대체 |
| 외부 URL 사전 검증 후 [ctx] 주입 | **playbook 이동** | worker 공통 습관(각 habit) 또는 contracts 1줄 — 검증 주체를 PO에서 사용하는 쪽으로 |

### 2.2 `routing.md` (55줄)

| 규칙 | 처분 | 목적지 / 사유 |
|---|---|---|
| per-persona model/effort floor 표 | **playbook 이동** | 각 playbook frontmatter `model_floor/effort`(§5 스키마) — CLI가 메뉴판 생성, PO는 조회만(§4). 지식 소유가 PO→persona로 이동하는 핵심 항목 |
| L1–L7 complexity scale | **폐기** | 사전 매칭 기준이 `change_meta`(files/user_facing/risk_flags/stage)로 교체(§4). L-등급 어휘는 calibration 폐지와 함께 소멸 |
| Patch lane (5조건 fast path) | **폐기** | PO가 "절차 생략"을 결정하는 구조 자체가 §4 위반. 가벼운 작업의 가벼운 처리는 각 playbook의 `when` 조건이 흡수 |
| Step-up/down·Hold-floor 신호 | **폐기** | 메뉴판 floor 최댓값 + worker `escalate_to`(§4)가 대체. 상향 오차 공짜 구조라 사전 미세조정 규칙 불필요 |
| effort follows model / max는 Step-1 전용 | **playbook 이동** | playbook frontmatter가 effort까지 선언 — 별도 규칙 불필요. "max 남용 금지"가 필요하면 contracts 1줄 |
| user prefix override (/model /effort) | **habit 재작성** | PO habit — 사용자 명시 지시는 판단으로 수용 |
| effort/confidence 사용자 표현 대역 | **habit 재작성** | PO habit voice 절 — 사용자 대화 규칙 |

### 2.3 `calibration.md` (61줄)

| 규칙 | 처분 | 목적지 / 사유 |
|---|---|---|
| calibration-log 파일·1줄 포맷·3-tuple 매칭·rotate | **폐기** | §4 명시: "PO의 routing bias는 위키 learning 페이지에서 (**calibration-log 폐지**)" |
| "deviation만 기록, 무사통과는 기록 안 함" 원칙 | **CLI/wiki 이관** | `learning--*.md` 위키 페이지의 작성 원칙으로 계승 — routing 교훈이 남는 채널만 교체. §12.5 migrate가 기존 log를 learning 페이지로 이식 |
| "cross-cutting 교훈은 calibration이 아니라 doctrine으로" | **폐기** | promotion gate 자체가 폐지 — 위키 2단 큐레이션(§7)이 분류 비용 없이 대체 |

### 2.4 `escalation.md` (55줄)

| 규칙 | 처분 | 목적지 / 사유 |
|---|---|---|
| 4 quality signals (confidence low/schema 미비/QA fail/user 불만) | **contract 승격** | contracts.md return envelope 필드(confidence·unresolved·blocked)가 신호 정의를 겸함. PO habit에 "이상 신호 → 재dispatch 판단" 1줄 |
| 3-strike ladder (skill→model→user) | **폐기** | 방향 역전(§4): worker가 `escalate_to{model, effort, playbooks, why}` 반환 → PO가 그 tier로 재dispatch. PO가 강제 사다리를 돌리는 구조 소멸. Strike1 skill search는 v1 Out(§13 skill 재편) |
| Strike 3 user surface 템플릿 | **habit 재작성** | PO habit — blocked/저품질 반복 시 사용자 surface는 판단 규칙으로 잔류 |
| under-estimate → calibration 기록 | **CLI/wiki 이관** | escalate 발생 = learning 페이지 1줄 (routing bias 원천, §7) |

### 2.5 `git-workflow.md` (42줄)

| 규칙 | 처분 | 목적지 / 사유 |
|---|---|---|
| PO owns git / worker는 자기 scope만 | **habit 재작성** | PO habit(§2 "lifecycle 판단 · 큐레이션 · git · 대화") + developer habit에 scope 1줄 |
| commit 규칙 (ticket 단위 commit·메시지 규약·`git add .` 금지) | **contract 승격** | contracts.md commit 규약 — Conventional Commits(§5b)로 형식 교체(`[T-N]` prefix → `feat:/fix:` + ticket 참조) |
| ticket마다 worktree 격리 / posture(v<N> 상주) | **폐기** | §4: worktree는 트리거 3개에서만, Agent 네이티브 옵션 사용. "EVERY ticket worktree" 정책과 worktree 생성/gc 수칙 소멸 |
| 브랜치 모델 (v<N> ← ticket branch, PR 정책, tag) | **contract 승격**(trunk 원칙) + **폐기**(브랜치/PR 제도) | **Q2 확정(2026-07-02, 설계 §5c)**: 기본 trunk + `git tag v<N>`, 격리는 worktree 트리거 3개에서만 판단. PR ceremony 폐기 — 실사용이 리뷰 없는 승인 클릭이었음 |

### 2.6 `promotion-process.md` (97줄)

| 규칙 | 처분 | 목적지 / 사유 |
|---|---|---|
| 4-quadrant 분류 + user-approval gate | **폐기** | §7 표제 그대로 "Wiki — promotion gate의 대체물". 분류 비용 > 기억 가치가 폐지 사유(§0) |
| Tier 0/1/2 layer map + last-wins reader chain | **폐기** (구조만 계승) | 3-tier는 core + overrides 단일 overlay(§8)로 축소. last-wins 원칙만 §8에 계승 |
| habit-as-index (bookshelf↔habit 인덱스 쌍 수동 sync) | **CLI/wiki 이관** | §1.6: 파생 문서(메뉴판·위키 index)는 CLI가 frontmatter에서 생성, doctor가 불일치 검출 — orphan 문제를 형식 차원에서 제거 |
| merge classifier (new/refine/supersede/conflict) | **CLI/wiki 이관** | 위키 2단 큐레이션의 통합 단계(§7: 기존 페이지 갱신·모순 flag·supersede 링크)가 동일 개념을 흡수. curate-wiki playbook 본문에 판단 기준으로 잔류 |
| persona 직접 long-term write 요청 → refusal | **contract 승격** | contracts.md return envelope `refused` 필드 + "장기 기억은 memory_notes로만" 1줄 |
| pending_promotions enqueue/drain/batch surface | **폐기** | inbox.md 1줄 append(§7)가 대체 — 싸고 유실 없음, drain ceremony 불필요 |
| 큰/비가역 결정 기록 전 사용자 confirm | **habit 재작성** | PO habit — §7 말미에 "lite 규칙 유지"로 명시된 항목 |

### 2.7 `lifecycle/index.md` (58줄)

| 규칙 | 처분 | 목적지 / 사유 |
|---|---|---|
| 5-phase 정의 + phase transition write(jq) + 경계 user confirm | **폐기** | §3: Define→Build→Ship→Retro soft stage, gate 없음. 경계 confirm은 load-bearing fork에서만(PO habit) |
| "session은 ephemeral, po-state가 SoT — 매 턴 재정향" | **habit 재작성** | PO habit turn-open 절 — 다만 읽는 대상이 po-state+위키 index(§7)로 교체 |
| 세션 cycle 트리거 4종 | **폐기** | hook#2(post-compact 재주입)가 규율 증발 문제를 직접 해결 — cycle ceremony 불필요 |
| close_gate 공유 literal 체계 | **폐기** | gate 폐지(hook#14·16과 동일 사유) |
| po-state v2 shape 규칙 | **폐기** | 새 po-state 4필드(§2)가 대체. shape 검사는 doctor |

### 2.8 `lifecycle/p1-prd.md` (20줄)

| 규칙 | 처분 | 목적지 / 사유 |
|---|---|---|
| clarity loop (A ≤ 0.05·5-loop cap·finalize) | **playbook 이동** | designer `prd-clarity` — §5 표에 이식 원천으로 명시 |
| PRD 경로 고정 (docs/prd/PRD.md 단일 SoT) | **contract 승격** | contracts.md 고정 경로 맵 — lite PRD 경로 사건(§0 교훈)의 처방: 항상 주입층에 |
| PRD authoring ticket 즉시 emit | **habit 재작성** | PO habit — "산출물이면 ticket"(§1.5) 원칙의 적용 |
| version-open jq (current_version+versions 동시 write) | **폐기** | po-state 4필드 — versions 배열 없음. 버전 전환은 stage/version 필드 갱신(PO 판단) + `retro--v<N>` 위키 |
| P1 진입 시 git branch 생성 | **폐기** | Q2 확정: trunk 기본(§5c) — 버전 브랜치 없음 |
| PRD snapshot guard | **폐기** | 스냅샷 제도 폐지 (hook#14 사유와 동일) |

### 2.9 `lifecycle/p3-build.md` (14줄, 밀도 높음)

| 규칙 | 처분 | 목적지 / 사유 |
|---|---|---|
| Env readiness (ios/android maestro 배선 검사) | **playbook 이동** | qa `smoke` playbook — surfaces{}는 config.json에 이식(§2). "P3-open 1회만 질문" 판단 포함 |
| Test trigger (**SYNCED PAIR** — po/qa 양쪽 byte-identical) | **playbook 이동** | qa `smoke`/`grill`의 `when` frontmatter로 **단일 SoT화**. §0이 이 SYNCED PAIR를 병리로 자백 — PO 쪽 사본은 폐기, QA 쪽만 남기고 playbook화 |
| Deferred decisions → docs/backlog.md | **contract 승격**(ticket 규칙으로 통합) | **Q4 확정(2026-07-02, 설계 §6)**: backlog 파일 폐기 → backlog = version 없는 ticket(`tickets/backlog/`·미래 버전 디렉토리). 이번 버전 내 보류 결정 = 현재 버전 open 티켓+서사, 결정 기록 = 위키 decision |
| Pre-close run-prompt (사용자 눈 확인 권고, skippable) | **playbook 이동** | qa `live-verify` + PO `readiness-dispatch` playbook의 권고 항목 |
| close gate 4-step (backlog_triage→design_review→prd_check→security_6) | **playbook 이동** | PO `readiness-dispatch` — §3 Ship 진입 ritual(DS conformance + surface-conditional security)로 재구성. no-waiver/waivable 기계 구분 폐기, N/A skip은 판단+위키 log |
| 누적 code-review (버전 diff 전체, 3축) | **playbook 이동** | developer `code-review`(§5 표 명시) — readiness-dispatch가 호출 |
| security_6 항목 (qa/bookshelf/security-6.md 참조) | **playbook 이동** | qa `security-pass`(§5 표에 이식 원천 명시) |

### 2.10 `lifecycle/p4-deploy.md` (7줄)

| 규칙 | 처분 | 목적지 / 사유 |
|---|---|---|
| Deploy phase 전체 | **폐기** | §3 명시: "Deploy = Ship 안의 `ops` ticket 1개" |
| project-type gate (N/A → skip) | **habit 재작성** | PO habit — N/A skip은 판단 + 위키 log 1줄(§3 open-gate) |
| 재배포 이력 관리 | **contract 승격** | contracts.md — §3: "재배포 이력은 버전당 1개인 ops ticket에 append" |

### 2.11 `lifecycle/p5-close.md` (41줄)

| 규칙 | 처분 | 목적지 / 사유 |
|---|---|---|
| 5a–5d 절차 (feature-history/fail-patterns/회고/drain) | **playbook 이동** | PO `retro` + `curate-wiki` playbook으로 재구성(§3 Retro stage). 산출물 채널 교체: feature-history→`feature--*.md` · fail-patterns/version-summary→`learning--*.md` · retrospectives→`retro--v<N>.md` |
| Master archive (PRD/DS snapshot) + PRD prune | **폐기** | 단일 living PRD/DS(§2). 버전 시점 기록은 git 이력 + retro 위키가 담당. "master는 항상 현재 그림" 원칙만 living 문서 규칙으로 자연 계승 |
| Retrospective read sources 5종 | **playbook 이동** | `retro` playbook 본문 — 원천을 위키 채널로 교체 |
| Outcome measurement (north_star/input_metrics/lazy protocol) | **playbook 이동** (구조 폐기, 계보 강화) | **Q3 확정(2026-07-02, 설계 §5d)**: north star는 Define의 제품 스코프 입력(측정 수단 → PRD 요구사항). prd-clarity가 도출, retro--vN에 관측 기록, 다음 Define 진입 시 1회 확인. versions[].outcome 스키마·"never remind" lazy protocol은 폐기 |
| P5 promotion drain | **폐기** | promotion 제도 폐지(2.6) |

### 2.12 `lifecycle/state-hygiene.md` (72줄)

| 규칙 | 처분 | 목적지 / 사유 |
|---|---|---|
| Turn-open sweep (recent_turns trim·stale 정리·gate self-heal) | **폐기** | po-state 4필드로 sweep 대상 자체가 소멸. gate self-heal은 gate 폐지로 무의미 |
| State lazy-prompts (stale 조건 질문 3종) | **doctor 흡수** | §6/§9 명시: "blocked 장기화·전이 이상은 doctor가 경고" — 같은 계열로 흡수 |
| versions cap ≤5 rotate | **폐기** | versions 배열 없음 |
| backlog↔ticket reconcile a1–a4 | **폐기** | Q4 확정: backlog가 ticket으로 통합(§6)돼 동기화할 두 번째 장부 자체가 소멸 — stale 병리의 구조적 제거 |
| Harness memory drain (Claude 자체 메모리 → doctrine) | **playbook 이동** | PO `curate-wiki`의 선택 항목 — §8: root 메모리는 "자동 보너스"로만, 의존 안 함. drain 개념은 위키 inbox로 방향만 교체 |
| po-state write는 jq atomic merge만 (raw append 금지) | **contract 승격** | contracts.md 1줄 — 파일 부패 방지는 shape이 바뀌어도 유효한 규칙 |
| top-level canonical 13필드 whitelist | **폐기** | 새 4필드 스키마가 대체, 검사는 doctor |

### 2.13 `lifecycle/ticket-ops.md` (47줄)

| 규칙 | 처분 | 목적지 / 사유 |
|---|---|---|
| `phase:` frontmatter 필수 | **폐기** | v1 frontmatter 7±1(§6)에 phase 없음 — stage는 po-state 소유. statusline은 po-state에서 읽음(§10) |
| Mechanical close rules (timestamp/duration/mirror header) | **contract 승격** (축소) | contracts.md — v1 frontmatter는 `created/closed`만(§6). duration_min·mirror header 폐기 |
| `user-verify` status + 7값 전이 규칙 | **폐기** | 3값 enum(open/done/dropped, §6). user-verify·blocked·review는 open인 채 body 서사 |
| Auto QA smoke gate (coverage·1분 budget·fail loop cap 3) | **playbook 이동** + cap은 contract | qa `smoke` playbook 본문. "impl 후 자동 QA + cap ~3"은 §4 계약(2.1과 동일 항목) |
| Data-layer touch는 실제 렌더/probe로만 close | **playbook 이동** | qa `smoke`/`live-verify` 본문 — QA 지식 |
| GRILL vs basic 선택 기준 | **playbook 이동** | qa `grill` frontmatter `when` — §5 스키마 예시가 정확히 이 규칙("PO 쪽에 존재하던 QA의 GRILL 선택 로직" §0 진단의 처방) |
| Code-review gate (risk-gated, correctness=blocking) | **playbook 이동** | developer `code-review`(fresh-eyes, §5b) — risk-gate 판단 포함 |
| git ticket open/close ops (worktree add/merge --no-ff) | **폐기** | Q2 확정: trunk 기본(§5c) — 티켓 브랜치/worktree 제도 폐기, 격리는 §4 트리거 판단 |

### 2.14 `habit.md` (50줄) — 참고 (bookshelf 아님, 전수 범위 밖이지만 유실 방지 기록)

| 규칙 | 처분 |
|---|---|
| orchestrate-only / 절차 지시 금지 | contract 승격 (§4 제1원칙) |
| mechanical write whitelist (a)–(f) | 대체: v1 PO write = ticket frontmatter(§6) + po-state + 위키 큐레이션 + config.json — contracts 고정 경로 맵으로 |
| user-facing voice (terse 해요체 · display name · 내부 메커니즘 은닉) | habit 재작성 — 새 PO habit(≤60줄)의 "대화" 절로 계승 |
| caveman lite/full | habit 재작성 (축약) |
| turn-open 절차 (silent prep · state 읽기) | habit 재작성 — 읽는 대상만 위키 index(§7)로 교체 |
| read-back / 애매한 ask 확인 | habit 재작성 |
| 외부 콘솔 setup은 공식 문서 검증 후 안내 | habit 재작성 또는 worker habit |

---

## 3부 — 집계와 유실 선언

### 처분 집계 (규칙 단위, 부분 중복 포함)

| 처분 | hook | bookshelf 규칙 |
|---|---|---|
| hook 유지 | 3 | (1 — hook#3 존재 근거) |
| contract 승격 | 3 | 13 |
| playbook 이동 | 2 | 18 |
| doctor 흡수 | 4 | 1 |
| habit 재작성 | — | 10 |
| CLI/wiki 이관 | 2 | 5 |
| 폐기 | 9 | 21 |

### 의도적 유실 (대체물 없이 사라지는 것 — 결정으로 기록)

1. **사전 차단(PreToolUse block) 체계 전체** — §1.4 "강제는 사후·증거 기반". 유일한 잔존 강제는 doctor 경고. dogfood watchlist(§12)가 재도입 트리거를 감시.
2. **7값 status enum과 그 전이 규칙** — 3값 + 서사로. 중간 상태의 기계 추적을 포기하고 doctor 경고로 격하.
3. **calibration 3-tuple 정량 매칭** — learning 페이지의 정성 기록으로. 정량 편향 추적은 v1에서 하지 않는다.
4. **phase/close_gate의 기계 강제** — 판단 + ritual + 위키 log. 무인 모드 위험은 watchlist 항목.
5. **cost strip(사용자 노출 방지)의 기계 보장** — PO habit voice 규칙(판단)만 남음.

---

## 4부 — 리뷰 질문 (승인 전 결정 필요)

| # | 질문 | PO 추천 |
|---|---|---|
| **Q1** | ~~처분 분류에 보조 표기 추가~~ → **(a) 승인 확정** (2026-07-02, 설계 §12.1 개정 완료) | — |
| **Q2** | ~~git 브랜치 전략~~ → **(c) 확정** (2026-07-02): 기본 trunk + tag, 격리는 worktree 트리거 판단. 설계 §5c 신설 | — |
| **Q3** | ~~Outcome measurement~~ → **(b)+ 확정** (2026-07-02): north star는 Define의 스코프 입력으로 강화 이식. 설계 §5d 신설 | — |
| **Q4** | ~~backlog.md 제도~~ → **(c) 확정** (2026-07-02): backlog = version 없는 ticket + 전역 id + `deps` 선택 필드. 설계 §6 개정 | — |
