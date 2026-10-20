/**
 * real-home-write-journal.cjs — T-1134. WHO wrote, for the T-450 tripwire.
 *
 * The tripwire compares the real home's fingerprint at run start and end. That
 * says THAT something changed, never WHO — and many sessions share this machine:
 * another session's `prdt feedback record` writes `~/.prdt/wiki/feedback.md`
 * mid-run and reddened a green suite three times (2026-10-14).
 *
 * The attribution is mechanical and run-scoped, not a path allowlist: every
 * realm of the run (vitest worker, node child, worker_thread — the realms
 * `isolation-realm-bootstrap.cjs` already reaches) records its own writes to a
 * journal keyed by the run id (`PRODUCTUNE_TRIPWIRE_RUN`, inherited by every
 * child). A drifted path with a journal record is the suite's; one without is a
 * process outside the run, reported as a notice. A test writing `~/.prdt/wiki/
 * feedback.md` itself is journalled and still fails.
 *
 * Two record kinds:
 *   - fs: a patched fs write/remove/rename call whose target is inside the real
 *     home. Covers every JS realm of the run.
 *   - child-ref: a spawned child whose argv/command names a real-home path. The
 *     child's own writes are invisible to us (a shell, python), so every drift
 *     at or under that path is attributed to the suite — the fail-closed side.
 *
 * KNOWN BOUNDARY: a write through a route neither patched nor named in a
 * child's argv (a native addon, a child that derives the real home on its own)
 * is attributed as external and only noticed. Detecting those needs an
 * OS-level writer pid (root), which no non-privileged process has.
 */

'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { containmentKey, realHome } = require('./isolation-rules.cjs')

const BASELINE_DIR = path.join(os.tmpdir(), 'productune-tripwire')
const INSTALLED = Symbol.for('productune.realHomeWriteJournal')

// Captured before patching so recording never recurses into itself.
const rawAppend = fs.appendFileSync

function journalFile() {
  const id = process.env.PRODUCTUNE_TRIPWIRE_RUN
  return id ? path.join(BASELINE_DIR, `${id}.writes`) : undefined
}

function insideHome(p) {
  const h = containmentKey(realHome())
  const k = containmentKey(p)
  return k === h || k.startsWith(h + path.sep)
}

function record(kind, target) {
  try {
    const file = journalFile()
    if (!file || target === undefined || target === null) return
    let p = target
    if (Buffer.isBuffer(p)) p = p.toString()
    if (p instanceof URL) p = p.pathname
    if (typeof p !== 'string' || !p || !insideHome(p)) return
    rawAppend(file, `${kind}\t${path.resolve(p)}\n`)
  } catch {
    /* the journal must never be the thing that breaks a test */
  }
}

const WRITE_FLAG = /[wa+]/

// [function name, argument indexes holding paths]. Sync, callback and promise
// forms share names; `open` is conditional on its flags.
const PATH_ARGS = {
  writeFile: [0], appendFile: [0], createWriteStream: [0], truncate: [0],
  rm: [0], unlink: [0], rmdir: [0], mkdir: [0], mkdtemp: [0],
  rename: [0, 1], copyFile: [1], cp: [1], symlink: [1], link: [1],
  utimes: [0], chmod: [0], chown: [0], lchown: [0], lutimes: [0], lchmod: [0],
}

function wrap(obj, name, idxs, conditional) {
  const original = obj[name]
  if (typeof original !== 'function') return
  const wrapper = function (...args) {
    if (!conditional || WRITE_FLAG.test(String(args[1] ?? 'r'))) {
      for (const i of idxs) record('fs', args[i])
    }
    return original.apply(this, args)
  }
  for (const key of Reflect.ownKeys(original)) {
    if (key === 'length' || key === 'name' || key === 'prototype') continue
    try {
      Object.defineProperty(wrapper, key, Object.getOwnPropertyDescriptor(original, key))
    } catch {
      /* not load-bearing */
    }
  }
  obj[name] = wrapper
}

function installWriteJournal() {
  const g = globalThis
  if (g[INSTALLED]) return
  g[INSTALLED] = true
  const fsp = require('fs/promises')
  for (const [name, idxs] of Object.entries(PATH_ARGS)) {
    wrap(fs, name, idxs)
    wrap(fs, `${name}Sync`, idxs)
    wrap(fsp, name, idxs)
  }
  wrap(fs, 'open', [0], true)
  wrap(fs, 'openSync', [0], true)
  wrap(fsp, 'open', [0], true)
}

/**
 * Called by the child_process wrappers: a child whose argv or shell command
 * contains a real-home path may write there with code we cannot observe.
 */
function noteChildRealHomeRef(file, args) {
  try {
    if (!journalFile()) return
    const h = realHome()
    const parts = [String(file ?? ''), ...(Array.isArray(args) ? args.map(String) : [])]
    const hay = parts.join('\0')
    if (!hay.includes(h)) return
    for (const part of parts) {
      for (const m of part.matchAll(new RegExp(h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^\\s\'"\\0]*', 'g'))) {
        record('child-ref', m[0])
      }
    }
  } catch {
    /* never break a spawn */
  }
}

/** The recorded paths of a run, or [] when there is no journal. */
function readJournal(runId = process.env.PRODUCTUNE_TRIPWIRE_RUN) {
  try {
    if (!runId) return []
    const text = fs.readFileSync(path.join(BASELINE_DIR, `${runId}.writes`), 'utf-8')
    return text.split('\n').filter(Boolean).map((l) => l.split('\t')[1])
  } catch {
    return []
  }
}

function journalPath(runId = process.env.PRODUCTUNE_TRIPWIRE_RUN) {
  return runId ? path.join(BASELINE_DIR, `${runId}.writes`) : undefined
}

/** True when a journalled path is, contains, or sits under `p`. */
function attributedToSuite(p, journal) {
  const k = containmentKey(p)
  return journal.some((j) => {
    const jk = containmentKey(j)
    return jk === k || k.startsWith(jk + path.sep) || jk.startsWith(k + path.sep)
  })
}

module.exports = { installWriteJournal, noteChildRealHomeRef, readJournal, journalPath, attributedToSuite }
