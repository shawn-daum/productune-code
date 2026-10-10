#!/usr/bin/env bash
# prdt — UX-writing word list check at write time (T-977).
# Registered (hook-manifest.json) as PostToolUse, matcher `Write|Edit|MultiEdit`;
# exercised by test/scripts/prdt-wordlist.test.ts spawning it.
#
# After a write to a UX-writing surface (docs/artifacts/**.html|md,
# docs/prd/PRD.md, docs/tickets/**.md — the surface list lives in
# scripts/prdt WORDLIST_SURFACE_RES), returns PostToolUse additionalContext
# naming each word-list hit and its plain replacement, so the writer fixes the
# copy in the same turn. Advisory: it never blocks or undoes the write.
#
# Cost: a fork-0 `case` on the raw payload drops every write that is not a
# docs/ .md/.html file before python3 starts; the judgment (surface match,
# list merge, HTML/Markdown masking) is `prdt wordlist hook`, the same code
# `prdt wordlist check` runs. Any failure fails OPEN: exit 0, no output.
payload="$(cat 2>/dev/null)" || exit 0
case "$payload" in
  *'/docs/'*) ;;
  *) exit 0 ;;
esac
case "$payload" in
  *'.md"'*|*'.html"'*|*'.htm"'*) ;;
  *) exit 0 ;;
esac
here="$(cd -P -- "$(dirname -- "$0")" 2>/dev/null && pwd -P)" || exit 0
prdt=""
for c in "$here/../bin/prdt" "$here/../prdt" "${PRDT_HOME:-$HOME/.prdt}/bin/prdt"; do
  [ -f "$c" ] && { prdt="$c"; break; }
done
[ -n "$prdt" ] || exit 0
command -v python3 >/dev/null 2>&1 || exit 0
printf '%s' "$payload" | python3 "$prdt" wordlist hook 2>/dev/null
exit 0
