/**
 * ArtifactJsonTab — read-only JSON viewer for artifact files (2026-06-10).
 *
 * docs/artifacts/ 에는 .json 산출물 (excalidraw wireframe 등) 도 들어온다.
 * Loads via the project-scoped `artifactsReadFile(projectDir, absPath)` IPC,
 * parses, and renders a collapsible tree (objects/arrays toggle; everything
 * open by default). Invalid JSON falls back to the raw text with an error banner.
 * Header mirrors the other artifact panes: mono breadcrumb + read-only badge.
 */

import { useEffect, useState } from 'react'
import { Lock, ChevronRight, ChevronDown, AlertOctagon, Loader2 } from 'lucide-react'

interface Props {
  props?: Record<string, unknown>
}

type LoadState =
  | { phase: 'loading' }
  | { phase: 'ok'; value: unknown }
  | { phase: 'invalid'; raw: string; error: string }
  | { phase: 'error'; error: string }

export default function ArtifactJsonTab({ props: tabProps }: Props) {
  const absPath = typeof tabProps?.absPath === 'string' ? tabProps.absPath : ''
  const relPath = typeof tabProps?.relPath === 'string' ? tabProps.relPath : ''
  const projectDir = typeof tabProps?.projectDir === 'string' ? tabProps.projectDir : ''

  const [state, setState] = useState<LoadState>({ phase: 'loading' })

  useEffect(() => {
    if (!absPath || !projectDir) { setState({ phase: 'error', error: 'no source' }); return }
    let cancelled = false
    const api = (window as any).api
    api.artifactsReadFile(projectDir, absPath)
      .then((text: string) => {
        if (cancelled) return
        try {
          setState({ phase: 'ok', value: JSON.parse(text) })
        } catch (e: any) {
          setState({ phase: 'invalid', raw: text, error: e?.message ?? 'parse error' })
        }
      })
      .catch((e: any) => { if (!cancelled) setState({ phase: 'error', error: e?.message ?? 'read failed' }) })
    return () => { cancelled = true }
  }, [absPath, projectDir])

  return (
    <div style={wrap}>
      <div style={header}>
        <span style={crumb}>{relPath || absPath || 'artifact'}</span>
        <span style={lockBadge}>
          <Lock size={10} />
          read-only
        </span>
      </div>
      <div style={body}>
        {state.phase === 'loading' && (
          <div style={center}><Loader2 size={18} style={{ color: '#505050' }} className="pdt-spin" /></div>
        )}
        {state.phase === 'error' && (
          <div style={errorBanner}>
            <AlertOctagon size={13} style={{ color: '#EF4444', flexShrink: 0, marginTop: 1 }} />
            <span>{state.error}</span>
          </div>
        )}
        {state.phase === 'invalid' && (
          <>
            <div style={errorBanner}>
              <AlertOctagon size={13} style={{ color: '#D97706', flexShrink: 0, marginTop: 1 }} />
              <span>invalid JSON — raw text below ({state.error})</span>
            </div>
            <pre style={rawPre}>{state.raw}</pre>
          </>
        )}
        {state.phase === 'ok' && (
          <div style={treeWrap}>
            <JsonNode value={state.value} depth={0} />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Tree node ─────────────────────────────────────────────────────────────────

function JsonNode({ value, depth, label }: { value: unknown; depth: number; label?: string }) {
  const isObj = value !== null && typeof value === 'object'
  const [open, setOpen] = useState(true)

  const labelEl = label !== undefined ? <span style={keyStyle(depth)}>{label}: </span> : null

  if (!isObj) {
    return (
      <div style={row(depth)}>
        <span style={chevronSpacer} />
        {labelEl}
        <ValueLeaf value={value} />
      </div>
    )
  }

  const isArr = Array.isArray(value)
  const entries: Array<[string, unknown]> = isArr
    ? (value as unknown[]).map((v, i) => [String(i), v] as [string, unknown])
    : Object.entries(value as Record<string, unknown>)
  const bracket = isArr ? ['[', ']'] : ['{', '}']
  const count = entries.length

  return (
    <div>
      <div
        style={{ ...row(depth), cursor: 'pointer' }}
        onClick={() => setOpen((o) => !o)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOpen((o) => !o) }}
      >
        <span style={chevron}>
          {count > 0 ? (open ? <ChevronDown size={11} /> : <ChevronRight size={11} />) : <span style={{ width: 11 }} />}
        </span>
        {labelEl}
        <span style={punct}>{bracket[0]}</span>
        {!open && (
          <span style={collapsedHint}>{count === 0 ? '' : ` ${count} ${isArr ? 'items' : 'keys'} `}</span>
        )}
        {!open && <span style={punct}>{bracket[1]}</span>}
      </div>
      {open && entries.map(([k, v]) => (
        <JsonNode key={k} value={v} depth={depth + 1} label={k} />
      ))}
      {open && (
        <div style={row(depth)}>
          <span style={chevronSpacer} />
          <span style={punct}>{bracket[1]}</span>
        </div>
      )}
    </div>
  )
}

function ValueLeaf({ value }: { value: unknown }) {
  if (typeof value === 'string') return <span style={strVal}>"{value}"</span>
  if (typeof value === 'number') return <span style={numVal}>{String(value)}</span>
  if (typeof value === 'boolean' || value === null) return <span style={kwVal}>{String(value)}</span>
  return <span style={punct}>{String(value)}</span>
}

// ── Styles ────────────────────────────────────────────────────────────────────

const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace'

const wrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
  background: '#0E0E0E',
}

const header: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 14px',
  borderBottom: '1px solid #1A1A1A',
  flexShrink: 0,
}

const crumb: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 11,
  color: '#808080',
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const lockBadge: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 10,
  color: '#606060',
  flexShrink: 0,
}

const body: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: '10px 0',
}

const center: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
}

const errorBanner: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  margin: '4px 14px 10px',
  padding: '8px 10px',
  background: '#141414',
  border: '1px solid #2A2A2A',
  borderRadius: 4,
  fontSize: 11,
  color: '#A0A0A0',
}

const rawPre: React.CSSProperties = {
  margin: '0 14px',
  padding: 10,
  background: '#141414',
  border: '1px solid #1A1A1A',
  borderRadius: 4,
  fontFamily: MONO,
  fontSize: 11,
  lineHeight: 1.5,
  color: '#A0A0A0',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
}

const treeWrap: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 11.5,
  lineHeight: 1.65,
}

// Long values wrap — keys/chevrons must pin to the FIRST line (top-aligned),
// never float to the vertical middle of a wrapped value block.
const row = (depth: number): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'flex-start',
  paddingLeft: 14 + depth * 16,
  paddingRight: 14,
})

const chevron: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  width: 14,
  flexShrink: 0,
  color: '#505050',
  paddingTop: 4, // optical first-line alignment (line-height 1.65 × 11.5px)
}

const chevronSpacer: React.CSSProperties = {
  display: 'inline-block',
  width: 14,
  flexShrink: 0,
}

// Key color cycles by depth — hierarchy cue. Hues avoid the value colors
// (string green / number amber / keyword violet).
const KEY_COLORS = ['#9CA3AF', '#7EA8CF', '#CF9E9E', '#8FBFB4']
const keyStyle = (depth: number): React.CSSProperties => ({
  color: KEY_COLORS[depth % KEY_COLORS.length],
  flexShrink: 0,
  whiteSpace: 'nowrap',
})
const punct: React.CSSProperties = { color: '#505050' }
const collapsedHint: React.CSSProperties = { color: '#3F3F3F', fontStyle: 'italic' }
const strVal: React.CSSProperties = { color: '#7FB07F', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }
const numVal: React.CSSProperties = { color: '#C9A26D' }
const kwVal: React.CSSProperties = { color: '#8B7EC8' }
