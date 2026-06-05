#!/usr/bin/env node
/**
 * migrate-po-state-scope.mjs — one-time, per-machine migration for the
 * personal-po-state DEPRECATION.
 *
 * Background: work-state (version pointer, current_phase / current_task,
 * recent_turns, pending_gate, versions, …) now lives ONLY in each project's
 * `<project>/.productune/po-state.json`. The personal store at
 * `~/.productune/po/po-state.json` is NO LONGER a work-store.
 *
 * This script resets a leftover personal po-state that still carries work
 * fields: it backs the file up to `<path>.bak`, then overwrites the original
 * with a minimal `_deprecated` marker. It NEVER copies work into any project
 * (it cannot safely know WHICH project a leftover belongs to) and NEVER touches
 * any project po-state.
 *
 * Idempotent — safe to re-run. No-op when the personal store is missing, has no
 * work fields, or is already marked `_deprecated`.
 *
 *   no-op  : missing file | already `_deprecated` | no work fields → exit 0
 *   migrate: has work fields → cp to <path>.bak, overwrite with marker, exit 0
 *
 * Usage:
 *   node scripts/migrate-po-state-scope.mjs [date]
 *     [date] — optional string folded into the marker (e.g. 2026-06-05).
 *              Omit for no date. No Date.now() is used.
 *
 * Fail-safe: never deletes; only backup + rewrite. Never writes a project.
 */

import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { argv, exit, stdout, stderr } from 'node:process'

// Personal (per-user) po-state — the store being deprecated as a work-store.
const PERSONAL_PO_STATE = join(homedir(), '.productune', 'po', 'po-state.json')

// Work fields that mark a personal po-state as still holding a work-store.
// Presence of ANY of these (non-trivial) means the file pre-dates the scope
// split and must be reset.
const WORK_FIELDS = [
  'version',
  'current_phase',
  'current_task',
  'recent_turns',
  'pending_gate',
  'versions',
]

const dateArg = argv[2] && argv[2].trim() ? argv[2].trim() : null

function deprecatedMarker(date) {
  const provenance = date
    ? `work-state moved to project .productune/po-state.json (${date}); personal po-state holds no work-store`
    : 'work-state moved to project .productune/po-state.json; personal po-state holds no work-store'
  return { _deprecated: provenance }
}

// "non-trivial" = present AND not an empty container / null. A `version: null`
// or `recent_turns: []` leftover is treated as trivial (nothing to preserve).
function isNonTrivial(value) {
  if (value === undefined || value === null) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  if (typeof value === 'string') return value.trim() !== ''
  return true // numbers, booleans, etc.
}

function main() {
  // (c) missing → no-op
  if (!existsSync(PERSONAL_PO_STATE)) {
    stdout.write(
      `[migrate-po-state-scope] no personal po-state at ${PERSONAL_PO_STATE} — nothing to migrate.\n`,
    )
    return 0
  }

  let parsed
  try {
    parsed = JSON.parse(readFileSync(PERSONAL_PO_STATE, 'utf-8'))
  } catch (err) {
    // Unparseable: do NOT destroy it. Leave it untouched and report.
    stderr.write(
      `[migrate-po-state-scope] WARN: ${PERSONAL_PO_STATE} is not valid JSON (${err.message}); ` +
        `leaving it untouched. Inspect/fix manually if needed.\n`,
    )
    return 0
  }

  // (b) already migrated → no-op
  if (parsed && typeof parsed === 'object' && '_deprecated' in parsed) {
    stdout.write(
      `[migrate-po-state-scope] ${PERSONAL_PO_STATE} already deprecated — no-op.\n`,
    )
    return 0
  }

  // no work fields → no-op (still write nothing; only WARN-free path)
  const hasWork =
    parsed &&
    typeof parsed === 'object' &&
    WORK_FIELDS.some((f) => isNonTrivial(parsed[f]))
  if (!hasWork) {
    stdout.write(
      `[migrate-po-state-scope] ${PERSONAL_PO_STATE} holds no work-state fields — no-op.\n`,
    )
    return 0
  }

  // (a) has work fields → backup + reset
  const backup = `${PERSONAL_PO_STATE}.bak`
  copyFileSync(PERSONAL_PO_STATE, backup)
  writeFileSync(
    PERSONAL_PO_STATE,
    JSON.stringify(deprecatedMarker(dateArg), null, 2) + '\n',
    'utf-8',
  )

  stdout.write(
    `[migrate-po-state-scope] personal po-state DEPRECATED.\n` +
      `  reset : ${PERSONAL_PO_STATE}\n` +
      `  backup: ${backup}\n\n` +
      `  Each project's .productune/po-state.json is now the work-state source of truth.\n` +
      `  No work was auto-copied into any project: a leftover personal po-state cannot\n` +
      `  be safely attributed to one specific project.\n` +
      `  If a project's version pointer lived ONLY here, re-open that project (it\n` +
      `  re-scaffolds its .productune/po-state.json) or restore the needed fields from\n` +
      `  the backup above.\n`,
  )
  return 0
}

exit(main())
