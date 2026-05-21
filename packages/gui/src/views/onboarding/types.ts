export type Engine = 'claude' | 'codex' | 'both'
export type WikiBackend = 'filesystem' | 'graphiti'
export type Tier = 'S' | 'A' | 'B'
export type UiLang = 'en' | 'ko'
export type WizardStep = 0 | 1 | 2 | 3 | '3.5' | 4
export type LlmPhase = 'idle' | 'installing' | 'setup-graphiti' | 'registering-mcp' | 'done' | 'error'

export interface GraphitiConfig {
  llmProvider: 'ollama'
  llmModel: string
  embedderProvider: 'ollama'
  embedderModel: string
}

export interface HardwareInfo {
  tier: Tier
  ram_gb: number
  apple_silicon: boolean
  docker: boolean
}

export interface EngineStatus {
  installed: boolean
  authed: boolean
}
