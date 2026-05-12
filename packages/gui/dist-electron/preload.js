"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("api", {
  ping: () => electron.ipcRenderer.invoke("ping"),
  // ── Shell ───────────────────────────────────────────────────────────────────
  openExternal: (url) => electron.ipcRenderer.invoke("shell:openExternal", url),
  // ── Onboarding ──────────────────────────────────────────────────────────────
  checkEnv: () => electron.ipcRenderer.invoke("onboarding:checkEnv"),
  detectHardware: () => electron.ipcRenderer.invoke("onboarding:detectHardware"),
  completeOnboarding: (opts) => electron.ipcRenderer.invoke("onboarding:complete", opts),
  installDocker: () => electron.ipcRenderer.invoke("onboarding:installDocker"),
  /** Subscribe to streamed log lines from installDocker. Returns an unsubscribe fn. */
  onDockerLog: (cb) => {
    const listener = (_e, line) => cb(line);
    electron.ipcRenderer.on("onboarding:installDocker:log", listener);
    return () => electron.ipcRenderer.removeListener("onboarding:installDocker:log", listener);
  },
  openDockerApp: () => electron.ipcRenderer.invoke("onboarding:openDockerApp"),
  checkClaude: () => electron.ipcRenderer.invoke("onboarding:checkClaude"),
  checkCodex: () => electron.ipcRenderer.invoke("onboarding:checkCodex"),
  claudeLogin: () => electron.ipcRenderer.invoke("onboarding:claudeLogin"),
  codexLogin: () => electron.ipcRenderer.invoke("onboarding:codexLogin"),
  initProject: (opts) => electron.ipcRenderer.invoke("init:project", opts),
  createProject: (opts) => electron.ipcRenderer.invoke("project:create", opts),
  installAt: (opts) => electron.ipcRenderer.invoke("project:installAt", opts),
  openFolder: () => electron.ipcRenderer.invoke("dialog:openFolder"),
  openFilePicker: () => electron.ipcRenderer.invoke("dialog:openFilePicker"),
  migrateLegacy: (opts) => electron.ipcRenderer.invoke("project:migrateLegacy", opts),
  listProjects: () => electron.ipcRenderer.invoke("projects:list"),
  githubCheckToken: () => electron.ipcRenderer.invoke("github:checkToken"),
  githubStartDeviceFlow: (clientId) => electron.ipcRenderer.invoke("github:startDeviceFlow", clientId),
  githubPollDeviceFlow: (opts) => electron.ipcRenderer.invoke("github:pollDeviceFlow", opts),
  githubCreateRepo: (opts) => electron.ipcRenderer.invoke("github:createRepo", opts),
  githubSetupRemote: (opts) => electron.ipcRenderer.invoke("github:setupRemote", opts),
  // ── Workspace state ─────────────────────────────────────────────────────────
  readPoState: (projectDir) => electron.ipcRenderer.invoke("state:readPoState", projectDir),
  // ── Pending promotions (T-P4-066) ────────────────────────────────────────────
  appendPendingPromotion: (projectDir, candidate) => electron.ipcRenderer.invoke("state:appendPendingPromotion", projectDir, candidate),
  listPendingPromotions: (projectDir) => electron.ipcRenderer.invoke("state:listPendingPromotions", projectDir),
  resolvePendingPromotion: (projectDir, id, status, finalTarget) => electron.ipcRenderer.invoke("state:resolvePendingPromotion", projectDir, id, status, finalTarget),
  autoDropStale: (projectDir) => electron.ipcRenderer.invoke("state:autoDropStale", projectDir),
  markSurfaced: (projectDir, id) => electron.ipcRenderer.invoke("state:markSurfaced", projectDir, id),
  listAllPromotions: (projectDir) => electron.ipcRenderer.invoke("state:listAllPromotions", projectDir),
  mechanicalWrite: (promotion, claudeSessionId) => electron.ipcRenderer.invoke("state:mechanicalWrite", promotion, claudeSessionId),
  // ── Ticket md scan (v2 sub-f — replaces poState.past_tickets) ───────────────
  scanTickets: (projectDir) => electron.ipcRenderer.invoke("tickets:scan", projectDir),
  /** Subscribe to ticket fs-watch change events (debounced 500ms). */
  onTicketsChanged: (cb) => {
    const listener = (_e, projectDir) => cb(projectDir);
    electron.ipcRenderer.on("tickets:changed", listener);
    return () => electron.ipcRenderer.removeListener("tickets:changed", listener);
  },
  // ── Design artifacts ────────────────────────────────────────────────────────
  designListArtifacts: (projectRoot) => electron.ipcRenderer.invoke("design:listArtifacts", projectRoot),
  designReadArtifact: (projectRoot, relPath) => electron.ipcRenderer.invoke("design:readArtifact", projectRoot, relPath),
  // ── Chat (single PO session per project) ────────────────────────────────────
  chatGetSession: (projectDir) => electron.ipcRenderer.invoke("chat:getSession", projectDir),
  chatAppendMessage: (projectDir, message) => electron.ipcRenderer.invoke("chat:appendMessage", projectDir, message),
  chatSetClaudeSessionId: (projectDir, sessionId) => electron.ipcRenderer.invoke("chat:setClaudeSessionId", projectDir, sessionId),
  chatClearSession: (projectDir) => electron.ipcRenderer.invoke("chat:clearSession", projectDir),
  // ── PO streaming (T-P4-041; v2 sub-c: persona param removed) ────────────────
  poSendMessage: (opts) => electron.ipcRenderer.invoke("po:sendMessage", opts),
  /** First event after `poSendMessage` — main allocates the assistant msgId. */
  poOnMsgId: (cb) => {
    const listener = (_e, msgId) => cb(msgId);
    electron.ipcRenderer.on("po:onMsgId", listener);
    return () => electron.ipcRenderer.removeListener("po:onMsgId", listener);
  },
  poOnToken: (cb) => {
    const listener = (_e, msgId, chunk) => cb(msgId, chunk);
    electron.ipcRenderer.on("po:onToken", listener);
    return () => electron.ipcRenderer.removeListener("po:onToken", listener);
  },
  poOnAnnounce: (cb) => {
    const listener = (_e, msgId, payload) => cb(msgId, payload);
    electron.ipcRenderer.on("po:onAnnounce", listener);
    return () => electron.ipcRenderer.removeListener("po:onAnnounce", listener);
  },
  poOnDone: (cb) => {
    const listener = (_e, msgId, info) => cb(msgId, info);
    electron.ipcRenderer.on("po:onDone", listener);
    return () => electron.ipcRenderer.removeListener("po:onDone", listener);
  },
  /** Subscribe to PO session health events (T-P4-059). Returns an unsubscribe fn. */
  poOnHealth: (cb) => {
    const listener = (_e, event) => cb(event);
    electron.ipcRenderer.on("po:onHealth", listener);
    return () => electron.ipcRenderer.removeListener("po:onHealth", listener);
  },
  /** Restart the PO session — kills active child + resets sessionId. Returns { ok: boolean }. */
  poRestartSession: () => electron.ipcRenderer.invoke("po:restartSession"),
  /** Subscribe to session-restarted acknowledgement from main. Returns an unsubscribe fn. */
  poOnSessionRestarted: (cb) => {
    const listener = () => cb();
    electron.ipcRenderer.on("po:sessionRestarted", listener);
    return () => electron.ipcRenderer.removeListener("po:sessionRestarted", listener);
  },
  // ── Settings ─────────────────────────────────────────────────────────────────
  getUiLanguage: () => electron.ipcRenderer.invoke("settings:getUiLanguage"),
  setUiLanguage: (lng) => electron.ipcRenderer.invoke("settings:setUiLanguage", lng),
  hasLanguagePref: () => electron.ipcRenderer.invoke("settings:hasLanguagePref"),
  getOsLocale: () => electron.ipcRenderer.invoke("settings:getOsLocale"),
  // ── Git workflow rules ───────────────────────────────────────────────────────
  loadRules: (projectDir) => electron.ipcRenderer.invoke("settings:loadRules", projectDir),
  saveRules: (projectDir, rules) => electron.ipcRenderer.invoke("settings:saveRules", projectDir, rules),
  // ── Menubar events (renderer subscribes; main process emits) ─────────────────
  onMenuNewProject: (cb) => {
    const listener = () => cb();
    electron.ipcRenderer.on("menu:new-project", listener);
    return () => electron.ipcRenderer.removeListener("menu:new-project", listener);
  },
  onMenuOpenProject: (cb) => {
    const listener = () => cb();
    electron.ipcRenderer.on("menu:open-project", listener);
    return () => electron.ipcRenderer.removeListener("menu:open-project", listener);
  },
  // ── Quick Open file listing (T-P4-047) ──────────────────────────────────────
  listProjectFiles: (projectDir) => electron.ipcRenderer.invoke("slash:listProjectFiles", projectDir),
  // ── Explorer (T-P4-045) ───────────────────────────────────────────────────────
  explorerListDir: (absPath) => electron.ipcRenderer.invoke("explorer:listDir", absPath),
  explorerWatch: (root) => electron.ipcRenderer.invoke("explorer:watch", root),
  explorerUnwatch: () => electron.ipcRenderer.invoke("explorer:unwatch"),
  explorerRevealInOS: (absPath) => electron.ipcRenderer.invoke("explorer:revealInOS", absPath),
  /** Subscribe to explorer fs-change events. Returns an unsubscribe fn. */
  explorerOnFsChanged: (cb) => {
    const listener = (_e, payload) => cb(payload);
    electron.ipcRenderer.on("explorer:fs-changed", listener);
    return () => electron.ipcRenderer.removeListener("explorer:fs-changed", listener);
  },
  // ── Vercel deploy event cross-ref (T-P4-023 sub-c) ──────────────────────────
  fetchDeployEvents: (args) => electron.ipcRenderer.invoke("deploy:fetch-events", args),
  // ── Deploy execute + conflict resolution (T-P4-022 3rd PR) ──────────────────
  deploy: {
    execute: (args) => electron.ipcRenderer.invoke("deploy:execute", args),
    resolveConflict: (args) => electron.ipcRenderer.invoke("deploy:resolve-conflict", args),
    onProgress: (cb) => {
      const listener = (_e, ev) => cb(ev);
      electron.ipcRenderer.on("deploy:progress", listener);
      return () => electron.ipcRenderer.removeListener("deploy:progress", listener);
    },
    onConflict: (cb) => {
      const listener = (_e, ev) => cb(ev);
      electron.ipcRenderer.on("deploy:conflict", listener);
      return () => electron.ipcRenderer.removeListener("deploy:conflict", listener);
    }
  }
});
