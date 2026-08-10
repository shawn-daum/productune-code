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
import { coerceTodoItemRaw, type TodoItemRaw, type TodoType } from '../../shared/todo-item'

// ── Types ─────────────────────────────────────────────────────────────────────

export type TodoStatus = 'open' | 'done' | 'dismissed'

// T-434 (QA F8): the raw item's shape is declared ONCE, in `shared/todo-item.ts`
// — main, preload and this store all take it from there. Re-exported so existing
// importers keep working; re-DECLARING it here is what let `authIntent` exist on
// one copy and not the others.
export type { TodoItemRaw, TodoType }

/**
 * A stored todo: the raw item, with the fields the store resolves made
 * mandatory. Extending rather than restating means a field added to the wire
 * shape is automatically part of what the store holds — there is no second
 * list that can quietly lack it.
 */
export interface UserTodo extends TodoItemRaw {
  id: string
  type: TodoType
  status: TodoStatus
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
      for (const input of items) {
        // T-434 (QA F2, then F8): this was a hand-written field-by-field copy —
        // a whitelist — so a field missing from it was dropped at the store
        // boundary no matter what the type said, and that is exactly how
        // `authIntent` was lost. Naming the field fixed the symptom; the SHAPE
        // was the defect, and it recurred one layer up in main.
        //
        // The whitelist is gone. `coerceTodoItemRaw` walks a table the compiler
        // forces to cover every field of `TodoItemRaw` (shared/todo-item.ts),
        // and the spread below carries whatever it returns — so a new field
        // reaches the store by existing, not by being remembered here. It also
        // means this store never trusts the wire: unknown keys are dropped and
        // every value is checked, which is what makes the spread safe.
        const item = coerceTodoItemRaw(input)
        if (!item) continue
        const id =
          item.id ??
          `todo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        if (existingIds.has(id)) continue
        newItems.push({
          ...item,
          id,
          type: item.type ?? 'check',
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
