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

  clearLocalStorage: (): Promise<{ ok: boolean; removed: string[]; errors: string[] }> =>
    ipcRenderer.invoke('onboarding:clearLocalStorage'),

  initProject: (opts: { slug: string; projectDir: string }) =>
    ipcRenderer.invoke('init:project', opts),

  createProject: (opts: { slug: string; initialVersionId?: string }): Promise<{ projectDir: string; config: { slug: string; created_at: string; version: string; initial_version?: string } }> =>
    ipcRenderer.invoke('project:create', opts),

  installAt: (opts: { projectDir: string }): Promise<{ projectDir: string; config: { slug: string; created_at: string; version: string } }> =>
    ipcRenderer.invoke('project:installAt', opts),

  openFolder: (): Promise<
    | { kind: 'self'; dir: string; config: { slug: string; created_at?: string; [k: string]: any } }
    | { kind: 'self-legacy'; dir: string; hints: string[] }
    | { kind: 'descendant'; dir: string; descendants: Array<{ path: string; config: { slug: string; [k: string]: any } }> }
    | { kind: 'none'; dir: string }
    | null
  > => ipcRenderer.invoke('dialog:openFolder'),

  openFilePicker: (): Promise<string[]> =>
    ipcRenderer.invoke('dialog:openFilePicker'),

  migrateLegacy: (opts: { projectDir: string; slug?: string }): Promise<{ projectDir: string; config: { slug: string; created_at: string; version: string }; migrated: boolean }> =>
    ipcRenderer.invoke('project:migrateLegacy', opts),

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

  // ── Pending promotions (T-P4-066) ────────────────────────────────────────────
  appendPendingPromotion: (
    projectDir: string,
    candidate: import('@productune/core').PendingPromotion,
  ): Promise<import('@productune/core').PendingPromotion> =>
    ipcRenderer.invoke('state:appendPendingPromotion', projectDir, candidate),

  listPendingPromotions: (projectDir: string): Promise<import('@productune/core').PendingPromotion[]> =>
    ipcRenderer.invoke('state:listPendingPromotions', projectDir),

  resolvePendingPromotion: (
    projectDir: string,
    id: string,
    status: 'approved' | 'dropped' | 'edited',
    finalTarget?: string,
  ): Promise<import('@productune/core').PendingPromotion | null> =>
    ipcRenderer.invoke('state:resolvePendingPromotion', projectDir, id, status, finalTarget),

  autoDropStale: (projectDir: string): Promise<number> =>
    ipcRenderer.invoke('state:autoDropStale', projectDir),

  markSurfaced: (projectDir: string, id: string): Promise<void> =>
    ipcRenderer.invoke('state:markSurfaced', projectDir, id),

  listAllPromotions: (projectDir: string): Promise<import('@productune/core').PendingPromotion[]> =>
    ipcRenderer.invoke('state:listAllPromotions', projectDir),

  mechanicalWrite: (
    promotion: import('@productune/core').PendingPromotion,
    claudeSessionId?: string,
  ): Promise<{ ok: boolean; error?: string; jobId?: string }> =>
    ipcRenderer.invoke('state:mechanicalWrite', promotion, claudeSessionId),

  // ── Ticket md scan (v2 sub-f — replaces poState.past_tickets) ───────────────
  scanTickets: (projectDir: string): Promise<import('../src/lib/types').Ticket[]> =>
    ipcRenderer.invoke('tickets:scan', projectDir),

  /** Subscribe to ticket fs-watch change events (debounced 500ms). */
  onTicketsChanged: (cb: (projectDir: string) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, projectDir: string) => cb(projectDir)
    ipcRenderer.on('tickets:changed', listener)
    return () => ipcRenderer.removeListener('tickets:changed', listener)
  },

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

  // ── PO streaming (T-P4-041; v2 sub-c: persona param removed) ────────────────
  poSendMessage: (opts: {
    projectDir: string
    text: string
    resume?: string | null
  }): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('po:sendMessage', opts),

  /** First event after `poSendMessage` — main allocates the assistant msgId. */
  poOnMsgId: (cb: (msgId: string) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, msgId: string) => cb(msgId)
    ipcRenderer.on('po:onMsgId', listener)
    return () => ipcRenderer.removeListener('po:onMsgId', listener)
  },

  poOnToken: (cb: (msgId: string, chunk: string) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, msgId: string, chunk: string) =>
      cb(msgId, chunk)
    ipcRenderer.on('po:onToken', listener)
    return () => ipcRenderer.removeListener('po:onToken', listener)
  },

  poOnAnnounce: (
    cb: (msgId: string, payload: { level: 'system' | 'tool' | 'error'; text: string }) => void,
  ) => {
    const listener = (
      _e: Electron.IpcRendererEvent,
      msgId: string,
      payload: { level: 'system' | 'tool' | 'error'; text: string },
    ) => cb(msgId, payload)
    ipcRenderer.on('po:onAnnounce', listener)
    return () => ipcRenderer.removeListener('po:onAnnounce', listener)
  },

  poOnDone: (cb: (msgId: string, info: { sessionId?: string }) => void) => {
    const listener = (
      _e: Electron.IpcRendererEvent,
      msgId: string,
      info: { sessionId?: string },
    ) => cb(msgId, info)
    ipcRenderer.on('po:onDone', listener)
    return () => ipcRenderer.removeListener('po:onDone', listener)
  },

  /** Subscribe to PO session health events (T-P4-059). Returns an unsubscribe fn. */
  poOnHealth: (cb: (event: {
    state: 'healthy' | 'delegating' | 'compacting' | 'rate-limited' | 'permission-blocked' | 'error-other'
    detail?: { persona?: string; resetAt?: string; errorMessage?: string; deniedPattern?: string }
    at: string
    msgId?: string
  }) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, event: any) => cb(event)
    ipcRenderer.on('po:onHealth', listener)
    return () => ipcRenderer.removeListener('po:onHealth', listener)
  },

  /** Restart the PO session — kills active child + resets sessionId. Returns { ok: boolean }. */
  poRestartSession: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('po:restartSession'),

  /** Subscribe to session-restarted acknowledgement from main. Returns an unsubscribe fn. */
  poOnSessionRestarted: (cb: () => void) => {
    const listener = () => cb()
    ipcRenderer.on('po:sessionRestarted', listener)
    return () => ipcRenderer.removeListener('po:sessionRestarted', listener)
  },

  // ── Vercel integration token (OQ-T022-1 (b)) ────────────────────────────────
  getVercelToken: (): Promise<string | null> =>
    ipcRenderer.invoke('settings:getVercelToken'),

  setVercelToken: (token: string | null): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('settings:setVercelToken', token),

  // ── Deploy modal trigger (T-P4-022 — PO → renderer) ─────────────────────────
  /** Subscribe to PO-initiated deploy confirm modal trigger. Returns unsubscribe fn. */
  onDeployModal: (cb: (payload: {
    tickets: Array<{ id: string; title: string }>
    gitRef: string
    project: string
    projectDir?: string
    owner?: string
    repo?: string
    branchName?: string
    ticketId?: string
    ticketTitle?: string
    ticketAcceptance?: string
    vercelProject?: string
  }) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: any) => cb(payload)
    ipcRenderer.on('deploy:openModal', listener)
    return () => ipcRenderer.removeListener('deploy:openModal', listener)
  },

  // ── Settings ─────────────────────────────────────────────────────────────────
  getUiLanguage: (): Promise<'en' | 'ko'> =>
    ipcRenderer.invoke('settings:getUiLanguage'),

  setUiLanguage: (lng: 'en' | 'ko'): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('settings:setUiLanguage', lng),

  hasLanguagePref: (): Promise<boolean> =>
    ipcRenderer.invoke('settings:hasLanguagePref'),

  getOsLocale: (): Promise<string> =>
    ipcRenderer.invoke('settings:getOsLocale'),

  // ── Git workflow rules ───────────────────────────────────────────────────────
  loadRules: (projectDir: string): Promise<import('@productune/core').GitRules> =>
    ipcRenderer.invoke('settings:loadRules', projectDir),

  saveRules: (projectDir: string, rules: import('@productune/core').GitRules): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('settings:saveRules', projectDir, rules),

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

  // ── Quick Open file listing (T-P4-047) ──────────────────────────────────────
  listProjectFiles: (projectDir: string): Promise<Array<{ path: string; ext: string }>> =>
    ipcRenderer.invoke('slash:listProjectFiles', projectDir),

  // ── Explorer (T-P4-045) ───────────────────────────────────────────────────────
  explorerListDir: (absPath: string): Promise<Array<{ name: string; path: string; isDir: boolean }>> =>
    ipcRenderer.invoke('explorer:listDir', absPath),

  explorerWatch: (root: string): Promise<void> =>
    ipcRenderer.invoke('explorer:watch', root),

  explorerUnwatch: (): Promise<void> =>
    ipcRenderer.invoke('explorer:unwatch'),

  explorerRevealInOS: (absPath: string): Promise<void> =>
    ipcRenderer.invoke('explorer:revealInOS', absPath),

  /** Subscribe to explorer fs-change events. Returns an unsubscribe fn. */
  explorerOnFsChanged: (cb: (payload: { type: string; path: string }) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: { type: string; path: string }) => cb(payload)
    ipcRenderer.on('explorer:fs-changed', listener)
    return () => ipcRenderer.removeListener('explorer:fs-changed', listener)
  },

  // ── Vercel deploy event cross-ref (T-P4-023 sub-c) ──────────────────────────
  fetchDeployEvents: (args: {
    projectDir: string
    projectName: string
    sinceIso: string
    untilIso: string
  }): Promise<{ ok: boolean; events: Array<{
    deploymentId: string
    url: string
    createdAt: string
    readyAt: string | null
    state: string
    gitRef: string | null
    includedTickets: string[]
    mergedShaSet: string[]
  }>; error?: string }> =>
    ipcRenderer.invoke('deploy:fetch-events', args),

  // ── Deploy execute + conflict resolution (T-P4-022 3rd PR) ──────────────────
  deploy: {
    /** Poll the current state of a Vercel deployment. */
    state: (args: { projectDir: string; deploymentId: string }): Promise<{ ok: boolean; state?: string; error?: string }> =>
      ipcRenderer.invoke('deploy:state', args),

    execute: (args: {
      projectDir: string
      owner: string
      repo: string
      branchName: string
      ticketId: string
      ticketTitle: string
      ticketAcceptance?: string
      vercelProject?: string
    }): Promise<{ ok: boolean; prUrl?: string; deployUrl?: string; error?: string; errorReason?: string }> =>
      ipcRenderer.invoke('deploy:execute', args),

    resolveConflict: (args: {
      strategy: 'theirs' | 'ours' | 'manual'
    }): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('deploy:resolve-conflict', args),

    onProgress: (cb: (ev: {
      step: 'pr-creating' | 'pr-created' | 'merging' | 'merged' | 'deploy-triggering' | 'deploy-triggered' | 'failed'
      prUrl?: string
      prNumber?: number
      sha?: string
      deployUrl?: string
      error?: string
      errorReason?: string
    }) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, ev: any) => cb(ev)
      ipcRenderer.on('deploy:progress', listener)
      return () => ipcRenderer.removeListener('deploy:progress', listener)
    },

    onConflict: (cb: (ev: {
      owner: string
      repo: string
      prNumber: number
      conflictPaths: string[]
      conflictType?: 'trivial' | 'semantic'
    }) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, ev: any) => cb(ev)
      ipcRenderer.on('deploy:conflict', listener)
      return () => ipcRenderer.removeListener('deploy:conflict', listener)
    },
  },
})
