/**
 * prdt-doctor-promotion-path.test.ts — promotion path is MEASURED, not asserted (T-506).
 *
 * contracts §Git carries the product DEFAULT: promotion to `main` is
 * merge-shaped and a PR is optional, never a gate prdt imposes. A repository or
 * org can require the promotion to go through a pull request, and where it does
 * that policy is the project's path — this repo's own org `.githooks/pre-push`
 * blocks the direct push and names `dev -> main` PR self-merge, which is the
 * mismatch that already cost a wrong `main` push while the discipline still
 * said "a plain merge".
 *
 * The two things that must BOTH hold, and neither of which the discipline text
 * can prove on its own:
 *   1. a repo that requires a PR is REPORTED (the check fires on the violating
 *      shape) — silence there is the failure the ticket was raised on;
 *   2. a repo that does NOT require one stays silent — prdt runs in other
 *      people's repositories and must not tell them to open PRs they do not
 *      need. Case 3 is the control that keeps case 1 from being a check that
 *      simply always fires.
 *
 * Plus the floor: the report is a report. It grants no push, and the contracts
 * consent gate is pinned verbatim here so widening it fails a test rather than
 * passing review.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync, spawnSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
const CONTRACTS = path.join(CORE_ROOT, 'discipline', 'contracts.md')
const READINESS = path.join(CORE_ROOT, 'discipline', 'po', 'playbooks', 'readiness-dispatch.md')

function has(bin: string, args: string[]): boolean {
  try { execFileSync(bin, args, { stdio: 'ignore' }); return true } catch { return false }
}
const CAN_RUN = has('python3', ['--version']) && has('git', ['--version'])
/** A system-level core.hooksPath would make .git/hooks inert for the fixtures
 *  too, breaking the control case. Never observed; skip if present. */
const SYSTEM_HOOKSPATH = (() => {
  try { return execFileSync('git', ['config', '--system', '--get', 'core.hooksPath'], { encoding: 'utf8' }).trim() } catch { return '' }
})()

/** The NTF org hook, verbatim in the part that matters: it documents the path it
 *  leaves open. That sentence is the signal — not a config prdt could set. */
const ORG_PR_HOOK = `#!/usr/bin/env bash
# NTF branch policy: block direct push to main (production).
# Promote via dev -> main PR (self-merge) on GitHub.
# Emergency bypass: ALLOW_MAIN_PUSH=1 git push ...
while read -r a b remote_ref d; do
  if [ "$remote_ref" = "refs/heads/main" ]; then
    if [ "\${ALLOW_MAIN_PUSH:-}" = "1" ]; then echo "org: permitted" >&2; else echo "org: BLOCKED" >&2; exit 1; fi
  fi
done
exit 0
`

/** A blocking hook that says nothing about how to promote — the shape a project
 *  under prdt's own default has. */
const SILENT_HOOK = `#!/usr/bin/env bash
while read -r a b remote_ref d; do
  if [ "$remote_ref" = "refs/heads/main" ]; then
    if [ "\${ALLOW_MAIN_PUSH:-}" = "1" ]; then echo "permitted" >&2; else echo "BLOCKED" >&2; exit 1; fi
  fi
done
exit 0
`

/** T-506 round 2 / F1: a hook whose text CONTAINS the PR words but NEGATES
 *  them — it documents a local-merge policy, not a PR one. A bare
 *  word-presence check false-positives on this shape (files an evidence
 *  sentence that is simply false about the hook it read). */
const NEGATING_HOOK = `#!/usr/bin/env bash
# We do NOT use pull requests here; promote with a local merge, no PR needed.
while read -r a b remote_ref d; do
  if [ "$remote_ref" = "refs/heads/main" ]; then
    if [ "\${ALLOW_MAIN_PUSH:-}" = "1" ]; then echo "permitted" >&2; else echo "BLOCKED" >&2; exit 1; fi
  fi
done
exit 0
`

/** T-564 C1. The two most natural ways to write a PR-required policy are both
 *  DOUBLE negatives — the negation governs the *absence* of a PR, so the clause
 *  asserts the requirement. A "any negation word in the clause kills the match"
 *  heuristic reads both as "no PR path here", which is the exact false negative
 *  that lets a squash-merge repo fall through to the default path unannounced.
 *
 *  These two sentences are not synthesized to match a regex — they are how the
 *  policy actually gets written (`git config` branch-protection prose, GitHub's
 *  own "Require a pull request before merging" setting description). */
const NEVER_WITHOUT_HOOK = `#!/usr/bin/env bash
# Never push to main without a PR.
while read -r a b remote_ref d; do
  if [ "$remote_ref" = "refs/heads/main" ]; then exit 1; fi
done
exit 0
`

const NOT_PR_MERGES_HOOK = `#!/usr/bin/env bash
# Pushes to main that are not PR merges are rejected.
while read -r a b remote_ref d; do
  if [ "$remote_ref" = "refs/heads/main" ]; then exit 1; fi
done
exit 0
`

const REPORT = 'promotion to main here goes through a PR'
/** T-564 acceptance 4: silence used to collapse "we found no PR evidence" into
 *  "this repo does not require a PR". The offline signals cannot see branch
 *  protection or a rebase-merged PR history, so the no-evidence case has to say
 *  which of the two it is. */
const NO_EVIDENCE = 'no local evidence of a PR requirement'

let sandbox: string
let env: NodeJS.ProcessEnv
let remote: string
let projectRoot: string
let codeRoot: string

function git(args: string[], cwd: string, extraEnv: NodeJS.ProcessEnv = {}): { code: number; out: string } {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...(env ?? process.env), ...extraEnv } })
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

/** Sandbox HOME + bare remote + a split project whose code root is a real clone. */
function makeFixture(): void {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-promote-'))
  const home = path.join(sandbox, 'home')
  fs.mkdirSync(home, { recursive: true })
  fs.writeFileSync(path.join(home, '.gitconfig'),
    '[user]\n\tname = t\n\temail = t@t\n[init]\n\tdefaultBranch = main\n')
  env = {
    ...process.env,
    HOME: home,
    PRDT_HOME: path.join(home, '.prdt'),
    PRDT_DISCIPLINE: path.join(CORE_ROOT, 'discipline'),
    GIT_CONFIG_NOSYSTEM: '1',
  }
  remote = path.join(sandbox, 'origin.git')
  git(['init', '-q', '--bare', remote], sandbox)
  const seed = path.join(sandbox, 'seed')
  fs.mkdirSync(seed)
  git(['init', '-q', '-b', 'main'], seed)
  fs.writeFileSync(path.join(seed, 'a.txt'), 'hi\n')
  git(['add', '-A'], seed); git(['commit', '-qm', 'init'], seed)
  git(['push', '-q', remote, 'main'], seed)

  projectRoot = path.join(sandbox, 'proj')
  codeRoot = path.join(projectRoot, 'code')
  fs.mkdirSync(projectRoot)
  git(['clone', '-q', remote, codeRoot], sandbox)
  fs.mkdirSync(path.join(projectRoot, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(projectRoot, '.prdt', 'po-state.json'),
    JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.8', current_task: null }))
  fs.writeFileSync(path.join(projectRoot, '.prdt', 'config.json'),
    JSON.stringify({ slug: 'proj', code: { dir: 'code' } }))
  for (const d of ['docs/prd', 'docs/tickets', 'docs/wiki']) {
    fs.mkdirSync(path.join(projectRoot, d), { recursive: true })
  }
}

/** Land one merge commit on `main` with the given subject and publish it, so
 *  `origin/main`'s first-parent history is what a promotion left behind. */
function promoteWithSubject(subject: string): void {
  git(['checkout', '-qb', 'dev'], codeRoot)
  fs.appendFileSync(path.join(codeRoot, 'a.txt'), 'work\n')
  git(['commit', '-qam', 'feat: work'], codeRoot)
  git(['checkout', '-q', 'main'], codeRoot)
  git(['merge', '--no-ff', '-q', '-m', subject, 'dev'], codeRoot)
  // pushed BEFORE any doctor run — a fresh clone carries no hook yet
  expect(git(['push', '-q', remote, 'main'], codeRoot).code).toBe(0)
}

function useOrgHook(body: string): void {
  const dir = path.join(codeRoot, '.githooks')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'pre-push'), body, { mode: 0o755 })
  git(['config', '--local', 'core.hooksPath', '.githooks'], codeRoot)
}

/** `prdt doctor` from the code root (a session's usual cwd). */
function doctor(): string {
  return execFileSync('python3', [PRDT_CLI, 'doctor'], { cwd: codeRoot, encoding: 'utf8', env, timeout: 60000 })
}

beforeEach(() => { if (CAN_RUN) makeFixture() })
afterEach(() => { if (sandbox) fs.rmSync(sandbox, { recursive: true, force: true }) })

describe.skipIf(!CAN_RUN || !!SYSTEM_HOOKSPATH)('doctor reads the promotion path off the repository (T-506)', () => {
  test('an org hook that names the PR path IS reported — the case the default gets wrong', () => {
    useOrgHook(ORG_PR_HOOK)
    const rep = doctor()
    expect(rep).toContain(REPORT)
    expect(rep).toContain('names a pull-request promotion path')
  })

  test('PR merge commits on origin/main are reported on their own — no hook wording needed', () => {
    promoteWithSubject('Merge pull request #7 from acme/dev')
    const rep = doctor()
    expect(rep).toContain(REPORT)
    // singular/plural: exactly 1 hit here must read "is a PR merge", not "are"
    expect(rep).toContain('is a PR merge (e.g. "Merge pull request #7 from acme/dev")')
    // the hook doctor just installed is ours and says nothing about PRs
    expect(rep).not.toContain('names a pull-request promotion path')
  })

  test('T-564 C1: "Never push to main without a PR." IS read as PR-required', () => {
    // A double negative: `never` governs `without a PR`, so the sentence
    // REQUIRES the PR. Counting "is there a negation word in this clause"
    // discards it — the more precisely a hook states the policy, the less the
    // check could read it.
    useOrgHook(NEVER_WITHOUT_HOOK)
    const rep = doctor()
    expect(rep).toContain(REPORT)
    expect(rep).toContain('names a pull-request promotion path')
  })

  test('T-564 C1: "Pushes to main that are not PR merges are rejected." IS read as PR-required', () => {
    // Two polarity flips again — `not PR merges` inside the subject, `rejected`
    // over the whole clause. What is refused is the non-PR push.
    useOrgHook(NOT_PR_MERGES_HOOK)
    const rep = doctor()
    expect(rep).toContain(REPORT)
    expect(rep).toContain('names a pull-request promotion path')
  })

  test('T-564 C2: a GitHub SQUASH merge subject counts as PR-merge evidence', () => {
    // Squash is GitHub's default merge button for most repos, and it leaves no
    // `Merge pull request` subject at all — only `<title> (#123)`. A check that
    // reads merge-commit subjects only would report `default` on a PR repo.
    promoteWithSubject('fix: tighten the doctor promotion check (#123)')
    const rep = doctor()
    expect(rep).toContain(REPORT)
    expect(rep).toContain('fix: tighten the doctor promotion check (#123)')
    // the hook doctor installed is ours and says nothing about PRs
    expect(rep).not.toContain('names a pull-request promotion path')
  })

  test('a negating hook (T-506 F1) stays SILENT — words alone are not evidence', () => {
    // "We do NOT use pull requests here ... no PR needed" contains every word
    // a bare presence check keys on, but the hook is documenting the OPPOSITE
    // policy: a local merge. The evidence sentence, and the report, must not
    // claim this hook names a pull-request path.
    useOrgHook(NEGATING_HOOK)
    const rep = doctor()
    expect(rep).not.toContain(REPORT)
    expect(rep).not.toContain('names a pull-request promotion path')
    // the run really happened — same non-dead-path check as the silent case below
    expect(rep).toContain('main-push block UNVERIFIED')
  })

  test('a repo with no PR evidence is never claimed to REQUIRE one', () => {
    // promote first: the org hook below blocks a direct main push, which is the
    // point of it — a local `dev → main` merge is this repo's whole policy
    promoteWithSubject("Merge branch 'dev'")
    useOrgHook(SILENT_HOOK)
    const rep = doctor()
    expect(rep).not.toContain(REPORT)
    // the run really happened — the same doctor pass still reports this repo's
    // other git finding, so the verdict above is a verdict, not a dead code path
    expect(rep).toContain('main-push block UNVERIFIED')
  })

  test('T-564 acceptance 4: no-evidence SAYS SO instead of falling through to the default', () => {
    // Neither signal fires here. Both readings are consistent with that silence
    // — "this repo promotes by local merge" and "this repo requires a PR that
    // these offline signals cannot see" — and the second one is the shape that
    // cost a wrong `main` push. So the report names which one doctor actually
    // established: it found nothing, and that is not the same as nothing to find.
    promoteWithSubject("Merge branch 'dev'")
    useOrgHook(SILENT_HOOK)
    const rep = doctor()
    expect(rep).toContain(NO_EVIDENCE)
    // and it does not upgrade its own ignorance into a policy claim
    expect(rep).not.toContain(REPORT)
    const line = rep.split('\n').find(l => l.includes(NO_EVIDENCE)) as string
    expect(line).toBeTruthy()
    expect(line).toMatch(/not proof there is none/)
    // still a report, still grants nothing (T-436: no runnable line to paste)
    expect(line).not.toMatch(/\bgh (pr|repo)\b|\bgit (push|merge)\b/)
  })

  test('the no-evidence line is NOT emitted where evidence exists — the two are exclusive', () => {
    useOrgHook(ORG_PR_HOOK)
    const rep = doctor()
    expect(rep).toContain(REPORT)
    expect(rep).not.toContain(NO_EVIDENCE)
  })

  test('the report grants nothing — it points AT the gate and hands over no command', () => {
    useOrgHook(ORG_PR_HOOK)
    const line = doctor().split('\n').find(l => l.includes(REPORT)) as string
    expect(line).toBeTruthy()
    expect(line).toContain("the user's explicit instruction at the time")
    expect(line).toMatch(/satisfied first and separately/)
    // no runnable line for anyone to paste (T-436) and no push performed
    expect(line).not.toMatch(/\bgh (pr|repo)\b|\bgit (push|merge)\b/)
  })
})

describe('discipline text — repo policy and the product default stay separate', () => {
  const contracts = fs.readFileSync(CONTRACTS, 'utf-8')

  test('the push consent gate is untouched, verbatim', () => {
    expect(contracts).toContain(
      '- No push / promote-to-main / PR / force-push / tag push / destructive git without explicit user instruction.')
  })

  test('promotion shape is the repository\'s policy, read rather than assumed', () => {
    expect(contracts).toContain(
      "whether that merge lands locally or through a pull request is the REPOSITORY's policy")
    expect(contracts).toContain('`prdt doctor` reads off the repo')
    // the superseded claim is gone from the binding text
    expect(contracts).not.toContain('a plain merge')
  })

  test('PRs stay OUR optional default — required only where a repo requires them', () => {
    expect(contracts).toContain('**Optional as OUR default, never a gate the product imposes**')
    expect(contracts).toContain("has already fixed that project's promotion path")
    // and the old absolute, which read as "no repo ever forces a PR", is gone
    expect(contracts).not.toContain('never a forced gate')
  })

  test('the Ship-entry deploy flow promotes by the reported path, inside the one confirm', () => {
    const readiness = fs.readFileSync(READINESS, 'utf-8')
    expect(readiness).toContain('Promote by the path `prdt doctor` names for THIS repo')
    // doctor's signals are local/offline — silence proves no LOCAL evidence of
    // a PR requirement, never that no requirement exists (branch protection
    // and squash/rebase-merged PR history are both invisible to it)
    expect(readiness).toContain('is no local evidence of a PR requirement, not proof there is none')
    expect(readiness).toContain('treat a rejected push as the signal to stop and re-check')
    expect(readiness).toContain("any push beyond that confirm's scope needs its own instruction")
  })

  test('contracts stays at its 80-line cap', () => {
    expect(contracts.replace(/\n$/, '').split('\n').length).toBeLessThanOrEqual(80)
  })
})
