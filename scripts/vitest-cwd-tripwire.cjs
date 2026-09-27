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
 *
 * SURFACE COVERAGE (T-703 slice 3, QA grill commit 1683b73, F4 + F6)
 *
 * Slice 2's `git status --porcelain` had two blind spots, both because plain
 * `--porcelain` collapses information to keep its output short:
 *
 *   F4  ignored paths (`tmp/`, `scratch/`, `dist/`, `.prdt/index.db`, …) are
 *       not shown AT ALL by default — a test writing only into a gitignored
 *       path left zero trace.
 *   F6  an untracked DIRECTORY is one line (`?? somedir/`) whatever is inside
 *       it. If that directory already existed (as one line) at arm time — any
 *       pre-existing untracked dirt, not necessarily created by a test — a new
 *       file written inside it after arming changes nothing about that one
 *       line, so the write is invisible even though the directory itself was
 *       already being watched.
 *
 * Fixed by two extra flags (QA's suggestion, verified by measurement below):
 * `--untracked-files=all` lists every untracked file individually rather than
 * collapsing its directory, closing F6; `--ignored=matching` does the ignored
 * equivalent, closing F4 for the case that matters here — a NEW ignored path
 * appearing where none existed at arm time (its enclosing ignored root is a
 * line that did not exist before and now does, exactly like a new untracked
 * directory would be). `=matching` rather than bare `--ignored` (which means
 * `--ignored=traditional`) is a measured choice, not the safer-looking one:
 * on this repo, `traditional` walks and lists every individual file under
 * every ignored directory (`node_modules/` included) — 29337 lines in ~0.2s —
 * while `matching` collapses each ignored root to one line, same shape as the
 * untracked case, in ~0.02s indistinguishable from plain `--porcelain`.
 * `matching`'s own remainder — an in-place rewrite of a file inside an
 * ALREADY-ignored directory changes nothing about that directory's one line —
 * is accepted for the same reason the untracked case ever collapses at all:
 * the acceptance this ticket carries is "a NEW ignored path is caught", not
 * "every byte under every ignored path is watched", and watching the latter
 * costs 10x the wall time and two more orders of magnitude of output on this
 * tree for a case (F4's own repro: `tmp/`, a path absent until a test creates
 * it) that the cheaper mode already catches.
 *
 * EXCLUDED BY NAME (T-703 slice 4): `__pycache__`
 *
 * A normal `python3 scripts/prdt ...` invocation — the CLI itself, run
 * directly by a test or by a developer, not the subprocess-missing-`cwd`
 * defect this file exists to catch — writes Python's own bytecode cache next
 * to whichever `.py` file got imported, always named `__pycache__/`, never
 * anything else. `.gitignore` already ignores it (`__pycache__/`), so
 * `--ignored=matching` (F4 above) faithfully reports its FIRST appearance
 * under a directory that had none at arm time as drift — same shape as a
 * stray `tmp/`, but this one is not test contamination: it is the interpreter
 * doing what it always does, and any fresh worktree that runs the CLI at all
 * reproduces it (observed: `packages/core/scripts/__pycache__/` and
 * `packages/core/test/fixtures/__pycache__/`, both from the full suite simply
 * invoking `scripts/prdt`).
 *
 * Fixed the same way `real-home-tripwire.cjs` excludes its own known
 * legitimate writer's subtree (`tripwireExcludedSubtrees()`, `~/.prdt/run/`):
 * by NAME, not by content or by size/mtime. A status line whose path has a
 * `__pycache__` path segment ANYWHERE is dropped before the diff ever sees
 * it — in both the baseline and the verify snapshot, so neither its
 * appearance nor its removal is drift. Unlike `~/.prdt/run/`'s
 * create-then-remove shape, a `__pycache__` that appears during a run
 * typically SURVIVES it (Python does not clean up after itself); full
 * exclusion still fits, because the only thing this cache ever holds is
 * regenerable bytecode with no user data in it, so watching its creation buys
 * nothing this ticket's acceptance asks for. A sibling write that is NOT
 * named `__pycache__` (a real `tmp/`, an actual stray `.prdt/`, anywhere else
 * an ignored or untracked path shows up) is unaffected — this exclusion
 * matches on the literal path segment only.
 *
 * KNOWN LIMITS — named here, not fixed, per this ticket's own scope (F3, F5,
 * F7, F8 below; F1 and F2 are fixed, see their own sections):
 *
 *   F3  a child process a test spawns, still running (or still writing) AFTER
 *       this run's globalSetup teardown has already produced its verdict, is
 *       invisible to it — same shape as the home tripwire's own N5 boundary
 *       (packages/gui/tests/real-home-tripwire.cjs header): the verdict can
 *       only compare snapshots taken while THIS process is still alive to take
 *       them.
 *   F5  `git status --porcelain` reports the working tree against the index —
 *       it says nothing about writes made directly inside `.git/` itself (a
 *       stray file under `.git/hooks/`, a mutated `.git/config`, loose objects
 *       written by some out-of-band `git` call). A test that corrupts repo
 *       metadata rather than the tree it manages is outside this surface.
 *   F7  write-then-clean: a test that creates a stray path and deletes it
 *       again before this run's verify snapshot is taken leaves before/after
 *       identical — no line ever differs, because the drift never existed at
 *       either sampled instant. Detection compares two point-in-time
 *       snapshots, not a continuous log; this is the same limitation class the
 *       home tripwire accepts for its own "invisible to its own run" cases.
 *   F8  inherited baseline root check — see `armTripwire()` below. Documented
 *       here because it is the one item this list names that also got a cheap
 *       fix rather than staying purely descriptive.
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

/**
 * True for a porcelain status line whose path has a `__pycache__` path
 * segment anywhere — see "EXCLUDED BY NAME" in the module header. Porcelain
 * v1 lines are two status characters + one space + the path
 * (`git status --porcelain(=v1)`, the default this module uses), so
 * `line.slice(3)` is the path regardless of which of the two status chars are
 * set.
 */
function isPycacheStatusLine(line) {
  return /(^|\/)__pycache__(\/|$)/.test(line.slice(3))
}

/**
 * `git status --porcelain` for `root`, split into a stable, sorted line list.
 *
 * `--untracked-files=all --ignored=matching` (F4 + F6, see the module header
 * for the measurement behind `=matching`): every untracked file is its own
 * line instead of collapsing to its directory, and a newly-ignored root gets
 * one line the same way a newly-untracked one always did. `__pycache__` lines
 * are dropped here, before either snapshot ever sees them (see "EXCLUDED BY
 * NAME" above) — a normal CLI run's own interpreter cache, not test damage.
 */
function gitStatusLines(root) {
  const raw = execFileSync(
    'git',
    ['status', '--porcelain', '--untracked-files=all', '--ignored=matching'],
    { cwd: root, encoding: 'utf8' },
  )
  return raw
    .split('\n')
    .filter(Boolean)
    .filter((l) => !isPycacheStatusLine(l))
    .sort()
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
 *
 * F8 (T-703 slice 3, known limit — see module header): an inherited baseline
 * is only trusted if its recorded root matches the root THIS call would
 * otherwise arm against — the same guard the home tripwire's own
 * `armTripwire()` applies to an inherited `realHome`. Without it, a nested
 * process (a decoy-repo fixture, or any future nested-vitest run) that picks
 * up `PRODUCTUNE_CWD_TRIPWIRE_RUN` from its parent's environment would adopt
 * the parent's baseline unconditionally — comparing ITS OWN tree's later
 * state against a snapshot of a DIFFERENT tree, and reporting every path in
 * its own root as drifted (or, the other direction, silently reusing a stale
 * baseline instead of arming its own). This is a mitigation, not a fix: it
 * only catches a root MISMATCH; a nested run that happens to share the exact
 * same root as its parent still inherits that baseline, same as before.
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
  const existingFile = existing ? path.join(BASELINE_DIR, `${existing}.json`) : undefined
  if (existing && existingFile && fs.existsSync(existingFile)) {
    try {
      const inherited = JSON.parse(fs.readFileSync(existingFile, 'utf8'))
      const freshRoot = rootOverride || repoRoot()
      if (inherited.root === freshRoot) {
        return { armed: true, reason: 'already armed by the parent process', runId: existing }
      }
      // F8: root mismatch — fall through and arm fresh, under a NEW run id, so
      // this process's own baseline file never overwrites the inherited one
      // (a sibling still holding the old run id must keep finding it intact).
    } catch {
      // Corrupt or unreadable inherited baseline — fall through and arm fresh.
    }
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
 * F1 (T-703 slice 3, grill high): a probe error (git binary missing, the
 * baseline's recorded root having vanished, a corrupt baseline file) must
 * become a FAILED verdict, never an escaping exception. vitest 4.1.9's
 * `_teardownGlobalSetup` runs every globalSetup's teardown in REVERSE order
 * with NO per-item try/catch (observed by the grill) — an uncaught throw from
 * one teardown aborts the loop outright and skips whichever teardown is
 * earlier in the config array (currently the T-450 $HOME verdict). Worse,
 * vitest also prints "error during close" for a throw from a globalSetup
 * teardown but still exits 0 (measured, recorded in the home verdict's own
 * header) — so an uncaught probe error here was BOTH silently green on its
 * own account AND capable of silencing a sibling verdict that would otherwise
 * have failed the run correctly. Every step below that can throw for a reason
 * that is not "this run is dirty" is therefore wrapped, and any such error
 * returns `ok: false` exactly like a real drift would, rather than escaping.
 */
function failClosed(step, err) {
  return {
    ok: false,
    drift: [],
    report:
      `\nT-703 CWD TRIPWIRE PROBE ERRORED while ${step}:\n` +
      `  ${err && err.message ? err.message : String(err)}\n` +
      'Failing the run: a tripwire that cannot read its own signal must not be read\n' +
      'as clean (F1). This is returned rather than thrown so a sibling vitest\n' +
      "globalSetup teardown (e.g. the T-450 $HOME verdict) still runs — vitest's own\n" +
      'reverse teardown order has no per-item try/catch, so an uncaught throw here\n' +
      'would have skipped it.\n',
  }
}

/**
 * The verdict. Call from vitest's `globalSetup` teardown.
 *
 * Returns rather than throws, same as the home tripwire, so a caller can fail
 * in its own runner's idiom — and, per F1 above, so a probe error inside this
 * function ALSO never throws past it.
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

  let before
  try {
    before = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    return failClosed(`reading its own baseline file (${file})`, err)
  }

  let after
  try {
    // Verify against the SAME root the baseline recorded, not a fresh derivation —
    // the decoy-repo fixture test relies on this (arm and verify target the same
    // throwaway repo regardless of this process's own cwd). A vanished root or a
    // missing `git` binary throws here (F1).
    after = snapshot(before.root)
  } catch (err) {
    return failClosed(`probing the working tree at ${before.root ?? '<unknown root>'}`, err)
  }

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
      '\n' +
      'This means a test wrote into the repo instead of its own temp dir, OR a\n' +
      'concurrent editor changed one of the paths named above while this run was in\n' +
      'flight — both look identical here (F2, observed live twice: a same-checkout\n' +
      'save landing mid-run reads exactly like test damage). The likely test-side\n' +
      'cause is a subprocess call (execFileSync/spawnSync) missing an explicit `cwd:`\n' +
      'option, which then falls back to process.cwd() (T-703).\n' +
      '\n' +
      'If anyone — a person, another agent session, another worker — is editing\n' +
      'files in this same checkout, run the full suite from a detached scratch worktree\n' +
      'instead, so its own file activity is never mistaken for this one:\n' +
      '  git worktree add --detach <scratchpad>/x <sha>\n' +
      '  (symlink node_modules and any built dist/ output into it)\n' +
      '  … run the suite there …\n' +
      '  git worktree remove <scratchpad>/x\n',
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
