"use strict";
const electron = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const child_process = require("child_process");
const util = require("util");
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
  const turnsDir = path.join(projectDir, ".productune", "turns");
  fs.mkdirSync(turnsDir, { recursive: true });
  ensureFile(path.join(turnsDir, "README.md"), "# turn activity log\n\nPer-task JSONL files (`<task-slug>.jsonl`). One line per persona invocation:\n`{ ts, persona, task_slug, ticket_id, round, turn_index, input_meta, wiki_consult, output_full, promotion_outcome }`.\nWritten by PO. Raw truth; `.productune/po-state.json` is the summary.\n");
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
    mode: opts.mode,
    created_at: existing.created_at ?? (/* @__PURE__ */ new Date()).toISOString(),
    version: "0.4.0"
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  bootstrapPersonaMemory(opts.projectDir);
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
    send("🔍 Homebrew 확인 중...");
    let brewOk = false;
    try {
      await execFileAsync(findBrew(), ["--version"]);
      brewOk = true;
      send(`✅ Homebrew 감지됨`);
    } catch {
    }
    if (!brewOk) {
      send("📦 Homebrew 설치 중... (몇 분 소요)");
      const installScript = "curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh | bash";
      await spawnStreaming("/bin/bash", ["-c", installScript], baseEnv, send);
      send("✅ Homebrew 설치 완료");
    }
    send("🐳 Docker Desktop 설치 중... (몇 분 소요)");
    const brew = findBrew();
    await spawnStreaming(brew, ["install", "--cask", "docker"], baseEnv, send);
    send("✅ 설치 완료 — Docker Desktop을 실행해주세요");
    return { ok: true };
  } catch (e) {
    const msg = (e == null ? void 0 : e.message) ?? "알 수 없는 오류";
    send(`❌ 오류: ${msg}`);
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
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e == null ? void 0 : e.message) ?? "unknown error" };
  }
});
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
electron.ipcMain.handle("project:create", (_event, { slug, mode }) => {
  const baseDir = path.join(os.homedir(), "productune", "projects");
  fs.mkdirSync(baseDir, { recursive: true });
  let projectDir = path.join(baseDir, slug);
  let suffix = 2;
  while (fs.existsSync(projectDir)) {
    projectDir = path.join(baseDir, `${slug}-${suffix++}`);
  }
  fs.mkdirSync(projectDir, { recursive: true });
  const config = initProject({ slug, mode, projectDir });
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
electron.ipcMain.handle("dialog:openFolder", async () => {
  const result = await electron.dialog.showOpenDialog({ properties: ["openDirectory"] });
  if (result.canceled || result.filePaths.length === 0) return null;
  const dir = result.filePaths[0];
  const configPath = path.join(dir, ".productune", "config.json");
  const hasProductune = fs.existsSync(configPath);
  let config = null;
  if (hasProductune) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } catch {
    }
  }
  return { dir, hasProductune, config };
});
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
electron.app.whenReady().then(() => {
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
