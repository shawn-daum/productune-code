import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  ping: (): Promise<string> =>
    ipcRenderer.invoke('ping'),

  // ── Shell ───────────────────────────────────────────────────────────────────
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('shell:openExternal', url),

  // ── Onboarding ──────────────────────────────────────────────────────────────
  checkEnv: (): Promise<boolean> =>
    ipcRenderer.invoke('onboarding:checkEnv'),

  detectHardware: (): Promise<{ tier: 'S' | 'A' | 'B'; ram_gb: number; apple_silicon: boolean; docker: boolean }> =>
    ipcRenderer.invoke('onboarding:detectHardware'),

  completeOnboarding: (opts: {
    engine: 'claude' | 'codex' | 'both'
    wikiBackend: 'filesystem' | 'graphiti'
    anthropicKey?: string
    openaiKey?: string
  }): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('onboarding:complete', opts),

  installDocker: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('onboarding:installDocker'),

  /** Subscribe to streamed log lines from installDocker. Returns an unsubscribe fn. */
  onDockerLog: (cb: (line: string) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, line: string) => cb(line)
    ipcRenderer.on('onboarding:installDocker:log', listener)
    return () => ipcRenderer.removeListener('onboarding:installDocker:log', listener)
  },

  openDockerApp: (): Promise<void> =>
    ipcRenderer.invoke('onboarding:openDockerApp'),

  checkClaude: (): Promise<{ installed: boolean; authed: boolean }> =>
    ipcRenderer.invoke('onboarding:checkClaude'),

  checkCodex: (): Promise<{ installed: boolean; authed: boolean }> =>
    ipcRenderer.invoke('onboarding:checkCodex'),

  claudeLogin: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('onboarding:claudeLogin'),

  codexLogin: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('onboarding:codexLogin'),

  initProject: (opts: { slug: string; mode: 'planner' | 'developer'; projectDir: string }) =>
    ipcRenderer.invoke('init:project', opts),

  createProject: (opts: { slug: string; mode: 'planner' | 'developer' }): Promise<{ projectDir: string; config: unknown }> =>
    ipcRenderer.invoke('project:create', opts),

  openFolder: (): Promise<{ dir: string; hasProductune: boolean; config: unknown } | null> =>
    ipcRenderer.invoke('dialog:openFolder'),

  listProjects: (): Promise<Array<{ slug: string; mode: string; created_at: string; path: string }>> =>
    ipcRenderer.invoke('projects:list'),

  githubCheckToken: () =>
    ipcRenderer.invoke('github:checkToken'),

  githubStartDeviceFlow: (clientId: string) =>
    ipcRenderer.invoke('github:startDeviceFlow', clientId),

  githubPollDeviceFlow: (opts: { clientId: string; deviceCode: string; interval: number }) =>
    ipcRenderer.invoke('github:pollDeviceFlow', opts),

  githubCreateRepo: (opts: { token: string; slug: string }) =>
    ipcRenderer.invoke('github:createRepo', opts),

  githubSetupRemote: (opts: { projectDir: string; cloneUrl: string }) =>
    ipcRenderer.invoke('github:setupRemote', opts),
})
