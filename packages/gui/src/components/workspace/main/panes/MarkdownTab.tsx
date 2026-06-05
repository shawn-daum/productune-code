import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock } from 'lucide-react'
import { useWorkspace } from '../../../../store/workspace'
import MarkdownViewer, { type MarkdownLoadResult } from './MarkdownViewer'

/**
 * Generic markdown tab — migrated onto MarkdownViewer (T-PATCH-029).
 *
 * Read-only catch-all viewer for any `markdown` tab opener (Explorer helpers,
 * TodoListPanel, useIpcSubscriptions, MdRenderer `ptn:file/...` links). Content
 * resolves by loader precedence:
 *   1. inline `body` prop (used directly, no fetch);
 *   2. `~/.productune/...` path → `readMemoryFile` (Tier-2 memory);
 *   3. any other path under the project → the generic project-file reader
 *      (`artifactsReadFile(projectDir, absPath)`), so Explorer repo `.md` files
 *      render their on-disk content instead of the placeholder (T-PATCH-029 AC-3).
 *
 * Rich rendering / loading / error / zoom-less header all live in the shared
 * MarkdownViewer primitive (T-PATCH-028). The empty-memory ("emptyFile") and the
 * no-source ("placeholder") hint states are kept here — the primitive has no
 * italic-hint surface — preserving the prior behaviour exactly. Editing doctrine
 * tier files lives in DoctrineFileTab, not here (T-PATCH-027).
 */
interface Props {
  props?: Record<string, unknown>
}

export default function MarkdownTab({ props }: Props) {
  const { t } = useTranslation()
  const path = (props?.path as string) ?? null
  const inlineBody = (props?.body as string) ?? null
  const projectDir = useWorkspace((s) => s.project?.projectDir ?? null)

  // True only after a memory read resolves to an empty file — drives the
  // "emptyFile" hint instead of rendering an empty MdRenderer (prior behaviour).
  const [emptyMemory, setEmptyMemory] = useState(false)

  const isMemoryPath = !!path && path.startsWith('~/.productune/')
  // A repo path is renderable through the generic reader only with a projectDir.
  const isRepoPath = !!path && !isMemoryPath && !!projectDir

  // Whether a real content source exists. When none → placeholder (TodoListPanel
  // opens `markdown` with `{}`; or a repo path arrives with no active project).
  const hasSource = inlineBody !== null || isMemoryPath || isRepoPath

  const load = useCallback(async (): Promise<MarkdownLoadResult> => {
    setEmptyMemory(false)

    // 1) inline body — no fetch.
    if (inlineBody !== null) return { ok: true, content: inlineBody }

    const api = (window as any).api

    // 2) ~/.productune memory file (Tier-2).
    if (isMemoryPath) {
      if (!api?.readMemoryFile) return { ok: false }
      const res: { ok: boolean; content?: string; exists?: boolean; error?: string } =
        await api.readMemoryFile(path)
      if (!res?.ok) return { ok: false, error: res?.error ?? 'read failed' }
      const content = res.exists === false ? '' : (res.content ?? '')
      if (content === '') setEmptyMemory(true)
      return { ok: true, content }
    }

    // 3) generic project-file read (repo .md not under ~/.productune).
    if (isRepoPath) {
      try {
        const text: string = await api.artifactsReadFile(projectDir, path)
        return { ok: true, content: text }
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'read failed' }
      }
    }

    return { ok: false }
  }, [inlineBody, isMemoryPath, isRepoPath, path, projectDir])

  if (hasSource && !emptyMemory) {
    return (
      <MarkdownViewer
        load={load}
        absPath={path ?? ''}
        relName={path ?? ''}
        editable={false}
        zoomEnabled
        emptyCrumb={t('workspace.tab.markdown.crumbUntitled')}
      />
    )
  }

  // No resolvable source (or memory file resolved empty): keep the prior toolbar
  // + italic-hint surface for the empty / placeholder states.
  return (
    <div style={wrap}>
      <div style={toolbar}>
        <span style={crumb}>{path ?? t('workspace.tab.markdown.crumbUntitled')}</span>
        <div style={roBadge}>
          <Lock size={11} style={{ flexShrink: 0 }} />
          <span>{t('workspace.common.readOnly')}</span>
        </div>
      </div>
      <div style={view}>
        {emptyMemory ? (
          <p style={hint}>{t('workspace.tab.markdown.emptyFile')}</p>
        ) : (
          <p style={hint}>{t('workspace.tab.markdown.placeholder')}</p>
        )}
      </div>
    </div>
  )
}

const wrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

const toolbar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 14px',
  borderBottom: '1px solid #1A1A1A',
  background: '#0F0F0F',
  flexShrink: 0,
}

const crumb: React.CSSProperties = {
  fontSize: 11,
  color: '#707070',
  fontFamily: 'monospace',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const roBadge: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 10,
  color: '#707070',
  padding: '1px 6px',
  border: '1px solid #1F1F1F',
  borderRadius: 20,
  flexShrink: 0,
  whiteSpace: 'nowrap',
}

const view: React.CSSProperties = {
  flex: 1,
  padding: '16px 20px',
  overflow: 'auto',
  background: '#0F0F0F',
}

const hint: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: '#3A3A3A',
  fontStyle: 'italic',
}
