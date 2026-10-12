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
import { spawnSync, execFileSync } from 'child_process'
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

/** Drive `prdt env set <key>` under a real pty (the user's terminal): type `typed` at the hidden prompt. */
const PTY_DRIVER = `
import os, pty, sys, select, time
key, typed, cwd = sys.argv[1], sys.argv[2], sys.argv[3]
os.chdir(cwd)
pid, fd = pty.fork()
if pid == 0:
    os.execvp("python3", ["python3", ${JSON.stringify(PRDT_CLI)}, "env", "set", key])
buf = b""
sent = False
deadline = time.time() + 20
while time.time() < deadline:
    r, _, _ = select.select([fd], [], [], 0.2)
    if r:
        try:
            d = os.read(fd, 4096)
        except OSError:
            break
        if not d:
            break
        buf += d
        if not sent and "화면에 보이지".encode() in buf:
            time.sleep(0.2)
            os.write(fd, (typed + "\\n").encode())
            sent = True
_, status = os.waitpid(pid, 0)
sys.stdout.write(buf.decode("utf-8", "replace"))
sys.exit(os.waitstatus_to_exitcode(status))
`
function typeSet(key: string, typed: string) {
  const r = spawnSync('python3', ['-c', PTY_DRIVER, key, typed, sandbox], { env: env(), encoding: 'utf8', timeout: subprocessTimeout('cli') * 2 })
  return { out: (r.stdout || '') + (r.stderr || ''), code: r.status ?? -1 }
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
    const r = run(['env', 'unset', 'SENTRY_DSN'])
    expect(r.code).toBe(0)
    expect(r.out).toContain('SENTRY_DSN 을 기기 범위에서 지웠어요')
    noLeak(r.out)
    expect(fs.readFileSync(storePath(), 'utf8')).toBe(`APPLE_TEAM_ID='${V_TEAM}'\n`)
    expect(run(['env', 'unset', 'APPLE_TEAM_ID']).code).toBe(0)
    expect(fs.existsSync(storePath())).toBe(false)
  })

  test('unset of a missing key fails with the approved copy', () => {
    const r = run(['env', 'unset', 'NO_SUCH_KEY'])
    expect(r.code).toBe(1)
    expect(r.out).toContain('지우기 실패: NO_SUCH_KEY 가 기기 범위에 없어요. 지운 키가 없어요.')
    expect(r.out).toContain('다음: prdt env ls 로 키 이름을 확인하세요.')
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
