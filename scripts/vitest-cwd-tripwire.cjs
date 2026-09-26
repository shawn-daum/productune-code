/**
 * vitest-cwd-tripwire.cjs — T-703 slice 2. Symmetric to T-442/T-450's real-home
 * tripwire (`packages/gui/tests/real-home-tripwire.cjs`), for the OTHER unsafe
 * default a test can fall into: `process.cwd()`.
 *
 * WHY THIS EXISTS
 *
 * `prdt init` (and every other `prdt` subcommand that resolves a project root)
 * has no `--cwd`/`--root` flag — it always resolves off `os.getcwd()`
 * (`cmd_init`: `init_project(os.getcwd(), ...)`, scripts/prdt). A subprocess call
 * (`execFileSync`/`spawnSync`) that omits the `cwd:` option inherits the calling
 * Node process's OWN cwd. During a normal `vitest run` invoked from a package
 * dir, that IS the repo working tree.
 *
 * T-703: exactly this produced an untracked `.prdt/` (config.json `slug: proj`)
 * + `code/` (a fresh `.git`, branch `main`, no commits) + `docs/` directly under
 * `packages/core` at 2026-09-26 22:21. Reproduced in isolation (ticket outcome):
 * `cd <any dir> && python3 scripts/prdt init --json --slug proj --yes` (no `cwd:`
 * passed to the subprocess, so it inherits the caller's) writes exactly that
 * tree under `<any dir>`.
 *
 * DESIGN — deliberately smaller than the home tripwire
 *
 * The home tripwire fingerprints several independent filesystem surfaces
 * (Electron userData, `~/.claude.json`, …) because "the real home was touched"
 * has no single detector. Here there is one: `git status --porcelain` for the
 * repo the run's cwd sits inside. Anything a test writes into a CLEAN working
 * tree shows up there — new untracked paths, or a change to a tracked one — so
 * one snapshot-and-diff of that single surface is the whole mechanism. Same
 * shape as the home tripwire otherwise: arm a baseline at config MODULE SCOPE
 * (before any test file or globalSetup runs), verify at globalSetup teardown.
 *
 * File-backed baseline, not a module global — vitest evaluates the config in
 * the main process; the run id travels in the environment so a later
 * `require()` of this same module (from the globalSetup teardown, possibly a
 * different process) finds the same baseline file on disk.
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const BASELINE_DIR = path.join(os.tmpdir(), 'productune-vitest-cwd-tripwire')
const MAX_AGE_MS = 6 * 60 * 60 * 1000

function tripwireDisabled() {
  return process.env.PRODUCTUNE_CWD_TRIPWIRE === 'off'
}

/** The git work tree containing `cwd` (default: this process's own cwd), or null. */
function repoRoot(cwd) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: cwd || process.cwd(),
      encoding: 'utf8',
    }).trim()
  } catch {
    return null // not inside a git work tree — nothing to guard
  }
}

/** `git status --porcelain` for `root`, split into a stable, sorted line list. */
function gitStatusLines(root) {
  const raw = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' })
  return raw.split('\n').filter(Boolean).sort()
}

/**
 * A snapshot of one repo's working-tree status.
 *
 * `rootOverride` lets a caller point this at a throwaway decoy repo instead of
 * deriving the root from `process.cwd()` — the same escape hatch the home
 * tripwire's `PRODUCTUNE_REAL_HOME` gives a fixture test, here as a parameter
 * because there is exactly one caller path (this module) rather than several.
 */
function snapshot(rootOverride) {
  const root = rootOverride || repoRoot()
  if (!root) return { root: null, lines: [], takenAt: Date.now() }
  return { root, lines: gitStatusLines(root), takenAt: Date.now() }
}

function baselineFile() {
  const id = process.env.PRODUCTUNE_CWD_TRIPWIRE_RUN
  return id ? path.join(BASELINE_DIR, `${id}.json`) : undefined
}

function sweepStaleBaselines() {
  try {
    for (const name of fs.readdirSync(BASELINE_DIR)) {
      const full = path.join(BASELINE_DIR, name)
      try {
        if (Date.now() - fs.statSync(full).mtimeMs > MAX_AGE_MS) fs.rmSync(full, { force: true })
      } catch {
        /* another process won the race */
      }
    }
  } catch {
    /* housekeeping only */
  }
}

/**
 * Take the run's baseline. Call at CONFIG MODULE SCOPE, in every runner.
 *
 * Idempotent across processes the same way `armTripwire` (home) is: a worker
 * that re-evaluates the config and finds a run id already in the environment
 * leaves the existing baseline alone rather than re-arming over it.
 */
function armTripwire(label, rootOverride) {
  if (tripwireDisabled()) {
    process.stderr.write(
      '\n!! T-703 cwd tripwire is DISABLED (PRODUCTUNE_CWD_TRIPWIRE=off).\n' +
        '!! A green run proves NOTHING about the repo working tree.\n\n',
    )
    return { armed: false, reason: 'PRODUCTUNE_CWD_TRIPWIRE=off' }
  }
  const existing = process.env.PRODUCTUNE_CWD_TRIPWIRE_RUN
  if (existing && baselineFile() && fs.existsSync(baselineFile())) {
    return { armed: true, reason: 'already armed by the parent process', runId: existing }
  }

  const runId = `${Date.now()}-${process.pid}`
  const snap = snapshot(rootOverride)
  fs.mkdirSync(BASELINE_DIR, { recursive: true })
  sweepStaleBaselines()
  fs.writeFileSync(path.join(BASELINE_DIR, `${runId}.json`), JSON.stringify(snap))
  process.env.PRODUCTUNE_CWD_TRIPWIRE_RUN = runId

  process.stdout.write(
    `T-703 cwd tripwire armed at ${label}` +
      (snap.root ? `: ${snap.root} (${snap.lines.length} dirty entries at arm time)\n` : ': no git work tree found — nothing to guard\n'),
  )
  return { armed: true, reason: 'baseline taken', runId }
}

/** Lines present in `after` but not in `before` — new dirt, added between arm and verify. */
function diffLines(before, after) {
  if (!before.root || !after.root) return []
  const beforeSet = new Set(before.lines)
  return after.lines.filter((l) => !beforeSet.has(l))
}

/**
 * The verdict. Call from vitest's `globalSetup` teardown.
 *
 * Returns rather than throws, same as the home tripwire, so a caller can fail
 * in its own runner's idiom.
 */
function verifyTripwire(options = {}) {
  const consume = options.consume ?? true
  if (tripwireDisabled()) return { ok: true, report: '', drift: [] }

  const file = baselineFile()
  if (!file || !fs.existsSync(file)) {
    return {
      ok: false,
      drift: [],
      report:
        '\nT-703 CWD TRIPWIRE WAS NEVER ARMED.\n' +
        `PRODUCTUNE_CWD_TRIPWIRE_RUN=${process.env.PRODUCTUNE_CWD_TRIPWIRE_RUN ?? '<unset>'}, baseline file ` +
        `${file ?? '<none>'}.\n` +
        'Failing the run: an unarmed tripwire must not read as a clean one. The config\n' +
        'must call armTripwire() at module scope.\n',
    }
  }

  const before = JSON.parse(fs.readFileSync(file, 'utf8'))
  // Verify against the SAME root the baseline recorded, not a fresh derivation —
  // the decoy-repo fixture test relies on this (arm and verify target the same
  // throwaway repo regardless of this process's own cwd).
  const after = snapshot(before.root)

  if (consume) {
    try {
      fs.rmSync(file, { force: true })
    } catch {
      /* housekeeping only */
    }
  }

  const drift = diffLines(before, after)
  if (drift.length === 0) return { ok: true, report: '', drift: [] }
  return {
    ok: false,
    drift,
    report:
      `\nT-703: the repo working tree (${after.root}) changed during this vitest run:\n` +
      drift.map((l) => `  ${l}\n`).join('') +
      'A test wrote into the repo instead of its own temp dir — the likely cause is a\n' +
      'subprocess call (execFileSync/spawnSync) missing an explicit `cwd:` option,\n' +
      'which then falls back to process.cwd() (T-703).\n',
  }
}

/** `verifyTripwire()` as a throw, for a caller whose runner reads an exception. */
function assertTripwireClean(where, options = {}) {
  const result = verifyTripwire(options)
  if (result.ok) {
    if (!tripwireDisabled() && (options.consume ?? true)) {
      process.stdout.write(`T-703 cwd tripwire (${where}): repo working tree unchanged across the run.\n`)
    }
    return
  }
  process.stdout.write(result.report)
  throw new Error(
    `T-703: the repo working tree was written to during this run (verdict at ${where}). ` +
      `See the report above. The run is a FAILURE even though the tests passed.`,
  )
}

module.exports = {
  tripwireDisabled,
  repoRoot,
  snapshot,
  diffLines,
  armTripwire,
  verifyTripwire,
  assertTripwireClean,
}
