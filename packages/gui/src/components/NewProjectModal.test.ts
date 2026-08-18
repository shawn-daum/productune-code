/**
 * QA error-surface regression (T-431 follow-up): a main-process throw during
 * `project:create` (e.g. ensurePrdtCliAvailable's actionable ko messages, or
 * runPrdtCli's `prdt init failed: <detail>`) reaches the renderer wrapped by
 * Electron's ipcRenderer.invoke as
 *   `Error invoking remote method '<channel>': Error: <message>`
 * — the user must see only the actionable `<message>`, never the IPC wrapper
 * or the JS Error-class prefix. See NewProjectModal.tsx's stripIpcErrorWrapper.
 */

import { test, expect } from 'vitest'
import { stripIpcErrorWrapper } from './NewProjectModal'

test('T-431 QA: strips the full Electron IPC + Error-class wrapper, leaving only the actionable ko message', () => {
  const raw = "Error invoking remote method 'project:create': Error: macOS 개발자 도구(python3)가 필요해요 — 방금 뜬 Apple 설치 창에서 \"설치\"를 누르고, 완료된 뒤 다시 시도해 주세요."
  expect(stripIpcErrorWrapper(raw)).toBe(
    'macOS 개발자 도구(python3)가 필요해요 — 방금 뜬 Apple 설치 창에서 "설치"를 누르고, 완료된 뒤 다시 시도해 주세요.',
  )
})

test('T-431 QA: preserves colons INSIDE the actual message (only the one Error-class wrapper colon is stripped)', () => {
  const raw = "Error invoking remote method 'project:create': Error: prdt init failed: exit code 1: something broke"
  expect(stripIpcErrorWrapper(raw)).toBe('prdt init failed: exit code 1: something broke')
})

test('T-431 QA: handles the wrapper with no Error-class prefix (message starts immediately after the channel colon)', () => {
  const raw = "Error invoking remote method 'project:create': 프로젝트 실행 환경을 자동으로 준비하지 못했어요"
  expect(stripIpcErrorWrapper(raw)).toBe('프로젝트 실행 환경을 자동으로 준비하지 못했어요')
})

test('T-431 QA: a message with no IPC wrapper at all passes through unchanged (trimmed)', () => {
  expect(stripIpcErrorWrapper('plain error, no wrapper')).toBe('plain error, no wrapper')
})
