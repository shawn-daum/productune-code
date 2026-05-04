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
  openFolder: () => electron.ipcRenderer.invoke("dialog:openFolder"),
  listProjects: () => electron.ipcRenderer.invoke("projects:list"),
  githubCheckToken: () => electron.ipcRenderer.invoke("github:checkToken"),
  githubStartDeviceFlow: (clientId) => electron.ipcRenderer.invoke("github:startDeviceFlow", clientId),
  githubPollDeviceFlow: (opts) => electron.ipcRenderer.invoke("github:pollDeviceFlow", opts),
  githubCreateRepo: (opts) => electron.ipcRenderer.invoke("github:createRepo", opts),
  githubSetupRemote: (opts) => electron.ipcRenderer.invoke("github:setupRemote", opts)
});
