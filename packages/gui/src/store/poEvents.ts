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

import i18next from '../i18n'
import { useWorkspace } from './workspace'
import { useUserTodo } from './useUserTodo'
import { useQaLoop } from './useQaLoop'
import { useSessionHealth } from './sessionHealth'
import { usePersonaPresence, personaIdFromAgentType } from './personaPresence'
import type { Message, MessageKind } from '../lib/types'

// ── Module-level guards ────────────────────────────────────────────────────────
let registered = false
const offFns: Array<(() => void) | undefined> = []

// ── T-PATCH-036: chronological text↔tool interleave ─────────────────────────────
// The runner (po-runner.ts:442-457) already emits text/tool parts in execution
// order, but the store previously collapsed a whole turn into ONE text bubble
// (frozen at its early array index) + N tail-appended traces — so groupToolTraces
// folded all tools BELOW all text. Fix = text SEGMENTATION: when a tool trace
// arrives mid-turn we "seal" the active text bubble; the next onToken opens a NEW
// text bubble appended AFTER the trace(s). messages[] then becomes chronological
// ([seg-A][trace][trace][seg-B]…) and the existing adjacency-fold yields inline
// groups at their true spot — no change to groupToolTraces / ToolUseGroup (T-033).
//
// State lives in module scope (one in-flight turn at a time; the renderer only
// ever streams a single assistant turn — `streaming` is a boolean, `inFlightMsgId`
// a single id). We track:
//   - segActiveId: id of the text bubble currently receiving tokens.
//   - segSealed:   true once a tool trace arrived since the last token, meaning the
//                  next token must open a fresh segment.
//   - turnSegIds:  every text-segment id created during this turn, in order, so
//                  onDone can finalize + persist ALL of them (not just msgId).
// Reset on each onMsgId (turn start) and after onDone.
let segActiveId: string | null = null
let segSealed = false
let turnSegIds: string[] = []

// ── T-PATCH-039: duplicate-chunk guard (defense-in-depth) ───────────────────────
// The runner emits each assistant text part exactly ONCE per turn (verified:
// `claude --print --output-format stream-json` delivers full text blocks, never
// deltas-then-cumulative and never a re-fired assistant event). So a chunk that
// arrives byte-identical to the immediately-preceding chunk for the SAME active
// segment is a duplicate delivery, never legitimate streaming. We drop it. This
// is belt-and-suspenders behind the preload single-subscriber fix: even if a
// duplicate po:onToken slips through (stacked listener, main-side double send),
// the active bubble can never self-concatenate the same text. Keyed by segment
// id so a fresh segment (post-seal) starts clean and an intentional repeat in a
// LATER segment is unaffected. Reset on turn start / done.
let lastChunkBySeg: Record<string, string> = {}

function newSegmentId(): string {
  return `seg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// ── T-PATCH-038: seal the active text segment ───────────────────────────────────
// When a segment boundary arrives (tool trace / AskUserQuestion card), the prior
// active text bubble is no longer receiving tokens. Flip its `status`
// 'streaming' → 'done' so MessageBubble stops rendering the blinking cursor (▋)
// on it. Only the CURRENT active segment (or the next one a trailing token opens)
// keeps status 'streaming' → at most one live cursor at the bottom. onDone still
// finalizes/persists all segments; this only affects the in-flight render.
function sealActiveSegment(): void {
  segSealed = true
  const sealId = segActiveId
  if (!sealId) return
  useWorkspace.setState((s) => {
    const idx = s.messages.findIndex((m) => m.id === sealId)
    if (idx < 0 || s.messages[idx].status !== 'streaming') return s
    const next = [...s.messages]
    next[idx] = { ...next[idx], status: 'done' }
    return { messages: next }
  })
}

// ── IPC listener registration ─────────────────────────────────────────────────
function register() {
  if (registered) return
  registered = true

  const api = (window as any).api
  if (!api?.poOnToken) return  // browser dev mode — IPC bridge 부재

  // ── po:onMsgId — placeholder bubble 생성 ─────────────────────────────────
  offFns.push(api.poOnMsgId?.((msgId: string) => {
    // T-PATCH-281 (AC-6 next-turn trigger (i)): a new PO turn starting clears any
    // worker result panels held from the previous turn. The worker completion +
    // freeze happen WITHIN a single PO turn's stream (dispatch→task_notification→
    // PO reaction all in one runPoTurn), so this onMsgId — which fires at the START
    // of the NEXT turn (user chat / answerQuestion resume / fresh-cycle) — is the
    // correct clear point, never mid-turn. The other AC-6 trigger (a worker entering
    // `working`) is handled in personaPresence.setPersonaState.
    usePersonaPresence.getState().clearWorkerResults()
    const kind: MessageKind = useWorkspace.getState().inFlightKind ?? 'po'
    const placeholder: Message = {
      id: msgId,
      role: 'assistant',
      kind,
      text: '',
      status: 'streaming',
      created_at: new Date().toISOString(),
    }
    // T-PATCH-132: set streaming:true here so every entry point (FreshComposer first
    // turn AND normal ChatPanel turns) transitions PersonaPresenceBar to the working
    // state. Idempotent for ChatPanel (handleSubmit already set streaming:true before
    // onMsgId fires). onDone already sets streaming:false — no leak.
    // T-PATCH-163: stamp streamingSince (idempotent via `?? Date.now()` so the
    // ChatPanel handleSubmit setStreaming(true) stamp survives) + reset the
    // per-turn char count to 0 at turn start (WorkingIndicator approx-tokens).
    useWorkspace.setState((s) => ({
      messages: [...s.messages, placeholder],
      inFlightMsgId: msgId,
      streaming: true,
      streamingSince: s.streamingSince ?? Date.now(),
      turnCharCount: 0,
      // T-309: fresh turn → no tool has streamed yet (drives the PO activity line).
      latestPoTool: null,
    }))
    // T-PATCH-036: this first bubble is segment #1 of the turn — active, unsealed.
    segActiveId = msgId
    segSealed = false
    turnSegIds = [msgId]
    lastChunkBySeg = {}  // T-PATCH-039: fresh dup-guard per turn
  }))

  // ── po:onToken — active segment 에 chunk append (T-PATCH-036) ─────────────
  // The runner always passes the original turn msgId; we route the chunk to the
  // CURRENT segment (segActiveId). If a tool trace sealed the segment since the
  // last token, open a NEW text bubble first and make it active (segment open).
  offFns.push(api.poOnToken?.((msgId: string, chunk: string) => {
    // Fallback for the (defensive) case where a token arrives with no prior
    // onMsgId — treat the incoming msgId as the active segment.
    if (segActiveId === null) {
      segActiveId = msgId
      segSealed = false
      if (!turnSegIds.includes(msgId)) turnSegIds = [msgId]
    }
    if (segSealed) {
      // Open a fresh segment appended AFTER the trace(s) that sealed the last one.
      const newId = newSegmentId()
      const kind: MessageKind = useWorkspace.getState().inFlightKind ?? 'po'
      const seg: Message = {
        id: newId,
        role: 'assistant',
        kind,
        text: chunk,
        status: 'streaming',
        created_at: new Date().toISOString(),
      }
      segActiveId = newId
      segSealed = false
      turnSegIds.push(newId)
      lastChunkBySeg[newId] = chunk  // T-PATCH-039: seed dup-guard for the new seg
      // T-PATCH-163: accumulate approx-token chars on the real append (single
      // setState — folded into this same write so the indicator gets 1 re-render).
      useWorkspace.setState((s) => ({
        messages: [...s.messages, seg],
        turnCharCount: s.turnCharCount + chunk.length,
      }))
      return
    }
    const activeId = segActiveId
    // T-PATCH-039: drop a byte-identical immediate repeat for this segment — it is
    // a duplicate delivery, not real streaming (see lastChunkBySeg note above).
    if (lastChunkBySeg[activeId] === chunk) return
    lastChunkBySeg[activeId] = chunk
    useWorkspace.setState((s) => {
      const idx = s.messages.findIndex((m) => m.id === activeId)
      if (idx < 0) return s
      const updated = { ...s.messages[idx], text: s.messages[idx].text + chunk }
      const next = [...s.messages]
      next[idx] = updated
      // T-PATCH-163: accumulate approx-token chars on the real append only — the
      // dup-guard drop above (early return) is skipped, never double-counts.
      return { messages: next, turnCharCount: s.turnCharCount + chunk.length }
    })
  }))

  // ── po:onAnnounce — system trace 메시지 ──────────────────────────────────
  // T-PATCH-087: resolve structured kind → localized string via i18next.
  const resolveText = (payload: { level: string; text: string; kind?: string; code?: number }): string => {
    if (payload.kind === 'turn-aborted') return i18next.t('workspace.chat.turn.aborted')
    if (payload.kind === 'exit-error')   return i18next.t('workspace.chat.turn.exitError', { code: payload.code })
    return payload.text
  }

  offFns.push(api.poOnAnnounce?.((_msgId: string, payload: { level: string; text: string; kind?: string; code?: number; toolName?: string; toolInput?: unknown }) => {
    const trace: Message = {
      id: `trace-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: 'system',
      kind: 'trace',
      text: resolveText(payload),
      // T-PATCH-033: carry level so the renderer can group consecutive `tool` traces.
      traceLevel: payload.level,
      // T-PATCH-108: carry parsed tool name + raw input for per-tool detail render.
      toolName: payload.toolName,
      toolInput: payload.toolInput,
      status: 'done',
      created_at: new Date().toISOString(),
    }
    useWorkspace.setState((s) => ({ messages: [...s.messages, trace] }))
    // T-PATCH-036: a `tool` trace is a segment boundary — seal the active text
    // bubble so the next token opens a fresh segment BELOW this trace. Only `tool`
    // seals (matches groupToolTraces, which only folds `tool` traces); other
    // announce levels don't fragment the text flow. An all-text turn (no tool
    // trace) never seals → stays one bubble (AC3). A trace before any token (e.g.
    // tool-only turn) seals an empty active bubble; the empty seg is pruned at
    // onDone so no orphan renders (AC4).
    // T-PATCH-038: seal also flips the sealed segment's status off 'streaming'
    // so its cursor disappears the moment the tool trace lands.
    if (payload.level === 'tool') {
      sealActiveSegment()
      // T-309: track the latest PO tool_use for the live activity line. This is
      // the top-level PO's own tool (po-runner.ts:~1558) — a delegated worker's
      // tool activity flows through the separate poOnWorkerStream channel below
      // and never lands here, so this never shows a sub-agent's tool as PO's own.
      if (payload.toolName) {
        useWorkspace.getState().setLatestPoTool({ toolName: payload.toolName, input: payload.toolInput })
      }
    }
  }))

  // ── po:onAskUserQuestion — inline option card (T-PATCH-037) ──────────────
  // PO emitted an AskUserQuestion. Append an 'ask-user-question' Message that
  // AskUserQuestionCard renders inline. Treat it like a tool-trace boundary:
  // seal the active text segment so the card lands chronologically AFTER any
  // preceding prose and a fresh text segment opens for trailing tokens
  // (mirrors the onAnnounce 'tool' seal). The card uses a distinct id
  // (auq-<msgId>) so it never collides with turnSegIds — the onDone prune must
  // not treat it as an empty text segment.
  offFns.push(
    api.poOnAskUserQuestion?.(
      (
        msgId: string,
        payload: {
          question: string
          options: Array<{ key: string; title: string; description?: string }>
        },
      ) => {
        const card: Message = {
          id: `auq-${msgId}`,
          role: 'assistant',
          kind: 'ask-user-question',
          text: '',
          status: 'done',
          payload,
          created_at: new Date().toISOString(),
        }
        useWorkspace.setState((s) => ({ messages: [...s.messages, card] }))
        // Seal so trailing tokens open a fresh segment below the card.
        // T-PATCH-038: also turns the prior segment's cursor off.
        sealActiveSegment()
        // Persist now (the onDone prune only walks turnSegIds, which excludes
        // this distinct card id) so the card survives reload — the resolved
        // chip later re-renders from payload.resolved patched by the answer IPC.
        const proj = useWorkspace.getState().project
        if (proj) {
          void api.chatAppendMessage(proj.projectDir, card).catch(() => {})
        }
      },
    ),
  )

  // ── po:onPromotionCandidate — inline promotion card (T-PATCH-100) ────────
  // PO emitted a promotion candidate. Append a 'promotion-candidate' Message that
  // MessageBubble forks to PromotionQuestionCard (origin === 'user-requested') or
  // the classic PromotionCard (origin 'auto'/absent — 097 branch). Treat it like
  // a tool-trace boundary (mirrors onAskUserQuestion): seal the active text
  // segment so the card lands chronologically AFTER preceding prose. Distinct id
  // `promo-<msgId>` so it never collides with turnSegIds (onDone prune skips it).
  offFns.push(
    api.poOnPromotionCandidate?.(
      (
        msgId: string,
        payload: {
          candidateSummary: string
          targetTier: string
          rationale: string
          sourceTicketId: string
          origin?: 'user-requested' | 'auto'
        },
      ) => {
        // Unique per candidate: a single turn may emit multiple candidates that
        // all share `msgId`, so a bare `promo-${msgId}` would collide (dup React
        // keys + ambiguous resolvePromotion patch). Suffix a short nonce.
        const card: Message = {
          id: `promo-${msgId}-${Math.random().toString(36).slice(2, 7)}`,
          role: 'assistant',
          kind: 'promotion-candidate',
          text: '',
          status: 'done',
          payload,
          created_at: new Date().toISOString(),
        }
        useWorkspace.setState((s) => ({ messages: [...s.messages, card] }))
        // Seal so trailing tokens open a fresh segment below the card.
        sealActiveSegment()
        // Persist now (onDone prune only walks turnSegIds, excluding this id) so
        // the card survives reload — resolved card later re-renders from
        // payload.resolved patched by chat:resolvePromotion.
        const proj = useWorkspace.getState().project
        if (proj) {
          void api.chatAppendMessage(proj.projectDir, card).catch(() => {})
        }
      },
    ),
  )

  // ── po:onDone — done 표시 + chat.json persist + sessionId 갱신 ───────────
  // T-PATCH-036: a turn may now have MULTIPLE text segments (turnSegIds). We:
  //   1. drop empty segments (e.g. the initial placeholder of a tool-only turn,
  //      or a trailing seg opened by a seal that never received tokens) — AC3/AC4
  //      no orphan empty bubble.
  //   2. mark every surviving segment `done` (in array, preserving order).
  //   3. persist each surviving segment to chat.json IN ORDER (AC6) — append-only
  //      per-message model (OQ-1: persist-at-done rather than a shared turnId; the
  //      lower-regression path against the existing chatAppendMessage API).
  // NOTE: tool `trace` messages are not persisted (unchanged pre-T-036 behavior —
  // onAnnounce never persisted); reload re-renders text segments in order. Tool
  // group re-hydration on reload is a separate data-plumbing concern (see T-033
  // toolDetailUnavailable / out-of-scope).
  offFns.push(api.poOnDone?.(async (msgId: string, info: { sessionId?: string }) => {
    const segIds = turnSegIds.length > 0 ? turnSegIds : [msgId]
    const finalMsgs: Message[] = []
    useWorkspace.setState((s) => {
      const segSet = new Set(segIds)
      const next: Message[] = []
      for (const m of s.messages) {
        if (segSet.has(m.id)) {
          // Prune empty text segments — no content to show or persist.
          if (m.text.length === 0) continue
          const done = { ...m, status: 'done' as const }
          finalMsgs.push(done)
          next.push(done)
        } else {
          next.push(m)
        }
      }
      // T-PATCH-163: clear streamingSince so the WorkingIndicator unmounts at turn end.
      // T-PATCH-262: set awaitingUser=true so trayBridge shows red-dot (PO handed turn to user).
      // T-309: clear latestPoTool — the activity line has nothing to show between turns.
      return { messages: next, streaming: false, inFlightMsgId: null, streamingSince: null, awaitingUser: true, latestPoTool: null }
    })
    // Reset turn-local segmentation state.
    segActiveId = null
    segSealed = false
    turnSegIds = []
    lastChunkBySeg = {}  // T-PATCH-039
    const proj = useWorkspace.getState().project
    if (proj && finalMsgs.length > 0) {
      for (const fm of finalMsgs) {
        try { await api.chatAppendMessage(proj.projectDir, fm) } catch { /* ignore */ }
      }
    }
    if (proj && info.sessionId) {
      useWorkspace.setState({ claudeSessionId: info.sessionId })
      try { await api.chatSetClaudeSessionId(proj.projectDir, info.sessionId) } catch { /* ignore */ }
    }
  }))

  // ── po:worker-stream (T-PATCH-270 #9) ────────────────────────────────────
  // Delegated-worker output tail lines (designer/dev/qa). Main side already
  // coalesces deltas into whole lines + skips noise, so this is line-rate, not
  // token-rate. pushStreamLine maps persona, HARD-EXCLUDES PO, and re-asserts
  // `working` as a #10 backstop. subagent-done collapses the ring (above).
  offFns.push(api.poOnWorkerStream?.((payload: { persona: string; line: string; kind?: 'prose' | 'tool' }) => {
    const personaId = personaIdFromAgentType(payload.persona)
    if (!personaId || personaId === 'po') return
    if (typeof payload.line !== 'string' || !payload.line.trim()) return
    // T-PATCH-281 (#4): forward the prose/tool kind so the renderer can style it.
    usePersonaPresence.getState().pushStreamLine(personaId, payload.line, payload.kind ?? 'tool')
  }))

  // ── po:worker-meta (T-PATCH-281 AC-7) ────────────────────────────────────
  // Read-only worker cost/duration meta (usage + started/completed ms). Merged
  // into personaPresence.workerMeta; the result panel reads it for the token +
  // duration display. Missing usage → the renderer silently drops that line.
  offFns.push(api.poOnWorkerMeta?.((payload: {
    persona: string
    usage?: { total_tokens?: number; tool_uses?: number; duration_ms?: number }
    startedAt?: number
    completedAt?: number
  }) => {
    const personaId = personaIdFromAgentType(payload.persona)
    if (!personaId || personaId === 'po') return
    usePersonaPresence.getState().setWorkerMeta(personaId, {
      usage: payload.usage,
      startedAt: payload.startedAt,
      completedAt: payload.completedAt,
    })
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
        `user-verify:${payload.ticketId}`, 'browser', { url: payload.url }, i18next.t('workspace.userVerify.tabTitle'),
      )
    }
    useUserTodo.getState().pushItems([{
      id: `verify-${payload.ticketId}`,
      description: i18next.t('workspace.userVerify.todoCheck', { description: payload.description }),
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
    // T-PATCH-164: subagent-done 은 presence 전용 신호 — sessionHealth 표면
    // (banner/statusbar/PoFab)에 노출되면 안 된다. sessionHealth.setHealth 는
    // HEALTH_PRIORITY 에 없는 state 를 무해하게 무시하지 못하고(undefined <= n === false)
    // 오히려 state 를 'subagent-done' 으로 덮어쓰므로, 여기서 setHealth 보다 먼저
    // 분기해 early-return 으로 격리한다(AC-5).
    if (event?.state === 'subagent-done') {
      const personaId = personaIdFromAgentType(event?.detail?.persona ?? '')
      if (personaId && personaId !== 'po') {
        const presence = usePersonaPresence.getState()
        // T-PATCH-281 (AC-6/§Persist-reconcile): FREEZE the live tail + meta into
        // workerResult BEFORE clearing the live ring, so the result panel survives
        // the sprite's 2s done→idle auto-collapse and persists until the next turn.
        presence.freezeWorkerResult(personaId)
        const cur = presence.entries[personaId]
        // working 일 때만 done 으로 — 이미 done/idle 이면 no-op(중복 done 방지).
        // done 진입 → personaPresence 의 auto-idle 타이머가 2.0s 후 idle 마무리.
        if (cur.state === 'working') presence.setPersonaState(personaId, 'done')
        // T-PATCH-270 (#9): collapse this worker's LIVE stream ring on completion.
        // The frozen workerResult (above) is what keeps the panel alive (AC-6).
        presence.clearStreamTail(personaId)
      }
      return  // setHealth 미호출 — banner/statusbar/PoFab 회귀 방지.
    }

    // SessionHealth 표면(banner/statusbar/PoFab)은 그대로 유지 — 회귀 방지.
    useSessionHealth.getState().setHealth(event)

    // T-PATCH-148 (Q1): sub-agent presence 라이프사이클 구동.
    //   delegating + detail.persona → 매핑된 sub-agent chip 을 'working' 으로.
    // PO chip 은 usePOPresenceDerive(workspace.streaming)가 단독 소유하므로
    // 여기서는 po 매핑 시 no-op(PO→PO 위임 방어).
    //
    // T-PATCH-279: the old `healthy → flip ALL working workers to done` branch was
    // REMOVED. Under agent-teams (CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1) the Agent
    // dispatch is ASYNC — the parent PO turn ends (emits `healthy`) WHILE the
    // delegated worker is still running in the background. Mass-flipping workers to
    // done on the parent's `healthy` therefore killed the worker sprite mid-work
    // (the worker would finish many seconds/minutes later via a separate
    // task_notification, with NO matching delegating event). Completion is now
    // driven SOLELY by the per-worker `subagent-done` signal (handled above), which
    // the runner keys off the real agent-teams task_notification(status:completed)
    // — so each worker flips done→idle at its OWN true completion, independent of
    // the parent turn and independent of parallel siblings (AC-1/2/3). The legacy
    // blocking path also fires subagent-done at its tool_result, so dropping the
    // mass-flip is regression-safe there too (AC-4).
    const presence = usePersonaPresence.getState()
    if (event?.state === 'delegating' && typeof event?.detail?.persona === 'string') {
      const personaId = personaIdFromAgentType(event.detail.persona)
      // 매핑 불가(null) 또는 'po' 는 무시 — PO chip 은 derive 가 단독 소유.
      if (personaId && personaId !== 'po') {
        const task = typeof event.detail.task === 'string' ? event.detail.task : undefined
        presence.setPersonaState(personaId, 'working', { task })
      }
    }
  }))
  offFns.push(api.poOnSessionRestarted?.(() => {
    useWorkspace.setState({ claudeSessionId: null })
    useSessionHealth.getState().clearHealth()
    // T-PATCH-279 (QA follow-up): safety net for the "no terminal task signal ever"
    // case (session abort / PO turn crash / worker process gone before any
    // task_notification or task_updated). After removing the parent-turn `healthy`
    // sweep, a worker sprite stuck in `working` has no other in-session rescue —
    // auto-idle is done-only, and dismissDone no-ops on `working`. A session restart
    // is a hard reset point (claudeSessionId + health are already cleared here), so
    // reset persona presence too: workers drop to idle and stream tails collapse.
    // PO is re-derived from `streaming` on the next turn (usePOPresenceDerive).
    usePersonaPresence.getState().resetAll()
  }))

  // ── po:onTicketFocus (T-P4-114 §B) ───────────────────────────────────────
  // Moved from WorkspaceShell useEffect.
  offFns.push(api.poOnTicketFocus?.(({ ticketId }: { ticketId: string }) => {
    useWorkspace.getState().openTab(
      `ticket-review:${ticketId}`, 'ticket-review', { ticketId }, ticketId,
    )
  }))

  // ── notification:navigate (T-019 §B3) ────────────────────────────────────
  // User clicked a native OS notification → main focused the window + sent the
  // route here. Route to the relevant surface via the existing openTab action.
  //   - ticket-review: open/focus the ticket review tab (dispatch-done / escalation)
  //   - phase-gate:    window focus alone surfaces the sticky PendingGateChip in
  //                    ChatPanel; no tab to open, so this is a no-op beyond focus.
  offFns.push(api.onNotificationNavigate?.((route: {
    surface: 'ticket-review' | 'phase-gate' | 'chat'
    ticketId?: string
  }) => {
    if (route.surface === 'ticket-review' && route.ticketId) {
      useWorkspace.getState().openTab(
        `ticket-review:${route.ticketId}`, 'ticket-review',
        { ticketId: route.ticketId }, route.ticketId,
      )
    }
    // phase-gate: PendingGateChip is sticky in ChatPanel; window focus suffices.
    // chat (po-turn-done): ChatPanel is the default visible surface; window
    // focus (handled by main) is sufficient — no tab open needed.
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
