/**
 * ChatPanel — Right panel chat UI (T-P4-041, mockup 5-row layout).
 *
 *   rp-hdr        35 px   header (PO badge + title + restart)
 *   rp-ctx       ~28 px   phase chip + round-N · T-NNN action
 *   rp-persona-bar 24 px  T-P4-049 (positioned here via this component)
 *   rp-msgs       flex-1  message list — 6 bubble kinds
 *   rp-input      auto    textarea + send button (no persona selector — v2 sub-c)
 *
 * Single PO session per project. Persists to <projectDir>/.productune/chat.json.
 * Streaming via main-process spawn of `claude --output-format stream-json`,
 * with echo-mode fallback when claude CLI isn't installed.
 *
 * v2 doctrine sub-c: persona selector removed. PO orchestrator decides dispatch
 * autonomously per `po-instructions.md` Routing. Visibility = PersonaPresenceBar.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Paperclip, Command, CornerDownLeft, X, Square } from 'lucide-react'
import { useWorkspace } from '../../store/workspace'
import { usePoChat } from '../../store/poChat'
import type { Message, AskUserQuestionPayload } from '../../lib/types'
import PersonaPresenceBar from './PersonaPresenceBar'
import MessageBubble from './chat/MessageBubble'
import ToolUseGroup from './chat/ToolUseGroup'
import TodoChip from './chat/TodoChip'
import TodoListPanel from './chat/TodoListPanel'
import PendingGateChip from './chat/PendingGateChip'
import RateLimitBanner from './chat/RateLimitBanner'
import UsageBar from './chat/UsageBar'
import AskUserQuestionCard from './chat/AskUserQuestionCard'
import { useSessionHealth } from '../../store/sessionHealth'


export default function ChatPanel() {
  const { t } = useTranslation()
  const project = useWorkspace((s) => s.project)
  const messages = useWorkspace((s) => s.messages)
  const poState = useWorkspace((s) => s.poState)
  const claudeSessionId = useWorkspace((s) => s.claudeSessionId)
  const streaming = useWorkspace((s) => s.streaming)

  // T-PATCH-052: session restart state — declare before renderItems useMemo
  const restartCompleted = usePoChat((s) => s.restartCompleted)
  const setRestartCompleted = usePoChat((s) => s.setRestartCompleted)
  const [restartToastVisible, setRestartToastVisible] = useState(false)
  const [restartDividerMarkers, setRestartDividerMarkers] = useState<Array<string | null>>([])

  // T-PATCH-033: fold consecutive tool-use traces into one group node.
  // T-PATCH-052: inject session dividers at restart marker positions.
  const renderItems = useMemo(
    () => injectDividers(groupToolTraces(messages), restartDividerMarkers),
    [messages, restartDividerMarkers],
  )

  // T-PATCH-065: dismissed question id — hides modal without resolving
  const [dismissedQuestionId, setDismissedQuestionId] = useState<string | null>(null)

  // T-PATCH-068: most-recent-only — last ask-user-question is the ONLY pending candidate.
  // resolved or dismissed → nothing pending; older questions never resurface (AC-6/7/8).
  const pendingQuestion = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.kind === 'ask-user-question')
    if (!last) return undefined
    if ((last.payload as any)?.resolved) return undefined   // option-select → chip → no pending (AC-7)
    if (last.id === dismissedQuestionId) return undefined    // X-dismiss → no pending (AC-7)
    return last
  }, [messages, dismissedQuestionId])

  const setMessages = useWorkspace((s) => s.setMessages)
  const appendMessage = useWorkspace((s) => s.appendMessage)
  const setClaudeSessionId = useWorkspace((s) => s.setClaudeSessionId)
  const setStreaming = useWorkspace((s) => s.setStreaming)

  // ── Session health (T-012) ────────────────────────────────────────────────
  const healthState = useSessionHealth((s) => s.state)
  const healthDetail = useSessionHealth((s) => s.detail)
  const clearHealth = useSessionHealth((s) => s.clearHealth)
  const rateLimited = healthState === 'rate-limited'

  const draft = usePoChat((s) => s.inputDraft)
  const setDraft = usePoChat((s) => s.setDraft)
  const autoScrollLocked = usePoChat((s) => s.autoScrollLocked)
  const setAutoScrollLocked = usePoChat((s) => s.setAutoScrollLocked)

  const msgsRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  // ── Load session on project change ───────────────────────────────────────
  useEffect(() => {
    if (!project) return
    const api = (window as any).api
    api.chatGetSession(project.projectDir).then((session: any) => {
      const msgs: Message[] = (session?.messages ?? []).map((m: Message) => ({
        ...m,
        kind: m.kind ?? (m.role === 'user' ? 'user' : 'po'),
      }))
      setMessages(msgs)
      setClaudeSessionId(session?.claude_session_id ?? null)
    }).catch(() => { /* no session yet */ })
  }, [project, setMessages, setClaudeSessionId])

  // ── Auto-scroll ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (autoScrollLocked) return
    const el = msgsRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, autoScrollLocked])

  const onScroll = () => {
    const el = msgsRef.current
    if (!el) return
    const atBottom = el.scrollHeight - (el.scrollTop + el.clientHeight) < 24
    setAutoScrollLocked(!atBottom)
  }

  // ── Submit ──────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const trimmed = draft.trim()
    if (!trimmed && attachedFiles.length === 0) return
    if (streaming || !project) return

    // Compose body — attached files prefixed as a small block PO/claude can read.
    // T-PATCH-098 §4.d §5: pasted images get a numbered `#N → path` map so PO can
    // deref the inline `[Image #N]` tokens left in the prose; paperclip files keep
    // the plain `- path` form. Text-only block — no PO/runner format change.
    const imageLines = attachments.map((a) => `- #${a.seq} → ${a.path}`)
    const otherLines = otherFiles.map((p) => `- ${p}`)
    const allLines = [...imageLines, ...otherLines]
    const filesBlock = allLines.length > 0
      ? `## Attached files\n${allLines.join('\n')}\n\n`
      : ''
    const text = `${filesBlock}${trimmed}`

    const userMsg: Message = {
      id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: 'user',
      kind: 'user',
      text,
      status: 'done',
      created_at: new Date().toISOString(),
    }
    // T-PATCH-098 §4.c: snapshot the attachment paths being sent BEFORE we clear
    // state, so the post-send L2 cleanup can target exactly these paths.
    const sentPaths = attachedFiles

    appendMessage(userMsg)
    setDraft('')
    setOtherFiles([])
    // T-PATCH-098 §4.c.1.c: send → revoke ALL preview URLs before clearing the
    // attachments (memory cleanup; independent of the disk-file L2 cleanup below).
    attachmentsRef.current.forEach((a) => {
      if (a.previewUrl) URL.revokeObjectURL(a.previewUrl)
    })
    setAttachments([])
    // §4.d §1: send empties draft + attachments → reset the token counter so the
    // next message starts a fresh `#1` number space.
    nextImageSeqRef.current = 1
    setAutoScrollLocked(false)

    const api = (window as any).api
    try { await api.chatAppendMessage(project.projectDir, userMsg) } catch { /* ignore */ }

    // PO is the sole entry point — pre-allocated assistant bubble is `po` kind.
    // Dispatch decisions surface via PersonaPresenceBar (T-P4-049), not here.
    // inFlightKind/Id state now lives in workspace store (T-P4-119 uplift).
    useWorkspace.getState().setInFlightKind('po')
    setStreaming(true)
    try {
      await api.poSendMessage({
        projectDir: project.projectDir,
        text,
        resume: claudeSessionId,
      })
      // T-PATCH-098 §4.c.2.c L2: PO has now consumed the `## Attached files`
      // paths. Hand ALL sent paths to main, which unlinks only those under the
      // temp `productune/pasted` root (paperclip originals are containment-
      // skipped). Triggered from the RENDERER (not ipc/po.ts) per T-PATCH-100
      // ownership. Never deletes before PO read — sequenced after resolve.
      if (sentPaths.length > 0) {
        try { await api.cleanupAttachments({ paths: sentPaths }) } catch { /* best-effort */ }
      }
    } catch (e) {
      setStreaming(false)
      useWorkspace.getState().setInFlightMsgId(null)
    }
  }

  // T-PATCH-081 AC-5: keyboard guard confirmed. Cmd+Enter calls handleSubmit() which
  // has an early-return guard `if (streaming || !project) return` (line ~125 above).
  // So the keyboard path is blocked during streaming — no new code needed here.
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // IME composition — don't capture Enter mid-Korean composition.
    if ((e.nativeEvent as any).isComposing) return
    // Cmd+Enter (or Ctrl+Enter) → submit. Plain Enter → newline (default).
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  // T-PATCH-065: modal draft state + send/keydown handlers
  const [modalDraft, setModalDraft] = useState('')

  const handleModalSend = useCallback(async () => {
    const trimmed = modalDraft.trim()
    if (!trimmed || streaming || !project) return

    const userMsg: Message = {
      id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: 'user',
      kind: 'user',
      text: trimmed,
      status: 'done',
      created_at: new Date().toISOString(),
    }
    appendMessage(userMsg)
    setModalDraft('')
    setAutoScrollLocked(false)

    const api = (window as any).api
    try { await api.chatAppendMessage(project.projectDir, userMsg) } catch { /* ignore */ }

    useWorkspace.getState().setInFlightKind('po')
    setStreaming(true)
    try {
      await api.poSendMessage({
        projectDir: project.projectDir,
        text: trimmed,
        resume: claudeSessionId,
      })
    } catch {
      setStreaming(false)
      useWorkspace.getState().setInFlightMsgId(null)
    }
  }, [modalDraft, streaming, project, claudeSessionId, appendMessage, setAutoScrollLocked, setStreaming])

  // T-PATCH-081 AC-6: modal keyboard guard confirmed. Cmd+Enter calls handleModalSend()
  // which has `if (!trimmed || streaming || !project) return` — blocked during streaming.
  const onModalKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.nativeEvent as any).isComposing) return
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleModalSend()
    }
  }

  // T-PATCH-068/073: X button — no LLM round-trip; synthesise a PO bubble + persist (AC-5~8)
  // T-PATCH-073: also stamps payload.resolved: { chosenKey: '__dismissed__' } so
  // pendingQuestion's !resolved guard excludes the card after remount / reload.
  const handleDismissQuestion = useCallback(async () => {
    if (!pendingQuestion || !project) return

    // T-PATCH-073: optimistic store patch — excluded by pendingQuestion on re-render
    const msgs = useWorkspace.getState().messages
    setMessages(
      msgs.map((m) =>
        m.id === pendingQuestion.id
          ? {
              ...m,
              payload: {
                ...(m.payload as AskUserQuestionPayload),
                resolved: { chosenKey: '__dismissed__' },
              },
            }
          : m,
      ),
    )

    setDismissedQuestionId(pendingQuestion.id)   // immediate hide guard (AC-8)

    const poMsg: Message = {
      id: `po-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: 'assistant',
      kind: 'po',
      text: '질문 답변 보류, 어떻게 진행하시겠어요?',
      status: 'done',
      created_at: new Date().toISOString(),
    }
    appendMessage(poMsg)
    setAutoScrollLocked(false)

    const api = (window as any).api
    try { await api.chatAppendMessage(project.projectDir, poMsg) } catch { /* noop */ }  // persist PO bubble (AC-7)
    // T-PATCH-073: persist resolved/dismissed to chat.json — no PO resume
    try { await api.chatDismissQuestion({ projectDir: project.projectDir, messageId: pendingQuestion.id }) } catch { /* noop */ }
  }, [pendingQuestion, project, appendMessage, setAutoScrollLocked, setMessages])

  // T-PATCH-081: abort the running PO turn via IPC + immediately unlock the UI.
  // AC-11: fire-and-forget IPC (no await needed for UI responsiveness).
  // AC-11: belt-and-suspenders setStreaming(false) so UI never hangs if child.on('close') is delayed.
  // AC-13: echo-mode safe — abortPoTurn() maps to a safe no-op when activeChild === null.
  const handleAbort = useCallback(() => {
    const api = (window as any).api
    // Fire-and-forget; silence any IPC or API errors so UI always unlocks.
    try { api.abortPoTurn?.().catch?.(() => {}) } catch { /* noop */ }
    // Immediate UI unlock regardless of main-process child.on('close') timing.
    setStreaming(false)
  }, [setStreaming])

  // textarea autosize — height follows content (cap 200px).
  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [draft])

  // T-PATCH-098 §4.d: non-image paperclip attachments keep their own list and the
  // existing file-chip path (no inline token, no ImageRef). Pasted images live in
  // `attachments` (the inline-citation source of truth) below.
  const [otherFiles, setOtherFiles] = useState<string[]>([])
  const [filesListOpen, setFilesListOpen] = useState(false)

  // T-PATCH-098 §4.d: single source-of-truth for inline-referenced pasted images.
  // Each ImageRef carries the stable token N (seq), the temp disk path (PO key),
  // and the object-URL preview (§4.c). `attachedFiles`/`previewUrls` are DERIVED
  // from this — no duplicate state. Order = paste order = chip display order.
  const [attachments, setAttachments] = useState<ImageRef[]>([])
  // §4.d §1: monotonic, never-reused token counter (1-based). A ref because the
  // value is read/incremented inside async paste handlers, not rendered directly.
  const nextImageSeqRef = useRef(1)

  // §4.d §2: PO-transport path list = image paths + paperclip files. Images first
  // so their `#N → path` mapping order matches the chip row.
  const attachedFiles = useMemo(
    () => [...attachments.map((a) => a.path), ...otherFiles],
    [attachments, otherFiles],
  )

  // T-PATCH-098 §4.c: object-URL thumbnail previews are now carried on each
  // ImageRef. A ref mirrors the latest attachments so the unmount cleanup revokes
  // every live URL (no leak), even for URLs created after the last render.
  const attachmentsRef = useRef<ImageRef[]>([])
  useEffect(() => { attachmentsRef.current = attachments }, [attachments])
  useEffect(
    () => () => {
      attachmentsRef.current.forEach((a) => {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl)
      })
    },
    [],
  )

  // T-PATCH-052 / T-PATCH-104: session restart completion → toast + divider.
  // Split into two responsibilities so the 3s hide timer NEVER depends on
  // `messages`. Previously a single effect listed `messages` in its deps, so any
  // message update within the 3s window re-ran the effect; the re-run's cleanup
  // fired clearTimeout and killed the hide timer → toast stuck forever (T-PATCH-104).
  //
  // The divider needs the last message id, which DOES change with `messages`. We
  // mirror that id into a ref every render so the toast effect can read it without
  // listing `messages` as a dependency.
  const lastMsgIdRef = useRef<string | null>(null)
  lastMsgIdRef.current = messages.length > 0 ? messages[messages.length - 1].id : null

  // Toast + divider effect — depends ONLY on the restart signal. Reading the
  // last message id via ref keeps `messages` out of the dep array, so the hide
  // timer survives message updates (AC-2). Signal is consumed here exactly once.
  useEffect(() => {
    if (!restartCompleted) return
    // Consume the signal
    setRestartCompleted(false)
    // Record the divider position: after the current last message (read via ref,
    // so this effect does not re-run on every message update). (AC-3)
    setRestartDividerMarkers((prev) => [...prev, lastMsgIdRef.current])
    // Show toast for 3s (AC-1)
    setRestartToastVisible(true)
    const timer = setTimeout(() => setRestartToastVisible(false), 3000)
    return () => clearTimeout(timer)
  }, [restartCompleted, setRestartCompleted])

  const onAttachFile = async () => {
    try {
      const paths: string[] = await (window as any).api.openFilePicker()
      if (!paths || paths.length === 0) return
      // dedupe (drag-add same file twice). Paperclip files are non-image
      // attachments → never inline-tokenized (§4.d §2).
      setOtherFiles((prev) => {
        const set = new Set(prev)
        for (const p of paths) set.add(p)
        return Array.from(set)
      })
      requestAnimationFrame(() => taRef.current?.focus())
    } catch { /* IPC unavailable — noop */ }
  }

  // T-PATCH-098 §4.d §4.B: chip X → strip the matching `[Image #N]` token from the
  // draft AND drop its ImageRef (revoking the preview URL). draft + attachments are
  // updated together so the §4.A reconcile is idempotent (no loop). stable numbers
  // mean no other token text is rewritten.
  const removeImageRef = (seq: number) => {
    const re = new RegExp(`\\s?\\[Image #${seq}\\]\\s?`, 'g')
    setDraft(draft.replace(re, ' ').replace(/\s{2,}/g, ' ').trimStart())
    setAttachments((prev) => {
      const target = prev.find((a) => a.seq === seq)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((a) => a.seq !== seq)
    })
  }

  // Paperclip (non-image) attachment removal — path-based, no inline token.
  const removeOtherFile = (path: string) => {
    setOtherFiles((prev) => prev.filter((p) => p !== path))
  }

  // T-PATCH-098: clipboard image paste → persist to disk → add to attachedFiles.
  // Reuses the existing "attachment = path" flow so the image rides the same
  // `## Attached files` path block to PO (no message/runner format change).
  // Non-image paste falls through to default textarea text-paste (no regression).
  const onComposerPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!project) return
    const items = Array.from(e.clipboardData?.items ?? [])
    // §3 out-of-scope: multi-image — take the FIRST image item only.
    const imageItem = items.find(
      (it) => it.kind === 'file' && it.type.startsWith('image/'),
    )
    if (!imageItem) return // non-image paste → keep default text-paste behavior

    // An image is present: block the default paste (which would do nothing useful
    // for a binary blob anyway) and route it through the disk-persist IPC.
    e.preventDefault()
    const file = imageItem.getAsFile()
    if (!file) return

    try {
      const buf = await file.arrayBuffer()
      const bytes = Array.from(new Uint8Array(buf))
      // image/png → png, image/jpeg → jpeg, etc. Fallback handled main-side.
      const ext = imageItem.type.split('/')[1] || 'png'
      const res = await (window as any).api.saveAttachmentImage({
        projectDir: project.projectDir,
        bytes,
        ext,
      })
      if (res?.ok && res.path) {
        // §4.d §1: pull a stable, never-reused token number for this image.
        const seq = nextImageSeqRef.current++
        // T-PATCH-098 §4.c.1.a: build the preview from the SAME pasted blob
        // (object URL). Created only inside the success branch → no orphan URL
        // on save failure. Disk path stays the PO-transport channel; the
        // preview is decoupled from it.
        const url = URL.createObjectURL(file)
        setAttachments((prev) => [...prev, { seq, path: res.path, previewUrl: url }])

        // §4.d §3: insert the inline `[Image #N]` citation at the textarea cursor,
        // whitespace-normalized so the token never glues to adjacent words (which
        // would break the parse regex). Then move the caret past the token.
        const ta = taRef.current
        const s = ta ? ta.selectionStart : draft.length
        const e2 = ta ? ta.selectionEnd : draft.length
        const token = `[Image #${seq}]`
        const before = draft.slice(0, s)
        const after = draft.slice(e2)
        const padLeft = before.length > 0 && !/\s$/.test(before) ? ' ' : ''
        const padRight = after.length === 0 || !/^\s/.test(after) ? ' ' : ''
        const insert = `${padLeft}${token}${padRight}`
        const next = before + insert + after
        setDraft(next)
        const caret = before.length + insert.length
        requestAnimationFrame(() => {
          const el = taRef.current
          if (el) {
            el.focus()
            el.selectionStart = el.selectionEnd = caret
          }
        })
      }
      // save failure → silently ignored; textarea input is untouched (AC: safe ignore)
    } catch {
      /* clipboard/IPC unavailable — noop, textarea stays intact */
    }
  }

  // T-PATCH-098 §4.d: pasted images (with inline tokens) render as numbered chips;
  // paperclip files keep the existing file chip. `attachments` IS the image list.
  const otherAttachments = otherFiles

  // T-PATCH-098 §4.d §4.A: textarea = source of truth. On every change, parse the
  // live `[Image #N]` tokens and drop any ImageRef whose seq no longer appears
  // (token deleted or broken). Resets the counter when draft + attachments are
  // both empty (fresh `#1` number space). Idempotent — re-runs after removeImageRef
  // converge to the same result (no loop).
  const onComposerChange = (value: string) => {
    setDraft(value)
    const present = new Set(
      [...value.matchAll(IMAGE_TOKEN_RE)].map((m) => Number(m[1])),
    )
    setAttachments((prev) => {
      const kept = prev.filter((a) => present.has(a.seq))
      if (kept.length === prev.length) return prev
      // revoke preview URLs of dropped refs (memory); temp disk file is left for
      // the L1 24h purge / post-send L2 cleanup (§4.c) — not unlinked here.
      for (const a of prev) {
        if (!present.has(a.seq) && a.previewUrl) URL.revokeObjectURL(a.previewUrl)
      }
      return kept
    })
    if (value.trim() === '' && attachmentsRef.current.length === 0 && otherFiles.length === 0) {
      nextImageSeqRef.current = 1
    }
  }

  const [sendHover, setSendHover] = useState(false)
  const [stopHover, setStopHover] = useState(false)
  const [attachHover, setAttachHover] = useState(false)
  const [restartTipPos, setRestartTipPos] = useState<{ top: number; left: number } | null>(null)
  const restartBtnRef = useRef<HTMLButtonElement>(null)
  const setRestartModalOpen = usePoChat((s) => s.setRestartModalOpen)

  const onRestartClick = () => {
    setRestartModalOpen(true)
  }
  const onRestartEnter = () => {
    const r = restartBtnRef.current?.getBoundingClientRect()
    if (r) setRestartTipPos({ top: r.bottom + 6, left: r.right })
  }
  const onRestartLeave = () => setRestartTipPos(null)

  // ── ctx caption ─────────────────────────────────────────────────────────
  const ctxCaption = useMemo(() => {
    const ticketId = poState?.current_task?.ticket_id
    if (!ticketId) return t('workspace.chat.idleCtx')
    const action = t('workspace.chat.actionDefault')
    return `${ticketId} ${action}`
  }, [poState, t])

  // T-PATCH-068: questionOverlayNode removed — replaced by in-flow docked panel below (AC-1).

  return (
    <>
      <div style={wrap}>
        {/* rp-hdr — T-PATCH-053: [P badge] [title] [status badge] [restart text btn] */}
        <div style={header}>
          <span style={poBadge}>P</span>
          <span style={headerTitle}>{t('workspace.chat.title')}</span>
          <span style={statusBadge}>{ctxCaption}</span>
          <button
            ref={restartBtnRef}
            style={restartTextBtn}
            onMouseEnter={onRestartEnter}
            onMouseLeave={onRestartLeave}
            onClick={onRestartClick}
            aria-label={t('workspace.chat.restartSession')}
          >
            {t('workspace.chat.restartSession')}
          </button>
        </div>

        {/* T-PATCH-096 AC-4: redundant rp-ctx PhaseBreadcrumb removed (duplicate of
            main-pane top header). PersonaPresenceBar now follows the header directly. */}

        {/* rp-persona-bar (T-P4-049) */}
        <PersonaPresenceBar />

        {/* rp-todo-chip (T-P4-113) — hidden when openCount === 0 */}
        <TodoChip />

        {/* rp-todo-panel (T-P4-113) — accordion, expands below chip */}
        <TodoListPanel />

        {/* rp-pending-gate-chip (T-P4-158) — hidden when pending_gate == null */}
        <PendingGateChip />

        {/* rp-msgs */}
        <div style={msgs} ref={msgsRef} onScroll={onScroll} className="rp-msgs">
          {messages.length === 0 ? (
            <div style={emptyHint}>{t('workspace.chat.emptyHint')}</div>
          ) : (
            renderItems.map((item) =>
              item.kind === 'tool-group' ? (
                <ToolUseGroup key={item.key} tools={item.tools} />
              ) : item.kind === 'session-divider' ? (
                // T-PATCH-052: session restart divider (AC-2, AC-3)
                <div key={item.key} style={sessionDivider}>
                  <span style={sessionDividerLine} />
                  <span style={sessionDividerLabel}>{t('workspace.chat.sessionDivider')}</span>
                  <span style={sessionDividerLine} />
                </div>
              ) : (
                // T-PATCH-062: suppress unresolved pendingQuestion from list (AC-2); resolved still shows (AC-3)
                item.message.kind === 'ask-user-question' &&
                !(item.message.payload as any)?.resolved &&
                pendingQuestion?.id === item.message.id ? null : (
                  <MessageBubble key={item.message.id} message={item.message} />
                )
              ),
            )
          )}
        </div>

        {/* rp-rate-limit-banner (T-012) — visible only when rate-limited */}
        {rateLimited && (
          <RateLimitBanner
            detail={healthDetail}
            onExpired={() => {
              clearHealth()
              setStreaming(false)
            }}
          />
        )}

        {/* T-PATCH-068: in-flow docked question panel — replaces composer while pending (AC-1/2) */}
        {pendingQuestion ? (
          <div style={questionDock}>
            <div style={dockHeader}>
              <span style={dockLabel}>질문</span>
              <button style={modalCloseBtn} onClick={handleDismissQuestion} aria-label="질문 보류">
                <X size={16} strokeWidth={2} />
              </button>
            </div>
            <div style={dockBody}>
              <AskUserQuestionCard message={pendingQuestion} />
            </div>
            <div style={modalInputArea}>
              <textarea
                style={modalTextarea}
                value={modalDraft}
                onChange={(e) => setModalDraft(e.target.value)}
                onKeyDown={onModalKeyDown}
                placeholder={t('workspace.chat.inputPlaceholder')}
                rows={1}
                disabled={streaming || !project || rateLimited}
              />
              {/* T-PATCH-081 AC-4: modal composer also shows stop while streaming */}
              {streaming ? (
                <button
                  style={{ ...modalSendBtn, background: '#EF4444' }}
                  onClick={handleAbort}
                  aria-label="Stop generation"
                  title={t('workspace.chat.stop')}
                >
                  <Square size={14} strokeWidth={2.5} />
                </button>
              ) : (
                <button
                  style={{
                    ...modalSendBtn,
                    opacity: !modalDraft.trim() ? 0.5 : 1,
                    cursor: !modalDraft.trim() ? 'not-allowed' : 'pointer',
                  }}
                  onClick={handleModalSend}
                  disabled={!modalDraft.trim()}
                >
                  {t('workspace.chat.send')}
                </button>
              )}
            </div>
          </div>
        ) : (
        /* rp-input — textarea (auto-grow) + paperclip + send (Cmd+Enter) */
        <div style={inputArea}>
          {/* rp-usage-bar (T-025, T-PATCH-071) — always 2-row column; horizontal prop removed so
              "resets in …" never truncates regardless of panel width. */}
          <UsageBar />

          {/* T-PATCH-098 §4.d §4/§7: numbered image chips ABOVE the textarea, each
              labelled with the `#N` matching its inline `[Image #N]` citation. chip
              X strips the token from the draft (§4.B). flex-wrap row (§4.b). */}
          {attachments.length > 0 && (
            <div style={chipRow}>
              {attachments.map((a) => (
                <ImageChip
                  key={a.seq}
                  seq={a.seq}
                  path={a.path}
                  previewUrl={a.previewUrl}
                  onRemove={() => removeImageRef(a.seq)}
                />
              ))}
            </div>
          )}

          <textarea
            ref={taRef}
            style={textarea}
            value={draft}
            onChange={(e) => onComposerChange(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onComposerPaste}
            placeholder={t('workspace.chat.inputPlaceholder')}
            rows={1}
            disabled={streaming || !project || rateLimited}
          />

          <div style={inputRow}>
            <button
              style={{
                ...iconActionBtn,
                background: attachHover ? '#2A2A2A' : 'transparent',
                color: attachHover ? '#F0F0F0' : '#A0A0A0',
              }}
              onMouseEnter={() => setAttachHover(true)}
              onMouseLeave={() => setAttachHover(false)}
              onClick={onAttachFile}
              aria-label={t('workspace.chat.attachFile')}
              title={t('workspace.chat.attachFile')}
              disabled={streaming || !project || rateLimited}
            >
              <Paperclip size={14} strokeWidth={2} />
            </button>

            {/* T-PATCH-098: chip counts NON-image attachments only; pasted images
                surface as thumbnails above. */}
            {otherAttachments.length > 0 && (
              <div
                style={fileChipWrap}
                onMouseEnter={() => setFilesListOpen(true)}
                onMouseLeave={() => setFilesListOpen(false)}
              >
                <span style={fileChip}>
                  {otherAttachments.length === 1
                    ? basename(otherAttachments[0])
                    : `${otherAttachments.length} ${t('workspace.chat.filesCount')}`}
                </span>
                {filesListOpen && (
                  <div style={fileListPopup}>
                    {otherAttachments.map((p) => (
                      <div key={p} style={fileListRow}>
                        <span style={fileListPath} title={p}>{p}</span>
                        <button
                          style={fileListRemove}
                          onClick={() => removeOtherFile(p)}
                          aria-label={t('workspace.chat.removeFile')}
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ flex: 1 }} />
            {/* T-PATCH-081 AC-1/2: stop button replaces send while streaming; AC-2: not in DOM when idle */}
            {streaming ? (
              <button
                style={{
                  ...sendBtn,
                  background: stopHover ? '#DC2626' : '#EF4444',
                }}
                onMouseEnter={() => setStopHover(true)}
                onMouseLeave={() => setStopHover(false)}
                onClick={handleAbort}
                aria-label="Stop generation"
                title={t('workspace.chat.stop')}
              >
                <Square size={14} strokeWidth={2.5} />
              </button>
            ) : (
              <button
                style={{
                  ...sendBtn,
                  opacity: !draft.trim() || rateLimited ? 0.5 : 1,
                  // T-013 / T-006 Option B: send button = --persona-po violet
                  background: sendHover && !(!draft.trim() || rateLimited) ? '#9D74F8' : '#8B5CF6',
                }}
                onMouseEnter={() => setSendHover(true)}
                onMouseLeave={() => setSendHover(false)}
                onClick={handleSubmit}
                disabled={!draft.trim() || !project || rateLimited}
                title={t('workspace.chat.sendShortcut')}
                aria-label={`${t('workspace.chat.send')} (${t('workspace.chat.sendShortcut')})`}
              >
                <span>{t('workspace.chat.send')}</span>
                {/* ⌘+Enter shortcut representation — lucide glyphs, §7 stroke-bold @≤12px */}
                <span style={kbdHint} aria-hidden="true">
                  <Command size={11} strokeWidth={2.5} />
                  <CornerDownLeft size={11} strokeWidth={2.5} />
                </span>
              </button>
            )}
          </div>
        </div>
        )} {/* T-PATCH-068: end pendingQuestion ternary — normal composer restored */}

        {/* T-PATCH-052: session restart completion toast (AC-1) */}
        {restartToastVisible && (
          <div style={restartToast}>
            {t('workspace.chat.restartCompletedToast')}
          </div>
        )}
      </div>

      {restartTipPos && createPortal(
        <div
          style={{
            position: 'fixed',
            top: restartTipPos.top,
            left: restartTipPos.left,
            transform: 'translateX(-100%)',
            background: '#1E1E1E',
            border: '1px solid #2A2A2A',
            color: '#E0E0E0',
            padding: '4px 9px',
            borderRadius: 4,
            fontSize: 11,
            lineHeight: 1.3,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 1000,
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            maxWidth: 'calc(100vw - 20px)',
          }}
        >
          {t('workspace.chat.restartHint')}
        </div>,
        document.body,
      )}
    </>
  )
}

// ── T-PATCH-033: tool-trace grouping ──────────────────────────────────────────
// Fold a run of adjacent `trace` messages whose traceLevel === 'tool' into one
// `tool-group` node; everything else passes through unchanged. A non-tool message
// breaks the run (AC1). Group key = first tool message id → stable React
// reconciliation while a turn is still streaming new tool lines into the group (AC5).
// N=1 still produces a group (no flat-line special path, AC2).

type RenderItem =
  | { kind: 'message'; message: Message }
  | { kind: 'tool-group'; key: string; tools: Message[] }
  | { kind: 'session-divider'; key: string }

/**
 * T-PATCH-052: inject session-divider items after the message with the given id,
 * or at the start when afterId === null. Multiple dividers are each inserted at
 * their recorded position (stable across new messages arriving after restart).
 */
function injectDividers(items: RenderItem[], markers: Array<string | null>): RenderItem[] {
  if (markers.length === 0) return items

  const result: RenderItem[] = []
  let dividerIdx = 0

  // dividers with null → prepend before first item
  for (const marker of markers) {
    if (marker === null) {
      result.push({ kind: 'session-divider', key: `sd-null-${dividerIdx++}` })
    }
  }

  for (const item of items) {
    result.push(item)
    const msgId =
      item.kind === 'message' ? item.message.id
      : item.kind === 'tool-group' ? item.tools[item.tools.length - 1]?.id
      : null
    if (msgId) {
      for (const marker of markers) {
        if (marker === msgId) {
          result.push({ kind: 'session-divider', key: `sd-${msgId}-${dividerIdx++}` })
        }
      }
    }
  }

  return result
}

function isToolTrace(m: Message): boolean {
  return m.kind === 'trace' && m.traceLevel === 'tool'
}

function groupToolTraces(messages: Message[]): RenderItem[] {
  const items: RenderItem[] = []
  let run: Message[] | null = null

  const flush = () => {
    if (run && run.length > 0) {
      items.push({ kind: 'tool-group', key: `tg-${run[0].id}`, tools: run })
    }
    run = null
  }

  for (const m of messages) {
    if (isToolTrace(m)) {
      if (run) run.push(m)
      else run = [m]
    } else {
      flush()
      items.push({ kind: 'message', message: m })
    }
  }
  flush()
  return items
}

// ── styles ────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  gridArea: 'chat',
  width: '100%',
  background: '#141414',
  borderLeft: '1px solid #2A2A2A',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  minWidth: 0,
  // T-PATCH-052: needed for absolute-positioned restart toast
  position: 'relative',
}

const header: React.CSSProperties = {
  height: 35,
  flexShrink: 0,
  borderBottom: '1px solid #2A2A2A',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '0 12px',
}

// T-013 / T-006 Option B: poBadge = --persona-po violet (was orange #FF6B2B)
const poBadge: React.CSSProperties = {
  width: 20,
  height: 20,
  borderRadius: 4,
  background: '#8B5CF6',
  color: '#0F0F0F',
  fontSize: 11,
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
}

const headerTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#F0F0F0',
  flex: 1,
}

// T-PATCH-053: status badge in title row (replaces ctxCaptionStyle in ctxRow)
const statusBadge: React.CSSProperties = {
  fontSize: 10,
  color: '#707070',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  flexShrink: 0,
  maxWidth: 120,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

// T-PATCH-053: text button replacing RefreshCw icon (AC-4)
const restartTextBtn: React.CSSProperties = {
  height: 22,
  background: 'transparent',
  border: '1px solid #2A2A2A',
  color: '#707070',
  fontSize: 10,
  cursor: 'pointer',
  borderRadius: 4,
  padding: '0 8px',
  fontFamily: 'inherit',
  flexShrink: 0,
  whiteSpace: 'nowrap',
}

const msgs: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '8px 10px',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}

const emptyHint: React.CSSProperties = {
  fontSize: 11,
  color: '#505050',
  textAlign: 'center',
  marginTop: 24,
  padding: '0 16px',
}

const inputArea: React.CSSProperties = {
  flexShrink: 0,
  borderTop: '1px solid #2A2A2A',
  padding: 8,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  background: '#121212',
}

const textarea: React.CSSProperties = {
  width: '100%',
  minHeight: 36,
  maxHeight: 200,
  background: '#1E1E1E',
  border: '1px solid #2A2A2A',
  borderRadius: 6,
  color: '#F0F0F0',
  fontSize: 12,
  padding: '8px 10px',
  outline: 'none',
  resize: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  lineHeight: 1.5,
  overflow: 'hidden',
}

const inputRow: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  alignItems: 'center',
}

const iconActionBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  padding: 0,
  flexShrink: 0,
  transition: 'background 0.12s ease, color 0.12s ease',
}

// T-013 / T-006 Option B: sendBtn base bg overridden inline per sendHover state
const sendBtn: React.CSSProperties = {
  height: 28,
  padding: '0 12px',
  background: '#8B5CF6',
  border: 'none',
  borderRadius: 6,
  color: '#FFFFFF',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  transition: 'background 0.12s ease, opacity 0.12s ease',
}

const kbdHint: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 1,
  background: 'rgba(0,0,0,0.18)',
  borderRadius: 3,
  padding: '2px 4px',
  marginLeft: 2,
}

function basename(p: string): string {
  const seg = p.split('/').filter(Boolean)
  const name = seg[seg.length - 1] ?? p
  return name.length > 24 ? `${name.slice(0, 21)}…` : name
}

// T-PATCH-098 §4.d: inline image citation token. ONE module-level regex drives
// insertion (literal), parse/reconcile (matchAll), and strip — locale-invariant.
// Token literal `[Image #N]` matches cmux/Claude-Code so PO/agent recognizes it.
const IMAGE_TOKEN_RE = /\[Image #(\d+)\]/g

// T-PATCH-098 §4.d: single source-of-truth for an inline-referenced image.
// seq = stable token N (never reused/renumbered); path = temp abs path (PO key);
// previewUrl = object URL for the chip thumbnail (§4.c).
type ImageRef = {
  seq: number
  path: string
  previewUrl?: string
}

// T-PATCH-098 §4.b: cmux-style attachment chip — icon-only reference token.
// No <img>/file:// anywhere, so the renderer can never paint a broken-image
// glyph. The pill rides above the textarea in a flex-wrap row (chipRow).

// Lucide `Image` glyph as inline SVG (imports region left untouched per scope).
// 14px tile icon, soft stroke, --text-secondary — matches §4.b tile spec.
function ImageGlyph(): JSX.Element {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  )
}

// chipRow — flex-wrap row of attachment chips between textarea and inputRow.
const chipRow: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
}

const chip: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-1-5)',
  height: 28,
  maxWidth: 180,
  paddingLeft: 'var(--space-1)',
  paddingRight: 'var(--space-2)',
  background: 'var(--surface-subpanel)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-lg)',
  transition: 'border-color var(--motion-fast) ease',
  flexShrink: 0,
}

const chipTile: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 20,
  height: 20,
  flexShrink: 0,
  background: 'var(--surface-base)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--text-secondary)',
  // T-PATCH-098 §4.c.1.b: clip the object-URL <img> to the tile's rounded box.
  overflow: 'hidden',
}

// T-PATCH-098 §4.c.1.b: object-URL thumbnail fills the 20×20 tile (cover).
const chipThumb: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  borderRadius: 'var(--radius-md)',
  display: 'block',
}

const chipLabel: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: 'var(--text-sm)',
  fontWeight: 400,
  color: 'var(--text-secondary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

// §4.d §7: `#N` citation prefix — one shade muted vs the label (number = aux info).
const chipSeq: React.CSSProperties = {
  color: 'var(--text-muted)',
}

const chipRemove: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 16,
  height: 16,
  flexShrink: 0,
  padding: 0,
  border: 'none',
  borderRadius: '9999px',
  background: 'transparent',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  transition: 'background var(--motion-fast) ease, color var(--motion-fast) ease',
}

// ImageChip — single attachment pill. Hover affordances per §4.b/§3:
// chip border → strong, X bg/color → one step brighter. Raw filename only in
// the title tooltip; the visible label is the localized "image" token.
function ImageChip({
  seq,
  path,
  previewUrl,
  onRemove,
}: {
  seq: number
  path: string
  previewUrl?: string
  onRemove: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const [hover, setHover] = useState(false)
  const [xHover, setXHover] = useState(false)
  return (
    <div
      style={{
        ...chip,
        borderColor: hover ? 'var(--border-strong)' : 'var(--border-default)',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={path}
    >
      <span style={chipTile}>
        {/* T-PATCH-098 §4.c.1.b: real thumbnail from the pasted bytes
            (object URL) when available; lucide Image glyph fallback when the
            attachment is path-only (e.g. paperclip-picked, no bytes). No
            file:// anywhere → broken-glyph structurally impossible. */}
        {previewUrl ? (
          <img
            src={previewUrl}
            alt=""
            aria-hidden="true"
            draggable={false}
            style={chipThumb}
          />
        ) : (
          <ImageGlyph />
        )}
      </span>
      {/* §4.d §7: `#N` prefix (muted — number is secondary info) matches the
          inline [Image #N] token; localized label follows in --text-secondary. */}
      <span style={chipLabel}>
        <span style={chipSeq}>#{seq}</span> {t('workspace.chat.imageLabel')}
      </span>
      <button
        style={{
          ...chipRemove,
          background: xHover ? 'var(--surface-base)' : 'transparent',
          color: xHover ? 'var(--text-secondary)' : 'var(--text-muted)',
        }}
        onMouseEnter={() => setXHover(true)}
        onMouseLeave={() => setXHover(false)}
        onClick={onRemove}
        aria-label={t('workspace.chat.removeImage')}
        title={t('workspace.chat.removeImage')}
      >
        <X size={12} strokeWidth={3} />
      </button>
    </div>
  )
}

const fileChipWrap: React.CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
}

const fileChip: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: 24,
  padding: '0 8px',
  borderRadius: 4,
  background: '#1E1E1E',
  border: '1px solid #2A2A2A',
  color: '#C8C8CC',
  fontSize: 11,
  fontFamily: 'monospace',
  maxWidth: 180,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  userSelect: 'none',
}

const fileListPopup: React.CSSProperties = {
  position: 'absolute',
  bottom: 'calc(100% + 6px)',
  left: 0,
  minWidth: 220,
  maxWidth: 360,
  maxHeight: 200,
  overflowY: 'auto',
  background: '#1C1C20',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 6,
  padding: 4,
  boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
  zIndex: 200,
}

const fileListRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 6px',
  borderRadius: 4,
  fontSize: 11,
  fontFamily: 'monospace',
  color: '#E8E8EA',
}

const fileListPath: React.CSSProperties = {
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const fileListRemove: React.CSSProperties = {
  width: 18,
  height: 18,
  border: 'none',
  background: 'transparent',
  color: '#A0A0A0',
  cursor: 'pointer',
  fontSize: 14,
  lineHeight: 1,
  borderRadius: 3,
  flexShrink: 0,
}

// T-PATCH-068: in-flow docked question panel — replaces composer, no overlay/scrim (AC-1/3/5)
const questionDock: React.CSSProperties = {
  flexShrink: 0,
  maxHeight: '55%',                 // cap → rp-msgs keeps space above + stays scrollable (AC-3/4)
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  borderTop: '1px solid #2A2A2A',  // same as inputArea border
  background: '#121212',
}

// T-PATCH-068: dock header — label left + X right (AC-4)
const dockHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '8px 12px',
  flexShrink: 0,
  borderBottom: '1px solid #1E1E1E',
}

// T-PATCH-068: "질문" label in dock header
const dockLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#A0A0A0',
}

// T-PATCH-068: scrollable body inside dock — holds AskUserQuestionCard (AC-4)
const dockBody: React.CSSProperties = {
  flex: '1 1 auto',
  minHeight: 0,                     // allow flex child to shrink + scroll internally
  overflowY: 'auto',
  padding: '12px 16px',
}

// T-PATCH-068: position:absolute 제거 → dockHeader flex row의 justify-content:space-between 으로 정렬
const modalCloseBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#707070',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  borderRadius: 4,
  padding: 0,
}


const modalInputArea: React.CSSProperties = {
  borderTop: '1px solid #2A2A2A',
  padding: '8px 12px',
  display: 'flex',
  gap: 8,
  alignItems: 'flex-end',
  flexShrink: 0,
  marginTop: 'auto',
}

const modalTextarea: React.CSSProperties = {
  flex: 1,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: '#E5E5E5',
  fontSize: 13,
  resize: 'none',
  lineHeight: 1.5,
  fontFamily: 'inherit',
}

const modalSendBtn: React.CSSProperties = {
  background: '#7C3AED',
  border: 'none',
  color: '#fff',
  cursor: 'pointer',
  borderRadius: 6,
  padding: '6px 14px',
  fontSize: 13,
  flexShrink: 0,
}

// T-PATCH-052: session restart toast (AC-1) — bottom-center of the panel, 3s auto-dismiss
const restartToast: React.CSSProperties = {
  position: 'absolute',
  bottom: 60,
  left: '50%',
  transform: 'translateX(-50%)',
  background: '#1A2A1A',
  border: '1px solid #2A3A2A',
  color: '#34D399',
  fontSize: 11,
  padding: '6px 14px',
  borderRadius: 6,
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
  zIndex: 500,
  boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
}

// T-PATCH-052: session divider in message list (AC-2, AC-3)
const sessionDivider: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 4px',
  flexShrink: 0,
}

const sessionDividerLine: React.CSSProperties = {
  flex: 1,
  height: 1,
  background: '#2A2A2A',
}

const sessionDividerLabel: React.CSSProperties = {
  fontSize: 10,
  color: '#505050',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  whiteSpace: 'nowrap',
  flexShrink: 0,
}
