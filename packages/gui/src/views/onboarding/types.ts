// codex폐기 (T-PATCH-235): Claude Code 단일 엔진 — union 불필요.
export type Engine = 'claude'
export type Tier = 'S' | 'A' | 'B'
export type UiLang = 'en' | 'ko'
// T-326: local mirror of core AudienceMode (renderer avoids core import).
export type AudienceMode = 'planner' | 'developer'
// 0 Language · 1 Audience mode (T-326) · 2 Engine · 3 Engine connect · 4 Complete
export type WizardStep = 0 | 1 | 2 | 3 | 4

export interface EngineStatus {
  installed: boolean
  authed: boolean
}
