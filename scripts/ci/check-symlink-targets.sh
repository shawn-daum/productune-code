#!/usr/bin/env bash
# scripts/ci/check-symlink-targets.sh
#
# Lint hook for T-021 (C1 fresh-install CI smoke), check (b).
#
# Blocks any git-tracked symlink whose target is an ABSOLUTE path
# (starts with "/") or a HOME-anchored path (starts with "~"). Such targets
# are machine-specific: a symlink committed with target "/Users/alice/repo/x"
# resolves to a dangling link on every other machine. This guards the first of
# the two real fresh-install bugs the deferred_candidate
# `v0.5-fresh-install-ci-smoke` records (absolute-path symlink).
#
# Relative targets (e.g. "productune", "../foo/bar") are portable and allowed.
#
# Exit 0 = clean. Exit 1 = at least one absolute/HOME symlink target found.
#
# Scope: git-tracked entries only (mode 120000). node_modules and other
# untracked symlinks are out of scope — only what ships in the repo matters.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

fail=0

# git ls-files -s emits:  <mode> <objectname> <stage>\t<path>
# Symlinks have mode 120000. We read the path (field after the tab) and inspect
# its target via `git cat-file blob` (the blob content of a symlink IS its target
# string), so the check is independent of the checked-out filesystem state.
while IFS= read -r line; do
  [ -z "$line" ] && continue
  mode="${line%% *}"
  [ "$mode" = "120000" ] || continue

  # path is everything after the first tab
  path="${line#*$'\t'}"
  # objectname is the 2nd whitespace-delimited field
  rest="${line#* }"
  obj="${rest%% *}"

  target="$(git cat-file blob "$obj" 2>/dev/null || true)"
  [ -z "$target" ] && continue

  case "$target" in
    /*|'~'*)
      printf 'FAIL: absolute-path symlink target — %s -> %s\n' "$path" "$target" >&2
      fail=1
      ;;
  esac
done < <(git ls-files -s)

if [ "$fail" -ne 0 ]; then
  printf '\n[check-symlink-targets] absolute-path symlink target(s) found. ' >&2
  printf 'Commit symlinks with RELATIVE targets only.\n' >&2
  exit 1
fi

printf '[check-symlink-targets] OK — no absolute-path symlink targets in tracked tree.\n'
exit 0
