---
name: user-tickets
section: Tickets
when: "writing or rewriting an `assignee: user` ticket body other than `type: decision`"
---
# Contracts §Tickets — `assignee: user` annex

## `assignee: user` — the body the user acts from
- `problem`, in `ticket-body` language: line 1 = can-do-now — `now`, or each blocking `deps` id + what it yields; then these `###`, this order, every one present (empty → `none` in body language):
  1. entry point — the GUI screen or console page as a link, its guide link beside it; never a command (PO habit). Unknown URL → say so, never a guess.
  2. steps — numbered, one act each, screen order; an outside team's turn names the team and what the user waits for.
  3. values — table `field | value | source`, one row per field the user fills; a value another ticket produces = `T-NNN`, never a placeholder number.
  4. decisions — each judgment the user or an outside team makes: who decides · the facts · what each answer changes. Facts only when an outside team decides.
  5. report back — one line per fact the PO closes on (ids · links · approvals · dates); never a credential value.
- `acceptance` (English): one line per report-back item — closes on the user's reply carrying each.
