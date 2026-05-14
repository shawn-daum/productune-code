/**
 * injectUserMessage.ts — helper to programmatically inject a user message into
 * the PO chat session (T-P4-113).
 *
 * Used by TodoListPanel when the user completes a check or text-input todo.
 * Appends to the in-memory message list, persists to chat.json, and triggers
 * a PO response via poSendMessage.
 *
 * Guard: if `streaming === true`, returns immediately (noop). Callers should
 * disable action buttons while streaming to prevent this path.
 */

import type { Message } from './types'
import { useWorkspace } from '../store/workspace'

export async function injectUserMessage(text: string): Promise<void> {
  const project = useWorkspace.getState().project
  if (!project) return

  const streaming = useWorkspace.getState().streaming
  if (streaming) return

  const msg: Message = {
    id: `u-todo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role: 'user',
    kind: 'user',
    text,
    status: 'done',
    created_at: new Date().toISOString(),
  }

  useWorkspace.getState().appendMessage(msg)

  const api = (window as any).api
  try {
    await api.chatAppendMessage(project.projectDir, msg)
  } catch {
    /* ignore persist failure — in-memory append already done */
  }

  useWorkspace.getState().setStreaming(true)
  try {
    await api.poSendMessage({
      projectDir: project.projectDir,
      text,
      resume: useWorkspace.getState().claudeSessionId,
    })
  } catch {
    // If send fails, release the streaming lock so the user can retry.
    useWorkspace.getState().setStreaming(false)
  }
}
