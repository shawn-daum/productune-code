---
ticket_id: T-P4-124
title: "Skill set curation — overlap + gap cleanup"
type: doctrine
status: planned
assignee: pdt-designer
estimated_complexity: L3
model: opus
effort: high
created_at: 2026-05-18
---

# Plan — T-P4-124 Skill set curation

> Survey + OQ surface only. ~/.claude/skills/ touch는 user 결정 후 별 turn.

## §1 현 skill 분포 dump

`~/.claude/skills/` walk 결과 (T-P4-122 SKILL.md 필터 적용 후, 즉
hidden dir 제외 + frontmatter `name+description` 있는 entry 만):

### 1.1 mattpocock (28 skills)

| ID | Folder | Persona scope (추정) | Description 핵심 |
|---|---|---|---|
| `setup-matt-pocock-skills` | engineering | dev | matt 컬렉션 install / setup |
| `tdd` | engineering | dev | TDD discipline + module shape |
| `triage` | engineering | dev | issue triage state-machine |
| `diagnose` | engineering | dev | disciplined debug loop (repro → fix → regression) |
| `zoom-out` | engineering | dev | step-back / context-restore |
| `improve-codebase-architecture` | engineering | dev | refactor opportunity scan (CONTEXT.md + ADR-driven) |
| `prototype` | engineering | dev | prototype builder (LOGIC + UI sub-docs) |
| `grill-with-docs` | engineering | dev | docs-driven grilling |
| `to-issues` | engineering | dev | conversation → GitHub issues |
| `to-prd` | engineering | po, designer | conversation → PRD + publish to issue tracker |
| `caveman` | productivity | (all) | caveman-tone communication |
| `grill-me` | productivity | (all) | grilling Q&A discipline |
| `handoff` | productivity | (all) | session handoff / context dump |
| `write-a-skill` | productivity | (all) | meta — skill authoring |
| `git-guardrails-claude-code` | misc | dev | git guardrails for claude code |
| `setup-pre-commit` | misc | dev | pre-commit hook setup |
| `migrate-to-shoehorn` | misc | dev | (specific) shoehorn lib migration |
| `scaffold-exercises` | misc | (none) | exercise scaffolding (learning tool) |
| `edit-article` | personal | (none) | personal writing — article editing |
| `obsidian-vault` | personal | (none) | personal — Obsidian vault management |
| `design-an-interface` | **deprecated** | (designer 의존) | DEPRECATED label |
| `qa` | **deprecated** | (qa) | DEPRECATED label |
| `request-refactor-plan` | **deprecated** | (dev) | DEPRECATED label (replaced by `improve-codebase-architecture`) |
| `ubiquitous-language` | **deprecated** | (designer) | DEPRECATED label |
| `review` | in-progress | (?) | WIP — review skill |
| `writing-beats` | in-progress | (none) | WIP — writing structure |
| `writing-fragments` | in-progress | (none) | WIP — writing structure |
| `writing-shape` | in-progress | (none) | WIP — writing structure |

### 1.2 phuryn (60 skills)

| Pack | Skill count | Examples |
|---|---|---|
| `pm-product-discovery` | 12 | analyze-feature-requests, brainstorm-experiments-{existing,new}, brainstorm-ideas-{existing,new}, identify-assumptions-{existing,new}, interview-script, metrics-dashboard, opportunity-solution-tree, prioritize-assumptions, prioritize-features, summarize-interview |
| `pm-market-research` | 7 | competitor-analysis, customer-journey-map, market-segments, market-sizing, sentiment-analysis, user-personas, user-segmentation |
| `pm-product-strategy` | 12 | ansoff-matrix, business-model, lean-canvas, monetization-strategy, pestle-analysis, porters-five-forces, pricing-strategy, product-strategy, product-vision, startup-canvas, swot-analysis, value-proposition |
| `pm-go-to-market` | 6 | beachhead-segment, competitive-battlecard, growth-loops, gtm-motions, gtm-strategy, ideal-customer-profile |
| `pm-marketing-growth` | 5 | marketing-ideas, north-star-metric, positioning-ideas, product-name, value-prop-statements |
| `pm-execution` | 14 | brainstorm-okrs, create-prd, dummy-dataset, job-stories, outcome-roadmap, pre-mortem, prioritization-frameworks, release-notes, retro, sprint-plan, stakeholder-map, summarize-meeting, test-scenarios, user-stories, wwas |
| `pm-data-analytics` | 3 | ab-test-analysis, cohort-analysis, sql-queries |
| `pm-toolkit` | 4 | draft-nda, grammar-check, privacy-policy, review-resume |

**Total: ~88 skills** (mattpocock 28 + phuryn 60).

## §2 후보 overlap groups

Designer 가 frontmatter description 읽고 1차 분류한 결과. 각 group 의
trade-off + drop/merge/keep 추천을 anchor citation 으로 정당화. user 결정 시
overlay context.

### Group A — PRD authoring (2 parallel mechanisms)

- `phuryn/pm-execution/create-prd` — 8-section template, blank-slate authoring
- `mattpocock/engineering/to-prd` — conversation → PRD + GitHub issue tracker publish

**Pros (keep both)** — 다른 lifecycle: blank-slate (phuryn) vs context-conversion (matt).
**Cons (overlap risk)** — `[Architecture trade-offs · very strong]` productune Designer 의 own clarity-loop (`A ≤ 0.05`, weighted slots) 이 **이 둘 모두를 대체**. Designer doctrine 이 sole-of-truth 면 두 외부 skill 은 leakage path — user 가 PO 외부에서 PRD 만들 수 있는 escape hatch.

**Recommend (designer)** — **둘 다 drop**. `[Architecture trade-offs · very strong]` PRD authoring 은 productune 의 핵심 doctrine surface 이고, 외부 skill 이 leakage path 를 만들면 향후 PRD 일관성 / version_outcome / Acceptance slot 채움 등이 깨짐. user 가 단독으로 외부에서 PRD 쓰고 싶을 때만 한 개 keep 으로 변경 가능.

### Group B — Phuryn pair patterns (existing-vs-new)

3 pair, 총 6 skills:

| Pair | Skills |
|---|---|
| brainstorm-experiments | `*-existing` + `*-new` |
| brainstorm-ideas | `*-existing` + `*-new` |
| identify-assumptions | `*-existing` + `*-new` |

**Mechanism** — 같은 task 의 lifecycle 분기 (existing product 평가 vs new
product 탐색). frontmatter 만 다를 가능성.

**Recommend (designer)** — **lifecycle-aware single skill 로 merge 고려 OR
drop "existing" only**. productune 가 Version-based 라서 V1 = new, V2+ =
existing 자연 분기 → 두 phase 동시 활성 안 됨. user 가 V1 만 쓸 거면
`*-existing` drop, V2+ 도 쓸 거면 둘 다 keep. `[Architecture trade-offs ·
very strong]` 사용자 의도 (단순화) 의 정답은 user 의 Version 흐름에 의존.

### Group C — Strategic framework templates (12, low-frequency)

`pm-product-strategy` 12개. 대부분 일회성 학습 / template 도구:
swot / pestle / porters / ansoff / lean-canvas / startup-canvas /
business-model / monetization / pricing / product-strategy / product-vision /
value-proposition.

**Recommend (designer)** — **3개 정도만 keep, 나머지 drop**:
- Keep: `product-vision`, `value-proposition`, `lean-canvas` (가장 generic).
- Drop: `pestle-analysis`, `porters-five-forces`, `ansoff-matrix`,
  `startup-canvas`, `business-model`, `swot-analysis`, `monetization-strategy`,
  `pricing-strategy`, `product-strategy` (overlap with `product-vision`).

`[Architecture trade-offs · very strong]` 한 productune 프로젝트가 12 frameworks 동시 surface 하면 SkillMatrixTab 의 신호-잡음비 악화. 학습 reference 가 필요하면 그때 한시적 install 후 drop.

### Group D — GTM family (6)

`pm-go-to-market`: gtm-strategy / gtm-motions / ideal-customer-profile /
beachhead-segment / growth-loops / competitive-battlecard.

**Recommend (designer)** — **2개 keep**: `ideal-customer-profile`,
`gtm-strategy`. 나머지 drop. `[Architecture trade-offs · very strong]`
productune 의 phase mapping (PRD 의 ICP slot + GTM context) 에 둘이면 충분.

### Group E — Marketing surface generators (5)

`pm-marketing-growth`: marketing-ideas / north-star-metric / positioning-ideas
/ product-name / value-prop-statements.

**Recommend (designer)** — **2개 keep**: `north-star-metric` (productune
version_outcome.north_star 와 직결), `value-prop-statements` (PRD value-prop
slot 완성). 나머지 (marketing-ideas / positioning-ideas / product-name) drop —
phuryn 의 다른 strategy skill 과 overlap.

### Group F — Non-productune personal/admin skills (6)

| Skill | Reason |
|---|---|
| `mattpocock/personal/edit-article` | personal writing, no productune workflow tie |
| `mattpocock/personal/obsidian-vault` | personal note management |
| `phuryn/pm-toolkit/draft-nda` | legal admin, out of productune scope |
| `phuryn/pm-toolkit/grammar-check` | generic editing, claude code 가 직접 충분 |
| `phuryn/pm-toolkit/privacy-policy` | legal admin |
| `phuryn/pm-toolkit/review-resume` | HR admin |

**Recommend (designer)** — **6개 모두 drop**. `[Architecture trade-offs · very strong]` SkillMatrixTab 의 PO/Designer/Dev/QA persona-scope 와 정합 안 됨 → 시각적 잡음. user 가 개인 용도로 쓰고 싶으면 다른 claude code session 에서 별도 install.

### Group G — Mattpocock deprecated (4)

author 가 이미 `deprecated/` 폴더로 라벨한 4개:
`design-an-interface` / `qa` / `request-refactor-plan` / `ubiquitous-language`.

**Recommend (designer)** — **4개 모두 drop**. `[Architecture trade-offs ·
very strong]` author intent 직접 반영. SkillMatrixTab T-P4-122 dedup 후에도
deprecated 행이 보이는 것은 user noise. 단 `design-an-interface` 는 §3 의
"Design phase skill gap" 후보로 다시 거론될 수 있음 (대체재가 없음).

### Group H — Mattpocock in-progress (4)

`review`, `writing-beats`, `writing-fragments`, `writing-shape`.

**Recommend (designer)** — **4개 모두 drop**. `[Architecture trade-offs ·
very strong]` author 가 WIP 라벨 — 안정성 미보장. writing-* 는 personal
writing 도구로 productune 무관.

### Group I — Mattpocock misc (4)

| Skill | Recommend |
|---|---|
| `git-guardrails-claude-code` | **keep** — claude code git 안전망, productune 의 git-workflow.md 와 정합 |
| `setup-pre-commit` | **keep** — pre-commit hooks, productune 의 lint/build 무결성 |
| `migrate-to-shoehorn` | **drop** — shoehorn lib 특정 (productune 미사용) |
| `scaffold-exercises` | **drop** — learning tool, productune 워크플로 무관 |

`[Architecture trade-offs · very strong]` git + lint hygiene 은 productune
self-verify gate 와 강결합 → keep.

### Group J — Phuryn pm-execution residuals after Group A drop

`pm-execution` 14 skills 중 PRD-related (`create-prd`) 외:

| Skill | Productune mapping | Recommend |
|---|---|---|
| `brainstorm-okrs` | OKR — productune 미사용 | drop |
| `dummy-dataset` | test data — `[Architecture trade-offs]` QA workflow 보조, low frequency | optional drop |
| `job-stories` | PRD JTBD slot 보조 | **keep** |
| `outcome-roadmap` | productune `versions[]` + ROADMAP doctrine 과 강결합 | **keep** |
| `pre-mortem` | risk identification, PRD risk slot | **keep** |
| `prioritization-frameworks` | ticket priority (RICE 등) | **keep** |
| `release-notes` | Phase 4 deploy 보조 | **keep** |
| `retro` | Phase 5 retrospective (productune 의 retrospective.md 와 정합) | **keep** |
| `sprint-plan` | productune Phase 모델과 다른 sprint 개념 | drop |
| `stakeholder-map` | low frequency for solo / small team | optional drop |
| `summarize-meeting` | productune 외부 (회의록) | drop |
| `test-scenarios` | productune QA persona doctrine + `type:test` 와 정합 | **keep** |
| `user-stories` | PRD JTBD slot — `job-stories` 와 overlap | optional drop |
| `wwas` | "what we already shipped" — versions[] 보조 | optional keep |

### Group K — Phuryn pm-product-discovery residuals (12)

대부분 keep — productune 의 PO discovery / brief authoring 과 정합.
단:
- `brainstorm-experiments-{existing,new}` 2개 (§B Group B 에서 다룸)
- `brainstorm-ideas-{existing,new}` 2개 (§B Group B 에서 다룸)
- `identify-assumptions-{existing,new}` 2개 (§B Group B 에서 다룸)
- 나머지 6개: `analyze-feature-requests`, `interview-script`, `metrics-dashboard`, `opportunity-solution-tree`, `prioritize-assumptions`, `prioritize-features`, `summarize-interview` — **모두 keep** (PO 의 discovery loop 와 1:1 매핑).

### Group L — Phuryn pm-data-analytics (3)

`ab-test-analysis`, `cohort-analysis`, `sql-queries` — productune 의 Phase 5
outcome measurement (validation_method = PostHog/Sentry/SQL) 과 정합.

**Recommend (designer)** — **3개 모두 keep**.

## §3 후보 gap candidates

productune workflow Phase 1–5 + cross-cutting concern 으로 skill mapping
테이블 작성 → 빈 칸 surface.

### 3.1 Phase mapping

| Phase | Workflow | Existing skill | Gap? |
|---|---|---|---|
| 1 PRD | clarity loop, JTBD, value prop | Designer doctrine + (Group A drop 시) phuryn/job-stories + value-proposition | OK |
| 2 Design | DS, flow, wireframe, mockup | Figma MCP + `mattpocock/deprecated/design-an-interface` (deprecated!) | **YES — design-system / wireframe / mockup authoring skill 부재** |
| 3 Build | impl + plan-mode + refactor | mattpocock/tdd + improve-codebase-architecture + prototype + diagnose + triage | OK |
| 4 Deploy | step ticket + verify | (productune doctrine 만, skill 무) | **YES — deploy / rollback / smoke-after-deploy / monitoring 가이드 skill 부재** |
| 5 Retrospective | retro, outcome measurement | phuryn/retro + pm-data-analytics 3종 | OK |

### 3.2 Cross-cutting concern mapping

| Concern | Existing skill | Gap? |
|---|---|---|
| Security review / threat model | none | **YES** |
| Accessibility audit | none | **YES** (T-P4-123 에서 a11y 직접 작성 — recurring 시 skill 필요) |
| Performance baseline / profiling | mattpocock/diagnose (regression-focused) | **partial gap** — proactive baseline 없음 |
| Migration playbook (general) | `migrate-to-shoehorn` (특정 lib only) | **YES — generic migration skill 부재** |
| User docs / README authoring | none | **YES** (productune 에 docs/ 많이 쌓이는데 author skill 없음) |
| Semver / versioning decision | none | partial gap (productune 의 version-id 규칙 T-P4-095 이 doctrine 대체) |
| Cost / budgeting (LLM, infra) | phuryn/pricing-strategy (외부 pricing) | **YES — 내부 cost tracking 부재** |
| Localization (i18n strategy) | none | **partial gap** — T-P4-123 에서 i18n strategy axis as gap 처음 anchor 됨 |
| Data privacy / GDPR / DSAR | phuryn/pm-toolkit/privacy-policy (drop 후보) | **YES** if drop |

### 3.3 Gap candidates summary

추가 skill 후보 (user 가 install / author 결정):

| # | Candidate | Source 옵션 | 우선순위 (designer 판단) |
|---|---|---|---|
| G1 | design-system / wireframe / mockup author | mattpocock 가 design-an-interface 부활 / 외부 / productune self-author | **High** — Phase 2 essential |
| G2 | deploy playbook (rollback / monitoring / smoke) | productune self-author (deploy step ticket doctrine 과 강결합) | **High** — Phase 4 essential |
| G3 | accessibility audit (a11y checklist) | 외부 skill (axe-core 등) 매칭 | **Med** — T-P4-123 류 ticket 누적되면 발행 |
| G4 | user docs / README author | 외부 또는 self-author | **Med** |
| G5 | security review / threat model | 외부 skill 매칭 | **Low** (Solo / small project 단계) |
| G6 | generic migration playbook | 외부 또는 self-author | **Low** |
| G7 | i18n strategy guide | self-author (T-P4-123 결정 결과 반영) | **Med** (UKS gap axis 와 연결) |
| G8 | LLM / infra cost tracking | productune self-author | **Low** |

## §4 §D Open Questions — user 결정 필요

본 plan 은 designer 추천만 — user 가 turn 들어와 group-by-group 답변.

### OQ-A. Group A (PRD authoring overlap)

- (a-1) `phuryn/create-prd` + `mattpocock/to-prd` **둘 다 drop** [designer 추천]
- (a-2) 한쪽만 keep — which? `to-prd` (context-conversion) 또는 `create-prd` (template)
- (a-3) 둘 다 keep (현 상태 유지)

### OQ-B. Group B (existing-vs-new pair patterns)

3 pair 별로 user 결정:
- (b-1) `brainstorm-experiments-{existing,new}` — drop existing only / drop new only / keep both / drop both
- (b-2) `brainstorm-ideas-{existing,new}` — 동일 옵션
- (b-3) `identify-assumptions-{existing,new}` — 동일 옵션

### OQ-C. Group C (strategy frameworks — 12 → 3)

- (c-1) designer 추천 [keep: product-vision, value-proposition, lean-canvas / drop 나머지 9]
- (c-2) user 가 keep list 재지정 ("keep X, Y, Z; drop 나머지")
- (c-3) 모두 keep

### OQ-D. Group D (GTM — 6 → 2)

- (d-1) designer 추천 [keep: ideal-customer-profile, gtm-strategy / drop 4]
- (d-2) user 가 keep list 재지정
- (d-3) 모두 keep

### OQ-E. Group E (marketing surface generators — 5 → 2)

- (e-1) designer 추천 [keep: north-star-metric, value-prop-statements / drop 3]
- (e-2) user 가 keep list 재지정
- (e-3) 모두 keep

### OQ-F. Group F (personal/admin — 6 drop)

- (f-1) designer 추천 [6 모두 drop]
- (f-2) keep 일부 — 어떤 것
- (f-3) 모두 keep

### OQ-G. Group G (mattpocock deprecated — 4 drop)

- (g-1) designer 추천 [4 모두 drop]
- (g-2) keep — design-an-interface 부활 검토 (gap G1 과 연결)

### OQ-H. Group H (mattpocock in-progress — 4 drop)

- (h-1) designer 추천 [4 모두 drop]
- (h-2) 일부 keep — 어떤 것

### OQ-I. Group I (mattpocock misc — 2 keep + 2 drop)

- (i-1) designer 추천 [keep: git-guardrails + setup-pre-commit / drop: migrate-to-shoehorn + scaffold-exercises]
- (i-2) user 변경

### OQ-J. Group J (pm-execution residuals)

`optional drop` 항목 user 결정:
- (j-1) `dummy-dataset` — drop / keep
- (j-2) `sprint-plan` — drop [designer 추천] / keep
- (j-3) `stakeholder-map` — drop / keep
- (j-4) `summarize-meeting` — drop [designer 추천] / keep
- (j-5) `user-stories` (job-stories 와 overlap) — drop / keep
- (j-6) `wwas` — keep [designer 추천] / drop
- (j-7) `brainstorm-okrs` — drop [designer 추천] / keep

### OQ-K. Gap candidates (8 후보 — install / author 결정)

| ID | Candidate | 우선순위 |
|---|---|---|
| G1 | design-system / wireframe / mockup author | **High** |
| G2 | deploy playbook | **High** |
| G3 | accessibility audit | Med |
| G4 | user docs / README author | Med |
| G5 | security review | Low |
| G6 | generic migration playbook | Low |
| G7 | i18n strategy guide | Med |
| G8 | LLM / infra cost tracking | Low |

user 결정: 각 G1–G8 에 대해
- (skip) — 안 만든다
- (find external) — 외부 skill 검색 (designer 가 후보 surface)
- (author self) — productune self-author 별 ticket 발행

### OQ-L. Skill referencing doctrine update

drop 결과가 productune doctrine 의 skill auto-load reference 에 영향:
- `~/.productune/po-instructions.md` 의 "First-touch interview" → `pm-product-discovery:*` + `pm-market-research:*` 참조 → drop 으로 모듈 비면 reference 갱신 필요.
- `packages/core/agents/variants/graphiti/pdt-developer.md` 의 `## Skills` 섹션 — mattpocock 스킬 명시 list (`tdd`, `triage-issue`, `request-refactor-plan`, `improve-codebase-architecture`, `setup-pre-commit`, `git-guardrails-claude-code`). `request-refactor-plan` deprecated 라 자동 갱신 대상.
- `packages/core/agents/variants/graphiti/pdt-designer.md` 의 `## Skills` 섹션 — `mattpocock/design-an-interface` 명시 (deprecated). 갱신 필수.
- `packages/core/agents/variants/graphiti/pdt-qa.md` — Skills 섹션 없음 (현재 OK).

User 결정 후 본 ticket impl turn 에서 함께 갱신.

## §5 §E Impl spec (post-decision)

user 가 OQ-A ~ OQ-L 답한 후 별 turn 에서 designer 가 impl. 윤곽:

### 5.1 Skill directory cleanup

drop 결정 skill 별로:
- 외부 repo 안 (mattpocock / phuryn) → **directory rename to `_archived-<date>/`** rather than rm. `~/.claude/skills/<source>/_archived-<date>/<skill>/`. T-P4-122 의 hidden-dir-skip 필터가 자동 처리 (`_` prefix 는 hidden 아니므로 별도 필터 추가 필요 — see §5.2).
- alternative: drop = `mv` to `~/.claude/.archived-skills/<source>/<skill>/` (hidden parent dir, T-P4-122 필터로 자동 제외). **권장**: 후자.

### 5.2 SkillMatrixTab dedup 필터 보강 (선택)

T-P4-122 이미 hidden dir skip. `~/.claude/.archived-skills/` 는 자동 제외 OK
— 추가 필터 불필요. 별 ticket 불요.

### 5.3 Doctrine update

- `packages/core/agents/variants/graphiti/pdt-developer.md` § Skills 섹션 — drop 된 skill 제거.
- `packages/core/agents/variants/graphiti/pdt-designer.md` § Skills 섹션 — `design-an-interface` 처리 (drop 시 제거 / 부활 시 그대로).
- `~/.productune/po-instructions.md` 의 `pm-product-discovery:*` glob reference — 살아남은 skill 만 매칭되므로 자동 OK. 갱신 불필요.

### 5.4 SKILL.md frontmatter persona scope override (선택)

phuryn 스킬 일부는 frontmatter 에 `personas:` 없어서 SkillMatrixTab 가
`inferPersonasFromPath` (main.ts L1269) 로 추정. drop 결정 후 keep 된
phuryn 스킬에 `personas:` 명시 PR 보내는 옵션 — 외부 repo touch 라 **scope 외**.
productune 측 fallback (`inferPersonasFromPath`) 가 충분.

### 5.5 Gap candidates (G1–G8) 결정 후

user 가 `(author self)` 선택한 candidate → 본 ticket 종료 후 각각 별 ticket
emit (skill 작성 ticket, e.g. `T-P4-NNN deploy-playbook-skill`).

## §Out of scope

- 외부 repo (mattpocock / phuryn) 의 skill md 자체 수정 — productune 가
  mutate 안 함.
- productune 자체 신규 skill 작성 — §5.5 별 ticket 으로 promote.
- SkillMatrixTab UI 변경 — T-P4-122 (dedup) + T-P4-123 (i18n + popover) 으로
  분리됨.
- skill auto-load matching 알고리즘 변경 (현 `inferPersonasFromPath` 유지).
- `~/.claude/skills/` 외 (다른 claude session 의 skill) 정리.

## §QA scope

| Field | Value |
|:--|:--|
| **QA invoke** | `manual smoke only` |
| **test target** | SkillMatrixTab 의 row count + drop 된 skill 0건 노출 |
| **사용자 dogfood** | user 가 정리 결과로 띄운 SkillMatrixTab 보면서 직접 검수. drop 된 skill (예: deprecated 4 + personal 2 + admin 4 등) 행 0개 확인. keep 된 skill 만 row + 추정 persona scope 정상. |
| **regression check** | T-P4-122 hidden dir filter + frontmatter name+description filter — `~/.claude/.archived-skills/` 정상 제외 확인 (별 추가 필터 불요). T-P4-123 i18n popover — drop 된 skill 의 ko translation key 도 함께 정리 (locales/ko.json 의 `skills.descriptions.<dropped>` 제거). |
