/**
 * po-runner envelope parsing — unit cases for adapter A5 (T-288).
 *
 * prdt v1 return envelope contract: required `persona·task·summary·confidence`,
 * conditional `files_written[]` (dev) and `browser_url·verify_url·
 * verify_description·auth_required{service,instruction,type}` (QA). The GUI
 * parser (`parseArtifactFiles`) previously only recognized the legacy
 * `changed_files[]` field name; `parseQaEnvelope` already recognizes the
 * `prdt-qa` persona (T-285 / adapter A2) even without a `qa_status` key.
 *
 * These cases verify:
 *   1. `files_written[]` and `changed_files[]` both resolve to the same
 *      downstream file list (neither name replaces the other).
 *   2. A qa_status-less prdt-qa envelope parses without error and is
 *      recognized via persona alone.
 *   3. A real prdt-qa QA envelope sample round-trips browser_url / verify_url /
 *      verify_description / auth_required byte-identical (parser unmodified,
 *      per the confirmed contracts decision).
 *
 * Mirrors the framework-free case-list + vitest driver idiom of
 * electron/ipc/costArchive.test.ts.
 */

import { parseArtifactFiles, parseQaEnvelope } from './po-runner'

interface Case {
  readonly label: string
  readonly run: () => { ok: boolean; detail?: string }
}

const sameArray = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i])

export const ENVELOPE_CASES: readonly Case[] = [
  // ── files_written[] / changed_files[] (T-288 §1) ────────────────────────────
  {
    label: 'files_written[] (prdt v1 dev envelope) resolves like changed_files[]',
    run: () => {
      const envelope = JSON.stringify({
        persona: 'prdt-developer',
        task: 'T-288',
        summary: 'po-runner envelope 파싱 확장',
        confidence: 'high',
        files_written: ['packages/gui/electron/po-runner.ts'],
      })
      const files = parseArtifactFiles(envelope)
      return {
        ok: sameArray(files, ['packages/gui/electron/po-runner.ts']),
        detail: JSON.stringify(files),
      }
    },
  },
  {
    label: 'changed_files[] (legacy dev envelope) still resolves unchanged',
    run: () => {
      const envelope = JSON.stringify({
        persona: 'pdt-developer',
        summary: 'legacy envelope',
        confidence: 'high',
        changed_files: ['src/foo.ts', 'src/bar.ts'],
      })
      const files = parseArtifactFiles(envelope)
      return { ok: sameArray(files, ['src/foo.ts', 'src/bar.ts']), detail: JSON.stringify(files) }
    },
  },
  {
    label: 'neither field present → empty array, no throw',
    run: () => {
      const envelope = JSON.stringify({ persona: 'prdt-developer', summary: 'no files', confidence: 'low' })
      const files = parseArtifactFiles(envelope)
      return { ok: sameArray(files, []), detail: JSON.stringify(files) }
    },
  },
  {
    label: 'both fields present → merged, neither name replaces the other',
    run: () => {
      const envelope = JSON.stringify({
        persona: 'prdt-developer',
        summary: 'mixed',
        confidence: 'high',
        changed_files: ['a.ts'],
        files_written: ['b.ts'],
      })
      const files = parseArtifactFiles(envelope)
      return { ok: sameArray(files, ['a.ts', 'b.ts']), detail: JSON.stringify(files) }
    },
  },

  // ── T-345: prose fallback (no structured files_written[] envelope) ─────────
  // Dogfooding gap: the PO delegated to Designer, who wrote 3 mockups, and the
  // PO's own turn-closing text just narrated `file:///…` paths in prose (no
  // JSON envelope at all) — the old envelope-only parser returned [].
  {
    label: 'plain-text file:// list (no JSON envelope) → all 3 paths resolved (T-345)',
    run: () => {
      const text = [
        '디자인 방향 3안을 준비했습니다:',
        '- A안: file:///Users/dev/proj/docs/artifacts/enneagram-mentor-ds-a.html',
        '- B안: file:///Users/dev/proj/docs/artifacts/enneagram-mentor-ds-b.html',
        '- C안: file:///Users/dev/proj/docs/artifacts/enneagram-mentor-ds-c.html',
        '검토 후 알려주세요.',
      ].join('\n')
      const files = parseArtifactFiles(text)
      return {
        ok: sameArray(files, [
          'docs/artifacts/enneagram-mentor-ds-a.html',
          'docs/artifacts/enneagram-mentor-ds-b.html',
          'docs/artifacts/enneagram-mentor-ds-c.html',
        ]),
        detail: JSON.stringify(files),
      }
    },
  },
  {
    label: 'bare relative docs/artifacts/*.html mention (no file:// scheme) also resolves (T-345)',
    run: () => {
      const text = '산출물: docs/artifacts/foo.html 확인해주세요.'
      const files = parseArtifactFiles(text)
      return { ok: sameArray(files, ['docs/artifacts/foo.html']), detail: JSON.stringify(files) }
    },
  },
  {
    label: 'duplicate mention across envelope + prose is deduped, envelope order wins (T-345)',
    run: () => {
      const envelope = JSON.stringify({
        persona: 'prdt-po',
        summary: 'mixed',
        confidence: 'high',
        files_written: ['docs/artifacts/foo.html'],
      })
      const text = `${envelope}\n참고로 file:///abs/path/docs/artifacts/foo.html 도 같은 파일입니다.`
      const files = parseArtifactFiles(text)
      return { ok: sameArray(files, ['docs/artifacts/foo.html']), detail: JSON.stringify(files) }
    },
  },
  {
    label: 'mention of a file OUTSIDE docs/artifacts/ is not swept in as an artifact (T-345)',
    run: () => {
      const text = '수정한 파일: file:///Users/dev/proj/packages/gui/src/App.tsx'
      const files = parseArtifactFiles(text)
      return { ok: sameArray(files, []), detail: JSON.stringify(files) }
    },
  },

  // ── T-346: backtick-wrapped mentions (real-world shape T-345 missed) ───────
  // Bug report screenshot: the PO's actual message wraps each path in
  // backticks — `file:///…` inline code, not bare prose. The regex has no
  // word-boundary/backtick anchor at either end, so the substring is found
  // regardless of the surrounding backticks; this locks that in as intended
  // behavior rather than an accident, per the T-346 acceptance bullet.
  {
    label: 'backtick-wrapped file:// bullet list (exact reported shape) resolves all 3 paths (T-346)',
    run: () => {
      const text = [
        '디자인 방향 3안을 준비했습니다:',
        '- A안: `file:///Users/dev/proj/docs/artifacts/enneagram-mentor-ds-a.html`',
        '- B안: `file:///Users/dev/proj/docs/artifacts/enneagram-mentor-ds-b.html`',
        '- C안: `file:///Users/dev/proj/docs/artifacts/enneagram-mentor-ds-c.html`',
        '검토 후 알려주세요.',
      ].join('\n')
      const files = parseArtifactFiles(text)
      return {
        ok: sameArray(files, [
          'docs/artifacts/enneagram-mentor-ds-a.html',
          'docs/artifacts/enneagram-mentor-ds-b.html',
          'docs/artifacts/enneagram-mentor-ds-c.html',
        ]),
        detail: JSON.stringify(files),
      }
    },
  },
  {
    label: 'backtick-wrapped bare relative docs/artifacts/*.html mention also resolves (T-346)',
    run: () => {
      const text = '산출물: `docs/artifacts/foo.html` 확인해주세요.'
      const files = parseArtifactFiles(text)
      return { ok: sameArray(files, ['docs/artifacts/foo.html']), detail: JSON.stringify(files) }
    },
  },

  // ── QA envelope defense (T-288 §2) ──────────────────────────────────────────
  {
    label: 'qa_status-less prdt-qa envelope recognized via persona, no throw',
    run: () => {
      const envelope = JSON.stringify({
        persona: 'prdt-qa',
        task: 'T-288',
        summary: '승인 — acceptance 전항 충족',
        confidence: 'high',
      })
      let qaEnv: ReturnType<typeof parseQaEnvelope>
      try {
        qaEnv = parseQaEnvelope(envelope)
      } catch (e) {
        return { ok: false, detail: `threw: ${String(e)}` }
      }
      // Recognized (non-null) despite no qa_status/browser_url key.
      if (!qaEnv) return { ok: false, detail: 'not recognized (null)' }
      // Every downstream branch po-runner.ts guards on must no-op safely here —
      // simulate the same optional-chaining checks the real call site uses.
      const noThrowDownstream = (): boolean => {
        void (typeof qaEnv!.browser_url === 'string' && qaEnv!.browser_url)
        void (qaEnv!.qa_status === 'pass')
        void (qaEnv!.qa_loops !== undefined || qaEnv!.qa_status !== undefined)
        void (qaEnv!.auth_required && typeof qaEnv!.auth_required === 'object')
        return true
      }
      return { ok: noThrowDownstream(), detail: JSON.stringify(qaEnv) }
    },
  },
  {
    label: 'real prdt-qa QA envelope round-trips browser_url/verify_url/verify_description/auth_required unchanged',
    run: () => {
      const sample = {
        persona: 'prdt-qa',
        task: 'T-288',
        summary: '파일 카드 렌더 확인 필요 — 수동 검증 요청',
        confidence: 'medium',
        browser_url: 'http://localhost:5173/ticket/T-288',
        verify_url: 'http://localhost:5173/ticket/T-288/preview',
        verify_description: '파일 카드가 files_written[] 기준으로 정상 렌더되는지 확인',
        auth_required: {
          service: 'GitHub',
          instruction: 'OAuth 토큰 재발급이 필요합니다',
          type: 'oauth' as const,
        },
      }
      const qaEnv = parseQaEnvelope(JSON.stringify(sample))
      const ok =
        !!qaEnv &&
        qaEnv.browser_url === sample.browser_url &&
        qaEnv.verify_url === sample.verify_url &&
        qaEnv.verify_description === sample.verify_description &&
        JSON.stringify(qaEnv.auth_required) === JSON.stringify(sample.auth_required)
      return { ok, detail: JSON.stringify(qaEnv) }
    },
  },
]

export function runEnvelopeCases(): { passed: number; failures: string[] } {
  const failures: string[] = []
  for (const c of ENVELOPE_CASES) {
    let res: { ok: boolean; detail?: string }
    try {
      res = c.run()
    } catch (e) {
      res = { ok: false, detail: String(e) }
    }
    if (!res.ok) failures.push(`${c.label}${res.detail ? `: ${res.detail}` : ''}`)
  }
  return { passed: ENVELOPE_CASES.length - failures.length, failures }
}

// ── vitest driver ─────────────────────────────────────────────────────────────

import { test, expect } from 'vitest'

test('po-runner envelope parsing: files_written[]/changed_files[] + QA envelope defense', () => {
  const { passed, failures } = runEnvelopeCases()
  if (failures.length > 0) {
    throw new Error(`${failures.length} failure(s):\n  ${failures.join('\n  ')}`)
  }
  expect(passed).toBe(ENVELOPE_CASES.length)
})
