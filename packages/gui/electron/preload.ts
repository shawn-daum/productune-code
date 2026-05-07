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
    uiLanguage?: 'en' | 'ko'
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

  initProject: (opts: { slug: string; projectDir: string }) =>
    ipcRenderer.invoke('init:project', opts),

  createProject: (opts: { slug: string }): Promise<{ projectDir: string; config: { slug: string; created_at: string; version: string } }> =>
    ipcRenderer.invoke('project:create', opts),

  installAt: (opts: { projectDir: string }): Promise<{ projectDir: string; config: { slug: string; created_at: string; version: string } }> =>
    ipcRenderer.invoke('project:installAt', opts),

  openFolder: (): Promise<
    | { kind: 'self'; dir: string; config: { slug: string; created_at?: string; [k: string]: any } }
    | { kind: 'descendant'; dir: string; descendants: Array<{ path: string; config: { slug: string; [k: string]: any } }> }
    | { kind: 'none'; dir: string }
    | null
  > => ipcRenderer.invoke('dialog:openFolder'),

  listProjects: (): Promise<Array<{ slug: string; created_at: string; path: string }>> =>
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

  // ── Workspace state ─────────────────────────────────────────────────────────
  readPoState: (projectDir: string): Promise<unknown> =>
    ipcRenderer.invoke('state:readPoState', projectDir),

  // ── Design artifacts ────────────────────────────────────────────────────────
  designListArtifacts: (projectRoot: string): Promise<string[]> =>
    ipcRenderer.invoke('design:listArtifacts', projectRoot),

  designReadArtifact: (projectRoot: string, relPath: string): Promise<string> =>
    ipcRenderer.invoke('design:readArtifact', projectRoot, relPath),

  // ── Chat (single PO session per project) ────────────────────────────────────
  chatGetSession: (projectDir: string): Promise<import('../src/lib/types').Session> =>
    ipcRenderer.invoke('chat:getSession', projectDir),

  chatAppendMessage: (
    projectDir: string,
    message: import('../src/lib/types').Message,
  ): Promise<void> =>
    ipcRenderer.invoke('chat:appendMessage', projectDir, message),

  chatSetClaudeSessionId: (projectDir: string, sessionId: string): Promise<void> =>
    ipcRenderer.invoke('chat:setClaudeSessionId', projectDir, sessionId),

  chatClearSession: (projectDir: string): Promise<void> =>
    ipcRenderer.invoke('chat:clearSession', projectDir),

  // ── Settings ─────────────────────────────────────────────────────────────────
  getUiLanguage: (): Promise<'en' | 'ko'> =>
    ipcRenderer.invoke('settings:getUiLanguage'),

  setUiLanguage: (lng: 'en' | 'ko'): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('settings:setUiLanguage', lng),

  hasLanguagePref: (): Promise<boolean> =>
    ipcRenderer.invoke('settings:hasLanguagePref'),

  getOsLocale: (): Promise<string> =>
    ipcRenderer.invoke('settings:getOsLocale'),

  // ── Menubar events (renderer subscribes; main process emits) ─────────────────
  onMenuNewProject: (cb: () => void) => {
    const listener = () => cb()
    ipcRenderer.on('menu:new-project', listener)
    return () => ipcRenderer.removeListener('menu:new-project', listener)
  },
  onMenuOpenProject: (cb: () => void) => {
    const listener = () => cb()
    ipcRenderer.on('menu:open-project', listener)
    return () => ipcRenderer.removeListener('menu:open-project', listener)
  },
})
