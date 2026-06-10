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

  completeOnboarding: (opts: {
    engine: 'claude' | 'codex' | 'both'
    uiLanguage?: 'en' | 'ko'
  }): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('onboarding:complete', opts),

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

  // T-PATCH-050: recents API — covers all open methods
  listRecents: (): Promise<Array<{ slug: string; projectDir: string; openedAt: string }>> =>
    ipcRenderer.invoke('recents:list'),

  addRecent: (opts: { projectDir: string; slug: string }): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('recents:add', opts),

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
  ): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('state:mechanicalWrite', promotion, claudeSessionId),

  // ── Ticket md scan (v2 sub-f — replaces poState.past_tickets) ───────────────
  scanTickets: (projectDir: string): Promise<import('../src/lib/types').Ticket[]> =>
    ipcRenderer.invoke('tickets:scan', projectDir),

  // ── Ticket detail read (T-016 · A7) ─────────────────────────────────────────
  /** Read a single ticket md by ticketId. Searches all version dirs under docs/tickets/. */
  ticketsRead: (
    projectDir: string,
    ticketId: string,
  ): Promise<{ frontmatter: Record<string, unknown>; body: string; krBody: string | null } | null> =>
    ipcRenderer.invoke('tickets:read', projectDir, ticketId),

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

  // T-013 (b) / T-PATCH-037 AskUserQuestion answer — sends the user's choice to
  // main, which patches payload.resolved in chat.json and RESUMES the PO turn
  // with `answerText` as the next input. `sessionId` is the renderer-held claude
  // session id (workspace store) so resume threads the same session (not a fresh
  // --agent turn). `answerText` is the chosen option's title.
  chatAnswerQuestion: (opts: {
    projectDir: string
    messageId: string
    chosenKey: string
    answerText: string
    sessionId?: string | null
  }): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('chat:answerQuestion', opts),

  // T-PATCH-073: X-dismiss — patches payload.resolved WITHOUT resuming PO turn.
  chatDismissQuestion: (opts: {
    projectDir: string
    messageId: string
  }): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('chat:dismissQuestion', opts),

  // T-013 (c) PromotionCard resolve — sends approve/reject to main process.
  // IPC handler stub: same follow-up scope as chatAnswerQuestion.
  chatResolvePromotion: (opts: {
    projectDir: string
    messageId: string
    outcome: 'approved' | 'rejected'
  }): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('chat:resolvePromotion', opts),

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
  // T-PATCH-039: the PO chat streaming channels are single-subscriber by design
  // (poEvents.register runs once at module load). Defensively clear any prior
  // listener on the channel before binding so that a re-register — HMR dispose
  // that fails to fully unbind, a StrictMode/module re-eval, or any double
  // subscription — can NEVER stack N listeners. A stacked listener was the
  // segmentation-duplication root cause: each extra po:onToken listener appended
  // the same full text chunk again to the active bubble (→ "...시점입니다.Phase 3…"
  // self-concatenation) and each extra po:onMsgId spawned another placeholder
  // bubble (→ several duplicate bubbles per turn). removeAllListeners guarantees
  // exactly one live subscriber per channel → text renders exactly once.
  poOnMsgId: (cb: (msgId: string) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, msgId: string) => cb(msgId)
    ipcRenderer.removeAllListeners('po:onMsgId')
    ipcRenderer.on('po:onMsgId', listener)
    return () => ipcRenderer.removeListener('po:onMsgId', listener)
  },

  poOnToken: (cb: (msgId: string, chunk: string) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, msgId: string, chunk: string) =>
      cb(msgId, chunk)
    ipcRenderer.removeAllListeners('po:onToken')
    ipcRenderer.on('po:onToken', listener)
    return () => ipcRenderer.removeListener('po:onToken', listener)
  },

  // ── AskUserQuestion card emit (T-PATCH-037) ────────────────────────────────
  /** Subscribe to PO AskUserQuestion emits. Returns an unsubscribe fn. */
  poOnAskUserQuestion: (
    cb: (
      msgId: string,
      payload: {
        question: string
        options: Array<{ key: string; title: string; description?: string }>
      },
    ) => void,
  ) => {
    const listener = (_e: Electron.IpcRendererEvent, msgId: string, payload: any) =>
      cb(msgId, payload)
    ipcRenderer.removeAllListeners('po:onAskUserQuestion')  // T-PATCH-039: single-subscriber
    ipcRenderer.on('po:onAskUserQuestion', listener)
    return () => ipcRenderer.removeListener('po:onAskUserQuestion', listener)
  },

  poOnAnnounce: (
    cb: (msgId: string, payload: { level: 'system' | 'tool' | 'error'; text: string }) => void,
  ) => {
    const listener = (
      _e: Electron.IpcRendererEvent,
      msgId: string,
      payload: { level: 'system' | 'tool' | 'error'; text: string },
    ) => cb(msgId, payload)
    ipcRenderer.removeAllListeners('po:onAnnounce')  // T-PATCH-039: single-subscriber
    ipcRenderer.on('po:onAnnounce', listener)
    return () => ipcRenderer.removeListener('po:onAnnounce', listener)
  },

  poOnDone: (cb: (msgId: string, info: { sessionId?: string }) => void) => {
    const listener = (
      _e: Electron.IpcRendererEvent,
      msgId: string,
      info: { sessionId?: string },
    ) => cb(msgId, info)
    ipcRenderer.removeAllListeners('po:onDone')  // T-PATCH-039: single-subscriber
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

  // ── QA loop IPC (T-P4-116) ────────────────────────────────────────────────────

  /** QA envelope browser_url 감지 시 emit — browser tab auto-open trigger. */
  onBrowserOpen: (cb: (payload: {
    url: string
    ticketId: string
    purpose: 'qa-smoke' | 'user-verify'
  }) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: any) => cb(payload)
    ipcRenderer.on('po:browser-open', listener)
    return () => ipcRenderer.removeListener('po:browser-open', listener)
  },

  /** QA pass + verify_url 감지 시 emit — user-verify flow trigger. */
  onUserVerify: (cb: (payload: {
    url?: string
    description: string
    ticketId: string
  }) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: any) => cb(payload)
    ipcRenderer.on('po:user-verify', listener)
    return () => ipcRenderer.removeListener('po:user-verify', listener)
  },

  /** QA loop 상태 갱신 — BackgroundTaskSegment attempt badge 갱신용. */
  onQaLoopUpdate: (cb: (payload: {
    ticketId: string
    attempt: number
    maxAttempts: number
    status: 'dev-running' | 'qa-running' | 'pass' | 'fail' | 'capped' | 'auth-required'
    lastFailReason?: string
  }) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: any) => cb(payload)
    ipcRenderer.on('po:qa-loop-update', listener)
    return () => ipcRenderer.removeListener('po:qa-loop-update', listener)
  },

  // ── OS notification click routing (T-019 §B3) ────────────────────────────────

  /**
   * Subscribe to notification-click navigation requests from main.
   * Fires when the user clicks a native OS notification; the renderer routes to
   * the relevant surface (ticket-review tab / phase-gate chip). Returns an
   * unsubscribe fn.
   */
  onNotificationNavigate: (cb: (route: {
    surface: 'ticket-review' | 'phase-gate'
    ticketId?: string
  }) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, route: any) => cb(route)
    ipcRenderer.on('notification:navigate', listener)
    return () => ipcRenderer.removeListener('notification:navigate', listener)
  },

  // ── Browser tab IPC (T-P4-114 §D) ────────────────────────────────────────────

  /** Notify main process that a browser tab was opened (T-P4-115 IPC bridge stub). */
  browserOpened: (payload: { url: string; tabId: string }): void =>
    ipcRenderer.send('browser:opened', payload),

  // ── Browser-tab find — MAIN PROCESS path (T-PATCH-067 R7) ────────────────────
  // The renderer <webview> DOM find API is broken on this build (found-in-page
  // never fires; active session blocks new queries). These route find ops to
  // main's webContents.findInPage, which is reliable. `webContentsId` comes from
  // BrowserTab via webview.getWebContentsId().

  /** Run a find on the <webview>'s webContents (main process). Returns the requestId. */
  browserFind: (args: {
    webContentsId: number
    text: string
    options?: { forward?: boolean; findNext?: boolean; matchCase?: boolean }
  }): Promise<{ ok: boolean; requestId?: number; error?: string }> =>
    ipcRenderer.invoke('browser:find', args),

  /** End the active find session on the <webview>'s webContents (clear highlight). */
  browserStopFind: (args: { webContentsId: number }): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('browser:stop-find', args),

  /** Subscribe to main-process found-in-page results. Returns an unsubscribe fn. */
  onBrowserFoundInPage: (
    cb: (payload: {
      webContentsId: number
      requestId: number
      activeMatchOrdinal: number
      matches: number
      finalUpdate: boolean
    }) => void,
  ) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: any) => cb(payload)
    ipcRenderer.on('browser:found-in-page', listener)
    return () => ipcRenderer.removeListener('browser:found-in-page', listener)
  },

  /** Abort the currently running PO turn (SIGTERM the claude child). Safe no-op when idle.
   *  T-PATCH-081: renderer stop button → IPC → abortActiveTurn() in po-runner.ts. */
  abortPoTurn: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('po:abort'),

  /** Restart the PO session — kills active child + resets sessionId. Returns { ok: boolean }.
   *  T-PATCH-040: optional projectDir re-snapshots the fresh-cycle turn window. */
  poRestartSession: (projectDir?: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('po:restartSession', projectDir),

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
    source: 'productune' | 'local' | 'project' | 'managed' | 'plugin'
    connected?: boolean
    editable: boolean
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
    projectDir?: string,
  ): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('mcp:save', serverName, config, projectDir),

  mcpRename: (
    oldName: string,
    newName: string,
    projectDir?: string,
  ): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('mcp:rename', oldName, newName, projectDir),

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

  // ── Skills (T-P4-118) ─────────────────────────────────────────────────────────
  listSkills: (): Promise<import('../src/lib/types').SkillEntry[]> =>
    ipcRenderer.invoke('skills:list'),

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

  // ── Notification toggles (T-PATCH-083) ───────────────────────────────────────
  getNotifications: (): Promise<import('@productune/core').NotificationSettings> =>
    ipcRenderer.invoke('settings:getNotifications'),

  setNotifications: (
    n: import('@productune/core').NotificationSettings,
  ): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('settings:setNotifications', n),

  hasLanguagePref: (): Promise<boolean> =>
    ipcRenderer.invoke('settings:hasLanguagePref'),

  getOsLocale: (): Promise<string> =>
    ipcRenderer.invoke('settings:getOsLocale'),

  // ── Git workflow rules ───────────────────────────────────────────────────────
  loadRules: (projectDir: string): Promise<import('@productune/core').GitRules> =>
    ipcRenderer.invoke('settings:loadRules', projectDir),

  saveRules: (projectDir: string, rules: import('@productune/core').GitRules): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('settings:saveRules', projectDir, rules),

  // ── Persona-spec read/write (v0.5 B1 / T-017) ────────────────────────────────
  readPersonaSpec: (personaId: string): Promise<{ ok: boolean; content?: string; exists?: boolean; error?: string }> =>
    ipcRenderer.invoke('persona:readSpec', personaId),

  writePersonaSpec: (personaId: string, content: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('persona:writeSpec', personaId, content),

  // ── Long-term memory read (v0.5 T-PATCH-009 #11) ─────────────────────────────
  readMemoryFile: (path: string): Promise<{ ok: boolean; content?: string; exists?: boolean; error?: string }> =>
    ipcRenderer.invoke('memory:readFile', path),

  // ── Doctrine tiers (T-PATCH-019, #7) ─────────────────────────────────────────
  // Backs the Persona Tier Editor. NOTE: `persona` here is the **dir name**
  // (`po` | `designer` | `developer` | `qa`) — the caller maps the runtime key
  // `dev` → `developer` before invoking. `projectDir` resolves the Tier-1 root
  // (`<projectDir>/docs/<persona>/`) and is also threaded through read/write so
  // Tier-1 paths pass the main-process whitelist.
  doctrineListTiers: (
    persona: string,
    projectDir: string,
  ): Promise<
    {
      tiers: Array<{
        tier: 0 | 1 | 2
        role: string
        root: string
        editable: boolean
        files: Array<{
          tier: 0 | 1 | 2
          persona: string
          role: string
          absPath: string
          relName: string
          editable: boolean
          exists: boolean
          mtimeMs: number | null
          sizeBytes: number | null
        }>
      }>
    } & { ok: boolean; error?: string }
  > => ipcRenderer.invoke('doctrine:listTiers', persona, projectDir),

  doctrineReadFile: (
    absPath: string,
    projectDir?: string,
  ): Promise<{ ok: boolean; content?: string; exists?: boolean; mtimeMs?: number | null; error?: string }> =>
    ipcRenderer.invoke('doctrine:readFile', absPath, projectDir),

  doctrineWriteFile: (
    absPath: string,
    content: string,
    expectedMtimeMs?: number | null,
    projectDir?: string,
  ): Promise<{ ok: boolean; mtimeMs?: number; conflict?: boolean; currentMtimeMs?: number; error?: string }> =>
    ipcRenderer.invoke('doctrine:writeFile', absPath, content, expectedMtimeMs, projectDir),

  // ── Local .html read/write (T-PATCH-032) ─────────────────────────────────────
  // Backs HtmlViewer for project-scoped .html / .htm files. Both are guarded in
  // the main process (containment + extension whitelist; write adds an mtime
  // conflict guard + atomic temp-file write). Mirrors the doctrine read/write
  // exposure shape so the viewer's save/conflict flow reuses the house pattern.
  htmlReadFile: (
    projectDir: string,
    absPath: string,
  ): Promise<{ ok: boolean; content?: string; exists?: boolean; mtimeMs?: number | null; error?: string }> =>
    ipcRenderer.invoke('html:readFile', projectDir, absPath),

  htmlWriteFile: (
    projectDir: string,
    absPath: string,
    content: string,
    expectedMtimeMs?: number | null,
  ): Promise<{ ok: boolean; mtimeMs?: number; conflict?: boolean; currentMtimeMs?: number; error?: string }> =>
    ipcRenderer.invoke('html:writeFile', projectDir, absPath, content, expectedMtimeMs),

  // ── Menubar events (renderer subscribes; main process emits) ─────────────────
  // T-PATCH-046: find bar trigger from Electron menu bar (CmdOrCtrl+F)
  onMenuFind: (cb: () => void) => {
    const listener = () => cb()
    ipcRenderer.on('menu:find', listener)
    return () => ipcRenderer.removeListener('menu:find', listener)
  },

  // T-PATCH-066: tab navigation — menu accelerator IPC bridge (R4).
  // before-input-event removed (didn't reach OOPIF); menu accelerators do.
  onMenuNewTab: (cb: () => void) => {
    const listener = () => cb()
    ipcRenderer.on('menu:new-tab', listener)
    return () => ipcRenderer.removeListener('menu:new-tab', listener)
  },
  onMenuCloseTab: (cb: () => void) => {
    const listener = () => cb()
    ipcRenderer.on('menu:close-tab', listener)
    return () => ipcRenderer.removeListener('menu:close-tab', listener)
  },
  onMenuSplitRight: (cb: () => void) => {
    const listener = () => cb()
    ipcRenderer.on('menu:split-right', listener)
    return () => ipcRenderer.removeListener('menu:split-right', listener)
  },
  onMenuQuickOpen: (cb: () => void) => {
    const listener = () => cb()
    ipcRenderer.on('menu:quick-open', listener)
    return () => ipcRenderer.removeListener('menu:quick-open', listener)
  },
  onMenuGotoTab: (cb: (index: number) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, data: { index: number }) => cb(data?.index ?? 1)
    ipcRenderer.on('menu:goto-tab', listener)
    return () => ipcRenderer.removeListener('menu:goto-tab', listener)
  },

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

  // (T-009 flow-b) New Window → HomeView reset
  onResetToHome: (cb: () => void) => {
    const listener = () => cb()
    ipcRenderer.on('reset-to-home', listener)
    return () => ipcRenderer.removeListener('reset-to-home', listener)
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

  // ── Usage bar (T-025) ─────────────────────────────────────────────────────────
  /**
   * Subscribe to near-live Claude usage updates derived from the statusLine hook.
   * Payload contains optional `five_hour` and `seven_day` axes; either may be
   * absent when the subscriber plan doesn't expose that limit.
   * Only fires for claude.ai / firstParty subscribers. Returns an unsubscribe fn.
   */
  onUsageUpdate: (cb: (payload: {
    five_hour?: { used_percentage: number; resets_at?: string | number }
    seven_day?: { used_percentage: number; resets_at?: string | number }
  }) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: any) => cb(payload)
    ipcRenderer.on('productune:usage-update', listener)
    return () => ipcRenderer.removeListener('productune:usage-update', listener)
  },

  // ── Artifacts viewer (T-014) ─────────────────────────────────────────────────

  /** List scoped artifact files under the three fixed roots. */
  artifactsListScoped: (
    projectDir: string,
    currentVersion: string | null,
  ): Promise<Array<{
    relPath: string
    absPath: string
    ext: string
    scopeGroup: 'prd' | 'artifacts' | 'designer'
  }>> =>
    ipcRenderer.invoke('artifacts:listScoped', projectDir, currentVersion),

  /** Read artifact file content as UTF-8 string.
   *  projectDir is required for the path-traversal guard on the main-process side. */
  artifactsReadFile: (projectDir: string, absPath: string): Promise<string> =>
    ipcRenderer.invoke('artifacts:readFile', projectDir, absPath),

  // ── Explorer content search (T-024) ──────────────────────────────────────────

  /** Full-text content search across project files (fixed ignore rules, perf-capped). */
  searchContent: (req: {
    projectDir: string
    scopeDir?: string | null
    query: string
    options: { caseSensitive: boolean; wholeWord: boolean; regex: boolean }
  }): Promise<{
    groups: Array<{
      absPath: string
      relPath: string
      name: string
      dir: string
      matches: Array<{ line: number; text: string; ranges: Array<{ start: number; end: number }> }>
    }>
    totalMatches: number
    fileCount: number
    truncated: boolean
    error?: string
  }> =>
    ipcRenderer.invoke('search:content', req),

  /** Read a text file split into lines (for open-at-line in a search result tab). */
  searchReadFileLines: (
    projectDir: string,
    absPath: string,
  ): Promise<{ ok: boolean; lines?: string[]; error?: string; truncated?: boolean }> =>
    ipcRenderer.invoke('search:readFileLines', projectDir, absPath),

  // ── Project .env* viewer/editor (T-PATCH-076 rev) ────────────────────────────
  // Enumerates ALL .env* files in projectDir. Values are NEVER logged.

  /** Read all .env* files in projectDir. Returns file groups (filename+entries+raw). */
  projectEnvRead: (
    projectDir: string,
  ): Promise<{
    files: Array<{ filename: string; entries: Array<{ key: string; value: string }>; raw: string }>
  }> =>
    ipcRenderer.invoke('projectEnv:read', projectDir),

  /** Write a named .env* file in projectDir at mode 0600. filename must match /^\.env[a-zA-Z0-9._-]*$/. */
  projectEnvWrite: (
    projectDir: string,
    filename: string,
    entries: Array<{ key: string; value: string }>,
    originalRaw: string,
  ): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('projectEnv:write', projectDir, filename, entries, originalRaw),

  // ── Quit guard IPC (T-PATCH-086) ────────────────────────────────────────────
  /** Subscribe to quit-pending: first ⌘Q pressed — show overlay with progress bar. */
  onQuitPending: (cb: (data: { timeoutMs: number }) => void) =>
    ipcRenderer.on('quit:pending', (_e: Electron.IpcRendererEvent, data: { timeoutMs: number }) => cb(data)),

  /** Subscribe to quit-cancelled: guard window expired — hide overlay. */
  onQuitCancelled: (cb: () => void) =>
    ipcRenderer.on('quit:cancelled', (_e: Electron.IpcRendererEvent) => cb()),
})
