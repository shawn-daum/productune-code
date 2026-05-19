# Alternative-reporting protocol

When PO surfaces N ≥ 2 alternative solutions/options to user, reporting MUST follow this format. Anchored to `~/.productune/po-memory.md ## User knowledge state (engineering)`.

Layered on top of `po-loop.md` Step 1 #6 (when to surface alternatives at all). Step 1 #6 decides *whether* to show; this file dictates *how* once decided.

Applies to:
- PO → user direct reporting (chat surface).
- Designer / Developer / QA persona authoring plan / response document with alternative table or A/B/C-style options. They read `user_knowledge_state` snapshot from `[ctx]` (`delegation.md`) and follow same protocol.

## Mandatory format

Each option block = 3 fields: `### Option <label> — <headline>` + **Pros** bullets (each with `[<axis-anchor>]` prefix) + **Cons** bullets (same anchor rule).

Then single recommendation line ending with anchor citation.

Full format spec + axis-anchor syntax + good/bad recommendation examples → **`sections/_formats/alternative-block.md`**.

## Vague-descriptor blacklist

BANNED as **standalone** characterizations (no anchor + mechanism):

- `cleanest` / `cleaner`
- `simpler` / `simplest`
- `easier`
- `more elegant` / `elegant`
- `nicer`
- `better` (without explicit axis)
- `more idiomatic` (without anchor)
- `more maintainable` (without anchor)

**Permitted-when-anchored exception**: any banned word OK if followed by explicit mechanism + axis anchor.

- BANNED:  "Option B is simpler."
- ALLOWED: "Option B is simpler than C for `[React lifecycle]` because no per-component cleanup cascade — single module-level offFns."

**Detection rule** (PO self-check before surfacing): scan surfaced text for blacklist word in standalone position (no anchor within same sentence). Found → self-reject, rewrite with anchor + mechanism, then surface.

## User-side reject signal

User replies with "vague" / "근거" / "왜" / "explain" / equivalent pushback after surfaced alternative block → PO treats as protocol-violation signal:

1. Re-surface same options with anchors filled in.
2. Append `## Recent corrections / to-avoid` line in `~/.productune/po-memory.md` only if pushback recurs ≥2× across turns.
3. Optionally upgrade affected axis levels (per `po-memory.md` `## User knowledge state` update rules).

## Escape — caveman-only

User explicit intent ("just decide" / "make the call" / `/short` / equivalents) → PO may emit only recommendation line with anchor citation, omitting per-option blocks. Vague descriptors still BANNED — anchor citation non-negotiable even in caveman mode.

## Loading

PO loads this file on demand at any turn where N ≥ 2 alternatives would be surfaced. Cache mentally per session like other `sections/*.md` files.

## Anti-doctrine

Does NOT replace `po-loop.md` Step 1 #6 ("alternatives only when 2 defensible paths"). Step 1 #6 = whether to show; this file = format once decided. If only 1 path → no alternative block; direct recommendation (still benefits from anchor citation but not under this protocol's strict format).

## Schema — `## User knowledge state (engineering)` line format

Schema lives in `~/.productune/po-memory.md`. Append-only.

Line format + field definitions + update triggers → **`sections/_details/uks-line-schema.md`**.

## Persona-side enforcement

| Persona | Obligation |
|:--|:--|
| **pdt-po** | Every user surface containing N≥2 alternatives. Most direct application. |
| **pdt-designer** | Plan-mode authoring (e.g. Architecture decision tables, A/B/C blocks in `docs/design/**/*.md`). Reads `user_knowledge_state` from `[ctx]`. Self-rejects on anchor-citation miss. |
| **pdt-developer** | Plan-mode (L4+) outputs + dev responses with alternative blocks. Code body itself out of scope (no alternative form). |
| **pdt-qa** | Test plan multi-strategy selections, verdict retry-path recommendations. |

Personas that can't ground a pro/con in existing axis: surface gap in their output's `open_questions` so PO can decide to add new axis line.
