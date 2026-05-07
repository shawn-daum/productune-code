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
  listProjects: () => electron.ipcRenderer.invoke("projects:list"),
  githubCheckToken: () => electron.ipcRenderer.invoke("github:checkToken"),
  githubStartDeviceFlow: (clientId) => electron.ipcRenderer.invoke("github:startDeviceFlow", clientId),
  githubPollDeviceFlow: (opts) => electron.ipcRenderer.invoke("github:pollDeviceFlow", opts),
  githubCreateRepo: (opts) => electron.ipcRenderer.invoke("github:createRepo", opts),
  githubSetupRemote: (opts) => electron.ipcRenderer.invoke("github:setupRemote", opts),
  // ── Workspace state ─────────────────────────────────────────────────────────
  readPoState: (projectDir) => electron.ipcRenderer.invoke("state:readPoState", projectDir),
  // ── Design artifacts ────────────────────────────────────────────────────────
  designListArtifacts: (projectRoot) => electron.ipcRenderer.invoke("design:listArtifacts", projectRoot),
  designReadArtifact: (projectRoot, relPath) => electron.ipcRenderer.invoke("design:readArtifact", projectRoot, relPath),
  // ── Chat (single PO session per project) ────────────────────────────────────
  chatGetSession: (projectDir) => electron.ipcRenderer.invoke("chat:getSession", projectDir),
  chatAppendMessage: (projectDir, message) => electron.ipcRenderer.invoke("chat:appendMessage", projectDir, message),
  chatSetClaudeSessionId: (projectDir, sessionId) => electron.ipcRenderer.invoke("chat:setClaudeSessionId", projectDir, sessionId),
  chatClearSession: (projectDir) => electron.ipcRenderer.invoke("chat:clearSession", projectDir),
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
  }
});
