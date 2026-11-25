const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { pathToFileURL } = require("url");

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

ipcMain.handle("open-outlook", async (_event, url) => {
  if (typeof url !== "string" || !url.startsWith("mailto:")) throw new Error("Not an email link.");
  await shell.openExternal(url);
});

ipcMain.handle("open-file", async (_event, name, base64) => {
  if (typeof name !== "string" || typeof base64 !== "string" || !base64) throw new Error("That file could not be opened.");
  const raw = path.basename(name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim().slice(0, 180);
  const safe = raw || "attachment";
  const dir = path.join(app.getPath("temp"), "TrueDesk");
  await fs.promises.mkdir(dir, { recursive: true });
  const dest = path.join(dir, `${Date.now()}-${safe}`);
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
