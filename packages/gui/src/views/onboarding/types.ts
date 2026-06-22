// codex폐기 (T-PATCH-235): Claude Code 단일 엔진 — union 불필요.
export type Engine = 'claude'
export type Tier = 'S' | 'A' | 'B'
export type UiLang = 'en' | 'ko'
export type WizardStep = 0 | 1 | 2 | 3

export interface EngineStatus {
  installed: boolean
  authed: boolean
}
