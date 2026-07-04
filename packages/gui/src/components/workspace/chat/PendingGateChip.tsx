/**
 * PendingGateChip — PO Chat 상단 sticky chip (T-P4-158).
 *
 * pending_gate != null 일 때만 렌더됨 (TodoChip 패턴).
 * popover = createPortal + position:fixed (ChatPanel overflow:hidden 밖).
 *
 * 미래 확장: totalCount 를 pending_gate ? 1 : 0 + extraItems.length 로 계산하면
 * 동일 chip 에 여러 gate 타입 집계 가능 — 컴포넌트 API 변경 없음.
 */

import { useRef, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import { ChevronDown, X, AlertCircle, Send, CheckCircle2 } from 'lucide-react'
import { useWorkspace } from '../../../store/workspace'
import { PHASE_NAMES } from '../../../lib/types'
import type { Message } from '../../../lib/types'
import { isPrdtPoState } from '../../../lib/phase-mapping'

export default function PendingGateChip() {
  const { t }           = useTranslation()
  const project         = useWorkspace((s) => s.project)
  const poState         = useWorkspace((s) => s.poState)
  const streaming       = useWorkspace((s) => s.streaming)
  const claudeSessionId = useWorkspace((s) => s.claudeSessionId)
  const gate            = poState?.pending_gate ?? null

  const chipRef                     = useRef<HTMLDivElement>(null)
  const [open, setOpen]             = useState(false)
  const [chipRect, setChipRect]     = useState<DOMRect | null>(null)
  const [draft, setDraft]           = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Escape key closes popover
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  // If pending_gate clears externally (PO cleared it), close popover
  useEffect(() => { if (!gate) setOpen(false) }, [gate])

  // T-291 (adapter A8): the phase-gate institution is gone in v1 — a prdt po-state
  // never carries pending_gate, so this is inert by data absence, but the explicit
  // guard makes "no gate UI on prdt" provable and future-proof against field leaks.
  if (isPrdtPoState(poState)) return null

  if (!gate) return null   // count = 0 → zero height, no render

  const fromName = PHASE_NAMES[gate.from_phase] ?? `Phase ${gate.from_phase}`
  const toName   = gate.to_phase ? (PHASE_NAMES[gate.to_phase] ?? `Phase ${gate.to_phase}`) : t('workspace.gate.phaseEnd')

  const handleChipClick = () => {
    if (!open) setChipRect(chipRef.current?.getBoundingClientRect() ?? null)
    setOpen((v) => !v)
  }

  const optimisticClear = () => {
    useWorkspace.setState((s) =>
      s.poState ? { poState: { ...s.poState, pending_gate: null } } : s,
    )
  }

  // ── 보내기 ──────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    const text = draft.trim()
    if (!text || submitting || streaming || !project) return
    setSubmitting(true)
    setOpen(false)
    setDraft('')

    const userMsg: Message = {
      id:         `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role:       'user',
      kind:       'user',
      text,
      status:     'done',
      created_at: new Date().toISOString(),
    }
    const ws = useWorkspace.getState()
    ws.appendMessage(userMsg)
    ws.setStreaming(true)
    ws.setInFlightKind('po')
    optimisticClear()

    const api = (window as any).api
    try { await api.chatAppendMessage(project.projectDir, userMsg) } catch { /* ignore */ }
    try {
      await api.poSendMessage({ projectDir: project.projectDir, text, resume: claudeSessionId })
    } catch {
      useWorkspace.getState().setStreaming(false)
    } finally {
      setSubmitting(false)
    }
  }

  // ── 승인 ────────────────────────────────────────────────────────────────────
  const handleApprove = async () => {
    if (submitting || !project) return
    setSubmitting(true)
    setOpen(false)
    optimisticClear()

    const api = (window as any).api
    try {
      await api.approvePhase?.({
        projectDir:     project.projectDir,
        fromPhase:      gate.from_phase,
        toPhase:        gate.to_phase,
        summary:        gate.summary,
        userApprovedAt: new Date().toISOString(),
      })
    } catch { /* optimistic clear already applied */ }
    setSubmitting(false)
  }

  // ── Portal popover ───────────────────────────────────────────────────────────
  const popover = open && chipRect
    ? createPortal(
        <>
          <div style={backdropS} onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('workspace.gate.pendingAria')}
            style={{
              ...popoverS,
              top:   chipRect.top,
              right: Math.max(8, window.innerWidth - chipRect.left + 4),
            }}
          >
            <div style={arrowS} />

            {/* head */}
            <div style={popHeadS}>
              <AlertCircle size={11} strokeWidth={2} color="#FBBF24" />
              <span style={popTitleS}>{t('workspace.gate.title')}</span>
              <button style={closeXS} onClick={() => setOpen(false)} aria-label={t('common.close')}>
                <X size={12} strokeWidth={2} />
              </button>
            </div>

            {/* body */}
            <div style={popBodyS}>
              {/* phase pills */}
              <div style={pillRowS}>
                <span style={makePill('#38BDF8', 'rgba(56,189,248,0.12)')}>{fromName}</span>
                <span style={pillArrowS}>→</span>
                <span style={makePill('#34D399', 'rgba(52,211,153,0.12)')}>{toName}</span>
              </div>

              {/* gate prompt */}
              <div style={gateQS}>{gate.prompt}</div>

              {/* meta */}
              <div style={gateMetaS}>PO · {gate.summary}</div>

              {/* answer row */}
              <div style={ansRowS}>
                <textarea
                  style={ansInputS}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  placeholder={t('workspace.gate.answerPlaceholder')}
                  rows={2}
                  disabled={submitting}
                />
                <button
                  style={{ ...sendBtnS, opacity: (!draft.trim() || submitting) ? 0.5 : 1 }}
                  onClick={handleSend}
                  disabled={!draft.trim() || submitting}
                >
                  <Send size={11} strokeWidth={2} />
                  {t('workspace.gate.send')}
                </button>
              </div>

              {/* quick actions */}
              <div style={actionRowS}>
                {/* primary: 승인 */}
                <button style={approveBtnS} onClick={handleApprove} disabled={submitting}>
                  <CheckCircle2 size={11} strokeWidth={2} />
                  {t('workspace.gate.approveEnter')}
                </button>
                {/* ghost: 보류 — §1.5.1 CTA ≤ 2 (ghost = non-weight) */}
                <button style={holdBtnS} onClick={() => setOpen(false)} disabled={submitting}>
                  {t('workspace.gate.hold')}
                </button>
              </div>
            </div>
          </div>
        </>,
        document.body,
      )
    : null

  return (
    <>
      <div
        ref={chipRef}
        style={chipRowS}
        className="rp-pending-gate-chip"
        onClick={handleChipClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleChipClick() }}
        aria-expanded={open}
        aria-label={t('workspace.gate.toggleAria', { state: open ? t('common.close') : t('workspace.explorer.contextOpen') })}
      >
        <span style={pulseDotS} />
        <span style={chipLabelS}>{t('workspace.gate.pendingLabel')}</span>
        <span style={chipCountS}>1</span>
        <ChevronDown
          size={11}
          strokeWidth={2}
          color="#A0A0A0"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.12s' }}
        />
      </div>
      {popover}
    </>
  )
}

// ── DS token-mapped styles ────────────────────────────────────────────────────

const chipRowS: React.CSSProperties = {
  flexShrink: 0,
  padding: '5px 10px',
  borderBottom: '1px solid #1F1F1F',           // --border-default
  background: 'rgba(251,191,36,0.07)',           // --health-warn 7% alpha
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  cursor: 'pointer',
  userSelect: 'none',
  transition: 'background 0.12s',
}

// pdt-persona-blink keyframe defined in styles/md-recipes.css:480 — reuse the shared
// CSS-module keyframe (T-PATCH-149: old `persona-blink` died when T-144 removed globals.css).
const pulseDotS: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: '#FBBF24',                         // --health-warn
  flexShrink: 0,
  animationName: 'pdt-persona-blink',
  animationDuration: '1.6s',
  animationTimingFunction: 'ease-in-out',
  animationIterationCount: 'infinite',
  animationDirection: 'alternate',
}

const chipLabelS: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: '#FBBF24',                              // --health-warn
  flex: 1,
}

const chipCountS: React.CSSProperties = {
  minWidth: 14,
  height: 14,
  borderRadius: 7,
  background: '#FBBF24',
  color: '#000',
  fontSize: 9,
  fontWeight: 700,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 4px',
  lineHeight: 1,
}

// ── Popover ───────────────────────────────────────────────────────────────────

const backdropS: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.35)',
  zIndex: 900,
}

const popoverS: React.CSSProperties = {
  position: 'fixed',
  width: 284,
  background: '#1C1C20',                         // --surface-modal
  border: '1px solid rgba(251,191,36,0.4)',
  borderRadius: 7,
  boxShadow: '0 8px 28px rgba(0,0,0,0.55)',
  zIndex: 901,
}

const arrowS: React.CSSProperties = {
  position: 'absolute',
  top: 8,
  right: -5,
  width: 9,
  height: 9,
  background: '#1C1C20',
  borderRight: '1px solid rgba(251,191,36,0.4)',
  borderTop: '1px solid rgba(251,191,36,0.4)',
  transform: 'rotate(45deg)',
}

const popHeadS: React.CSSProperties = {
  padding: '8px 10px 7px',
  borderBottom: '1px solid #1A1A1A',             // --border-subtle
  display: 'flex',
  alignItems: 'center',
  gap: 5,
}

const popTitleS: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: '#FBBF24',
  flex: 1,
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
}

const closeXS: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: '#A0A0A0',                              // --text-muted
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  borderRadius: 3,
}

const popBodyS: React.CSSProperties = { padding: '10px 11px' }

const pillRowS: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  marginBottom: 8,
}

function makePill(color: string, bg: string): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 6px',
    borderRadius: 4,
    fontSize: 9,
    fontWeight: 600,
    background: bg,
    color,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  }
}

const pillArrowS: React.CSSProperties = { fontSize: 9, color: '#A0A0A0' }

const gateQS: React.CSSProperties = {
  fontSize: 11,
  color: '#E8E8EA',                              // --text-primary
  lineHeight: 1.6,
  marginBottom: 6,
}

const gateMetaS: React.CSSProperties = {
  fontSize: 10,
  color: '#A0A0A0',                              // --text-muted
  marginBottom: 8,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const ansRowS: React.CSSProperties = {
  display: 'flex',
  gap: 5,
  alignItems: 'flex-end',
  marginBottom: 6,
}

const ansInputS: React.CSSProperties = {
  flex: 1,
  background: '#1A1A1A',                         // --surface-subpanel
  border: '1px solid #2A2A2A',                   // --border-strong
  borderRadius: 5,
  padding: '5px 7px',
  fontSize: 11,
  color: '#F0F0F0',                              // --text-emphasis
  outline: 'none',
  fontFamily: 'inherit',
  resize: 'none',
  lineHeight: 1.5,
  minHeight: 44,
}

const sendBtnS: React.CSSProperties = {
  height: 28,
  padding: '0 9px',
  background: '#8B5CF6',                         // --accent
  border: 'none',
  borderRadius: 5,
  color: '#0F0F0F',
  fontSize: 10,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  flexShrink: 0,
}

const actionRowS: React.CSSProperties = { display: 'flex', gap: 5 }

const approveBtnS: React.CSSProperties = {
  flex: 1,
  background: 'rgba(52,211,153,0.1)',
  border: '1px solid rgba(52,211,153,0.25)',
  color: '#34D399',                              // --status-done
  borderRadius: 5,
  padding: '5px 0',
  fontSize: 10,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
}

const holdBtnS: React.CSSProperties = {
  // Ghost — §1.5.1: 3번째 CTA는 ghost/text link으로 강등
  background: 'transparent',
  border: 'none',
  color: '#A0A0A0',                              // --text-muted
  borderRadius: 5,
  padding: '5px 10px',
  fontSize: 10,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
