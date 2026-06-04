export type Engine = 'claude' | 'codex' | 'both'
export type Tier = 'S' | 'A' | 'B'
export type UiLang = 'en' | 'ko'
export type WizardStep = 0 | 1 | 2 | 3

export interface EngineStatus {
  installed: boolean
  authed: boolean
}
