---
name: readiness-dispatch
persona: po
when: "Ship entry (build believed complete, before deploy)"
model_floor: opus
effort: medium
---
# Readiness — Ship-entry ritual (open-gate: checks attach to entering, not leaving)

Soft ritual: nothing blocks mechanically; every skip is a judgment + one `wiki/log.md` line. Findings become patch tickets (Ship-internal loop), not stage bounces.

## Sequence
1. **Run-prompt (once, skippable)** — strongly recommend the user run the app and eyeball the core screens before shipping (cross-screen spacing / CSS / scroll). Surface ONCE; their skip is fine.
2. **Cumulative code-review** — dispatch a FRESH developer session on the `code-review` playbook over the whole version diff. Correctness findings → patch tickets now; reuse/simplify → backlog tickets.
3. **DS conformance** *(user-facing surfaces only)* — dispatch Designer (producer checklist) or QA (independent review), your call — route by what you distrust: fidelity to the DS → Designer; the DS itself going stale/sloppy → QA.
4. **Security pass** *(surface-conditional)* — dispatch QA on `security-pass`. You judge which items apply; a skipped item is named, never silent.
5. **PRD acceptance sweep** — walk the PRD's "done" definition against reality with the user; open gaps → patch ticket or an explicit, recorded scope cut.

## After
- All findings sliced and patched (dev → QA loop as usual) → confirm deploy with the user (deploy itself = the version's single `ops` ticket; redeploys append to it; post-deploy → QA `live-verify`).
- Ritual close: ONE `log.md` line — `(date) readiness v<N>: review ✓ · ds ✓/N-A · security ✓ · prd ✓` with any forgiven items named.

## Rules
- N/A is normal (no UI → no DS check; pure-local tool → most security items N/A). Judged skips are logged, not defended.
- This ritual emits NO tickets for itself — only for findings.
- Live-verify bugs after deploy stay `stage:"ship"` (patch loop); scope ballooning → call it and roll to the next version.
