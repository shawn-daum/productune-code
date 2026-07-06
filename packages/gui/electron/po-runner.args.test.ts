/**
 * po-runner buildClaudeArgs — T-310 (GUI model/effort override reaches spawn argv).
 *
 * buildClaudeArgs is the pure argv builder extracted from spawnClaude's body.
 * These cases assert:
 *   - no override (`{}`, the pre-T-310 shape / legacy project) → argv unchanged
 *     from the original inline behavior (no --model/--effort anywhere).
 *   - model-only / effort-only / both → the right flags appear, right after the
 *     --agent (or --resume + --agent) pair and before --permission-mode.
 *   - override applies identically on both the first-call and --resume paths.
 *
 * Mirrors the case-list + vitest driver idiom of project-paths.test.ts /
 * po-runner.envgate.test.ts.
 */

import { buildClaudeArgs } from './po-runner'
import type { PoSessionOverride } from './po-session-config'

interface Case {
  readonly label: string
  readonly run: () => { ok: boolean; detail?: string }
}

const eq = (got: unknown, want: unknown): { ok: boolean; detail?: string } =>
  JSON.stringify(got) === JSON.stringify(want)
    ? { ok: true }
    : { ok: false, detail: `got=${JSON.stringify(got)} want=${JSON.stringify(want)}` }

export const BUILD_CLAUDE_ARGS_CASES: readonly Case[] = [
  {
    label: 'no override, first call → identical to pre-T-310 argv (no --model/--effort)',
    run: () => eq(
      buildClaudeArgs({ resume: null, text: 'hello' }, 'prdt-po', {}),
      [
        '--agent', 'prdt-po',
        '--permission-mode', 'bypassPermissions',
        '--include-partial-messages',
        '--print', '--output-format', 'stream-json', '--verbose', '--', 'hello',
      ],
    ),
  },
  {
    label: 'no override, resume → identical to pre-T-310 argv',
    run: () => eq(
      buildClaudeArgs({ resume: 'sid-1', text: 'hi' }, 'prdt-po', {}),
      [
        '--resume', 'sid-1', '--agent', 'prdt-po',
        '--permission-mode', 'bypassPermissions',
        '--include-partial-messages',
        '--print', '--output-format', 'stream-json', '--verbose', '--', 'hi',
      ],
    ),
  },
  {
    label: 'model-only override → --model right after --agent',
    run: () => {
      const override: PoSessionOverride = { model: 'opus' }
      return eq(
        buildClaudeArgs({ resume: null, text: 't' }, 'prdt-po', override),
        [
          '--agent', 'prdt-po',
          '--model', 'opus',
          '--permission-mode', 'bypassPermissions',
          '--include-partial-messages',
          '--print', '--output-format', 'stream-json', '--verbose', '--', 't',
        ],
      )
    },
  },
  {
    label: 'effort-only override → --effort right after --agent',
    run: () => {
      const override: PoSessionOverride = { effort: 'high' }
      return eq(
        buildClaudeArgs({ resume: null, text: 't' }, 'prdt-po', override),
        [
          '--agent', 'prdt-po',
          '--effort', 'high',
          '--permission-mode', 'bypassPermissions',
          '--include-partial-messages',
          '--print', '--output-format', 'stream-json', '--verbose', '--', 't',
        ],
      )
    },
  },
  {
    label: 'model+effort override, resume path → both flags after --resume/--agent',
    run: () => {
      const override: PoSessionOverride = { model: 'sonnet', effort: 'xhigh' }
      return eq(
        buildClaudeArgs({ resume: 'sid-2', text: 't' }, 'prdt-po', override),
        [
          '--resume', 'sid-2', '--agent', 'prdt-po',
          '--model', 'sonnet',
          '--effort', 'xhigh',
          '--permission-mode', 'bypassPermissions',
          '--include-partial-messages',
          '--print', '--output-format', 'stream-json', '--verbose', '--', 't',
        ],
      )
    },
  },
  {
    label: 'legacy poAgent (pdt-po) + override → override still applies (agent-id-agnostic)',
    run: () => {
      const override: PoSessionOverride = { model: 'fable' }
      return eq(
        buildClaudeArgs({ resume: null, text: 't' }, 'pdt-po', override),
        [
          '--agent', 'pdt-po',
          '--model', 'fable',
          '--permission-mode', 'bypassPermissions',
          '--include-partial-messages',
          '--print', '--output-format', 'stream-json', '--verbose', '--', 't',
        ],
      )
    },
  },
]

export function runBuildClaudeArgsCases(): { passed: number; failures: string[] } {
  const failures: string[] = []
  for (const c of BUILD_CLAUDE_ARGS_CASES) {
    let res: { ok: boolean; detail?: string }
    try {
      res = c.run()
    } catch (e) {
      res = { ok: false, detail: String(e) }
    }
    if (!res.ok) failures.push(`${c.label}${res.detail ? `: ${res.detail}` : ''}`)
  }
  return { passed: BUILD_CLAUDE_ARGS_CASES.length - failures.length, failures }
}

// ── vitest driver ─────────────────────────────────────────────────────────────

import { test, expect } from 'vitest'

test('T-310: buildClaudeArgs model/effort override cases pass', () => {
  const { passed, failures } = runBuildClaudeArgsCases()
  if (failures.length > 0) {
    throw new Error(`${failures.length} failure(s):\n  ${failures.join('\n  ')}`)
  }
  expect(passed).toBe(BUILD_CLAUDE_ARGS_CASES.length)
})
