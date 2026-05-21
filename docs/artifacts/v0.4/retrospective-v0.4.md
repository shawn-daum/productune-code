# v0.4 — Retrospective

> Phase 5 close artifact. Designer 5a (outcome + history append) + 5c (this document).
> Read source: po-state versions[v0.4], feature-history.md, po-memory.md Calibration anchors, fail-patterns.md.

## Header

| 필드 | 값 |
|:--|:--|
| Version id | `v0.4` |
| 시작일 | 2026-04-25 |
| 종료일 | 2026-05-21 |
| 기간 | ~27일 (~3.5 weeks) |
| 총 ticket | 109 (T-P4-001 ~ T-P4-159 range; numbering 비연속 — 일부 deprecated/merged) |
| 주요 영역 | (1) GUI workspace shell · (2) Persona / orchestration doctrine · (3) Token optimization · (4) Project hygiene + meta-dogfooding |
| Phase history | P1 ✓ (04-25→04-26) · P2 ✓ (04-26→04-29) · P3 ✓ (04-29→05-21) · P5 (close — 본 문서) |

---

## Outcome

**North star** (po-state 기록): _"GUI workspace shell schema-driven (Versions/Tickets/Phase gate live from po-state)"_

**Input metrics**:
1. all 4 sidebar tabs render real data
2. phase gate banner triggers on pending_gate

**Validation method**: user visual verification + sample po-state injection.

**Observed result** (designer-fill, 2026-05-21):

- ✅ **4 sidebar tabs all shipped with real po-state data** — Project (Current Version + Past Versions / Tickets), Team (Personas + Skills + MCP + Wiki Memory), Workflow (settings tabs), Versions (lifecycle metadata). Real po-state subscription via `store/poEvents.ts` (T-P4-119 ancher).
- 🔄 **Phase gate banner**: scope-changed. PhaseStrip + LeftSidebar PHASE strip 제거 (T-P4-139, dogfood "정신없다" 피드백). Implicit transition + Approve CTA + PendingGateChip (T-P4-158) 로 대체. → 의도된 단순화.
- ✅ **Bonus**: 8 doctrine landings during the same version (T-P4-126/141/142/149/150/151/152/153/157/159) — meta-dogfooding 성공. GUI 를 짓는 사이 사용한 doctrine 자체를 갈고닦는 사이클이 성립.

**한 줄 평가**: 명시 north_star 1번 metric 은 그대로 달성, 2번 metric 은 더 단순한 UX 패턴으로 치환되어 scope-change 종료. 가장 큰 부수 산출물은 doctrine 자체의 진화.

---

## 핵심 변경 (주요 milestone narrative)

### 1) GUI 워크스페이스 셸 — schema-driven 완성
- **T-P4-049** Persona Presence — Right Panel PO Chat 상단 24px presence strip. 4 persona × 3 state(idle/working/done). 동시 sub-agent 가시성 확보.
- **T-P4-067** ChatPanel restart visual feedback — §1.5.4 anti-pattern fix. 첫 dogfood 컴포넌트 단위 리워크.
- **T-P4-097/099/100/102** 사이드바 통일 — Project 2-section split (Current/Past) · nav-row pattern · 4px drag-resize handle · v1-tab 은 TicketDashboardView 재사용 (322 line 감소).
- **T-P4-119** IPC subscription uplift — ChatPanel `useEffect` 등록 → `store/poEvents.ts` 모듈 top-level 1회. component lifecycle race 영구 차단 anchor.

### 2) Onboarding + 외부 도구 자동화
- **T-P4-125** Ollama auto provider — 기기 성능 감지 + 모델 추천 + `claude mcp add` 자동화. T-P4-121 의 wiki write 4-layer root cause 중 layer 1+2 영구 차단.
- **T-P4-058** 외부 user 감지 + 모달 contrast AAA + `detectProductuneLayout`.
- **T-P4-103** onboarding:clearLocalStorage IPC + OS-aware path.

### 3) Doctrine 진화 — meta-dogfooding 본격 가동
- **T-P4-126** doctrine MD optimization — 13 main file ≤86 non-empty line + 17 sub-file 추출. token ~30-40% 절감.
- **T-P4-141** Persona Activity row 작성책임 = PO 단독 enforcement. developer/QA 6 variant prohibition + ticket L97 강조.
- **T-P4-142** Over-cap (100-line) compression pattern — blank-line 제거 OR self-contained 섹션 추출, prose 깎기 금지.
- **T-P4-143** SkillMatrix `phuryn/pm-*` blanket → 8 specific group/skill override.
- **T-P4-149** Session lifecycle policy — ticket close 시 session drop (per-ticket fresh dispatch).
- **T-P4-150** JSON-only persona output doctrine — `summary` (≤200) + `user_surface` (≤500) 신설. ~80% output-token 절감.
- **T-P4-151** po-state hygiene H1/H2/H3 — past_tickets 8→0, recent_turns 9→5, po-state 9.4KB→5.6KB.
- **T-P4-152** Agent doctrine compress — 9 persona variant ≤100줄 + sub-file 2개. 32K output cap 위반 후 1 file 단위 chunk pattern 확립.
- **T-P4-153** Artifacts restructure — flat → version-bucket → 3-category flat-naming (T-P4-157 amend).
- **T-P4-157** Artifact path doctrine + po-state hygiene 일반화.
- **T-P4-159** Phase 2/3 doctrine — 2-step (static → Gate A → interactive) + Phase 3 Build close 3-item gate (디자인 요소 / 보안 6-prompt / PRD AC) + `anthropic/frontend-design` skill equip.

### 4) GUI 코드 쪼개기 (maintainability stretch)
- **T-P4-154** main.ts 2009→197줄 + 13 ipc/ module 추출.
- **T-P4-155** OnboardingWizard 1099→422줄 + 12 file (step/helper).
- **T-P4-156** VersionHistoryView 932→50줄 + WorkspaceShell 865→192줄 + 15 file.

---

## Wins / Misses

### Wins — process
- **Meta-dogfooding 사이클이 작동했다.** doctrine 결함이 발견되면 (T-P4-099 chunking violation 3x → T-P4-104 hard rule, T-P4-121 wiki write 4-layer root cause → T-P4-125 ollama auto) 같은 버전 안에 doctrine 자체 ticket 으로 박혀나갔다.
- **Worktree-isolated dispatch 패턴 안정화** (T-P4-095/096/097/098/099). sonnet/medium L3 ≈ 11-17분 sweet spot.
- **Token optimization 3종 묶음** (T-P4-149/150/152) — session lifecycle + JSON-only + doctrine compress. 누적 효과는 다음 버전 첫 Phase 1 에서 calibration.

### Wins — product
- 사이드바 4 탭 모두 실데이터로 동작. Project / Team / Workflow / Versions.
- PhaseStrip 제거 결정 (T-P4-139) — dogfood 피드백을 "정신없다" 한 마디로 받아서 즉시 scope-change. UX 단순화의 모범.
- Persona Presence + Background Task Monitor (T-P4-049/068) — 동시 sub-agent 진행 가시성.

### Misses — process
- **Chunking violation 누적** (T-P4-099 3x). T-P4-104 hook 으로 차단했으나, 그 사이 sub-agent hang / stream 미완료가 반복됨.
- **D-1 misread × 2** (T-P4-140 MCP TeamPanel row 위치, T-P4-145 wiki sub-row 제거). dispatch 전 ambiguous user feedback 의 read-back 누락.
- **외부 URL 추측** (paepyeong T-036~039 jsdelivr 404). PO doctrine "외부 자원은 HEAD 검증 후 ctx" 보강.
- **Output 32K cap 위반 × 2** (T-P4-152). file-단위 chunk 패턴 박힌 게 학습.
- **Rate-limit 회복 후 첫 dispatch 세션 손실 × 2** (2026-05-20). `--resume` 대신 fresh dispatch 안전 학습.

### Misses — product
- **Phase 5 deferral 3종** (T-P4-146 MCP add, T-P4-147 autosave triggers, T-P4-148 persona spec edit) — v0.4 안에 unlock 못 함. v1.0 로 carry.
- **Round 5/6/7/8 통째 deferred** (design gate viewer / dev-env automation / memory-wiki editor / deploy abstraction). 가설 검증 우선순위에서 밀림.
- **§1.5 UX audit (T-P4-069)** — 기존 컴포넌트 × 5 sub-rule matrix audit 미수행. v0.5 carry.

---

## Calibration anchors (po-memory.md 학습 — 다음 버전 반영)

1. **Sonnet/medium 7-min sweet spot** — L1-L2 clear-scope mechanical (T-P4-098 4분, T-P4-103 6분, T-P4-127 8분, T-P4-144 90초, T-P4-149 3분). 단일 const/file 패치는 sonnet/low 도 충분.
2. **Sonnet/medium 11-17분 sweet spot — L3 clear-spec ticket** (T-P4-095 11분, T-P4-097 17분, T-P4-102 13분). plan v2 분리 시 dev 일발 통과.
3. **Opus 만 escalation triggers** — (a) doctrine 다발 reorg (T-P4-126 210분 / L4 / 13 file + 17 sub-file), (b) net-new design system / PRD R1, (c) cross-axis architectural reframe.
4. **Output 32K cap 패턴** — 1 dispatch 안 9 variant 동시 패치는 cap 위반 (T-P4-152 × 2회 발생). file-단위 chunk 또는 sub-area 분할 후 dispatch.
5. **Session loss 회복 패턴** — rate-limit 회복 후 첫 dispatch 는 항상 fresh (`claude --agent ...` no `--resume`). 2026-05-20 2× pattern.

---

## Carry-forward (v1.0 으로)

| Ticket | 영역 | 사유 |
|:--|:--|:--|
| **T-P4-146** | MCP server add + rename | Phase 5 deferral unlock 1/3 — `mcp:save` IPC L2. |
| **T-P4-147** | autosaveTriggers UI 활성화 | Phase 5 deferral unlock 2/3 — `WorkflowRulesPanel.tsx` phase5Lock 해제 + IPC + i18n. |
| **T-P4-148** | PersonaDefTab spec edit 활성화 | Phase 5 deferral unlock 3/3 — frontmatter edit + skills assignment + i18n. |
| T-P4-091/092 | Round 9 full-cycle non-dev dogfood | 13 AC evidence 수집. |
| T-P4-050~055 | Design gate viewer | Mermaid + Excalidraw + design system md + hi-fi mockup preview. 가설 후보 #2. |
| T-P4-060~064 | dev-env automation | node-pty + shell status + 외부 service setup TTL 24h SWR. 가설 후보 #3. |
| T-P4-070~072 | 3-tier memory + wiki editor (Monaco) | 가설 우선순위 #1. |
| T-P4-080~082 | DeployProvider interface + Vercel 풀구현 | Phase 5 확장. |
| T-P4-069 | §1.5 UX audit matrix | 기존 컴포넌트 × 5 sub-rule. |
| T-P4-124 | Designer self-author skill | OQ-K G1 — design-system / wireframe / mockup author skill. |

→ ctx 명시 우선 3 ticket: **T-P4-146 / T-P4-147 / T-P4-148** 은 v1.0 첫 Phase 1 PRD 의 "Phase 5 unlock" 묶음으로 진입 권고.

---

## Doctrine landings (누적 룰 변경 — anchor 로 보존)

| Ticket | 분류 | 정착 룰 |
|:--|:--|:--|
| **T-P4-126** | md-optimization | 13 main file ≤86 non-empty line + 17 sub-file (`_formats/` 8 + `_details/` 9) + bootstrap recursive sweep + 영어 default. |
| **T-P4-141** | persona-activity | PA row 작성책임 = PO 단독. developer/QA 6 variant prohibition. persona 는 `notes` ≤80자 반환 → PO 변환·append. |
| **T-P4-142** | over-cap-compression | Trivial (1-2줄) → blank-line 제거. 본격 → reference 성격 섹션 sub-file 추출. prose 깎기 금지. |
| **T-P4-149** | session-lifecycle | Ticket close → session drop. 다음 ticket dispatch = 항상 fresh. 동일 ticket 내 multi-turn 만 resume. |
| **T-P4-150** | persona-output-format | JSON-only stdout. stdout 첫 char = `{`. `summary` ≤200 + `user_surface` ≤500. ~80% output-token 절감. |
| **T-P4-151** | po-state-hygiene | H1: past_tickets prune · H2: recent_turns cap=5 · H3: pending_gate staleness sweep. turn-start enforcement. |
| **T-P4-152** | agent-doctrine-compress | 9 persona variant ≤100줄 + 3 shared section → `_details/` sub-file. cache_creation 30-40% 절감. |
| **T-P4-153** | artifacts-restructure (initial) | `docs/artifacts/<version>/<ticket>/` 구조 확정 (flat → version-bucket). |
| **T-P4-157** | artifact-flat-naming + hygiene 일반화 | 3-category flat: ticket / version-loose / global. po-state hygiene H1/H2/H3 → 단일 staleness sweep (5 field). |
| **T-P4-159** | phase-2-3-doctrine | Phase 2 = 2-step (static → Gate A → interactive code via `anthropic/frontend-design` skill → Gate B). Phase 3 Build close 3-item gate (디자인 요소 / 보안 6-prompt / PRD AC). designer agent skill equip. |

(보조 doctrine landings: T-P4-065 Phase 5단 통일, T-P4-104 chunking hard rule, T-P4-106 bootstrap doctrine, T-P4-107 model/effort defaults, T-P4-120 alternative-reporting, T-P4-121 PO mechanical wiki write — feature-history.md 참조.)

---

## fail-patterns indexing

`docs/qa/fail-patterns.md` v0.4 entries: **없음** (entries section empty).

해석:
- Test ticket trigger #3 (area-tag ≥3 누적 fail) 발동 사례 0. QA fail 누적이 임계 미달.
- 대부분의 fail/rework 는 designer/developer dispatch 단계에서 회복 (chunking violation, D-1 misread, 32K cap) → po-memory.md Calibration log 로 기록됨. QA 자체 fail loop 가 적었던 버전.
- 향후 fail-patterns.md schema 가 driver 가 되려면 QA dispatch 빈도 자체가 늘어야 함 (현재 v0.4 는 type:test ticket 명시 emission 횟수 적음).

→ v0.5 Phase 1 진입 시 designer 의 fail-patterns.md read 는 빈 결과. Trigger #3 활성화 기대치 보정.

---

## Post-process (PO mechanical)

본 문서 land 후 PO 가 처리:

1. `po-state.versions[<v0.4>].outcome.observed_result` ← 위 § Outcome §"Observed result" 한 줄 요약.
2. `po-state.versions[<v0.4>].outcome.retrospective_path` ← `docs/artifacts/v0.4/retrospective-v0.4.md`.
3. `po-state.versions[<v0.4>].ended_at` ← `2026-05-21T<HH:MM:SS>Z`.
4. `po-state.pending_gate` ← null (clear).
5. `po-state.current_phase` ← null (또는 next-version Phase 1 awaiting).
6. `po-state.phase_history` Phase 3 close entry + Phase 5 close entry append.
7. Designer 직접 처리 완료: `docs/designer/feature-history.md` v0.4 entries (이번 turn append).
