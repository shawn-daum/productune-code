/**
 * ToolUseGroup.tsx — collapsible group for consecutive tool-use trace lines (T-PATCH-033).
 *
 * SCOPE = GROUP ONLY this round. A run of adjacent `traceLevel: 'tool'` messages
 * (detected in ChatPanel) collapses under ONE disclosure:
 *   header = lucide Wrench + "N tools" + ChevronRight→ChevronDown
 *   collapsed by default; expand reveals the per-tool list.
 *
 * Each tool row is itself a disclosure (AC3 structure). Per-tool input/output I/O
 * is NOT yet plumbed renderer-ward (needs po-runner→render data sub-task — DEFERRED
 * to a separate ticket), so the inner toggle currently shows a muted
 * "detail unavailable" line. The OUTER group + inner toggle structure ships now and
 * must not regress when the data lands.
 *
 * Design: DS §7 (lucide only, no color emoji; --icon-sm 14, --icon-stroke-soft 1.75,
 * --text-muted #A0A0A0). Disclosure = Tier0 progressive-disclosure / IDE-familiar
 * pattern (collapsed default, chevron-rotate feedback, keyboard-accessible <button>).
 *
 * §1.5.6 self-check: 2-1 Few Things (N tools → 1 line) · 2-2 익숙한 경험 (IDE tree
 * disclosure) · 3-1 Predictability (single component path incl N=1, AC2) · 3-2 Feedback
 * (chevron rotates on expand) · 3-3 Escape (collapse re-hides; no trap).
 */

import { useState } from 'react'
import { Wrench, ChevronRight, ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Message } from '../../../lib/types'

interface Props {
  /** Consecutive tool-use trace messages, in stream order (length ≥ 1). */
  tools: Message[]
}

/** Strip the `→ tool: ` prefix emitted by po-runner; fall back to raw text. */
function toolName(m: Message): string {
  const stripped = m.text.replace(/^→\s*tool:\s*/, '').trim()
  return stripped || m.text
}

export default function ToolUseGroup({ tools }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false) // collapsed by default (AC1)

  const count = tools.length

  return (
    <div style={groupStyle}>
      {/* Outer disclosure header */}
      <button
        type="button"
        style={headerBtn}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown size={14} strokeWidth={1.75} style={chevron} />
        ) : (
          <ChevronRight size={14} strokeWidth={1.75} style={chevron} />
        )}
        <Wrench size={14} strokeWidth={1.75} style={wrenchIcon} />
        <span style={headerLabel}>
          {t('workspace.chat.toolGroup', { count })}
        </span>
      </button>

      {/* Expanded per-tool list — each row is its own disclosure (AC3 structure). */}
      {open && (
        <div style={listStyle}>
          {tools.map((m) => (
            <ToolRow key={m.id} name={toolName(m)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Inner per-tool disclosure row ─────────────────────────────────────────────
// Nested per-tool input/output detail is DEFERRED (needs po-runner→render I/O
// plumbing — separate ticket). The toggle + fallback "detail unavailable" line
// ship now so the structure does not regress when data lands.

function ToolRow({ name }: { name: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <div style={rowWrap}>
      <button
        type="button"
        style={rowBtn}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown size={14} strokeWidth={1.75} style={rowChevron} />
        ) : (
          <ChevronRight size={14} strokeWidth={1.75} style={rowChevron} />
        )}
        <span style={rowName} title={name}>
          {name}
        </span>
      </button>

      {open && (
        <div style={rowDetail}>{t('workspace.chat.toolDetailUnavailable')}</div>
      )}
    </div>
  )
}

// ── Styles (DS §7 / §1 tokens, matching chat surrounding hex) ─────────────────

const groupStyle: React.CSSProperties = {
  margin: '2px 0',
}

const headerBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: '2px 4px',
  fontSize: 10,
  color: '#A0A0A0', // --text-muted
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
}

const chevron: React.CSSProperties = {
  flexShrink: 0,
  color: '#707070',
}

const wrenchIcon: React.CSSProperties = {
  flexShrink: 0,
  color: '#A0A0A0', // --text-muted (decorative)
}

const headerLabel: React.CSSProperties = {
  whiteSpace: 'nowrap',
}

const listStyle: React.CSSProperties = {
  marginLeft: 10,
  paddingLeft: 8,
  borderLeft: '1px solid #2A2A2A',
}

const rowWrap: React.CSSProperties = {
  margin: '1px 0',
}

const rowBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  maxWidth: '100%',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: '1px 4px',
  fontSize: 10,
  color: '#909090',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  textAlign: 'left',
}

const rowChevron: React.CSSProperties = {
  flexShrink: 0,
  color: '#606060',
}

const rowName: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const rowDetail: React.CSSProperties = {
  marginLeft: 22,
  padding: '2px 4px',
  fontSize: 10,
  color: '#707070',
  fontStyle: 'italic',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
}
