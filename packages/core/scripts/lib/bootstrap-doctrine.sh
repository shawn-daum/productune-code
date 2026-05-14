#!/usr/bin/env bash
# packages/core/scripts/lib/bootstrap-doctrine.sh
# source-only — do not execute directly.
#
# Sourced by install.sh and the `productune init` handler to idempotently
# install user-global PO doctrine files under ~/.productune/.
#
# Usage:
#   source "<scripts_dir>/lib/bootstrap-doctrine.sh"
#   bootstrap_user_global_doctrine "<DOCTRINE_ROOT>"
#
# DOCTRINE_ROOT = packages/core/ absolute path.
# The function derives:  PO_SRC="$DOCTRINE_ROOT/po"
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
#     po-instructions.md — cmp -s same → skip silently;
#                          different   → .bak.<ISO-ts> backup + overwrite
#     po-memory.md       — [ ! -e ] guard: seed-only; NEVER overwrite user memory
#     sections/*.md      — wipe stale files first, then sweep copy from source
#     productune.env     — [ ! -e ] guard: seed engine=claude; never overwrite
#
#   Completion trace (stderr via say()):
#     Fresh install / update → "doctrine 시스템 파일 설치 완료." (once)
#     Idempotent re-run      → silent (no output)
#
#   Non-fatal if PO_SRC directory is missing (warn + return 0).
bootstrap_user_global_doctrine() {
  local _doctrine_root="$1"
  local _po_src="$_doctrine_root/po"
  local _ts; _ts="$(date -u +%FT%TZ | tr ':' '-')"
  local _did_install=0

  # ── source directory guard ───────────────────────────────────────────────────
  if [ ! -d "$_po_src" ]; then
    warn "bootstrap-doctrine: po/ source dir not found at $_po_src — skipping doctrine install"
    return 0
  fi

  mkdir -p "$HOME/.productune"
  mkdir -p "$HOME/.productune/sections"

  # ── po-instructions.md: hash compare + backup + update ──────────────────────
  local _instr_src="$_po_src/po-instructions.md"
  local _instr_dest="$HOME/.productune/po-instructions.md"
  if [ -f "$_instr_src" ]; then
    if [ ! -e "$_instr_dest" ]; then
      cp "$_instr_src" "$_instr_dest"
      say "doctrine: ~/.productune/po-instructions.md"
      _did_install=1
    elif ! cmp -s "$_instr_src" "$_instr_dest"; then
      mv "$_instr_dest" "$_instr_dest.bak.$_ts"
      warn "backed up existing $_instr_dest → $_instr_dest.bak.$_ts"
      cp "$_instr_src" "$_instr_dest"
      say "doctrine: updated ~/.productune/po-instructions.md"
      _did_install=1
    fi
    # else: identical hash — skip silently (idempotent re-run)
  fi

  # ── sections/*.md: wipe stale files, then sweep copy ────────────────────────
  # Remove stale section files so removed/renamed sections don't linger.
  local _stale
  for _stale in "$HOME/.productune/sections/"*.md; do
    [ -f "$_stale" ] || continue
    rm -f "$_stale"
  done
  local _section_count=0
  local _sf
  for _sf in "$_po_src/sections/"*.md; do
    [ -f "$_sf" ] || continue
    cp "$_sf" "$HOME/.productune/sections/$(basename "$_sf")"
    _section_count=$((_section_count + 1))
  done
  if [ "$_did_install" = 1 ] && [ "$_section_count" -gt 0 ]; then
    say "doctrine: ~/.productune/sections/ ($_section_count files)"
  fi

  # ── po-memory.md: seed-only (절대 overwrite 금지 — user long-term memory) ───
  local _mem_dest="$HOME/.productune/po-memory.md"
  if [ ! -e "$_mem_dest" ]; then
    if [ -f "$_po_src/po-memory.md.template" ]; then
      cp "$_po_src/po-memory.md.template" "$_mem_dest"
      say "doctrine: seeded ~/.productune/po-memory.md"
      _did_install=1
    fi
  fi

  # ── productune.env: seed-only (engine=claude default) ───────────────────────
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
