# UX principles (Tier 0 — generic UX/UI craft)

Portable, project-agnostic UX/UI craft — the single global home for generic design
principles; auto-applies across every project. Each project's `design-system.md` APPLIES
these + holds project-specific tokens / recipes / deltas, not re-authoring them. Apply
when designing any flow / mockup / spec.

## 1. Decision load

- **Few things per page (Hick's Law)** — choice time grows with option count. Show
  only what's needed; split complex tasks into steps. One pane = one content type;
  primary actions ≤ 2 (extra → menu/kebab). Hide advanced actions (palette / quick-open).
- **Progressive disclosure** — early screens = minimal; reveal depth as the user
  advances. Familiar context tolerates density; novel context stays simple.

## 2. Predictability & consistency

- **Same meaning → same form** — consistent color/shape/placement for the same intent.
  Buttons keep fixed positions (Cancel left / Confirm right). Hover/focus behave alike.
- **Predictable outcomes** — an action's result matches what its affordance promised.
  No surprise navigation, no silent destructive effects.

## 3. Feedback

- **Every action gets immediate visual feedback** — one of: instant (≤100ms pressed/
  hover/active), in-progress (spinner / inline progress / non-blocking toast), or
  completion (success toast / inline check / banner).
- **Errors are clear + offer a way out** — state what happened + a recovery CTA
  (retry / view log / cancel). Never a dead error with no next step.

## 4. State coverage (loading / empty / error / skeleton)

- **Design all states, not just the happy path** — loading, empty, error, and skeleton
  each have a defined treatment.
- **Pending ≠ empty** — "loading" and "nothing here" are distinct components. Never
  show empty-state copy while data is still fetching.
- **Empty states teach** — icon + headline + one-line description + one primary CTA so
  the user knows what they can do here.

## 5. Escape & exits

- **Every entry point has at least one explicit exit** — Esc, Cancel/close, backdrop
  click, or dismiss-with-restore. No dead ends.
- **Destructive confirms are deliberate** — Esc/backdrop disabled; require an explicit
  Cancel so accidental dismissal can't trigger or skip the action.
- **Dismiss ≠ permanent delete** — dismissed surfaces (closed panel, banner) stay
  restorable via a visible affordance.

## 6. Navigation & back scope

- **In-app back = the app's own nav-stack/route — never global/browser back.** Browser
  back bypasses the app stack and can eject the user out of the app.
- **Deep-link / cross-service entry** — back returns to the app's parent/previous route
  within the app (not the prior service or a blank screen).
- **Stack-empty fallback** — when entered with an empty nav-stack, back routes to a
  defined fallback (home / parent view), never nowhere.

## 7. Information architecture & visual hierarchy

- **Group by relationship; surface the primary path** — clear hierarchy so the eye
  lands on the most important element first. Depth via breadcrumb / back, not flat sprawl.
- **One primary action per view** — secondary/tertiary actions visually subordinate.

## 8. Responsive & adaptive

- **Layout adapts to viewport + input** — reflow for small screens; respect touch vs
  pointer targets (touch hit-area ≥ 44px). No fixed-width assumptions that clip content.

## 9. Accessibility (WCAG)

- **Contrast** — text ≥ 4.5:1 (large text ≥ 3:1); non-text UI (icons, controls,
  focus rings, state borders) ≥ 3:1.
- **Semantics** — native/ARIA roles so assistive tech understands structure; don't
  encode meaning by color alone (pair with icon/label/shape).
- **Focus + keyboard nav** — every interactive element is reachable and operable by
  keyboard; visible focus ring; logical tab order; no keyboard traps.

## 10. Motion

- **Motion carries meaning, not decoration** — animate to show state change / spatial
  relationship. Keep durations short.
- **Honor `prefers-reduced-motion`** — disable/reduce non-essential motion when the
  user has requested it.

## 11. Microcopy & voice

- **Clear, human, non-threatening** — plain language a non-expert understands; friendly
  over clinical ("Saved" not "Save operation complete"). Avoid blame on errors.
- **Consistent voice + protected vocabulary** — keep terminology consistent; preserve
  domain/protected terms verbatim per the project's i18n guard.

## 12. Forms, validation & error prevention

- **Prevent errors before they happen** — constrain inputs, sensible defaults, confirm
  destructive/irreversible actions, disable invalid submits.
- **Validate helpfully** — validate at the right time (not keystroke-noisy), mark the
  offending field, say how to fix it. Preserve user input on failure.

## 13. Typography — UI text font

- **Never ship Inter as the UI text font — Pretendard leads instead.** Where a design
  would name Inter for UI text, derive Pretendard as the SOLE lead (Latin + Hangul, Inter-
  metric-compatible) — every product, any language; Inter has no Hangul → mismatched
  system fallback. Not a dual stack; anchor mono/display fonts untouched. (2026-06-12) [T-PATCH-129]
