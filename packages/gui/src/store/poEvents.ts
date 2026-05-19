/**
 * store/poEvents.ts — 단일 책임: main → renderer IPC 이벤트의 단일 구독 진입점.
 *
 * JS load 시점에 1회 등록 → FreshComposer / ChatPanel mount 와 무관하게
 * 'po:onMsgId' 등 first wc.send 가 항상 listener-bound 상태에서 수신됨.
 * (T-P4-119: FreshComposer → PO response race-fix — renderer listener uplift)
 *
 * StrictMode double-eval 가드: 모듈 스코프 'registered' flag.
 * HMR 가드: import.meta.hot.dispose 에서 offFn 일괄 호출 후 'registered' 리셋.
 *
 * 추가 uplift (T-P4-119 §3.5 grep):
 *   - poOnHealth / poOnSessionRestarted  ← WorkspaceShell useEffect 에서 이동
 *   - poOnTicketFocus                    ← WorkspaceShell useEffect 에서 이동
 *   - poOnArtifactOpen                  ← WorkspaceShell 에 유지 (local toast state 의존)
 */

import { useWorkspace } from './workspace'
import { useUserTodo } from './useUserTodo'
import { useQaLoop } from './useQaLoop'
import { useSessionHealth } from './sessionHealth'
import type { Message, MessageKind } from '../lib/types'

// ── Module-level guards ────────────────────────────────────────────────────────
let registered = false
const offFns: Array<(() => void) | undefined> = []

// ── IPC listener registration ─────────────────────────────────────────────────
function register() {
  if (registered) return
  registered = true

  const api = (window as any).api
  if (!api?.poOnToken) return  // browser dev mode — IPC bridge 부재

  // ── po:onMsgId — placeholder bubble 생성 ─────────────────────────────────
  offFns.push(api.poOnMsgId?.((msgId: string) => {
    const kind: MessageKind = useWorkspace.getState().inFlightKind ?? 'po'
    const placeholder: Message = {
      id: msgId,
      role: 'assistant',
      kind,
      text: '',
      status: 'streaming',
      created_at: new Date().toISOString(),
    }
    useWorkspace.setState((s) => ({
      messages: [...s.messages, placeholder],
      inFlightMsgId: msgId,
    }))
  }))

  // ── po:onToken — placeholder 에 chunk append ──────────────────────────────
  offFns.push(api.poOnToken?.((msgId: string, chunk: string) => {
    useWorkspace.setState((s) => {
      const idx = s.messages.findIndex((m) => m.id === msgId)
      if (idx < 0) return s
      const updated = { ...s.messages[idx], text: s.messages[idx].text + chunk }
      const next = [...s.messages]
      next[idx] = updated
      return { messages: next }
    })
  }))

  // ── po:onAnnounce — system trace 메시지 ──────────────────────────────────
  offFns.push(api.poOnAnnounce?.((_msgId: string, payload: { level: string; text: string }) => {
    const trace: Message = {
      id: `trace-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: 'system',
      kind: 'trace',
      text: payload.text,
      status: 'done',
      created_at: new Date().toISOString(),
    }
    useWorkspace.setState((s) => ({ messages: [...s.messages, trace] }))
  }))

  // ── po:onDone — done 표시 + chat.json persist + sessionId 갱신 ───────────
  offFns.push(api.poOnDone?.(async (msgId: string, info: { sessionId?: string }) => {
    let finalMsg: Message | null = null
    useWorkspace.setState((s) => {
      const idx = s.messages.findIndex((m) => m.id === msgId)
      if (idx < 0) return s
      const updated = { ...s.messages[idx], status: 'done' as const }
      finalMsg = updated
      const next = [...s.messages]
      next[idx] = updated
      return { messages: next, streaming: false, inFlightMsgId: null }
    })
    const proj = useWorkspace.getState().project
    if (proj && finalMsg) {
      try { await api.chatAppendMessage(proj.projectDir, finalMsg) } catch { /* ignore */ }
    }
    if (proj && info.sessionId) {
      useWorkspace.setState({ claudeSessionId: info.sessionId })
      try { await api.chatSetClaudeSessionId(proj.projectDir, info.sessionId) } catch { /* ignore */ }
    }
  }))

  // ── po:onTodoItems / po:onTodoDismiss (T-P4-113) ─────────────────────────
  offFns.push(api.poOnTodoItems?.((items: any[]) => {
    useUserTodo.getState().pushItems(items)
  }))
  offFns.push(api.poOnTodoDismiss?.((ids: string[]) => {
    useUserTodo.getState().dismissByIds(ids)
  }))

  // ── onBrowserOpen / onUserVerify / onQaLoopUpdate (T-P4-116) ─────────────
  offFns.push(api.onBrowserOpen?.((payload: {
    url: string; ticketId: string; purpose: 'qa-smoke' | 'user-verify'
  }) => {
    const tabId = `browser:${payload.ticketId}:${payload.purpose}`
    useWorkspace.getState().openTab(tabId, 'browser', { url: payload.url }, 'Browser')
  }))

  offFns.push(api.onUserVerify?.((payload: {
    url?: string; description: string; ticketId: string
  }) => {
    if (payload.url) {
      useWorkspace.getState().openTab(
        `user-verify:${payload.ticketId}`, 'browser', { url: payload.url }, '확인 필요',
      )
    }
    useUserTodo.getState().pushItems([{
      id: `verify-${payload.ticketId}`,
      description: `${payload.description} 후 체크`,
      type: payload.url ? 'link' : 'check',
      href: payload.url,
    }])
  }))

  offFns.push(api.onQaLoopUpdate?.((payload: {
    ticketId: string; attempt: number; maxAttempts: number
    status: 'dev-running' | 'qa-running' | 'pass' | 'fail' | 'capped' | 'auth-required'
    lastFailReason?: string
  }) => {
    useQaLoop.getState().setEntry(payload)
  }))

  // ── po:onHealth / po:onSessionRestarted (T-P4-059) ───────────────────────
  // Moved from WorkspaceShell useEffect — no race risk there (WorkspaceShell mounts
  // after workspace entry), but uplift keeps all IPC registrations in one place.
  offFns.push(api.poOnHealth?.((event: any) => {
    useSessionHealth.getState().setHealth(event)
  }))
  offFns.push(api.poOnSessionRestarted?.(() => {
    useWorkspace.setState({ claudeSessionId: null })
    useSessionHealth.getState().clearHealth()
  }))

  // ── po:onTicketFocus (T-P4-114 §B) ───────────────────────────────────────
  // Moved from WorkspaceShell useEffect.
  offFns.push(api.poOnTicketFocus?.(({ ticketId }: { ticketId: string }) => {
    useWorkspace.getState().openTab(
      `ticket-review:${ticketId}`, 'ticket-review', { ticketId }, ticketId,
    )
  }))
}

try {
  register()
} catch (e) {
  // If register() throws (e.g. IPC bridge unavailable mid-init or unexpected
  // runtime error), log and continue — the app should still render.
  // This prevents module evaluation from crashing the renderer.
  console.error('[poEvents] register() threw unexpectedly:', e)
}

// ── HMR 가드 ─────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _hot = (import.meta as any).hot
if (_hot) {
  _hot.dispose(() => {
    for (const off of offFns) try { off?.() } catch { /* ignore */ }
    offFns.length = 0
    registered = false
  })
}
