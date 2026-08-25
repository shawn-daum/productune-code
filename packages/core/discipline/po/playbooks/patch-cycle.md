---
name: patch-cycle
persona: po
when: "post-close patch (a fix or a deliberately split-off scope arrives at stage `idle`) · emergency `main` hotfix (`dev` tip not deployable and delivery cannot wait)"
model_floor: opus
effort: medium
---
# Patch cycle — ship a fix after the version already closed

Two openings, one machine. Everything here assumes the version's tag is cut and Retro has run. A bug found while stage is still `ship` is NOT this — that is the in-ship patch loop (PO habit lifecycle), which stays on the same release and rolls nothing.

## Post-close patch (`idle` → patch)
1. **Roll the patch, never a minor** — `po-state.version` `v<N>.<m>[.<p>]` → `v<N>.<m>.<p+1>`; the first patch on a `v<N>.<m>` is `.1`. A scope deliberately split off (kept out so the next minor's gated goal stays clean) opens the SAME cycle — only the opening trigger differs.
2. **Same machine as a minor** — new `docs/tickets/v<N>.<m>.<p>/` dir, fix + auto-QA, confirm-gated deploy, live-verify, immutable `v<N>.<m>.<p>` tag at close.
3. **Lightweight retro, both openings** — one `wiki/log.md` line: what shipped + outcome-if-any, and for a split-off release also WHY it was split. NO `retro--` page and NO full `retro` sequence — that page exists to harvest a whole minor's cross-ticket learning, which a handful of tickets does not have.
4. **Close** — cut the tag (PO habit's release-notes rule applies: the `## <version>` RELEASES section lands in the SAME change), then stage back to `idle`.

## Rules
- Live-verify re-fail INSIDE the patch cycle reuses the in-ship patch-loop semantics — append the same ops ticket, no further roll.
- Ballooning past a small scope → call it and open the next minor instead.
- A fix wanted for an OLDER closed version is absorbed into the ACTIVE line — never a patch line branched off the closed tag (the updater delivers branch tips, not tags, so such a tag reaches nobody). If it cannot wait for the active line, take the hotfix path below.

## Emergency `main` hotfix
ONLY when `dev` tip is not deployable and delivery cannot wait — installs on other machines follow `main`.
1. Cherry-pick the fix from `dev` onto `main`, adding the `## <version>` RELEASES section and cutting the `v<N>.<m>.<p>` tag in that same change.
2. Merge `main` → `dev` back immediately.
- The pre-push hook blocks `main` wherever it is active (`prdt doctor` installs or repairs that hook, and names it when it is inactive — a fresh clone starts with none) — the only way through an active one is `ALLOW_MAIN_PUSH=1` on that ONE push command, never exported, never written into a script or config; it marks intent, it does not grant consent, so the contracts push gate (explicit user instruction) is satisfied FIRST and separately.
- Mergeback is a merge, never a rebase: when `dev` already carries the same change as its own commit, keep the duplicate — resolve any conflict in favor of `dev` and let the merge commit stand so `main` stays an ancestor of `dev`; never revert or rewrite either side to "dedupe".
