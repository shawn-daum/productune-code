"use strict";
const electron = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const child_process = require("child_process");
const util = require("util");
const FOREIGN_USER_RE = /^[A-Za-z]+\(\/{1,2}Users\/([^/)]+)\//;
function defaultClaudeSettings(projectDir) {
  return {
    permissions: {
      allow: [
        `Read(${projectDir}/**)`,
        `Write(${projectDir}/**)`,
        `Edit(${projectDir}/**)`,
        "Bash(npm *)",
        "Bash(pnpm *)",
        "Bash(git *)",
        "Bash(node *)",
        "Bash(python3 *)",
        "Bash(jq *)",
        "Bash(claude *)",
        "Bash(codex *)"
      ]
    }
  };
}
function bootstrapClaudeSettings(projectDir) {
  var _a;
  const claudeDir = path.join(projectDir, ".claude");
  const settingsPath = path.join(claudeDir, "settings.local.json");
  const currentUser = process.env["USER"] ?? os.userInfo().username;
  fs.mkdirSync(claudeDir, { recursive: true });
  if (fs.existsSync(settingsPath)) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    } catch {
      parsed = null;
    }
    let hasForeign = false;
    if (parsed) {
      const allow = ((_a = parsed == null ? void 0 : parsed.permissions) == null ? void 0 : _a.allow) ?? [];
      for (const entry of allow) {
        if (typeof entry !== "string")
          continue;
        const m = FOREIGN_USER_RE.exec(entry);
        if (m && m[1] !== currentUser) {
          hasForeign = true;
          break;
        }
      }
      if (!hasForeign) {
        ensureGitignoreEntry(projectDir);
        return;
      }
    }
    const ts = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(claudeDir, `settings.local.json.legacy-${ts}.json`);
    fs.copyFileSync(settingsPath, backupPath);
    fs.writeFileSync(settingsPath, JSON.stringify(defaultClaudeSettings(projectDir), null, 2));
  } else {
    fs.writeFileSync(settingsPath, JSON.stringify(defaultClaudeSettings(projectDir), null, 2));
  }
  ensureGitignoreEntry(projectDir);
}
function ensureGitignoreEntry(projectDir) {
  const gitignorePath = path.join(projectDir, ".gitignore");
  const entry = ".claude/settings.local.json";
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, `${entry}
`);
    return;
  }
  const content = fs.readFileSync(gitignorePath, "utf-8");
  const lines = content.split("\n");
  if (lines.some((l) => l.trim() === entry))
    return;
  const newContent = content.endsWith("\n") ? `${content}${entry}
` : `${content}
${entry}
`;
  fs.writeFileSync(gitignorePath, newContent);
}
const PERSONA_MEMORY_DIRS = [
  {
    dir: "docs/designer",
    readme: "# pdt-designer project memory\n\n`decisions.md` — non-trivial design decisions, one dated line each (PO appends on user approval).\nRound-scoped work-notes (`R<n>-<slug>.md`) — richer per-task artifacts (PO writes on user approval).\n"
  },
  {
    dir: "docs/developer",
    readme: "# pdt-developer project memory\n\n`project-notes.md` — non-obvious project facts (build/test/quirks), one dated line each (PO appends on user approval).\nRound-scoped work-notes (`R<n>-<slug>.md`) — richer per-task artifacts (PO writes on user approval).\n"
  },
  {
    dir: "docs/qa",
    readme: "# pdt-qa project memory\n\n`project-notes.md` — flakes, missing cmds, env quirks, one dated line each (PO appends on user approval).\nRound-scoped work-notes (`R<n>-<slug>.md`) — richer per-task artifacts (PO writes on user approval).\n"
  }
];
function ensureFile(filePath, contents) {
  if (fs.existsSync(filePath))
    return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}
function bootstrapPersonaMemory(projectDir) {
  for (const { dir, readme } of PERSONA_MEMORY_DIRS) {
    const abs = path.join(projectDir, dir);
    fs.mkdirSync(abs, { recursive: true });
    ensureFile(path.join(abs, "README.md"), readme);
  }
  ensureFile(path.join(projectDir, "docs/qa/fail-patterns.md"), "# QA fail patterns\n\nPer-Version log of QA fail loops. Read by Designer at Phase 1 PRD authoring\n(Test ticket trigger #3: same area-tag ≥3 累累 fail → emit `stage:test` ticket).\n\n## Schema\n\n- (YYYY-MM-DD) <version> · <ticket-id> · <area-tag> · loops=<N> · final=<resolved|blocked|abandoned> · note: <one-line>\n\narea-tag = `<feature>/<sub-area>` (e.g. `auth/login-modal`).\nAppended by PO mechanically from QA's `fail_event` output. No manual edits.\n\n## Entries\n\n");
  ensureFile(path.join(projectDir, "docs/designer/feature-history.md"), "# Feature history\n\nPer-Version log of feature decisions / scope choices / deferrals.\nRead at Phase 1 PRD authoring; appended by Designer at Phase 4 Version close.\n\n## Schema\n\n- (YYYY-MM-DD) <version> · <area-tag> · <decision-type> · note: <one-line>\n\ndecision-type ∈ `shipped | deferred | dropped | scope-change`.\narea-tag = `<feature>/<sub-area>` (matches QA convention).\n\n## Entries\n\n");
  const turnsDir = path.join(projectDir, ".productune", "turns");
  fs.mkdirSync(turnsDir, { recursive: true });
  ensureFile(path.join(turnsDir, "README.md"), "# turn activity log\n\nPer-task JSONL files (`<task-slug>.jsonl`). One line per persona invocation:\n`{ ts, persona, task_slug, ticket_id, version, turn_index, input_meta, wiki_consult, output_full, promotion_outcome }`.\nWritten by PO. Raw truth; `.productune/po-state.json` is the summary.\n");
}
function initProject(opts) {
  const dotDir = path.join(opts.projectDir, ".productune");
  const configPath = path.join(dotDir, "config.json");
  if (!fs.existsSync(dotDir)) {
    fs.mkdirSync(dotDir, { recursive: true });
  }
  let existing = {};
  if (fs.existsSync(configPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } catch {
    }
  }
  const config = {
    slug: existing.slug ?? opts.slug,
    created_at: existing.created_at ?? (/* @__PURE__ */ new Date()).toISOString(),
    version: "0.4.0"
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  bootstrapPersonaMemory(opts.projectDir);
  bootstrapClaudeSettings(opts.projectDir);
  return config;
}
const CREDENTIALS_PATH = path.join(os.homedir(), ".productune", "credentials.json");
const GH_API = "https://api.github.com";
async function startDeviceFlow(clientId) {
  const res = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: { "Accept": "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, scope: "repo" })
  });
  if (!res.ok)
    throw new Error(`device/code failed: ${res.status}`);
  return res.json();
}
async function pollDeviceFlow(clientId, deviceCode, intervalSec, timeoutSec = 300) {
  const deadline = Date.now() + timeoutSec * 1e3;
  while (Date.now() < deadline) {
    await sleep(intervalSec * 1e3);
    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code"
      })
    });
    const data = await res.json();
    if (data.error === "authorization_pending")
      continue;
    if (data.error === "slow_down") {
      intervalSec += 5;
      continue;
    }
    if (data.error)
      throw new Error(data.error_description ?? data.error);
    if (data.access_token) {
      saveCredentials(data);
      return data;
    }
  }
  throw new Error("OAuth timed out");
}
function loadCredentials() {
  if (!fs.existsSync(CREDENTIALS_PATH))
    return null;
  try {
    return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
  } catch {
    return null;
  }
}
function saveCredentials(creds) {
  const dir = path.dirname(CREDENTIALS_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds, null, 2), { mode: 384 });
}
async function createPrivateRepo(token, name) {
  const res = await fetch(`${GH_API}/user/repos`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: JSON.stringify({ name, private: true, auto_init: true })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message ?? `createRepo failed: ${res.status}`);
  }
  return res.json();
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
const SETTINGS_PATH = path.join(os.homedir(), ".productune", "settings.json");
const DEFAULT_SETTINGS = {
  version: 1,
  ui: { language: "en" }
};
function loadSettings() {
  var _a;
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      version: 1,
      ui: {
        language: ((_a = parsed == null ? void 0 : parsed.ui) == null ? void 0 : _a.language) === "ko" ? "ko" : "en"
      }
    };
  } catch {
    return { ...DEFAULT_SETTINGS, ui: { ...DEFAULT_SETTINGS.ui } };
  }
}
function saveSettings(settings) {
  const dir = path.dirname(SETTINGS_PATH);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = SETTINGS_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), { mode: 384 });
  fs.renameSync(tmp, SETTINGS_PATH);
}
function getUiLanguage() {
  return loadSettings().ui.language;
}
function setUiLanguage(lng) {
  const current = loadSettings();
  current.ui.language = lng;
  saveSettings(current);
}
function settingsFileExists() {
  var _a;
  try {
    const s = loadSettings();
    const raw = fs.readFileSync(SETTINGS_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return typeof ((_a = parsed == null ? void 0 : parsed.ui) == null ? void 0 : _a.language) === "string";
  } catch {
    return false;
  }
}
const DEFAULT_RULES = {
  useDevBranch: false,
  useStagingEnv: false,
  featureBranchPrefix: "feature",
  fixBranchPrefix: "fix"
};
const GLOBAL_DEFAULT_PATH = path.join(os.homedir(), ".productune", "git-rules.default.json");
const cache = /* @__PURE__ */ new Map();
function projectRulesPath(projectDir) {
  return path.join(projectDir, ".productune", "git-rules.json");
}
function loadRules(projectDir) {
  const cached = cache.get(projectDir);
  if (cached)
    return cached;
  const projectPath = projectRulesPath(projectDir);
  if (fs.existsSync(projectPath)) {
    try {
      const raw = fs.readFileSync(projectPath, "utf-8");
      const parsed = JSON.parse(raw);
      const rules = mergeWithDefaults(parsed);
      cache.set(projectDir, rules);
      return rules;
    } catch {
    }
  }
  const global = getDefault();
  cache.set(projectDir, global);
  return global;
}
function saveRules(projectDir, rules) {
  const rulesPath = projectRulesPath(projectDir);
  const dir = path.dirname(rulesPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = rulesPath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(rules, null, 2), { mode: 420 });
  fs.renameSync(tmp, rulesPath);
  cache.delete(projectDir);
}
function getDefault() {
  if (fs.existsSync(GLOBAL_DEFAULT_PATH)) {
    try {
      const raw = fs.readFileSync(GLOBAL_DEFAULT_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      return mergeWithDefaults(parsed);
    } catch {
    }
  }
  const dir = path.dirname(GLOBAL_DEFAULT_PATH);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = GLOBAL_DEFAULT_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(DEFAULT_RULES, null, 2), { mode: 420 });
  fs.renameSync(tmp, GLOBAL_DEFAULT_PATH);
  return { ...DEFAULT_RULES };
}
function mergeWithDefaults(parsed) {
  return {
    useDevBranch: typeof parsed.useDevBranch === "boolean" ? parsed.useDevBranch : DEFAULT_RULES.useDevBranch,
    useStagingEnv: typeof parsed.useStagingEnv === "boolean" ? parsed.useStagingEnv : DEFAULT_RULES.useStagingEnv,
    featureBranchPrefix: typeof parsed.featureBranchPrefix === "string" && parsed.featureBranchPrefix.trim() ? parsed.featureBranchPrefix.trim() : DEFAULT_RULES.featureBranchPrefix,
    fixBranchPrefix: typeof parsed.fixBranchPrefix === "string" && parsed.fixBranchPrefix.trim() ? parsed.fixBranchPrefix.trim() : DEFAULT_RULES.fixBranchPrefix
  };
}
function chatJsonPath(projectDir) {
  return path.join(projectDir, ".productune", "chat.json");
}
function atomicWrite(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.writeFileSync(tmp, data, "utf-8");
  fs.renameSync(tmp, filePath);
}
function getSession(projectDir) {
  const p = chatJsonPath(projectDir);
  if (!fs.existsSync(p)) {
    return { messages: [], updated_at: (/* @__PURE__ */ new Date()).toISOString() };
  }
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return { messages: [], updated_at: (/* @__PURE__ */ new Date()).toISOString() };
  }
}
function appendMessage(projectDir, message) {
  const session = getSession(projectDir);
  const next = {
    ...session,
    messages: [...session.messages, message],
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  atomicWrite(chatJsonPath(projectDir), JSON.stringify(next, null, 2));
}
function setClaudeSessionId(projectDir, sessionId) {
  const session = getSession(projectDir);
  const next = {
    ...session,
    claude_session_id: sessionId,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  atomicWrite(chatJsonPath(projectDir), JSON.stringify(next, null, 2));
}
function clearSession(projectDir) {
  const empty = { messages: [], updated_at: (/* @__PURE__ */ new Date()).toISOString() };
  atomicWrite(chatJsonPath(projectDir), JSON.stringify(empty, null, 2));
}
async function runPoTurn(opts, cb) {
  const msgId = newMsgId();
  cb.onMsgId(msgId);
  if (canSpawnClaude()) {
    return spawnClaude(opts, msgId, cb);
  }
  return echoFallback(opts, msgId, cb);
}
function canSpawnClaude() {
  const envPath = path.join(os.homedir(), ".productune", "productune.env");
  if (!fs.existsSync(envPath)) return false;
  if (process.platform === "win32") return false;
  const paths = (process.env.PATH ?? "").split(":");
  for (const p of paths) {
    try {
      if (fs.existsSync(path.join(p, "claude"))) return true;
    } catch {
    }
  }
  return false;
}
function spawnClaude(opts, msgId, cb) {
  return new Promise((resolve) => {
    var _a, _b;
    const persona = opts.persona ?? "pdt-po";
    const args = [];
    if (opts.resume) {
      args.push("--resume", opts.resume);
    } else {
      args.push("--agent", persona);
    }
    args.push("--print", "--output-format", "stream-json", "--verbose", opts.text);
    const env = { ...process.env, NO_COLOR: "1" };
    const child = child_process.spawn("claude", args, {
      env,
      cwd: opts.projectDir,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdoutBuf = "";
    let stderrBuf = "";
    (_a = child.stdout) == null ? void 0 : _a.on("data", (chunk) => {
      stdoutBuf += chunk.toString("utf8");
      let nlIdx;
      while ((nlIdx = stdoutBuf.indexOf("\n")) >= 0) {
        const line = stdoutBuf.slice(0, nlIdx).trim();
        stdoutBuf = stdoutBuf.slice(nlIdx + 1);
        if (line) handleStreamJsonLine(line, msgId, cb);
      }
    });
    (_b = child.stderr) == null ? void 0 : _b.on("data", (chunk) => {
      stderrBuf += chunk.toString("utf8");
      let nlIdx;
      while ((nlIdx = stderrBuf.indexOf("\n")) >= 0) {
        const line = stderrBuf.slice(0, nlIdx).trim();
        stderrBuf = stderrBuf.slice(nlIdx + 1);
        if (line) cb.onAnnounce(msgId, { level: "error", text: line });
      }
    });
    child.on("error", (err) => {
      cb.onAnnounce(msgId, { level: "error", text: `spawn failed: ${err.message}` });
      cb.onDone(msgId, {});
      resolve();
    });
    child.on("close", (code) => {
      if (stdoutBuf.trim()) handleStreamJsonLine(stdoutBuf.trim(), msgId, cb);
      if (stderrBuf.trim()) {
        cb.onAnnounce(msgId, { level: "error", text: stderrBuf.trim() });
      }
      if (code !== 0 && code !== null) {
        cb.onAnnounce(msgId, { level: "error", text: `claude exited with code ${code}` });
      }
      cb.onDone(msgId, { sessionId: capturedSessionId });
      capturedSessionId = void 0;
      resolve();
    });
  });
}
let capturedSessionId;
function handleStreamJsonLine(line, msgId, cb) {
  var _a;
  let obj;
  try {
    obj = JSON.parse(line);
  } catch {
    cb.onAnnounce(msgId, { level: "system", text: line });
    return;
  }
  const type = obj == null ? void 0 : obj.type;
  if (!type) return;
  if (type === "system") {
    if ((obj == null ? void 0 : obj.subtype) === "init" && typeof (obj == null ? void 0 : obj.session_id) === "string") {
      capturedSessionId = obj.session_id;
    }
    return;
  }
  if (type === "assistant") {
    const content = (_a = obj == null ? void 0 : obj.message) == null ? void 0 : _a.content;
    if (!Array.isArray(content)) return;
    for (const part of content) {
      if ((part == null ? void 0 : part.type) === "text" && typeof (part == null ? void 0 : part.text) === "string") {
        cb.onToken(msgId, part.text);
      } else if ((part == null ? void 0 : part.type) === "tool_use" && typeof (part == null ? void 0 : part.name) === "string") {
        cb.onAnnounce(msgId, { level: "tool", text: `→ tool: ${part.name}` });
      }
    }
    return;
  }
  if (type === "result") {
    if (typeof (obj == null ? void 0 : obj.session_id) === "string") {
      capturedSessionId = obj.session_id;
    }
    return;
  }
}
function echoFallback(opts, msgId, cb) {
  return new Promise((resolve) => {
    cb.onAnnounce(msgId, {
      level: "system",
      text: "(echo mode — claude CLI not detected)"
    });
    const echo = `Echo: ${opts.text}`;
    const chunks = chunkString(echo, 8);
    let i = 0;
    const tick = () => {
      if (i >= chunks.length) {
        cb.onDone(msgId, {});
        resolve();
        return;
      }
      cb.onToken(msgId, chunks[i++]);
      setTimeout(tick, 40);
    };
    setTimeout(tick, 100);
  });
}
function chunkString(s, size) {
  const out = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out;
}
function newMsgId() {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function emitToWebContents(wc) {
  return {
    onMsgId: (msgId) => wc.send("po:onMsgId", msgId),
    onToken: (msgId, chunk) => wc.send("po:onToken", msgId, chunk),
    onAnnounce: (msgId, payload) => wc.send("po:onAnnounce", msgId, payload),
    onDone: (msgId, info) => wc.send("po:onDone", msgId, info)
  };
}
const execFileAsync = util.promisify(child_process.execFile);
electron.ipcMain.handle("shell:openExternal", (_event, url) => {
  return electron.shell.openExternal(url);
});
function spawnStreaming(cmd, args, env, onLine) {
  return new Promise((resolve, reject) => {
    var _a, _b;
    const child = child_process.spawn(cmd, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    const pipe = (data) => {
      for (const line of data.toString("utf8").split("\n")) {
        const trimmed = line.trimEnd();
        if (trimmed) onLine(trimmed);
      }
    };
    (_a = child.stdout) == null ? void 0 : _a.on("data", pipe);
    (_b = child.stderr) == null ? void 0 : _b.on("data", pipe);
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`프로세스 종료 코드: ${code}`));
    });
  });
}
electron.ipcMain.handle("onboarding:installDocker", async (event) => {
  const send = (line) => event.sender.send("onboarding:installDocker:log", line);
  const brewCandidates = [
    "/opt/homebrew/bin/brew",
    "/usr/local/bin/brew",
    "brew"
  ];
  const findBrew = () => brewCandidates.find((b) => {
    try {
      return b === "brew" || fs.existsSync(b);
    } catch {
      return false;
    }
  }) ?? "brew";
  const baseEnv = {
    ...process.env,
    NONINTERACTIVE: "1",
    CI: "1",
    // Ensure Homebrew paths are available in the spawned shell
    PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ""}`
  };
  try {
    send("Homebrew 확인 중...");
    let brewOk = false;
    try {
      await execFileAsync(findBrew(), ["--version"]);
      brewOk = true;
      send(`OK · Homebrew 감지됨`);
    } catch {
    }
    if (!brewOk) {
      send("Homebrew 설치 중... (몇 분 소요)");
      const installScript = "curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh | bash";
      await spawnStreaming("/bin/bash", ["-c", installScript], baseEnv, send);
      send("OK · Homebrew 설치 완료");
    }
    send("Docker Desktop 설치 중... (몇 분 소요)");
    const brew = findBrew();
    await spawnStreaming(brew, ["install", "--cask", "docker"], baseEnv, send);
    send("OK · 설치 완료 — Docker Desktop을 실행해주세요");
    return { ok: true };
  } catch (e) {
    const msg = (e == null ? void 0 : e.message) ?? "알 수 없는 오류";
    send(`ERR · 오류: ${msg}`);
    return { ok: false, error: msg };
  }
});
electron.ipcMain.handle("onboarding:openDockerApp", async () => {
  try {
    await execFileAsync("open", ["-a", "Docker"]);
  } catch {
    try {
      await execFileAsync("open", ["/Applications/Docker.app"]);
    } catch {
    }
  }
});
electron.ipcMain.handle("onboarding:checkClaude", async () => {
  let installed = false;
  try {
    await execFileAsync("which", ["claude"]);
    installed = true;
  } catch {
    return { installed: false, authed: false };
  }
  const credPath = path.join(os.homedir(), ".claude", "credentials.json");
  if (fs.existsSync(credPath)) return { installed: true, authed: true };
  try {
    const out = await execFileAsync("claude", ["auth", "status"], { timeout: 5e3 });
    const stdout = typeof out === "string" ? out : (out == null ? void 0 : out.stdout) ?? "";
    const data = JSON.parse(stdout);
    return { installed: true, authed: (data == null ? void 0 : data.loggedIn) === true };
  } catch {
    return { installed: true, authed: false };
  }
});
electron.ipcMain.handle("onboarding:checkCodex", async () => {
  let installed = false;
  try {
    await execFileAsync("which", ["codex"]);
    installed = true;
  } catch {
    return { installed: false, authed: false };
  }
  const authPath = path.join(os.homedir(), ".codex", "auth.json");
  return { installed: true, authed: fs.existsSync(authPath) };
});
async function openTerminalWith(cmd) {
  await execFileAsync("osascript", [
    "-e",
    'tell application "Terminal" to activate',
    "-e",
    `tell application "Terminal" to do script "${cmd.replace(/"/g, '\\"')}"`
  ]);
}
electron.ipcMain.handle("onboarding:claudeLogin", async () => {
  try {
    await openTerminalWith("claude auth login");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e == null ? void 0 : e.message };
  }
});
electron.ipcMain.handle("onboarding:codexLogin", async () => {
  try {
    await openTerminalWith("codex login");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e == null ? void 0 : e.message };
  }
});
electron.ipcMain.handle("onboarding:checkEnv", () => {
  const envPath = path.join(os.homedir(), ".productune", "productune.env");
  return fs.existsSync(envPath);
});
electron.ipcMain.handle("onboarding:detectHardware", async () => {
  const ram_gb = Math.floor(os.totalmem() / (1024 * 1024 * 1024));
  const apple_silicon = process.platform === "darwin" && process.arch === "arm64";
  let docker = false;
  try {
    await new Promise((resolve, reject) => {
      const child = child_process.execFile("docker", ["info"], { timeout: 2e3 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
      child.on("error", reject);
    });
    docker = true;
  } catch {
  }
  let tier;
  if (!docker) {
    tier = "B";
  } else if (apple_silicon && ram_gb >= 16) {
    tier = "S";
  } else if (apple_silicon && ram_gb >= 8) {
    tier = "A";
  } else if (ram_gb >= 32) {
    tier = "S";
  } else if (ram_gb >= 16) {
    tier = "A";
  } else {
    tier = "B";
  }
  return { tier, ram_gb, apple_silicon, docker };
});
electron.ipcMain.handle("onboarding:complete", async (_event, opts) => {
  try {
    const home = os.homedir();
    const productuneDir = path.join(home, ".productune");
    const claudeAgentsDir = path.join(home, ".claude", "agents");
    const coreDir = path.join(electron.app.getAppPath(), "..", "core");
    fs.mkdirSync(productuneDir, { recursive: true });
    fs.mkdirSync(claudeAgentsDir, { recursive: true });
    const envPath = path.join(productuneDir, "productune.env");
    const engineVal = opts.engine === "both" ? "claude" : opts.engine;
    const backendVal = opts.wikiBackend === "graphiti" ? "graphiti" : "keeper";
    let envContent = `MY_PO_ENGINE=${engineVal}
`;
    envContent += `PRODUCTUNE_REPO=${coreDir}
`;
    envContent += `WIKI_BACKEND=${backendVal}
`;
    envContent += `created_at=${(/* @__PURE__ */ new Date()).toISOString()}
`;
    fs.writeFileSync(envPath, envContent, { mode: 384 });
    const variantDir = path.join(coreDir, "agents", "variants", backendVal === "graphiti" ? "graphiti" : "keeper");
    const baseAgentsDir = path.join(coreDir, "agents");
    const baseFiles = fs.readdirSync(baseAgentsDir).filter((f) => f.endsWith(".md") && !fs.statSync(path.join(baseAgentsDir, f)).isDirectory());
    for (const file of baseFiles) {
      const src = path.join(baseAgentsDir, file);
      const dest = path.join(claudeAgentsDir, file);
      try {
        fs.unlinkSync(dest);
      } catch {
      }
      fs.symlinkSync(src, dest);
    }
    if (fs.existsSync(variantDir)) {
      const variantFiles = fs.readdirSync(variantDir).filter((f) => f.endsWith(".md"));
      for (const file of variantFiles) {
        const src = path.join(variantDir, file);
        const dest = path.join(claudeAgentsDir, file);
        try {
          fs.unlinkSync(dest);
        } catch {
        }
        fs.symlinkSync(src, dest);
      }
    }
    if (backendVal === "graphiti") {
      const keeperDest = path.join(claudeAgentsDir, "pdt-wiki-keeper.md");
      try {
        fs.unlinkSync(keeperDest);
      } catch {
      }
    }
    const poSrc = path.join(coreDir, "po", "po-instructions.md");
    if (fs.existsSync(poSrc)) {
      fs.copyFileSync(poSrc, path.join(productuneDir, "po-instructions.md"));
    }
    const poMemDest = path.join(productuneDir, "po-memory.md");
    const poMemTemplate = path.join(coreDir, "po", "po-memory.md.template");
    if (!fs.existsSync(poMemDest) && fs.existsSync(poMemTemplate)) {
      fs.copyFileSync(poMemTemplate, poMemDest);
    }
    await prewarmPlaywrightMcp();
    if (opts.uiLanguage) {
      setUiLanguage(opts.uiLanguage);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e == null ? void 0 : e.message) ?? "unknown error" };
  }
});
async function prewarmPlaywrightMcp() {
  return new Promise((resolve) => {
    const child = child_process.spawn("npx", ["-y", "@playwright/mcp@latest", "--help"], {
      stdio: "ignore",
      shell: true
    });
    const timeout = setTimeout(() => {
      try {
        child.kill();
      } catch {
      }
      resolve();
    }, 6e4);
    child.on("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    child.on("error", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}
function createWindow() {
  const win = new electron.BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    titleBarStyle: "hiddenInset",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js")
    }
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
electron.ipcMain.handle("ping", () => "pong");
electron.ipcMain.handle("init:project", (_event, opts) => {
  return initProject(opts);
});
electron.ipcMain.handle("project:create", (_event, { slug }) => {
  const baseDir = path.join(os.homedir(), "productune", "projects");
  fs.mkdirSync(baseDir, { recursive: true });
  let projectDir = path.join(baseDir, slug);
  let suffix = 2;
  while (fs.existsSync(projectDir)) {
    projectDir = path.join(baseDir, `${slug}-${suffix++}`);
  }
  fs.mkdirSync(projectDir, { recursive: true });
  const config = initProject({ slug, projectDir });
  return { projectDir, config };
});
electron.ipcMain.handle("project:installAt", (_event, { projectDir }) => {
  const slug = path.basename(projectDir).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "") || "project";
  const config = initProject({ slug, projectDir });
  return { projectDir, config };
});
electron.ipcMain.handle("projects:list", () => {
  const baseDir = path.join(os.homedir(), "productune", "projects");
  if (!fs.existsSync(baseDir)) return [];
  const entries = fs.readdirSync(baseDir, { withFileTypes: true }).filter((e) => e.isDirectory());
  const projects = [];
  for (const entry of entries) {
    const configPath = path.join(baseDir, entry.name, ".productune", "config.json");
    if (!fs.existsSync(configPath)) continue;
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      projects.push({ ...cfg, path: path.join(baseDir, entry.name) });
    } catch {
    }
  }
  return projects.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 10);
});
function detectProductuneLayout(dir) {
  const productuneDir = path.join(dir, ".productune");
  if (!fs.existsSync(productuneDir)) return { kind: "none" };
  const configPath = path.join(productuneDir, "config.json");
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      return { kind: "self-current", config };
    } catch {
    }
  }
  const hints = [];
  if (fs.existsSync(path.join(productuneDir, "po-state.json"))) hints.push("po-state.json");
  if (fs.existsSync(path.join(productuneDir, "briefs"))) hints.push("briefs/");
  if (fs.existsSync(path.join(productuneDir, "po.lock"))) hints.push("po.lock");
  if (fs.existsSync(path.join(productuneDir, "turns"))) hints.push("turns/");
  if (hints.length > 0) return { kind: "self-legacy", hints };
  return { kind: "none" };
}
electron.ipcMain.handle("dialog:openFolder", async () => {
  const result = await electron.dialog.showOpenDialog({ properties: ["openDirectory"] });
  if (result.canceled || result.filePaths.length === 0) return null;
  const dir = result.filePaths[0];
  const detect = detectProductuneLayout(dir);
  if (detect.kind === "self-current") {
    return { kind: "self", dir, config: detect.config };
  }
  if (detect.kind === "self-legacy") {
    return { kind: "self-legacy", dir, hints: detect.hints };
  }
  const descendants = scanDescendantsForProductune(dir);
  if (descendants.length > 0) {
    return { kind: "descendant", dir, descendants };
  }
  return { kind: "none", dir };
});
electron.ipcMain.handle("project:migrateLegacy", (_event, { projectDir, slug }) => {
  const derivedSlug = (slug ?? path.basename(projectDir).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "")) || "project";
  const config = initProject({ slug: derivedSlug, projectDir });
  return { projectDir, config, migrated: true };
});
function scanDescendantsForProductune(baseDir) {
  const found = [];
  let entries;
  try {
    entries = fs.readdirSync(baseDir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    if (entry.name === "node_modules") continue;
    const childPath = path.join(baseDir, entry.name);
    const detect = detectProductuneLayout(childPath);
    if (detect.kind === "self-current") {
      found.push({ path: childPath, config: detect.config });
    } else if (detect.kind === "self-legacy") {
      found.push({ path: childPath, config: { slug: entry.name, _legacy: true, hints: detect.hints } });
    }
  }
  return found;
}
electron.ipcMain.handle("github:checkToken", () => {
  return loadCredentials();
});
electron.ipcMain.handle("github:startDeviceFlow", async (_event, clientId) => {
  return startDeviceFlow(clientId);
});
electron.ipcMain.handle("github:pollDeviceFlow", async (_event, { clientId, deviceCode, interval }) => {
  return pollDeviceFlow(clientId, deviceCode, interval);
});
electron.ipcMain.handle("github:createRepo", async (_event, { token, slug }) => {
  return createPrivateRepo(token, slug);
});
electron.ipcMain.handle("github:setupRemote", async (_event, { projectDir, cloneUrl }) => {
  try {
    await execFileAsync("git", ["init"], { cwd: projectDir });
    await execFileAsync("git", ["remote", "add", "origin", cloneUrl], { cwd: projectDir });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
electron.ipcMain.handle("state:readPoState", async (_event, projectDir) => {
  const statePath = path.join(projectDir, ".productune", "po-state.json");
  try {
    const raw = fs.readFileSync(statePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
});
electron.ipcMain.handle("chat:getSession", (_event, projectDir) => {
  return getSession(projectDir);
});
electron.ipcMain.handle("chat:appendMessage", (_event, projectDir, message) => {
  appendMessage(projectDir, message);
});
electron.ipcMain.handle("chat:setClaudeSessionId", (_event, projectDir, sessionId) => {
  setClaudeSessionId(projectDir, sessionId);
});
electron.ipcMain.handle("chat:clearSession", (_event, projectDir) => {
  clearSession(projectDir);
});
electron.ipcMain.handle(
  "po:sendMessage",
  async (event, opts) => {
    try {
      await runPoTurn(
        {
          projectDir: opts.projectDir,
          text: opts.text,
          persona: opts.persona,
          resume: opts.resume ?? null
        },
        emitToWebContents(event.sender)
      );
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e == null ? void 0 : e.message) ?? "unknown error" };
    }
  }
);
electron.ipcMain.handle("design:listArtifacts", (_event, projectRoot) => {
  const designDir = path.resolve(projectRoot, "docs", "design");
  if (!fs.existsSync(designDir)) return [];
  const results = [];
  const walk = (dir, depth) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && depth < 1) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        results.push(path.relative(projectRoot, fullPath));
      }
    }
  };
  walk(designDir, 0);
  return results.sort();
});
electron.ipcMain.handle("design:readArtifact", (_event, projectRoot, relPath) => {
  const designDir = path.resolve(projectRoot, "docs", "design");
  const resolved = path.resolve(projectRoot, relPath);
  if (!resolved.startsWith(designDir + path.sep) && resolved !== designDir) {
    throw new Error("Path traversal rejected");
  }
  if (!resolved.endsWith(".md")) {
    throw new Error("Only .md files are readable via this handler");
  }
  return fs.readFileSync(resolved, "utf-8");
});
electron.ipcMain.handle("settings:getUiLanguage", () => {
  return getUiLanguage();
});
electron.ipcMain.handle("settings:setUiLanguage", (_event, lng) => {
  try {
    setUiLanguage(lng);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e == null ? void 0 : e.message) ?? "unknown error" };
  }
});
electron.ipcMain.handle("settings:hasLanguagePref", () => {
  return settingsFileExists();
});
electron.ipcMain.handle("settings:getOsLocale", () => {
  return electron.app.getLocale();
});
electron.ipcMain.handle("settings:loadRules", (_event, projectDir) => {
  return loadRules(projectDir);
});
electron.ipcMain.handle("settings:saveRules", (_event, projectDir, rules) => {
  try {
    saveRules(projectDir, rules);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e == null ? void 0 : e.message) ?? "unknown error" };
  }
});
function buildAppMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...isMac ? [{
      label: electron.app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" }
      ]
    }] : [],
    {
      label: "File",
      submenu: [
        {
          label: "New Project…",
          accelerator: "CmdOrCtrl+N",
          click: () => sendToFocused("menu:new-project")
        },
        {
          label: "New Window",
          accelerator: "CmdOrCtrl+Shift+N",
          click: () => createWindow()
        },
        { type: "separator" },
        {
          label: "Open Project…",
          accelerator: "CmdOrCtrl+O",
          click: () => sendToFocused("menu:open-project")
        },
        {
          label: "Open Recent",
          submenu: [
            // Wired in a future slice — emits 'menu:open-recent' with a slug.
            { label: "(empty)", enabled: false }
          ]
        },
        { type: "separator" },
        ...isMac ? [] : [{ role: "quit" }]
      ]
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...isMac ? [
          { type: "separator" },
          { role: "front" }
        ] : []
      ]
    },
    {
      role: "help",
      submenu: [
        {
          label: "productune docs",
          click: () => electron.shell.openExternal("https://github.com/shawn-kim-axz/productune")
        }
      ]
    }
  ];
  return electron.Menu.buildFromTemplate(template);
}
function sendToFocused(channel) {
  const win = electron.BrowserWindow.getFocusedWindow();
  if (win) win.webContents.send(channel);
}
electron.app.whenReady().then(() => {
  electron.Menu.setApplicationMenu(buildAppMenu());
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
