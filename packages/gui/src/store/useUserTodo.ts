/**
 * useUserTodo.ts — Zustand store for user-facing TODO items (T-P4-113).
 *
 * PO can push items via po:todo-items IPC (parsed from manual_steps_pending /
 * pending_user_actions envelope fields). Users complete items via check, text-input,
 * or link interactions in TodoListPanel.
 *
 * Lifecycle: created → open → done | dismissed.
 * In-memory only (per §Out of scope). Resets on project change or explicit resetAll.
 */

import { create } from 'zustand'

// ── Types ─────────────────────────────────────────────────────────────────────

export type TodoStatus = 'open' | 'done' | 'dismissed'
export type TodoType = 'check' | 'text-input' | 'link'

export interface UserTodo {
  id: string
  description: string
  type: TodoType
  /** href for type='link' — file path or tab id to open. */
  href?: string
  status: TodoStatus
}

/** Raw shape from PO envelope (manual_steps_pending / pending_user_actions). */
export interface TodoItemRaw {
  id?: string
  description: string
  type?: 'check' | 'text-input' | 'link'
  href?: string
}

interface UserTodoState {
  todos: UserTodo[]
  /** Whether the TodoListPanel accordion is expanded. */
  todoExpanded: boolean

  /** Push new items from PO envelope. Idempotent on duplicate id. */
  pushItems: (items: TodoItemRaw[]) => void

  /** Mark a todo done (by user action). */
  completeTodo: (id: string) => void

  /** Mark a todo dismissed (by PO po:todo-dismiss IPC). */
  dismissTodo: (id: string) => void

  /** Dismiss multiple todos by id array. */
  dismissByIds: (ids: string[]) => void

  /** Toggle expand/collapse of the list panel. */
  toggleExpanded: () => void

  /** Reset all todos — call on session restart or project change. */
  resetAll: () => void
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useUserTodo = create<UserTodoState>((set) => ({
  todos: [],
  todoExpanded: false,

  pushItems: (items) =>
    set((s) => {
      const existingIds = new Set(s.todos.map((t) => t.id))
      const newItems: UserTodo[] = []
      for (const item of items) {
        if (!item.description) continue
        const id =
          item.id ??
          `todo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        if (existingIds.has(id)) continue
        newItems.push({
          id,
          description: item.description,
          type: item.type ?? 'check',
          href: item.href,
          status: 'open',
        })
        existingIds.add(id) // handle duplicates within same batch
      }
      if (newItems.length === 0) return s
      return { todos: [...s.todos, ...newItems] }
    }),

  completeTodo: (id) =>
    set((s) => ({
      todos: s.todos.map((t) =>
        t.id === id && t.status !== 'done' ? { ...t, status: 'done' } : t,
      ),
    })),

  dismissTodo: (id) =>
    set((s) => ({
      todos: s.todos.map((t) =>
        t.id === id ? { ...t, status: 'dismissed' } : t,
      ),
    })),

  dismissByIds: (ids) =>
    set((s) => ({
      todos: s.todos.map((t) =>
        ids.includes(t.id) ? { ...t, status: 'dismissed' } : t,
      ),
    })),

  toggleExpanded: () => set((s) => ({ todoExpanded: !s.todoExpanded })),

  resetAll: () => set({ todos: [], todoExpanded: false }),
}))

// ── Selectors ─────────────────────────────────────────────────────────────────

/** Count of todos that are neither done nor dismissed (shown in chip badge). */
export function selectOpenCount(todos: UserTodo[]): number {
  return todos.filter((t) => t.status !== 'done' && t.status !== 'dismissed').length
}

/** Todos visible in the list (all except dismissed). */
export function selectVisibleTodos(todos: UserTodo[]): UserTodo[] {
  return todos.filter((t) => t.status !== 'dismissed')
}
