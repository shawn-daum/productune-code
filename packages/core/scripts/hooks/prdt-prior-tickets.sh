#!/usr/bin/env bash
# prdt — prior tickets at ticket-write time (T-1471).
# Registered (hook-manifest.json) as PostToolUse, matcher `Write|Edit|MultiEdit`;
# exercised by test/scripts/prdt-prior-tickets.test.ts spawning it.
#
# WHY (T-1469): the PO offered symptom-only options for a defect already
# patched four times (T-1377 · T-1429 · T-1465 · T-1468) because that history
# was not in its input while it wrote the options. After the PO writes or edits
# a `type: impl|decision` ticket, this returns PostToolUse additionalContext
# listing the other tickets that touched the same file, hook or feature the
# ticket names (id · title · status) — in the same tool result, before the
# options are written. Advisory: it never blocks or undoes the write.
# The line opens with the literal `[prdt fix history]` (T-1472 wording, T-1473 = A;
# pinned by test/scripts/prdt-prior-tickets.test.ts).
#
# PO only (`agent_type` == `prdt-po`): a worker session prints nothing. Each
# ticket's rows print once per session; a later edit prints only new ids.
#
# Cost: a fork-0 `case` on the raw payload drops every write that is not the
# PO's and not a docs/**/tickets/**.md file before python3 starts; the judgment
# (anchors, ticket scan, git log of the named files) is `prdt tickets prior
# --hook`, the same code `prdt tickets prior <id>` runs. Any failure fails
# OPEN: exit 0, no output.
payload="$(cat 2>/dev/null)" || exit 0
case "$payload" in
  *'prdt-po'*) ;;
  *) exit 0 ;;
esac
case "$payload" in
  *'/tickets/'*'.md"'*) ;;
  *) exit 0 ;;
esac
here="$(cd -P -- "$(dirname -- "$0")" 2>/dev/null && pwd -P)" || exit 0
prdt=""
for c in "$here/../bin/prdt" "$here/../prdt" "${PRDT_HOME:-$HOME/.prdt}/bin/prdt"; do
  [ -f "$c" ] && { prdt="$c"; break; }
done
[ -n "$prdt" ] || exit 0
command -v python3 >/dev/null 2>&1 || exit 0
printf '%s' "$payload" | python3 "$prdt" tickets prior --hook 2>/dev/null
exit 0
