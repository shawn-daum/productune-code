/**
 * `prdt env check <file> [KEY ...]` (T-677 S1) — a value-free credential
 * presence probe. Sole reason it exists: "did the key get in?" was answered,
 * before this, by printing the raw line — the incident quoted in T-677
 * (CONFLUENCE_API_TOKEN's first 80 chars hit the screen and this session's
 * own record). This CLI answers the same question with presence + length
 * only. Every test here runs the REAL CLI as a subprocess (never imports the
 * parser in-process) and asserts, on the combined stdout+stderr of every
 * single case, that no 4-or-more-character window of any fixture secret
 * value ever appears — the ticket's own bar, not a paraphrase of it.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const PYTHON3 = which('python3')

let sandbox: string

function run(args: string[]): { out: string; code: number } {
  try {
    const out = execFileSync(PYTHON3 as string, [PRDT_CLI, ...args], {
      cwd: sandbox,
      env: { ...process.env, PRDT_HOME: path.join(sandbox, 'home'), CI: '1' },
      encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: subprocessTimeout('cli'),
    })
    return { out, code: 0 }
  } catch (e: any) {
    return { out: (e.stdout || '') + (e.stderr || ''), code: e.status ?? 1 }
  }
}

function writeFixture(name: string, content: string): string {
  const p = path.join(sandbox, name)
  fs.writeFileSync(p, content, 'utf-8')
  return p
}

/** Every fixture secret value ANY test in this file writes to disk. A 4-char
 * sliding window of each one must never appear in a case's combined output —
 * the acceptance bar verbatim, checked mechanically rather than eyeballed. */
const FOO_VALUE = 'bar1QzR7'
const EXPORTED_VALUE = 'exp0rtedT0ken9Fk3'
const DQUOTE_VALUE = 'doubleQuotedZk7Wp2'
const SQUOTE_VALUE = 'singleQuotedXm4Rt9'
const EQUALS_VALUE = 'part1=part2=part3XvQ'
const CRLF_VALUE = 'crlfTokenPq8Zn3'
const BOM_VALUE = 'bomGuardedRq9Xz2'
const MULTI_HEAD = 'nqzGt5Yhrp2Wc'
const MULTI_TAIL = 'hjkTps9CxZ1Fw'
// PEM fixture line that reads as a bare `KEY=` under the old str.splitlines()
// bug (base64-shaped, ends in `=`, no leak-check registration needed — the
// assertion that matters for it is its own absence as a printed key, below).
const PEM_LEAK_KEYLIKE = 'PQXHDGKQPTVWYZ'
const ALL_SECRETS = [
  FOO_VALUE, EXPORTED_VALUE, DQUOTE_VALUE, SQUOTE_VALUE, EQUALS_VALUE, CRLF_VALUE,
  BOM_VALUE, MULTI_HEAD, MULTI_TAIL,
]

function assertNoValueLeak(output: string) {
  for (const v of ALL_SECRETS) {
    for (let i = 0; i + 4 <= v.length; i++) {
      const chunk = v.slice(i, i + 4)
      expect(output).not.toContain(chunk)
    }
  }
}

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-env-check-'))
})

afterEach(() => {
  fs.rmSync(sandbox, { recursive: true, force: true })
})

describe.skipIf(!PYTHON3)('prdt env check (T-677 S1)', () => {
  test('a set key: presence + raw length, exit 0, and the value itself never reaches stdout/stderr', () => {
    const file = writeFixture('.env.fixture', `# a comment\n\nFOO=${FOO_VALUE}\n`)
    const { out, code } = run(['env', 'check', file, 'FOO'])
    expect(code).toBe(0)
    expect(out).toContain(`FOO  set  len=${FOO_VALUE.length}`)
    assertNoValueLeak(out)
  })

  test('a leading `export ` is stripped before the key is read', () => {
    const file = writeFixture('.env.fixture', `export EXPORTED=${EXPORTED_VALUE}\n`)
    const { out, code } = run(['env', 'check', file, 'EXPORTED'])
    expect(code).toBe(0)
    expect(out).toContain(`EXPORTED  set  len=${EXPORTED_VALUE.length}`)
    assertNoValueLeak(out)
  })

  test('a double-quoted value has its quotes stripped before length is measured', () => {
    const file = writeFixture('.env.fixture', `DQ="${DQUOTE_VALUE}"\n`)
    const { out, code } = run(['env', 'check', file, 'DQ'])
    expect(code).toBe(0)
    expect(out).toContain(`DQ  set  len=${DQUOTE_VALUE.length}`)
    assertNoValueLeak(out)
  })

  test('a single-quoted value has its quotes stripped before length is measured', () => {
    const file = writeFixture('.env.fixture', `SQ='${SQUOTE_VALUE}'\n`)
    const { out, code } = run(['env', 'check', file, 'SQ'])
    expect(code).toBe(0)
    expect(out).toContain(`SQ  set  len=${SQUOTE_VALUE.length}`)
    assertNoValueLeak(out)
  })

  test('only the first `=` splits key from value — later `=` characters stay in the value', () => {
    const file = writeFixture('.env.fixture', `EQ=${EQUALS_VALUE}\n`)
    const { out, code } = run(['env', 'check', file, 'EQ'])
    expect(code).toBe(0)
    expect(out).toContain(`EQ  set  len=${EQUALS_VALUE.length}`)
    assertNoValueLeak(out)
  })

  test('CRLF line endings parse the same as LF', () => {
    const file = path.join(sandbox, '.env.crlf')
    fs.writeFileSync(file, `CRLF_KEY=${CRLF_VALUE}\r\nOTHER=x\r\n`, 'utf-8')
    const { out, code } = run(['env', 'check', file, 'CRLF_KEY'])
    expect(code).toBe(0)
    expect(out).toContain(`CRLF_KEY  set  len=${CRLF_VALUE.length}`)
    assertNoValueLeak(out)
  })

  test('a key present with an empty value reports empty and exits 2', () => {
    const file = writeFixture('.env.fixture', `EMPTY_KEY=\n`)
    const { out, code } = run(['env', 'check', file, 'EMPTY_KEY'])
    expect(code).toBe(2)
    expect(out).toContain('EMPTY_KEY  empty')
    assertNoValueLeak(out)
  })

  // ── QA re-grill S1 fix2 (PO decision): an absent KEY is never echoed by
  // text, matching the key pattern or not — reported by position only
  // (`#N  absent`, N = its 1-based position among the KEY arguments).

  test('a key absent from the file reports absent by position (never by its own text) and exits 1', () => {
    const file = writeFixture('.env.fixture', `FOO=${FOO_VALUE}\n`)
    const { out, code } = run(['env', 'check', file, 'MISSING_KEY'])
    expect(code).toBe(1)
    expect(out).toContain('#1  absent')
    expect(out).not.toContain('MISSING_KEY')
    assertNoValueLeak(out)
  })

  test('an identifier-shaped secret-like argument absent from the file never appears in stdout/stderr', () => {
    const file = writeFixture('.env.fixture', `FOO=${FOO_VALUE}\n`)
    const secretLikeArg = 'AKIAEXAMPLETOKENVALUE1' // shaped like a real credential, not present in the file
    const { out, code } = run(['env', 'check', file, secretLikeArg])
    expect(code).toBe(1)
    expect(out).toContain('#1  absent')
    expect(out).not.toContain(secretLikeArg)
    assertNoValueLeak(out)
  })

  test('several KEYs in one call print one line each, and the exit code is the worst of the individual codes', () => {
    const file = writeFixture('.env.fixture', `FOO=${FOO_VALUE}\nEMPTY_KEY=\n`)
    const { out, code } = run(['env', 'check', file, 'FOO', 'EMPTY_KEY', 'MISSING_KEY'])
    expect(out).toContain(`FOO  set  len=${FOO_VALUE.length}`)
    expect(out).toContain('EMPTY_KEY  empty')
    expect(out).toContain('#3  absent')
    expect(out).not.toContain('MISSING_KEY')
    // absent(1) and empty(2) both present — worst (max) of {1,2} is 2
    expect(code).toBe(2)
    assertNoValueLeak(out)
  })

  test('mixed present/absent/invalid KEY arguments print in argument order with the right forms, exit codes unchanged', () => {
    const file = writeFixture('.env.fixture', `FOO=${FOO_VALUE}\n`)
    const secretLikeArg = 'AKIAEXAMPLETOKENVALUE1'
    const invalidArg = 'not a valid key name!!'
    const { out, code } = run(['env', 'check', file, 'FOO', secretLikeArg, invalidArg])
    const lines = out.trim().split('\n')
    expect(lines).toEqual([
      `FOO  set  len=${FOO_VALUE.length}`,
      '#2  absent',
      'KEY#3  invalid-key-argument',
    ])
    expect(out).not.toContain(secretLikeArg)
    expect(out).not.toContain(invalidArg)
    // worst of {0 (FOO set), 1 (absent), 3 (invalid-key-argument)} is 3
    expect(code).toBe(3)
    assertNoValueLeak(out)
  })

  test('two KEYs, one absent one set: exit code is the absent case (1), no empty key involved', () => {
    const file = writeFixture('.env.fixture', `FOO=${FOO_VALUE}\n`)
    const { out, code } = run(['env', 'check', file, 'FOO', 'MISSING_KEY'])
    expect(code).toBe(1)
    assertNoValueLeak(out)
  })

  test('omitting KEY entirely lists every key in the file with presence + length, exit 0', () => {
    const file = writeFixture(
      '.env.fixture',
      `# comment\nFOO=${FOO_VALUE}\nEMPTY_KEY=\nexport EXPORTED=${EXPORTED_VALUE}\n`,
    )
    const { out, code } = run(['env', 'check', file])
    expect(code).toBe(0)
    expect(out).toContain(`FOO  set  len=${FOO_VALUE.length}`)
    expect(out).toContain('EMPTY_KEY  empty')
    expect(out).toContain(`EXPORTED  set  len=${EXPORTED_VALUE.length}`)
    assertNoValueLeak(out)
  })

  test('blank lines and `#` comment lines are ignored, never surfaced as keys', () => {
    const file = writeFixture('.env.fixture', `\n   \n# a whole comment line\nFOO=${FOO_VALUE}\n`)
    const { out, code } = run(['env', 'check', file])
    expect(code).toBe(0)
    expect(out.trim().split('\n').filter((l) => l.includes('  set  ') || l.includes('  empty')).length).toBe(1)
  })

  test('a nonexistent file prints a message and exits 3, without ever reading a value', () => {
    const file = path.join(sandbox, 'does-not-exist.env')
    const { out, code } = run(['env', 'check', file, 'ANY'])
    expect(code).toBe(3)
    expect(out.length).toBeGreaterThan(0)
    assertNoValueLeak(out)
  })

  test('the probe itself is not denied or altered by anything else in the CLI — plain exit codes and text only', () => {
    const file = writeFixture('.env.fixture', `FOO=${FOO_VALUE}\n`)
    const { out, code } = run(['env', 'check', file, 'FOO'])
    expect(code).toBe(0)
    expect(out).not.toMatch(/denied|blocked/i)
  })

  // ── QA grill S1: open-quote continuation, \n-only splitting ──────────────
  // Root cause was `_env_parse_file` using str.splitlines() with no
  // open-quote tracking: a value's continuation line got reparsed as its own
  // `KEY=` line, and list mode printed that fabricated key — leaking value
  // bytes as a key NAME rather than as a value.

  test('a dotenv multi-line quoted value keeps its continuation line out of key position (open quote spans lines)', () => {
    const file = writeFixture('.env.multiline', `MULTI="${MULTI_HEAD}\nLEAK_TAIL_KEY=${MULTI_TAIL}"\n`)
    const { out, code } = run(['env', 'check', file])
    expect(code).toBe(0)
    const expectedLen = MULTI_HEAD.length + 1 + 'LEAK_TAIL_KEY='.length + MULTI_TAIL.length
    expect(out).toContain(`MULTI  set  len=${expectedLen}`)
    // the fabricated "key" the old bug read out of the value's continuation
    // line must never appear as its own output line
    expect(out).not.toContain('LEAK_TAIL_KEY')
    assertNoValueLeak(out)
  })

  test('a PEM-shaped multi-line value (base64 line ending in `=`) is not re-parsed as its own KEY=', () => {
    const file = writeFixture(
      '.env.pem',
      `PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n${PEM_LEAK_KEYLIKE}=\n-----END PRIVATE KEY-----"\n`,
    )
    const { out, code } = run(['env', 'check', file])
    expect(code).toBe(0)
    expect(out).toContain('PRIVATE_KEY  set  len=')
    // a base64 line ending in `=` reads as valid KEY= syntax on its own —
    // the old bug printed it as its own (empty-valued) key
    expect(out).not.toContain(PEM_LEAK_KEYLIKE)
    assertNoValueLeak(out)
  })

  const SPLITLINES_ONLY_SEPARATORS: Array<[string, string]> = [
    ['bare CR', '\r'],
    ['vertical tab (\\x0b)', '\x0b'],
    ['form feed (\\x0c)', '\x0c'],
    ['file separator (\\x1c)', '\x1c'],
    ['group separator (\\x1d)', '\x1d'],
    ['record separator (\\x1e)', '\x1e'],
    ['NEL (U+0085)', '\u0085'],
    ['line separator (U+2028)', ' '],
    ['paragraph separator (U+2029)', ' '],
  ]

  test.each(SPLITLINES_ONLY_SEPARATORS)(
    'a value containing a %s is never split into a new KEY= line — only literal `\\n` (and CRLF) end a line',
    (name, sep) => {
      const leakKey = `LEAKSEP_${name.replace(/[^A-Za-z0-9]/g, '').toUpperCase()}`
      const file = path.join(sandbox, '.env.sep')
      fs.writeFileSync(file, `K_HOLDER=headPartAB1${sep}${leakKey}=tailPartCD2\n`, 'utf-8')
      const { out, code } = run(['env', 'check', file])
      expect(code).toBe(0)
      expect(out).toContain('K_HOLDER  set  len=')
      expect(out).not.toContain(leakKey)
    },
  )

  // ── QA grill S2 (PO decision): caller-supplied text is never echoed ──────

  test('an invalid KEY argument (does not match the key pattern) is reported by position, never echoed', () => {
    const file = writeFixture('.env.fixture', `FOO=${FOO_VALUE}\n`)
    const pastedValue = 'sk-live-9Kx2ZmQ7abcdEFGH' // shaped like a pasted secret, not a key
    const { out, code } = run(['env', 'check', file, pastedValue])
    expect(code).toBe(3)
    expect(out).toContain('KEY#1  invalid-key-argument')
    expect(out).not.toContain(pastedValue)
  })

  test('an invalid KEY argument among valid ones is reported by position without disturbing the others', () => {
    const file = writeFixture('.env.fixture', `FOO=${FOO_VALUE}\n`)
    const pastedValue = 'not a valid key name!!'
    const { out, code } = run(['env', 'check', file, 'FOO', pastedValue])
    expect(out).toContain(`FOO  set  len=${FOO_VALUE.length}`)
    expect(out).toContain('KEY#2  invalid-key-argument')
    expect(out).not.toContain(pastedValue)
    expect(code).toBe(3)
    assertNoValueLeak(out)
  })

  test('a file-read error never echoes the given path text either', () => {
    const distinctiveDirName = 'sHouldNotAppearInOutput9fK2'
    const file = path.join(sandbox, distinctiveDirName, 'does-not-exist.env')
    const { out, code } = run(['env', 'check', file, 'ANY'])
    expect(code).toBe(3)
    expect(out).toContain('cannot read the given file')
    expect(out).not.toContain(distinctiveDirName)
    expect(out).not.toContain(file)
  })

  // ── QA grill S3: a closed downstream reader must not crash the probe ─────

  test('a closed stdout (e.g. `| head -c 1`) ends quietly with a documented exit code, no traceback', () => {
    // large enough to overflow the OS pipe buffer well before `head -c 1`
    // finishes reading its one byte and closes — otherwise the writer never
    // sees EPIPE and the regression can't reproduce
    const lines = Array.from({ length: 20000 }, (_, i) => `BULK_KEY_${i}=${FOO_VALUE}${i}`).join('\n')
    const file = writeFixture('.env.bulk', lines + '\n')
    const shellCmd = `set -o pipefail; "${PYTHON3}" "${PRDT_CLI}" env check "${file}" 2>&1 | head -c 1; echo; echo "PRDT_EXIT:$?"`
    const out = execFileSync('bash', ['-c', shellCmd], {
      cwd: sandbox,
      env: { ...process.env, PRDT_HOME: path.join(sandbox, 'home'), CI: '1' },
      encoding: 'utf-8', timeout: subprocessTimeout('cli'),
    })
    const m = out.match(/PRDT_EXIT:(\d+)/)
    expect(m).toBeTruthy()
    const exitCode = Number(m![1])
    expect([0, 1, 2, 3]).toContain(exitCode)
    expect(out).not.toMatch(/traceback/i)
    expect(out).not.toMatch(/BrokenPipeError/i)
    assertNoValueLeak(out)
  })

  // ── QA grill S4: a UTF-8 BOM must not hide the first key ─────────────────

  test('a UTF-8 BOM at the start of the file does not hide the first key', () => {
    const file = path.join(sandbox, '.env.bom')
    fs.writeFileSync(file, Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(`BOM_KEY=${BOM_VALUE}\n`, 'utf-8'),
    ]))
    const { out: keyOut, code: keyCode } = run(['env', 'check', file, 'BOM_KEY'])
    expect(keyCode).toBe(0)
    expect(keyOut).toContain(`BOM_KEY  set  len=${BOM_VALUE.length}`)
    assertNoValueLeak(keyOut)

    const { out: listOut, code: listCode } = run(['env', 'check', file])
    expect(listCode).toBe(0)
    expect(listOut).toContain(`BOM_KEY  set  len=${BOM_VALUE.length}`)
    assertNoValueLeak(listOut)
  })
})
