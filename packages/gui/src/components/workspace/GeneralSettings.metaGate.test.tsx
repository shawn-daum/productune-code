/**
 * GeneralSettings.metaGate.test.tsx — T-370 C1 regression pin.
 *
 * The reviewed defect: the Meta sections (backup remote + split migration)
 * rendered for ANY open project, including legacy `.productune` ones. On a
 * legacy project the migration splits meta into `.prdt/meta.git` — a repo the
 * post-dispatch hook beat (hardcoded to the same path, deliberately) never
 * commits to because the legacy project carries no prdt state, so work records
 * land in neither the code repo nor the meta repo (data-protection failure).
 *
 * The fix gates the sections on `isPrdtPoState` — the same signal every other
 * prdt-only surface uses. This test renders the REAL GeneralSettings through
 * react-dom/server (the MdRenderer.href.test.tsx pattern — no jsdom needed;
 * effects don't run, which is exactly right here: the gate must hold at first
 * paint, before any IPC) and asserts the sections are reachable ONLY for a
 * prdt po-state. The child sections are mocked to visible sentinels so their
 * own IPC-driven self-hiding can't mask a broken gate.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { vi, test, expect } from 'vitest'

const h = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
}))

vi.mock('../../store/workspace', () => {
  const useWorkspace = (sel: (s: Record<string, unknown>) => unknown) => sel(h.state)
  ;(useWorkspace as unknown as { getState: () => unknown }).getState = () => h.state
  return { useWorkspace }
})

// Sentinels: without api mocks the real sections self-hide (plan === null at
// first render), which would make the gate assertion vacuously pass for the
// prdt case. The gate — not the children's self-hiding — is under test.
vi.mock('./MetaBackupSection', () => ({
  default: () => createElement('div', null, 'META_BACKUP_SENTINEL'),
}))
vi.mock('./MetaMigrateSection', () => ({
  default: () => createElement('div', null, 'META_MIGRATE_SENTINEL'),
}))

// Key-echo t(): the global setup stubs src/i18n, so the real useTranslation
// would warn about a missing instance; the gate doesn't depend on copy.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}))

// The global zustand stub breaks the curried create()() form poModel uses —
// stub the store module itself (PoSessionSection self-hides regardless).
vi.mock('../../store/poModel', () => ({
  usePoModel: (sel: (s: Record<string, unknown>) => unknown) => sel({ observedByAlias: {} }),
  poModelOptionLabel: (m: string) => m,
}))

import GeneralSettings from './GeneralSettings'

function renderWith(poState: Record<string, unknown> | null): string {
  h.state = {
    project: { projectDir: '/tmp/proj' },
    poState,
    statusBarVisible: true,
  }
  return renderToStaticMarkup(createElement(GeneralSettings))
}

test('legacy (.productune) po-state → meta sections unreachable (T-370 C1)', () => {
  const html = renderWith({ current_phase: 3, current_version: 'v2' })
  expect(html).not.toContain('META_BACKUP_SENTINEL')
  expect(html).not.toContain('META_MIGRATE_SENTINEL')
})

test('no po-state loaded yet → meta sections stay hidden (conservative default)', () => {
  const html = renderWith(null)
  expect(html).not.toContain('META_BACKUP_SENTINEL')
  expect(html).not.toContain('META_MIGRATE_SENTINEL')
})

test('prdt po-state → meta sections reachable', () => {
  const html = renderWith({ stage: 'ship', version: 'v1.2' })
  expect(html).toContain('META_BACKUP_SENTINEL')
  expect(html).toContain('META_MIGRATE_SENTINEL')
})
