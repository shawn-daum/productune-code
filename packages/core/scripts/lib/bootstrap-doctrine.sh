#!/usr/bin/env bash
# packages/core/scripts/lib/bootstrap-doctrine.sh
# source-only — do not execute directly.
#
# Sourced by the `productune` CLI handler to idempotently install user-global
# doctrine files under ~/.productune/doctrine/.
#
# Usage:
#   source "<scripts_dir>/lib/bootstrap-doctrine.sh"
#   bootstrap_user_global_doctrine "<DOCTRINE_ROOT>"
#
# DOCTRINE_ROOT = packages/core/ absolute path.
# The function derives:  DOCTRINE_SRC="$DOCTRINE_ROOT/doctrine"
#
# Requires say() and warn() to be defined by the caller script.

# Guard: prevent direct execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  printf '[bootstrap-doctrine] ERROR: this file must be sourced, not executed directly.\n' >&2
  exit 1
fi

# bootstrap_user_global_doctrine <DOCTRINE_ROOT>
#
#   Idempotent file policies:
#     doctrine/**/*.md         — per-file cmp: same → skip; different → .bak.<ISO-ts> backup + overwrite.
#                                Mirrors packages/core/doctrine/ → ~/.productune/doctrine/
#                                preserving full sub-directory structure.
#     productune.env           — [ ! -e ] guard: seed engine=claude; never overwrite
#
#   Completion trace (stderr via say()):
#     Fresh install / update → "doctrine 시스템 파일 설치 완료." (once)
#     Idempotent re-run      → silent (no output)
#
#   Non-fatal if DOCTRINE_SRC directory is missing (warn + return 0).
bootstrap_user_global_doctrine() {
  local _doctrine_root="$1"
  local _doctrine_src="$_doctrine_root/doctrine"
  local _doctrine_dest="$HOME/.productune/doctrine"
  local _ts; _ts="$(date -u +%FT%TZ | tr ':' '-')"
  local _did_install=0

  # ── source directory guard ───────────────────────────────────────────────────
  if [ ! -d "$_doctrine_src" ]; then
    warn "bootstrap-doctrine: doctrine/ source dir not found at $_doctrine_src — skipping doctrine install"
    return 0
  fi

  mkdir -p "$HOME/.productune"
  mkdir -p "$_doctrine_dest"

  # ── doctrine/**/*.md: per-file hash compare + backup + update ────────────────
  # Walk all .md files recursively under packages/core/doctrine/, mirror to
  # ~/.productune/doctrine/ preserving sub-directory structure.
  local _file_count=0
  local _sf _rel _dest_file _dest_dir
  while IFS= read -r -d '' _sf; do
    _rel="${_sf#$_doctrine_src/}"
    _dest_file="$_doctrine_dest/$_rel"
    _dest_dir="$(dirname "$_dest_file")"
    mkdir -p "$_dest_dir"
    if [ ! -e "$_dest_file" ]; then
      cp "$_sf" "$_dest_file"
      _did_install=1
      _file_count=$((_file_count + 1))
    elif ! cmp -s "$_sf" "$_dest_file"; then
      mv "$_dest_file" "$_dest_file.bak.$_ts"
      cp "$_sf" "$_dest_file"
      _did_install=1
      _file_count=$((_file_count + 1))
    fi
    # else: identical — skip silently (idempotent re-run)
  done < <(find "$_doctrine_src" -type f -name '*.md' -print0 2>/dev/null)

  if [ "$_did_install" = 1 ] && [ "$_file_count" -gt 0 ]; then
    say "doctrine: ~/.productune/doctrine/ ($_file_count files updated)"
  fi

  # ── productune.env: seed-only ────────────────────────────────────────────────
  local _env_dest="$HOME/.productune/productune.env"
  if [ ! -e "$_env_dest" ]; then
    printf 'engine=claude\n' > "$_env_dest"
    say "doctrine: seeded ~/.productune/productune.env"
    _did_install=1
  fi

  # ── completion trace ─────────────────────────────────────────────────────────
  # Printed once on first install or upgrade; silent on idempotent re-run.
  if [ "$_did_install" = 1 ]; then
    say "doctrine 시스템 파일 설치 완료."
  fi
}
