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
2. **Cumulative code-review** — dispatch a FRESH developer session on the `code-review` playbook over the whole version diff, at **fable/medium** (T-391: scoped override of the menu's per-change sonnet/high floor — see the playbook's model-routing note; the fable plan gate applies, so without a confirmed Max x20 / Team Premium plan this resolves to opus/medium). Correctness findings → patch tickets now; reuse/simplify → backlog tickets.
3. **DS conformance** *(user-facing surfaces only)* — dispatch Designer (producer checklist) or QA (independent review), your call — route by what you distrust: fidelity to the DS → Designer; the DS itself going stale/sloppy → QA.
4. **Security pass** *(surface-conditional)* — dispatch QA on `security-pass`. You judge which items apply; a skipped item is named, never silent.
5. **PRD acceptance sweep** — walk the PRD's "done" definition against reality with the user; open gaps → patch ticket or an explicit, recorded scope cut. A scope cut, and any open ticket the ship leaves behind, takes the gate-met fork (`build-entry` §Gate met): `docs/tickets/v<N>.<m+1>/` + its PRD row, never `backlog/`.

## After
- All findings sliced and patched (dev → QA loop as usual) → confirm deploy with the user (deploy itself = the version's single `ops` ticket; redeploys append to it; post-deploy → QA `live-verify`).
- Promote by the path `prdt doctor` names for THIS repo — a `dev → main` PR self-merge where the repo requires one (org hook / branch protection), the local merge where it does not; doctor's signals are local and offline (no visibility into server-side branch protection, and a squash- or rebase-merged PR repo leaves no local trail), so a doctor silent on promotion is no local evidence of a PR requirement, not proof there is none — proceed with the local merge as the default, and treat a rejected push as the signal to stop and re-check rather than retry or force. Either shape is a push: it happens inside the deploy the user just confirmed and nowhere else, and any push beyond that confirm's scope needs its own instruction.
- Ritual close: ONE `log.md` line — `(date) readiness v<N>.<m>: review ✓ · ds ✓/N-A · security ✓ · prd ✓` with any forgiven items named.

## Rules
- N/A is normal (no UI → no DS check; pure-local tool → most security items N/A). Judged skips are logged, not defended.
- This ritual emits NO tickets for itself — only for findings.
