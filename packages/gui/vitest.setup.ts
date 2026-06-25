/**
 * vitest.setup.ts — module stubs for GUI unit tests.
 *
 * The GUI source imports Electron (main-process) and React-ecosystem modules
 * (zustand, i18next) that cannot run in a plain Node test environment. This
 * setup file installs lightweight stubs so that test files can import the
 * pure-function exports they actually need without crashing at module load.
 *
 * This file is specified in vitest.config.ts `setupFiles` and runs once before
 * each test file.
 */

import { vi } from 'vitest'

// ── Electron stub ─────────────────────────────────────────────────────────────
// costArchive.ts imports `ipcMain` and `BrowserWindow` from 'electron' but only
// uses them in the IPC registration block — not in the pure aggregation functions
// we are testing. Stub the entire electron module so the file loads cleanly.
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
  app: {
    getPath: vi.fn(() => '/tmp'),
    getVersion: vi.fn(() => '0.0.0'),
  },
}))

// ── Zustand stub ──────────────────────────────────────────────────────────────
// workspace.ts calls create() at module level to register the Zustand store.
// In Node/test environment, Zustand itself works but the store subscribes to
// sessionStorage (via persist + createJSONStorage). Mocking the whole module is
// the cleanest way to avoid the DOM dependency.
vi.mock('zustand', () => ({
  create: vi.fn(() => vi.fn()),
}))

vi.mock('zustand/middleware', () => ({
  persist: vi.fn((_fn: unknown) => _fn),
  createJSONStorage: vi.fn(),
}))

// ── i18n stubs ────────────────────────────────────────────────────────────────
// workspace.ts imports '../i18n' which initializes i18next with react-i18next.
// In a Node test environment this is unnecessary for the functions under test.
vi.mock('../src/i18n', () => ({
  default: { t: (k: string) => k, language: 'en' },
}))

// Stub the i18n relative path used by workspace.ts itself (../i18n from store/)
vi.mock('./src/i18n', () => ({
  default: { t: (k: string) => k, language: 'en' },
}))
