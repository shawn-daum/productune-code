/**
 * prdt-worktree-guard.sh — T-779.
 *
 * WHY: 2026-09-28 (T-601) a developer dispatched with `[ctx].worktree` =
 * tracks/T-601 edited the SHARED code checkout (code/…) while QA grilled it.
 * This hook denies a developer/qa worker whose own dispatch carried a
 * worktree any write under the shared checkout; its worktree, the scratchpad
 * and the meta tree stay writable, and a worker dispatched without a worktree
 * behaves as before.
 *
 * Every run uses a sandbox project + sandbox PRDT_HOME (never ~/.prdt).
 */

import { spawnSync } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { beforeEach, describe, expect, test } from 'vitest'

const HOOK = path.resolve(__dirname, '..', '..', 'scripts', 'hooks', 'prdt-worktree-guard.sh')
const PY = spawnSync('python3', ['--version']).status === 0

let sb: string, root: string, code: string, wt: string, prdtHome: string, scratch: string, parentTranscript: string
const SID = 'sess-1'

function mk(legacy = false): void {
  sb = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wt-guard-')))
  root = path.join(sb, 'proj')
  code = legacy ? root : path.join(root, 'code')
  wt = path.join(root, 'tracks', 'T-9')
  prdtHome = path.join(sb, 'prdt')
  scratch = path.join(sb, 'scratchpad')
  for (const d of [path.join(root, '.prdt'), code, path.join(code, 'src'), wt, prdtHome, scratch, path.join(root, 'docs', 'tickets')])
    fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(path.join(root, '.prdt', 'po-state.json'), '{}')
  fs.writeFileSync(path.join(root, '.prdt', 'config.json'), JSON.stringify(legacy ? { slug: 'p' } : { slug: 'p', code: { dir: 'code' } }))
  fs.mkdirSync(path.join(sb, 'projects'), { recursive: true })
  parentTranscript = path.join(sb, 'projects', `${SID}.jsonl`)
  fs.writeFileSync(parentTranscript, '')
}

function ctxPrompt(ctx: Record<string, unknown>): string {
  return `[ctx] ${JSON.stringify(ctx)}\n\nWHAT: do the thing.`
}

/** The worker transcript the harness writes: first record = the worker's own prompt. */
function workerTranscript(aid: string, ctx: Record<string, unknown> | null): void {
  const dir = path.join(sb, 'projects', SID, 'subagents')
  fs.mkdirSync(dir, { recursive: true })
  const content = ctx ? ctxPrompt(ctx) : 'no ctx here'
  fs.writeFileSync(path.join(dir, `agent-${aid}.jsonl`),
    JSON.stringify({ type: 'user', agentId: aid, message: { role: 'user', content } }) + '\n')
}

function marker(aid: string, checkout: string | null, pairing: 'confirmed' | 'unconfirmed'): void {
  const dir = path.join(prdtHome, 'run', 'dispatches')
  fs.mkdirSync(dir, { recursive: true })
  const h = crypto.createHash('sha256').update(aid).digest('hex')
  fs.writeFileSync(path.join(dir, `${h}.json`), JSON.stringify({
    agent_id: aid, persona: 'developer', checkout, pairing, project_root: root,
    transcript: path.join(sb, 'projects', SID, 'subagents', `agent-${aid}.jsonl`),
  }))
}

interface Ev { aid?: string | null; atype?: string | null; tool: string; input: Record<string, unknown>; cwd?: string; env?: NodeJS.ProcessEnv }
function run(e: Ev): string {
  const ev: Record<string, unknown> = { session_id: SID, transcript_path: parentTranscript, cwd: e.cwd ?? root }
  if (e.aid !== null) ev.agent_id = e.aid ?? 'agent-w'
  if (e.atype !== null) ev.agent_type = e.atype ?? 'prdt-developer'
  Object.assign(ev, { hook_event_name: 'PreToolUse', tool_name: e.tool, tool_input: e.input, tool_use_id: 'toolu_1' })
  const r = spawnSync('bash', [HOOK], { input: JSON.stringify(ev), encoding: 'utf8', env: e.env ?? { ...process.env, PRDT_HOME: prdtHome } })
  expect(r.status).toBe(0)
  return r.stdout
}
function denied(out: string): string {
  const j = JSON.parse(out)
  expect(j.hookSpecificOutput.permissionDecision).toBe('deny')
  return j.hookSpecificOutput.permissionDecisionReason as string
}
const bash = (command: string, cwd?: string) => run({ tool: 'Bash', input: { command }, cwd })

describe.skipIf(!PY)('T-779 — a worktree-dispatched worker cannot write the shared checkout', () => {
  beforeEach(() => {
    mk()
    workerTranscript('agent-w', { slug: 's', dispatch_id: 'd-1', worktree: wt })
  })

  test('Edit/Write/MultiEdit/NotebookEdit under code/ are denied, naming the worktree and the same file inside it', () => {
    const why = denied(run({ tool: 'Edit', input: { file_path: path.join(code, 'src', 'a.ts'), old_string: 'a', new_string: 'b' } }))
    expect(why).toContain(wt)
    expect(why).toContain(path.join(wt, 'src', 'a.ts'))
    denied(run({ tool: 'Write', input: { file_path: path.join(code, 'new.ts'), content: 'x' } }))
    denied(run({ tool: 'MultiEdit', input: { file_path: path.join(code, 'src', 'a.ts'), edits: [] } }))
    denied(run({ tool: 'NotebookEdit', input: { notebook_path: path.join(code, 'n.ipynb'), new_source: '' } }))
  })

  test('the incident shape: a relative `code/…` path from the session-root cwd is denied', () => {
    denied(run({ tool: 'Write', input: { file_path: 'code/packages/core/scripts/prdt', content: 'x' }, cwd: root }))
  })

  test('its worktree, the scratchpad and the meta tree are unaffected', () => {
    expect(run({ tool: 'Write', input: { file_path: path.join(wt, 'src', 'a.ts'), content: 'x' } })).toBe('')
    expect(run({ tool: 'Edit', input: { file_path: 'tracks/T-9/src/a.ts' }, cwd: root })).toBe('')
    expect(run({ tool: 'Write', input: { file_path: path.join(scratch, 'probe.json'), content: 'x' } })).toBe('')
    expect(run({ tool: 'Edit', input: { file_path: path.join(root, 'docs', 'tickets', 'T-9.md') } })).toBe('')
  })

  test('Bash writes it recognises under code/ are denied', () => {
    for (const c of [
      'echo hi > code/src/a.ts',
      'printf x >> code/src/a.ts',
      'cd code && sed -i "" s/a/b/ src/a.ts',
      `sed -i.bak -e s/a/b/ ${code}/src/a.ts`,
      "perl -pi -e 's/a/b/' code/src/a.ts",
      'cat x | tee -a code/log.txt',
      'cp /tmp/x code/src/a.ts',
      `mv ${wt}/a.ts ${code}/src/`,
      'rm -rf code/src',
      'mkdir -p code/newdir',
      'touch code/src/b.ts',
      'git -C code commit -m wip',
      'cd code; git add packages/core/scripts/prdt',
      'cat <<EOF > code/src/gen.ts\nexport {}\nEOF',
    ]) {
      expect(denied(bash(c)), c).toContain(wt)
    }
  })

  test('Bash reads, fd redirects and writes outside code/ stay silent', () => {
    for (const c of [
      'cat code/src/a.ts',
      'grep -rn foo code/packages',
      'git -C code log --oneline -5',
      'git -C code status',
      'git -C code stash list',
      'echo oops >&2',
      'ls code 2>&1',
      'cp code/src/a.ts tracks/T-9/src/a.ts',
      `cd ${wt} && git add -p && git commit -m x`,
      `echo x > ${scratch}/out.txt`,
      'cat <<EOF > tracks/T-9/gen.ts\nsee code/src/a.ts > here\nEOF',
      'pnpm vitest run 2>/dev/null',
    ]) {
      expect(bash(c), c).toBe('')
    }
  })

  test('T-783 — QA grill: shapes previously missed are now denied', () => {
    for (const c of [
      `mv code/src/a.ts ${wt}/a.ts`,
      'if [ -f code/src/a.ts ]; then rm code/src/a.ts; fi',
      'for f in a b; do rm code/src/$f; done',
      'while read -r x; do touch code/src/$x; done < list.txt',
      'bash -c "rm -rf code/src"',
      "sh -c 'touch code/newdir/x'",
      'xargs -I{} rm code/src/{} < /dev/null',
      "find code/src -name '*.bak' -delete",
      'pushd code && touch x.ts && popd',
      'dd if=/dev/zero of=code/src/a.ts bs=1 count=1',
      'curl -o code/src/a.ts https://example.test/f',
      'curl --output=code/src/a.ts https://example.test/f',
      'git --work-tree=code commit -m wip',
      '$PWD/prdt-nonexistent-marker ; touch $PWD/code/src/a.ts',
      'touch code/a#weird.ts',
      "echo 'not-a-heredoc a<<b' ; rm -rf code/src",
    ]) {
      expect(denied(bash(c, root)), c).toContain(wt)
    }
  })

  test('T-783 — a case-variant path of the shared checkout is denied on this (case-insensitive) filesystem', () => {
    if (process.platform !== 'darwin') return
    const variant = path.join(path.dirname(code), path.basename(code).toUpperCase(), 'src', 'a.ts')
    expect(denied(run({ tool: 'Write', input: { file_path: variant, content: 'x' } })), variant).toContain(wt)
  })

  test('T-783 — the false denies QA found stay silent', () => {
    for (const c of [
      '(cd code) ; touch rel.txt',
      '[[ "a" > "b" ]]',
      'perl -mdiagnostics -e "print 1"',
    ]) {
      expect(bash(c, root), c).toBe('')
    }
  })

  test('T-786 (F5) — destination flags and eval bodies are checked', () => {
    for (const c of [
      'tar -xf archive.tar -C code',
      'tar --extract -f archive.tar --directory=code',
      'tar xf archive.tar -C code',                    // T-834 fix2: old-style bundle, same parser as the records rule
      'unzip archive.zip -dcode',
      'patch -p1 -d code < a.patch',
      'patch --directory=code -p1 < a.patch',
      'unzip -d code archive.zip',
      'npm --prefix code install',
      'npm --prefix=code install',
      'eval "echo x > code/a"',
    ]) {
      expect(denied(bash(c, root)), c).toContain(wt)
    }
  })

  test('T-786 (F5) — a tar create (read-only for -C) stays silent, like cat', () => {
    expect(bash('tar -cf archive.tar -C code file.txt', root)).toBe('')
    expect(bash('tar --create -f archive.tar --directory=code file.txt', root)).toBe('')
    expect(bash('tar cf archive.tar -C code README', root)).toBe('')           // old-style create
    expect(bash('tar -cf archive.tar -C code README', root)).toBe('')          // `README` is a member, not a mode bundle
  })

  test('T-786 (F5) — variable and command-substitution destinations are an accepted gap, stay silent', () => {
    for (const c of [
      'echo x > $CODE/a',
      'echo x > $(echo code)/a',
      'echo x > `echo code`/a',
    ]) {
      expect(bash(c, root), c).toBe('')
    }
  })
})

describe.skipIf(!PY)('T-779 — who the guard applies to', () => {
  beforeEach(() => mk())
  const codeWrite = () => ({ tool: 'Write', input: { file_path: path.join(code, 'x.ts'), content: 'x' } })

  test('a worker dispatched without [ctx].worktree behaves as today (silent)', () => {
    workerTranscript('agent-w', { slug: 's', dispatch_id: 'd-1' })
    expect(run(codeWrite())).toBe('')
    expect(bash('echo x > code/x.ts')).toBe('')
  })

  test('a worker whose worktree is spelled "code" (the shared checkout) is silent', () => {
    workerTranscript('agent-w', { slug: 's', dispatch_id: 'd-1', worktree: 'code' })
    expect(run(codeWrite())).toBe('')
  })

  test('a relative worktree is taken from the project root', () => {
    workerTranscript('agent-w', { slug: 's', dispatch_id: 'd-1', worktree: 'tracks/T-9' })
    expect(denied(run(codeWrite()))).toContain(wt)
  })

  test('qa is guarded too; the main session, a designer, a forged nested agent_type are not', () => {
    workerTranscript('agent-w', { slug: 's', dispatch_id: 'd-1', worktree: wt })
    denied(run({ ...codeWrite(), atype: 'prdt-qa' }))
    expect(run({ ...codeWrite(), atype: 'prdt-designer' })).toBe('')
    expect(run({ ...codeWrite(), aid: null, atype: null })).toBe('')
    expect(run({ tool: 'Write', aid: null, atype: null,
      input: { file_path: path.join(code, 'x.ts'), content: '"agent_type":"prdt-developer"', agent_type: 'prdt-developer' } })).toBe('')
  })

  test('T-780 window — no worker transcript yet: a CONFIRMED marker decides, an UNCONFIRMED one never denies', () => {
    marker('agent-w', wt, 'unconfirmed')
    expect(run(codeWrite())).toBe('')
    marker('agent-w', wt, 'confirmed')
    expect(denied(run(codeWrite()))).toContain(wt)
    marker('agent-w', 'code', 'confirmed')
    expect(run(codeWrite())).toBe('')
  })

  test('T-780 swap — the worker\'s own prompt outranks a marker holding a sibling\'s [ctx]', () => {
    marker('agent-w', wt, 'unconfirmed')        // sibling's worktree, FIFO-swapped
    workerTranscript('agent-w', { slug: 's', dispatch_id: 'd-2' })  // this worker has none
    expect(run(codeWrite())).toBe('')
    marker('agent-v', 'code', 'unconfirmed')
    workerTranscript('agent-v', { slug: 's', dispatch_id: 'd-3', worktree: wt })
    denied(run({ ...codeWrite(), aid: 'agent-v' }))
  })

  test('fails open on garbage input and outside a prdt project', () => {
    expect(spawnSync('bash', [HOOK], { input: 'not json "agent_type":"prdt-qa"', encoding: 'utf8' }).stdout).toBe('')
    expect(spawnSync('bash', [HOOK], { input: '', encoding: 'utf8' }).stdout).toBe('')
    workerTranscript('agent-w', { slug: 's', dispatch_id: 'd-1', worktree: '/nowhere/tracks/T-9' })
    fs.rmSync(path.join(root, '.prdt', 'po-state.json'))
    expect(run(codeWrite())).toBe('')
  })
})

describe.skipIf(!PY)('T-779 — legacy layout (code root == meta root)', () => {
  beforeEach(() => {
    mk(true)
    workerTranscript('agent-w', { slug: 's', dispatch_id: 'd-1', worktree: wt })
  })

  test('code files at the root are denied; docs/, .prdt/, tracks/ and the worktree are not', () => {
    denied(run({ tool: 'Write', input: { file_path: path.join(root, 'src', 'a.ts'), content: 'x' } }))
    expect(run({ tool: 'Edit', input: { file_path: path.join(root, 'docs', 'tickets', 'T-9.md') } })).toBe('')
    expect(run({ tool: 'Write', input: { file_path: path.join(wt, 'src', 'a.ts'), content: 'x' } })).toBe('')
  })

  test('T-786 (code review #3) — a variable target no longer false-denies in the legacy layout', () => {
    for (const c of [
      'echo x > $TMPDIR/x',
      'echo x > $S/x',
    ]) {
      expect(bash(c, root), c).toBe('')
    }
  })

  test('T-786 (code review #3) — a bare `cd` moves the effective cwd to $HOME, so a later relative write no longer false-denies', () => {
    expect(bash('cd; echo x > notes.txt', root)).toBe('')
  })
})

/**
 * T-834: the track records `prdt track open` writes (T-833) live under
 * $PRDT_HOME/run/tracks/. Every worker persona — with or without
 * [ctx].worktree — is denied a write there; the PO (main session, no
 * agent_type) and a sandbox PRDT_HOME are not.
 */
describe.skipIf(!PY)('T-834 — no worker writes the track records', () => {
  let tracks: string, rec: string
  beforeEach(() => {
    mk()
    workerTranscript('agent-w', { slug: 's', dispatch_id: 'd-1' })   // no worktree: the T-779 rule is off
    tracks = path.join(prdtHome, 'run', 'tracks')
    rec = path.join(tracks, 'abcd', 'T-2.json')
    fs.mkdirSync(path.dirname(rec), { recursive: true })
    fs.writeFileSync(rec, '{"schema":1,"ticket":"T-2","branch":"track/T-2","base":"main"}\n')
  })
  const why = (out: string) => {
    const r = denied(out)
    expect(r).toContain('T-834')
    expect(r).toContain('tooling-owned')
    return r
  }

  test('Write / Edit / MultiEdit / NotebookEdit on a record are denied, naming the reason', () => {
    expect(why(run({ tool: 'Write', input: { file_path: rec, content: '{}' } }))).toContain(rec)
    why(run({ tool: 'Edit', input: { file_path: rec, old_string: 'main', new_string: 'dev' } }))
    why(run({ tool: 'MultiEdit', input: { file_path: rec, edits: [] } }))
    why(run({ tool: 'Write', input: { file_path: path.join(tracks, 'abcd', 'T-3.json'), content: '{}' } }))
  })

  test('the three T-833 QA forgeries and the Bash shapes the guard recognises are denied', () => {
    for (const c of [
      `rm ${rec}`,                                                                       // forgery 1: delete
      `echo '{"ticket":"T-2","branch":"track/T-2","base":"dev"}' > ${rec}`,              // forgery 2: base=dev
      `printf '{"ticket":"T-2","branch":"track/T-2","base":"main","base":"dev"}' > ${rec}`, // forgery 3: dup key
      'rm $PRDT_HOME/run/tracks/abcd/T-2.json',
      'rm -f ${PRDT_HOME}/run/tracks/abcd/T-2.json',
      `rm -rf ${tracks}`,
      `rm -rf ${path.join(prdtHome, 'run')}`,                                            // an ancestor inside PRDT_HOME
      `cat x | tee ${rec}`,
      `cp /tmp/forged.json ${rec}`,
      `mv ${rec} /tmp/gone.json`,
      `cd ${path.dirname(rec)} && rm T-2.json`,
      `sed -i '' s/main/dev/ ${rec}`,
      `find ${path.join(prdtHome, 'run')} -name '*.json' -delete`,
      `bash -c "rm ${rec}"`,
      `if true; then truncate -s 0 ${rec}; fi`,
      `cat > ${rec} <<EOF\n{"base":"dev"}\nEOF`,
    ]) {
      why(bash(c))
    }
  })

  test('interpreter programs naming the track records are denied (-c, -e, heredoc, here-string)', () => {
    for (const c of [
      `python3 -c "import os; os.remove(os.environ['PRDT_HOME'] + '/run/tracks/abcd/T-2.json')"`,
      `python3 -c "open('${rec}','w').write('{}')"`,
      "python3 - <<'EOF'\nimport os, pathlib\np = pathlib.Path(os.environ['PRDT_HOME']) / 'run' / 'tracks'\nfor f in p.rglob('*.json'): f.unlink()\nEOF",
      `node -e "require('fs').unlinkSync(process.env.PRDT_HOME + '/run/tracks/abcd/T-2.json')"`,
      `perl -e 'unlink "$ENV{PRDT_HOME}/run/tracks/abcd/T-2.json"'`,
      `python3 <<< "import os; os.remove(os.path.join(os.environ['PRDT_HOME'], 'run', 'tracks', 'abcd', 'T-2.json'))"`,
      `bash <<EOF\nrm ${rec}\nEOF`,
    ]) {
      why(bash(c))
    }
  })

  test('a worker running `prdt track open|land|drop` is denied; `review` is not', () => {
    for (const c of [
      'prdt track drop T-2 --force',
      'prdt track land T-2',
      'prdt track open T-3 --base dev',
      '~/.prdt/bin/prdt track land T-2 --base dev',
      `PRDT_HOME=${prdtHome} prdt track drop T-2`,
      'cd /tmp && prdt track drop T-2',
    ]) {
      expect(why(bash(c)), c).toContain('PO command')
    }
    expect(bash('prdt track review T-2')).toBe('')
  })

  test('every worker persona is guarded; the PO (main session) is not', () => {
    const w = { tool: 'Write', input: { file_path: rec, content: '{}' } }
    why(run({ ...w, atype: 'prdt-qa' }))
    why(run({ ...w, atype: 'prdt-designer' }))
    why(run({ ...w, aid: 'agent-unknown' }))                          // no transcript at all: still denied
    expect(run({ ...w, aid: null, atype: null })).toBe('')
    expect(run({ tool: 'Bash', aid: null, atype: null, input: { command: 'prdt track open T-3 --base main' } })).toBe('')
    expect(run({ tool: 'Bash', aid: null, atype: null, input: { command: `rm ${rec}` } })).toBe('')
  })

  test('reads, other run/ files and a sandbox PRDT_HOME stay silent', () => {
    const sbx = path.join(sb, 'qa-sandbox', 'prdt')
    for (const c of [
      `cat ${rec}`,
      `ls -la ${tracks}`,
      `jq . ${rec}`,
      `cp ${rec} ${scratch}/rec.json`,
      'grep -rn "run/tracks" packages/core/scripts/prdt',
      'python3 -m pytest -q',
      `PRDT_HOME=${sbx} prdt track open T-1 --base main`,
      `PRDT_HOME=${sbx} python3 packages/core/scripts/prdt track drop T-1 --force`,
      `export PRDT_HOME=${sbx}; prdt track land T-1`,
      `rm -rf ${sbx}/run/tracks`,
      `python3 -c "open('${sbx}/run/tracks/k/T-1.json','w')"`,
      'PRDT_HOME=$S/prdt prdt track drop T-1',                       // unresolvable sandbox: accepted gap, silent
    ]) {
      expect(bash(c), c).toBe('')
    }
  })

  test('the default PRDT_HOME (~/.prdt via HOME) is resolved for ~ and $HOME spellings', () => {
    const fakeHome = path.join(sb, 'home')
    const r2 = path.join(fakeHome, '.prdt', 'run', 'tracks', 'abcd', 'T-2.json')
    fs.mkdirSync(path.dirname(r2), { recursive: true })
    const env = { ...process.env, HOME: fakeHome }
    delete env.PRDT_HOME
    for (const c of ['rm ~/.prdt/run/tracks/abcd/T-2.json', 'rm $HOME/.prdt/run/tracks/abcd/T-2.json', 'prdt track drop T-2']) {
      why(run({ tool: 'Bash', input: { command: c }, env }))
    }
    why(run({ tool: 'Write', input: { file_path: r2, content: '{}' }, env }))
  })

  test('T-834 grill [A] — a glob or brace target under $PRDT_HOME/run is denied', () => {
    const run_ = path.join(prdtHome, 'run')
    for (const c of [
      `rm -f ${run_}/track*/abcd/T-2.json`,
      `rm -rf ${run_}/t*`,
      `echo x > ${run_}/tr?cks/abcd/T-2.json`,
      `rm ${run_}/{tracks,x}/abcd/T-2.json`,
      `rm -f ${run_}/tr[a]cks/abcd/T-2.json`,
      `rm -rf ${run_}/dispatch*`,                           // any glob under run/: tooling-owned
      `rm -rf ${prdtHome}/r*`,                              // an ancestor of run/tracks inside PRDT_HOME
      'rm -rf $PRDT_HOME/run/t*',
    ]) {
      why(bash(c))
    }
    // a glob elsewhere, or one in PRDT_HOME that cannot reach run/tracks, stays silent
    for (const c of [`rm -f ${scratch}/*.json`, `touch ${prdtHome}/*.log`, `rm -f ${prdtHome}/w*`]) {
      expect(bash(c), c).toBe('')
    }
  })

  test('T-834 grill [B] — only a real assignment reassigns PRDT_HOME / HOME', () => {
    const py = `python3 -c "import os; os.remove(os.environ['PRDT_HOME'] + '/run/tracks/abcd/T-2.json')"`
    for (const c of [
      `echo PRDT_HOME=/tmp/x; ${py}`,
      `# PRDT_HOME=/tmp/x\n${py}`,
      'PRDT_HOME=/tmp/x true; prdt track drop T-2',
      '(export PRDT_HOME=/tmp/x); prdt track drop T-2',
    ]) {
      expect(why(bash(c)), c).toBeTruthy()
    }
    const fakeHome = path.join(sb, 'home')
    const env = { ...process.env, HOME: fakeHome }
    delete env.PRDT_HOME
    for (const c of [
      'HOME=/tmp/x true; rm $HOME/.prdt/run/tracks/abcd/T-2.json',
      'echo HOME=/tmp/x; rm $HOME/.prdt/run/tracks/abcd/T-2.json',
      '# HOME=/tmp/x\npython3 -c "import os; os.remove(os.path.expanduser(\'~/.prdt/run/tracks/abcd/T-2.json\'))"',
      'HOME=/tmp/x rm $HOME/.prdt/run/tracks/abcd/T-2.json',   // a prefix does not change its own args' expansion
    ]) {
      expect(why(run({ tool: 'Bash', input: { command: c }, env })), c).toBeTruthy()
    }
    // real reassignments still count: export, a standalone assignment, a prefix on the same command, env VAR=
    const sbx = path.join(sb, 'qa-sandbox', 'prdt')
    for (const c of [
      `export PRDT_HOME=${sbx}; prdt track drop T-1`,
      `PRDT_HOME=${sbx}; prdt track drop T-1`,
      `PRDT_HOME=${sbx} prdt track drop T-1`,
      `env PRDT_HOME=${sbx} prdt track drop T-1`,
      `HOME=/tmp/x; rm $HOME/.prdt/run/tracks/abcd/T-2.json`,
    ]) {
      expect(bash(c), c).toBe('')
    }
  })

  test('T-834 grill [C] — combined shell flags, dash/ksh and an env-path wrapper are unwrapped', () => {
    for (const c of [
      `bash -lc "rm ${rec}"`,
      `bash -ec "rm ${rec}"`,
      `bash -e -c "rm ${rec}"`,
      `dash -c "rm ${rec}"`,
      `ksh -c "rm ${rec}"`,
      `/usr/bin/env bash -c "rm ${rec}"`,
      `/bin/sh -c "rm ${rec}"`,
      `/usr/bin/env -i bash --noprofile -c "rm ${rec}"`,
    ]) {
      why(bash(c))
    }
    expect(bash('bash -lc "echo hi"')).toBe('')
    expect(bash('bash -e script.sh')).toBe('')
  })

  test('T-834 grill [D] — copy / extract INTO run/, PRDT_HOME or run/tracks is denied', () => {
    const run_ = path.join(prdtHome, 'run')
    for (const c of [
      `cp -R /tmp/forged/tracks ${run_}/`,
      `rsync -a /tmp/forged/ ${run_}/`,
      `tar -xf f.tar -C ${run_}`,
      `unzip -o f.zip -d ${prdtHome}`,
      `ditto /tmp/forged ${run_}`,
      `cp -R /tmp/forged ${tracks}`,
      `mv /tmp/forged/run ${prdtHome}/`,
      'cp -R /tmp/forged/tracks ~/.prdt/run/'.replace('~/.prdt', prdtHome),
    ]) {
      why(bash(c))
    }
    for (const c of [
      `cp -R ${run_} ${scratch}/run-copy`,                 // a copy FROM run/ is a read
      `tar -xf f.tar -C ${scratch}`,
      `rsync -a ${tracks}/ ${scratch}/t/`,
    ]) {
      expect(bash(c), c).toBe('')
    }
  })

  test('T-834 grill [D] fix2 — every tar / unzip destination spelling, and install -d, is denied', () => {
    const run_ = path.join(prdtHome, 'run')
    const dests = [run_, tracks, '$PRDT_HOME', 'run', 'run/tracks']
    for (const d of dests) {
      for (const c of [
        `tar xf f.tar -C ${d}`,
        `tar xzf f.tgz -C ${d}`,
        `tar x -C ${d} -f f.tar`,
        `tar -C ${d} xf f.tar`,
        `tar xf f.tar --directory=${d}`,
        `unzip -d${d} f.zip`,
        `unzip f.zip -d${d}`,
      ]) {
        expect(why(bash(`cd ${prdtHome} && ${c}`)), c).toBeTruthy()
      }
    }
    // install -d creates directories like mkdir — judged the same
    why(bash(`cd ${prdtHome} && install -d run/tracks/x`))
    why(bash(`install -d -m 755 ${tracks}/x`))
    for (const c of [
      'tar xf x.tar -C /tmp/scratch',
      'tar -C ~ -xf x.tar',
      'unzip f.zip -d /tmp/x',
      `tar cf out.tar -C ${run_} tracks`,                     // a create only reads run/
      `install -d ${scratch}/x`,
      `install -m 644 ${rec} ${scratch}/r.json`,              // install FROM the records is a read
    ]) {
      expect(bash(c), c).toBe('')
    }
    // the PO main session is never denied
    for (const c of [`tar xf f.tar -C ${run_}`, `unzip f.zip -d${tracks}`, `install -d ${tracks}/x`]) {
      expect(run({ tool: 'Bash', aid: null, atype: null, input: { command: c } }), c).toBe('')
    }
  })

  test('with a worktree, both rules apply: the shared checkout and the records', () => {
    workerTranscript('agent-w', { slug: 's', dispatch_id: 'd-1', worktree: wt })
    expect(denied(bash('touch code/x.ts'))).toContain('T-779')
    why(bash(`rm ${rec}`))
    expect(bash(`touch ${wt}/x.ts`)).toBe('')
  })
})
