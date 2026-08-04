/**
 * real-home-tripwire.cjs — T-450. DETECTION, and the floor of this ticket.
 *
 * WHY THIS IS `.cjs` AND NOT `.ts`
 *
 * The same reason `isolation-rules.cjs` is: the floor has to be loadable from
 * every realm and every transform that can start a run, and some of them have no
 * TypeScript at all.
 *
 * Measured, T-450 R2: `vitest.config.ts` is bundled by esbuild before it is
 * evaluated, and a `require()` inside a bundled dependency becomes a dynamic
 * require that throws — `Error: Dynamic require of "fs" is not supported`. So the
 * vitest configs, which are where the baseline MUST be armed (config module scope
 * is the only point earlier than a globalSetup mutation, S3), cannot reach a `.ts`
 * module that requires the `.cjs` rules. They reach this file directly instead,
 * through `createRequire`, with no bundling and no transform in the way.
 *
 * `real-home-tripwire.ts` is a thin typed re-export of this file. There is
 * deliberately no second copy of the logic — that is the defect QA has now
 * reported in four consecutive rounds.
 *
 * THE PROBLEM THIS EXISTS FOR
 *
 * A test suite that silently rewrites the developer's real home while reporting
 * PASSED is worse than a suite that fails: the damage is invisible and the green
 * tick is evidence of nothing. That is not hypothetical — QA R3 booted the real
 * app from a `worker_threads` realm, wrote `SingletonLock`, `SingletonSocket` and
 * `SingletonCookie` into the real `~/Library/Application Support/productune`, and
 * Playwright reported PASSED.
 *
 * Three rounds of prevention preceded this file, and each round's "no shape can
 * escape" claim was broken by the next round's new shape. The reason is
 * structural: prevention has to enumerate the ways to reach a launcher, and that
 * set is not enumerable — new realms, raw bindings, and APIs nobody has thought
 * of keep arriving. Detection has to enumerate something much smaller and fully
 * knowable instead: THE SURFACES THAT MUST NOT CHANGE.
 *
 * So the guarantee inverts. Instead of "no test can do the bad thing", it is
 * "if the bad thing happened, the run is red" — regardless of which spec did it,
 * which realm it ran in, or which API it used. Prevention keeps its value (it
 * fails early, and it names the broken rule), but it is no longer the thing the
 * guarantee rests on.
 *
 * WHERE THE VERDICT LIVES, AND WHY IT MOVED (T-450 R2)
 *
 * T-442 had a `fingerprintRealHome()` called by ONE test in
 * `isolation.guard.spec.ts`, around that test's own matrix — so it could only ever
 * observe mutations made by that one test.
 *
 * R1 of this ticket moved it to a Playwright REPORTER, which does see every test
 * in the run whatever the spec imported. QA broke that in two ways, and both are
 * about WHEN and WHETHER the code runs rather than about what it measures:
 *
 *   S3  a `globalSetup` that deletes the real home is invisible, because
 *       `onBegin` — the reporter's first callback — fires AFTER globalSetup. The
 *       run reported "real home unchanged" while the home was gone.
 *   S4  `--reporter=line` REPLACES the config's reporter array, so an everyday
 *       flag removed the entire floor with no warning at all. (Contrast
 *       `PRODUCTUNE_TRIPWIRE=off`, which announces itself loudly — that asymmetry
 *       was the tell.)
 *
 * So the floor is no longer a reporter. It is split by responsibility:
 *
 *   ARM      `armTripwire()` at CONFIG MODULE SCOPE, in every runner. That is the
 *            earliest executable point in the process: before globalSetup, before
 *            any reporter is constructed, before a single test module is loaded.
 *   VERDICT  produced somewhere no `--reporter` flag can reach —
 *              • Playwright: `globalTeardown` (a config field with no CLI
 *                override; a throw there exits 1 even when every test passed —
 *                measured);
 *              • vitest: an `afterAll` registered from `setupFiles`, which fails
 *                the test FILE and so the run (measured: `Tests 1 passed`,
 *                `Test Files 1 failed`, exit 1). vitest's own globalSetup teardown
 *                is NOT usable — a throw there prints "error during close" and
 *                still exits 0 (measured), which is precisely the green-while-
 *                mutating shape this ticket exists to remove.
 *   ATTRIBUTE the reporter, kept for what it is genuinely good at: naming the
 *            individual test a drift can be blamed on. If a flag removes it, the
 *            run still fails — it just says "somewhere in this run" instead.
 *
 * ── WHICH SURFACES, AND WHY THIS SET IS SUFFICIENT ──────────────────────────
 *
 * The R1 version of this argument had TWO premises QA refuted by measurement.
 * Both are corrected here rather than quietly dropped, because a conclusion that
 * survives on a false premise is not knowledge.
 *
 * COVERED — every real-home location an escaped launch can write:
 *
 *   ~/.productune   settings.json, recents.json, state/, toolchain/ (the shims
 *                   the 2026-07-30 incident corrupted), doctrine/, productune.env
 *   ~/.prdt         the installed discipline tree
 *   ~/productune    the projects base — where the app scaffolds user projects
 *   ~/Library/Application Support/productune
 *                   Electron userData. A surface `HOME` cannot move, because
 *                   Chromium resolves `app.getPath('appData')` from the OS
 *                   account and not from the environment. It is also the one
 *                   with a destructive edge beyond stale files: the
 *                   single-instance lock is filesystem-scoped to userData, so a
 *                   test launch that lands here can kill or steal focus from the
 *                   user's own running Productune.
 *   ~/Library/Preferences/com.productune.gui.plist
 *   ~/Library/Preferences/com.github.Electron.plist
 *                   NSUserDefaults. T-450 / S10 — REFUTED PREMISE. R1 claimed
 *                   "HOME and userData are the only two roots from which the
 *                   product derives a write path". False: Cocoa writes user
 *                   defaults under the BUNDLE IDENTIFIER, which neither `HOME`
 *                   nor `--user-data-dir` moves. Two identifiers because the
 *                   dev layout runs inside `Electron.app`
 *                   (`com.github.Electron`) while a packaged build is
 *                   `com.productune.gui` — the incident that started all of this
 *                   was a dev-layout launch, so covering only the packaged id
 *                   would miss the shape with history.
 *   ~/Library/Caches/electron
 *                   Also outside both redirections (S10, same measurement).
 *
 * Corrected sufficiency argument: an escaped launch resolves its write paths from
 * THREE roots, not two — `os.homedir()`, `app.getPath('userData')`, and the macOS
 * per-bundle-identifier locations that Cocoa derives from the app bundle. The set
 * above is closed under all three. It is still enumerable where "every way to
 * reach a launcher" was not, which is the property that makes detection the floor;
 * what changed is that the enumeration now includes the third root.
 *
 * Churn, MEASURED on this machine over 300s during a LIVE agent session (see the
 * next note for why idle measurement was the wrong test): `~/.prdt` 0/171,
 * `~/productune` 0/7229, userData 0/35295, `~/Library/Caches/electron` 0/8, both
 * plists 0/1. So adding the third root costs no false positives.
 *
 * DELIBERATELY NOT COVERED — 1: `~/.claude` and `~/.claude.json`
 *
 *   In `protectedRealPaths()` for PREVENTION, where a false positive costs
 *   nothing (it only refuses a launch), but excluded from DETECTION: they belong
 *   to the agent harness that develops this repo and it rewrites them
 *   continuously (measured: 25 changed entries of 8627 in 300s, no suite
 *   running). The product never writes them, and a launch that reached them
 *   necessarily also reached `~/.productune`, so nothing is lost.
 *
 * DELIBERATELY NOT COVERED — 2: `~/.productune/state/autosave-snapshots/`
 *
 *   T-450 / S11 — REFUTED PREMISE. R1 wrote "all four covered surfaces showed
 *   ZERO churn" and cited a 60s measurement. QA's objection is exact and it is
 *   about the METHOD, not the number: that measurement was taken while the machine
 *   was IDLE, and the only circumstance under which this suite ever runs is a live
 *   agent session. Re-measured under the real condition — 300s, live session, no
 *   suite running — `~/.productune` shows 4 changed entries of 45, and all four
 *   are this one subtree: `packages/core/src/git-workflow/autosave.ts` writes
 *   `<sha1(projectDir)>.json` there through `os.homedir()`, and the agent harness
 *   drives it. The rest of `~/.productune` was 0.
 *
 *   So the R1 CONCLUSION (cover `~/.productune`) survives, but only with this one
 *   leaf excluded — otherwise the tripwire reddens legitimate runs, and a tripwire
 *   that cries wolf is a tripwire someone deletes, which is how this ticket's
 *   predecessors died. Nothing is lost: an escaped launch that can write
 *   `state/autosave-snapshots/` had the real `HOME`, and with the real HOME it
 *   also writes `settings.json`, `recents.json` or `toolchain/`, all of which are
 *   still watched.
 *
 * KNOWN FALSE POSITIVE, accepted deliberately: if the developer's own Productune
 * is running while the suite runs, its writes to the real userData are
 * indistinguishable from an escaped test launch, and the run goes red. That is
 * the correct direction to fail, and the failure text says so.
 */

'use strict'

const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { containmentKey, realHome } = require('./isolation-rules.cjs')

/**
 * Entry budget for one snapshot, in place of a depth limit.
 *
 * T-450 / S12. The walk used to stop at depth 4, which made an IN-PLACE edit
 * below that depth invisible — the file's size and mtime would change and no line
 * in the fingerprint covered it. Depth was the wrong knob: it was chosen for cost,
 * so it should be bounded by cost.
 *
 * Measured on this machine: unbounded is 59,988 entries in ~210ms, against 38,477
 * in ~115ms at depth 4. Twice the entries for the same order of magnitude of time,
 * and it removes a whole class of blind spot, so the walk is now unbounded and the
 * budget is only there to keep a pathological tree from hanging a run.
 *
 * Exhausting it is reported as a FAILURE, never as a clean result: a truncated
 * fingerprint that reads as "unchanged" is the exact failure mode this whole file
 * exists to remove.
 */
const MAX_ENTRIES = 400_000

/**
 * Subtrees inside a covered surface that are excluded from the fingerprint.
 * See "DELIBERATELY NOT COVERED — 2" in the header: measured churn during the
 * only condition under which this suite runs.
 */
function tripwireExclusions() {
  return [path.join(realHome(), '.productune', 'state', 'autosave-snapshots')]
}

/** The covered surfaces. See the header for why exactly these. */
function tripwireSurfaces() {
  const h = realHome()
  return [
    path.join(h, '.productune'),
    path.join(h, '.prdt'),
    path.join(h, 'productune'),
    path.join(h, 'Library', 'Application Support', 'productune'),
    // S10: the third root. Neither HOME nor --user-data-dir moves these.
    path.join(h, 'Library', 'Preferences', 'com.productune.gui.plist'),
    path.join(h, 'Library', 'Preferences', 'com.github.Electron.plist'),
    path.join(h, 'Library', 'Caches', 'electron'),
  ]
}



class BudgetExhausted extends Error {}

function walkSurface(root, exclusionKeys, budget) {
  const out = []
  const spend = () => {
    if (--budget.left < 0) throw new BudgetExhausted(root)
  }
  out.push(`${root}\texists=${fs.existsSync(root)}`)
  const walk = (dir) => {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, e.name)
      // Exclusions are DIRECTORIES, and this walk built `full` out of real
      // `readdir` entries — so there is no symlink or alias to see through here,
      // and the cheap key is the correct comparison. Measured: doing the full
      // `pathContains()` per entry instead cost 1.1s per snapshot against 0.2s,
      // because it ran `fs.realpathSync` on all ~60k entries.
      if (e.isDirectory() && exclusionKeys.has(containmentKey(full, false))) continue
      try {
        const st = fs.lstatSync(full)
        spend()
        out.push(`${full}\t${st.size}\t${st.mtimeMs}`)
        // Unbounded on purpose (S12) — the budget, not the depth, is the bound.
        // `isDirectory()` is false for a symlink-to-directory, so this cannot
        // follow a link out of the surface and into a cycle.
        if (e.isDirectory()) walk(full)
      } catch (err) {
        if (err instanceof BudgetExhausted) throw err
        /* raced away; its absence shows up as a removed line, which is the report */
      }
    }
  }
  walk(root)
  return out
}

/** Fingerprint every covered surface. Reads only — never creates a path. */
function snapshotRealHome() {
  const perSurface = {}
  const detail = []
  // Normalised once, not per entry — see walkSurface().
  const exclusionKeys = new Set(tripwireExclusions().map((x) => containmentKey(x, false)))
  const budget = { left: MAX_ENTRIES }
  let truncated
  for (const surface of tripwireSurfaces()) {
    let lines
    try {
      lines = walkSurface(surface, exclusionKeys, budget)
    } catch (err) {
      if (!(err instanceof BudgetExhausted)) throw err
      truncated =
        `the ${MAX_ENTRIES}-entry budget ran out while walking ${surface}. ` +
        `This fingerprint is INCOMPLETE and must not be read as a clean one.`
      break
    }
    perSurface[surface] = {
      count: lines.length,
      hash: crypto.createHash('sha1').update(lines.join('\n')).digest('hex'),
    }
    detail.push(...lines)
  }
  return { takenAt: Date.now(), realHome: realHome(), perSurface, detail, truncated }
}


/** Which surfaces changed between two snapshots, and how. */
function diffSnapshots(before, after) {
  const drifted = []
  for (const surface of Object.keys(after.perSurface)) {
    const b = before.perSurface[surface]
    const a = after.perSurface[surface]
    if (b && a && b.hash === a.hash) continue

    const pick = (snap) =>
      new Set(snap.detail.filter((l) => l.startsWith(`${surface}\t`) || l.startsWith(surface + path.sep)))
    const bs = pick(before)
    const as = pick(after)
    drifted.push({
      surface,
      added: [...as].filter((l) => !bs.has(l)).sort(),
      removed: [...bs].filter((l) => !as.has(l)).sort(),
    })
  }
  return drifted
}

/** Human-readable drift report. `culprit` is the test we can attribute it to. */
function formatDrift(drift, culprit) {
  const lines = []
  lines.push('')
  lines.push('┌─────────────────────────────────────────────────────────────────────────┐')
  lines.push('│ T-450 REAL HOME MUTATED DURING THIS RUN                                 │')
  lines.push('└─────────────────────────────────────────────────────────────────────────┘')
  lines.push('')
  lines.push('The suite changed the developer\'s real home. This is a FAILURE of the run')
  lines.push('even if every individual test passed — a test that damages the machine it')
  lines.push('runs on has not verified anything.')
  lines.push('')
  if (culprit) lines.push(`First observed after: ${culprit}`)
  lines.push('')
  for (const d of drift) {
    lines.push(`  ${d.surface}`)
    lines.push(`    +${d.added.length} / -${d.removed.length} entries`)
    for (const l of d.added.slice(0, 12)) lines.push(`      + ${l.split('\t')[0]}`)
    if (d.added.length > 12) lines.push(`      … ${d.added.length - 12} more added`)
    for (const l of d.removed.slice(0, 12)) lines.push(`      - ${l.split('\t')[0]}`)
    if (d.removed.length > 12) lines.push(`      … ${d.removed.length - 12} more removed`)
    lines.push('')
  }
  lines.push('Likely causes, in order of how often they have actually happened here:')
  lines.push('  1. a launch that escaped the rules in tests/isolation-rules.cjs — check')
  lines.push('     for a NEW REALM (worker_threads, a spawned node child, vm) or a raw')
  lines.push('     spawn primitive, since those are what escaped in T-442 R3;')
  lines.push('  2. a spec writing the real home directly with `fs`, no launch involved —')
  lines.push('     prevention has nothing to say about this, only this tripwire does;')
  lines.push('  3. the developer\'s OWN Productune was running during the suite, and its')
  lines.push('     userData writes are indistinguishable from an escaped launch. Close')
  lines.push('     the app and re-run to tell 1 and 2 apart from 3.')
  lines.push('')
  return lines.join('\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// THE FLOOR — runner-agnostic, armed before anything runs, adjudicated where no
// reporter flag can reach. See "WHERE THE VERDICT LIVES" in the header.
// ─────────────────────────────────────────────────────────────────────────────

/** `PRODUCTUNE_TRIPWIRE=off` — the one documented, LOUD way to disarm. */
const tripwireDisabled = () => process.env.PRODUCTUNE_TRIPWIRE === 'off'

const BASELINE_DIR = path.join(os.tmpdir(), 'productune-tripwire')
/** Where the previous COMPLETED run left its final fingerprint (S13). */
const LAST_RUN_FILE = path.join(BASELINE_DIR, 'last-run.json')

/**
 * The baseline file for this run.
 *
 * Deliberately file-backed rather than a module global. Playwright evaluates the
 * config in the runner AND in every worker, and runs `globalTeardown` from its own
 * context; vitest evaluates the config in the main process and the setup files in
 * forked workers. A module global would be a different object in each of those,
 * so the run id travels in the ENVIRONMENT (inherited by every child) and the
 * snapshot travels on disk.
 */
function baselineFile() {
  const id = process.env.PRODUCTUNE_TRIPWIRE_RUN
  return id ? path.join(BASELINE_DIR, `${id}.json`) : undefined
}

/**
 * The baseline this run was armed with, or null.
 *
 * Exported for the ATTRIBUTION reporter, which must adopt the config-scope
 * baseline rather than take its own (that is what made S3 invisible). The path is
 * derived here and nowhere else — a second copy of a path derivation is the defect
 * class this whole ticket is about.
 */
function readArmedBaseline() {
  try {
    const file = baselineFile()
    if (!file || !fs.existsSync(file)) return null
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    return null
  }
}


/**
 * Take the run's baseline. Call at CONFIG MODULE SCOPE, in every runner.
 *
 * Idempotent across processes: the first caller writes the file and exports the
 * run id, and every worker that re-evaluates the config finds the id already set
 * and leaves the baseline alone. That ordering is the whole point — S3 escaped by
 * mutating the home in `globalSetup`, which runs after the reporter's `onBegin`
 * but BEFORE nothing at all at config module scope.
 */
function armTripwire(label) {
  if (tripwireDisabled()) {
    process.stderr.write(
      '\n!! T-450 real-home tripwire is DISABLED (PRODUCTUNE_TRIPWIRE=off).\n' +
        '!! A green run proves NOTHING about the real home.\n\n',
    )
    return { armed: false, reason: 'PRODUCTUNE_TRIPWIRE=off' }
  }
  const existing = process.env.PRODUCTUNE_TRIPWIRE_RUN
  if (existing) {
    // An inherited baseline is only usable if it was taken against the SAME real
    // home. A nested run pointed at a decoy real home inherits the parent's run id
    // through the environment, and reusing that baseline made the nested verdict
    // compare the decoy tree against the developer's actual home — reporting every
    // path as drifted, in a fixture whose whole job is to distinguish drift from no
    // drift. Re-arm instead of trusting the id.
    const inherited = readArmedBaseline()
    if (inherited && inherited.realHome === realHome()) {
      return { armed: true, reason: 'already armed by the parent process', runId: existing }
    }
  }

  const runId = `${Date.now()}-${process.pid}`
  const snap = snapshotRealHome()
  fs.mkdirSync(BASELINE_DIR, { recursive: true })
  sweepStaleBaselines()
  fs.writeFileSync(path.join(BASELINE_DIR, `${runId}.json`), JSON.stringify(snap))
  process.env.PRODUCTUNE_TRIPWIRE_RUN = runId

  const total = Object.values(snap.perSurface).reduce((n, s) => n + s.count, 0)
  process.stdout.write(
    `T-450 real-home tripwire armed at ${label}: ` +
      `${Object.keys(snap.perSurface).length} surfaces, ${total} entries.\n`,
  )
  warnIfDriftedSinceLastRun(snap)
  return { armed: true, reason: 'baseline taken', runId }
}

/**
 * Compare against the previous COMPLETED run and WARN — never fail.
 *
 * T-450 / S13, adopted at QA's prompting. R1 folded this on the grounds that it
 * "can only be a warning". QA's counter stands: between two runs the developer
 * legitimately uses their own app, so it genuinely cannot be a failure — but it
 * would have surfaced incidents ② and ③ of this ticket's lineage, both of which
 * were discovered days later by reading a diff. A warning that fires on the next
 * run is the only thing that can see a mutation landing AFTER a run ends, which
 * is exactly the N5 boundary's window.
 */
function warnIfDriftedSinceLastRun(current) {
  try {
    if (!fs.existsSync(LAST_RUN_FILE)) return
    const previous = JSON.parse(fs.readFileSync(LAST_RUN_FILE, 'utf-8'))
    if (previous.realHome !== current.realHome) return
    const drift = diffSnapshots(previous, current)
    if (drift.length === 0) return
    const age = Math.round((current.takenAt - previous.takenAt) / 1000)
    process.stdout.write(
      `\nT-450 note: the real home changed since the last suite run (${age}s ago):\n` +
        drift.map((d) => `  ${d.surface}  +${d.added.length} / -${d.removed.length}\n`).join('') +
        `This is a WARNING, not a failure — between runs you legitimately use your own\n` +
        `app. It is here because a mutation that lands AFTER a run ends is invisible to\n` +
        `that run, and two incidents in this ticket's lineage were exactly that shape.\n\n`,
    )
  } catch {
    /* a warning must never be the thing that breaks a run */
  }
}

/**
 * A run's baselines are keyed by run id, so an interrupted run leaves one behind.
 * Swept by age rather than by pid: the writer is often a process that has already
 * exited by the time the next run starts.
 */
function sweepStaleBaselines() {
  const MAX_AGE_MS = 6 * 60 * 60 * 1000
  try {
    for (const name of fs.readdirSync(BASELINE_DIR)) {
      if (name === path.basename(LAST_RUN_FILE)) continue
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
 * The verdict. Call from Playwright's `globalTeardown` / vitest's `afterAll`.
 *
 * Returns rather than throws so each caller can fail in its own runner's idiom;
 * `assertTripwireClean()` is the throwing wrapper.
 */
function verifyTripwire(options = {}) {
  const consume = options.consume ?? true
  const clean = { ok: true, report: '', drift: [] }
  if (tripwireDisabled()) return clean

  const file = baselineFile()
  if (!file || !fs.existsSync(file)) {
    return {
      ok: false,
      drift: [],
      report:
        '\nT-450 TRIPWIRE WAS NEVER ARMED.\n' +
        `PRODUCTUNE_TRIPWIRE_RUN=${process.env.PRODUCTUNE_TRIPWIRE_RUN ?? '<unset>'}, baseline file ` +
        `${file ?? '<none>'}.\n` +
        'Failing the run: an unarmed tripwire must not read as a clean one. The config\n' +
        'must call armTripwire() at module scope.\n',
    }
  }

  const before = JSON.parse(fs.readFileSync(file, 'utf-8'))
  const after = snapshotRealHome()
  if (before.truncated || after.truncated) {
    return {
      ok: false,
      drift: [],
      report: `\nT-450 TRIPWIRE FINGERPRINT INCOMPLETE: ${before.truncated ?? after.truncated}\n`,
    }
  }
  const drift = diffSnapshots(before, after)

  if (consume) {
    // Persist the final state for the next run's warning, then drop the baseline.
    try {
      fs.mkdirSync(BASELINE_DIR, { recursive: true })
      fs.writeFileSync(LAST_RUN_FILE, JSON.stringify(after))
      fs.rmSync(file, { force: true })
    } catch {
      /* housekeeping only */
    }
  }

  if (drift.length === 0) return clean
  return { ok: false, drift, report: formatDrift(drift) }
}

/** `verifyTripwire()` as a throw, for callers whose runner reads an exception. */
function assertTripwireClean(where, options = {}) {
  const result = verifyTripwire(options)
  if (result.ok) {
    if (!tripwireDisabled() && (options.consume ?? true)) {
      process.stdout.write(`T-450 real-home tripwire (${where}): real home unchanged across the run.\n`)
    }
    return
  }
  process.stdout.write(result.report)
  throw new Error(
    `T-450: the real home was mutated during this run (verdict at ${where}). ` +
      `See the report above. The run is a FAILURE even though the tests passed.`,
  )
}

module.exports = {
  tripwireExclusions,
  tripwireSurfaces,
  snapshotRealHome,
  diffSnapshots,
  formatDrift,
  tripwireDisabled,
  readArmedBaseline,
  armTripwire,
  verifyTripwire,
  assertTripwireClean,
}
