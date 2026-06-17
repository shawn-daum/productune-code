# PRD markdown style — presentation convention

How the PRD reads on the page. Apply while authoring, alongside `prd-clarity-loop.md`
(which governs the scoring loop). This file governs layout, not content.

## Heading rhythm

Use one heading level per structural role, and never skip a level:

| Level | Role |
|:--|:--|
| H2 | Version or phase boundary (`## v0.5 …`, `## Phase 4 …`) |
| H3 | A slot section (`### Why`, `### 핵심 기능`, `### Acceptance`) |
| H4 | One feature-unit chunk inside a dense section (`#### A2 — Artifacts tab`) |

Never open a section straight into a wall of dense bullets. If an H3 section carries
more than a few feature-units, give each unit its own H4 chunk first.

## Bullet discipline

One bullet states one claim, in a single sentence. Stop the bullet at the first period.

When a point needs more than one sentence — a full feature spec, a behavior plus its
fallback, a rule plus its exception — it is no longer a bullet. Promote it to an H4 chunk
with a short prose paragraph, or split it into several single-claim bullets. Never let a
bullet run on across three or four sentences.

## Inline-code discipline

Backticks mark code and identifiers only: function names, file paths, routes, config keys,
enum values, CLI commands, env-var names. Anything the reader could type into an editor or
a terminal qualifies.

Do not backtick plain-language emphasis, product concepts, or keywords. Words like a phase
name, a decision label, or a status word stay in plain prose (or bold for emphasis), never
in backticks.

## No ASCII diagrams in code fences

Never draw layout, flow, or hierarchy as ASCII art inside a code fence. Render structure as
one of:

- a table, for comparisons, tiers, or mappings;
- a nested list, for hierarchy or sequence;
- a mermaid diagram, for flows and state.

Code fences hold real code, real config, or real command output — nothing else.

## Tables for comparison

Whenever the content compares things — phases, tiers, options, pros and cons, before and
after, layer-to-mapping — use a table, not parallel bullet runs. Give every row the same
columns.

## Self-check before surfacing

Before the PRD leaves your hands, scan it once against this file:

- every dense H3 section breaks into H4 chunks, no bullet wall;
- no bullet spans more than one sentence;
- every backtick wraps a real identifier;
- no ASCII diagram lives in a code fence;
- every comparison is a table.

Fix any miss, or flag it — never surface a PRD that fails its own style check.
