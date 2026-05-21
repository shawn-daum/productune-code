import { useState, useRef, useEffect } from 'react'
import {
  SIDEBAR_STORAGE_KEY, PO_CHAT_STORAGE_KEY,
  SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH,
  PO_CHAT_DEFAULT_WIDTH, PO_CHAT_MIN_WIDTH, PO_CHAT_MAX_WIDTH,
} from './constants'
import { readStoredWidth, persistWidth, clampSidebarWidth, clampPoChatWidth } from './helpers'

export interface ResizeLayoutResult {
  shellRef: React.RefObject<HTMLDivElement>
  sidebarWidth: number
  poChatWidth: number
  activeResizeHandle: 'sidebar' | 'chat' | null
  startResize: (kind: 'sidebar' | 'chat', event: React.MouseEvent<HTMLDivElement>) => void
}

export function useResizeLayout(chatPanelVisible: boolean): ResizeLayoutResult {
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    readStoredWidth(SIDEBAR_STORAGE_KEY, SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH),
  )
  const [poChatWidth, setPoChatWidth] = useState(() =>
    readStoredWidth(PO_CHAT_STORAGE_KEY, PO_CHAT_DEFAULT_WIDTH, PO_CHAT_MIN_WIDTH, PO_CHAT_MAX_WIDTH),
  )
  const [activeResizeHandle, setActiveResizeHandle] = useState<'sidebar' | 'chat' | null>(null)

  const shellRef            = useRef<HTMLDivElement>(null)
  const sidebarWidthRef     = useRef(sidebarWidth)
  const poChatWidthRef      = useRef(poChatWidth)
  const chatPanelVisibleRef = useRef(false)
  const dragStateRef        = useRef<{ kind: 'sidebar' | 'chat'; startX: number; startWidth: number } | null>(null)
  const bodyStyleRef        = useRef<{ cursor: string; userSelect: string } | null>(null)

  // ── Ref sync effects ─────────────────────────────────────────────────────────
  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth
  }, [sidebarWidth])

  useEffect(() => {
    poChatWidthRef.current = poChatWidth
  }, [poChatWidth])

  useEffect(() => {
    chatPanelVisibleRef.current = chatPanelVisible
  }, [chatPanelVisible])

  // ── Viewport sync ────────────────────────────────────────────────────────────
  const syncLayoutWidthsToViewport = () => {
    const shellWidth = shellRef.current?.getBoundingClientRect().width ?? 0
    if (shellWidth <= 0) return

    let nextSidebar = clampSidebarWidth(
      sidebarWidthRef.current,
      shellWidth,
      poChatWidthRef.current,
      chatPanelVisibleRef.current,
    )
    let nextChat = chatPanelVisibleRef.current
      ? clampPoChatWidth(poChatWidthRef.current, shellWidth, nextSidebar)
      : poChatWidthRef.current

    if (chatPanelVisibleRef.current) {
      nextSidebar = clampSidebarWidth(nextSidebar, shellWidth, nextChat, true)
      nextChat = clampPoChatWidth(nextChat, shellWidth, nextSidebar)
    }

    if (nextSidebar !== sidebarWidthRef.current) {
      sidebarWidthRef.current = nextSidebar
      setSidebarWidth(nextSidebar)
    }
    if (nextChat !== poChatWidthRef.current) {
      poChatWidthRef.current = nextChat
      setPoChatWidth(nextChat)
    }
  }

  useEffect(() => {
    syncLayoutWidthsToViewport()
    window.addEventListener('resize', syncLayoutWidthsToViewport)
    return () => window.removeEventListener('resize', syncLayoutWidthsToViewport)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    syncLayoutWidthsToViewport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatPanelVisible])

  // ── Drag mousemove / mouseup handler ────────────────────────────────────────
  useEffect(() => {
    const finishDrag = (shouldUpdateState = true) => {
      const dragState = dragStateRef.current
      if (!dragState) return

      if (dragState.kind === 'sidebar') {
        persistWidth(SIDEBAR_STORAGE_KEY, sidebarWidthRef.current)
      } else {
        persistWidth(PO_CHAT_STORAGE_KEY, poChatWidthRef.current)
      }

      dragStateRef.current = null
      if (shouldUpdateState) {
        setActiveResizeHandle(null)
      }

      const previousBodyStyle = bodyStyleRef.current
      if (previousBodyStyle) {
        document.body.style.cursor = previousBodyStyle.cursor
        document.body.style.userSelect = previousBodyStyle.userSelect
        bodyStyleRef.current = null
      } else {
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }

    const stopDrag = () => {
      finishDrag(true)
    }

    const onMouseMove = (event: MouseEvent) => {
      const dragState = dragStateRef.current
      if (!dragState) return

      event.preventDefault()
      const shellWidth = shellRef.current?.getBoundingClientRect().width ?? 0
      if (shellWidth <= 0) return

      const delta = event.clientX - dragState.startX
      if (dragState.kind === 'sidebar') {
        const nextWidth = clampSidebarWidth(
          dragState.startWidth + delta,
          shellWidth,
          poChatWidthRef.current,
          chatPanelVisibleRef.current,
        )
        if (nextWidth !== sidebarWidthRef.current) {
          sidebarWidthRef.current = nextWidth
          setSidebarWidth(nextWidth)
        }
        return
      }

      const nextWidth = clampPoChatWidth(
        dragState.startWidth - delta,
        shellWidth,
        sidebarWidthRef.current,
      )
      if (nextWidth !== poChatWidthRef.current) {
        poChatWidthRef.current = nextWidth
        setPoChatWidth(nextWidth)
      }
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', stopDrag)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', stopDrag)
      finishDrag(false)
    }
  }, [])

  const startResize = (kind: 'sidebar' | 'chat', event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    bodyStyleRef.current = {
      cursor: document.body.style.cursor,
      userSelect: document.body.style.userSelect,
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    dragStateRef.current = {
      kind,
      startX: event.clientX,
      startWidth: kind === 'sidebar' ? sidebarWidthRef.current : poChatWidthRef.current,
    }
    setActiveResizeHandle(kind)
  }

  return { shellRef, sidebarWidth, poChatWidth, activeResizeHandle, startResize }
}
