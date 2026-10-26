---
name: harness-engineering
description: Use when drafting, editing or reviewing any hook-injected string — a `[prdt ...]` line, additionalContext, a Stop/PostToolUse/UserPromptSubmit feedback or block reason, a deny message, a hook script's printed text, or a discipline/override line a hook injects — before the draft reaches the user. Purpose: the value a behavior needs sits in the model input at the moment that behavior happens, for the fewest bytes × firing frequency, with no rule lost. Maps where every injected string arrives, what condition gates its print (always, conditional, or unknown), and which strings repeat the same value in one model input.
---

# harness-engineering

Project-local (productune root). Not part of `~/.prdt` or the canonical discipline; read-only on hooks.

## Purpose — what every check below serves

- **Effect.** The value a behavior needs is present exactly once, in the model input at the moment that behavior happens. Not at session start only, not twice in one input. Source: T-1116 (the reply is rewritten right after a Stop-hook reason, so that reason's input must name the language: acceptance "the line right before a rewritten reply names the language") and the 2026-10-16 reopening of T-1148 (a same-moment duplicate is waste, a missing value at the moment is the defect).
- **Cost.** Bytes × firing frequency. Source T-702 related: "목적: 세션 시작 · 워커 스폰마다 드는 컨텍스트와 대기 비용을 줄인다" and its extension "목적(확장): 매 턴 · 매 툴 호출 · 매 디스패치마다 반복되는 주입이 세션 시작 1회분보다 누적이 클 수 있다 — 그 반복분까지 줄인다"; T-702 acceptance "ranks them by bytes × frequency". Source T-701 related: "목적: 주입 증가가 v1.7 이후처럼 조용히 반복되는 것을 막는다(재발 방지)".
- **Condition.** No rule lost, anything moved out stays reachable on demand. Source T-702: "줄이는 것이지 규칙을 바꾸는 것이 아니다" and acceptance "Content moved out of the always-injected set is still reachable on demand, and each move names where it now loads."
- A draft is good when it puts the value at its moment (effect) for the fewest bytes × fires (cost) without losing a rule (condition). Dedup within one moment is one means to that, not the goal.

## Why this skill exists

2026-10-16 (T-1116): one draft put `lang=ko` into 6 hook strings; 4 reach the model in the same input as the always-present `[prdt reply]` line. inject-edit's Duplicate check greps rule statements only, so the user caught it. This skill adds the missing views: which strings arrive together, and what each costs.

## Step 0 — read the probe ledger before drafting

- Open `docs/_shared/wiki/learning--harness-probes.md` (one row per contrastive probe: date · change · arms · effect · five resource columns · verdict · lesson · artifact path).
- Pick the rows with the same hook event and the same purpose as the draft. Write one line per matching row into the review: what it changed, its verdict, its lesson. No matching row, or no ledger page yet → write "no ledger row for <event> / <purpose>" and go on.
- A lesson that names a condition (e.g. "read-only tools may have blocked the target behavior") is a condition of your draft too: state how the draft meets it, or why it does not apply. A `버림` row for the same change is not retried without saying what differs.
- To run a probe yourself: `.claude/skills/harness-engineering/probe.py` (design `docs/productune/artifacts/v1.15/contrastive-probe-design.md`). Its row goes back to the PO as `memory_notes[]`; a worker never writes the wiki.

## Step 1 — get the arrival map (re-run every time, never reuse an old output)

From the productune root:

```
python3 -I .claude/skills/harness-engineering/arrival-map.py                 # full map
python3 -I .claude/skills/harness-engineering/arrival-map.py --who "reply"   # one string + all co-arrivals
```

- Reads `~/.claude/settings.json` (registrations) and `code/packages/core/scripts/hooks/` (sources; falls back to `~/.prdt/hooks`).
- Output: registrations · per string (event · defining line · bytes · fires · prints · the source comment above it · emitting script) · moments (with always / conditional / unknown byte totals, the moment gate, and the list of `always` strings).
- `bytes` = UTF-8 bytes of the string literal, placeholders (`%s`) unexpanded. `fires` = how often the carrying event runs: per session (SessionStart) · per dispatch (SubagentStart/Stop) · per turn (UserPromptSubmit) · per tool call (PreToolUse/PostToolUse) · per turn end (Stop). `prints` = `always` · `conditional — <gating statement, file:line>` · `unknown — read line N`, derived from the guard that gates the print (an enclosing `if`, or an earlier `|| exit` / `if …: return` in the same scope; a constant is followed to its usage sites, a function to its call sites, a subprocess line to the carrier that emits it), never from the tag or constant name. A guard shared by every string of the moment (persona / event / project filter at the hook's top) is printed once as the moment gate and does not make a string conditional. `unknown` = the print sits where the scope cannot be read (a jq program, an unreferenced constant, an uncalled function): read the cited line, never treat it as `always`. Per-session counts are not in the map; bytes × fires is the unit, not a total.
- A draft's own added bytes are not in the map yet: measure them with `printf %s '<added text>' | wc -c`.
- Moment = one hook event. `same-invocation` = printed by one hook run into one additionalContext (arrives as one block); `same-event` = different hooks, same event.
- `~` marks a heuristic (unreferenced constant, branch with no carrier). Read the cited line before relying on it.
- Not scanned: discipline / override / playbook bodies (they arrive at SessionStart · SubagentStart · compact through `prdt-session-start*.sh` and `prdt-*-inject.sh`). For a draft that edits those, grep the moment's other strings by hand for the same value.

## Step 2 — review procedure (drafter or PO, before the draft goes to the user)

1. **List the touched strings** with their `S##` ids from the map. For each, run `--who` and write down its moment(s) and everything co-arriving.
2. **One carrier per moment.** For each value or rule the draft adds, find the strings in the same moment (same-invocation first, then same-event). Already stated in a co-arriving string → the draft does not repeat it; at most it adds the value to ONE string — one whose `prints` is `always` at that moment (the map's `always at this moment:` line lists them). A `conditional` or `unknown` string never carries a value: a machine that fails its guard (e.g. default register → no `[prdt register]` line) would not receive it. None listed → say so in the table and decide by step 3.
3. **A later event repeats a value only if** the string opens an act the earlier line cannot have governed AND no other string at that event already carries the value. Judgment test: does the string make the model write new prose (a full re-send after a Stop block), or only post a fixed line/format? Fixed-line strings never need the value.
4. **Every added byte names a moment no other string covers, and its cost.** Write the moment and `added bytes × fires` next to it (e.g. `+11 B × per turn end, conditional`). No such moment → drop. A keep whose cost is the largest row of the draft needs its effect stated in the reason (which behavior, which moment).
5. **Condition mismatch is not a reason to repeat.** A string that fires only sometimes (a violation notice, a register-dependent line) does not justify carrying a value the always-present line of the same moment already carries.
6. **Produce the OLD/NEW table** and send it with the draft. Every row gets keep or drop, with the reason in one clause, and its added bytes × frequency:

| # | string (`S##`, file:line) | moment | added B × fires | co-arrives with | keep/drop | reason |
|---|---|---|---|---|---|---|

   Dropped rows stay in the table (so the user sees what was removed) with the cost they would have added, but carry no NEW text. End with one line: total always-on added bytes per firing, and the conditional bytes, before and after the drop.
7. **No rule lost, still reachable.** A row that removes or moves existing text names where that text now loads on demand (a file the model Reads, a command it runs). None named → the row is not ready.
8. A draft whose table has any row without a reason or without added bytes × fires, or any keep that cites only "consistency", is not ready to show.

## Notes

- Values covered by this check include any literal that appears in two strings: a language, a form name, a ticket-link rule, a command flag.
- Re-run the map after any hook registration or hook source change; the registration list is the input, so a new hook shifts moments.
- Wording itself (register, voice) stays with designer `inject-edit`; this procedure only decides which strings carry a value at all.
