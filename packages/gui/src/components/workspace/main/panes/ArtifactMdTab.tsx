/**
 * ArtifactMdTab — T-014, migrated onto MarkdownViewer (T-PATCH-029)
 *
 * Read-only markdown viewer for artifact files. Now a thin wrapper over the
 * shared MarkdownViewer primitive (T-PATCH-028): read-only + zoom, loading via
 * the project-scoped `artifactsReadFile(projectDir, absPath)` IPC. The previous
 * local header / load / error / zoom scaffolding now lives in the primitive.
 * Behaviour is preserved: breadcrumb from `relPath`, read-only `Lock` badge,
 * `ZoomControls` group, rich `MdRenderer` body, and the same ZOOM_* defaults.
 */

import { useCallback } from 'react'
import MarkdownViewer, { type MarkdownLoadResult } from './MarkdownViewer'

interface Props {
  props?: Record<string, unknown>
}

export default function ArtifactMdTab({ props: tabProps }: Props) {
  const absPath = typeof tabProps?.absPath === 'string' ? tabProps.absPath : ''
  const relPath = typeof tabProps?.relPath === 'string' ? tabProps.relPath : ''
  const projectDir = typeof tabProps?.projectDir === 'string' ? tabProps.projectDir : ''

  // Loader: wrap the raw-string / throwing IPC into the MarkdownLoadResult seam.
  const load = useCallback(async (): Promise<MarkdownLoadResult> => {
    if (!absPath || !projectDir) return { ok: false }
    const api = (window as any).api
    try {
      const text: string = await api.artifactsReadFile(projectDir, absPath)
      return { ok: true, content: text }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'read failed' }
    }
  }, [absPath, projectDir])

  return (
    <MarkdownViewer
      load={load}
      absPath={absPath}
      relName={relPath}
      editable={false}
      zoomEnabled
      emptyCrumb="artifact"
    />
  )
}
