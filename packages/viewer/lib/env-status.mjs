// viewer/lib/env-status.mjs — T-958 (T-956 = A): which env keys a line's code
// folder has set or empty. Key NAMES and one boolean per key only.
//
// Secrets (contracts §Secrets): an env file is read as raw bytes and scanned
// in place. A value's bytes are never decoded into a string — only a key's
// bytes are (ASCII, matched against the key pattern), and a value contributes
// nothing but "has at least one byte". The buffer is zero-filled once
// scanned. The set/empty verdict mirrors `prdt env check`
// (packages/core/scripts/prdt `_env_parse_file`): `\n`-only line split, one
// trailing CR dropped, `#` comments, `export ` prefix, last occurrence wins,
// a quoted value read up to its closing quote (multi-line when the quote
// does not close on its own line).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/
/** `.env` and `.env.*` — the names prdt-secret-guard.sh treats as env files. */
export const ENV_FILE_RE = /^\.env(\..+)?$/
const QUOTES = new Set([0x22, 0x27])
const EXPORT = [0x65, 0x78, 0x70, 0x6f, 0x72, 0x74] // "export"

/** A sample file (`.env.example`): listed dim as 견본; its keys count as empty in the real files. */
export function isSampleEnvFile(name) {
  return name.endsWith('.example')
}

// Python str.strip()'s whitespace set (str.isspace), as UTF-8 byte
// sequences: \t \n \v \f \r, \x1c-\x1f, space, U+0085, U+00A0, U+1680,
// U+2000-U+200A, U+2028, U+2029, U+202F, U+205F, U+3000. A narrower set here
// leaves an open-quote line unparsed, and its continuation line then reads as
// a key — a value's bytes in a key name (T-958 QA).
function isAsciiWs(b) {
  return (b >= 0x09 && b <= 0x0d) || (b >= 0x1c && b <= 0x20)
}
function isWs2(b0, b1) {
  return b0 === 0xc2 && (b1 === 0x85 || b1 === 0xa0)
}
function isWs3(b0, b1, b2) {
  if (b0 === 0xe1) return b1 === 0x9a && b2 === 0x80
  if (b0 === 0xe2 && b1 === 0x80) return (b2 >= 0x80 && b2 <= 0x8a) || b2 === 0xa8 || b2 === 0xa9 || b2 === 0xaf
  if (b0 === 0xe2) return b1 === 0x81 && b2 === 0x9f
  return b0 === 0xe3 && b1 === 0x80 && b2 === 0x80
}
/** Byte length of the whitespace character starting at `i` (within [i, end)), else 0. */
function wsAt(buf, i, end) {
  if (i >= end) return 0
  if (isAsciiWs(buf[i])) return 1
  if (i + 2 <= end && isWs2(buf[i], buf[i + 1])) return 2
  if (i + 3 <= end && isWs3(buf[i], buf[i + 1], buf[i + 2])) return 3
  return 0
}
/** Byte length of the whitespace character ending at `end` (within [start, end)), else 0. */
function wsBefore(buf, start, end) {
  if (end <= start) return 0
  if (isAsciiWs(buf[end - 1])) return 1
  if (end - 2 >= start && isWs2(buf[end - 2], buf[end - 1])) return 2
  if (end - 3 >= start && isWs3(buf[end - 3], buf[end - 2], buf[end - 1])) return 3
  return 0
}
/** [a, b) with Python str.strip() whitespace removed from both ends. */
function strip(buf, a, b) {
  for (let n; (n = wsAt(buf, a, b)); ) a += n
  for (let n; (n = wsBefore(buf, a, b)); ) b -= n
  return [a, b]
}

/** [start, end) of each `\n`-separated line, one trailing CR excluded. */
function lineSpans(buf, from) {
  const out = []
  let s = from
  for (let i = from; i <= buf.length; i++) {
    if (i === buf.length || buf[i] === 0x0a) {
      let e = i
      if (e > s && buf[e - 1] === 0x0d) e--
      out.push([s, e])
      s = i + 1
    }
  }
  return out
}

/** Index of byte `b` in buf[from, to), else -1. */
function find(buf, b, from, to) {
  const i = buf.indexOf(b, from)
  return i !== -1 && i < to ? i : -1
}

const PLAIN_MARK = Buffer.from('# prdt:plain')

/** The marker line, exact bytes: only a space and a tab around it are ignored (the CR is already
 *  out of the span) — never the wider strip() set (NBSP, \x0b, \x1c, U+2028 ...). The CLI's
 *  `_env_is_marker_line` reads the same rule; anything else leaves the key a secret. */
function isMarker(buf, a, b) {
  while (a < b && (buf[a] === 0x20 || buf[a] === 0x09)) a++
  while (b > a && (buf[b - 1] === 0x20 || buf[b - 1] === 0x09)) b--
  return buf.compare(PLAIN_MARK, 0, PLAIN_MARK.length, a, b) === 0
}

/**
 * @param {Buffer} buf raw env-file bytes
 * @param {{ plainMarker?: boolean }} [opts] T-1121 B: read the machine store's
 *   `# prdt:plain` marker line (the line right above a key) as `plain: true`.
 * @returns {Array<{ name: string, set: boolean, plain?: boolean }>} key names in first-seen
 *   order; `set` = the last occurrence's value is non-empty; `plain` only when
 *   asked for and the last occurrence carries the marker.
 */
export function envKeyStatus(buf, opts = {}) {
  // at most ONE leading BOM is stripped (the CLI's `_env_is_marker_line` does the same): a second one makes line 1 no marker
  const bom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? 3 : 0
  const lines = lineSpans(buf, bom)
  const status = new Map()
  let li = 0
  let marker = false // the line just read is the plain marker
  while (li < lines.length) {
    const [ra, rb] = lines[li++]
    let [a, b] = strip(buf, ra, rb)
    if (a === b || buf[a] === 0x23) {
      marker = !!opts.plainMarker && a !== b && isMarker(buf, ra, rb)
      continue
    }
    const plain = marker
    marker = false
    if (b - a > EXPORT.length && EXPORT.every((c, k) => buf[a + k] === c) && (buf[a + 6] === 0x20 || buf[a + 6] === 0x09)) {
      a += EXPORT.length
      for (let n; (n = wsAt(buf, a, b)); ) a += n
    }
    const eq = find(buf, 0x3d, a, b)
    if (eq === -1) continue
    const [ks, ke] = strip(buf, a, eq)
    let key = ''
    for (let k = ks; k < ke; k++) {
      if (buf[k] >= 0x80) { key = ''; break }
      key += String.fromCharCode(buf[k])
    }
    if (!KEY_RE.test(key)) continue
    const v = eq + 1
    let set
    if (v < b && QUOTES.has(buf[v])) {
      const q = buf[v]
      const close = find(buf, q, v + 1, b)
      if (close !== -1) {
        set = close > v + 1
      } else {
        // Open quote: continuation lines joined by `\n` until one holds the
        // closing quote — any continuation line at all makes the value non-empty.
        let len = b - (v + 1)
        while (li < lines.length) {
          const [c, d] = lines[li++]
          len += 1
          const ci = find(buf, q, c, d)
          if (ci !== -1) { len += ci - c; break }
          len += d - c
        }
        set = len > 0
      }
    } else {
      set = v < b
    }
    status.set(key, { set, plain })
  }
  return [...status].map(([name, v]) => (opts.plainMarker && v.plain ? { name, set: v.set, plain: true } : { name, set: v.set }))
}

/** One env file's key list, or null when it cannot be read. The bytes are zero-filled before returning. */
function readEnvKeys(file, opts) {
  let buf
  try {
    buf = fs.readFileSync(file)
  } catch {
    return null
  }
  try {
    return envKeyStatus(buf, opts)
  } finally {
    buf.fill(0)
  }
}

/**
 * T-1109: the machine-scope store `<PRDT_HOME>/env/.env` — key names, one
 * set/empty boolean per key, whether it was saved as a plain value (T-1121 B:
 * `plain: true` only then), and whether a product-code file already sets the
 * same key non-empty (it wins; an EMPTY product-code value does not). Never a
 * value, never a length. A link at the directory or file reads as no store.
 * @param {string} home the tool home (PRDT_HOME or ~/.prdt)
 * @param {{ files: Array<{ sample: boolean, keys: Array<{ name: string, set: boolean }> }> } | null} productEnv collectEnv()'s result for the code folder
 * @returns {{ dir: string, keys: Array<{ name: string, set: boolean, codeWins: boolean, plain?: boolean }> }}
 */
export function collectMachineEnv(home, productEnv) {
  const dir = path.join(home, 'env')
  const file = path.join(dir, '.env')
  let keys = null
  try {
    if (!fs.lstatSync(dir).isSymbolicLink() && !fs.lstatSync(file).isSymbolicLink()) keys = readEnvKeys(file, { plainMarker: true })
  } catch {}
  const code = new Set()
  for (const f of (productEnv && productEnv.files) || []) if (!f.sample) for (const k of f.keys) if (k.set) code.add(k.name)
  return { dir: '~/.prdt/env', keys: (keys || []).map((k) => ({ name: k.name, set: k.set, codeWins: k.set && code.has(k.name), ...(k.plain && k.set ? { plain: true } : {}) })) }
}

/** The home line's code folder: config `code.dir` (relative, never climbing out), default `code`; the project root itself when that folder does not exist (a non-split project). */
export function homeEnvDir(repoRoot, cfg) {
  const d = cfg && typeof cfg.code === 'object' && cfg.code ? cfg.code.dir : undefined
  let rel = 'code'
  if (typeof d === 'string' && d.trim() && !path.isAbsolute(d.trim()) && !d.trim().split(/[/\\]+/).includes('..')) rel = d.trim()
  try {
    if (fs.statSync(path.join(repoRoot, rel)).isDirectory()) return rel
  } catch {}
  return '.'
}

/** An added line's code folder: its config entry's `code.dir` (relative, may climb out — release-lines.md §1); null when absent or absolute. */
export function lineEnvDir(cfg, line) {
  const entry = cfg && Array.isArray(cfg.products ?? cfg.lines) ? (cfg.products ?? cfg.lines).find((e) => e && typeof e === 'object' && e.name === line) : null
  const d = entry && typeof entry.code === 'object' && entry.code ? entry.code.dir : undefined
  return typeof d === 'string' && d.trim() && !path.isAbsolute(d.trim()) ? d.trim() : null
}

/**
 * The env files at the top of one code folder, real files first then
 * samples, each name-sorted. A real file's list also carries, as empty, every
 * sample key it lacks (screen set: 「견본에만 있는 키도 비어 있음」).
 * @param {string} repoRoot
 * @param {string | null} rel code folder relative to repoRoot
 * @returns {{ dir: string | null, files: Array<{ name: string, sample: boolean, keys: Array<{ name: string, set: boolean }> }> }}
 */
export function collectEnv(repoRoot, rel) {
  if (!rel) return { dir: null, files: [] }
  const abs = path.resolve(repoRoot, rel)
  let names
  try {
    names = fs.readdirSync(abs).filter((n) => {
      if (!ENV_FILE_RE.test(n)) return false
      try {
        return fs.statSync(path.join(abs, n)).isFile()
      } catch {
        return false
      }
    })
  } catch {
    return { dir: rel, files: [] }
  }
  // T-1191: the real folder, for the page's 경로 복사 · VS Code link (a path, never a value).
  let absDir = null
  try {
    absDir = fs.realpathSync(abs)
  } catch {}
  const read = []
  for (const name of names.sort()) {
    const keys = readEnvKeys(path.join(abs, name))
    if (keys) read.push({ name, sample: isSampleEnvFile(name), keys })
  }
  const sampleKeys = []
  for (const f of read) if (f.sample) for (const k of f.keys) if (!sampleKeys.includes(k.name)) sampleKeys.push(k.name)
  for (const f of read) {
    if (f.sample) continue
    const own = new Set(f.keys.map((k) => k.name))
    for (const k of sampleKeys) if (!own.has(k)) f.keys.push({ name: k, set: false })
  }
  return { dir: rel, absDir, files: [...read.filter((f) => !f.sample), ...read.filter((f) => f.sample)] }
}

/** T-1191: where VS Code is looked for — the two places a macOS app install lands. */
export const VSCODE_APPS = ['/Applications/Visual Studio Code.app', path.join(os.homedir(), 'Applications', 'Visual Studio Code.app')]

/** T-1191: whether VS Code is installed (the page then offers 「VS Code 로 열기」, its own `vscode://` scheme). */
export function detectVsCode(candidates = VSCODE_APPS) {
  return candidates.some((p) => {
    try {
      return fs.statSync(p).isDirectory()
    } catch {
      return false
    }
  })
}
