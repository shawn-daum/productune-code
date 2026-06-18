# Anti-default — escape the AI-default look (Tier 0)

Consult at every rendered UI design artifact — S2 (DS render) / S3 (mockup candidates) /
S5 (hi-fi) — before that step's user gate (designer habit §4). You are
building, not reviewing — catch the "AI default" look in your own output and break it on
the free axes while honoring the brief on the axes it pins. A flat, generic, "seen-it-
before" mockup is a self-check fail: fix it or flag it, never surface it silently.

## The reflex you are fighting

Default to Tailwind defaults and your output converges with everyone else's. Each tell
below is a *signal to scrutinize*, not an automatic crime — the test is **motive**: did
you reach for it because the brief asked, or because it was the path of least resistance?
Unmotivated default = fix. Motivated, brief-fit choice = keep, and say why.

## Tailwind tells (scrutinize each for motive)

- **Color** — indigo/violet/purple gradients (`from-indigo-* to-purple-*`), default
  `blue-600` primary, blanket `text-gray-600` body. Pick a palette with intent instead.
- **Shape** — `rounded-2xl` + `shadow-lg/xl` card spam, `border-gray-200` everywhere,
  every section wrapped in a card. Not all content is a card.
- **Layout** — `max-w-7xl mx-auto px-4`, the icon+title+blurb 3-up feature grid, uniform
  `gap-4` listing with no rhythm. Vary density; create hierarchy of space.
- **Hero** — big headline + gradient text + (primary + ghost) two-button row, the
  "big number + small label + gradient accent" stat block.
- **Icons** — lucide sprayed on every item, decorative with no semantic load.
- **Type** — system font only (`font-sans` default), no display/body split, weak
  hierarchy. (Project DS leads with Pretendard for UI text — see ux-principles §13.)
- **Dark mode** — plain `bg-gray-900` + `bg-gray-800` cards, accent merely darker.
- **Motion** — none, or `transition-all` sprayed indiscriminately.

> Tells drift. Treat any newly-converged pattern you notice across recent mockups as a
> tell too, even if it is not listed here — the moment a look becomes the easy default,
> it stops being a choice.

## The 3 convergent default looks

When left to free choice the model keeps landing on one of these. They are *defaults*,
not decisions:

1. Cream background (#F4F1EA) + high-contrast serif + terracotta accent.
2. Near-black background + a single neon-green / vermilion accent.
3. Newspaper layout — hairlines + `border-radius: 0` + dense multi-column.

→ If the brief names one of these looks, using it is correct — follow the brief. If the
axis is free, do not auto-land here; choose deliberately or move off it.

## Escape on free axes, follow the brief on pinned axes

- The brief pins some axes (mandated brand color, a named aesthetic, a platform
  convention). Honor those exactly — deviating there is not creativity, it is a miss.
- Every axis the brief leaves free is where you must avoid the default. Free axis +
  default value = unmotivated. Make a deliberate choice and be able to name the reason.

## Reverse-slop check — weirdness is not a virtue

Escaping the default does not automatically make a design good. **Function-breaking
weirdness fails exactly like blandness does.**

- Unreadable contrast, broken alignment, novelty that kills usability → these fail the
  self-check just as hard as a generic card grid.
- Never chase "different for its own sake". Distinctiveness only counts when it sits on
  top of a working, legible, usable interface — never at its expense.

## Signature requirement varies by artifact type

- **Marketing / landing / hero / entry screen** → a signature is *required*. Ship one
  element that makes this screen memorable (a deliberate type pairing, an owned color
  move, a structural idea). Absence of any signature here is a fail.
- **Utility UI** (settings panel, data table, form, in-app dashboard) → **restraint is
  the correct answer.** Calm, systematic, low-ornament. Forcing a loud signature here is
  itself a fail — over-signature on utility surfaces is penalized, not rewarded.
- Read which kind of artifact you are building, then apply the matching bar.

## Before you surface

1. Walk the Tailwind tells; for each one present, name the motive or remove it.
2. Confirm you are not auto-landing on one of the 3 convergent looks on a free axis.
3. Run the reverse-slop check — distinctiveness must not cost function.
4. Apply the signature bar for this artifact type (required vs restraint).
5. Any unresolved default or function-breaking choice → fix it, or flag it on the
   artifact. Never surface a converged mockup silently.

<!-- (2026-06-18) [T-PATCH-211] new bookshelf — producer-side AI-default detector -->

