/**
 * SidePanelProjectEnv — T-PATCH-076 r2 (restructured).
 *
 * Renders the PROJECT .ENV section in the left side panel as a clickable list
 * of .env* FILENAMES only — no inline key/value rows.
 * Clicking a filename opens it in the main pane as a `project-env:<filename>` tab
 * (same deduplication pattern as version-prd).
 *
 * SECURITY contract:
 *   - Values are NEVER shown in the always-visible side panel.
 *   - Key count badge is structural metadata only (no values).
 *   - Full editor (masked-by-default values, reveal, edit) lives in ProjectEnvPane.
 *
 * Scope: all .env* files in the build-target project root.
 *   NOT productune engine env, NOT MCP env.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, FileKey } from 'lucide-react'
import { useWorkspace } from '../../store/workspace'

// ── Types ─────────────────────────────────────────────────────────────────────

interface FileGroup {
  filename: string
  entries: { key: string; value: string }[]
  raw: string
}

// ── SidePanelProjectEnv ────────────────────────────────────────────────────────

export default function SidePanelProjectEnv() {
  const { t } = useTranslation()
  const project = useWorkspace((s) => s.project)
  const openTab = useWorkspace((s) => s.openTab)
  const projectDir = project?.projectDir ?? null

  const [files, setFiles] = useState<FileGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const prevDirRef = useRef<string | null>(null)

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(
    async (dir: string) => {
      setLoading(true)
      setError(null)
      try {
        const result: { files: FileGroup[] } =
          await (window as any).api.projectEnvRead(dir)
        setFiles(result.files ?? [])
      } catch (e: any) {
        setError(e?.message ?? t('workspace.projectEnv.readError'))
      } finally {
        setLoading(false)
      }
    },
    [t],
  )

  useEffect(() => {
    if (!projectDir) return
    if (projectDir !== prevDirRef.current) {
      setFiles([])
      setError(null)
      prevDirRef.current = projectDir
    }
    load(projectDir)
  }, [projectDir, load])

  // ── Open file in main pane ────────────────────────────────────────────────

  function handleOpenFile(filename: string) {
    openTab(
      `project-env:${filename}`,
      'project-env',
      { filename },
      filename,
    )
  }

  // File count for the section badge (number of .env* files, not summed keys)
  const fileCount = files.length

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={sectionWrap}>
      {/* Section header — collapsible */}
      <button
        type="button"
        style={secHdrBtn}
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        aria-label={t('workspace.projectEnv.sectionTitle')}
      >
        <span style={secHdrText}>{t('workspace.projectEnv.sectionTitle')}</span>
        {fileCount > 0 && !loading ? (
          <span style={countBadge}>{fileCount}</span>
        ) : null}
      </button>

      {!collapsed ? (
        <div>
          {/* Loading */}
          {loading ? (
            <div style={fallbackRow}>{t('workspace.projectEnv.loading')}</div>
          ) : null}

          {/* Structural read error (no values) */}
          {error && !loading ? (
            <div style={errorRow}>
              <AlertCircle size={11} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          ) : null}

          {/* Empty state — no .env* files found */}
          {!loading && !error && files.length === 0 ? (
            <div style={emptyState}>
              <div style={emptyText}>{t('workspace.projectEnv.emptyState')}</div>
              <div style={emptyHint}>{t('workspace.projectEnv.emptyHint')}</div>
            </div>
          ) : null}

          {/* Filename list — one row per .env* file */}
          {!loading && files.map((fg) => (
            <button
              key={fg.filename}
              type="button"
              style={fileRow}
              title={t('workspace.projectEnv.openFile', { filename: fg.filename })}
              aria-label={t('workspace.projectEnv.openFile', { filename: fg.filename })}
              onClick={() => handleOpenFile(fg.filename)}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.background = '#1A1A1A'
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
              }}
            >
              <FileKey size={11} strokeWidth={2} style={fileIcon} />
              <span style={fileNameText}>{fg.filename}</span>
              {fg.entries.length > 0 ? (
                <span style={fileKeyCount}>{fg.entries.length}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const sectionWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  borderBottom: '1px solid #1E1E1E',
}

const secHdrBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  padding: '5px 8px 3px',
  gap: 4,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  textAlign: 'left',
}

const secHdrText: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: '#4a4a4a',
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  userSelect: 'none',
  flex: 1,
}

const countBadge: React.CSSProperties = {
  fontSize: 9,
  color: '#606060',
  background: '#1E1E1E',
  borderRadius: 3,
  padding: '1px 4px',
  flexShrink: 0,
}

const fallbackRow: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: 10,
  color: '#3A3A3A',
  lineHeight: 1.4,
  cursor: 'default',
  userSelect: 'none',
  fontStyle: 'italic',
}

const errorRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 5,
  padding: '5px 10px',
  fontSize: 10,
  color: '#EF4444',
  lineHeight: 1.4,
}

const emptyState: React.CSSProperties = {
  padding: '6px 10px 8px',
}

const emptyText: React.CSSProperties = {
  fontSize: 10,
  color: '#3A3A3A',
  fontStyle: 'italic',
}

const emptyHint: React.CSSProperties = {
  fontSize: 9,
  color: '#2A2A2A',
  marginTop: 3,
  lineHeight: 1.4,
}

const fileRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  width: '100%',
  padding: '4px 8px',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'background 0.1s',
  borderRadius: 0,
}

const fileIcon: React.CSSProperties = {
  color: '#505050',
  flexShrink: 0,
}

const fileNameText: React.CSSProperties = {
  flex: 1,
  fontSize: 10,
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  color: '#707070',
  letterSpacing: '0.03em',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  userSelect: 'none',
}

const fileKeyCount: React.CSSProperties = {
  fontSize: 9,
  color: '#505050',
  background: '#1A1A1A',
  borderRadius: 3,
  padding: '0px 3px',
  flexShrink: 0,
}
