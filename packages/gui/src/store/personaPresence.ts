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
const AGENT_TYPE_TO_PERSONA: Record<string, PersonaId> = {
  'pdt-po':        'po',
  'pdt-designer':  'designer',
  'pdt-developer': 'dev',
  'pdt-qa':        'qa',
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

// ── Store ────────────────────────────────────────────────────────────────────

interface PersonaPresenceState {
  entries: Record<PersonaId, PersonaEntry>

  /** Apply a PersonaStatusEvent (main→renderer IPC payload or direct call). */
  setPersonaState: (
    persona: PersonaId,
    state: PersonaState,
    opts?: SetPersonaStateOpts,
  ) => void

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

export const usePersonaPresence = create<PersonaPresenceState>((set) => ({
  entries: makeDefaultEntries(),

  setPersonaState: (persona, state, opts) => {
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
      return {
        entries: { ...s.entries, [persona]: next },
      }
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
      }
    })
  },

  resetAll: () => {
    // T-PATCH-164: 전체 reset 시 모든 persona 타이머 cleanup.
    for (const persona of PERSONA_ORDER) clearAutoIdle(persona)
    set({ entries: makeDefaultEntries() })
  },
}))
