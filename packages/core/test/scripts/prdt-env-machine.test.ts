/**
 * prdt-env-machine.test.ts — T-1109. The machine-scope env store
 * (`~/.prdt/env/.env`) and `prdt env set|unset|ls|run`. Every run is the REAL
 * CLI as a subprocess under a temp HOME/PRDT_HOME with FAKE keys; the bar is
 * the ticket's own: no value, no value fragment and no value length reaches
 * stdout, stderr, or the viewer HTML — and an agent-style call (no tty) never
 * writes the store.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawn, spawnSync, execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
const HOOK = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-secret-guard.sh')

// FAKE values only — a 4-char window of any must never appear in any output.
const V_TEAM = 'FAKEteamValue7391'
const V_SECRET = 'FAKEsecretZq84xk'
const V_CODE = 'FAKEproductCodeVal55'
const ALL_VALUES = [V_TEAM, V_SECRET, V_CODE]

let sandbox: string
let home: string
let prdtHome: string
let proj: string

const storePath = () => path.join(prdtHome, 'env', '.env')

beforeEach(() => {
  sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1109-')))
  home = path.join(sandbox, 'home')
  prdtHome = path.join(home, '.prdt')
  proj = path.join(sandbox, 'proj')
  fs.mkdirSync(home, { recursive: true })
  fs.mkdirSync(path.join(proj, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(proj, '.prdt', 'po-state.json'), JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.14', current_task: null }))
})
afterEach(() => { fs.rmSync(sandbox, { recursive: true, force: true }) })

const env = () => ({ ...process.env, HOME: home, PRDT_HOME: prdtHome, CI: '1', LANG: 'C.UTF-8' } as NodeJS.ProcessEnv)

function run(args: string[], opts: { cwd?: string; input?: string } = {}) {
  const r = spawnSync('python3', [PRDT_CLI, ...args], {
    cwd: opts.cwd ?? sandbox, env: env(), encoding: 'utf8', input: opts.input ?? '',
    timeout: subprocessTimeout('cli'),
  })
  return { out: (r.stdout || '') + (r.stderr || ''), stdout: r.stdout || '', code: r.status ?? -1 }
}

/** Drive the CLI under a real pty (the user's terminal). `mode`: `wait` types `typed` once the hidden
 * prompt is fully shown; `eager` types it the instant the first prompt byte arrives (ECHO must
 * already be off); `none` types nothing. */
const PTY_DRIVER = `
import os, pty, sys, select, time, json
args, typed, cwd, mode = json.loads(sys.argv[1]), sys.argv[2], sys.argv[3], sys.argv[4]
os.chdir(cwd)
pid, fd = pty.fork()
if pid == 0:
    os.execvp("python3", ["python3", ${JSON.stringify(PRDT_CLI)}] + args)
buf = b""
sent = mode == "none"
deadline = time.time() + 20
while time.time() < deadline:
    r, _, _ = select.select([fd], [], [], 0.05)
    if r:
        try:
            d = os.read(fd, 4096)
        except OSError:
            break
        if not d:
            break
        buf += d
        if not sent and mode == "eager" and args[-1].encode() in buf:
            os.write(fd, (typed + "\\n").encode())
            sent = True
        if not sent and mode == "wait" and "화면에 보이지".encode() in buf:
            time.sleep(0.2)
            os.write(fd, (typed + "\\n").encode())
            sent = True
_, status = os.waitpid(pid, 0)
sys.stdout.write(buf.decode("utf-8", "replace"))
sys.exit(os.waitstatus_to_exitcode(status))
`
const ptyArgs = (args: string[], typed: string, mode: string) => ['-c', PTY_DRIVER, JSON.stringify(args), typed, sandbox, mode]
function typeSet(key: string, typed: string, mode = 'wait') {
  const r = spawnSync('python3', ptyArgs(['env', 'set', key], typed, mode), { env: env(), encoding: 'utf8', timeout: subprocessTimeout('cli') * 2 })
  return { out: (r.stdout || '') + (r.stderr || ''), code: r.status ?? -1 }
}
function ttyUnset(key: string) {
  const r = spawnSync('python3', ptyArgs(['env', 'unset', key], '', 'none'), { env: env(), encoding: 'utf8', timeout: subprocessTimeout('cli') * 2 })
  return { out: (r.stdout || '') + (r.stderr || ''), code: r.status ?? -1 }
}
function typeSetAsync(key: string, typed: string): Promise<number> {
  return new Promise((resolve) => {
    const c = spawn('python3', ptyArgs(['env', 'set', key], typed, 'wait'), { env: env(), stdio: 'ignore' })
    c.on('exit', (code) => resolve(code ?? -1))
  })
}

function noLeak(out: string, win = 4, lengths = true) {
  for (const v of ALL_VALUES) for (let i = 0; i + win <= v.length; i++) expect(out).not.toContain(v.slice(i, i + win))
  if (lengths) for (const v of ALL_VALUES) expect(out).not.toContain(String(v.length))
}

function seedStore(lines: string) {
  fs.mkdirSync(path.dirname(storePath()), { recursive: true })
  fs.writeFileSync(storePath(), lines, { mode: 0o600 })
}
function seedProduct(lines: string) {
  fs.writeFileSync(path.join(proj, '.prdt', 'config.json'), JSON.stringify({ code: { dir: 'code' } }))
  fs.mkdirSync(path.join(proj, 'code'), { recursive: true })
  fs.writeFileSync(path.join(proj, 'code', '.env.local'), lines)
}

describe('env set — hidden prompt, terminal only', () => {
  test('saved: value typed at the hidden prompt is stored 0600, never echoed', () => {
    const r = typeSet('APPLE_TEAM_ID', V_TEAM)
    expect(r.code).toBe(0)
    expect(r.out).toContain('APPLE_TEAM_ID 의 값을 입력하세요 (화면에 보이지 않아요)')
    expect(r.out).toContain('APPLE_TEAM_ID 를 기기 범위에 저장했어요')
    expect(r.out).toContain('이 기기의 모든 프로젝트가 쓸 수 있어요.')
    noLeak(r.out)
    expect(fs.readFileSync(storePath(), 'utf8')).toBe(`APPLE_TEAM_ID='${V_TEAM}'\n`)
    expect(fs.statSync(storePath()).mode & 0o777).toBe(0o600)
    expect(fs.statSync(path.dirname(storePath())).mode & 0o777).toBe(0o700)
  })

  test('same key typed again replaces it; other keys stay', () => {
    seedStore(`OTHER_KEY='keepme'\nAPPLE_TEAM_ID='old'\n`)
    expect(typeSet('APPLE_TEAM_ID', V_TEAM).code).toBe(0)
    expect(fs.readFileSync(storePath(), 'utf8')).toBe(`OTHER_KEY='keepme'\nAPPLE_TEAM_ID='${V_TEAM}'\n`)
  })

  test('agent-initiated (stdin is a pipe, no tty): refused, nothing written, value not echoed', () => {
    const r = run(['env', 'set', 'APPLE_TEAM_ID'], { input: V_TEAM + '\n' })
    expect(r.code).toBe(1)
    expect(r.out).toContain('저장 실패: 값을 숨겨서 받을 수 있는 터미널이 아니에요. 저장한 키가 없어요.')
    expect(r.out).toContain('다음: 터미널에서 직접 실행하세요.')
    noLeak(r.out)
    expect(fs.existsSync(storePath())).toBe(false)
  })

  test('a value in argv is never accepted: extra argument → refused, nothing written, not echoed', () => {
    const r = run(['env', 'set', 'APPLE_TEAM_ID', V_TEAM])
    expect(r.code).toBe(2)
    noLeak(r.out)
    expect(fs.existsSync(storePath())).toBe(false)
  })

  test('a value passed where the key belongs is refused without echoing it', () => {
    const r = run(['env', 'set', V_TEAM])
    expect(r.code).toBe(1)
    expect(r.out).toContain('저장 실패: 키 이름이 맞지 않아요. 영문 대문자 · 숫자 · _ 만 쓸 수 있어요.')
    expect(r.out).toContain('다음: 키 이름을 고쳐 다시 실행하세요.')
    noLeak(r.out)
    expect(fs.existsSync(storePath())).toBe(false)
  })

  test('lowercase / dashed key name refused', () => {
    const r = run(['env', 'set', 'apple-team-id'])
    expect(r.code).toBe(1)
    expect(r.out).toContain('키 이름이 맞지 않아요')
    expect(r.out).not.toContain('apple-team-id')
  })

  test('empty value refused, nothing stored', () => {
    const r = typeSet('APPLE_TEAM_ID', '')
    expect(r.code).toBe(1)
    expect(r.out).toContain('저장 실패: 값이 비어 있어요. 저장한 키가 없어요.')
    expect(fs.existsSync(storePath())).toBe(false)
  })

  test('a value holding both quote kinds is refused without echo', () => {
    const r = typeSet('APPLE_TEAM_ID', `ab'cd"${V_TEAM}`)
    expect(r.code).toBe(1)
    expect(r.out).toContain('저장할 수 없는 문자')
    noLeak(r.out)
    expect(fs.existsSync(storePath())).toBe(false)
  })

  test('a symlinked store directory is refused, nothing written through it', () => {
    const victim = path.join(sandbox, 'victim')
    fs.mkdirSync(victim)
    fs.mkdirSync(prdtHome, { recursive: true })
    fs.symlinkSync(victim, path.join(prdtHome, 'env'))
    const r = typeSet('APPLE_TEAM_ID', V_TEAM)
    expect(r.code).not.toBe(0)
    expect(fs.readdirSync(victim)).toEqual([])
  })
})

describe('env unset · ls', () => {
  test('unset removes one key; removing the last removes the file', () => {
    seedStore(`SENTRY_DSN='${V_SECRET}'\nAPPLE_TEAM_ID='${V_TEAM}'\n`)
    const r = ttyUnset('SENTRY_DSN')
    expect(r.code).toBe(0)
    expect(r.out).toContain('SENTRY_DSN 을 기기 범위에서 지웠어요')
    noLeak(r.out)
    expect(fs.readFileSync(storePath(), 'utf8')).toBe(`APPLE_TEAM_ID='${V_TEAM}'\n`)
    expect(ttyUnset('APPLE_TEAM_ID').code).toBe(0)
    expect(fs.existsSync(storePath())).toBe(false)
  })

  test('unset of a missing key fails without echoing the typed token', () => {
    const r = ttyUnset('NO_SUCH_KEY')
    expect(r.code).toBe(1)
    expect(r.out).toContain('지우기 실패: 그 키가 기기 범위에 없어요. 지운 키가 없어요.')
    expect(r.out).toContain('다음: prdt env ls 로 키 이름을 확인하세요.')
    expect(r.out).not.toContain('NO_SUCH_KEY')
  })

  test('a key-shaped value typed where the key goes is never echoed (tty and no-tty)', () => {
    seedStore(`APPLE_TEAM_ID='${V_TEAM}'\n`)
    const shaped = 'FAKE_KEYSHAPED_TOKEN_Q7Z'
    for (const r of [ttyUnset(shaped), run(['env', 'unset', shaped]), run(['env', 'set', shaped])]) {
      expect(r.code).not.toBe(0)
      expect(r.out).not.toContain(shaped)
    }
    expect(fs.readFileSync(storePath(), 'utf8')).toBe(`APPLE_TEAM_ID='${V_TEAM}'\n`)
  })

  test('agent-initiated unset (no tty): refused, the stored key stays', () => {
    seedStore(`APPLE_TEAM_ID='${V_TEAM}'\n`)
    const r = run(['env', 'unset', 'APPLE_TEAM_ID'])
    expect(r.code).toBe(1)
    expect(r.out).toContain('지우기 실패: 터미널에서만 지울 수 있어요. 지운 키가 없어요.')
    expect(r.out).toContain('다음: 터미널에서 직접 실행하세요.')
    expect(fs.readFileSync(storePath(), 'utf8')).toBe(`APPLE_TEAM_ID='${V_TEAM}'\n`)
  })

  test('ls none', () => {
    const r = run(['env', 'ls'])
    expect(r.code).toBe(0)
    expect(r.out).toContain('기기 범위에 저장된 키가 없어요.')
    expect(r.out).toContain('다음: prdt env set <KEY> 로 저장하세요.')
  })

  test('ls listed: name · set/empty · scope only — no value, no length', () => {
    seedStore(`APPLE_TEAM_ID='${V_TEAM}'\nGOOGLE_OIDC_CLIENT_SECRET='${V_SECRET}'\nPUSH_CERT_PASSWORD=\n`)
    const r = run(['env', 'ls'])
    expect(r.code).toBe(0)
    expect(r.out).toContain('기기 범위 키 3개 · 설정됨 2 · 비어 있음 1')
    expect(r.out).toMatch(/APPLE_TEAM_ID\s+설정됨\s+기기 범위/)
    expect(r.out).toMatch(/PUSH_CERT_PASSWORD\s+비어 있음\s+기기 범위/)
    expect(r.out).toContain('PUSH_CERT_PASSWORD 는 값이 비어 있어요. 다음: prdt env set PUSH_CERT_PASSWORD 로 값을 저장하세요.')
    noLeak(r.out)
    expect(r.out).not.toMatch(/len=|길이/)
  })

  test('ls same name: product code value wins; empty product-code value does NOT win', () => {
    seedStore(`GOOGLE_OIDC_CLIENT_SECRET='${V_SECRET}'\nAPPLE_TEAM_ID='${V_TEAM}'\nEMPTY_IN_CODE='${V_TEAM}'\n`)
    seedProduct(`GOOGLE_OIDC_CLIENT_SECRET=${V_CODE}\nEMPTY_IN_CODE=\nPOSTGRES_USER=\n`)
    const r = run(['env', 'ls'], { cwd: proj })
    expect(r.code).toBe(0)
    expect(r.out).toContain('기기 범위 키 3개 · proj 제품 코드 키 3개 · 같은 이름 1개')
    expect(r.out).toMatch(/GOOGLE_OIDC_CLIENT_SECRET\s+설정됨\s+설정됨\s+제품 코드 값/)
    expect(r.out).toMatch(/APPLE_TEAM_ID\s+설정됨\s+—\s+기기 범위 값/)
    expect(r.out).toMatch(/EMPTY_IN_CODE\s+설정됨\s+비어 있음\s+기기 범위 값/)
    expect(r.out).toMatch(/POSTGRES_USER\s+—\s+비어 있음\s+값 없음/)
    expect(r.out).toContain('같은 이름 1개는 제품 코드 값을 써요. 기기 범위 값을 쓰려면 제품 코드 파일에서 그 키를 지우세요.')
    noLeak(r.out)
  })
})

describe('T-1110: set/unset keep every untouched line byte-for-byte', () => {
  // FAKE values a quote style cannot re-serialize: a PEM-like multi-line value and a tab value
  const PEM = '"-----BEGIN FAKE KEY-----\nFAKEpemLineOne\nFAKEpemLineTwo\n-----END FAKE KEY-----"'
  const head = Buffer.concat([
    Buffer.from(`# machine keys — kept as written\nexport EXPORTED_KEY=FAKEexportVal\nPEM_KEY=${PEM}\nTAB_KEY='FAKE\ttabVal'\n`, 'utf8'),
    Buffer.from([0x23, 0x20, 0xe9, 0x0a]), // a comment holding a byte that is not UTF-8
  ])
  const PROBE_PEM = ['python3', '-c', 'import os; print("PEM=" + str(os.environ.get("PEM_KEY") == "-----BEGIN FAKE KEY-----\\nFAKEpemLineOne\\nFAKEpemLineTwo\\n-----END FAKE KEY-----") + " TAB=" + str(os.environ.get("TAB_KEY") == "FAKE\\ttabVal"))']

  test('set of a new key, set of an existing key and unset touch only that key', () => {
    fs.mkdirSync(path.dirname(storePath()), { recursive: true })
    fs.writeFileSync(storePath(), Buffer.concat([head, Buffer.from(`APPLE_TEAM_ID='old'\nSENTRY_DSN='${V_SECRET}'\n`)]), { mode: 0o600 })
    expect(typeSet('NEW_KEY', V_CODE).code).toBe(0)
    expect(typeSet('APPLE_TEAM_ID', V_TEAM).code).toBe(0)
    expect(ttyUnset('SENTRY_DSN').code).toBe(0)
    expect(fs.readFileSync(storePath())).toEqual(Buffer.concat([head, Buffer.from(`APPLE_TEAM_ID='${V_TEAM}'\nNEW_KEY='${V_CODE}'\n`)]))
    const r = run(['env', 'run', '--', ...PROBE_PEM])
    expect(r.out).toContain('PEM=True TAB=True')
    expect(r.out).not.toContain('None')
  })

  test('set replacing a multi-line value keeps its export prefix and no stray continuation lines', () => {
    seedStore(`A_KEY=FAKEa\nexport PEM_KEY=${PEM}\nZ_KEY=FAKEz\n`)
    expect(typeSet('PEM_KEY', V_TEAM).code).toBe(0)
    expect(fs.readFileSync(storePath(), 'utf8')).toBe(`A_KEY=FAKEa\nexport PEM_KEY='${V_TEAM}'\nZ_KEY=FAKEz\n`)
  })

  test('unset of a multi-line key removes all its lines; a file with no final newline gains one only for an appended key', () => {
    seedStore(`PEM_KEY=${PEM}\nKEEP_KEY=FAKEkeep`)
    expect(ttyUnset('PEM_KEY').code).toBe(0)
    expect(fs.readFileSync(storePath(), 'utf8')).toBe('KEEP_KEY=FAKEkeep')
    expect(typeSet('NEW_KEY', V_CODE).code).toBe(0)
    expect(fs.readFileSync(storePath(), 'utf8')).toBe(`KEEP_KEY=FAKEkeep\nNEW_KEY='${V_CODE}'\n`)
  })
})

describe('T-1110: hidden prompt, permissions, lock, write failure', () => {
  test('ECHO is off before the prompt: a value typed the instant the prompt starts is never echoed', () => {
    const r = typeSet('APPLE_TEAM_ID', V_TEAM, 'eager')
    expect(r.code).toBe(0)
    noLeak(r.out)
    expect(fs.readFileSync(storePath(), 'utf8')).toBe(`APPLE_TEAM_ID='${V_TEAM}'\n`)
  })

  test('a pre-existing 0755 store directory is tightened to 0700 by set and by unset', () => {
    fs.mkdirSync(path.dirname(storePath()), { recursive: true, mode: 0o755 })
    fs.chmodSync(path.dirname(storePath()), 0o755)
    expect(typeSet('APPLE_TEAM_ID', V_TEAM).code).toBe(0)
    expect(fs.statSync(path.dirname(storePath())).mode & 0o777).toBe(0o700)
    fs.chmodSync(path.dirname(storePath()), 0o755)
    expect(ttyUnset('APPLE_TEAM_ID').code).toBe(0)
    expect(fs.statSync(path.dirname(storePath())).mode & 0o777).toBe(0o700)
  })

  test('concurrent sets are serialized: every key lands', async () => {
    seedStore(`# keep\n`)
    const keys = ['K_ONE', 'K_TWO', 'K_THREE', 'K_FOUR', 'K_FIVE', 'K_SIX']
    const codes = await Promise.all(keys.map((k, i) => typeSetAsync(k, `FAKEconc${i}`)))
    expect(codes).toEqual(keys.map(() => 0))
    const text = fs.readFileSync(storePath(), 'utf8')
    expect(text.startsWith('# keep\n')).toBe(true)
    keys.forEach((k, i) => expect(text).toContain(`${k}='FAKEconc${i}'\n`))
  }, subprocessTimeout('cli') * 6)

  test('a store write failure prints one line, no traceback, store unchanged', () => {
    seedStore(`APPLE_TEAM_ID='${V_TEAM}'\n`)
    fs.mkdirSync(storePath() + '.tmp') // the atomic temp name is taken by a directory → the write fails
    const r = typeSet('NEW_KEY', V_CODE)
    expect(r.code).toBe(3)
    expect(r.out).toMatch(/저장 실패: 기기 범위 env 저장소에 쓸 수 없어요 \([^)]+\)\. 저장한 키가 없어요\./)
    expect(r.out).not.toContain('Traceback')
    noLeak(r.out)
    expect(fs.readFileSync(storePath(), 'utf8')).toBe(`APPLE_TEAM_ID='${V_TEAM}'\n`)
  })
})

describe('T-1119: secret guard keeps only the direct paths; ordinary commands pass', () => {
  function verdict(c: string) {
    const r = spawnSync('bash', [HOOK], { input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: c } }), encoding: 'utf8', timeout: subprocessTimeout('hook') })
    return r.stdout
  }
  test.each([
    'git commit -m "fix: prdt env unset keeps untouched lines (T-1109)"',
    "git commit -m 'feat: prdt env set|unset|ls|run'",
    'grep -n "prdt env set" packages/core/scripts/prdt',
    'grep -rn "prdt env unset" docs/',
    "cat > /tmp/t.test.ts <<'EOF'\nrun(['env', 'unset', 'K'])\n// prdt env set K, prdt env run -- printenv\nEOF",
    'node -r dotenv/config server.js',
    'prdt env run -- node -r dotenv/config server.js',
    // the run child is no longer judged here: env run masks the stored values in its output
    'prdt env run -- printenv', 'prdt env run -- python3 -c "import os; print(os.environ)"', 'prdt env run -- node -e 1',
    'prdt env run -- sh ./scripts/dev.sh', 'echo $HOME env', 'prdt env ls',
  ])('not denied: %s', (c) => { expect(verdict(c)).not.toContain('"deny"') })
  test.each([
    'prdt env set X', '~/.prdt/bin/prdt env unset X', 'echo hi; prdt env set X',
  ])('a direct set/unset call is still denied with its own message: %s', (c) => {
    expect(verdict(c)).toContain('written only by the user own')
  })
})

describe('T-1119: env run masks every stored value in the child output', () => {
  const S = 'FAKEsecretZq84xk'
  const PEM = '-----BEGIN FAKE KEY-----\nFAKEpemLineOne\n-----END FAKE KEY-----'
  beforeEach(() => { seedStore(`APPLE_TEAM_ID='${V_TEAM}'\nSENTRY_DSN='${S}'\nPEM_KEY="${PEM}"\nBLANK=\n`) })
  const leaks = (out: string) => {
    for (const v of [V_TEAM, S, 'FAKEpemLineOne']) expect(out).not.toContain(v.slice(0, 6))
    for (const v of [V_TEAM, S]) expect(out).not.toContain(v.slice(-6))
  }

  test.each([
    ['printenv', ['printenv', 'APPLE_TEAM_ID']],
    ['python3 -c', ['python3', '-c', 'import os,sys; print(os.environ["APPLE_TEAM_ID"]); print(os.environ["SENTRY_DSN"], file=sys.stderr)']],
    ['node -e', ['node', '-e', 'console.log(process.env.APPLE_TEAM_ID); console.error("e=" + process.env.SENTRY_DSN)']],
    ['multi-line value', ['python3', '-c', 'import os; print(os.environ["PEM_KEY"])']],
  ])('%s: stdout and stderr show [가림], never the value', (_n, cmd) => {
    const r = run(['env', 'run', '--', ...(cmd as string[])])
    expect(r.code).toBe(0)
    expect(r.out).toContain('[가림]')
    leaks(r.out)
  })

  test('a script file written to disk prints the values: masked on both streams', () => {
    const f = path.join(sandbox, 'dump.sh')
    fs.writeFileSync(f, 'printf "out=%s\\n" "$APPLE_TEAM_ID"\nprintf "err=%s\\n" "$SENTRY_DSN" >&2\nenv | grep -E "APPLE|SENTRY"\n')
    const r = run(['env', 'run', '--', 'sh', f])
    expect(r.code).toBe(0)
    expect(r.out).toContain('out=[가림]')
    expect(r.out).toContain('err=[가림]')
    expect(r.out).toContain('APPLE_TEAM_ID=[가림]')
    leaks(r.out)
  })

  test('a value split across writes (one byte per write, and across a 64KB read) is masked whole', () => {
    const code = [
      'import os, sys, time',
      'v = os.environ["APPLE_TEAM_ID"]',
      'for c in v:',
      '    sys.stdout.write(c); sys.stdout.flush(); sys.stderr.write(c); sys.stderr.flush(); time.sleep(0.005)',
      'print(); sys.stdout.write("x" * 65530 + v + "\\n"); sys.stdout.flush()',
      'os.write(2, os.environ["SENTRY_DSN"][:5].encode()); time.sleep(0.2); os.write(2, (os.environ["SENTRY_DSN"][5:] + "\\n").encode())',
    ].join('\n')
    const r = run(['env', 'run', '--', 'python3', '-c', code])
    expect(r.code).toBe(0)
    expect(r.stdout.replace(/x+/g, '')).toContain('[가림]\n[가림]\n')
    leaks(r.out)
  })

  test('the intro line masks a value given in argv', () => {
    const r = run(['env', 'run', '--', 'echo', V_TEAM])
    expect(r.out).toContain('echo [가림] 를 실행해요.')
    expect(r.stdout.trim().endsWith('[가림]')).toBe(true)
    leaks(r.out)
  })

  test('output with no value passes unchanged, and a value prefix at the end is flushed at exit', () => {
    const r = run(['env', 'run', '--', 'python3', '-c', `import sys; sys.stdout.write("plain line\\n${V_TEAM.slice(0, 5)}")`])
    expect(r.code).toBe(0)
    expect(r.stdout.endsWith(`plain line\n${V_TEAM.slice(0, 5)}`)).toBe(true)
  })

  test('exit code and a death by signal are passed on', () => {
    expect(run(['env', 'run', '--', 'python3', '-c', 'import sys; sys.exit(7)']).code).toBe(7)
    const r = spawnSync('python3', [PRDT_CLI, 'env', 'run', '--', 'sh', '-c', 'kill -TERM $$'], { cwd: sandbox, env: env(), encoding: 'utf8', timeout: subprocessTimeout('cli') })
    expect(r.signal).toBe('SIGTERM')
  })

  test('a SIGTERM sent to prdt reaches the child; its exit code comes back', async () => {
    const c = spawn('python3', [PRDT_CLI, 'env', 'run', '--', 'python3', '-c',
      'import signal, sys, time\nsignal.signal(signal.SIGTERM, lambda *a: (print("got TERM", flush=True), sys.exit(3)))\nprint("ready", flush=True)\ntime.sleep(30)'],
    { cwd: sandbox, env: env() })
    let out = ''
    let sent = false
    const code = await new Promise<number | null>((resolve) => {
      c.stdout.on('data', (d) => { out += d; if (!sent && /^ready$/m.test(out)) { sent = true; c.kill('SIGTERM') } })
      c.on('exit', (code) => resolve(code))
    })
    expect(out).toContain('got TERM')
    expect(code).toBe(3)
  }, subprocessTimeout('cli') * 2)

  test('a SIGTERM that lands while the child is starting is still sent to it, never kills prdt alone', async () => {
    const c = spawn('python3', [PRDT_CLI, 'env', 'run', '--', 'python3', '-c',
      'import signal, sys, time\nsignal.signal(signal.SIGTERM, lambda *a: sys.exit(4))\ntime.sleep(30)'],
    { cwd: sandbox, env: env() })
    let out = ''
    let sent = false
    const code = await new Promise<number | null>((resolve) => {
      c.stdout.on('data', (d) => { out += d; if (!sent && out.includes('실행해요')) { sent = true; c.kill('SIGTERM') } })
      c.on('exit', (code, sig) => resolve(code ?? (sig ? -1 : null)))
    })
    // either the child got it (exit 4) or it died of it before its own handler was set (143 / signal)
    expect([4, 143, -1]).toContain(code)
  }, subprocessTimeout('cli') * 2)

  test('no stored value: the child runs directly (exec), output untouched', () => {
    seedStore('BLANK=\n')
    const r = run(['env', 'run', '--', 'python3', '-c', 'print("[가림]" not in "x", "ok")'])
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('True ok')
  })
})

describe('T-1119: env run under a terminal keeps tty behaviour and masks', () => {
  // drives `prdt env run -- <cmd>` on a real pty; `typed` is sent once `marker` shows, `ctrlc` sends ^C then
  const DRIVER = `
import os, pty, sys, select, time, json
args, cwd, marker, typed = json.loads(sys.argv[1]), sys.argv[2], sys.argv[3], json.loads(sys.argv[4])
os.chdir(cwd)
pid, fd = pty.fork()
if pid == 0:
    os.execvp("python3", ["python3", ${JSON.stringify(PRDT_CLI)}, "env", "run", "--"] + args)
buf, sent, deadline = b"", False, time.time() + 20
while time.time() < deadline:
    r, _, _ = select.select([fd], [], [], 0.05)
    if r:
        try:
            d = os.read(fd, 4096)
        except OSError:
            break
        if not d:
            break
        buf += d
        if not sent and marker and marker.encode() in buf:
            time.sleep(0.1)
            os.write(fd, typed.encode())
            sent = True
_, status = os.waitpid(pid, 0)
sys.stdout.write(buf.decode("utf-8", "replace"))
sys.stdout.write("\\nSTATUS=" + str(os.waitstatus_to_exitcode(status)))
`
  function onPty(args: string[], marker = '', typed = '') {
    const r = spawnSync('python3', ['-c', DRIVER, JSON.stringify(args), sandbox, marker, JSON.stringify(typed)], { env: env(), encoding: 'utf8', timeout: subprocessTimeout('cli') * 3 })
    return r.stdout || ''
  }
  beforeEach(() => { seedStore(`APPLE_TEAM_ID='${V_TEAM}'\nPEM_KEY="-----BEGIN FAKE KEY-----\nFAKEpemLineOne\n-----END FAKE KEY-----"\n`) })

  test('the child sees a terminal on 0/1/2 and a controlling tty; values (multi-line too) are masked', () => {
    const out = onPty(['python3', '-c', 'import os; print("TTY", os.isatty(0), os.isatty(1), os.isatty(2)); os.close(os.open("/dev/tty", os.O_RDWR)); print("CTTY ok"); print(os.environ["APPLE_TEAM_ID"]); print(os.environ["PEM_KEY"])'])
    expect(out).toContain('TTY True True True')
    expect(out).toContain('CTTY ok')
    expect(out).toContain('[가림]')
    expect(out).not.toContain(V_TEAM.slice(0, 6))
    expect(out).not.toContain('FAKEpemLineOne')
    expect(out).toContain('STATUS=0')
  })

  test('interactive: typed input reaches the child, its reply comes back', () => {
    const out = onPty(['python3', '-c', 'name = input("name? "); print("hello " + name)'], 'name? ', 'world\r')
    expect(out).toContain('hello world')
    expect(out).toContain('STATUS=0')
  })

  test('Ctrl-C typed at the terminal interrupts the child; prdt ends by the same signal', () => {
    const out = onPty(['python3', '-c', 'import time; print("waiting", flush=True); time.sleep(20)'], 'waiting', '\x03')
    expect(out).toContain('STATUS=-2')
  })
})

describe('env run', () => {
  const PROBE = ['python3', '-c', 'import os; print("ST=" + str(os.environ.get("APPLE_TEAM_ID") == "' + V_TEAM + '") + " SEC=" + str(os.environ.get("GOOGLE_OIDC_CLIENT_SECRET")))']

  test('injects machine keys into the child; the CLI line names counts, never values', () => {
    seedStore(`APPLE_TEAM_ID='${V_TEAM}'\n`)
    const r = run(['env', 'run', '--', ...PROBE])
    expect(r.code).toBe(0)
    expect(r.out).toContain('기기 범위 키 1개를 넣어 ')
    expect(r.out).toContain('ST=True SEC=None')
    expect(r.out).not.toContain('같은 이름')
  })

  test('same name: the product code key is not injected (its own value stays); empty machine value is not injected', () => {
    seedStore(`APPLE_TEAM_ID='${V_TEAM}'\nGOOGLE_OIDC_CLIENT_SECRET='${V_SECRET}'\nBLANK=\n`)
    seedProduct(`GOOGLE_OIDC_CLIENT_SECRET=${V_CODE}\n`)
    const r = run(['env', 'run', '--', ...PROBE], { cwd: proj })
    expect(r.code).toBe(0)
    expect(r.out).toContain('기기 범위 키 1개를 넣어 ')
    expect(r.out).toContain('같은 이름 1개는 제품 코드 값을 써요.')
    expect(r.out).toContain('SEC=None')
    expect(r.out).not.toContain(V_SECRET)
  })

  test('a missing command / unknown program fails with no process started', () => {
    expect(run(['env', 'run']).code).toBe(2)
    const r = run(['env', 'run', '--', 'no-such-program-t1109'])
    expect(r.code).toBe(127)
    expect(r.out).toContain('실행 실패')
  })
})

describe('env check keeps presence + length', () => {
  test('check on the machine store file still prints set len=N', () => {
    seedStore(`APPLE_TEAM_ID='${V_TEAM}'\nBLANK=\n`)
    const r = run(['env', 'check', storePath()])
    expect(r.out).toContain(`APPLE_TEAM_ID  set  len=${V_TEAM.length}`)
    expect(r.out).toContain('BLANK  empty')
    for (const v of ALL_VALUES) expect(r.out).not.toContain(v.slice(0, 4))
  })
})

describe('secret guard covers the machine store', () => {
  function guard(tool: string, field: 'command' | 'file_path', v: string) {
    const r = spawnSync('bash', [HOOK], { input: JSON.stringify({ tool_name: tool, tool_input: { [field]: v } }), encoding: 'utf8', timeout: subprocessTimeout('hook') })
    return r.stdout.includes('"deny"') ? 'deny' : 'allow'
  }
  test.each([
    'cat ~/.prdt/env/.env', 'head -3 $HOME/.prdt/env/.env', 'cat ~/.prdt/env/*', 'sed -n 1,5p ~/.prdt/env/.env.bak',
    'cat < ~/.prdt/env/.env', 'while read l; do echo $l; done < ~/.prdt/env/.env',
  ])('Bash printer denied: %s', (c) => { expect(guard('Bash', 'command', c)).toBe('deny') })
  test.each(['/Users/x/.prdt/env/.env', '/Users/x/.prdt/env/store.txt'])('Read denied: %s', (p) => { expect(guard('Read', 'file_path', p)).toBe('deny') })
  test.each([
    'prdt env set APPLE_TEAM_ID', 'prdt env unset APPLE_TEAM_ID', '~/.prdt/bin/prdt env set X', 'echo hi && prdt env set X',
  ])('agent-initiated write denied with its own message: %s', (c) => {
    const r = spawnSync('bash', [HOOK], { input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: c } }), encoding: 'utf8', timeout: subprocessTimeout('hook') })
    expect(r.stdout).toContain('written only by the user own')
  })
  test.each([
    'prdt env ls', 'prdt env run -- pnpm dev', 'prdt env check ~/.prdt/env/.env APPLE_TEAM_ID', 'ls ~/.prdt/env', 'test -f ~/.prdt/env/.env',
    'grep -q APPLE_TEAM_ID ~/.prdt/env/.env', 'cat ~/.prdt/prdt.env', 'echo "prdt env settings"',
  ])('allowed: %s', (c) => { expect(guard('Bash', 'command', c)).toBe('allow') })
})

describe('viewer machine-scope section', () => {
  test('names + set/empty + codewins only; no value or length in the HTML', () => {
    seedStore(`APPLE_TEAM_ID='${V_TEAM}'\nGOOGLE_OIDC_CLIENT_SECRET='${V_SECRET}'\nPUSH_CERT_PASSWORD=\n`)
    seedProduct(`GOOGLE_OIDC_CLIENT_SECRET=${V_CODE}\n`)
    const viewer = path.resolve(CORE_ROOT, '..', 'viewer')
    const out = path.join(sandbox, 'out.html')
    execFileSync('node', [path.join(viewer, 'cli.mjs'), '--repo-root', proj, '--out', out], { env: env(), cwd: sandbox, timeout: subprocessTimeout('cli') * 3, stdio: 'pipe' })
    const html = fs.readFileSync(out, 'utf8')
    expect(html).toContain('기기 범위')
    expect(html).toContain('APPLE_TEAM_ID')
    expect(html).toContain('제품 코드 값이 우선')
    expect(html).toContain('PUSH_CERT_PASSWORD')
    // a page is large prose + script: 8-char windows (4-char ones collide with page words) and no bare-number check
    noLeak(html, 8, false)
    expect(html).not.toMatch(/len=/)
  })
})
