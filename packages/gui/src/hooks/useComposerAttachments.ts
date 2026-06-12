/**
 * useComposerAttachments (T-PATCH-133) — shared attachment logic extracted from
 * ChatPanel (T-PATCH-098). Provides pasted-image tracking, paperclip file picking,
 * chip-delete, atomic-token-delete keydown, ## Attached files block builder, and
 * send-lifecycle helpers (clearAttachments / cleanupSentFiles).
 *
 * Used by:
 *   - ChatPanel (refactored, BDD-5 behavior-preserving)
 *   - FreshComposer (new, BDD-1..4 parity)
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Single source-of-truth for an inline-referenced pasted image.
 * seq = stable token N (never reused / never renumbered);
 * path = temp abs path (PO-transport key);
 * previewUrl = object URL for the chip thumbnail (§4.c).
 */
export type ImageRef = {
  seq: number
  path: string
  previewUrl?: string
}

// ── Module-level helpers ──────────────────────────────────────────────────────

/**
 * T-PATCH-098 §4.d: inline image citation token regex.
 * Used with matchAll() only — no lastIndex mutation (g flag is safe).
 * Token `[Image #N]` matches the cmux / Claude-Code citation format PO/agent reads.
 */
export const IMAGE_TOKEN_RE = /\[Image #(\d+)\]/g

const IMAGE_TOKEN_OPEN_FRAG_RE  = /\[Image #\d*(?!\])/g   // `[Image #` or `[Image #1` without `]`
const IMAGE_TOKEN_CLOSE_FRAG_RE = /(?<!\[)Image #\d+\]/g  // `Image #1]` remnant with no opening `[`

/**
 * T-PATCH-098 §4.e §2: strip orphaned half-token fragments while PROTECTING every
 * complete `[Image #N]` token. Multi-token safe and idempotent.
 */
export function sweepOrphanTokenFragments(text: string): string {
  if (!text.includes('[Image #') && !/#\d+\]/.test(text)) return text

  // Mask complete tokens with a same-length space sentinel so fragment regexes skip them.
  const spans = [...text.matchAll(IMAGE_TOKEN_RE)].map((m) => ({
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
  }))
  let masked = ''
  let cursor = 0
  for (const sp of spans) {
    masked += text.slice(cursor, sp.start)
    masked += ' '.repeat(sp.end - sp.start) // sentinel — never matched by fragment REs
    cursor = sp.end
  }
  masked += text.slice(cursor)

  // Collect fragment spans to remove (indices align with real text: mask = same length).
  const remove: Array<{ start: number; end: number }> = []
  for (const re of [IMAGE_TOKEN_OPEN_FRAG_RE, IMAGE_TOKEN_CLOSE_FRAG_RE]) {
    for (const m of masked.matchAll(re)) {
      const start = m.index ?? 0
      remove.push({ start, end: start + m[0].length })
    }
  }
  if (remove.length === 0) return text
  remove.sort((a, b) => a.start - b.start)

  let out = ''
  let pos = 0
  for (const r of remove) {
    if (r.start < pos) continue // overlapping match — skip
    out += text.slice(pos, r.start)
    pos = r.end
  }
  out += text.slice(pos)
  return out.replace(/\s{2,}/g, ' ')
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * @param draft      Current textarea value (caller owns state; hook reads via closure).
 * @param setDraft   Setter for the textarea value (hook calls this on change / remove).
 * @param taRef      Ref to the composer <textarea> — used for caret restore after token delete.
 * @param projectDir Absolute project directory (needed for saveAttachmentImage IPC).
 *                   Pass null to disable clipboard-image paste (e.g. when project unavailable).
 */
export function useComposerAttachments(
  draft: string,
  setDraft: (v: string) => void,
  taRef: React.RefObject<HTMLTextAreaElement>,
  projectDir: string | null,
) {
  // ── State ─────────────────────────────────────────────────────────────────
  const [images, setImages] = useState<ImageRef[]>([])
  const [otherFiles, setOtherFiles] = useState<string[]>([])

  // §4.d §1: monotonic, never-reused token counter (1-based). Ref because it is
  // read / incremented inside async paste handlers, not rendered directly.
  const nextImageSeqRef = useRef(1)

  // §4.d §2: PO-transport path list — image paths first (matching #N order), then
  // paperclip files. Derived; no duplicate state.
  const attachedFiles = useMemo(
    () => [...images.map((a) => a.path), ...otherFiles],
    [images, otherFiles],
  )

  // §4.c: mirror latest images into a ref for the unmount cleanup. useEffect fires
  // after render so the ref always holds the most recent array even when images change
  // between the last render and component unmount.
  const attachmentsRef = useRef<ImageRef[]>([])
  useEffect(() => { attachmentsRef.current = images }, [images])
  useEffect(
    () => () => {
      attachmentsRef.current.forEach((a) => {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl)
      })
    },
    [],
  )

  // ── File picker ───────────────────────────────────────────────────────────
  const onAttachFile = async () => {
    try {
      const paths: string[] = await (window as any).api.openFilePicker()
      if (!paths || paths.length === 0) return
      // Dedupe: adding the same file twice is a no-op (Set membership).
      setOtherFiles((prev) => {
        const set = new Set(prev)
        for (const p of paths) set.add(p)
        return Array.from(set)
      })
      requestAnimationFrame(() => taRef.current?.focus())
    } catch { /* IPC unavailable — noop */ }
  }

  // ── Chip removal ──────────────────────────────────────────────────────────
  /**
   * Remove an image chip and strip the matching `[Image #N]` token from the draft.
   * draft + setImages updated together so the §4.A reconcile in onComposerChange is
   * idempotent (no secondary drop).
   */
  const removeImage = (seq: number) => {
    const re = new RegExp(`\\s?\\[Image #${seq}\\]\\s?`, 'g')
    setDraft(draft.replace(re, ' ').replace(/\s{2,}/g, ' ').trimStart())
    setImages((prev) => {
      const target = prev.find((a) => a.seq === seq)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((a) => a.seq !== seq)
    })
  }

  /** Remove a paperclip (non-image) file chip by path. */
  const removeFile = (path: string) => {
    setOtherFiles((prev) => prev.filter((p) => p !== path))
  }

  // ── Clipboard image paste ─────────────────────────────────────────────────
  /**
   * T-PATCH-098 §4.d §3: intercept image items from the clipboard and persist them
   * to disk via IPC. Inserts a `[Image #N]` citation token at the textarea caret.
   * Non-image paste falls through to default textarea text-paste (no regression).
   */
  const onComposerPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!projectDir) return
    const items = Array.from(e.clipboardData?.items ?? [])
    // §3 out-of-scope: multi-image — take the FIRST image item only.
    const imageItem = items.find(
      (it) => it.kind === 'file' && it.type.startsWith('image/'),
    )
    if (!imageItem) return // non-image paste → keep default text-paste behavior

    e.preventDefault()
    const file = imageItem.getAsFile()
    if (!file) return

    try {
      const buf = await file.arrayBuffer()
      const bytes = Array.from(new Uint8Array(buf))
      const ext = imageItem.type.split('/')[1] || 'png'
      const res = await (window as any).api.saveAttachmentImage({
        projectDir,
        bytes,
        ext,
      })
      if (res?.ok && res.path) {
        const seq = nextImageSeqRef.current++
        // §4.c.1.a: build preview from the same pasted blob (object URL). Created only
        // in the success branch — no orphan URL on save failure.
        const url = URL.createObjectURL(file)
        setImages((prev) => [...prev, { seq, path: res.path, previewUrl: url }])

        // §4.d §3: insert `[Image #N]` at the caret, whitespace-normalised so the token
        // never glues to adjacent words (breaks the parse regex).
        const ta = taRef.current
        const s  = ta ? ta.selectionStart : draft.length
        const e2 = ta ? ta.selectionEnd   : draft.length
        const token   = `[Image #${seq}]`
        const before  = draft.slice(0, s)
        const after   = draft.slice(e2)
        const padLeft  = before.length > 0 && !/\s$/.test(before) ? ' ' : ''
        const padRight = after.length === 0 || !/^\s/.test(after)  ? ' ' : ''
        const insert   = `${padLeft}${token}${padRight}`
        setDraft(before + insert + after)
        const caret = before.length + insert.length
        requestAnimationFrame(() => {
          const el = taRef.current
          if (el) {
            el.focus()
            el.selectionStart = el.selectionEnd = caret
          }
        })
      }
      // save failure → silently ignored; textarea stays intact (AC: safe ignore)
    } catch { /* clipboard / IPC unavailable — noop */ }
  }

  // ── Change reconcile ──────────────────────────────────────────────────────
  /**
   * T-PATCH-098 §4.d §4.A: textarea = source of truth. Sweep orphan fragments first,
   * then reconcile the image chip list with the tokens present in the new value.
   * Resets the monotonic counter when draft + all attachments are empty (fresh msg start).
   * Idempotent — re-runs after removeImage converge to the same result (no loop).
   */
  const onComposerChange = (rawValue: string) => {
    const value = sweepOrphanTokenFragments(rawValue)
    setDraft(value)
    const present = new Set(
      [...value.matchAll(IMAGE_TOKEN_RE)].map((m) => Number(m[1])),
    )
    setImages((prev) => {
      const kept = prev.filter((a) => present.has(a.seq))
      if (kept.length === prev.length) return prev
      // Revoke preview URLs of dropped refs (memory); temp disk file is left for
      // the L1 24h purge / post-send L2 cleanup — not unlinked here.
      for (const a of prev) {
        if (!present.has(a.seq) && a.previewUrl) URL.revokeObjectURL(a.previewUrl)
      }
      return kept
    })
    // Counter reset: both reads below are intentionally from the previous render
    // (ref + closure capture). Same staleness behaviour as the original ChatPanel.
    if (value.trim() === '' && attachmentsRef.current.length === 0 && otherFiles.length === 0) {
      nextImageSeqRef.current = 1
    }
  }

  // ── Atomic token-delete keydown ───────────────────────────────────────────
  /**
   * T-PATCH-098 §4.e §1: intercept Backspace / Delete when the caret is adjacent to
   * or inside an `[Image #N]` token and remove the whole span atomically. Absorbs one
   * adjacent padding space so no orphan space survives. Routes the result through
   * onComposerChange (chip drop + objectURL revoke + counter reset). Restores the
   * caret via requestAnimationFrame.
   *
   * @returns `true` if the event was consumed — caller must `return` immediately.
   */
  const handleTokenDeleteKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (e.key !== 'Backspace' && e.key !== 'Delete') return false
    const ta = taRef.current
    if (!ta) return false

    const s  = ta.selectionStart
    const e2 = ta.selectionEnd
    const spans = [...draft.matchAll(IMAGE_TOKEN_RE)].map((m) => ({
      start: m.index ?? 0,
      end: (m.index ?? 0) + m[0].length,
    }))

    let from = -1
    let to   = -1

    if (s === e2) {
      // Caret only (no selection) — find the token the caret is adjacent to / inside.
      for (const sp of spans) {
        const atBackEdge  = e.key === 'Backspace' && s === sp.end
        const atFrontEdge = e.key === 'Delete'    && s === sp.start
        const midToken    = s > sp.start && s < sp.end
        if (atBackEdge || atFrontEdge || midToken) {
          from = sp.start
          to   = sp.end
          break
        }
      }
    } else {
      // Selection present — expand to cover every overlapping token (no partial cut).
      for (const sp of spans) {
        const overlaps = sp.start < e2 && sp.end > s
        if (overlaps) {
          from = from === -1 ? Math.min(s, sp.start) : Math.min(from, sp.start)
          to   = to   === -1 ? Math.max(e2, sp.end)  : Math.max(to,   sp.end)
        }
      }
    }

    if (from === -1 || to === -1) return false

    e.preventDefault()
    // Absorb one adjacent padding space (prefer trailing; else leading).
    let cutFrom = from
    let cutTo   = to
    if (draft[cutTo] === ' ') cutTo += 1
    else if (cutFrom > 0 && draft[cutFrom - 1] === ' ') cutFrom -= 1
    const next = (draft.slice(0, cutFrom) + draft.slice(cutTo)).replace(/\s{2,}/g, ' ')
    // Route through onComposerChange → chip drop + objectURL revoke + counter reset.
    onComposerChange(next)
    const caret = cutFrom
    requestAnimationFrame(() => {
      const el = taRef.current
      if (el) {
        el.focus()
        el.selectionStart = el.selectionEnd = Math.min(caret, el.value.length)
      }
    })
    return true
  }

  // ── Block builder ─────────────────────────────────────────────────────────
  /**
   * Build the final message text, prepending `## Attached files` when attachments
   * are present. Image lines: `- #N -> path`; other-file lines: `- path`.
   * Returns `trimmed` unchanged when there are no attachments.
   */
  const buildAttachedFilesBlock = (trimmed: string): string => {
    const imageLines = images.map((a)   => `- #${a.seq} -> ${a.path}`)
    const otherLines = otherFiles.map((p) => `- ${p}`)
    const allLines   = [...imageLines, ...otherLines]
    if (allLines.length === 0) return trimmed
    return `## Attached files\n${allLines.join('\n')}\n\n${trimmed}`
  }

  // ── Send-lifecycle helpers ────────────────────────────────────────────────
  /**
   * Revoke all preview object-URLs, clear images / otherFiles state, and reset the
   * monotonic seq counter to 1. Does NOT touch `draft` or disk files.
   *
   * Call on the SUCCESS path (after chatAppendMessage succeeds, before reveal).
   * Do NOT call in catch blocks — chips must survive for retry.
   */
  const clearAttachments = () => {
    attachmentsRef.current.forEach((a) => {
      if (a.previewUrl) URL.revokeObjectURL(a.previewUrl)
    })
    setImages([])
    setOtherFiles([])
    nextImageSeqRef.current = 1
  }

  /**
   * Best-effort L2 disk cleanup: unlinks temp-pasted images under the
   * `productune/pasted` root (paperclip originals are containment-skipped by main).
   * Call AFTER `await poSendMessage(...)` so PO has consumed the paths.
   *
   * FreshComposer MUST NOT call this — fire-and-forget poSendMessage means the
   * PO turn may still be reading the files when this would fire (T-PATCH-133
   * RESOLUTION-1). FreshComposer relies on the L1 24h temp purge instead.
   */
  const cleanupSentFiles = async (paths: string[]) => {
    if (paths.length === 0) return
    try { await (window as any).api.cleanupAttachments({ paths }) } catch { /* best-effort */ }
  }

  // ── Return surface ────────────────────────────────────────────────────────
  return {
    images,
    otherFiles,
    attachedFiles,
    onComposerPaste,
    onAttachFile,
    removeImage,
    removeFile,
    onComposerChange,
    handleTokenDeleteKeyDown,
    buildAttachedFilesBlock,
    clearAttachments,
    cleanupSentFiles,
  }
}
