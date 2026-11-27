const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");

const APPLICATION = "Y:\\accounts\\Tools\\Task application";
const runtimeWho = String(os.userInfo().username || "desk").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 40) || "desk";
app.setPath("userData", path.join(APPLICATION, "_runtime", runtimeWho));

const PORT = 4173;
const SHEET = /\.(xlsx|xlsm|xlsb|xls|csv)$/i;

function serverEntry() {
  const packed = path.join(process.resourcesPath, "app-server", "server", "index.mjs");
  const local = path.join(__dirname, "..", ".output", "server", "index.mjs");
  return fs.existsSync(packed) ? packed : local;
}

async function startServer() {
  const entry = serverEntry();
  if (!fs.existsSync(entry)) throw new Error("The desk files were not packed with this app.");
  process.env.HOST = "127.0.0.1";
  process.env.PORT = String(PORT);
  process.env.NITRO_HOST = "127.0.0.1";
  process.env.NITRO_PORT = String(PORT);
  process.chdir(path.dirname(entry));
  await import(pathToFileURL(entry).href);
}

function waitForDesk() {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      const request = http.get(`http://127.0.0.1:${PORT}/`, (response) => {
        response.resume();
        resolve();
      });
      request.on("error", () => {
        if (Date.now() - started > 40000) reject(new Error("True Desk did not start."));
        else setTimeout(tick, 300);
      });
    };
    tick();
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    title: "True Desk",
    backgroundColor: "#01033a",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("mailto:")) {
      void shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });
  void window.loadURL(`http://127.0.0.1:${PORT}/`);
}

ipcMain.handle("pick-file", async () => {
  const parent = BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(parent ?? undefined, {
    title: "Select the file",
    properties: ["openFile"],
    filters: [
      { name: "Spreadsheets", extensions: ["xlsx", "xlsm", "xlsb", "xls", "csv"] },
      { name: "All files", extensions: ["*"] },
    ],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

ipcMain.handle("focus-window", () => {
  const window = BrowserWindow.getAllWindows()[0];
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
  window.flashFrame(true);
});

ipcMain.handle("clear-attention", () => {
  for (const window of BrowserWindow.getAllWindows()) window.flashFrame(false);
});

ipcMain.handle("open-outlook", async (_event, payload) => {
  if (!payload || typeof payload !== "object") throw new Error("That email could not be opened.");
  const to = String(payload.to || "").replace(/[\r\n]/g, "").slice(0, 2000);
  const cc = String(payload.cc || "").replace(/[\r\n]/g, "").slice(0, 2000);
  const subject = String(payload.subject || "").slice(0, 500);
  const body = String(payload.body || "").slice(0, 8000);
  let filePath = "";
  if (payload.fileBase64 && payload.fileName && payload.username) {
    const folder = path.join(userFolder(APPLICATION, assertUsername(String(payload.username))), "opened");
    await fs.promises.mkdir(folder, { recursive: true });
    const raw = path.basename(String(payload.fileName)).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim().slice(0, 180);
    filePath = path.join(folder, raw || "attachment");
    const packed = String(payload.fileBase64);
    if (packed.length > 56_000_000) throw new Error("That file is too large to attach.");
    await fs.promises.writeFile(filePath, Buffer.from(packed, "base64"));
  }
  const opened = await outlookMessage({ to, cc, subject, body, filePath });
  if (opened) return;
  const parts = [`subject=${encodeURIComponent(subject)}`, `body=${encodeURIComponent(body)}`];
  if (cc) parts.unshift(`cc=${encodeURIComponent(cc)}`);
  await shell.openExternal(`mailto:${to}?${parts.join("&")}`);
});

function outlookMessage({ to, cc, subject, body, filePath }) {
  return new Promise((resolve) => {
    const script = [
      "$ErrorActionPreference = 'Stop'",
      "$outlook = New-Object -ComObject Outlook.Application",
      "$mail = $outlook.CreateItem(0)",
      "$mail.To = $env:TD_TO",
      "if ($env:TD_CC) { $mail.CC = $env:TD_CC }",
      "$mail.Subject = $env:TD_SUBJECT",
      "$mail.Body = $env:TD_BODY",
      "if ($env:TD_FILE -and (Test-Path -LiteralPath $env:TD_FILE)) { $null = $mail.Attachments.Add($env:TD_FILE) }",
      "$mail.Display()",
    ].join("; ");
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      env: { ...process.env, TD_TO: to, TD_CC: cc, TD_SUBJECT: subject, TD_BODY: body, TD_FILE: filePath },
      windowsHide: true,
    });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}

ipcMain.handle("open-file", async (_event, username, name, base64) => {
  if (typeof name !== "string" || typeof base64 !== "string" || !base64) throw new Error("That file could not be opened.");
  const folder = path.join(userFolder(APPLICATION, assertUsername(username)), "opened");
  await fs.promises.mkdir(folder, { recursive: true });
  const raw = path.basename(name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim().slice(0, 180);
  const dest = path.join(folder, raw || "attachment");
  await fs.promises.writeFile(dest, Buffer.from(base64, "base64"));
  const error = await shell.openPath(dest);
  if (error) throw new Error(error);
});

ipcMain.handle("read-spreadsheets", async (_event, target) => {
  if (typeof target !== "string" || !target.trim() || target.length > 400) throw new Error("That path is not usable.");
  const resolved = path.resolve(target.trim());
  const stat = await fs.promises.stat(resolved);
  const files = [];
  if (stat.isFile()) {
    if (!SHEET.test(resolved)) throw new Error("That file is not a spreadsheet.");
    files.push(resolved);
  } else {
    const names = await fs.promises.readdir(resolved);
    for (const name of names) {
      if (SHEET.test(name)) files.push(path.join(resolved, name));
    }
  }
  const out = [];
  for (const file of files) {
    const buf = await fs.promises.readFile(file);
    if (buf.length > 40 * 1024 * 1024) continue;
    out.push({ name: path.basename(file), base64: buf.toString("base64") });
  }
  return out;
});

const ROOTS = {
  application: APPLICATION,
  backup: "Y:\\accounts\\Task app backup",
};
const USERNAME = /^[a-z0-9.]{3,24}$/;
const RESERVED = new Set(["update", "attachments", "tools", "_runtime"]);
const FILE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUsername(username) {
  if (typeof username !== "string" || !USERNAME.test(username) || RESERVED.has(username)) {
    throw new Error("That username cannot be used as a folder.");
  }
  return username;
}

function assertFileId(id) {
  if (typeof id !== "string" || !FILE_ID.test(id)) throw new Error("That file is not allowed.");
  return id;
}

function userFolder(root, username) {
  const dir = path.resolve(root, username);
  const rel = path.relative(path.resolve(root), dir);
  if (rel !== username || rel.includes("..") || path.isAbsolute(rel)) throw new Error("That folder is not allowed.");
  return dir;
}

async function ensureRoot(slot) {
  try {
    await fs.promises.mkdir(ROOTS[slot], { recursive: true });
    return true;
  } catch {
    return false;
  }
}

async function readOptional(file) {
  try {
    return await fs.promises.readFile(file);
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

function newerText(texts) {
  let best = null;
  let bestAt = "";
  for (const text of texts) {
    if (!text) continue;
    let savedAt = "";
    try {
      savedAt = JSON.parse(text).savedAt || "";
    } catch {
      savedAt = "";
    }
    if (!best || savedAt >= bestAt) {
      best = text;
      bestAt = savedAt;
    }
  }
  return best;
}

async function writeBoth(parts, contents) {
  const status = { application: false, backup: false };
  for (const slot of ["application", "backup"]) {
    try {
      const dir = path.join(ROOTS[slot], ...parts.slice(0, -1));
      await fs.promises.mkdir(dir, { recursive: true });
      const file = path.join(ROOTS[slot], ...parts);
      const tmp = `${file}.tmp`;
      await fs.promises.writeFile(tmp, contents);
      await fs.promises.rename(tmp, file);
      status[slot] = true;
    } catch {
      status[slot] = false;
    }
  }
  if (!status.application && !status.backup) throw new Error("Could not save to the shared drive.");
  return status;
}

ipcMain.handle("read-vault", async () => {
  const application = await ensureRoot("application");
  const backup = await ensureRoot("backup");
  const texts = [];
  if (application) {
    const buf = await readOptional(path.join(ROOTS.application, "TrueDesk.vault.json"));
    if (buf) texts.push(buf.toString("utf8"));
  }
  if (backup) {
    const buf = await readOptional(path.join(ROOTS.backup, "TrueDesk.vault.json"));
    if (buf) texts.push(buf.toString("utf8"));
  }
  return { json: newerText(texts), application, backup };
});

ipcMain.handle("write-vault", async (_event, json) => {
  if (typeof json !== "string" || !json || json.length > 32_000_000) throw new Error("The desk could not be saved.");
  return writeBoth(["TrueDesk.vault.json"], json);
});

ipcMain.handle("read-profile", async (_event, username) => {
  const name = assertUsername(username);
  for (const slot of ["application", "backup"]) {
    const buf = await readOptional(path.join(userFolder(ROOTS[slot], name), "profile.json"));
    if (buf) return buf.toString("utf8");
  }
  return null;
});

ipcMain.handle("write-profile", async (_event, username, json) => {
  const name = assertUsername(username);
  if (typeof json !== "string" || !json || json.length > 200_000) throw new Error("That profile could not be saved.");
  return writeBoth([name, "profile.json"], json);
});

ipcMain.handle("delete-profile", async (_event, username) => {
  const name = assertUsername(username);
  for (const slot of ["application", "backup"]) {
    await fs.promises.rm(userFolder(ROOTS[slot], name), { recursive: true, force: true });
  }
});

async function attachmentHits(fileId) {
  const hits = [];
  for (const slot of ["application", "backup"]) {
    let names = [];
    try {
      names = await fs.promises.readdir(ROOTS[slot]);
    } catch {
      names = [];
    }
    for (const name of names) {
      if (!USERNAME.test(name) || RESERVED.has(name)) continue;
      const file = path.join(ROOTS[slot], name, "files", `${fileId}.bin`);
      try {
        await fs.promises.access(file);
        hits.push({ legacy: false, file });
      } catch {
        /* Not in this profile. */
      }
    }
    const legacy = path.join(ROOTS[slot], "attachments", `${fileId}.bin`);
    try {
      await fs.promises.access(legacy);
      hits.push({ legacy: true, file: legacy });
    } catch {
      /* No old shared copy. */
    }
  }
  return hits;
}

ipcMain.handle("read-attachment", async (_event, id) => {
  const fileId = assertFileId(id);
  const hits = await attachmentHits(fileId);
  for (const hit of hits) {
    const buf = await readOptional(hit.file);
    if (buf) return buf.toString("base64");
  }
  return null;
});

ipcMain.handle("write-attachment", async (_event, username, id, base64) => {
  const name = assertUsername(username);
  const fileId = assertFileId(id);
  if (typeof base64 !== "string" || !base64 || base64.length > 56_000_000) throw new Error("That file could not be saved.");
  return writeBoth([name, "files", `${fileId}.bin`], Buffer.from(base64, "base64"));
});

ipcMain.handle("claim-attachment", async (_event, username, id) => {
  const name = assertUsername(username);
  const fileId = assertFileId(id);
  const hits = await attachmentHits(fileId);
  const legacy = hits.find((hit) => hit.legacy);
  if (!legacy) return;
  const buf = await readOptional(legacy.file);
  if (!buf) return;
  await writeBoth([name, "files", `${fileId}.bin`], buf);
  for (const slot of ["application", "backup"]) {
    await fs.promises.rm(path.join(ROOTS[slot], "attachments", `${fileId}.bin`), { force: true });
  }
});

ipcMain.handle("delete-attachment", async (_event, id) => {
  const fileId = assertFileId(id);
  const hits = await attachmentHits(fileId);
  await Promise.all(hits.map((hit) => fs.promises.rm(hit.file, { force: true })));
});

ipcMain.handle("write-tools", async (_event, json) => {
  if (typeof json !== "string" || !json || json.length > 8_000_000) throw new Error("The tools could not be saved.");
  return writeBoth(["tools", "tools.json"], json);
});

ipcMain.handle("write-user-tasks", async (_event, username, json) => {
  const name = assertUsername(username);
  if (typeof json !== "string" || !json || json.length > 8_000_000) throw new Error("Those tasks could not be saved.");
  return writeBoth([name, "tasks.json"], json);
});

ipcMain.handle("read-release", async () => {
  const buf = await readOptional(path.join(ROOTS.application, "update", "release.json"));
  return buf ? buf.toString("utf8") : null;
});

app.whenReady().then(async () => {
  try {
    await startServer();
    await waitForDesk();
    createWindow();
  } catch (error) {
    dialog.showErrorBox("True Desk could not start", error instanceof Error ? error.message : String(error));
    app.quit();
  }
});

app.on("window-all-closed", () => {
  app.quit();
});
