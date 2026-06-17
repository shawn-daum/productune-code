/**
 * BuildOutputTab — streaming log view for a surface build/run (T-PATCH-159 D4,
 * extended for Run in T-PATCH-187).
 *
 * Subscribes to api.surface.onOutput/onDone for the run identified by `props.runId`.
 * Append-only monospace log with a 5000-line ring buffer (D7: ref + manual flush,
 * never a growing useState string). stdout/stderr are rendered as **textContent
 * only** — NO dangerouslySetInnerHTML (D7 — ANSI/HTML injection guard).
 *
 * Status chip is derived from the onDone payload (running until done arrives):
 *   running (spinner) / pass (exit 0) / fail / cancelled.
 * While running, a 취소 button calls api.surface.cancel(runId) → SIGTERM (D5).
 *
 * T-PATCH-187 (kind:'run' — long-lived dev servers):
 *   - When `props.preview` is set, the log is scanned for the first localhost URL
 *     the server prints (e.g. Next's "Local: http://localhost:3000") and an in-app
 *     'browser' Preview tab is auto-opened once.
 *   - On unmount (tab close) the run is SIGTERMed via api.surface.cancel so a
 *     server never outlives its tab (closing the tab = stopping the server).
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspace } from '../../../../store/workspace'

const MAX_LINES = 5000

// First http(s) localhost / 127.0.0.1 URL on a line (tolerant of trailing ANSI).
const LOCAL_URL_RE = /(https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?[^\s\x1b]*)/i

// T-PATCH-187: detected Preview URL per runId, kept OUTSIDE React so it survives
// the tab-switch unmount (only the active tab is mounted) — lets the "reopen
// preview" button reappear after the user returns to a still-running run tab.
const detectedRunUrls = new Map<string, string>()

type RunStatus = 'running' | 'pass' | 'fail' | 'cancelled'

interface Props {
  props?: Record<string, unknown>
}

export default function BuildOutputTab({ props }: Props) {
  const runId = props?.runId as string | undefined
  const surfaceKey = (props?.surfaceKey as string) ?? '?'
  const kind = (props?.kind as 'build' | 'run') ?? 'build'
  const env = props?.env as string | undefined
  const preview = props?.preview === true
  const openTab = useWorkspace((s) => s.openTab)
  const { t } = useTranslation()

  const [status, setStatus] = useState<RunStatus>('running')
  const [exitCode, setExitCode] = useState<number | null>(null)
  // Recover a previously-detected URL on remount so the reopen button persists.
  const [previewUrl, setPreviewUrl] = useState<string | null>(() => (runId ? detectedRunUrls.get(runId) ?? null : null))

  const previewTabId = `browser:run-${surfaceKey}-${env ?? 'default'}`
  const openPreview = useCallback(() => {
    if (previewUrl) openTab(previewTabId, 'browser', { url: previewUrl }, `Preview: ${surfaceKey}`)
  }, [previewUrl, previewTabId, surfaceKey, openTab])

  // D7: ring buffer in a ref (no re-render per line). The <pre> textContent is
  // updated imperatively + autoscrolled. Bounded to MAX_LINES.
  const linesRef = useRef<string[]>([])
  const preRef = useRef<HTMLPreElement>(null)
  const followRef = useRef(true)
  const previewOpenedRef = useRef(false) // T-PATCH-187: open the Preview tab at most once

  const flush = useCallback(() => {
    const pre = preRef.current
    if (!pre) return
    // textContent only — safe against ANSI/HTML injection (D7).
    pre.textContent = linesRef.current.join('\n')
    if (followRef.current) pre.scrollTop = pre.scrollHeight
  }, [])

  useEffect(() => {
    if (!runId) return
    const api = (window as any).api?.surface
    if (!api) return

    let raf = 0
    const scheduleFlush = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        flush()
      })
    }

    const offOutput = api.onOutput((ev: { runId: string; stream: 'stdout' | 'stderr'; chunk: string }) => {
      if (ev.runId !== runId) return
      const buf = linesRef.current
      buf.push(ev.chunk)
      // Ring-buffer trim: drop oldest lines past the cap.
      if (buf.length > MAX_LINES) buf.splice(0, buf.length - MAX_LINES)
      scheduleFlush()

      // T-PATCH-187: for a run with preview enabled, capture the first localhost
      // URL the server prints, remember it (state + cross-remount map → reopen
      // button), and auto-open the in-app Preview tab once.
      if (preview && kind === 'run' && !previewOpenedRef.current) {
        const m = ev.chunk.match(LOCAL_URL_RE)
        if (m) {
          previewOpenedRef.current = true
          const url = m[1]
          if (runId) detectedRunUrls.set(runId, url)
          setPreviewUrl(url)
          openTab(`browser:run-${surfaceKey}-${env ?? 'default'}`, 'browser', { url }, `Preview: ${surfaceKey}`)
        }
      }
    })

    const offDone = api.onDone((ev: { runId: string; code: number | null; status: RunStatus }) => {
      if (ev.runId !== runId) return
      setStatus(ev.status)
      setExitCode(ev.code)
      scheduleFlush()
    })

    return () => {
      // D7: always unsubscribe on cleanup.
      // NOTE: do NOT SIGTERM the run here — this cleanup also runs on tab-switch
      // (only the active tab is mounted) and React StrictMode's dev remount.
      // The SIGTERM-on-close lives in the store's closeTab (real close only).
      offOutput?.()
      offDone?.()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [runId, flush, preview, kind, env, surfaceKey, openTab])

  const handleScroll = useCallback(() => {
    const pre = preRef.current
    if (!pre) return
    // Re-engage auto-follow only when the user is pinned to the bottom.
    followRef.current = pre.scrollHeight - pre.scrollTop - pre.clientHeight < 24
  }, [])

  const handleCancel = useCallback(() => {
    if (!runId) return
    ;(window as any).api?.surface?.cancel({ runId })
  }, [runId])

  if (!runId) {
    return <div style={wrap}><div style={emptyMsg}>No run id.</div></div>
  }

  return (
    <div style={wrap}>
      <div style={header}>
        <StatusChip status={status} exitCode={exitCode} />
        <span style={meta}>{surfaceKey} · {kind}{env ? ` · ${env}` : ''}</span>
        <span style={{ flex: 1 }} />
        {/* T-PATCH-187: reopen the Preview tab if the user closed it while the
            run server is still alive. */}
        {kind === 'run' && status === 'running' && previewUrl && (
          <button style={cancelBtn} onClick={openPreview}>{t('workspace.runOutput.reopenPreview')}</button>
        )}
        {status === 'running' && (
          <button style={cancelBtn} onClick={handleCancel}>{t('common.cancel')}</button>
        )}
      </div>
      <pre ref={preRef} style={logPane} onScroll={handleScroll} />
    </div>
  )
}

// ── Status chip ───────────────────────────────────────────────────────────────

function StatusChip({ status, exitCode }: { status: RunStatus; exitCode: number | null }) {
  ensureSpin()
  const { color, label } = chipMeta(status, exitCode)
  return (
    <span style={{ ...chip, color, borderColor: color }}>
      {status === 'running' && (
        <span style={{ ...spinner, borderTopColor: color }} />
      )}
      {label}
    </span>
  )
}

function chipMeta(status: RunStatus, exitCode: number | null): { color: string; label: string } {
  switch (status) {
    case 'running':   return { color: '#38BDF8', label: 'running' }
    case 'pass':      return { color: '#22C55E', label: 'pass (exit 0)' }
    case 'cancelled': return { color: '#FBBF24', label: 'cancelled' }
    case 'fail':
    default:          return { color: '#EF4444', label: `fail (exit ${exitCode ?? '?'})` }
  }
}

let spinInjected = false
function ensureSpin(): void {
  if (spinInjected) return
  spinInjected = true
  const style = document.createElement('style')
  style.textContent = `@keyframes bo-spin { to { transform: rotate(360deg); } }`
  document.head.appendChild(style)
}

// ── Styles ──────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  background: '#0E0E0E',
}

const header: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 10px',
  borderBottom: '1px solid #2A2A2A',
  flexShrink: 0,
}

const chip: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  fontSize: 11,
  fontWeight: 600,
  padding: '2px 8px',
  border: '1px solid',
  borderRadius: 10,
}

const spinner: React.CSSProperties = {
  width: 9,
  height: 9,
  borderRadius: '50%',
  border: '1.5px solid transparent',
  borderTopColor: '#38BDF8',
  animation: 'bo-spin 0.8s linear infinite',
  display: 'inline-block',
}

const meta: React.CSSProperties = {
  fontSize: 11,
  color: '#7A7A7A',
  fontFamily: 'monospace',
}

const cancelBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #3A3A3A',
  color: '#C8C8CC',
  fontSize: 11,
  padding: '2px 10px',
  borderRadius: 4,
  cursor: 'pointer',
}

const logPane: React.CSSProperties = {
  flex: 1,
  margin: 0,
  padding: '8px 10px',
  overflow: 'auto',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 12,
  lineHeight: 1.5,
  color: '#C8C8CC',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  minHeight: 0,
}

const emptyMsg: React.CSSProperties = {
  padding: 24,
  color: '#505050',
  fontSize: 13,
}
