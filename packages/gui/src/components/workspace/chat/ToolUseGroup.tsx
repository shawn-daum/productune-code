/**
 * ToolUseGroup.tsx — collapsible group for consecutive tool-use trace lines (T-PATCH-033).
 *
 * SCOPE = GROUP ONLY this round. A run of adjacent `traceLevel: 'tool'` messages
 * (detected in ChatPanel) collapses under ONE disclosure:
 *   header = lucide Wrench + "N tools" + ChevronRight→ChevronDown
 *   collapsed by default; expand reveals the per-tool list.
 *
 * Each tool row is itself a disclosure (AC3 structure). Per-tool input detail is
 * plumbed renderer-ward (T-PATCH-108): the runner forwards `toolName` + raw
 * `toolInput`, and `formatToolDetail()` renders a Claude-Code-style, per-tool
 * formatted + truncated view. When input is genuinely absent (no toolInput / empty
 * object) the inner toggle falls back to the muted "detail unavailable" line (AC5).
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

// ── T-PATCH-108: per-tool input detail formatting + truncation (AC2/AC4) ──────
// Truncation caps (magic numbers centralized per §4 C-4).
const MAX_LINE_CHARS = 200 // single value/line char cap
const MAX_DETAIL_LINES = 12 // total detail line cap before tail elision

/** Resolved tool name: prefer the parsed `toolName`, else strip the text prefix. */
function resolvedToolName(m: Message): string {
  return (m.toolName && m.toolName.trim()) || toolName(m)
}

/** Cap a single string at MAX_LINE_CHARS, appending an ellipsis when clipped. */
function clip(s: string, max = MAX_LINE_CHARS): string {
  if (s.length <= max) return s
  return s.slice(0, max) + '…'
}

function asStr(v: unknown): string {
  if (typeof v === 'string') return v
  if (v == null) return ''
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

/** Treat null/undefined/non-object/empty-object input as "no detail" (AC5). */
function hasInput(input: unknown): input is Record<string, unknown> {
  return (
    typeof input === 'object' &&
    input !== null &&
    !Array.isArray(input) &&
    Object.keys(input as object).length > 0
  )
}

/**
 * formatToolDetail — Claude-Code-style per-tool input view.
 * Returns null when input is genuinely absent → caller shows AC5 fallback.
 * The returned `lines` are pre-clipped per value; row-level line-cap + `… (+N)`
 * tail elision is applied by the renderer (ToolRow) so the count is localizable.
 */
function formatToolDetail(m: Message): { lines: string[] } | null {
  const input = m.toolInput
  if (!hasInput(input)) return null
  const name = resolvedToolName(m)
  const lines: string[] = []

  switch (name) {
    case 'Edit': {
      if (input.file_path) lines.push(`path: ${clip(asStr(input.file_path))}`)
      if (input.old_string != null) lines.push(`- ${clip(asStr(input.old_string))}`)
      if (input.new_string != null) lines.push(`+ ${clip(asStr(input.new_string))}`)
      break
    }
    case 'MultiEdit': {
      if (input.file_path) lines.push(`path: ${clip(asStr(input.file_path))}`)
      const edits = Array.isArray(input.edits) ? input.edits : []
      lines.push(`${edits.length} edits`)
      for (const e of edits.slice(0, 2)) {
        const ed = e as Record<string, unknown>
        if (ed?.old_string != null) lines.push(`- ${clip(asStr(ed.old_string))}`)
        if (ed?.new_string != null) lines.push(`+ ${clip(asStr(ed.new_string))}`)
      }
      break
    }
    case 'Write': {
      if (input.file_path) lines.push(`path: ${clip(asStr(input.file_path))}`)
      if (input.content != null) {
        for (const ln of asStr(input.content).split('\n')) lines.push(clip(ln))
      }
      break
    }
    case 'Bash': {
      if (input.command != null) {
        for (const ln of asStr(input.command).split('\n')) lines.push(clip(ln))
      }
      if (input.description) lines.push(`# ${clip(asStr(input.description))}`)
      break
    }
    case 'Read': {
      if (input.file_path) lines.push(`path: ${clip(asStr(input.file_path))}`)
      const range: string[] = []
      if (input.offset != null) range.push(`offset ${asStr(input.offset)}`)
      if (input.limit != null) range.push(`limit ${asStr(input.limit)}`)
      if (range.length) lines.push(range.join(', '))
      break
    }
    case 'Grep':
    case 'Glob': {
      if (input.pattern != null) lines.push(`pattern: ${clip(asStr(input.pattern))}`)
      if (input.path != null) lines.push(`path: ${clip(asStr(input.path))}`)
      if (input.glob != null) lines.push(`glob: ${clip(asStr(input.glob))}`)
      break
    }
    case 'Task': {
      if (input.subagent_type != null) lines.push(`subagent: ${clip(asStr(input.subagent_type))}`)
      const body = input.prompt ?? input.description
      if (body != null) {
        for (const ln of asStr(body).split('\n')) lines.push(clip(ln))
      }
      break
    }
    default: {
      // generic: pretty-printed JSON, line-clipped.
      let pretty: string
      try {
        pretty = JSON.stringify(input, null, 2)
      } catch {
        pretty = String(input)
      }
      for (const ln of pretty.split('\n')) lines.push(clip(ln))
    }
  }

  // A formatter that matched but produced nothing → fall back (AC5).
  if (lines.length === 0) return null
  return { lines }
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
            <ToolRow key={m.id} tool={m} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Inner per-tool disclosure row ─────────────────────────────────────────────
// T-PATCH-108: expand renders formatToolDetail() per-tool input. When input is
// genuinely absent the AC5 "detail unavailable" fallback is shown instead. Toggle
// / chevron / aria-expanded / default-collapsed all preserved (AC3).

function ToolRow({ tool }: { tool: Message }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const name = resolvedToolName(tool)

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

      {open && <ToolRowDetail tool={tool} />}
    </div>
  )
}

/** Renders the formatted detail block, or the AC5 fallback when input is absent. */
function ToolRowDetail({ tool }: { tool: Message }) {
  const { t } = useTranslation()
  const detail = formatToolDetail(tool)

  if (!detail) {
    return (
      <div style={rowDetailFallback}>{t('workspace.chat.toolDetailUnavailable')}</div>
    )
  }

  // AC4: row-level line cap + `… (+N)` tail elision.
  const { lines } = detail
  const shown = lines.slice(0, MAX_DETAIL_LINES)
  const overflow = lines.length - shown.length

  return (
    <div style={rowDetail}>
      {shown.join('\n')}
      {overflow > 0
        ? '\n' + t('workspace.chat.toolDetail.truncatedMore', { count: overflow })
        : ''}
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

// T-PATCH-108: real detail = non-italic mono, multiline-aware. New colors/icons
// are out of scope (§3) — reuse the existing muted hex + mono stack.
const rowDetail: React.CSSProperties = {
  marginLeft: 22,
  padding: '2px 4px',
  fontSize: 10,
  color: '#707070',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
}

// AC5 fallback retains the original italic muted line.
const rowDetailFallback: React.CSSProperties = {
  marginLeft: 22,
  padding: '2px 4px',
  fontSize: 10,
  color: '#707070',
  fontStyle: 'italic',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
}
