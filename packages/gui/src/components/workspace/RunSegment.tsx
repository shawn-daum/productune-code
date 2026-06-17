/**
 * RunSegment — StatusBar right-cluster ▶ Run launcher (T-PATCH-187).
 *
 * Replaces the old Build(+Smoke) launcher (T-PATCH-159). Renders a `▶ Run`
 * button + a surface drop-up (opens upward — StatusBar is the bottom chrome).
 *
 * Run is type-aware, driven entirely by `config.surfaces.<key>.run`:
 *   - string                       → a single Run action (e.g. an electron gui dev)
 *   - { environments, preview? }   → one action per environment (web: dev / prod / …)
 * Surfaces without a `run` (e.g. a node-lib) simply don't appear. Smoke is gone —
 * smoke/QA is the PO→QA orchestration flow, not a launcher button.
 *
 * Clicking an action calls api.surface.run({kind:'run', env}) → opens a
 * 'build-output' tab keyed by surface+env (stable id → re-click focuses the
 * existing run tab instead of spawning a duplicate server). The run tab streams
 * logs, auto-opens a Preview (browser) tab when the server prints its URL, and
 * SIGTERMs the server when closed (see BuildOutputTab).
 *
 * Zero-token: api.surface.run spawns a shell command in main; no LLM involved.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import i18next from 'i18next'
import { useWorkspace, paneTreeUtil } from '../../store/workspace'

interface RunInfo {
  command: string
  preview: boolean
  // Environments discovered from the project's `.env*` files (label shown).
  environments: { label: string; file: string }[]
}
interface SurfaceEntry {
  type: string
  build?: string | null
  run?: RunInfo
}
type SurfaceMap = Record<string, SurfaceEntry>

/** A single clickable run action. */
interface RunAction {
  surfaceKey: string
  env?: string          // env label (→ loads the matching `.env*` file); absent = no env
  label: string         // env label, or 'Run' when the surface has no env files
  preview: boolean       // watch stdout for a localhost URL → open Preview tab
}

function deriveActions(surfaces: SurfaceMap): Record<string, RunAction[]> {
  const out: Record<string, RunAction[]> = {}
  for (const [key, s] of Object.entries(surfaces)) {
    if (!s.run) continue
    const preview = s.run.preview
    if (s.run.environments.length > 0) {
      out[key] = s.run.environments.map((e) => ({
        surfaceKey: key,
        env: e.label,
        label: e.label,
        preview,
      }))
    } else {
      // No `.env*` files (e.g. a single-command gui) → one plain Run action.
      out[key] = [{ surfaceKey: key, label: 'Run', preview }]
    }
  }
  return out
}

export default function RunSegment() {
  const project = useWorkspace((s) => s.project)
  const openTab = useWorkspace((s) => s.openTab)
  const projectDir = project?.projectDir ?? null

  const [open, setOpen] = useState(false)
  const [surfaces, setSurfaces] = useState<SurfaceMap | null>(null)
  const [busy, setBusy] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Load surfaces once per project (re-fetched on project change).
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

  // T-PATCH-187: one-time PO chat hint introducing the Run button the FIRST time
  // a runnable surface exists for this project. Zero-token (canned PO message,
  // no LLM). Gated per-project via localStorage so it never repeats.
  useEffect(() => {
    if (!projectDir || !surfaces) return
    const runnable = Object.values(surfaces).some((s) => !!s.run)
    if (!runnable) return
    const seenKey = `productune.runHintSeen.${projectDir}`
    try {
      if (localStorage.getItem(seenKey)) return
      localStorage.setItem(seenKey, '1')
    } catch {
      return // localStorage unavailable → skip silently rather than risk repeats
    }
    useWorkspace.getState().appendMessage({
      id: `run-hint-${projectDir}`,
      role: 'assistant',
      kind: 'po',
      text: i18next.t('workspace.statusBar.runHint'),
      status: 'done',
      created_at: new Date().toISOString(),
    })
  }, [projectDir, surfaces])

  // Close drop-up on outside click.
  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  const run = useCallback(
    async (action: RunAction) => {
      if (!projectDir || busy) return
      setOpen(false)
      const tabId = `run-${action.surfaceKey}-${action.env ?? 'default'}`

      // Dedupe: if a run tab for this surface+env is already open, just focus it
      // (don't spawn a second server). openTab focuses an existing tab by id.
      const { panes } = useWorkspace.getState()
      const alreadyOpen = paneTreeUtil
        .collectLeafIds(panes)
        .some((pid) => paneTreeUtil.findLeaf(panes, pid)?.tabs.some((t) => t.id === tabId))
      if (alreadyOpen) {
        openTab(tabId, 'build-output', {})
        return
      }

      setBusy(true)
      try {
        const res = await (window as any).api?.surface?.run({
          projectDir,
          surfaceKey: action.surfaceKey,
          kind: 'run',
          env: action.env,
        })
        if (res?.ok && res.runId) {
          openTab(tabId, 'build-output', {
            runId: res.runId,
            surfaceKey: action.surfaceKey,
            kind: 'run',
            env: action.env,
            preview: action.preview,
          })
        }
      } catch {
        /* ignore — IPC failure surfaces nothing in v1 */
      } finally {
        setBusy(false)
      }
    },
    [projectDir, busy, openTab],
  )

  if (!project) return null

  const actionsBySurface = surfaces ? deriveActions(surfaces) : {}
  const runnableKeys = Object.keys(actionsBySurface)

  return (
    <div ref={wrapRef} style={wrap}>
      <button
        style={runBtn}
        disabled={busy || runnableKeys.length === 0}
        onClick={() => setOpen((v) => !v)}
        title={runnableKeys.length === 0 ? 'no runnable surfaces' : 'Run'}
      >
        <Play size={10} style={{ marginRight: 3 }} />
        Run
      </button>

      {open && runnableKeys.length > 0 && (
        <div style={dropUpPanel}>
          {runnableKeys.map((key) => {
            const actions = actionsBySurface[key]
            return (
              <div key={key} style={row}>
                <span style={rowKey}>{key}</span>
                {actions.map((a) => (
                  <button
                    key={a.label}
                    style={rowAction}
                    onClick={() => run(a)}
                    title={a.env ? `run ${key} · ${a.env}` : `run ${key}`}
                  >
                    {a.label}
                  </button>
                ))}
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

const runBtn: React.CSSProperties = {
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
