# Experiment Brief — lazyweb UI/UX reference grounding for Designer

**Status**: plan v2 (grill-revised) · created 2026-06-23 · owner: pdt-po · requested by shawn
**Revision note**: v1 failed PLAN-GRILL (2 blocking flaws). v2 adopts the grill's `recommended_min_design`.

## Motivation
productune Designer authors design artifacts from doctrine + `frontend-design` skill. shawn asks: can lazyweb (agent-friendly UI/UX reference MCP — 281k+ real app screens, screenshot/flow/pattern/competitive tools) **extend** that workflow with real-world grounding?

## Hypothesis (XYZ — directional, n=2 ceiling)
A Designer pass that **first grounds in lazyweb real-app references at the anchor-selection stage** produces design-system anchors that are **more concrete, pattern-grounded, and competitively-aware** than the doctrine+skill baseline — at acceptable token/time cost. Claim is **directional signal, not proof** (n≤2).

## Unit of analysis — S1→S2 block (NOT single mockups)
Pattern selection is a version-level decision: S1 derives the design-system anchor proposals, locked at S2; S3–S5 merely bind to it. Reference grounding has leverage at S1, not at S5 patch-polish. So the measured artifact = **the S1→S2 block** (3 anchor proposals + their justification + renders) for a pre-committed surface.

## Step 0 — HARD go/no-go (gate before any A/B work)
- Connect lazyweb MCP: server `https://www.lazyweb.com/mcp` (Streamable HTTP); bearer from `https://www.lazyweb.com/api/mcp/install-token` (free, no-billing). Tools per `https://www.lazyweb.com/openapi.json`.
- **GO criterion**: a pdt-designer SUBAGENT must (a) list `lazyweb_get_workflows {operation:list}` and (b) return ≥1 relevant screenshot result within token budget. The "public HTTP fallback" counts ONLY if proven subagent-callable here.
- **NO-GO**: if subagent MCP reachability fails → STOP, report, do not run A/B. (Subagent MCP context ≠ main-thread; unverified.)

## Arms — held constant on model / effort / token+time budget
- **A (control)**: doctrine + `frontend-design` skill only.
- **A+ (confound control, MANDATORY)**: doctrine + skill with an **equal extra research budget** from a NON-lazyweb source. Isolates "extra research/thinking" from "lazyweb specifically."
- **B (treatment)**: lazyweb-grounded (screenshot search / `get_flows` / competitive collection for the surface), cite references, then author.
- Same pre-committed surface, same model/effort, same budget cap across all three.

## Pre-registered measurement (fixed BEFORE the run)
- **Constructs rubric (NEW — QA authors pre-run)**: anchored 0–N bands for each of **concreteness · pattern-grounding · competitive-awareness**. Do NOT reuse `design-review.md` (it measures slop/system/a11y — wrong constructs). design-review.md MAY run as a secondary slop/finish check only.
- **QA blind eval** on the constructs rubric.
- **shawn blind preference** across the 3 (arm hidden).
- **lazyweb hit rate**: did it surface usable, relevant patterns? (count + qualitative).
- **Cost delta**: tokens, wall-clock, MCP round-trips per arm.

## Blinding mechanism
Neutral third party (**pdt-po — not author, not evaluator**) strips ALL lazyweb citations / MCP traces / "I referenced X app" language into a withheld appendix, then relabels artifacts `artifact-1/2/3` randomized per evaluator. Evaluators score **body only**. Citations evaluated separately (citation halo ≠ design quality).

## Pre-registered decision gate (thresholds fixed pre-run)
Adopt lazyweb (→ designer bookshelf, optional P2 tool gated to design tasks) ONLY IF: **B wins blind preference on BOTH tasks** AND **B ≥ [X]-pt margin over A+ on the constructs rubric** AND **cost delta ≤ [Y]× baseline tokens/wall-clock**. (X, Y to be fixed before run; B must beat **A+**, not just A, to credit lazyweb specifically.) Else → drop, record in calibration-log.

## Scope guard / task selection
- Pre-commit the surface **from the real roadmap BEFORE checking lazyweb coverage** (avoid cherry-picking a well-covered surface like login/paywall/onboarding).
- 1–2 tasks, time-boxed. NOT a broad rollout. This brief is the SoT for the run.

## Open pre-run TODOs (PO)
1. QA authors the constructs rubric (anchored bands).
2. Fix X (rubric margin) and Y (cost ceiling) thresholds.
3. shawn pre-commits the surface from roadmap.
4. Run Step 0 go/no-go.
