// T-1191: the project roots the prdt:// URL handler (packages/core/scripts/prdt_open_url.py) may open.
// Our own tooling records a root here — the viewer generator on every run — and the handler refuses
// any root not listed, so a dir a stranger planted with `.prdt/po-state.json` never counts as a project.
// File: $PRDT_HOME/run/open-roots, one realpath per line (run/ is tooling-owned; this module is the writer).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export function openRootsPath(home = process.env.PRDT_HOME || path.join(os.homedir(), '.prdt')) {
  return path.join(home, 'run', 'open-roots')
}

/** Append `root`'s realpath once. Never follows a symlink at the list; best effort — returns whether it is recorded. */
export function recordOpenRoot(root, home) {
  try {
    const real = fs.realpathSync(root)
    if (real.includes('\n') || !fs.statSync(path.join(real, '.prdt', 'po-state.json')).isFile()) return false
    const file = openRootsPath(home)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    let have = ''
    try {
      if (fs.lstatSync(file).isSymbolicLink()) return false
      have = fs.readFileSync(file, 'utf8')
    } catch (e) {
      if (e.code !== 'ENOENT') return false
    }
    if (have.split('\n').includes(real)) return true
    const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT | fs.constants.O_NOFOLLOW, 0o600)
    try {
      fs.writeSync(fd, (have && !have.endsWith('\n') ? '\n' : '') + real + '\n')
    } finally {
      fs.closeSync(fd)
    }
    return true
  } catch {
    return false
  }
}
