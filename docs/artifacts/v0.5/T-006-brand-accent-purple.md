---
doc: migration-spec
ticket: T-006
version: v0.5
phase: 2
owner: pdt-designer
date: 2026-06-01
scope: design-only (NO GUI code edits — code token migration = P3 build)
supersedes_note: replaces v0.4 brand accent `#FF6B2B` (orange) with CLI-aligned purple
---

# T-006 — Brand accent migration: orange `#FF6B2B` → CLI purple

> **Design-only.** This spec defines the new hexes + full change surface. GUI code
> migration (CSS variables, components) is a separate P3 build ticket.
> **Gate:** PO must surface the chosen purple swatch to the user for confirm BEFORE
> this ripples into the A9 / A2 / A7 mockups.

---

## 1. Chosen brand purple

### `--accent` / `--persona-po` / brand = **`#8B5CF6`** (Violet 500)

**Rationale.**

- **CLI-grounded.** The productune CLI declares the PO/brand color as `purple`
  (`packages/core/agents/pdt-po.md` → `color: purple`). `#8B5CF6` is the canonical
  Claude-Code / Tailwind **Violet 500** — the "purple" a user sees in the terminal —
  so the GUI brand now matches the CLI persona color it is supposed to represent.
- **Distinct from designer `#A78BFA`.** Designer is **Violet 400** (a light lavender);
  brand/PO is **Violet 500** — one step deeper and more saturated on the same hue
  family. The brand reads as a *stronger, weightier* purple; designer reads as a
  *soft lavender*. They are differentiated by **lightness + saturation**, not hue.
- **Passes AA on dark.** `#8B5CF6` clears WCAG AA (4.5:1) for text on both
  `--surface-body` and `--surface-base` (see §5), and far exceeds the 3:1 non-text
  threshold used for CTA fills, focus rings, dots, and borders (its dominant use).
- **Why not deeper (e.g. `#7C3AED` Violet 600).** A deeper violet separates better
  from designer but drops text contrast to **3.36:1** on `#0F0F0F` — fails AA for body
  text, only AA-large. Since `--accent` is also used as button *text-on-dark* in some
  recipes and as the in-progress status text, AA matters. `#8B5CF6` is the deepest
  step that still clears AA.

### How PO vs designer stay distinguishable after the change

| axis | PO / brand `#8B5CF6` | designer `#A78BFA` | separation |
|---|---|---|---|
| Tailwind step | Violet **500** | Violet **400** | 1 step deeper |
| character | saturated, weighty purple | soft lavender | lightness + sat |
| body contrast | 4.53:1 (AA) | 7.04:1 (AAA) | PO darker on screen |

> **Honest caveat (PO must surface).** `#8B5CF6` and `#A78BFA` are *adjacent violet
> steps* — swatch-to-swatch luminance separation is ~1.6:1. They are reliably
> distinguishable side-by-side and by saturation, but a fast-glance or low-vision
> user could confuse PO vs designer when the two dots are NOT adjacent. If the user
> wants **maximum** separation, **Option B** below moves designer off violet entirely.
> This is a persona-system decision the user did not explicitly request, so it is
> raised as a choice, not applied unilaterally.

### Decision raised to user (via PO) — designer collision handling

- **Option A — Brand-only migration (RECOMMENDED, in scope).**
  PO/brand → `#8B5CF6`. Designer + stage-prd **stay** `#A78BFA`.
  - **Pros:** honors the literal directive (brand → CLI purple); smallest ripple;
    no persona-identity churn; designer/stage-prd untouched so prior mockups holding.
  - **Cons:** PO and designer are both violet (adjacent steps) — distinguishable but
    not maximally; mild ambiguity for low-vision / fast-glance.
- **Option B — Also recolor designer off violet (larger ripple).**
  PO/brand → `#8B5CF6`; designer + stage-prd → a non-violet hue.
  - **Pros:** PO owns violet exclusively; maximal persona separation.
  - **Cons:** out of the stated directive scope; recolors a stable persona identity;
    every safe non-violet candidate collides elsewhere — Amber `#FBBF24` == `--health-warn`;
    Fuchsia `#E879F9` sits 1.08:1 from stage-design pink `#F472B6`; forces a second
    token to also move. Net: more surface, more risk.

> **pdt-designer recommendation: Option A** [persona-collision · low-vision-edge].
> Rationale anchored: the user's directive was scoped to the *brand accent*, not the
> designer persona; Option A fully satisfies "주황 말고 보라" while leaving the
> designer identity and existing PRD-stage color stable. The remaining adjacency is
> an accepted, documented edge — promotable to Option B later if dogfood shows
> real confusion. **This spec is authored for Option A.** If the user picks Option B,
> a follow-up designer turn picks the designer hex.

---

## 2. Collision resolution (final token assignment — Option A)

| concern | before | after | note |
|---|---|---|---|
| PO / brand | `#FF6B2B` orange | **`#8B5CF6`** Violet 500 | now == CLI purple |
| designer | `#A78BFA` Violet 400 | `#A78BFA` (unchanged) | one step lighter than PO |
| stage-prd | `#A78BFA` (= designer) | `#A78BFA` (unchanged) | still mirrors designer (PRD = designer-owned) |

No designer/stage-prd hex change under Option A. The orange→purple move is confined
to the accent/brand/PO/in-progress cluster.

---

## 3. Before / after swatch table (every accent-derived token)

| token | before | after | level note |
|---|---|---|---|
| `--brand-orange` → **rename** `--brand-purple` | `#FF6B2B` | `#8B5CF6` | token RENAMED (see ripple §4.1) |
| `--accent` | `#FF6B2B` | `#8B5CF6` | = `--brand-purple` = `--persona-po` |
| `--persona-po` | `#FF6B2B` | `#8B5CF6` | PresenceBar dot, msg border, CTA |
| `--status-in-progress` | `#FF6B2B` | `#8B5CF6` | = accent (attention) — see §4.3 risk |
| focus ring (Button focus-visible `2px solid --accent`) | `#FF6B2B` | `#8B5CF6` | derives from `--accent`, no own token |

Unchanged (listed to confirm NOT touched): all `--surface-*`, `--border-*`,
`--text-*`, `--persona-designer/dev/qa`, all `--stage-*`, `--status-todo/review/done/blocked/abandoned`,
all `--health-*`.

---

## 4. Full ripple list (change surface for the P3 build ticket)

### 4.1 DS token-definition changes (this spec applies to `design-system.md`)

1. **§2.4 Accent/Brand** — `--brand-orange` `#FF6B2B` → **rename** `--brand-purple`
   `#8B5CF6`; `--accent` `#FF6B2B` → `#8B5CF6`; alias note "오렌지" → "퍼플 / CLI purple".
2. **§2.5 Persona** — `--persona-po` `#FF6B2B` → `#8B5CF6`; row note unchanged.
3. **§2.6 Stage** — no change (stage-prd stays `#A78BFA`). *(Confirm-only.)*
4. **§2.7 Status** — `--status-in-progress` `#FF6B2B` → `#8B5CF6`; note "(= accent)"
   stays valid.
5. **§2.9 Contrast table** — replace the `--accent #FF6B2B` 5.4:1 row with
   `--accent #8B5CF6` 4.53:1 AA.

### 4.2 Token RENAME ripple — `--brand-orange` → `--brand-purple`

The token *name* carries the color, which is now wrong. Rename is required so the name
doesn't lie. Every reference to `--brand-orange` must point at `--brand-purple`:
- `design-system.md` §2.4 row + the alias prose ("= `--brand-orange`" in §2.4 note).
- Any P3 GUI code / CSS variable named `--brand-orange` (NOT in this design-only ticket —
  flagged for the P3 build ticket to grep `brand-orange` / `FF6B2B` repo-wide).

### 4.3 Recipes / components that reference the accent (P3 build surface)

Every named recipe/component below resolves the accent indirectly and re-skins for free
once the token hex changes — listed so the P3 build ticket has the complete surface and
the QA visual-regression pass knows where to look:

| # | recipe / component | how it uses accent | post-change |
|---|---|---|---|
| 1 | §8.1 Button `primary` | `bg: --accent`, text `#0F0F0F` | purple fill (was orange) |
| 2 | §8.1 Button `focus-visible` | `outline 2px solid --accent` | purple focus ring |
| 3 | §8.3 Tab active | bottom `2px --accent` underline | purple underline |
| 4 | §8.2 Pill `persona` variant (PO) | `--persona-po` @12% bg + text | purple PO pill |
| 5 | §8.6 PersonaPresenceBar PO dot | `--persona-po` 8px dot (+ `persona-blink`) | purple PO dot |
| 6 | ChatPanel PO message border | `--persona-po` left/edge border | purple PO msg border |
| 7 | §2.7 / TicketDashboardView in-progress column | `--status-in-progress` dot/header/pill | purple in-progress |
| 8 | §8.2 Pill `status` (in-progress) | `--status-in-progress` @12% bg + text | purple in-progress pill |
| 9 | any link/CTA styled on `--accent` (if present in GUI) | text/border = `--accent` | purple link (P3 grep) |
| 10 | logo / brand lockup | `--brand-purple` (was `--brand-orange`) | purple logo |

> **§4.3 #7 in-progress note (mockup-relevant).** After this change, `--status-in-progress`
> == `--persona-po` == `#8B5CF6`. That alias already existed (orange == in-progress ==
> PO). It is preserved, not newly created — but the A9/A2/A7 mockups must be aware that a
> PO dot and an in-progress pill now share the purple. The DS already separates them by
> *shape + context* (round persona dot vs uppercase status pill), so no new ambiguity is
> introduced; flagged for mockup self-check, not blocking.

### 4.4 Out of scope (explicitly NOT in this ticket)

- Editing `src/`, `packages/*/src` (GUI code) — P3 build.
- `--stage-qa/deploy/operate` TBD hexes (OQ-1) — untouched.
- Light-theme PO/brand split (OQ-3) — untouched.
- Net-new components.

---

## 5. WCAG re-check — `#8B5CF6` on dark surfaces

WCAG 2.2 contrast. Brand purple is used primarily as **non-text** (fills, dots,
borders, focus rings → 1.4.11 threshold 3:1) and occasionally as **text** (status
label, link → 1.4.3 threshold 4.5:1 normal / 3:1 large).

| background | ratio | text verdict (1.4.3) | non-text verdict (1.4.11) |
|---|---|---|---|
| `--surface-body` `#0F0F0F` | **4.53:1** | **AA** (pass ≥4.5) — not AAA | **pass** (≥3) |
| `--surface-base` `#0A0A0A` | **4.68:1** | **AA** (pass) | **pass** |

- **Non-text uses** (button fill, PO dot, focus ring, tab underline, msg border,
  in-progress dot): comfortably pass — these are the dominant uses.
- **Text uses** (in-progress status *label* text, any accent-colored link text):
  pass AA at normal size on both surfaces; recommend ≥14px for comfort. Does NOT reach
  AAA (7:1) — same posture as the old orange (`#FF6B2B` was 5.4:1, AA, also not AAA),
  so this is **no regression** in the text-use tier.
- **On button primary** the accent is the *background* with `#0F0F0F` text on top —
  that pairing's ratio is the same 4.53:1, AA — unchanged posture vs the orange button.

**Verdict:** `#8B5CF6` is AA-clean for text and pass for non-text on both dark
surfaces. No accessibility regression vs the outgoing orange.

---

## (KR) 한국어 블록

### 확정 브랜드 퍼플 = `#8B5CF6` (Violet 500)

- **CLI 정합.** productune CLI 의 PO/brand 색은 `purple`
  (`packages/core/agents/pdt-po.md` → `color: purple`). `#8B5CF6` 은 Claude-Code /
  Tailwind **Violet 500** — 터미널에서 보이는 그 "보라". GUI 브랜드색이 이제 CLI
  페르소나 색과 일치한다.
- **designer `#A78BFA` 와 구별.** designer = Violet **400** (연한 라벤더), brand/PO =
  Violet **500** (한 단 더 깊고 채도 높음). 같은 hue 계열이지만 **명도+채도**로 구별 —
  브랜드는 묵직한 보라, designer 는 부드러운 라벤더.
- **어두운 배경 AA 통과.** `#8B5CF6` 는 `--surface-body`/`--surface-base` 양쪽에서
  텍스트 AA(4.5:1) 통과, 주 용도인 non-text(채움/dot/border/focus ring)는 3:1 여유.
- **더 깊은 `#7C3AED`(Violet 600) 안 쓴 이유.** designer 와 분리는 더 잘 되지만
  `#0F0F0F` 위 텍스트 대비가 3.36:1 로 AA(본문) 탈락. `#8B5CF6` 이 AA 유지하는 가장
  깊은 단계.

### PO vs designer 구별 (변경 후)

- PO/brand `#8B5CF6` (Violet 500, 진하고 채도 높음) vs designer `#A78BFA` (Violet 400,
  연한 라벤더). 옆에 두면 명확히 구별, 채도로 식별 가능.
- **솔직한 한계 (PO 가 사용자에게 고지).** 둘은 *인접한 violet 단계* (swatch 간 명도차
  ~1.6:1). 나란히 있으면 구별되지만, dot 이 떨어져 있고 빠르게 훑거나 저시력 사용자는
  PO/designer 를 혼동할 여지. **최대 분리**를 원하면 아래 **Option B** 로 designer 를
  violet 밖으로 이동. 단 이는 사용자가 명시하지 않은 페르소나-시스템 변경이라 임의 적용
  대신 선택지로 제시.

### designer 충돌 처리 — 사용자 결정 (PO 경유)

- **Option A — 브랜드만 이관 (권장, 범위 내).**
  PO/brand → `#8B5CF6`. designer + stage-prd 는 `#A78BFA` 유지.
  - 장점: 지시("주황 말고 보라") 그대로 충족, 리플 최소, 페르소나 정체성 변동 없음,
    기존 목업 안정.
  - 단점: PO·designer 둘 다 보라(인접 단계) — 구별되나 최대치 아님, 저시력/순간 혼동 여지.
- **Option B — designer 도 violet 밖으로 (리플 큼).**
  - 장점: PO 가 violet 독점, 페르소나 분리 최대.
  - 단점: 지시 범위 밖, 안정된 페르소나색 변경, 안전한 비-violet 후보가 다 충돌
    (Amber `#FBBF24` == `--health-warn`; Fuchsia `#E879F9` 는 stage-design 핑크
    `#F472B6` 와 1.08:1). 토큰 추가 이동 강제 → 표면·리스크 증가.

> **pdt-designer 권장 = Option A** [persona-collision · low-vision-edge]. 사용자 지시는
> *브랜드 강조색* 범위였고 designer 페르소나가 아니다. Option A 가 "주황 말고 보라"를
> 완전히 충족하면서 designer 정체성과 기존 PRD-stage 색을 안정 유지. 남는 인접성은
> 문서화된 허용 edge — 추후 dogfood 에서 실제 혼동 시 Option B 로 승격 가능. **본 spec 은
> Option A 기준 작성.** 사용자가 Option B 선택 시 designer hex 는 후속 turn 에서 확정.

### 변경 전/후 swatch (accent 파생 토큰)

| token | 변경 전 | 변경 후 |
|---|---|---|
| `--brand-orange` → **rename** `--brand-purple` | `#FF6B2B` | `#8B5CF6` |
| `--accent` | `#FF6B2B` | `#8B5CF6` |
| `--persona-po` | `#FF6B2B` | `#8B5CF6` |
| `--status-in-progress` | `#FF6B2B` | `#8B5CF6` |
| focus ring (= `--accent`) | `#FF6B2B` | `#8B5CF6` |

### 리플 요약

DS 정의: §2.4(accent/brand + 토큰 rename) / §2.5(persona-po) / §2.7(status-in-progress)
/ §2.9(contrast 행). 레시피·컴포넌트: Button primary 채움+focus ring, Tab active
underline, PO persona pill·dot, ChatPanel PO 메시지 border, in-progress column·pill,
accent 기반 링크, 로고 — 모두 토큰 hex 교체로 자동 재스킨 (코드 교체는 P3). `--brand-orange`
명칭은 색과 불일치하므로 `--brand-purple` 로 rename (P3 에서 repo-wide `brand-orange`/`FF6B2B`
grep).

### WCAG 재확인

`#8B5CF6` on `#0F0F0F` = 4.53:1 (텍스트 AA, AAA 아님 / non-text 통과), on `#0A0A0A` =
4.68:1 (텍스트 AA / non-text 통과). 기존 오렌지(`#FF6B2B` 5.4:1, AA)와 동일 tier —
접근성 회귀 없음.

---

## Option B — FINAL (user-chosen, 2026-06-01)

> The user picked **Option B**. Brand/PO migration to `#8B5CF6` stays exactly as
> authored above. This section records the *additional* move: the designer persona
> leaves violet so PO owns violet exclusively. OQ-3 is hereby **RESOLVED**.

### Chosen `--persona-designer` = **`#FB923C`** (Orange 400)

**Rationale.**

- **Distinct by HUE, not luminance.** The Option-A residual ambiguity was that PO
  `#8B5CF6` and designer `#A78BFA` shared the *same violet hue* (≈262°), separated only
  by ~1.6:1 luminance — the weakest separation axis, and the one that collapses for
  low-vision / fast-glance users. Orange (≈27°) sits in a wholly different hue family,
  so PO vs designer are now separated on the strongest axis. Same fix logic applies vs
  every other persona/stage color.
- **Orange is free.** Brand vacated orange when it moved to violet (`#FF6B2B` retired).
  Reusing that freed hue introduces **no net-new hue** into the system — the palette
  stays at four persona hues, just reshuffled (violet / orange / sky / emerald).
- **Clear of every constraint hue.** Orange ≈27° is far from PO violet ≈262°, dev sky
  `#38BDF8` ≈199°, qa emerald `#34D399` ≈160°, and stage-design pink `#F472B6` ≈330°
  (pink is magenta-leaning; orange is red-yellow — no confusion).
- **Orange-not-amber (avoids `--health-warn`).** `#FB923C` (Orange 400) is deliberately
  the *redder, more saturated* orange, not the yellow-amber `--health-warn` `#FBBF24`
  (≈43°). They differ in hue and never co-locate (persona dot vs health-banner left bar
  + icon), so no collision. A yellow-amber for designer was rejected for this reason.
- **Why Orange 400 over Orange 500 `#F97316`.** 400 lands 8.47:1 (AAA) on `#0F0F0F`;
  500 is 6.84:1 (still AA, short of AAA). 400 also reads as a brighter, friendlier
  identity dot on the near-black surfaces and tracks the "400" lightness tier already
  used by dev (`#38BDF8`) and qa (`#34D399`), keeping persona dots at a consistent
  perceptual weight.

### `--stage-prd` moves with designer → **`#FB923C`** (NOT decoupled)

`--stage-prd` mirrors the designer persona color because PRD is designer-owned. That
mirroring is preserved: stage-prd moves `#A78BFA` → `#FB923C` in lockstep. No decouple.

### Full updated persona + stage palette (post-Option-B)

| token | hex (FINAL) | hue family | note |
|---|---|---|---|
| `--persona-po` | `#8B5CF6` | Violet 500 | PO owns violet exclusively |
| `--persona-designer` | **`#FB923C`** | **Orange 400** | moved off violet (was `#A78BFA`) |
| `--persona-dev` | `#38BDF8` | Sky 400 | unchanged |
| `--persona-qa` | `#34D399` | Emerald 400 | unchanged |
| `--stage-prd` | **`#FB923C`** | **Orange 400** | mirrors designer (was `#A78BFA`) |
| `--stage-design` | `#F472B6` | Pink 400 | unchanged |
| `--stage-build` | `#38BDF8` | Sky 400 | = dev, unchanged |
| `--stage-qa` / `--stage-deploy` / `--stage-operate` | TBD | — | OQ-1, untouched |

> All four personas are now hue-separated: **violet / orange / sky / emerald.** No two
> personas share a hue, so identity is robust under low-vision and fast-glance.

### WCAG re-check — `#FB923C` on dark surfaces

WCAG 2.2. Persona color is used predominantly as **non-text** (dot, pill bg/text,
message border, stage bar → 1.4.11 threshold 3:1) and as **text** (persona name label,
stage label → 1.4.3 threshold 4.5:1 normal).

| background | ratio | text verdict (1.4.3) | non-text verdict (1.4.11) |
|---|---|---|---|
| `--surface-body` `#0F0F0F` | **8.47:1** | **AAA** (≥7) | **pass** (≥3) |
| `--surface-base` `#0A0A0A` | **8.75:1** | **AAA** | **pass** |

**Verdict:** `#FB923C` is AAA-clean for text and pass for non-text on both dark
surfaces — a contrast *improvement* over the outgoing `#A78BFA` (7.6:1, AAA). No
accessibility regression.

### Ripple delta vs Option A (extra surface for the P3 build ticket)

Beyond the brand/PO ripple in §3–§4 above, Option B adds these token moves:

| token | Option-A value | Option-B FINAL | components re-skinned |
|---|---|---|---|
| `--persona-designer` | `#A78BFA` | `#FB923C` | PresenceBar designer dot, designer persona pill (§8.2), ChatPanel designer message border |
| `--stage-prd` | `#A78BFA` | `#FB923C` | StageStrip PRD bar (§8.7), PhaseTransitionGate PRD from/to (§8.8), `rp-ctx` PRD chip (ChatPanel), TicketDashboard PRD-stage tint |

> **P3 grep targets (in addition to `brand-orange`/`FF6B2B`):** repo-wide `A78BFA`
> (case-insensitive) — every hit is either `--persona-designer` or `--stage-prd` and
> must become `#FB923C`. No other token used `#A78BFA`, so the grep is exhaustive.
> **A9/A2/A7 mockups:** the designer dot + PRD-stage bar/chip now render orange, not
> lavender — flag for mockup re-skin (designer dot orange, PO dot violet are now
> unambiguous side by side).

---

## (KR) Option B — FINAL (사용자 선택, 2026-06-01)

> 사용자가 **Option B** 선택. 위쪽 brand/PO → `#8B5CF6` 이관은 그대로 유지. 본 절은
> *추가* 변경 — designer 페르소나를 violet 밖으로 이동해 PO 가 violet 단독 소유.
> OQ-3 **RESOLVED**.

### 확정 `--persona-designer` = `#FB923C` (Orange 400)

- **명도 아닌 HUE 로 분리.** Option A 잔여 모호함은 PO `#8B5CF6` 와 designer `#A78BFA`
  가 *같은 violet hue* (≈262°) 를 공유하고 명도차 ~1.6:1 로만 갈렸던 것 — 가장 약한
  분리축이고 저시력/순간 식별에서 무너진다. orange (≈27°) 는 완전히 다른 hue 계열이라
  PO vs designer 가 가장 강한 축으로 분리. 다른 모든 페르소나/stage 색과도 동일 논리.
- **orange 는 free.** brand 가 violet 으로 가며 비운 자리 (`#FF6B2B` 폐기). 그 hue 를
  재사용하므로 **신규 hue 도입 0** — 페르소나 hue 는 여전히 4 종 (violet/orange/sky/
  emerald), 배치만 재편.
- **모든 제약 hue 와 분리.** orange ≈27° 는 PO violet ≈262°, dev sky ≈199°, qa emerald
  ≈160°, stage-design pink `#F472B6` ≈330° 와 모두 멀다 (pink 은 마젠타 계열, orange 는
  적황 계열 — 혼동 없음).
- **amber 아닌 orange (`--health-warn` 회피).** `#FB923C` 는 의도적으로 *더 붉고 채도
  높은* orange — 노란 amber `--health-warn` `#FBBF24` (≈43°) 가 아니다. hue 가 다르고
  co-locate 하지 않는다 (persona dot vs health banner bar/icon). 노란 amber 후보는 이
  이유로 기각.
- **Orange 500 `#F97316` 대신 400.** 400 = `#0F0F0F` 위 8.47:1 (AAA); 500 = 6.84:1
  (AA, AAA 미달). 400 이 near-black 위에서 더 밝고 친근한 dot, dev/qa 의 "400" 명도
  tier 와 일관된 perceptual weight 유지.

### `--stage-prd` 도 designer 와 함께 이동 → `#FB923C` (분리 안 함)

`--stage-prd` 는 PRD = designer 책임이라 designer 색을 미러. 미러 유지 — stage-prd 도
`#A78BFA` → `#FB923C` 동시 이동, decouple 없음.

### 변경 후 persona + stage 팔레트 — 위 표 동일.

### WCAG 재확인

`#FB923C` on `#0F0F0F` = 8.47:1 (텍스트 AAA / non-text 통과), on `#0A0A0A` = 8.75:1
(텍스트 AAA / non-text 통과). 기존 `#A78BFA` (7.6:1) 대비 오히려 **개선**, 회귀 없음.

### 리플 델타 (Option A 대비 추가 — P3 build 표면)

`--persona-designer` + `--stage-prd` `#A78BFA` → `#FB923C`. 재스킨: PresenceBar
designer dot, designer persona pill, ChatPanel designer 메시지 border, StageStrip PRD
bar, PhaseTransitionGate PRD from/to, `rp-ctx` PRD chip, TicketDashboard PRD-stage tint.
P3 grep 추가 대상 — repo-wide `A78BFA` (모든 hit = designer 또는 stage-prd, 빠짐없음).
A9/A2/A7 목업 — designer dot + PRD-stage 가 lavender→orange 로 재스킨 (designer orange
vs PO violet 이 나란히 있어도 명확).

---

## Decision-log candidate (emit-only — PO writes on approval)

`(2026-06-01) T-006 — GUI 브랜드 강조색 orange #FF6B2B → CLI purple #8B5CF6 (Violet 500)
이관. --accent/--persona-po/--status-in-progress 동시 이동, --brand-orange→--brand-purple
rename. **사용자가 Option B 선택**: designer 페르소나를 violet 밖으로 이동 —
--persona-designer + --stage-prd #A78BFA(Violet 400) → #FB923C(Orange 400). PO 가 violet
단독 소유, 4 페르소나 hue 분리 (violet/orange/sky/emerald). orange 는 brand 이탈로
비워진 자리 재사용 (신규 hue 0). amber #FBBF24(health-warn) 와는 hue+맥락 분리.
WCAG: 브랜드 #8B5CF6 4.53:1 AA, designer #FB923C 8.47:1 AAA — 둘 다 회귀 없음. OQ-3
RESOLVED.`
