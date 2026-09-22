/**
 * atomicWriteFileSync — the ONE symlink-safe tmp+rename primitive for TS
 * writers (T-656). Closes the class the wiki names
 * (`docs/wiki/fact--symlink-safe-writes.md`): a plain
 * `fs.writeFileSync(path + '.tmp', data); fs.renameSync(tmp, path)` opens the
 * fixed `<path>.tmp` name with a call that FOLLOWS an existing symlink there —
 * so anything that can plant `<path>.tmp` as a symlink to a file this uid can
 * write gets that file clobbered with the payload the instant this code path
 * fires, and `renameSync` then consumes the symlink with no trace left.
 *
 * Recipe (same guarantee as the Python `atomic_write` in
 * prdt-post-dispatch.sh / prdt-return-check.sh, T-647 precedent): open the
 * temp name with O_CREAT|O_EXCL (Node's `'wx'` flag) — POSIX guarantees this
 * FAILS rather than follows an existing symlink there (broken or not). On
 * EEXIST, unlink once (our own leftover from a killed run, or a planted
 * link — either way the unlink removes the link ENTRY, never the target it
 * points at, and is never itself a follow) and retry exactly once; a second
 * EEXIST is a real race and surfaces as a thrown error rather than looping.
 * Only then write and rename onto the destination.
 */

import fs from 'fs'

export function atomicWriteFileSync(filePath: string, data: string, opts?: { mode?: number }): void {
  const tmp = filePath + '.tmp'
  const mode = opts?.mode
  let fd: number
  try {
    fd = mode !== undefined ? fs.openSync(tmp, 'wx', mode) : fs.openSync(tmp, 'wx')
  } catch (e: any) {
    if (e?.code !== 'EEXIST') throw e
    fs.unlinkSync(tmp) // our own stale leftover, or a planted symlink — gone unopened either way
    fd = mode !== undefined ? fs.openSync(tmp, 'wx', mode) : fs.openSync(tmp, 'wx') // a second failure is real — let it throw
  }
  try {
    fs.writeSync(fd, data)
  } finally {
    fs.closeSync(fd)
  }
  fs.renameSync(tmp, filePath)
}
