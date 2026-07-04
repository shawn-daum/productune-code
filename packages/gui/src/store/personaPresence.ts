import { create } from 'zustand'

// ── Types ────────────────────────────────────────────────────────────────────

export type PersonaId = 'po' | 'designer' | 'dev' | 'qa'

export type PersonaState = 'idle' | 'working' | 'done'

export interface PersonaStatusEvent {
  persona: PersonaId
  state: PersonaState
  artifact?: string  // done 일 때만 채움 — tooltip 노출용 짧은 이름
  at: string         // ISO timestamp
}

export interface PersonaEntry {
  persona: PersonaId
  state: PersonaState
  artifact?: string
  /** working — sub-agent 작업 요약(delegating detail.task). done 전이 시 artifact 로 승계. */
  task?: string
  updatedAt: string
}

/** Optional payload for setPersonaState transitions. */
export interface SetPersonaStateOpts {
  /** working — 작업 요약(tooltip 노출용). */
  task?: string
  /** done — artifact 명시. 미지정이면 직전 entry.task 를 승계. */
  artifact?: string
}

// ── pdt-* agentType → PersonaId 단일 소스 (T-PATCH-148) ───────────────────────
// PO 가 Task 도구로 위임할 때 emit 하는 subagent_type(`pdt-po` / `pdt-designer` /
// `pdt-developer` / `pdt-qa`)을 store PersonaId 로 변환하는 단일 진입점.
//
// 명시적 Record lookup 으로 한다 — `pdt-` slice + `developer`→`dev` 휴리스틱은
// 예외 매핑(`developer`→`dev`) 때문에 깨지기 쉬우므로 lookup 이 더 안전.
//
// helpers.ts 의 persona-id 매핑은 이 함수로 수렴 완료(T-PATCH-149).
// store/workspace.ts:726, store/useBackgroundTasks.ts:138 은 출력 도메인이 달라
// (PersonaId 가 아닌 다른 타입을 내므로) 수렴 대상 아님 — 의도적으로 별도 유지.
//
// T-285 (adapter A2): `prdt-*` id 추가 등록 — 치환 아닌 legacy(pdt-*)와의 공존.
// prdt 프로젝트에서 PO가 emit하는 subagent_type은 `prdt-po`/`prdt-designer`/
// `prdt-developer`/`prdt-qa`이며, 이 맵이 renderer 단일 SoT이므로 양쪽을 함께
// 등록한다. legacy pdt-* 항목은 무수정.
const AGENT_TYPE_TO_PERSONA: Record<string, PersonaId> = {
  'pdt-po':        'po',
  'pdt-designer':  'designer',
  'pdt-developer': 'dev',
  'pdt-qa':        'qa',
  'prdt-po':        'po',
  'prdt-designer':  'designer',
  'prdt-developer': 'dev',
  'prdt-qa':        'qa',
}

/**
 * pdt-* agentType → PersonaId. 알 수 없는 type 이면 null(호출부가 no-op 처리).
 */
export function personaIdFromAgentType(agentType: string): PersonaId | null {
  return AGENT_TYPE_TO_PERSONA[agentType] ?? null
}

// ── Tab order: PO → Designer → Dev → QA ────────────────────────────────────

export const PERSONA_ORDER: PersonaId[] = ['po', 'designer', 'dev', 'qa']

export const PERSONA_LABELS: Record<PersonaId, string> = {
  po:       'PO',
  designer: 'Designer',
  dev:      'Developer',
  qa:       'QA',
}

// ── CSS color tokens (fallback hex for inline styles) ────────────────────────
// Mirrors CSS vars: --po / --designer / --dev / --qa (defined in global CSS or
// injected inline here as fallback until global token sheet lands).

export const PERSONA_COLORS: Record<PersonaId, string> = {
  po:       '#8B5CF6',  // --po  (brand violet, T-006 Option B)
  designer: '#FB923C',  // --designer (orange-400, T-006 Option B)
  dev:      '#38BDF8',  // --dev (sky-400)
  qa:       '#34D399',  // --qa
}

// ── Derived selectors (T-PATCH-177) ───────────────────────────────────────────
// SoT for the tray bridge's persona derivation, exported so the sort/idle logic
// lives in one place (testable, no drift between store + trayBridge).

/**
 * Active persona for the tray: the most-recently-updated persona currently in
 * the `working` state. `done` is intentionally ignored — it's a 2s flash before
 * auto-idle (T-PATCH-164) and reflecting it would make the tray flicker. Returns
 * null when no persona is working.
 */
export function selectActivePersona(
  entries: Record<PersonaId, PersonaEntry>,
): PersonaId | null {
  const working = Object.values(entries).filter((e) => e.state === 'working')
  if (working.length === 0) return null
  // Most-recent-first by updatedAt (ISO strings sort lexicographically by time).
  working.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
  return working[0].persona
}

/** True when every persona is idle (none working/done). */
export function selectAllIdle(entries: Record<PersonaId, PersonaEntry>): boolean {
  return Object.values(entries).every((e) => e.state === 'idle')
}

/**
 * T-PATCH-270 (#9): latest-active WORKER (designer/dev/qa), PO HARD-EXCLUDED.
 * The stream slot follows this — not selectActivePersona, which can return PO
 * (PO uses `working` too) and would otherwise suppress a live worker's slot
 * whenever PO updated more recently. Returns null when no worker is working.
 */
export function selectActiveWorker(
  entries: Record<PersonaId, PersonaEntry>,
): PersonaId | null {
  const working = Object.values(entries).filter(
    (e) => e.persona !== 'po' && e.state === 'working',
  )
  if (working.length === 0) return null
  working.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
  return working[0].persona
}

// ── Store ────────────────────────────────────────────────────────────────────

// ── Worker output stream tail (T-PATCH-270 #9 · T-PATCH-281) ──────────────────
// Bounded ring of the latest worker output lines per persona. PO is excluded by
// construction — pushStreamLine is only fed by the po:worker-stream channel,
// which never carries PO.
//
// T-PATCH-281 (#4/AC-5): each ring entry is a StreamLine {text, kind} so the
// renderer can style worker PROSE (natural language, primary) apart from TOOL
// lines (compact tool traces, subordinate) and fall back to tool-only when no
// prose flowed.

export type StreamLineKind = 'prose' | 'tool'

export interface StreamLine {
  text: string
  kind: StreamLineKind
}

/**
 * T-PATCH-281 (AC-7/AC-6): frozen result of a completed worker delegation. Split
 * from the LIVE streamTail so it survives the sprite's 2s done→idle auto-collapse
 * and persists until the next turn (§Persist-reconcile). `lines` is a snapshot of
 * the tail at freeze time; `summary` is the worker's final headline (promoted
 * prose); `usage`/`startedAt`/`completedAt` drive the cost+duration display.
 */
export interface WorkerResult {
  lines: StreamLine[]
  usage?: { total_tokens?: number; tool_uses?: number; duration_ms?: number }
  startedAt?: number
  completedAt?: number
}

/** T-PATCH-281 (AC-7): live per-worker meta (usage/duration), refreshed while
 *  running (task_progress) and finalized at completion. */
export interface WorkerMeta {
  usage?: { total_tokens?: number; tool_uses?: number; duration_ms?: number }
  startedAt?: number
  completedAt?: number
}

/** Lines the COLLAPSED slot shows (short tail). The expanded overlay shows up to
 *  STREAM_LOG_MAX. We keep a single ring at STREAM_LOG_MAX and the collapsed slot
 *  slices the last STREAM_TAIL_MAX at render — no dual ring. */
export const STREAM_TAIL_MAX = 6
/** T-PATCH-281 (AC-2): longer retained buffer for the expand overlay. */
export const STREAM_LOG_MAX = 200

interface PersonaPresenceState {
  entries: Record<PersonaId, PersonaEntry>
  /** T-PATCH-270 (#9) · T-PATCH-281: per-persona ring of {text,kind} lines (live). */
  streamTail: Record<PersonaId, StreamLine[]>
  /** T-PATCH-281 (AC-6): frozen result per worker, persists past the 2s auto-idle
   *  until the next turn clears it. null when no completed result is held. */
  workerResult: Record<PersonaId, WorkerResult | null>
  /** T-PATCH-281 (AC-7): live cost/duration meta per worker. */
  workerMeta: Record<PersonaId, WorkerMeta>

  /** Apply a PersonaStatusEvent (main→renderer IPC payload or direct call). */
  setPersonaState: (
    persona: PersonaId,
    state: PersonaState,
    opts?: SetPersonaStateOpts,
  ) => void

  /**
   * T-PATCH-270 (#9): append a worker line to a persona's ring (capped at
   * STREAM_LOG_MAX). PO is HARD-EXCLUDED (no-op) so the PO path (T-PATCH-252)
   * never streams worker output. Also a hard #10 backstop: if the line arrives
   * while the persona isn't `working` (e.g. the parent delegating event was
   * dropped), flip it to `working` — nested worker activity is ground-truth.
   * T-PATCH-281: `kind` tags prose vs tool (default 'tool' for back-compat).
   */
  pushStreamLine: (persona: PersonaId, line: string, kind?: StreamLineKind) => void

  /** T-PATCH-281 (AC-7): merge live worker meta (usage/startedAt/completedAt). */
  setWorkerMeta: (persona: PersonaId, meta: WorkerMeta) => void

  /**
   * T-PATCH-281 (AC-6): freeze the persona's current live tail + meta into
   * workerResult so it survives the sprite auto-idle collapse. Called at
   * subagent-done BEFORE clearStreamTail. No-op for PO / empty tail.
   */
  freezeWorkerResult: (persona: PersonaId) => void

  /**
   * T-PATCH-281 (AC-6): clear ALL held worker results (+ any live tails/meta) —
   * the "next turn" trigger. Called on user chat send / a worker entering `working`
   * / session restart.
   */
  clearWorkerResults: () => void

  /** T-PATCH-270 (#9): clear a persona's LIVE stream ring (called on done collapse).
   *  Does NOT touch workerResult (that's the persisted copy). */
  clearStreamTail: (persona: PersonaId) => void

  /** Reset a persona back to idle (called by done-dismiss logic). */
  dismissDone: (persona: PersonaId) => void

  /** Reset all to idle — called on app boot / page reload. */
  resetAll: () => void
}

// ── done → idle 자동 복귀 타이머 (T-PATCH-164) ────────────────────────────────
// store/컴포넌트 밖 모듈 스코프에 persona별 핸들을 둔다. store 는 unmount 훅이
// 없으므로 cleanup 은 "전이마다 clear→arm + dismiss/reset 시 clear"로 보장한다.
const autoIdleTimers: Partial<Record<PersonaId, ReturnType<typeof setTimeout>>> = {}
const AUTO_IDLE_MS = 2000  // T-PATCH-164: done flash 지속 (designer 확정값)

function clearAutoIdle(persona: PersonaId): void {
  const h = autoIdleTimers[persona]
  if (h) {
    clearTimeout(h)
    delete autoIdleTimers[persona]
  }
}

function makeDefaultEntries(): Record<PersonaId, PersonaEntry> {
  const now = new Date().toISOString()
  return {
    po:       { persona: 'po',       state: 'idle', updatedAt: now },
    designer: { persona: 'designer', state: 'idle', updatedAt: now },
    dev:      { persona: 'dev',      state: 'idle', updatedAt: now },
    qa:       { persona: 'qa',       state: 'idle', updatedAt: now },
  }
}

function makeEmptyStreamTail(): Record<PersonaId, StreamLine[]> {
  return { po: [], designer: [], dev: [], qa: [] }
}

function makeEmptyWorkerResult(): Record<PersonaId, WorkerResult | null> {
  return { po: null, designer: null, dev: null, qa: null }
}

function makeEmptyWorkerMeta(): Record<PersonaId, WorkerMeta> {
  return { po: {}, designer: {}, dev: {}, qa: {} }
}

export const usePersonaPresence = create<PersonaPresenceState>((set) => ({
  entries: makeDefaultEntries(),
  streamTail: makeEmptyStreamTail(),
  workerResult: makeEmptyWorkerResult(),
  workerMeta: makeEmptyWorkerMeta(),

  setPersonaState: (persona, state, opts) => {
    // T-PATCH-281 (AC-6 next-turn trigger): a WORKER freshly entering `working`
    // (was not already working) means a new task started → clear any held results
    // from the previous turn. Read prev state before the set so we only clear on a
    // genuine idle/done→working transition (not a working→working task refresh).
    const prevState = usePersonaPresence.getState().entries[persona].state
    const freshWorkerStart = persona !== 'po' && state === 'working' && prevState !== 'working'
    set((s) => {
      const prev = s.entries[persona]
      // working: opts.task 를 entry.task 에 저장(tooltip 노출용).
      // done:    artifact 미지정이면 직전 entry.task 를 승계(done tooltip 용, T-PATCH-148).
      // idle:    task/artifact 모두 clear.
      const next: PersonaEntry = {
        persona,
        state,
        artifact:
          state === 'done'
            ? (opts?.artifact ?? prev.task)
            : undefined,
        task: state === 'working' ? opts?.task : undefined,
        updatedAt: new Date().toISOString(),
      }
      const patch: Partial<PersonaPresenceState> = {
        entries: { ...s.entries, [persona]: next },
      }
      if (freshWorkerStart) {
        // Clear ALL held results (+ any stale live tails/meta) — the previous
        // turn's panels give way to this new task (§Persist-reconcile).
        patch.workerResult = makeEmptyWorkerResult()
        patch.workerMeta = makeEmptyWorkerMeta()
        patch.streamTail = makeEmptyStreamTail()
      }
      return patch
    })
    // T-PATCH-164: done → idle 자동 복귀 타이머 관리.
    // 모든 전이에서 먼저 해당 persona 의 기존 타이머를 cleanup(상태 충돌/중첩 방지),
    // 이어서 done 일 때만 새 타이머 arm. persona별 키로 독립 관리되므로 병렬 완료
    // (QA+Dev 동시)에서도 서로 간섭하지 않는다.
    clearAutoIdle(persona)
    if (state === 'done') {
      autoIdleTimers[persona] = setTimeout(() => {
        delete autoIdleTimers[persona]
        // 만료 시점에 여전히 done 일 때만 idle 전이(그 사이 working 재진입/수동
        // dismiss 보호 — stale closure 방지 위해 getState() 로 최신 state 재확인).
        const cur = usePersonaPresence.getState().entries[persona]
        if (cur.state === 'done') usePersonaPresence.getState().dismissDone(persona)
      }, AUTO_IDLE_MS)
    }
  },

  pushStreamLine: (persona, line, kind = 'tool') => {
    // PO HARD-EXCLUDED — the worker-stream channel never carries PO, but guard
    // defensively so the PO sprite path (T-PATCH-252) can never grow a tail.
    if (persona === 'po') return
    const trimmed = line.trim()
    if (!trimmed) return
    // #10 backstop: nested worker output is ground-truth that the worker is
    // live. If the entry isn't `working` (parent delegating event missing, or
    // already flipped to done by a stray healthy), re-assert working so the
    // sprite wakes from grey-idle. setPersonaState owns auto-idle timer cleanup
    // AND the fresh-working result clear, so we route through it.
    const entry = usePersonaPresence.getState().entries[persona]
    if (entry.state !== 'working') {
      usePersonaPresence.getState().setPersonaState(persona, 'working', { task: entry.task })
    }
    set((s) => {
      const prev = s.streamTail[persona]
      // Drop a byte-identical immediate repeat (defense against duplicate IPC) —
      // compare text only (kind never changes for the same text).
      if (prev.length > 0 && prev[prev.length - 1].text === trimmed) return s
      const nextLine: StreamLine = { text: trimmed, kind }
      return {
        streamTail: { ...s.streamTail, [persona]: [...prev, nextLine].slice(-STREAM_LOG_MAX) },
      }
    })
  },

  setWorkerMeta: (persona, meta) => {
    if (persona === 'po') return
    set((s) => {
      const prev = s.workerMeta[persona]
      const merged: WorkerMeta = {
        // usage: last-writer wins (task_progress refresh / completion final).
        usage: meta.usage ?? prev.usage,
        // startedAt: sticky (set once at task_started, don't overwrite with undefined).
        startedAt: meta.startedAt ?? prev.startedAt,
        completedAt: meta.completedAt ?? prev.completedAt,
      }
      return { workerMeta: { ...s.workerMeta, [persona]: merged } }
    })
  },

  freezeWorkerResult: (persona) => {
    if (persona === 'po') return
    set((s) => {
      const lines = s.streamTail[persona]
      const meta = s.workerMeta[persona]
      // Nothing to persist if the worker produced no lines AND no meta.
      if (lines.length === 0 && !meta.usage && meta.startedAt == null) return s
      const result: WorkerResult = {
        lines: lines.slice(-STREAM_LOG_MAX),
        usage: meta.usage,
        startedAt: meta.startedAt,
        completedAt: meta.completedAt ?? Date.now(),
      }
      return { workerResult: { ...s.workerResult, [persona]: result } }
    })
  },

  clearWorkerResults: () => {
    set((s) => {
      // No-op fast path — nothing held.
      const anyResult = PERSONA_ORDER.some((p) => s.workerResult[p] != null)
      const anyTail = PERSONA_ORDER.some((p) => s.streamTail[p].length > 0)
      if (!anyResult && !anyTail) return s
      return {
        workerResult: makeEmptyWorkerResult(),
        workerMeta: makeEmptyWorkerMeta(),
        streamTail: makeEmptyStreamTail(),
      }
    })
  },

  clearStreamTail: (persona) => {
    // Live ring only — workerResult (the persisted freeze) is untouched (AC-6).
    set((s) => {
      if (s.streamTail[persona].length === 0) return s
      return { streamTail: { ...s.streamTail, [persona]: [] } }
    })
  },

  dismissDone: (persona) => {
    // T-PATCH-164: 수동 dismiss 가 backstop 타이머보다 먼저 와도 leak 없게 cleanup.
    clearAutoIdle(persona)
    set((s) => {
      const entry = s.entries[persona]
      if (entry.state !== 'done') return s
      return {
        entries: {
          ...s.entries,
          [persona]: { ...entry, state: 'idle', artifact: undefined, task: undefined, updatedAt: new Date().toISOString() },
        },
        // T-PATCH-270 (#9): collapse the LIVE stream slot when the worker goes idle.
        // T-PATCH-281 (AC-6): workerResult is NOT cleared here — the frozen result
        // panel survives the sprite going grey until the next turn.
        streamTail: { ...s.streamTail, [persona]: [] },
      }
    })
  },

  resetAll: () => {
    // T-PATCH-164: 전체 reset 시 모든 persona 타이머 cleanup.
    for (const persona of PERSONA_ORDER) clearAutoIdle(persona)
    set({
      entries: makeDefaultEntries(),
      streamTail: makeEmptyStreamTail(),
      workerResult: makeEmptyWorkerResult(),
      workerMeta: makeEmptyWorkerMeta(),
    })
  },
}))
