/**
 * BackgroundTaskSegment — StatusBar segment for background sub-agent tasks.
 * T-P4-068: BackgroundTaskMonitor
 *
 * Compact display (0/1/2-3/4+ cases) + hover popup portal with:
 *   - Running task list
 *   - Recently completed tasks (last 10)
 *   - Focus-aware 5s auto-fade for done tasks (OQ-3)
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import {
  useBackgroundTasks,
  selectRunning,
  type BackgroundTask,
  type BackgroundTaskPersona,
  type PopupAnchor,
} from '../../store/useBackgroundTasks'
import { useQaLoop, type QaLoopEntry } from '../../store/useQaLoop'
import { PERSONA_COLORS, type PersonaId } from '../../store/personaPresence'

// ── Constants ─────────────────────────────────────────────────────────────────

const FADE_DELAY_MS = 5_000   // 5s focus-aware countdown before moving to Recent
const FADE_OUT_MS   = 200     // CSS fade-out duration
const BORDER_SUBTLE = '#1E1E1E'
const BORDER_STRONG = '#2A2A2A'
const SURFACE_MODAL = '#1C1C20'
const TEXT_SECONDARY = 'var(--text-secondary, #A0A0A0)'
const TEXT_MUTED     = 'var(--text-muted, #5A5A5A)'
const TEXT_EMPHASIS  = '#F0F0F0'
const HEALTH_ERROR   = '#EF4444'

// ── Keyframe injection ────────────────────────────────────────────────────────

const BG_TASK_STYLE_ID = 'bg-task-keyframes'

function ensureKeyframes(): void {
  if (document.getElementById(BG_TASK_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = BG_TASK_STYLE_ID
  style.textContent = `
    @keyframes bg-task-blink {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.6; }
    }
    @media (prefers-reduced-motion: reduce) {
      @keyframes bg-task-blink { 0%, 100% { opacity: 1; } }
    }
    @keyframes bg-task-fadeout {
      0%   { opacity: 1; }
      100% { opacity: 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      @keyframes bg-task-fadeout { 0%, 100% { opacity: 1; } }
    }
  `
  document.head.appendChild(style)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function personaColor(persona: BackgroundTaskPersona): string {
  if (persona === 'unknown') return '#888888'
  return PERSONA_COLORS[persona as PersonaId]
}

function personaLabel(persona: BackgroundTaskPersona): string {
  if (persona === 'unknown') return 'unknown'
  const labels: Record<PersonaId, string> = { po: 'PO', designer: 'designer', dev: 'dev', qa: 'QA' }
  return labels[persona as PersonaId]
}

function formatDuration(startedAt: number, endedAt?: number): string {
  const ms = (endedAt ?? Date.now()) - startedAt
  const totalSeconds = Math.floor(ms / 1000)
  const mins = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  if (mins === 0) return `${secs}s`
  return `${mins}m ${secs}s`
}

// ── Focus-aware countdown hook ────────────────────────────────────────────────
// Tracks elapsed focused time per task in `pendingMap`. Once a task's elapsed
// reaches FADE_DELAY_MS, it moves to `fadedIds` (shown in Recent, not Running).

function useFocusAwareCountdown(
  pendingMap: Map<string, number>,          // taskId → elapsed ms
  onFaded: (id: string) => void,
): void {
  const pendingRef = useRef(pendingMap)
  pendingRef.current = pendingMap

  const lastTickRef = useRef<number | null>(null)

  useEffect(() => {
    if (pendingRef.current.size === 0) return

    let raf: number

    const tick = () => {
      const focused =
        document.visibilityState === 'visible' && document.hasFocus()

      if (focused) {
        const now = Date.now()
        const delta = lastTickRef.current !== null ? now - lastTickRef.current : 0
        lastTickRef.current = now

        const toFade: string[] = []
        pendingRef.current.forEach((elapsed, id) => {
          const newElapsed = elapsed + delta
          if (newElapsed >= FADE_DELAY_MS) {
            toFade.push(id)
          } else {
            pendingRef.current.set(id, newElapsed)
          }
        })
        toFade.forEach((id) => {
          pendingRef.current.delete(id)
          onFaded(id)
        })
      } else {
        lastTickRef.current = null
      }

      if (pendingRef.current.size > 0) {
        raf = window.setTimeout(tick, 100)
      }
    }

    const onFocus  = () => { lastTickRef.current = null; tick() }
    const onBlur   = () => { lastTickRef.current = null }
    const onVis    = () => {
      if (document.visibilityState !== 'visible') lastTickRef.current = null
      else tick()
    }

    raf = window.setTimeout(tick, 100)
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onVis)

    return () => {
      clearTimeout(raf)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onVis)
    }
  // Re-run effect when pending tasks change (new done/error tasks arrive).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingMap.size, onFaded])
}

// ── Compact label builder ─────────────────────────────────────────────────────

function buildCompactLabel(
  running: BackgroundTask[],
  t: (k: string, opts?: any) => string,
): { text: string; showDot: boolean; dotPersona?: BackgroundTaskPersona } {
  const count = running.length
  if (count === 0) return { text: t('workspace.backgroundTasks.idle'), showDot: false }
  if (count === 1) {
    const task = running[0]
    return {
      text: `${personaLabel(task.persona)} ${t('workspace.backgroundTasks.running')}…`,
      showDot: true,
      dotPersona: task.persona,
    }
  }
  if (count <= 3) {
    // Group by persona, build "designer ×2 · dev ×1"
    const groups = new Map<BackgroundTaskPersona, number>()
    running.forEach((t) => groups.set(t.persona, (groups.get(t.persona) ?? 0) + 1))
    const parts: string[] = []
    groups.forEach((n, p) => parts.push(`${personaLabel(p)} ×${n}`))
    return { text: parts.join(' · '), showDot: true, dotPersona: running[0].persona }
  }
  return {
    text: t('workspace.backgroundTasks.nTasksRunning', { count }),
    showDot: true,
  }
}

// ── Popup row component ───────────────────────────────────────────────────────

interface RowProps {
  task: BackgroundTask
  fading?: boolean
  onDismiss?: (id: string) => void
  now: number
  t: (k: string, opts?: any) => string
  /** QA loop entry for this task (shown when persona === 'qa'). */
  qaLoopEntry?: QaLoopEntry
}

function TaskRow({ task, fading = false, onDismiss, now, t, qaLoopEntry }: RowProps) {
  const [hovered, setHovered] = useState(false)
  const isRunning = task.status === 'running'
  const isError   = task.status === 'error'

  const statusColor = isError ? HEALTH_ERROR : (isRunning ? TEXT_SECONDARY : TEXT_MUTED)
  const statusLabel = isRunning
    ? t('workspace.backgroundTasks.running')
    : isError
    ? t('workspace.backgroundTasks.error')
    : t('workspace.backgroundTasks.done')

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '6px 12px',
    background: hovered ? '#1A1A1A' : 'transparent',
    cursor: 'default',
    animation: fading
      ? `bg-task-fadeout ${FADE_OUT_MS}ms ease forwards`
      : 'none',
    position: 'relative',
    flexShrink: 0,
  }

  return (
    <div
      style={rowStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* persona dot */}
      <span
        style={{
          width: 6, height: 6, borderRadius: '50%',
          background: personaColor(task.persona),
          flexShrink: 0, marginTop: 5,
        }}
        aria-hidden="true"
      />

      {/* content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12, color: TEXT_EMPHASIS, lineHeight: '18px',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {personaLabel(task.persona)}
          {'  '}
          <span style={{ color: TEXT_SECONDARY }}>
            {task.description || '—'}
          </span>
        </div>
        <div style={{ fontSize: 11, color: TEXT_MUTED, lineHeight: '16px' }}>
          {/* QA attempt badge — shown for running QA tasks with loop tracking */}
          {task.persona === 'qa' && qaLoopEntry && task.status === 'running' && (
            <span style={{
              color: qaLoopEntry.attempt >= qaLoopEntry.maxAttempts ? HEALTH_ERROR : 'var(--health-warn, #F59E0B)',
              marginRight: 4,
              fontWeight: 600,
            }}>
              {t('workspace.qaLoop.attempt', {
                current: qaLoopEntry.attempt,
                max: qaLoopEntry.maxAttempts,
                defaultValue: `attempt ${qaLoopEntry.attempt}/${qaLoopEntry.maxAttempts}`,
              })}
              {' · '}
            </span>
          )}
          {formatDuration(task.started_at, task.completed_at)}
          {' · '}
          <span style={{ color: statusColor }}>{statusLabel}</span>
        </div>
      </div>

      {/* dismiss / running indicator */}
      {onDismiss && (
        <button
          style={{
            background: 'transparent', border: 'none', padding: '2px 4px',
            cursor: isRunning ? 'not-allowed' : 'pointer',
            color: isRunning ? TEXT_MUTED : TEXT_SECONDARY,
            opacity: hovered ? 1 : 0,
            transition: 'opacity 0.1s',
            flexShrink: 0,
          }}
          title={isRunning ? t('workspace.backgroundTasks.stillRunning') : t('workspace.backgroundTasks.dismiss')}
          onClick={() => { if (!isRunning) onDismiss(task.id) }}
          disabled={isRunning}
          aria-label={t('workspace.backgroundTasks.dismiss')}
        >
          <X size={11} />
        </button>
      )}
    </div>
  )
}

// ── Popup component ───────────────────────────────────────────────────────────

interface PopupProps {
  tasks: BackgroundTask[]
  fadedIds: Set<string>
  personaFilter: BackgroundTaskPersona | null
  anchor: PopupAnchor | null
  onClose: () => void
  onDismiss: (id: string) => void
  onMouseEnter: () => void
  onMouseLeave: () => void
  t: (k: string, opts?: any) => string
}

function BackgroundTaskPopup({
  tasks,
  fadedIds,
  personaFilter,
  anchor,
  onClose,
  onDismiss,
  onMouseEnter,
  onMouseLeave,
  t,
}: PopupProps) {
  const popupRef = useRef<HTMLDivElement>(null)
  const now = Date.now()
  const qaLoopEntries = useQaLoop((s) => s.entries)
  // Active qa-running entry (at most 1 at a time in normal flow)
  const activeQaEntry = Object.values(qaLoopEntries).find((e) => e.status === 'qa-running')

  // Esc closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  // Outside click closes
  useEffect(() => {
    const onMouse = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', onMouse, true)
    return () => document.removeEventListener('mousedown', onMouse, true)
  }, [onClose])

  // Position: segment anchor → above StatusBar right-aligned; chip anchor → below chip left-aligned
  const POPUP_WIDTH = 360
  let posStyle: React.CSSProperties
  if (anchor?.rect) {
    if (anchor.type === 'chip') {
      // Chip hover: drop below the chip, left-aligned. Clamp if overflows right edge.
      const leftRaw = anchor.rect.left
      const rightOverflow = leftRaw + POPUP_WIDTH - window.innerWidth + 8
      const left = rightOverflow > 0 ? leftRaw - rightOverflow : leftRaw
      posStyle = {
        position: 'fixed',
        top: anchor.rect.bottom + 4,
        left: Math.max(8, left),
      }
    } else {
      // Segment hover: above StatusBar, right-aligned to segment
      posStyle = {
        position: 'fixed',
        bottom: window.innerHeight - anchor.rect.top + 4,
        right: window.innerWidth - anchor.rect.right,
      }
    }
  } else {
    posStyle = { position: 'fixed', bottom: 40, right: 12 }
  }

  // Filter by persona if requested
  const filteredTasks = personaFilter
    ? tasks.filter((t) => t.persona === personaFilter)
    : tasks

  const runningTasks = filteredTasks.filter((t) => t.status === 'running')
  // "fading" = done/error tasks still in countdown window (not yet in Recent)
  const fadingTasks  = filteredTasks.filter(
    (t) => (t.status === 'done' || t.status === 'error') && !fadedIds.has(t.id),
  )
  const recentTasks  = filteredTasks
    .filter((t) => (t.status === 'done' || t.status === 'error') && fadedIds.has(t.id))
    .sort((a, b) => (b.completed_at ?? 0) - (a.completed_at ?? 0))
    .slice(0, 10)

  const visibleCount = runningTasks.length + fadingTasks.length

  // Header title
  const headerTitle = personaFilter
    ? `${personaLabel(personaFilter)} (${filteredTasks.filter((t) => t.status === 'running').length})`
    : t('workspace.backgroundTasks.popupTitle', { count: runningTasks.length })

  const isEmpty = runningTasks.length === 0 && fadingTasks.length === 0 && recentTasks.length === 0

  return createPortal(
    <div
      ref={popupRef}
      style={{
        ...posStyle,
        width: 360,
        maxHeight: 320,
        background: SURFACE_MODAL,
        border: `1px solid ${BORDER_STRONG}`,
        borderRadius: 8,
        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 9999,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
      role="dialog"
      aria-modal="false"
      aria-label={headerTitle}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: `1px solid ${BORDER_STRONG}`,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, color: TEXT_EMPHASIS, fontWeight: 500 }}>
          {headerTitle}
        </span>
        <button
          style={{
            background: 'transparent', border: 'none', padding: '2px 4px',
            cursor: 'pointer', color: TEXT_MUTED, display: 'flex', alignItems: 'center',
          }}
          onClick={onClose}
          aria-label={t('common.close')}
        >
          <X size={13} />
        </button>
      </div>

      {/* Scrollable body */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {isEmpty ? (
          <div style={{ padding: '24px 12px', textAlign: 'center', color: TEXT_MUTED, fontSize: 12 }}>
            {t('workspace.backgroundTasks.empty')}
          </div>
        ) : (
          <>
            {/* Running list */}
            {(runningTasks.length > 0 || fadingTasks.length > 0) && (
              <div style={{ paddingTop: 4 }}>
                {runningTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    fading={false}
                    onDismiss={onDismiss}
                    now={now}
                    t={t}
                    qaLoopEntry={task.persona === 'qa' ? activeQaEntry : undefined}
                  />
                ))}
                {fadingTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    fading={true}
                    onDismiss={onDismiss}
                    now={now}
                    t={t}
                  />
                ))}
              </div>
            )}

            {/* Recent section */}
            {recentTasks.length > 0 && (
              <>
                {visibleCount > 0 && (
                  <div style={{
                    height: 1, background: BORDER_STRONG, margin: '4px 0',
                  }} />
                )}
                <div style={{
                  padding: '4px 12px 2px',
                  fontSize: 11, color: TEXT_MUTED, fontWeight: 500,
                }}>
                  {t('workspace.backgroundTasks.recent')}
                </div>
                {recentTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    fading={false}
                    onDismiss={onDismiss}
                    now={now}
                    t={t}
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

// ── Main segment component ────────────────────────────────────────────────────

export default function BackgroundTaskSegment() {
  const { t } = useTranslation()
  const tasks           = useBackgroundTasks((s) => s.tasks)
  const popupOpen       = useBackgroundTasks((s) => s.popupOpen)
  const personaFilter   = useBackgroundTasks((s) => s.popupPersonaFilter)
  const popupAnchor     = useBackgroundTasks((s) => s.popupAnchor)
  const openPopup       = useBackgroundTasks((s) => s.openPopup)
  const closePopup      = useBackgroundTasks((s) => s.closePopup)
  const dismissTask     = useBackgroundTasks((s) => s.dismissTask)
  const setPopupAnchor  = useBackgroundTasks((s) => s.setPopupAnchor)

  const segmentRef = useRef<HTMLDivElement>(null)

  // IDs that have completed the 5s fade → shown in Recent
  const [fadedIds, setFadedIds] = useState<Set<string>>(new Set())
  // Pending map: taskId → elapsed focused ms (for countdown)
  const [pendingMap, setPendingMap] = useState<Map<string, number>>(new Map())

  // Inject keyframes once
  useEffect(() => { ensureKeyframes() }, [])

  // Watch for newly done/error tasks → add to pendingMap
  const prevTasksRef = useRef<BackgroundTask[]>([])
  useEffect(() => {
    const prev = prevTasksRef.current
    const newlyCompleted = tasks.filter((t) => {
      if (t.status !== 'done' && t.status !== 'error') return false
      const prevTask = prev.find((p) => p.id === t.id)
      return prevTask?.status === 'running'  // just transitioned
    })

    if (newlyCompleted.length > 0) {
      setPendingMap((pm) => {
        const next = new Map(pm)
        newlyCompleted.forEach((t) => next.set(t.id, 0))
        return next
      })
    }

    prevTasksRef.current = tasks
  }, [tasks])

  // Cleanup pendingMap / fadedIds when tasks are dismissed
  useEffect(() => {
    const taskIds = new Set(tasks.map((t) => t.id))
    setPendingMap((pm) => {
      const next = new Map(pm)
      pm.forEach((_, id) => { if (!taskIds.has(id)) next.delete(id) })
      return next.size === pm.size ? pm : next
    })
    setFadedIds((fids) => {
      const next = new Set(fids)
      fids.forEach((id) => { if (!taskIds.has(id)) next.delete(id) })
      return next.size === fids.size ? fids : next
    })
  }, [tasks])

  // Focus-aware countdown → move from pendingMap to fadedIds
  const handleFaded = useCallback((id: string) => {
    setPendingMap((pm) => {
      const next = new Map(pm)
      next.delete(id)
      return next
    })
    setFadedIds((fids) => new Set([...fids, id]))
  }, [])

  useFocusAwareCountdown(pendingMap, handleFaded)

  // Grace-close timeout ref — shared between segment and popup
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const scheduleClose = useCallback(() => {
    cancelClose()
    closeTimerRef.current = setTimeout(() => { closePopup() }, 200)
  }, [cancelClose, closePopup])

  // Cleanup on unmount
  useEffect(() => () => { if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current) }, [])

  // Update anchor when opening popup via segment
  const handleOpen = useCallback(() => {
    cancelClose()
    if (segmentRef.current) {
      setPopupAnchor({ type: 'segment', rect: segmentRef.current.getBoundingClientRect() })
    }
    openPopup()
  }, [openPopup, cancelClose, setPopupAnchor])

  const running = selectRunning(tasks)
  const { text: compactText, showDot, dotPersona } = buildCompactLabel(running, t)
  const isIdle = running.length === 0

  const dotStyle: React.CSSProperties = {
    width: 6, height: 6, borderRadius: '50%',
    flexShrink: 0,
    background: dotPersona ? personaColor(dotPersona) : TEXT_SECONDARY,
    animation: showDot && !isIdle
      ? 'bg-task-blink 1.5s ease infinite'
      : 'none',
  }

  const segmentStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '0 12px',
    height: '100%',
    cursor: 'pointer',
    userSelect: 'none',
    borderLeft:  `1px solid ${BORDER_SUBTLE}`,
    borderRight: `1px solid ${BORDER_SUBTLE}`,
    flexShrink: 0,
  }

  const textStyle: React.CSSProperties = {
    fontSize: 12,
    color: isIdle ? TEXT_MUTED : TEXT_SECONDARY,
    whiteSpace: 'nowrap',
  }

  return (
    <>
      <div
        ref={segmentRef}
        style={segmentStyle}
        onMouseEnter={handleOpen}
        onMouseLeave={scheduleClose}
        onClick={handleOpen}
        role="button"
        tabIndex={0}
        aria-label={compactText}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleOpen() }}
        className="sb-segment bg-task"
      >
        {showDot && !isIdle && (
          <span style={dotStyle} aria-hidden="true" />
        )}
        <span style={textStyle}>{compactText}</span>
      </div>

      {popupOpen && (
        <BackgroundTaskPopup
          tasks={tasks}
          fadedIds={fadedIds}
          personaFilter={personaFilter}
          anchor={popupAnchor}
          onClose={closePopup}
          onDismiss={dismissTask}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          t={t}
        />
      )}
    </>
  )
}
