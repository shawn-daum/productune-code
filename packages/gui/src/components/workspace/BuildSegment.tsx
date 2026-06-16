/**
 * BuildSegment — StatusBar right-cluster Build(+Smoke) launcher (T-PATCH-159 D1).
 *
 * Replaces the StatusBar right `placeholder`. Renders a `▶ Build` button + a
 * surface drop-up (opens upward — StatusBar is the bottom chrome). Each surface
 * row exposes Build + Smoke buttons; a surface whose `smoke === null` (e.g. core)
 * has its Smoke button disabled (D1).
 *
 * Clicking Build/Smoke calls api.surface.run → opens a 'build-output' tab keyed
 * by the returned runId (D4). On 'already-running' the existing tab is focused
 * (D5 — the openTab dedupe handles focus).
 *
 * Zero-token: api.surface.run spawns a shell command in main; no LLM involved.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, ChevronUp } from 'lucide-react'
import { useWorkspace } from '../../store/workspace'

interface SurfaceEntry {
  type: string
  build: string | null
  smoke: string | null
  smoke_driver: string
}

type SurfaceMap = Record<string, SurfaceEntry>

export default function BuildSegment() {
  const project = useWorkspace((s) => s.project)
  const openTab = useWorkspace((s) => s.openTab)
  const projectDir = project?.projectDir ?? null

  const [open, setOpen] = useState(false)
  const [surfaces, setSurfaces] = useState<SurfaceMap | null>(null)
  const [busy, setBusy] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Load surfaces once per project (D2 — memoized in state, re-fetched on project change).
  useEffect(() => {
    if (!projectDir) {
      setSurfaces(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await (window as any).api?.surface?.list({ projectDir })
        if (!cancelled && res?.ok) setSurfaces(res.surfaces ?? {})
        else if (!cancelled) setSurfaces({})
      } catch {
        if (!cancelled) setSurfaces({})
      }
    })()
    return () => { cancelled = true }
  }, [projectDir])

  // Close drop-up on outside click.
  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  const runSurface = useCallback(
    async (surfaceKey: string, kind: 'build' | 'smoke') => {
      if (!projectDir || busy) return
      setOpen(false)
      setBusy(true)
      try {
        const res = await (window as any).api?.surface?.run({ projectDir, surfaceKey, kind })
        if (res?.ok && res.runId) {
          openTab(`build-${res.runId}`, 'build-output', { runId: res.runId, surfaceKey, kind })
        }
        // 'already-running' → no new tab; existing one stays focusable manually.
        // (v1: single global run; OQ-2.)
      } catch {
        /* ignore — IPC failure surfaces nothing in v1 */
      } finally {
        setBusy(false)
      }
    },
    [projectDir, busy, openTab],
  )

  if (!project) return null

  const keys = surfaces ? Object.keys(surfaces) : []

  return (
    <div ref={wrapRef} style={wrap}>
      <button
        style={buildBtn}
        disabled={busy || keys.length === 0}
        onClick={() => setOpen((v) => !v)}
        title={keys.length === 0 ? 'no surfaces' : 'Build / Smoke'}
      >
        <Play size={10} style={{ marginRight: 3 }} />
        Build
        <ChevronUp size={10} style={{ marginLeft: 3, flexShrink: 0 }} />
      </button>

      {open && keys.length > 0 && (
        <div style={dropUpPanel}>
          {keys.map((key) => {
            const s = surfaces![key]
            const canBuild = !!s.build
            const canSmoke = !!s.smoke
            return (
              <div key={key} style={row}>
                <span style={rowKey}>{key}</span>
                <button
                  style={canBuild ? rowAction : rowActionDimmed}
                  disabled={!canBuild}
                  onClick={() => runSurface(key, 'build')}
                  title={canBuild ? `build ${key}` : 'build 미정의'}
                >
                  Build
                </button>
                <button
                  style={canSmoke ? rowAction : rowActionDimmed}
                  disabled={!canSmoke}
                  onClick={() => runSurface(key, 'smoke')}
                  title={canSmoke ? `smoke ${key}` : 'smoke 미정의'}
                >
                  Smoke
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
  marginLeft: 8,
}

const buildBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  background: 'transparent',
  border: 'none',
  padding: '0 4px',
  cursor: 'pointer',
  fontSize: 10,
  color: '#7A7A7A',
  userSelect: 'none',
  whiteSpace: 'nowrap',
  borderRadius: 3,
  fontFamily: 'inherit',
}

const dropUpPanel: React.CSSProperties = {
  position: 'absolute',
  bottom: 28,
  right: 0,
  background: '#1A1A1A',
  border: '1px solid #2A2A2A',
  borderRadius: 6,
  minWidth: 200,
  zIndex: 9999,
  padding: '4px 0',
  boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
}

const row: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 10px',
}

const rowKey: React.CSSProperties = {
  fontSize: 11,
  color: '#C8C8CC',
  fontFamily: 'monospace',
  flex: 1,
  minWidth: 48,
}

const rowAction: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #3A3A3A',
  color: '#C8C8CC',
  fontSize: 10,
  padding: '2px 8px',
  borderRadius: 4,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const rowActionDimmed: React.CSSProperties = {
  ...rowAction,
  color: '#505050',
  borderColor: '#2A2A2A',
  cursor: 'default',
}
