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

  // ── Project onboarding state (T-P4-101) ─────────────────────────────────────
  /** Read project-scoped onboarding status. Returns 'pending' | 'done' | null (legacy/absent). */
  onboardingRead: (projectDir: string): Promise<'pending' | 'done' | null> =>
    ipcRenderer.invoke('onboarding:readProject', projectDir),

  /** Mark project onboarding as done (pending → done). */
  onboardingSetDone: (projectDir: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('onboarding:setDone', projectDir),

  initProject: (opts: { slug: string; projectDir: string }) =>
    ipcRenderer.invoke('init:project', opts),

  createProject: (opts: { slug: string; initialVersionId?: string }): Promise<{ projectDir: string; config: { slug: string; created_at: string; version: string; initial_version?: string } }> =>
    ipcRenderer.invoke('project:create', opts),

  installAt: (opts: { projectDir: string }): Promise<{ projectDir: string; config: { slug: string; created_at: string; version: string } }> =>
    ipcRenderer.invoke('project:installAt', opts),

  /** Check whether a projectDir is a valid productune project (dir + config.json present). */
  checkProjectExists: (projectDir: string): Promise<boolean> =>
    ipcRenderer.invoke('project:exists', { projectDir }),

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

  /** Approve a pending phase transition gate — writes po-state.json directly (T-P4-115). */
  approvePhase: (args: {
    projectDir: string
    fromPhase: number
    toPhase: number
    summary?: string
    userApprovedAt: string
  }): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('phase:approve', args),

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

  // ── Todo items (T-P4-113) ──────────────────────────────────────────────────
  /** Subscribe to todo items pushed by PO (parsed from manual_steps_pending / pending_user_actions). */
  poOnTodoItems: (cb: (items: Array<{
    id?: string
    description: string
    type?: 'check' | 'text-input' | 'link'
    href?: string
  }>) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, items: any[]) => cb(items)
    ipcRenderer.on('po:todo-items', listener)
    return () => ipcRenderer.removeListener('po:todo-items', listener)
  },

  /** Subscribe to PO-initiated todo dismiss events (receive channel only — T-P4-113). */
  poOnTodoDismiss: (cb: (ids: string[]) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, ids: string[]) => cb(ids)
    ipcRenderer.on('po:todo-dismiss', listener)
    return () => ipcRenderer.removeListener('po:todo-dismiss', listener)
  },

  // ── Ticket focus (T-P4-114 §B) ─────────────────────────────────────────────

  /** Subscribe to ticket focus events emitted when PO issues / dispatches tickets. */
  poOnTicketFocus: (cb: (payload: { ticketId: string; reason: 'emit' | 'dispatch' }) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: any) => cb(payload)
    ipcRenderer.on('po:ticket-focus', listener)
    return () => ipcRenderer.removeListener('po:ticket-focus', listener)
  },

  // ── Artifact auto-open (T-P4-114 §A) ────────────────────────────────────────

  /** Subscribe to artifact open events emitted when changed_files[] detected in PO envelope. */
  poOnArtifactOpen: (cb: (payload: { files: string[] }) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: any) => cb(payload)
    ipcRenderer.on('po:artifact-open', listener)
    return () => ipcRenderer.removeListener('po:artifact-open', listener)
  },

  // ── Browser tab IPC (T-P4-114 §D) ────────────────────────────────────────────

  /** Notify main process that a browser tab was opened (T-P4-115 IPC bridge stub). */
  browserOpened: (payload: { url: string; tabId: string }): void =>
    ipcRenderer.send('browser:opened', payload),

  /** Restart the PO session — kills active child + resets sessionId. Returns { ok: boolean }. */
  poRestartSession: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('po:restartSession'),

  /** Subscribe to session-restarted acknowledgement from main. Returns an unsubscribe fn. */
  poOnSessionRestarted: (cb: () => void) => {
    const listener = () => cb()
    ipcRenderer.on('po:sessionRestarted', listener)
    return () => ipcRenderer.removeListener('po:sessionRestarted', listener)
  },

  // ── MCP Servers (T-P4-048-mh) ────────────────────────────────────────────────
  mcpGetServers: (projectDir?: string): Promise<Array<{
    name: string
    config: {
      type?: 'stdio' | 'sse' | 'http'
      command?: string
      args?: string[]
      url?: string
      env?: Record<string, string>
    }
    source: 'global' | 'project'
  }>> =>
    ipcRenderer.invoke('mcp:getServers', projectDir),

  mcpSave: (
    serverName: string,
    config: {
      type?: 'stdio' | 'sse' | 'http'
      command?: string
      args?: string[]
      url?: string
      env?: Record<string, string>
    },
  ): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('mcp:save', serverName, config),

  mcpTestConnection: (
    serverName: string,
    config: {
      type?: 'stdio' | 'sse' | 'http'
      command?: string
      url?: string
      env?: Record<string, string>
    },
  ): Promise<{ ok: boolean; ms?: number; error?: string }> =>
    ipcRenderer.invoke('mcp:testConnection', serverName, config),

  // ── Hooks (T-P4-048-mh) ───────────────────────────────────────────────────────
  hooksList: (): Promise<Array<{
    eventType: string
    matcher: string | null
    commandBasename: string
    commandFull: string
  }>> =>
    ipcRenderer.invoke('hooks:list'),

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

  // ── Open Recent (T-P4-111) ────────────────────────────────────────────────────
  /** Subscribe to macOS Open Recent item clicks (main → renderer). Returns unsubscribe fn. */
  onOpenRecentProject: (cb: (dirPath: string) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, dirPath: string) => cb(dirPath)
    ipcRenderer.on('open-recent-project', listener)
    return () => ipcRenderer.removeListener('open-recent-project', listener)
  },

  /** Open a known directory path (no dialog) — mirrors openFolder result shape. */
  openKnownDir: (dir: string): Promise<
    | { kind: 'self'; dir: string; config: { slug: string; created_at?: string; [k: string]: any } }
    | { kind: 'self-legacy'; dir: string; hints: string[] }
    | { kind: 'descendant'; dir: string; descendants: Array<{ path: string; config: { slug: string; [k: string]: any } }> }
    | { kind: 'none'; dir: string }
    | null
  > => ipcRenderer.invoke('project:openKnownDir', dir),

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

  // ── Worktree IPC (T-P4-092) ──────────────────────────────────────────────────
  worktree: {
    /** Create a new worktree for a ticket. Returns WorktreeCreateResult. */
    create: (args: {
      projectDir: string
      ticketId: string
      slug: string
      type: 'feature' | 'fix'
    }): Promise<any> =>
      ipcRenderer.invoke('worktree:create', args),

    /** Stash base changes (git stash -u) then create worktree. */
    stashAndCreate: (args: {
      projectDir: string
      ticketId: string
      slug: string
      type: 'feature' | 'fix'
    }): Promise<any> =>
      ipcRenderer.invoke('worktree:stashAndCreate', args),

    /** Commit base changes (auto message) then create worktree. */
    commitAndCreate: (args: {
      projectDir: string
      ticketId: string
      slug: string
      type: 'feature' | 'fix'
      message?: string
    }): Promise<any> =>
      ipcRenderer.invoke('worktree:commitAndCreate', args),

    /** Subscribe to worktree:createResult push events (main → renderer). */
    onCreateResult: (cb: (payload: {
      result: any
      ticketId: string
      slug: string
      type: string
      projectDir: string
    }) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: any) => cb(payload)
      ipcRenderer.on('worktree:createResult', listener)
      return () => ipcRenderer.removeListener('worktree:createResult', listener)
    },
  },

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
