---
ticket_id: T-P4-123
title: "SkillMatrixTab — description tooltip + i18n (ko/en)"
type: impl
status: planned
assignee: pdt-developer
estimated_complexity: L2
model: sonnet
effort: medium
created_at: 2026-05-18
---

# Plan — T-P4-123 SkillMatrixTab description tooltip + i18n

> 2 alternative blocks (UX trigger + i18n strategy). User decides both before
> dev dispatch. Anchored to `~/.productune/po-memory.md ## User knowledge state`.

## §1 Context

### Current rendering (SkillMatrixTab.tsx L154–157)

```tsx
<td style={tdSkill}>
  <span style={skillIdStyle}>{skill.name}</span>
  <span style={skillDesc}>{skill.description}</span>
</td>
```

`skill.description` is an inline `<span>` immediately after `skill.name` in the
same `<td>`. mattpocock / phuryn skills carry **English-only** frontmatter
descriptions ranging 80–300 chars → each row visually consumes 4–5 wrapped
lines, eating vertical space and disrupting scan.

### Constraints

- Skill md files (`~/.claude/skills/mattpocock/**/*.md` etc.) are **external
  repos** — productune cannot mutate their frontmatter `description:` strings.
- Existing i18n infra: `react-i18next` + `packages/gui/src/locales/{ko,en}.json`.
  Active namespace example: `workspace.team.skillMatrix.{title,search,...}`.
- `SkillEntry` type (`packages/gui/src/lib/types.ts:169`) — `id`, `name`,
  `description`, `personas[]`, `filePath`. `id` = stable path-based key (e.g.
  `mattpocock/skills/engineering/tdd/SKILL.md`).
- User UI lang determined by `i18n.language` (`ko` | `en`).

## §2 §A UX trigger — 3 alternatives

User UKS anchor: `[Architecture trade-offs · very strong]` for layer
trade-offs; `[React lifecycle · solid]` for re-render / portal cost; `[Zustand
store · comfortable]` for any shared open-state.

### Option (i) — Tooltip on hover

Pure CSS `:hover` reveal or lightweight wrapper. No JS state for open/close.

**Pros**
- `[React lifecycle · solid]` zero re-render — no `useState`, no portal mount cost. Pure CSS hover state.
- `[Architecture trade-offs · very strong]` smallest surface; one row component, no shared open-state coordination across rows.
- `[Architecture trade-offs]` mobile/touch path도 별도 cost 없음 — touch device 에서는 long-press 또는 click이 hover 를 대체하는 OS-level fallback.

**Cons**
- `[Architecture trade-offs]` hover-only = touch + keyboard 사용자 접근 어려움 (touch 는 long-press fallback, keyboard 는 `:focus` 추가 selector 필수). AC5 (tab+Enter 토글) 가 hover 만으로는 자연스럽지 않음 — focus-trigger 도 같이 emit 해야 함.
- `[React lifecycle]` description 이 viewport 가장자리에서 잘릴 위험 — pure CSS positioning 으로 collision-detection 없음 (오른쪽 끝 row 의 tooltip 이 화면 밖으로). Edge-case 처리하려면 결국 JS positioning 필요 = (ii) Popover 와 cost 수렴.

### Option (ii) — Popover on click (controlled state)

`useState<string | null>(openSkillId)` shared in SkillMatrixTab; click toggles
per row. Optional `aria-describedby` + positioning lib (Floating UI 등) 또는
간단한 anchor-relative absolute.

**Pros**
- `[Architecture trade-offs · very strong]` 명확한 trigger contract (click = toggle, Esc = close, click outside = close). touch / keyboard / mouse 동등 처리.
- `[React lifecycle · solid]` open-state 가 명시적 — 디버깅 / 테스트 직관적. 한 번에 한 popover 만 (mutex) 명시 가능.
- `[Architecture trade-offs]` Edge collision 처리 가능 (anchor rect 기준 우/좌 자동 swap).

**Cons**
- `[Architecture trade-offs]` hover 보다 1-step 더 멀음 — long-form description 을 빠르게 훑고 싶을 때 마찰. 사용자가 “설명 너무 길어” 라고 말한 의도 (스크롤 압박 해소 + 필요할 때만 보고 싶음) 와 정합하지만, hover 만큼 가볍지 않음.
- `[React lifecycle]` 외부 클릭 닫기 (outside-click listener) + Esc handler 추가 = 별도 effect. Cleanup 누락 시 stale listener.

### Option (iii) — Inline accordion (row expand)

같은 `<td>` 안에서 row 자체가 expand → description 이 row 아래에 inline.
별도 portal/popover layer 없음.

**Pros**
- `[React lifecycle · solid]` 가장 단순한 layout — popover positioning 불필요. CSS `max-height` transition 으로 부드럽게.
- `[Architecture trade-offs]` 어떤 row 가 열려있는지 시각적으로 자명 (chevron icon 등).

**Cons**
- `[Architecture trade-offs]` 사용자 요구사항 (“행 하나가 4–5줄 차지”) 와 정면 충돌 — 열린 row 는 여전히 4–5줄 차지. 다중 row 열림 허용 시 더 악화. 단일 row 열림으로 강제하면 “표 안에서 정보 비교” UX 잃음.
- `[React lifecycle]` table row 의 expand 는 colspan 트릭 (`<tr><td colspan="5">desc</td></tr>` 보조 행) 또는 별도 stacked-card layout 으로 전환 필요 — 현재 plain `<tr>` 구조 큰 변경.

### Recommended option

**Recommended: (ii) Popover on click** — `[Architecture trade-offs · very
strong]` 사용자 의도 (스크롤 압박 해소 + 필요할 때만 description 노출 + ko/en
대응 + keyboard 접근성 AC5) 를 모두 충족하면서, `[React lifecycle · solid]`
useState + cleanup effect 패턴이 이미 익숙한 영역. (i) 의 viewport edge 문제와
(iii) 의 layout 충돌이 모두 회피된다. (i) 의 hover 가벼움을 일부 살리려면
`onMouseEnter` 도 같이 trigger 로 추가하는 변형이 가능 (= ii + i 하이브리드),
다만 mutex 처리는 popover-as-default.

## §3 §B i18n strategy — 3 alternatives

User UKS anchor: `[i18n strategy · gap]` — 사용자가 정적 사전 vs runtime 번역
trade-off 를 처음 보는 영역이라 명시했음. **Pros/Cons 에서 mechanism 을
구체적으로 풀어주는 것이 mandatory**. `[Architecture trade-offs · very
strong]` 도 부분적으로 적용.

### Option (a) — Static dictionary in `locales/{ko,en}.json`

빌드 타임에 모든 mattpocock + phuryn 스킬의 ko description 을 productune repo
의 `packages/gui/src/locales/ko.json` 에 박음. key 는 `skills.descriptions.<skill_id_kebab>` 형태.
runtime 에 `t('skills.descriptions.tdd', { defaultValue: skill.description })`.

**Pros**
- `[i18n strategy · gap]` mechanism = 일반 react-i18next 패턴. 다른 productune i18n key 들과 동일한 lifecycle (빌드 타임 결정, runtime read-only). 사용자가 이미 본 패턴 재사용.
- `[Architecture trade-offs · very strong]` 외부 네트워크 / LLM 호출 없음 — 빌드 결과물만으로 동작. 오프라인 OK, 결정론적, 변환 결과 git diff 로 review 가능.
- `[i18n strategy · gap]` placeholder/label i18n 과 동일 메커니즘 — 사용자가 한 패턴만 학습하면 됨. fallback 동작 (`defaultValue: skill.description`) 도 i18next 표준.

**Cons**
- `[Architecture trade-offs]` 새 외부 skill 이 설치되면 ko description 누락 → 영문 fallback (graceful 하지만 약속한 ko 경험 깨짐). 매번 productune repo 에 i18n PR 필요 — 외부 skill 추가에 대해 productune 가 따라가야 함.
- `[i18n strategy · gap]` 번역 자체는 누가 만드는가? 사람이 직접 (정확하지만 정체) or LLM 일회성 빌드 시 생성 (이 자체가 (b) 의 일부) — 일회성 LLM 생성을 빌드 타임에 묶으면 (a) ⊆ (b) 의 캐싱 버전이 됨.
- `[Architecture trade-offs]` 현재 시점에 약 40–50개 (mattpocock 28 + phuryn 등) 스킬 — 수동 번역 1회 cost 는 작지만, 누적 maintenance cost 가 비결정적.

### Option (b) — Lazy translation + filesystem cache

사용자가 처음 hover/click 할 때만 번역 fetch. main process 에서 `claude
--print` (또는 LLM API) 1회 호출 → 결과를 `~/.productune/skill-translations/<lang>/<skill-id-hash>.txt`
에 캐싱. 두 번째부터는 cache hit.

**Pros**
- `[i18n strategy · gap]` mechanism = on-demand + memoization. 사용자가 보지 않는 스킬에 대해 번역 비용 0. 새 외부 skill 자동 처리 — productune PR 불필요.
- `[Architecture trade-offs · very strong]` 자기 학습형 — productune 가 사용자 실제 사용 빈도에 맞춰 번역 캐시 빌드. 사용자가 한 번도 안 본 deprecated 스킬은 영원히 번역되지 않음 (cost 최소화).
- `[i18n strategy · gap]` 번역 품질이 productune 의 LLM model 선택에 결합 → claude / ollama 등 사용자 환경에 맞춰 자연스럽게 향상.

**Cons**
- `[Architecture trade-offs]` 첫 hover 시 latency (LLM round-trip 0.5–3s). UX 신호 (spinner / "translating…") 필수. T-P4-119 race-condition 학습이 다시 적용됨 (request 발사 → response 도착 전 사용자가 다른 row hover 시 응답 stale).
- `[Architecture trade-offs]` IPC + subprocess + cache directory + invalidation 정책 (skill description 변경 감지 = file hash?). 새 코드 표면이 가장 큼 — L2 estimate 가 L3 로 swap 될 위험.
- `[i18n strategy · gap]` 결정론 없음. 같은 description 도 LLM call 마다 미세하게 다르게 번역 (cache hit 후 고정되지만 첫 캐싱이 모든 사용자 결과를 lock). 사용자 간 일관성 없음.

### Option (c) — English description retained; ko UI shell only

`skill.description` 본문은 영문 유지. ko 사용자는 label / search placeholder /
filter button 같은 UI shell 만 ko, description 본문은 그대로.

**Pros**
- `[i18n strategy · gap]` mechanism = 변경 최소. 신규 i18n key 0개, 신규 IPC 0개. 본 ticket scope 가 UX trigger 만 해당 (T-P4-123 의 i18n 부분 사실상 제거).
- `[Architecture trade-offs · very strong]` 외부 skill 의 frontmatter 가 영문인 현실에 맞춤. mattpocock / phuryn 이 향후 i18n 지원 시 productune 가 자동 수혜.
- `[Architecture trade-offs]` 번역 품질 / 결정론 / cache 정책 결정 일체 회피.

**Cons**
- `[i18n strategy · gap]` 사용자 directive ("사용자 언어에 맞게 나오게 해줘") 와 직접 충돌. user explicit ask 를 거부하는 옵션.
- `[Architecture trade-offs]` "한국어 UI 인데 핵심 정보만 영어" = ko 사용자 mental model 단절. SkillMatrixTab 외 다른 ko 컴포넌트와 톤 불일치.

### Recommended option

**Recommended: (a) Static dictionary** — `[i18n strategy · gap]` 사용자가
처음 보는 trade-off 영역인데, 가장 결정론적이고 기존 react-i18next 패턴 재사용
이라 학습 cost 가 0. 번역 1회 작성은 LLM batch (옵션 (b) 의 일회성 build-time
판) 으로 처리 — git diff 로 review 가능. `[Architecture trade-offs · very
strong]` 외부 skill 추가 시 ko 누락 = graceful en fallback (사용자 약속을
부분 깨지만 표 자체는 동작) 으로 운영 가능. (b) 는 새 IPC + cache + race 표면
때문에 L2 estimate 깨질 위험, (c) 는 user directive 직접 거부라 채택 불가.

### Sub-decision (recommended only if (a) chosen)

(a) 내부에서 번역을 누가 어떻게 만드는가:

- (a.1) **사용자 (수동)** — 향후 PR 마다 ko 번역도 같이. 정확하지만 정체.
- (a.2) **LLM batch (1회성)** — 본 ticket impl 시 dev 가 `claude --print` 으로
  전체 skill description 을 ko 번역 → locales/ko.json 에 박음. 향후 새 skill
  은 (a.1) 또는 추가 batch 호출.
- (a.3) **하이브리드** — 본 ticket 은 (a.2), 향후 install.sh / postinstall hook
  으로 새 skill 자동 batch (별 ticket).

권장: **(a.2)** — 본 ticket 범위에서 결정론 확보, 향후 자동화는 (a.3) 으로 별
ticket promote. `[Architecture trade-offs · very strong]` 사용자가 위 user 답
이전에는 (a.2) 가 가장 안전한 default.

## §4 §C Impl spec (post-decision, recommended path = ii + a + a.2)

이 §C 는 user 가 (ii) + (a) + (a.2) 를 결정한 가정하의 impl 윤곽. 다른 조합
선택 시 dev impl 시 §C 재작성 dispatch 필요.

### 4.1 Component change — `SkillMatrixTab.tsx`

- Top-level `useState<string | null>(openSkillId)` 추가 — popover open
  체크용. 단일 선택 (mutex).
- Row 의 `<td style={tdSkill}>` 구조 변경:
  - `skill.name` (현행 유지)
  - `<button>` (`aria-label`, `aria-expanded`, `aria-describedby`) — 작은 info icon 또는 `…` 표시. click → `setOpenSkillId(prev => prev === skill.id ? null : skill.id)`.
  - `openSkillId === skill.id` 일 때 popover render. Popover 는 anchor-relative absolute positioning (현 td 기준 right=0, top=full height). edge collision 처리 = 간단히 viewport right edge 검사 후 swap.
- Popover content = `t(\`skills.descriptions.\${skill.id을 i18n-safe key 로 변환}\`, { defaultValue: skill.description })`.
- Effect: Esc 키 + outside-click → `setOpenSkillId(null)`. Cleanup mandatory.
- Keyboard: 버튼은 native `<button>` (기본 focus + Enter/Space 트리거).
- Inline `<span style={skillDesc}>{skill.description}</span>` 제거 (default
  hide).

### 4.2 i18n key — `locales/{ko,en}.json`

```json
{
  "skills": {
    "descriptions": {
      "mattpocock_skills_engineering_tdd_SKILL_md": "<번역문>",
      "mattpocock_skills_engineering_prototype_SKILL_md": "<번역문>",
      ...
    }
  }
}
```

key 형식: `skill.id` 의 `/` 와 `.` 와 `-` 를 `_` 로 replace (i18next dot-notation
충돌 회피). dev impl 시 helper `skillIdToI18nKey(id: string): string`.

en.json 에는 동일 key + 영문 원본 description (fallback 안전망).

### 4.3 i18n entry build script (a.2 batch — 별 sub-task)

`packages/gui/scripts/build-skill-translations.mjs` — node script:

1. `~/.claude/skills/**/*.md` 스캔 (`collectMdFiles` 로직 재사용, T-P4-122 와
   동일 필터).
2. 각 skill 의 frontmatter `description` 추출.
3. ko 번역 = `claude --print` 으로 batch 호출 (한 JSON 응답으로 모든 번역).
4. 결과를 `packages/gui/src/locales/ko.json` 의 `skills.descriptions` 에 머지.

본 ticket 의 dev 가 1회 실행 → 결과 commit. 향후 자동화 (postinstall, version
bump trigger 등) 는 별 ticket.

### 4.4 Accessibility

- Trigger `<button>` 은 native — `tabindex` 자동, Enter/Space 동작 OS-level.
- `aria-expanded={openSkillId === skill.id}`.
- `aria-label={t('workspace.team.skillMatrix.viewDescription')}` (신규 key).
- Popover 본문에 `role="tooltip"` 또는 `role="dialog"` — popover 는 `tooltip`
  으로 충분 (modal 동작 아님).
- Focus return — popover close 시 trigger 버튼으로 자동 복귀 (native button
  blur 이후 그대로).

## §5 §D Open Questions — user 결정 필요

본 plan 은 (ii) + (a) + (a.2) 를 추천하지만 user 명시 결정 후 dev dispatch.

(1) **UX trigger 최종** — (i) tooltip on hover / **(ii) popover on click** /
   (iii) inline accordion. Designer 추천 = (ii). 그러나 user 가 hover 의
   가벼움을 우선시하면 (i) + focus trigger 보완으로 변경 가능.

(2) **i18n strategy 최종** — **(a) static dictionary** / (b) lazy + cache /
   (c) en-only. Designer 추천 = (a).

(3) **번역 방식 (a 선택 시)** — (a.1) 수동 / **(a.2) LLM batch 1회** /
   (a.3) 하이브리드 (1회 batch + 향후 자동화 별 ticket). Designer 추천 =
   (a.2).

(4) **UKS 신규 axis 후보** — `[i18n strategy · gap]` 가 본 ticket 에서
   처음 anchor 로 사용됨. user 가 i18n trade-off 를 학습하면 `inferred` line
   추가 (`comfortable` 또는 `concept-level fluent` 로 상향) — `po-loop.md`
   Step 3 #14c 트리거. PO 가 user 의 결정 톤 (직관적 / 망설임 / "왜?") 으로
   판단 후 append.

## §Out of scope

- mattpocock / phuryn / 기타 외부 repo 의 frontmatter `description:` 본문 수정
  (외부 repo touch 금지).
- Skill description 의 markdown rendering (현재 plain text — 변경 없음).
- 자동 번역 빌드 자동화 (postinstall hook 등) — 별 ticket.
- SkillMatrixTab 의 row 정렬 / 그루핑 / pagination — 본 ticket scope 외.

## §QA scope

| Field | Value |
|:--|:--|
| **QA invoke** | `manual smoke only` |
| **test target** | SkillMatrixTab.tsx popover trigger + i18n key resolution |
| **사용자 dogfood** | (1) UI lang ko 일 때 ko description 노출, en 일 때 en. (2) hover (or click 결정 시 click) 으로만 description 보임 — 기본 상태 hide. (3) tab focus → Enter/Space 토글 동작. (4) Esc + outside-click → close. |
| **regression check** | i18n missing-key fallback (`defaultValue: skill.description`) — 새 skill 설치 후 ko 누락 시 영문 표시. SkillMatrixTab 외 다른 i18n key 영향 없음. |
