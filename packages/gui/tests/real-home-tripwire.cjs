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
 *                   NSUserDefaults, in SIZE-ONLY mode (see below).
 *                   T-450 / S10 — REFUTED PREMISE. R1 claimed
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
 * CORRECTION, QA R3 / B1 — that measurement was taken on the HOST, where the run
 * rule forbids windows and therefore no launch happens at all. It says nothing
 * about the leg where launches DO happen, and on that leg both of the surfaces it
 * cleared have a legitimate writer. What the two recording modes below exist for
 * is exactly that: a surface whose churn is zero in the environment you measured
 * and non-zero in the environment the suite has to stay green in.
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
 * DELIBERATELY NOT COVERED — 2: `~/.prdt/run/` (T-491)
 *
 *   Full exclusion, not name-only — see `tripwireExcludedSubtrees()`. This is
 *   the call-governor hook's OWN counter directory, and the hook fires on every
 *   tool call of the very session running this suite, so a governed run wrote
 *   `+N / -N` entries here on every invocation (create-then-remove of
 *   `.fired-*` markers and `<session-id>.<agent-id>` counters) with no test
 *   involved at all — an always-red tripwire nobody reads, which is the exact
 *   failure mode this file's own header (S13 above) names as how a floor dies.
 *   Unlike the `~/.claude` case above (an unrelated harness, prevention already
 *   covers it, name-only would still show the removals), this is `.prdt` ITSELF
 *   and name-only mode does not help: the diff keeps name-only REMOVALS as
 *   drift on purpose (that is what makes it catch a rampaging test elsewhere in
 *   `.prdt`), and the governor's own churn is exactly create-then-remove. So the
 *   surface is dropped from the walk entirely rather than down-graded.
 *
 *   Contracts §Return envelope (2026-08-20) makes this the correct call, not a
 *   weakening: `~/.prdt/run/` is carved out as tooling-owned — written only by
 *   hook/CLI/installer, read-only for every persona — so what this tripwire was
 *   seeing was never test damage, it was normal runtime state for the very
 *   category of writer the carve-out already blesses. `~/.prdt` itself stays
 *   FULLY covered outside this one subtree: `discipline/`, `hooks/`, `bin/`,
 *   `overrides/`, `wiki/`, `plan-tier`, `update-state.json` are untouched by this
 *   change and a test that rm -rf's any of them still reddens the run.
 *
 * COVERED IN SIZE-ONLY MODE: the two NSUserDefaults plists
 *
 *   T-450 R3 / F2 → QA R3 / B1. F2 was a correct fix and this is its consequence,
 *   not its retraction. Before F2 a file-shaped surface recorded `exists=` alone,
 *   so every NSUserDefaults write was invisible; F2 gave it `size mtime` and the
 *   detection became precise enough to see a write it previously could not.
 *
 *   What it now sees on the VM `@window` leg is a LEGITIMATE writer. A sanctioned
 *   `launchApp()` boots the app inside `Electron.app`, and Cocoa flushes user
 *   defaults for `com.github.Electron` on the way out: measured on the VM, size
 *   stays at 237 bytes and only mtime moves — precisely the shape F2 taught the
 *   floor to catch. Neither `HOME` nor `--user-data-dir` can relocate it; that is
 *   S10's own premise, which is why the surface is watched at all. Result before
 *   this change: `51 passed, exit 1`, every window run, forever.
 *
 *   That is not a safe state. A floor that fires red on correct behaviour trains
 *   the next round to read red as normal, and three of the four incidents in this
 *   ticket's lineage happened in exactly that fog. So the plists drop mtime and
 *   keep size:
 *
 *   DETECTION GIVEN UP: an in-place rewrite of an existing plist that preserves
 *   its byte length. That is what the sanctioned launch does, and no metadata
 *   signal separates it from an unsanctioned launch doing the same thing — both
 *   are Cocoa writing user defaults for the same bundle id. Same structure as the
 *   F3 remainder: where the legitimate and the illegitimate write are identical in
 *   the signal, a detector for one is a false positive on the other.
 *
 *   DETECTION KEPT: creation (a bundle id that had no defaults on this machine now
 *   does — an app that has never run here just ran), deletion (the user's defaults
 *   destroyed, the same category of unrecoverable loss as incident #4's
 *   settings.json), and any change of byte length — truncation, wholesale
 *   replacement, keys added or removed.
 *
 *   WHY THE REMAINDER IS ACCEPTABLE: this surface's job is to catch an escaped
 *   launch, and an escaped launch is caught at FULL `size mtime` fidelity on
 *   `~/Library/Application Support/productune` — unless it also redirected
 *   userData, in which case the plist is the only real-home path it touched and
 *   what it did there is byte-for-byte the same edit a sanctioned launch makes.
 *   The blast radius of the remainder is therefore the user's window frame and
 *   UI defaults for one bundle id, with no user document, no credential and no
 *   recovery data in it. The destructive edge S10 named for this surface —
 *   losing the plist — stays red.
 *
 *   BOTH BUNDLE IDS, by construction: `tripwireSizeOnlyPaths()` is the single
 *   place the two plist paths are derived and `tripwireSurfaces()` spreads it, so
 *   the surface set and the mode set cannot disagree. Only the dev-layout id has
 *   an OBSERVED legitimate write (QA R3 could not get the packaged app to flush
 *   `com.productune.gui` in a 25s SIGTERM run); the packaged id is covered anyway,
 *   because a normal-exit flush would put it in exactly the same position and
 *   discovering that from a red leg later is the failure this change is about.
 *
 * COVERED IN NAME-ONLY MODE: `~/.productune/state/autosave-snapshots/`
 * and `~/.prdt/.auto-open-debounce/`
 *
 *   T-450 / S11 → R3 / F3, the history in full because each round corrected the
 *   previous one's premise:
 *
 *   R1 wrote "all four covered surfaces showed ZERO churn" from a 60s IDLE
 *   measurement. QA refuted the method: the only condition under which this
 *   suite runs is a live agent session, and re-measured under that condition
 *   this one subtree churns (`packages/core/src/git-workflow/autosave.ts`
 *   rewrites `<sha1(projectDir)>.json` here through `os.homedir()`, driven by
 *   the agent harness). R2 therefore EXCLUDED the subtree — and QA R2 showed the
 *   exclusion is a LAUNDERING CHANNEL: in-place corruption and per-file DELETION
 *   of the user's real recovery snapshots were wholly invisible while the run
 *   stayed green. R2's counter-argument ("a launch with the real HOME writes
 *   settings.json too") was an argument about LAUNCHES and does not hold for
 *   this tripwire's own stated purpose #2 — a direct `fs` write with no launch.
 *
 *   The fix has to separate what the legitimate writer DOES from what it never
 *   does, and that is measurable from `autosave.ts` itself: it CREATES
 *   `<sha1>.json` files, REWRITES them in place (tmp + rename), and never
 *   deletes or renames anything. So the subtree is fingerprinted in NAME-ONLY
 *   mode: every entry is recorded by PATH but without size/mtime, additions are
 *   ignored by the diff, and `*.tmp` (the writer's own transient) is invisible.
 *   Result: per-file deletion, renames and subtree removal turn the run RED —
 *   the laundering channel is closed — while a legitimate autosave rewrite or a
 *   new project's first snapshot changes nothing the diff looks at.
 *
 *   THE HONEST REMAINDER, stated rather than hidden: an in-place rewrite of an
 *   EXISTING snapshot with corrupt content is still invisible. It is
 *   indistinguishable in principle from the legitimate writer's own rewrite by
 *   any metadata- or content-level signal (both change the same file's bytes,
 *   size and mtime, and the writer runs concurrently during every live
 *   session), so any detector for it fires on every legitimate session — and a
 *   tripwire that cries wolf is a tripwire someone deletes, which is how this
 *   ticket's predecessors died. Blast radius of the remainder: silent content
 *   damage to snapshots whose FILE SET is intact; deletion — the destructive
 *   half QA demonstrated — is no longer in it.
 *
 *   `~/.prdt/.auto-open-debounce/` (QA R3 / B2) is the same shape and takes the
 *   same mode. R3 reported it as an OBSERVATION — a churn source inside a watched
 *   surface that had not yet produced a false red — and QA turned the observation
 *   into a demonstration: one added marker reddens a run, and two appeared during
 *   QA's own round roughly ten minutes apart.
 *
 *   The writer is `~/.prdt/hooks/prdt-auto-open.sh`, registered PostToolUse on
 *   `Write`, so it fires during any agent session — which is the only condition
 *   under which this suite ever runs (the S11 lesson, again). Read from the hook
 *   itself, its whole repertoire is: `mkdir -p` the directory, and write a
 *   10-byte epoch to `<cksum>-<blocks>`, either creating that marker or rewriting
 *   it in place at the same length. It never deletes, never renames, never prunes
 *   — there is no expiry path in the script at all. So the difference set is the
 *   signal, exactly as for autosave-snapshots.
 *
 *   DETECTION GIVEN UP: an in-place rewrite of an existing marker (invisible), and
 *   an added marker (ignored). Blast radius: nil in the destructive direction —
 *   these are debounce timestamps for a Finder/Preview popup, regenerated on the
 *   next Write, and the worst a corrupted one does is open a window once too
 *   often or once too rarely. DETECTION KEPT: deletion of a marker, renaming, and
 *   removal of the directory — which is what a test rampaging through `~/.prdt`
 *   would do, and the reason the relaxation is a LEAF and not the surface.
 *
 * KNOWN FALSE POSITIVE, accepted deliberately: if the developer's own Productune
 * is running while the suite runs, its writes to the real userData are
 * indistinguishable from an escaped test launch, and the run goes red. That is
 * the correct direction to fail, and the failure text says so.
 *
 * ANOTHER SESSION'S `prdt` WRITE — a notice, not a failure (T-1134)
 *
 *   Other agent sessions on this machine run `prdt feedback record` etc. while a
 *   suite runs, and that write turned three green runs red (2026-10-14). The
 *   default above is NOT relaxed: unattributed drift still fails. The exception
 *   is inverted — the WRITER proves itself. `prdt` (prdt_safe_fs.note_home_write,
 *   called from the CLI's write primitives) appends {path, pid, start, parent
 *   chain} to `~/.prdt/run/external-writes.jsonl` before every `~/.prdt` write.
 *   A drift line becomes a notice only when such an entry names its path (or it
 *   is that path's parent directory, or a directory that write created), was
 *   stamped inside this run's window, carries no tripwire run id, and has a
 *   complete parent chain that does NOT contain this run's root pid. A test that
 *   calls `prdt` against the real home is a descendant of the root and fails.
 *   Path ownership by any other route (shell, node, python) gets no
 *   report and fails, as before. KNOWN BOUNDARY: a test process that detaches
 *   from the run (reparented to launchd — the isolation rules refuse
 *   `detached: true`) AND drops the run id, then calls `prdt`, or one that
 *   forges a log line by hand, is read as another session.
 *
 * ANOTHER SESSION'S AGENT TOOL WRITE — a notice, not a failure (T-1522)
 *
 *   T-1134 rested on "every writer outside the run self-reports", and an agent's
 *   Edit/Write tool does not: another session editing `~/.prdt/wiki/` pages turned
 *   three green `prdt track merge` runs red (2026-11-11). Those writes are not
 *   self-reported either — the harness already records every finished write tool
 *   call in its session transcript, and `agentToolWritePaths()` reads that record.
 *   A drift path an agent tool wrote in the window gets the same coverage as a
 *   reported one — but only while the file still holds exactly what the latest
 *   record says was written (QA grill, d8daf5ca): a path-only match let a test
 *   append to, or delete, the very page another session had edited. A SHELL write
 *   by another session (python heredoc, sed, rm) is covered when that session's
 *   Bash command, issued or returning in the window, named the path (dev4, user
 *   decision B; content unchecked — see `agentShellWritePaths()`). Any other
 *   write (shell, node, python) still fails unless `prdt` reported it; see
 *   `agentToolWritePaths()` for why a test cannot earn either.
 */

'use strict'

const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { containmentKey, realHome, ambientPrdtHome } = require('./isolation-rules.cjs')

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
 * Subtrees inside a covered surface that are fingerprinted in NAME-ONLY mode:
 * entries are recorded by path, size/mtime are not, additions are ignored and
 * the writer's `*.tmp` transients are invisible — removals and renames are
 * drift. See "COVERED IN NAME-ONLY MODE" in the header (T-450 R3 / F3): a full
 * exclusion here was QA R2's laundering channel, a full fingerprint reddens
 * every live agent session.
 */
function tripwireNameOnlySubtrees() {
  const h = realHome()
  return [
    path.join(h, '.productune', 'state', 'autosave-snapshots'),
    // QA R3 / B2 — prdt's PostToolUse auto-open hook writes epoch markers here
    // during any agent session, and one added marker turned a run red.
    path.join(h, '.prdt', '.auto-open-debounce'),
  ]
}

/**
 * Subtrees inside a covered surface that are DROPPED from the walk entirely —
 * no line recorded for the root or anything under it, not even `exists=`. See
 * "DELIBERATELY NOT COVERED — 2" in the header (T-491): this is narrower than
 * `tripwireNameOnlySubtrees()` on purpose. Name-only still treats a REMOVAL as
 * drift, and this subtree's only writer (the call-governor hook) creates and
 * removes its own markers on every tool call of the governed session running
 * the suite — so name-only mode would still fire on every run. Nothing else in
 * `~/.prdt` gets this treatment; only the tooling-owned `run/` carve-out does.
 */
function tripwireExcludedSubtrees() {
  const h = realHome()
  return [path.join(h, '.prdt', 'run')]
}

/** Marker suffix on name-only detail lines; the diff keys off it. */
const NAME_ONLY = 'name-only'

/**
 * File-shaped surfaces fingerprinted in SIZE-ONLY mode: `size` is recorded,
 * `mtime` is not, so an in-place rewrite of the same byte length is invisible
 * while creation, deletion and any length change stay drift. See "COVERED IN
 * SIZE-ONLY MODE" in the header (QA R3 / B1).
 *
 * Both bundle identifiers live here and `tripwireSurfaces()` spreads this list,
 * so there is exactly one derivation of the two plist paths — a second copy is
 * where the packaged id would be forgotten, and forgetting it is how B1 would
 * come back the first time a packaged build flushes its defaults on a clean exit.
 */
function tripwireSizeOnlyPaths() {
  const prefs = path.join(realHome(), 'Library', 'Preferences')
  return [path.join(prefs, 'com.productune.gui.plist'), path.join(prefs, 'com.github.Electron.plist')]
}

/** The covered surfaces. See the header for why exactly these. */
function tripwireSurfaces() {
  const h = realHome()
  // T-1450: the PRDT_HOME the run was started with is a surface too. Skipped when
  // it is the real `~/.prdt` (or inside it) — already covered, and its tooling-
  // owned `run/` carve-out must keep applying there. Any other target gets the
  // full walk, `run/` included: a write there is test damage, not governor churn.
  const ambient = ambientPrdtHome()
  const realPrdt = path.join(h, '.prdt')
  const ambientSurface =
    ambient && ambient !== realPrdt && !ambient.startsWith(realPrdt + path.sep) ? [ambient] : []
  return [
    path.join(h, '.productune'),
    path.join(h, '.prdt'),
    path.join(h, 'productune'),
    path.join(h, 'Library', 'Application Support', 'productune'),
    // S10: the third root. Neither HOME nor --user-data-dir moves these.
    ...tripwireSizeOnlyPaths(),
    path.join(h, 'Library', 'Caches', 'electron'),
    ...ambientSurface,
  ]
}



class BudgetExhausted extends Error {}

function walkSurface(root, modes, budget) {
  const out = []
  const spend = () => {
    if (--budget.left < 0) throw new BudgetExhausted(root)
  }
  // T-450 R3 / F2. A FILE-shaped surface (the two NSUserDefaults plists) used to
  // be recorded as `exists=` alone, so an in-place plist write — which is the
  // only thing NSUserDefaults ever does to an existing plist — changed nothing
  // in the fingerprint and the whole surface was watched in name only. A
  // non-directory root now records its size; `exists=` survives only for the two
  // states that HAVE no size (absent, or a directory whose own mtime is
  // deliberately not a signal — its children are).
  //
  // QA R3 / B1. Whether `mtime` joins the size is the surface's RECORDING MODE:
  // a size-only surface has a sanctioned writer whose rewrites keep the byte
  // length, so mtime there is a red light on correct behaviour rather than a
  // signal. See "COVERED IN SIZE-ONLY MODE" in the header for what that gives up.
  let rootStat = null
  try {
    rootStat = fs.lstatSync(root)
  } catch {
    /* absent */
  }
  if (!rootStat) {
    out.push(`${root}\texists=false`)
    return out
  }
  if (!rootStat.isDirectory()) {
    spend()
    out.push(
      modes.sizeOnly.has(containmentKey(root, false))
        ? `${root}\t${rootStat.size}`
        : `${root}\t${rootStat.size}\t${rootStat.mtimeMs}`,
    )
    return out
  }
  out.push(`${root}\texists=true`)
  const walk = (dir, nameOnly) => {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, e.name)
      // T-491: an excluded subtree (currently only `~/.prdt/run/`) is dropped
      // BEFORE the name-only check and unconditionally, even inside an
      // already-nameOnly walk — no line, no recursion, no spend. Same cheap
      // readdir-built key as name-only below; see that comment for why it is
      // safe here (no symlink/alias to see through).
      if (e.isDirectory() && modes.excluded.has(containmentKey(full, false))) continue
      // Name-only roots are DIRECTORIES, and this walk built `full` out of real
      // `readdir` entries — so there is no symlink or alias to see through here,
      // and the cheap key is the correct comparison. Measured: doing the full
      // identity check per entry instead cost 5x per snapshot, because it
      // stat-walked all ~60k entries' ancestries.
      const entryNameOnly = nameOnly || (e.isDirectory() && modes.nameOnly.has(containmentKey(full, false)))
      if (entryNameOnly) {
        // The legitimate writer's transient (`<file>.json.tmp`, write+rename):
        // present in one snapshot and gone in the next on every live session.
        if (e.name.endsWith('.tmp')) continue
        spend()
        out.push(`${full}\t${NAME_ONLY}`)
        if (e.isDirectory()) walk(full, true)
        continue
      }
      try {
        const st = fs.lstatSync(full)
        spend()
        out.push(`${full}\t${st.size}\t${st.mtimeMs}`)
        // Unbounded on purpose (S12) — the budget, not the depth, is the bound.
        // `isDirectory()` is false for a symlink-to-directory, so this cannot
        // follow a link out of the surface and into a cycle.
        if (e.isDirectory()) walk(full, false)
      } catch (err) {
        if (err instanceof BudgetExhausted) throw err
        /* raced away; its absence shows up as a removed line, which is the report */
      }
    }
  }
  walk(root, false)
  return out
}

/** Fingerprint every covered surface. Reads only — never creates a path. */
function snapshotRealHome() {
  const perSurface = {}
  const detail = []
  // Normalised once, not per entry — see walkSurface().
  const modes = {
    nameOnly: new Set(tripwireNameOnlySubtrees().map((x) => containmentKey(x, false))),
    sizeOnly: new Set(tripwireSizeOnlyPaths().map((x) => containmentKey(x, false))),
    excluded: new Set(tripwireExcludedSubtrees().map((x) => containmentKey(x, false))),
  }
  const budget = { left: MAX_ENTRIES }
  let truncated
  for (const surface of tripwireSurfaces()) {
    let lines
    try {
      lines = walkSurface(surface, modes, budget)
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
    // Name-only ADDITIONS are the legitimate writer's behaviour (a new project's
    // first snapshot) and are not drift; name-only REMOVALS are exactly what the
    // legitimate writer never does, and stay in. See tripwireNameOnlySubtrees().
    const added = [...as].filter((l) => !bs.has(l) && !l.endsWith(`\t${NAME_ONLY}`)).sort()
    const removed = [...bs].filter((l) => !as.has(l)).sort()
    if (added.length === 0 && removed.length === 0) continue
    drifted.push({ surface, added, removed })
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
  lines.push('Note (T-491): `~/.prdt/run/` (the call-governor hook\'s own counters) is')
  lines.push('EXCLUDED from this fingerprint on purpose — it is tooling-owned runtime')
  lines.push('state, not test damage, and the hook rewrites it on every tool call of the')
  lines.push('governed session itself. Drift reported above is NOT that path; do not')
  lines.push('diagnose it as cause 3 just because a governor is running this suite.')
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

/**
 * Where the previous COMPLETED run left its final fingerprint (S13) — keyed by
 * the real home it fingerprints. T-450 R3: this used to be ONE shared file, so
 * every nested fixture run (whose "real home" is a decoy) overwrote the host's
 * between-run record on every suite run, and the S13 warning — the only
 * mechanism that can surface an N5-shaped late landing — was silently reset by
 * the very suite it protects. Keyed per home, a decoy's record and the
 * developer's record no longer share a slot; it is also what makes the N5
 * reduced-form fixture in the guard spec deterministic.
 */
function lastRunFile() {
  const key = crypto.createHash('sha1').update(realHome()).digest('hex').slice(0, 16)
  return path.join(BASELINE_DIR, `last-run-${key}.json`)
}

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
  // T-1134: the run's root process — every process of the run descends from it.
  snap.rootPid = process.pid
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
    if (!fs.existsSync(lastRunFile())) return
    const previous = JSON.parse(fs.readFileSync(lastRunFile(), 'utf-8'))
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
      if (name.startsWith('last-run-')) continue
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
  const allDrift = diffSnapshots(before, after)
  // T-1134: the default stays T-450's — every drift fails. A drift line is moved
  // to the notice only when a writer OUTSIDE this run reported that path in the
  // machine's external-write log before writing it (see externalWritePaths()).
  // T-1522: plus every path an agent session's Edit/Write tool wrote during the
  // window, read from the harness's own transcripts, while the file still holds
  // what that write left (see agentToolWritePaths()).
  // T-1522 dev4: plus every drift path under `~/.prdt` that another session's Bash
  // tool_use command named in the window (see agentShellWritePaths()) — content
  // unchecked, since a shell write leaves only its command text.
  const candidates = allDrift.flatMap((d) => [...d.added, ...d.removed].map((l) => l.split('\t')[0]))
  // A transcript record stamped after this moment (a future stamp) earns nothing.
  const verifiedAt = Date.now()
  const reported = new Set([
    ...externalWritePaths(before),
    ...agentToolWritePaths(before, verifiedAt),
    ...agentShellWritePaths(before, candidates, verifiedAt),
  ])
  const drift = []
  const external = []
  for (const d of allDrift) {
    const isExternal = (l) => coveredByReport(l.split('\t')[0], reported, before)
    const mine = { surface: d.surface, added: d.added.filter((l) => !isExternal(l)), removed: d.removed.filter((l) => !isExternal(l)) }
    const theirs = { surface: d.surface, added: d.added.filter(isExternal), removed: d.removed.filter(isExternal) }
    if (mine.added.length || mine.removed.length) drift.push(mine)
    if (theirs.added.length || theirs.removed.length) external.push(theirs)
  }
  const notice = formatExternalNotice(external)

  if (consume) {
    // Persist the final state for the next run's warning, then drop the baseline.
    try {
      fs.mkdirSync(BASELINE_DIR, { recursive: true })
      fs.writeFileSync(lastRunFile(), JSON.stringify(after))
      fs.rmSync(file, { force: true })
    } catch {
      /* housekeeping only */
    }
  }

  if (drift.length === 0) return { ...clean, notice, externalDrift: external }
  return { ok: false, drift, report: formatDrift(drift) + notice, notice, externalDrift: external }
}

/**
 * T-1134: the external-write log. `prdt` (packages/core/scripts/prdt_safe_fs.py,
 * `note_home_write`) appends one JSON line per machine-home write, BEFORE the
 * write, to `~/.prdt/run/external-writes.jsonl` — inside the excluded `run/`
 * subtree, so the log itself is never drift. Read only here; never created.
 */
function externalWriteLogs() {
  const run = path.join(realHome(), '.prdt', 'run')
  return [path.join(run, 'external-writes.jsonl.1'), path.join(run, 'external-writes.jsonl')]
}

/** Slack before the baseline's `takenAt`, which is stamped at the END of the walk. */
const REPORT_SLACK_MS = 5000

/**
 * The containment keys of every path a writer OUTSIDE this run reported during
 * the run's window. An entry counts only when it PROVES it is outside:
 *   - no `run` id (a writer inside any tripwire run does not report at all),
 *   - a `complete` parent chain (it reached pid 1 — a truncated chain proves
 *     nothing) that does not contain this run's root pid, nor is the root itself,
 *   - stamped inside the window (not before the baseline walk began).
 * Anything else — no log, a malformed line, an unprovable entry — earns nothing,
 * and the drift stays a failure.
 */
function externalWritePaths(before) {
  const rootPid = before.rootPid ?? Number(String(process.env.PRODUCTUNE_TRIPWIRE_RUN ?? '').split('-')[1])
  const out = new Set()
  if (!Number.isInteger(rootPid) || rootPid <= 1) return out
  for (const log of externalWriteLogs()) {
    let text
    try {
      text = fs.readFileSync(log, 'utf-8')
    } catch {
      continue
    }
    for (const line of text.split('\n')) {
      let e
      try {
        e = JSON.parse(line)
      } catch {
        continue
      }
      if (!e || typeof e.path !== 'string' || !path.isAbsolute(e.path)) continue
      if (e.run) continue
      if (e.complete !== true || !Array.isArray(e.ancestors) || e.ancestors.length === 0) continue
      if (e.pid === rootPid || e.ancestors.includes(rootPid)) continue
      if (typeof e.ts !== 'number' || e.ts < before.takenAt - REPORT_SLACK_MS) continue
      out.add(containmentKey(e.path, true))
    }
  }
  return out
}

/**
 * T-1522: the containment keys of every file an AGENT TOOL (Claude Code's Edit /
 * Write / MultiEdit) wrote during the run's window, on any session of this machine,
 * AND that still holds exactly what the latest such write left.
 *
 * No writer reports here. The record is the harness's own transcript, which it
 * keeps for every tool call whatever the tool or the session: after a write tool
 * finishes, `~/.claude/projects/<project>/<session>.jsonl` (subagents under
 * `<session>/subagents/`) gains one line whose `toolUseResult` carries `filePath`
 * and `structuredPatch` — a key only the write tools' results have (a Read's
 * result names its path under `file`, never at the top level with a patch).
 *
 * CONTENT, NOT PATH (QA grill on d8daf5ca). A path match alone excused whatever
 * else happened to that path in the window: a test appending to the page another
 * session had just edited, or deleting it, passed. So a path is covered only when
 * the file exists now and its bytes equal the content the LATEST in-window record
 * for it says was written. That content is derived from the record itself:
 *   - Write: `content` is the whole file.
 *   - Edit / MultiEdit: `originalFile` with `structuredPatch` applied
 *     (applyStructuredPatch(); every context and removed line must match, else
 *     nothing is derived). Measured on 74 live Edit records: the result equals
 *     `originalFile` with `oldString` → `newString`, 74/74.
 *   - An Edit whose `originalFile` is null (the harness omits it on many records)
 *     derives from the previous in-window record for the same path, when that one
 *     derived and the patch applies to it.
 *   - Otherwise such an Edit gets a WEAKER check: the file must contain the
 *     record's `newString` and — when `oldString` is non-empty and not a substring
 *     of `newString` — no longer contain `oldString`. PO decision (T-1522 dev3):
 *     one of the pages that turned 2026-11-11's merges red was written by exactly
 *     such a record, so failing closed would bring that red back. Tightened (QA
 *     qa2 P10 · P11, dev4): an empty `newString` earns nothing (every file
 *     "contains" it, so an emptied page passed); when the file's size at the
 *     baseline is known and every weak record since is a single replacement
 *     stamped after the baseline, the file must now be exactly that size plus
 *     each record's byte delta (catches truncation, whole rewrites and appends);
 *     when that size is not known, a file that now holds nothing but `newString`
 *     (its old text gone wholesale) earns nothing. ACCEPTED NARROW GAP: a test
 *     that rewrites text outside the replaced span of that same page in the same
 *     window, keeping the byte length, passes. A record with neither shape (no
 *     strings) earns nothing.
 * Nothing derived and no weak check → the path is not covered and its drift stays
 * a failure. A removed file is never covered (Edit/Write never delete).
 *
 * Why this cannot excuse a write made BY the run: an agent tool write is made by
 * the Claude Code process itself, never by a descendant of the run's root — a
 * test process can run a shell, python or node, but it cannot make a session's
 * Edit tool fire. A `claude` started BY a test runs under the sandbox HOME the
 * isolation rules give every test (and with CLAUDE_CONFIG_DIR cleared by the
 * vitest home sandbox), so its transcript lands there and not under
 * `realHome()/.claude/projects` — the only directory read here, deliberately not
 * one an environment variable can repoint. KNOWN BOUNDARY, the same class as
 * T-1134's forged log line: a test that hand-writes a transcript line into the
 * real `~/.claude` (outside the covered surfaces) is read as another session.
 *
 * Only transcripts modified inside the window are opened, and only lines naming
 * `structuredPatch` are parsed. Stamped before the window → earns nothing.
 */
/**
 * Every session transcript (`*.jsonl`, subagents' included) under the REAL home's
 * `~/.claude/projects` modified at or after `since` — the only directory read, by
 * design not one an environment variable can repoint.
 */
function transcriptFiles(since) {
  const files = []
  const walk = (dir) => {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) walk(full)
      else if (e.isFile() && e.name.endsWith('.jsonl')) {
        try {
          if (fs.statSync(full).mtimeMs >= since) files.push(full)
        } catch {
          /* raced away */
        }
      }
    }
  }
  walk(path.join(realHome(), '.claude', 'projects'))
  return files
}

function agentToolWritePaths(before, until = Infinity) {
  const since = before.takenAt - REPORT_SLACK_MS
  const records = []
  for (const f of transcriptFiles(since)) {
    let text
    try {
      text = fs.readFileSync(f, 'utf-8')
    } catch {
      continue
    }
    for (const line of text.split('\n')) {
      if (!line.includes('"structuredPatch"')) continue
      let e
      try {
        e = JSON.parse(line)
      } catch {
        continue
      }
      const r = e && e.toolUseResult
      if (!r || typeof r !== 'object' || typeof r.filePath !== 'string' || !path.isAbsolute(r.filePath)) continue
      if (!('structuredPatch' in r)) continue
      const ts = Date.parse(e.timestamp)
      if (!Number.isFinite(ts) || ts < since || ts > until) continue
      records.push({ ts, seq: records.length, r })
    }
  }
  // Oldest first, so each path ends on its latest record. Equal stamps keep read order.
  records.sort((a, b) => a.ts - b.ts || a.seq - b.seq)
  // key → { filePath, content: string | undefined, weak: { oldString, newString } | undefined,
  //         size: number | undefined (the byte length the records say the file has now) }
  const written = new Map()
  for (const { ts, r } of records) {
    const key = containmentKey(r.filePath, true)
    const prev = written.get(key)
    let content
    let weak
    let size
    if (typeof r.content === 'string' && (r.type === 'create' || r.type === 'update')) content = r.content
    else if (typeof r.originalFile === 'string') content = applyStructuredPatch(r.originalFile, r.structuredPatch)
    else {
      if (prev && typeof prev.content === 'string') content = applyStructuredPatch(prev.content, r.structuredPatch)
      if (content === undefined && r.originalFile === null && typeof r.oldString === 'string' && typeof r.newString === 'string') {
        weak = { oldString: r.oldString, newString: r.newString }
        // Expected size: the previous record's, else the baseline's — only for a
        // single replacement stamped after the baseline walk ended (a record in
        // the slack may already be inside the baseline's size).
        const base = prev ? prev.size : baselineSize(before, r.filePath)
        if (Number.isInteger(base) && r.replaceAll !== true && ts >= before.takenAt)
          size = base + Buffer.byteLength(r.newString, 'utf-8') - Buffer.byteLength(r.oldString, 'utf-8')
      }
    }
    if (typeof content === 'string') size = Buffer.byteLength(content, 'utf-8')
    written.set(key, { filePath: r.filePath, content, weak, size })
  }
  const out = new Set()
  for (const [key, w] of written) {
    if (typeof w.content !== 'string' && !w.weak) continue
    let now
    try {
      if (!fs.statSync(w.filePath).isFile()) continue
      now = fs.readFileSync(w.filePath)
    } catch {
      continue // removed (or unreadable): Edit/Write never delete — stays drift
    }
    if (typeof w.content === 'string') {
      if (now.equals(Buffer.from(w.content, 'utf-8'))) out.add(key)
      continue
    }
    const text = now.toString('utf-8')
    const { oldString, newString } = w.weak
    if (newString === '') continue // every file contains '' — an emptied page must not pass
    if (!text.includes(newString)) continue
    if (oldString !== '' && !newString.includes(oldString) && text.includes(oldString)) continue
    if (Number.isInteger(w.size)) {
      if (now.length !== w.size) continue
    } else if (oldString !== '' && text.trim() === newString.trim()) continue // whole page replaced by newString
    out.add(key)
  }
  return out
}

/** A file's byte size in the baseline fingerprint, or undefined (absent, name-only, a directory). */
function baselineSize(before, filePath) {
  const line = before.detail.find((l) => l.startsWith(`${filePath}\t`))
  if (!line) return undefined
  const f = line.split('\t')
  return f.length === 3 && /^\d+$/.test(f[1]) ? Number(f[1]) : undefined
}

/**
 * T-1522 dev4 (user decision B): the containment keys of the drift `candidates`
 * under the real `~/.prdt` that another session's SHELL command named in the
 * window. A shell write (a python heredoc, `sed -i`, `rm`, `mv`) leaves no tool
 * result naming its path — only the command text in the session transcript's
 * Bash `tool_use` line. QA qa2 observed it on the real machine: session aac6c0dc
 * rewrote three wiki pages and removed a fourth from one `python3 - <<EOF` call.
 *
 * CONTENT UNCHECKED — the command text cannot say what the file now holds, and a
 * shell may delete or move, so a removed path is covered too. ACCEPTED GAP (the
 * same class as the agent-write one): a test touching a path another session's
 * command named in the same window passes.
 *
 * Which command text names a path. A mention is `~/.prdt`, `$HOME/.prdt`,
 * `${HOME}/.prdt` or `<real home>/.prdt` — not preceded by a path character —
 * followed by the longest run of path characters (a quote, whitespace, a shell
 * metacharacter or a glob character ends it). `~` and `$HOME` are reliable here:
 * only transcripts under the REAL home are read, and those sessions' shells run
 * with the real HOME. NOT recognised: `$PRDT_HOME`, `Path.home() / ".prdt"`, a
 * path assembled from pieces with no `.prdt` mention, a glob (`wiki/*.md`).
 * A drift path is covered when:
 *   - a mention names it exactly (trailing `/` ignored), or
 *   - a mention names a directory above it AND the rest of its path below that
 *     directory appears in the same command as a token starting a word (after a
 *     quote, whitespace, `=` or `(`). That is how aac6c0dc's heredoc named its files:
 *     `W=os.path.expanduser('~/.prdt/wiki/')` then `W+'fact--kc-request-channels.md'`;
 *     a `cd ~/.prdt/wiki && … 'x.md'` reads the same way. A token right after a
 *     `/` is part of ANOTHER path (`ls ~/.prdt/wiki; cat docs/_shared/wiki/index.md`
 *     — this repo mirrors `wiki/`, `hooks/`, `discipline/` trees — or a URL) and
 *     names nothing, unless the `/` follows `$W`, `${W}` or `{W}` for a variable
 *     W assigned that directory's mention on the mention's own line
 *     (`W=~/.prdt/wiki` … `"$W/a.md"`).
 * A directory mention ALONE covers nothing under it: `ls ~/.prdt`, `grep -rn …
 * ~/.prdt` are the commonest read-only commands other sessions run, and letting
 * them cover the whole subtree would excuse any test write there. So a bulk
 * shell rewrite through a glob (`sed -i … ~/.prdt/wiki/*.md`) or `rm -rf` of a
 * directory still fails for the files it does not name.
 *
 * The window. A Bash `tool_use` line is stamped when the command is ISSUED, its
 * `tool_result` when it returns; the writes happen between. A command counts when
 * either stamp is inside the window (issued before the baseline but still running
 * into it, or issued during the run). A command still running at verify time
 * with no result yet counts only if issued inside the window. `until` (ms) bounds
 * the window's end: the verify time for a live verdict (a stamp after it — a
 * future stamp — earns nothing), the run's end for a replay of a past run.
 *
 * Why a test cannot earn it: the same as agentToolWritePaths() — only
 * `realHome()/.claude/projects` is read, and a `claude` started by a test writes
 * its transcript under the sandbox HOME. Forging a line into the real `~/.claude`
 * is the same known boundary.
 */
function agentShellWritePaths(before, candidates, until = Infinity) {
  const out = new Set()
  const prdt = path.join(realHome(), '.prdt')
  const prdtKey = containmentKey(prdt, true)
  // Drift paths under ~/.prdt: { key, segs } — `segs` are the path's own
  // segments below ~/.prdt as walked (true case; the key may be case-folded).
  const wanted = []
  for (const c of candidates) {
    const key = containmentKey(c, true)
    if (key !== prdtKey && !key.startsWith(prdtKey + path.sep)) continue
    const segs = c.startsWith(prdt + path.sep) ? c.slice(prdt.length + 1).normalize('NFC').split(path.sep) : []
    wanted.push({ key, segs })
  }
  if (wanted.length === 0) return out
  const since = before.takenAt - REPORT_SLACK_MS
  const commands = []
  for (const f of transcriptFiles(since)) {
    let text
    try {
      text = fs.readFileSync(f, 'utf-8')
    } catch {
      continue
    }
    const issued = new Map() // tool_use id → { ts, command }
    const lines = text.split('\n')
    for (const line of lines) {
      if (!line.includes('"tool_use"') || !line.includes('"Bash"') || !line.includes('.prdt')) continue
      let e
      try {
        e = JSON.parse(line)
      } catch {
        continue
      }
      const content = e && e.message && Array.isArray(e.message.content) ? e.message.content : []
      const ts = Date.parse(e.timestamp)
      if (!Number.isFinite(ts) || ts > until) continue
      for (const b of content) {
        if (!b || b.type !== 'tool_use' || b.name !== 'Bash' || !b.input || typeof b.input.command !== 'string') continue
        if (!b.input.command.includes('.prdt')) continue
        issued.set(b.id, { ts, command: b.input.command })
      }
    }
    if (issued.size === 0) continue
    const pending = [...issued].filter(([, u]) => u.ts < since)
    const returned = new Map()
    if (pending.length) {
      for (const line of lines) {
        if (!line.includes('"tool_result"')) continue
        const m = /"tool_use_id":\s*"([^"]+)"/.exec(line)
        if (!m || !issued.has(m[1])) continue
        try {
          const ts = Date.parse(JSON.parse(line).timestamp)
          if (Number.isFinite(ts)) returned.set(m[1], ts)
        } catch {
          /* malformed — earns nothing */
        }
      }
    }
    for (const [id, u] of issued) {
      const r = returned.get(id)
      if (u.ts >= since || (r !== undefined && r >= since && r <= until)) commands.push(u.command.normalize('NFC'))
    }
  }
  if (commands.length === 0) return out
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const homeForms = new Set([realHome()])
  try {
    homeForms.add(fs.realpathSync(realHome()))
  } catch {
    /* absent home — the literal form only */
  }
  const homes = ['~', '\\$HOME', '\\$\\{HOME\\}', ...[...homeForms].map((h) => esc(h.normalize('NFC')))]
  const STOP = "\\s'\"`;|&<>(){}$*?\\[\\]\\\\,"
  const mentionRe = new RegExp(`(?<![\\w./-])(?:${homes.join('|')})/\\.prdt(?=$|/|[${STOP}])((?:/[^${STOP}]*)?)`, 'g')
  // A rest token starts a word: never right after a `/` (another path's segment
  // sits in front of it: `docs/_shared/wiki/index.md`, `https://h/x.md`) — except
  // `$W/`, `${W}/` or `{W}/` where W was assigned a mention of the named directory.
  const BOUND_L = "(?:^|[\\s'\"`=(])"
  const BOUND_R = "(?=$|[\\s'\"`/);,:|&<>])"
  // `W=…<mention>` / `W = os.path.expanduser('<mention>`: the text before the
  // mention on its line ends in an assignment with no space, `;`, `&` or `|` after `=`.
  const assignRe = /(?:^|[\s;&|(])(?:export\s+|local\s+|readonly\s+)?([A-Za-z_]\w*)\s*=\s*[^\s;&|]*$/
  for (const cmd of commands) {
    const named = new Set()
    const vars = new Map() // named directory key → names of variables assigned it
    for (const m of cmd.matchAll(mentionRe)) {
      const k = containmentKey(path.join(prdt, ...m[1].split('/').filter(Boolean)), true)
      if (k !== prdtKey && !k.startsWith(prdtKey + path.sep)) continue // `..` out of ~/.prdt names nothing
      named.add(k)
      const a = assignRe.exec(cmd.slice(cmd.lastIndexOf('\n', m.index) + 1, m.index))
      if (a) vars.set(k, new Set([...(vars.get(k) || []), a[1]]))
    }
    for (const w of wanted) {
      if (out.has(w.key)) continue
      for (const n of named) {
        if (w.key === n) {
          out.add(w.key)
          break
        }
        if (!w.key.startsWith(n + path.sep)) continue
        // The rest of the drift path below the named directory, in its true case.
        const depth = w.key.slice(n.length + 1).split(path.sep).length
        if (depth > w.segs.length) continue
        const rest = w.segs.slice(-depth).join('/')
        const viaVar = [...(vars.get(n) || [])].map((v) => `(?:\\$${v}|\\$?\\{${v}\\})/`)
        if (new RegExp(`(?:${[BOUND_L, ...viaVar].join('|')})` + esc(rest) + BOUND_R).test(cmd)) {
          out.add(w.key)
          break
        }
      }
    }
  }
  return out
}

/**
 * The file text a Claude Edit/MultiEdit left: `original` with the tool result's
 * `structuredPatch` hunks (jsdiff shape: `oldStart` 1-based, `lines` tagged ' ',
 * '-', '+', '\\'). Every context and removed line must match `original` at the
 * hunk's place, else `undefined` — a patch that does not apply derives nothing.
 */
function applyStructuredPatch(original, hunks) {
  if (typeof original !== 'string' || !Array.isArray(hunks)) return undefined
  const orig = original.match(/[^\n]*\n|[^\n]+$/g) || []
  const body = (l) => (l.endsWith('\n') ? l.slice(0, -1) : l)
  const out = []
  let pos = 0
  for (const h of hunks) {
    if (!h || !Array.isArray(h.lines) || !Number.isInteger(h.oldStart)) return undefined
    const at = (start) => {
      if (start < pos || start > orig.length) return null
      const o = []
      let p = start
      for (let i = 0; i < h.lines.length; i++) {
        const l = h.lines[i]
        if (typeof l !== 'string' || l.length === 0) return null
        const text = l.slice(1)
        if (l[0] === ' ' || l[0] === '-') {
          if (p >= orig.length || body(orig[p]) !== text) return null
          if (l[0] === ' ') o.push(orig[p])
          p++
        } else if (l[0] === '+') o.push(text + '\n')
        else if (l[0] === '\\') {
          if (h.lines[i - 1] && h.lines[i - 1][0] === '+') o[o.length - 1] = o[o.length - 1].slice(0, -1)
        } else return null
      }
      return { start, o, p }
    }
    const r = at(h.oldStart - 1) ?? (h.oldLines === 0 ? at(h.oldStart) : null)
    if (!r) return undefined
    out.push(...orig.slice(pos, r.start), ...r.o)
    pos = r.p
  }
  out.push(...orig.slice(pos))
  return out.join('')
}

/**
 * Is a drifted path covered by a report? Its own path was reported, or it is a
 * directory on the way to a reported path whose line changed only because that
 * write landed inside it: the reported path's DIRECT parent (an atomic rename's
 * mtime bump), or an ancestor that did not exist at the baseline (created by
 * that write's mkdir -p). Never a sibling, never a child of a reported path.
 */
function coveredByReport(p, reported, before) {
  if (reported.size === 0) return false
  const k = containmentKey(p, true)
  if (reported.has(k)) return true
  const existedBefore = before.detail.some((l) => l.startsWith(`${p}\t`) && !l.endsWith('\texists=false'))
  for (const r of reported) {
    if (path.dirname(r) === k) return true
    if (!existedBefore && r.startsWith(k + path.sep)) return true
  }
  return false
}

/** T-1134: the notice for drift a writer outside this run reported. Empty when none. */
function formatExternalNotice(external) {
  const paths = external.flatMap((d) => [...d.added, ...d.removed].map((l) => l.split('\t')[0]))
  if (paths.length === 0) return ''
  return (
    '\nT-450 notice: the real home changed during this run, written by a process OUTSIDE\n' +
    'this run — another session: `prdt` reported the write (external-write log), an agent\n' +
    'Edit/Write tool made it, or a shell write — another session\'s Bash command named the\n' +
    'path (Claude session transcript; content unchecked). NOT a failure:\n' +
    [...new Set(paths)].slice(0, 20).map((p) => `  ~ ${p}\n`).join('') +
    (paths.length > 20 ? `  … ${paths.length - 20} more\n` : '') +
    '\n'
  )
}

/** `verifyTripwire()` as a throw, for callers whose runner reads an exception. */
function assertTripwireClean(where, options = {}) {
  const result = verifyTripwire(options)
  if (result.ok) {
    if (result.notice) process.stdout.write(result.notice)
    if (!tripwireDisabled() && (options.consume ?? true)) {
      process.stdout.write(
        result.notice
          ? `T-450 real-home tripwire (${where}): real home unchanged by this run (the changes above were reported by other sessions).\n`
          : `T-450 real-home tripwire (${where}): real home unchanged across the run.\n`,
      )
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
  tripwireNameOnlySubtrees,
  tripwireSizeOnlyPaths,
  tripwireExcludedSubtrees,
  tripwireSurfaces,
  snapshotRealHome,
  diffSnapshots,
  formatDrift,
  tripwireDisabled,
  readArmedBaseline,
  armTripwire,
  verifyTripwire,
  assertTripwireClean,
  // T-1522 dev4: exported for replaying a past run's window against real transcripts.
  agentShellWritePaths,
}
