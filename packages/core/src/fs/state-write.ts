/**
 * stateWriteFileSync — the ONE symlink-safe writer for project-local state under
 * a trust root (T-848 S4; Node twin of the Python state-write helper).
 *
 * A cloned repository can commit `.prdt`, `meta.git`, `info`, or the target file
 * itself as a symlink to a file of the user's; a plain `fs.writeFileSync` /
 * `appendFileSync` follows it. Contract:
 *
 *  - `root` is the trust boundary (usually the project dir; it may itself be a
 *    link — it is realpath'd once). Every component BELOW root down to the file
 *    is checked with lstat: a symlink or non-directory component refuses.
 *    Missing directories are created one level at a time (never through a link).
 *  - An existing target must be a regular file with st_nlink <= 1; anything else
 *    refuses and the victim stays byte-identical (in place, a read-only file refuses too).
 *  - An existing target's mode is KEPT (fchmod on the temp for the atomic path,
 *    untouched for in-place / append). A new file gets `opts.mode` (umask applies).
 *  - Default is tmp + rename in the target's directory (O_EXCL|O_NOFOLLOW).
 *    `atomic: false` writes IN PLACE and never creates a temp file at all (so a
 *    swapped-in link can never leave one outside the root); `append: true` appends.
 *  - Node has no openat(): the chain is re-verified by realpath after the open and
 *    before any byte is written (in-place) / before the rename (atomic). Every error
 *    that a swapped-in link can cause (ELOOP, EEXIST, ENOTDIR, ENOENT, ...) is mapped
 *    to StateWriteRefused; genuine I/O errors (EACCES, ENOSPC, EROFS) still throw.
 *    A residual window between the last check and the write remains (no openat).
 */

import fs from 'fs'
import path from 'path'

export class StateWriteRefused extends Error {
  readonly reason: string
  constructor(reason: string) {
    super(`state write refused: ${reason}`)
    this.name = 'StateWriteRefused'
    this.reason = reason
  }
}

export interface StateWriteOpts {
  /** Mode for a NEW file (an existing file keeps its own). Default 0o644 (umask applies). */
  mode?: number
  /** Append instead of replace. */
  append?: boolean
  /** tmp+rename (default true). `false` = in-place truncate+write, no temp file. */
  atomic?: boolean
}

const NOFOLLOW = fs.constants.O_NOFOLLOW ?? 0
const TAMPER_CODES = new Set(['ELOOP', 'EEXIST', 'ENOTDIR', 'EMLINK', 'ENOENT', 'EISDIR', 'ENXIO'])

function refuseOn<T>(fn: () => T): T {
  try {
    return fn()
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code
    if (code && TAMPER_CODES.has(code)) throw new StateWriteRefused(code)
    throw err
  }
}

function lstatOrUndefined(p: string): fs.Stats | undefined {
  try {
    return fs.lstatSync(p)
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return undefined
    throw err
  }
}

function bestEffortUnlinkIfSame(p: string, fd: number): void {
  try {
    const a = fs.lstatSync(p)
    const b = fs.fstatSync(fd)
    if (a.ino === b.ino && a.dev === b.dev) fs.unlinkSync(p)
  } catch {
    /* gone or not ours */
  }
}

export function stateWriteFileSync(
  root: string,
  filePath: string,
  data: string | Uint8Array,
  opts: StateWriteOpts = {},
): void {
  const rootReal = fs.realpathSync(root)
  const abs = path.resolve(root, filePath)
  const rel = path.relative(path.resolve(root), abs)
  if (!rel || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
    throw new StateWriteRefused('outside')
  }
  const parts = rel.split(path.sep)
  const base = parts.pop() as string
  const dirRel = parts.join(path.sep)
  const dir = path.join(path.resolve(root), dirRel)
  const expectedDirReal = path.join(rootReal, dirRel)

  // 1. Directory chain: every component a real directory, never a link.
  let cur = path.resolve(root)
  for (const part of parts) {
    cur = path.join(cur, part)
    let st = lstatOrUndefined(cur)
    if (!st) {
      refuseOn(() => fs.mkdirSync(cur)) // never follows a link at its final component
      st = fs.lstatSync(cur)
    }
    if (st.isSymbolicLink() || !st.isDirectory()) throw new StateWriteRefused('dir')
  }

  const chainIntact = (): void => {
    let real: string
    try {
      real = fs.realpathSync(dir)
    } catch {
      throw new StateWriteRefused('race')
    }
    if (real !== expectedDirReal) throw new StateWriteRefused('race')
  }

  // 2. The existing target.
  const target = path.join(dir, base)
  const existing = lstatOrUndefined(target)
  if (existing && (existing.isSymbolicLink() || !existing.isFile() || existing.nlink > 1)) {
    throw new StateWriteRefused('file')
  }
  const sameAsExisting = (fst: fs.Stats): boolean =>
    !!existing && fst.ino === existing.ino && fst.dev === existing.dev
  const verifyFd = (fd: number): fs.Stats => {
    const fst = fs.fstatSync(fd)
    if (!fst.isFile() || fst.nlink > 1) throw new StateWriteRefused('file')
    if (existing && !sameAsExisting(fst)) throw new StateWriteRefused('race')
    return fst
  }
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf-8') : Buffer.from(data)

  // 3a. Append.
  if (opts.append) {
    const fd = refuseOn(() =>
      fs.openSync(
        target,
        fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT | NOFOLLOW,
        opts.mode ?? 0o644,
      ),
    )
    try {
      try {
        verifyFd(fd)
        chainIntact()
      } catch (err) {
        if (!existing) bestEffortUnlinkIfSame(target, fd)
        throw err
      }
      fs.writeSync(fd, buf)
    } finally {
      fs.closeSync(fd)
    }
    return
  }

  // 3b. In place: no temp file, nothing is truncated before every check passed.
  if (opts.atomic === false) {
    const flags = fs.constants.O_WRONLY | NOFOLLOW | (existing ? 0 : fs.constants.O_CREAT | fs.constants.O_EXCL)
    // A read-only existing file (0444) is left alone: refuse, never chmod it.
    const fd = refuseOn(() => {
      try {
        return fs.openSync(target, flags, opts.mode ?? 0o644)
      } catch (err) {
        const code = (err as NodeJS.ErrnoException)?.code
        if (existing && (code === 'EACCES' || code === 'EPERM')) throw new StateWriteRefused('readonly')
        throw err
      }
    })
    try {
      try {
        verifyFd(fd)
        chainIntact()
      } catch (err) {
        if (!existing) bestEffortUnlinkIfSame(target, fd)
        throw err
      }
      fs.ftruncateSync(fd, 0)
      fs.writeSync(fd, buf, 0, buf.length, 0)
    } finally {
      fs.closeSync(fd)
    }
    return
  }

  // 3c. Atomic: temp beside the target, never through a link, then rename over.
  const tmp = path.join(dir, `.${base}.prdt-${process.pid}-${Math.random().toString(36).slice(2)}`)
  const wfd = refuseOn(() =>
    fs.openSync(
      tmp,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | NOFOLLOW,
      existing ? 0o600 : (opts.mode ?? 0o644),
    ),
  )
  let renamed = false
  try {
    try {
      fs.writeSync(wfd, buf)
      if (existing) fs.fchmodSync(wfd, existing.mode & 0o7777) // keep the mode, umask-proof
    } finally {
      fs.closeSync(wfd)
    }
    chainIntact()
    const now = lstatOrUndefined(target)
    if (now && (now.isSymbolicLink() || !now.isFile() || now.nlink > 1)) throw new StateWriteRefused('race')
    refuseOn(() => fs.renameSync(tmp, target))
    renamed = true
  } finally {
    if (!renamed) {
      try {
        fs.unlinkSync(tmp)
      } catch {
        /* already gone */
      }
    }
  }
}
