---
version: v0.1
name: Daum-Anchor-Design-System
anchor-type: production-fidelity-source   # NOT a mood/adapt anchor — see "Anchor Type" section below
description: >-
  Anchor is axz's live, in-production design system for the Daum content / search / news /
  community platform — distilled from the real Figma-sourced spec (DESIGN.md v0.1 Foundation
  guide + Button.md v0.1.1 representative component + tokens.json v0.5.1 build snapshot), not
  reverse-engineered from a public marketing page like the other entries in this library. The
  system voice is a neutral Gray/Black/White canvas with exactly two universal accents — Blue
  reserved for user-action Primary, Red reserved for breaking/live Accent emphasis — plus five
  domain-identity colors (Indigo/Sports, Violet/Entertainment, Coral/Cafe Story, Orange/Interests,
  Lavender/Community) that let one shared shell host many editorial domains without a single
  brand color flattening them. Pretendard is the one typeface. Light and Dark are both
  first-class and required — every semantic token swaps by mode under one role name, never
  by branching code. v0.1 is Foundation + Token Guide + one fully specified component (Button);
  everything else (Layout, Grid, Breakpoints, most component token bindings, semantic
  spacing/radius) is an open Known Gap, not an inferable pattern.

colors:
  # Universal accents (identical hex in Light and Dark)
  interaction-primary: "#1e84ff"        # Blue.500 — the one primary-action accent
  interaction-danger: "#ff4e33"          # Red.500 — the one accent/danger/breaking-live color
  text-state-info: "#1e84ff"
  text-state-accent: "#ff4e33"
  border-focus: "#1e84ff"

  # Domain / category identity (mode-invariant fill; text/icon variants shift slightly by mode)
  category-sports: "#5c77ff"             # Indigo.500
  category-entertainment: "#a05cff"      # Violet.500
  category-cafe: "#ff5c66"               # Coral.500
  category-interests: "#ff9429"          # Orange.500
  category-community: "#5e47eb"          # Lavender.500

  # Neutral base — Light
  canvas: "#ffffff"                      # semantic.light.Background.Surface.Base — White.1000
  background-base: "#f4f5f7"             # semantic.light.Background.Base — Gray.50
  surface-on: "#f4f5f7"                  # Surface.On — Gray.50
  surface-onlayer: "#ffffff"             # Surface.Onlayer — White.1000
  surface-placeholder: "rgba(0,0,0,.08)" # Surface.Placeholder — Black.100
  ink: "#000000"                          # Text.Primary — Black.1000
  text-secondary: "rgba(0,0,0,.88)"      # Black.900
  text-tertiary: "rgba(0,0,0,.72)"       # Black.800
  text-quaternary: "rgba(0,0,0,.64)"     # Black.700
  text-subtle: "rgba(0,0,0,.48)"         # Black.600
  text-disabled: "rgba(0,0,0,.32)"       # Black.500
  text-inverse: "#ffffff"                 # White.1000
  link: "#004bcc"                          # Blue.Link.700
  border-card: "rgba(0,0,0,.08)"          # Black.100
  border-button-outline: "rgba(0,0,0,.1)" # Black.200
  divider-item: "rgba(0,0,0,.04)"         # Black.50
  divider-section: "rgba(0,0,0,.08)"      # Black.100
  icon-secondary: "rgba(0,0,0,.88)"
  icon-subtlest: "rgba(0,0,0,.16)"        # Black.300
  state-hover: "rgba(0,0,0,.04)"          # Black.50

  # Neutral base — Dark (same role, swapped value — never branch on mode in code)
  canvas-dark: "#202122"                 # Surface.Base — Gray.900
  background-base-dark: "#161718"        # Background.Base — Gray.1000
  surface-on-dark: "#303233"              # Surface.On — Gray.800
  surface-onlayer-dark: "#44474b"         # Surface.Onlayer — Gray.700
  surface-placeholder-dark: "rgba(255,255,255,.08)" # White.100
  ink-dark: "#ffffff"                     # Text.Primary — White.1000
  text-secondary-dark: "rgba(255,255,255,.88)"
  text-tertiary-dark: "rgba(255,255,255,.72)"
  text-quaternary-dark: "rgba(255,255,255,.64)"
  text-subtle-dark: "rgba(255,255,255,.48)"
  text-disabled-dark: "rgba(255,255,255,.32)"
  text-inverse-dark: "#000000"            # Black.1000
  link-dark: "#5796e1"                    # Blue.Link.300
  border-card-dark: "rgba(255,255,255,.08)"
  border-button-outline-dark: "rgba(255,255,255,.16)" # White.300
  divider-item-dark: "rgba(255,255,255,.04)"
  divider-section-dark: "rgba(255,255,255,.08)"
  icon-secondary-dark: "rgba(255,255,255,.88)"
  icon-subtlest-dark: "rgba(255,255,255,.16)"
  state-hover-dark: "rgba(255,255,255,.04)"

  # Button-specific interaction fills (Solid variant backgrounds)
  interaction-secondary: "#303233"        # light: Gray.800
  interaction-secondary-dark: "#f4f5f7"   # dark: Gray.50 (secondary flips light/dark, not just tint)
  interaction-neutral: "#e4e6e8"          # light: Gray.100
  interaction-neutral-dark: "#74797f"     # dark: Gray.500
  interaction-inverse: "#ffffff"          # light: White.1000
  interaction-inverse-dark: "#74797f"     # dark: Gray.500
  interaction-subtlest: "rgba(0,0,0,.02)" # light: Black.20
  interaction-subtlest-dark: "rgba(255,255,255,.02)" # dark: White.20
  interaction-disabled: "#c7cbcf"          # light: Gray.200
  interaction-disabled-dark: "#5b5f65"    # dark: Gray.600

typography:
  # fontFamily fallback chain is an implementer convention — Anchor itself specifies only
  # "Pretendard" (DESIGN.md §3). No letter-spacing values are specified anywhere in the source;
  # do not invent tracking numbers for this system.
  display-large:
    fontFamily: Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif
    fontSize: 40px
    fontWeight: 700
    lineHeight: 1.2
  display-medium:
    fontFamily: Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif
    fontSize: 26px
    fontWeight: 700
    lineHeight: 1.2
  header:
    fontFamily: Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.2
  title-large:
    fontFamily: Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif
    fontSize: 22px
    fontWeight: 700
    lineHeight: 1.2
  title-medium:
    fontFamily: Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif
    fontSize: 20px
    fontWeight: 700
    lineHeight: 1.2
  title-small:
    fontFamily: Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif
    fontSize: 18px
    fontWeight: 700
    lineHeight: 1.2
  body-large-normal:
    fontFamily: Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.4
  body-large-emphasis:
    fontFamily: Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif
    fontSize: 17px
    fontWeight: 600
    lineHeight: 1.4
  body-large-strong:
    fontFamily: Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif
    fontSize: 17px
    fontWeight: 700
    lineHeight: 1.4
  body-large-reading-normal:
    fontFamily: Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.52
  body-large-reading-strong:
    fontFamily: Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif
    fontSize: 17px
    fontWeight: 700
    lineHeight: 1.52
  body-medium-normal:
    fontFamily: Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.32
  body-medium-strong:
    fontFamily: Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif
    fontSize: 16px
    fontWeight: 700
    lineHeight: 1.32
  body-small-normal:
    fontFamily: Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.32
  body-small-emphasis:
    fontFamily: Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.32
  body-small-strong:
    fontFamily: Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif
    fontSize: 15px
    fontWeight: 700
    lineHeight: 1.32
  caption-normal:
    fontFamily: Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.32
  caption-strong:
    fontFamily: Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif
    fontSize: 14px
    fontWeight: 700
    lineHeight: 1.32
  label-normal:
    fontFamily: Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.2
  label-strong:
    fontFamily: Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif
    fontSize: 12px
    fontWeight: 700
    lineHeight: 1.2

rounded:
  # Primitive scale only — Anchor has NOT published a semantic radius mapping (Known Gap, §10).
  # "pill" here is the atomic.Radius.100 value used by Button's Rounded shape; do not treat it
  # as a semantic "always use for X" rule beyond what Button.md documents.
  4: 4px
  8: 8px
  12: 12px
  16: 16px
  24: 24px
  pill: 100px

spacing:
  # Primitive scale only — 12 steps. Semantic spacing tokens are deferred (Known Gap, §10).
  # Do not infer a 4px/8px base-unit rhythm; the raw step list is irregular (2,4,6,8,10,12,...).
  2: 2px
  4: 4px
  6: 6px
  8: 8px
  10: 10px
  12: 12px
  16: 16px
  18: 18px
  20: 20px
  24: 24px
  32: 32px
  40: 40px

components:
  # Button is the ONLY component with a published token matrix in v0.1. Entries below show the
  # Lg-size (default) row across the allowed Variant×Color×Shape combinations; the full 6-size
  # scale and the complete allowed-combination table are reproduced in the Components section
  # below (not flattened into YAML — the table shape carries meaning Button.md itself insists on).
  button-solid-primary:
    backgroundColor: "{colors.interaction-primary}"
    textColor: "{colors.text-inverse}"
    typography: "{typography.body-small-strong}"
    rounded: "{rounded.8}"
    padding: "{spacing.10} {spacing.16}"
    minHeight: 40px
  button-solid-secondary:
    backgroundColor: "{colors.interaction-secondary}"
    textColor: "{colors.text-inverse}"
    typography: "{typography.body-small-strong}"
    rounded: "{rounded.8}"
    padding: "{spacing.10} {spacing.16}"
    minHeight: 40px
  button-solid-neutral:
    backgroundColor: "{colors.interaction-neutral}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.body-small-strong}"
    rounded: "{rounded.8}"
    padding: "{spacing.10} {spacing.16}"
    minHeight: 40px
  button-solid-inverse:
    backgroundColor: "{colors.interaction-inverse}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.body-small-strong}"
    rounded: "{rounded.8}"
    padding: "{spacing.10} {spacing.16}"
    minHeight: 40px
  button-solid-ghost:
    backgroundColor: transparent
    textColor: "{colors.text-secondary}"
    typography: "{typography.body-small-strong}"
    rounded: "{rounded.8}"
    padding: "{spacing.10} {spacing.16}"
    minHeight: 40px
  button-solid-danger:
    backgroundColor: "{colors.interaction-danger}"
    textColor: "{colors.text-inverse}"
    typography: "{typography.body-small-strong}"
    rounded: "{rounded.8}"
    padding: "{spacing.10} {spacing.16}"
    minHeight: 40px
  button-solid-secondary-rounded:
    description: "Solid Rounded is allowed ONLY for Secondary or Inverse — not a general capsule button."
    backgroundColor: "{colors.interaction-secondary}"
    textColor: "{colors.text-inverse}"
    typography: "{typography.body-small-strong}"
    rounded: "{rounded.pill}"
    padding: "{spacing.10} {spacing.16}"
    minHeight: 40px
  button-outline-neutral:
    backgroundColor: "{colors.interaction-neutral}"
    textColor: "{colors.text-secondary}"
    borderColor: "{colors.border-button-outline}"
    typography: "{typography.body-small-strong}"
    rounded: "{rounded.8}"
    padding: "{spacing.10} {spacing.16}"
    minHeight: 40px
  button-outline-ghost:
    backgroundColor: transparent
    textColor: "{colors.text-secondary}"
    borderColor: "{colors.border-button-outline}"
    typography: "{typography.body-small-strong}"
    rounded: "{rounded.8}"
    padding: "{spacing.10} {spacing.16}"
    minHeight: 40px
  button-outline-subtlest:
    description: "Subtlest exists ONLY as Outline Square — never Solid."
    backgroundColor: "{colors.interaction-subtlest}"
    textColor: "{colors.text-secondary}"
    borderColor: "{colors.border-button-outline}"
    typography: "{typography.body-small-strong}"
    rounded: "{rounded.8}"
    padding: "{spacing.10} {spacing.16}"
    minHeight: 40px
  button-outline-ghost-rounded-xl:
    description: "The ONLY Rounded Outline allowed, and the only place size Xl is valid at all."
    backgroundColor: transparent
    textColor: "{colors.text-secondary}"
    borderColor: "{colors.border-button-outline}"
    typography: "{typography.body-small-strong}"
    rounded: "{rounded.pill}"
    padding: "{spacing.12} {spacing.16}"
    minHeight: 44px
---

## Anchor Type: Production Fidelity, Not Mood-Adapt

Every other entry in this library is a **mood/token starting point to ADAPT** — a shortlisted
brand's atmosphere gets reinterpreted for a different product. **Anchor is different.** It is
axz's actual, currently-shipping design system for the Daum platform, sourced from the team's own
Figma-generated spec, not distilled by an outside model reading a marketing page. When Anchor is
selected as a ds-3up Fit candidate for a **daum-family project**, treat it as a **fidelity target
to reproduce as-specified**, not raw material to remix. Concretely:

- Use token names and values exactly as documented below — do not invent a "Anchor-inspired"
  palette that drifts from the real semantic tokens.
- Where this document says a decision is a **Known Gap** (§ below — Layout/Grid, Breakpoints,
  semantic Spacing/Radius, most component token bindings beyond Button), that gap is
  **intentional and current**, not a hole this entry should paper over with an invented rule.
  Ask the user or point them at the Figma source; do not present an inferred rule as an Anchor
  fact.
- Project-level `design.md` adoption decisions (which of options A/B/C to run with for a
  specific daum-family project) are **out of scope for this entry** — that happens per-project,
  in that project's own next version. This entry only makes Anchor visible and citable as a
  candidate.

## Overview

Anchor is the design system for axz's Daum platform — a single shell hosting **News, Search,
Shopping, Sports, Entertainment, Cafe Story, Interests, and Community**, each with its own
editorial identity. Rather than one brand color washing over every domain (the pattern almost
every other anchor in this library follows), Anchor keeps the base **neutral** — a Gray/Black/White
scale on `{colors.canvas}` — and spends color with discipline: **Blue** (`{colors.interaction-primary}`
— #1e84ff) is reserved for user-action Primary (buttons, links, the one thing on screen you're
meant to *do*), and **Red** (`{colors.interaction-danger}` — #ff4e33) is reserved for
information-emphasis Accent (breaking news, live badges, real-time signals) — never both for the
same purpose. Everything domain-specific — Sports, Entertainment, Cafe Story, Interests,
Community — gets its own identity color (Indigo/Violet/Coral/Orange/Lavender) applied only inside
that domain's own surfaces, never bleeding into the shared chrome.

**Typography is a single family** — Pretendard, tuned for mixed Korean/Latin text — expressed
across 19-21 composed tokens (`display.*` down to `label.*`) rather than a display/body font
pairing. Weight is a strict three-value enum: 400 (normal), 600 (emphasis — app-only), 700
(strong) — there is no 500, no 300, no arbitrary weight choice.

**Light and Dark are both required, equally.** This is the system's defining engineering
discipline: every semantic token (`background.surface.base`, `text.primary`, `border.card`, …)
resolves to a different Primitive value per mode, but product code references **one
mode-agnostic role name** — never a Light/Dark branch. The five domain colors and the two
universal accents (Blue, Red) stay the *same hex* in both modes; the neutral scale (canvas,
surface, text, border, divider) is what flips.

**Key Characteristics:**
- Two universal accents only: Blue = Primary user-action, Red = Accent information-emphasis.
  Never repurpose one for the other's job.
- Five domain-identity colors (Indigo/Sports · Violet/Entertainment · Coral/Cafe Story ·
  Orange/Interests · Lavender/Community) — used inside their own domain surfaces only.
- Single typeface (Pretendard), weight enum 400/600/700, no display/body font split.
- Semantic-token-only discipline: Primitive tokens (`atomic.Blue.500`) must never appear directly
  in product code — only Semantic role names, which the build swaps per mode.
- Depth comes from **surface-layer contrast** (`surface.base` → `.on` → `.onlayer`), with a
  3-level shadow scale (`shadow.high/medium/low`) as a supporting cue, not the primary depth
  mechanism.
- **Button is the only fully specified component** in v0.1 — a strict Variant × Color × Size ×
  Shape × State matrix with an explicit allowed-combination table. Everything else (Card, Modal,
  Tab, Snackbar, Layout, Responsive) is either undefined or Figma-only with no token matrix here.
- This v0.1 document targets **new services and new projects first**; applying it to the
  existing Daum app requires design-team alignment (Adoption Guide, source DESIGN.md).

## Colors

### Brand & Accent (mode-invariant)
- **Primary / Blue** (`{colors.interaction-primary}` — `#1e84ff`, `atomic.Blue.500`): The single
  accent for user actions — Solid-Primary buttons, links (`{colors.link}`), focus rings
  (`{colors.border-focus}`), info state. Same hex in Light and Dark.
- **Accent / Red** (`{colors.interaction-danger}` — `#ff4e33`, `atomic.Red.500`): The single accent
  for information emphasis and destructive/danger button color. Same hex in Light and Dark. Do
  not use Red for anything Blue's job covers, or vice versa — the system's restraint depends on
  this being a strict two-color split.

### Domain / Category Identity (mode-invariant fill; text/icon shift slightly per mode)
- **Sports — Indigo** (`{colors.category-sports}` — `#5c77ff`)
- **Entertainment — Violet** (`{colors.category-entertainment}` — `#a05cff`)
- **Cafe Story — Coral** (`{colors.category-cafe}` — `#ff5c66`)
- **Interests — Orange** (`{colors.category-interests}` — `#ff9429`)
- **Community — Lavender** (`{colors.category-community}` — `#5e47eb`)

Each domain color has its own Subtle background variant (e.g. `background.category.sportsSubtle`)
for readability; do not pair a domain text color with its matching domain background in the same
area — use the Subtle background variant instead (Anchor's own Do/Don't rule, DESIGN.md §7).

### Semantic — Surface (Light → Dark)

| Role | Light | Dark | Use |
|---|---|---|---|
| `{colors.canvas}` (Surface.Base) | `#ffffff` (White.1000) | `{colors.canvas-dark}` `#202122` (Gray.900) | Default page/card surface |
| `{colors.background-base}` (Background.Base) | `#f4f5f7` (Gray.50) | `{colors.background-base-dark}` `#161718` (Gray.1000) | Page-level background floor |
| `{colors.surface-on}` (Surface.On) | `#f4f5f7` (Gray.50) | `{colors.surface-on-dark}` `#303233` (Gray.800) | First elevation step above base |
| `{colors.surface-onlayer}` (Surface.Onlayer) | `#ffffff` (White.1000) | `{colors.surface-onlayer-dark}` `#44474b` (Gray.700) | Floating layer surface (popup/sheet content) |
| `{colors.surface-placeholder}` (Surface.Placeholder) | `rgba(0,0,0,.08)` (Black.100) | `{colors.surface-placeholder-dark}` `rgba(255,255,255,.08)` (White.100) | Image/skeleton placeholder fill |

### Semantic — Text (Light → Dark)

| Role | Light | Dark | Use |
|---|---|---|---|
| `{colors.ink}` (Text.Primary) | `#000000` (Black.1000) | `{colors.ink-dark}` `#ffffff` (White.1000) | Headlines, primary text |
| `{colors.text-secondary}` (Text.Secondary) | `rgba(0,0,0,.88)` (Black.900) | `{colors.text-secondary-dark}` `rgba(255,255,255,.88)` (White.900) | Default body text, button labels |
| `{colors.text-tertiary}` (Text.Tertiary) | `rgba(0,0,0,.72)` (Black.800) | `{colors.text-tertiary-dark}` `rgba(255,255,255,.72)` (White.800) | Secondary/supporting copy |
| `{colors.text-quaternary}` (Text.Quaternary) | `rgba(0,0,0,.64)` (Black.700) | `{colors.text-quaternary-dark}` `rgba(255,255,255,.64)` (White.700) | Lowest-priority readable text |
| `{colors.text-subtle}` (Text.Subtle) | `rgba(0,0,0,.48)` (Black.600) | `{colors.text-subtle-dark}` `rgba(255,255,255,.48)` (White.600) | Captions, fine-print |
| `{colors.text-disabled}` (Text.Disabled) | `rgba(0,0,0,.32)` (Black.500) | `{colors.text-disabled-dark}` `rgba(255,255,255,.32)` (White.500) | Disabled-state text |
| `{colors.text-inverse}` (Text.Inverse) | `#ffffff` (White.1000) | `{colors.text-inverse-dark}` `#000000` (Black.1000) | Text on the opposite-polarity surface (e.g. Solid-Secondary button) |
| `{colors.link}` (Text.Link) | `#004bcc` (Blue.Link.700) | `{colors.link-dark}` `#5796e1` (Blue.Link.300) | Inline text links |

`text.static.*` variants (`Static.White.Primary` etc.) stay fixed across modes — use only when
color must ignore Light/Dark, e.g. white badge text over a permanently-dimmed overlay. Do not use
them for normal text; DESIGN.md explicitly warns `text.static.white.*` can disappear on white
cards in Dark mode.

### Semantic — Border & Divider (Light → Dark)

| Role | Light | Dark | Use |
|---|---|---|---|
| `{colors.border-card}` (Border.Card) | `rgba(0,0,0,.08)` (Black.100) | `{colors.border-card-dark}` `rgba(255,255,255,.08)` (White.100) | Card outline |
| `{colors.border-button-outline}` (Border.Button.Outline) | `rgba(0,0,0,.1)` (Black.200) | `{colors.border-button-outline-dark}` `rgba(255,255,255,.16)` (White.300) | Outline-variant button border |
| `{colors.border-focus}` (Border.Focus) | `#1e84ff` (Blue.500) | same | Focus ring — mode-invariant, matches Primary |
| `{colors.divider-item}` (Border.Divider.Item) | `rgba(0,0,0,.04)` (Black.50) | `{colors.divider-item-dark}` `rgba(255,255,255,.04)` (White.50) | Between-item hairline (list rows) |
| `{colors.divider-section}` (Border.Divider.Section) | `rgba(0,0,0,.08)` (Black.100) | `{colors.divider-section-dark}` `rgba(255,255,255,.08)` (White.100) | Between-section hairline |

### Primitive Groups (reference only — never use directly in product code)

14 Primitive groups back the Semantic layer: `Black`/`White` (12 alpha steps each, 20→1000),
`Gray` (11 solid steps, 50→1000), `Blue` (Primary family, 50→700 + `Link.300`/`Link.700`),
`Red` (Accent family), and the five domain families (`Indigo`, `Coral`, `Orange`, `Violet`,
`Lavender`, each 50→700). Two groups are intentionally incomplete: `Purple` has only steps `300`
and `700` (step expansion deferred), and `Green`/`Olive` are single-value tokens with no scale at
all (`Green` `#18ba45`, `Olive` `#2e2e1e`) — do not reference `atomic.Purple.500` or append a step
to Green/Olive; they don't exist.

## Typography

### Family
Single family: **Pretendard**, chosen for Korean/Latin mixed-script optimization. No secondary
display face and no monospace face are part of the Anchor v0.1 spec.

### Hierarchy

| Token | Size | Weight | Line Height | Use |
|---|---|---|---|---|
| `{typography.display-large}` | 40px | 700 | 1.2 | Large PC web title |
| `{typography.display-medium}` | 26px | 700 | 1.2 | Small PC web title |
| `{typography.header}` | 24px | 700 | 1.2 | Daum main header |
| `{typography.title-large}` | 22px | 700 | 1.2 | Search-answer titles, home-tab subscribed publishers, error screens |
| `{typography.title-medium}` | 20px | 700 | 1.2 | Content-menu title with back button |
| `{typography.title-small}` | 18px | 700 | 1.2 | Default / single-item collection titles |
| `{typography.body-large-normal}` | 17px | 400 | 1.4 | Default body text |
| `{typography.body-large-emphasis}` | 17px | 600 | 1.4 | Body emphasis — **app-only** |
| `{typography.body-large-strong}` | 17px | 700 | 1.4 | Partial body emphasis |
| `{typography.body-large-reading-normal}` | 17px | 400 | 1.52 | Long-form article/doc body |
| `{typography.body-large-reading-strong}` | 17px | 700 | 1.52 | Strong emphasis in long-form text |
| `{typography.body-medium-normal}` / `-strong` | 16px | 400 / 700 | 1.32 | Column-style secondary info |
| `{typography.body-small-normal}` / `-emphasis` / `-strong` | 15px | 400 / 600 / 700 | 1.32 | First-level tabs and buttons |
| `{typography.caption-normal}` / `-strong` | 14px | 400 / 700 | 1.32 | Supplementary info |
| `{typography.label-normal}` / `-strong` | 12px | 400 / 700 | 1.2 | Badges |

### Principles
- **Weight is a closed enum: 400 / 600 / 700.** There is no 300, 500, or 800 anywhere in the
  system. 600 ("emphasis") is explicitly **app-only** — do not use it on PC web surfaces.
- **Line-height is meaning-coded, not a free choice:** 1.2 for headings, 1.32 for default/column
  body, 1.4 for standard body, 1.52 reserved for long-form reading contexts (articles, docs).
- **Choose by hierarchical meaning, not size alone** (DESIGN.md §7 Do) — e.g. `title.small` (18px)
  and `body.large.*` (17px) sit one px apart; the choice is about role, not pixel-matching.
- **No letter-spacing values are specified anywhere in the source.** Do not invent tracking
  numbers for Anchor type — that would be presenting an inferred rule as an Anchor fact.
- **`display.large`/`display.medium` are PC-web-only** per DESIGN.md's own scope notes — treat as
  a partial fact, not license to assume the full responsive story (see Known Gaps).

### Note on Font Substitutes
Pretendard is open-source (SIL OFL) and freely embeddable — unlike most anchors in this library,
no substitute is needed. Use the real typeface directly.

## Layout

**Undefined in v0.1 — do not infer.** Anchor's own source is explicit: "AI tools must not infer
Grid, Breakpoints, or Container max-width. Ask the user when needed" (DESIGN.md §5). The only
partial facts currently published:

- **Spacing is Primitive-only:** 12 steps — `{spacing.2}` · `{spacing.4}` · `{spacing.6}` ·
  `{spacing.8}` · `{spacing.10}` · `{spacing.12}` · `{spacing.16}` · `{spacing.18}` · `{spacing.20}`
  · `{spacing.24}` · `{spacing.32}` · `{spacing.40}`. There is **no semantic spacing layer**
  (no `spacing.section`, no `spacing.card-padding` role token) — every consumer currently reaches
  for a raw Primitive step. Do not assume an implied base-unit rhythm (the steps are irregular:
  2/4/6/8/10/12, not a clean 4px or 8px multiple table).
- **Button width is hug-content** — determined by text length + Size-scale padding, never a fixed
  Layout-level width rule.
- No Grid/Container/Breakpoint values exist to cite. If a project needs them, that decision has to
  be made in Figma and published via `figma-publish`, or confirmed with the user — never guessed
  from this document.

## Elevation & Depth

### Principle
Anchor expresses depth primarily through **surface-layer contrast**, not shadow:
`background.surface.base` → `.on` → `.onlayer` creates a brightness ladder; floating layers
(`background.layer.popup`, `.snackbar`, `.sheet`) sit on top of that ladder. Shadow
(`shadow.*`) is a **support cue only** — a floating card should combine the next surface step
*and* a shadow token, never rely on shadow alone.

### Shadow Scale (Light → Dark, offset / blur / color)

| Token | Light | Dark | Use |
|---|---|---|---|
| `shadow.high` | `0 2px 16px rgba(0,0,0,.16)` | `0 2px 16px rgba(0,0,0,.32)` | High floating layers: popup, layer |
| `shadow.medium` | `0 1px 10px rgba(0,0,0,.08)` | `0 1px 10px rgba(0,0,0,.16)` | Medium: content cards |
| `shadow.low` | `0 0 4px rgba(0,0,0,.04)` | `0 0 4px rgba(0,0,0,.08)` | Low: subtle PC boxes |

Offset and blur stay identical by mode; only the color alpha strengthens in Dark — a
mode-agnostic role name, never a hand-branched value.

### Layer Hierarchy (Semantic Background, deepest → shallowest floating order)
`popup` → `snackbar` → `sheet` → `on` → `overlay` → `overlaySubtle` → `overlaySubtlest`. The
3 `overlay*` tokens are dimmed/translucent scrims that darken the content beneath them, not
surfaces to place content on.

## Shapes

### Border Radius Scale (Primitive only — no semantic mapping exists)

| Token | Value | Known use |
|---|---|---|
| `{rounded.4}` | 4px | — |
| `{rounded.8}` | 8px | Button `Square` shape (default) |
| `{rounded.12}` | 12px | — |
| `{rounded.16}` | 16px | — |
| `{rounded.24}` | 24px | — |
| `{rounded.pill}` | 100px | Button `Rounded` shape (Solid: Secondary/Inverse only; Outline: Ghost + `Xl` only) |

Radius **semantic tokens are deferred** (Known Gap) — there is no `radius.card` or `radius.button`
role name yet, only the raw Primitive scale above. Do not invent one.

## Components

Button is the **only** component with a published token matrix in v0.1. Everything else (Card,
Modal, Tab, Snackbar, Bottom Sheet, Badge) exists in the Figma library but has **no token matrix
in this repository** — reference Figma as source, but bind colors/spacing/radius/shadow only
through Semantic token names when building it.

### Button — Full Specification

**Props**

| Property | Enum | Default |
|---|---|---|
| `Variant` | `Solid` · `Outline` | `Solid` |
| `Color` | `Primary` · `Secondary` · `Subtlest` · `Neutral` · `Inverse` · `Ghost` · `Danger` | `Primary` |
| `Size` | `Sm` · `Md` · `Lg` · `Xl` · `2Xl` · `3Xl` | `Lg` |
| `Shape` | `Square` (R8) · `Rounded` (R100) | `Square` |
| `State` | `Default` · `Hover` · `Focus` · `Loading` · `Disabled` | `Default` (no `Pressed` — Known Gap) |
| `◐LeadingIcon` / `◐TrailingIcon` | Boolean, 16px slot | `False` |

**Allowed Combinations — usage contract** (Figma builds more than this; product code must stay
inside this table):

| Variant | Allowed Color | Size | Shape | Leading | Trailing |
|---|---|---|---|---|---|
| `Solid` | Primary · Secondary · Neutral · Inverse · Ghost · Danger | Sm·Md·Lg·2Xl·3Xl | `Square` | Allow | **Disallow** |
| `Solid` | Secondary · Inverse | Sm·Md·Lg·2Xl·3Xl | `Rounded` | Allow | **Disallow** |
| `Outline` | Neutral · Ghost · Subtlest | Sm·Md·Lg·2Xl·3Xl | `Square` | Allow | Allow |
| `Outline` | Ghost | **Xl only** | `Rounded` | Allow | Allow |

Key constraints: Trailing icons exist only in Outline. `Xl` size exists only in
`Outline·Ghost·Rounded`. `Subtlest` exists only in `Outline·Square`. `Solid·Rounded` exists only
for `Secondary`/`Inverse`.

**Color Matrix — Solid, Default state**

| Color | Background | Text | Icon | Hierarchy |
|---|---|---|---|---|
| `Primary` | `{colors.interaction-primary}` | `{colors.text-inverse}` | white | Highest — one core action per screen |
| `Secondary` | `{colors.interaction-secondary}` | `{colors.text-inverse}` (role: Text.Inverse — flips polarity) | inverse | High — second emphasis, Solid-only |
| `Danger` | `{colors.interaction-danger}` | `{colors.text-inverse}` | white | Contextual — destructive actions |
| `Neutral` | `{colors.interaction-neutral}` | `{colors.text-secondary}` | secondary | Medium — cancel, back, filter |
| `Inverse` | `{colors.interaction-inverse}` | `{colors.text-secondary}` | secondary | Medium — secondary actions on dark/dense surfaces |
| `Ghost` | transparent | `{colors.text-secondary}` | secondary | Low — dense/inline/toolbar actions |
| `Subtlest` | — (Outline-only, see below) | — | — | Lowest — near-invisible emphasis |

**Outline Matrix, Default state** — all Outline buttons share `border: 1px solid
{colors.border-button-outline}`:

| Color | Background | Text | Note |
|---|---|---|---|
| `Primary` | transparent | `{colors.text-state-info}` | Accent: transparent + semantic info text |
| `Danger` | transparent | `{colors.text-state-accent}` | Accent: transparent + semantic accent text |
| `Ghost` | transparent | `{colors.text-secondary}` | Neutral: pure transparent |
| `Neutral` | `{colors.interaction-neutral}` | `{colors.text-secondary}` | Keeps a surface fill |
| `Inverse` | `{colors.interaction-inverse}` | `{colors.text-secondary}` | Keeps a surface fill |
| `Subtlest` | `{colors.interaction-subtlest}` | `{colors.text-secondary}` | Outline-Square exclusive |

**Size Scale** (all Variants)

| Size | Typography | Padding (V×H) | Icon gap | Min-height |
|---|---|---|---|---|
| `Sm` | `{typography.caption-strong}` (14px) | `{spacing.6}`×`{spacing.8}` | `{spacing.4}` | 32px |
| `Md` | `{typography.body-small-strong}` (15px) | `{spacing.8}`×`{spacing.12}` | `{spacing.4}` | 36px |
| `Lg` (default) | `{typography.body-small-strong}` (15px) | `{spacing.10}`×`{spacing.16}` | `{spacing.4}` | 40px |
| `Xl` | `{typography.body-small-strong}` (15px) | `{spacing.12}`×`{spacing.16}` | `{spacing.4}` | 44px |
| `2Xl` | `{typography.body-medium-strong}` (16px) | `{spacing.12}`×`{spacing.16}` | `{spacing.8}` | 48px |
| `3Xl` | `{typography.body-large-strong}` (17px) | `{spacing.16}`×`{spacing.20}` | `{spacing.8}` | 56px |

**States** — Hover shows a shared `{colors.state-hover}` overlay across every variant. Focus adds
a 2px `{colors.border-focus}` ring at 2px offset, ring radius = button radius + 2 (Square 8 → 10).
Loading hides label/icons, shows a 24px centered spinner, and fixes width (disables hug) to avoid
layout shift. Disabled swaps to `{colors.interaction-disabled}` background /
`{colors.text-disabled}` text / `{colors.icon-subtlest}` icon. **`Pressed` is undefined** — only
Hover and Focus currently exist as interaction states.

## Do's and Don'ts

### Do
- Use only **Semantic tokens** for automatic Light/Dark swap — never a Primitive (`atomic.Blue.500`)
  directly in product code.
- Always specify the **child key** for group tokens without their own value
  (`background.surface.base`, not `background.surface`; `border.thumbnail.default`, not
  `border.thumbnail`).
- Choose typography by **hierarchical meaning**, not size proximity.
- Keep new components inside the **valid combination table** (Button §1) rather than whatever
  Figma happens to allow.
- Use one `Solid/Primary` button per screen — Anchor's Button spec is explicit that multiple
  Primary buttons collapse the hierarchy.
- Use `Danger` only for destructive/irreversible actions, never for generic visual emphasis.

### Don't
- Don't reference a group-parent token with no value of its own (`background.surface`).
- Don't hardcode HEX values (`#1e84ff`) — always the Semantic token name.
- Don't invent colors, spacing, or radius values absent from the token set — search for a fitting
  Semantic token first; if none exists, that's a Known Gap to flag, not license to add one.
- Don't use `static` color variants for ordinary text/icons — reserve them for genuinely
  mode-invariant cases (e.g. white text over a permanent dark overlay).
- Don't pair a domain text color with the matching domain background in the same area — use the
  `*Subtle` background variant instead.
- Don't reference undefined Primitive steps (`atomic.Purple.500` — only 300/700 exist;
  `atomic.Green`/`atomic.Olive` are single-value, no steps at all).
- Don't put a Trailing icon on a Solid button (Outline-only) or use `Xl` outside
  `Outline·Ghost·Rounded`.

## Responsive Behavior

**Undefined in v0.1 — do not infer breakpoints, grid, or device branching.** Partial clues only:

- Typography carries scope labels for two tokens: `display.large`/`display.medium` are marked
  **PC web only**; `*.emphasis` (weight 600) is marked **app-only limited use**. These are the
  only device-scope facts published.
- Shadow's 3-level scale (`shadow.high/medium/low`) is a general elevation scale, not tied to a
  specific breakpoint or device.
- No breakpoint values, grid column counts, or container max-widths exist anywhere in the source.
  If a project needs these, they must be decided in Figma and published, or asked of the user —
  never guessed from this document or reverse-engineered from screenshots.

## Known Gaps

These areas are **intentionally undefined** in Anchor v0.1. The system has not decided them yet —
treat every line below as "ask the user / defer to Figma," never as raw material to infer a rule
from:

- **Spacing semantic tokens** — only 12 Primitive steps exist (`atomic.Spacing.*`); no semantic
  role layer (`spacing.section`, `spacing.card-padding`, etc.).
- **Radius semantic tokens** — only 6 Primitive steps exist (`atomic.Radius.*`); no semantic role
  layer.
- **Layout · Grid · Container max-width** — undefined, with only partial PC-scope clues from
  typography labels.
- **Responsive Breakpoint · device branching** — undefined.
- **Component token bindings** for Card, Modal, Tab, Snackbar, Bottom Sheet, Badge, etc. — these
  components exist in the Figma library, but no token matrix has been published in this
  repository. Button is the only fully bound component.
- **Button `Pressed` state** — enum undefined; only `Hover` and `Focus` exist.
- **`atomic.Purple` step expansion** — only `300`/`700` exist; other steps are not defined.
- **`atomic.Green` · `atomic.Olive` scale** — single-value tokens, no step scale.
- **Form validation state** (error/success inputs) — undefined beyond the three Input border
  tokens (`border.input.default/hover/focus`); no error/success input color is published.
- **Animation / transition timing** — outside current system scope.
- **Iconography system** — lives outside this repository as a separate track.
- **Out of Scope** (distinct from the gaps above — not merely undefined but not covered by this
  v0.1 document at all): Grid System, Motion/Transition, Accessibility rules, Icon Library,
  product-specific UI, and service patterns (Search/News/Comment). Do not invent rules for these
  either — ask the user when they matter.

If an undefined area blocks work, the correct move is to decide it in Figma and publish through
`figma-publish`, or confirm directly with the user — never to infer a plausible-sounding rule and
present it as an Anchor fact.

---

`light·minimal·serious·chrome` — mood label picked for shortlist-pipeline compatibility with the
rest of this index; Light is Anchor's default surface, but **Dark is equally first-class and
required**, not a secondary theme. See "Anchor Type" above before treating this entry like any
other mood/adapt anchor.

_Source: `DESIGN.md` v0.1 (Foundation usage guide, migrated 2026-06-12) + `Button.md` v0.1.1
(representative component, WIP before spec freeze) + `tokens.json` v0.5.1 build snapshot ·
distilled 2026-07-22 for style-library T-392 · original source:
`_refs/design/english/` (DESIGN.md, Button.md, tokens.json)._
