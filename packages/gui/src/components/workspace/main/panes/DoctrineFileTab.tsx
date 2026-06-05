/**
 * DoctrineFileTab — T-PATCH-020, generalized in T-PATCH-028
 *
 * Thin wrapper over the shared MarkdownViewer primitive (T-PATCH-028). It binds
 * the doctrine source (the T-PATCH-019 doctrine IPC) and the doctrine default
 * save (doctrineWriteFile) onto the primitive, and maps `tier` → `editable`:
 *   - Tier 0  → read-only viewer (Lock badge, Preview-only).
 *   - Tier 1 / 2 → editable spec-editor (Preview ⇄ Edit, Save / Cancel,
 *     conflict / saved / error states).
 *
 * Content is NEVER persisted into the workspace store — on mount (and on a
 * sessionStorage-rehydrated restore) the file is re-loaded from disk, deriving
 * everything from props alone.
 *
 * `onSave` is an injectable prop seam (default = direct write via
 * doctrineWriteFile). T-PATCH-022's DoctrineFileTabHost injects the
 * direct-vs-PO-review save dialog without touching this component.
 *
 * The save/conflict seam types are re-exported from MarkdownViewer so the host
 * import path stays valid (the Doctrine* names are kept this round).
 */

import { useCallback } from 'react'
import MarkdownViewer, {
  type DoctrineOnSave,
  type MarkdownLoadResult,
} from './MarkdownViewer'

// Re-export the seam types so DoctrineFileTabHost's import stays valid.
export type {
  DoctrineSaveResult,
  DoctrineOnSave,
  DoctrineDirtyState,
} from './MarkdownViewer'
import type { DoctrineDirtyState } from './MarkdownViewer'

interface Props {
  props?: Record<string, unknown>
  /** Optional, additive. Absent in the default (un-hosted) render path. */
  onDirtyChange?: (state: DoctrineDirtyState) => void
}

export default function DoctrineFileTab({ props: tabProps, onDirtyChange }: Props) {
  const tier = (typeof tabProps?.tier === 'number' ? tabProps.tier : 0) as 0 | 1 | 2
  const absPath = typeof tabProps?.absPath === 'string' ? tabProps.absPath : ''
  const relName = typeof tabProps?.relName === 'string' ? tabProps.relName : ''
  const projectDir = typeof tabProps?.projectDir === 'string' ? tabProps.projectDir : undefined
  const editable = typeof tabProps?.editable === 'boolean' ? tabProps.editable : tier !== 0
  const onSave = tabProps?.onSave as DoctrineOnSave | undefined

  // Doctrine loader — threads projectDir so Tier-1 absolute paths under
  // <projectDir>/docs/<persona>/ pass the main-process whitelist (T-PATCH-019).
  const load = useCallback((): Promise<MarkdownLoadResult> => {
    if (!absPath) return Promise.resolve({ ok: false, error: 'no path' })
    const api = (window as any).api
    return api.doctrineReadFile(absPath, projectDir)
  }, [absPath, projectDir])

  // Doctrine default save — direct write via doctrineWriteFile.
  const defaultSave = useCallback<DoctrineOnSave>(
    (p, c, expected) => {
      const api = (window as any).api
      return api.doctrineWriteFile(p, c, expected, projectDir)
    },
    [projectDir],
  )

  return (
    <MarkdownViewer
      load={load}
      absPath={absPath}
      relName={relName}
      editable={editable}
      onSave={onSave ?? defaultSave}
      onDirtyChange={onDirtyChange}
      emptyCrumb="doctrine"
    />
  )
}
