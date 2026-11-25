import {
  createMaster,
  decryptBlob,
  decryptBytes,
  encryptBlob,
  encryptBytes,
  exportMaster,
  importMaster,
  unwrapMaster,
  wrapMaster,
  type Wrap,
} from "@/lib/desk/crypto";
import { buildSeed, OFFICE_CODE, PILOT_PASSWORD } from "@/lib/desk/seed";
import type { DeskData, Role, User } from "@/lib/desk/types";
import { VAULT_FILE } from "@/lib/desk/types";
import { APP_VERSION, isNewerVersion } from "@/lib/desk/version";
import { buildWorkbook, parseWorkbook } from "@/lib/desk/workbook";

export type Slot = "application" | "backup";
type HandleKey = string;

export type Envelope = {
  version: 1;
  savedAt: string;
  wraps: Record<string, Wrap>;
  iv: string;
  data: string;
};

type Session = {
  master: CryptoKey;
  wraps: Record<string, Wrap>;
};

type StoredBlob = { iv: string; data: ArrayBuffer };

const LS_APP = "truedesk:application";
const LS_BAK = "truedesk:backup";
const SS_KEY = "truedesk-jwk";
const SS_USER = "truedesk-user";

let dbPromise: Promise<IDBDatabase> | null = null;
let session: Session | null = null;
let latestJson = "";
let lastSnapshot = "";

function lsKey(slot: Slot): string {
  return slot === "application" ? LS_APP : LS_BAK;
}

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("Storage is not available."));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open("truedesk", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("slots")) db.createObjectStore("slots");
        if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs");
        if (!db.objectStoreNames.contains("handles")) db.createObjectStore("handles");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function slotGet(key: string): Promise<string | null> {
  const db = await openDb();
  const tx = db.transaction("slots", "readonly");
  const value = await req(tx.objectStore("slots").get(key));
  return typeof value === "string" ? value : null;
}

async function slotSet(key: string, value: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("slots", "readwrite");
  tx.objectStore("slots").put(value, key);
  await done(tx);
}

async function handleGet(slot: HandleKey): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDb();
  const tx = db.transaction("handles", "readonly");
  const value = await req(tx.objectStore("handles").get(slot));
  if (value && typeof value === "object" && "getFileHandle" in (value as FileSystemDirectoryHandle)) {
    return value as FileSystemDirectoryHandle;
  }
  return null;
}

async function handleSet(slot: HandleKey, handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("handles", "readwrite");
  tx.objectStore("handles").put(handle, slot);
  await done(tx);
}

function parseEnvelope(json: string | null): Envelope | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as Envelope;
    if (value?.version !== 1 || !value.data || !value.wraps) return null;
    return value;
  } catch {
    return null;
  }
}

async function folderText(slot: Slot): Promise<string | null> {
  const handle = await readableHandle(slot);
  if (!handle) return null;
  try {
    const fileHandle = await handle.getFileHandle(VAULT_FILE);
    const file = await fileHandle.getFile();
    return await file.text();
  } catch {
    return null;
  }
}

async function readableHandle(slot: Slot): Promise<FileSystemDirectoryHandle | null> {
  const handle = await handleGet(slot);
  if (!handle) return null;
  try {
    const state = await handle.queryPermission?.({ mode: "readwrite" });
    if (state === "granted") return handle;
  } catch {
    return null;
  }
  return null;
}

export async function folderLinks(): Promise<{ application: boolean; backup: boolean }> {
  const [application, backup] = await Promise.all([readableHandle("application"), readableHandle("backup")]);
  return { application: Boolean(application), backup: Boolean(backup) };
}

async function collect(): Promise<Envelope | null> {
  const blobs = [
    localStorage.getItem(LS_APP),
    localStorage.getItem(LS_BAK),
    await slotGet("application"),
    await slotGet("backup"),
    await folderText("application"),
    await folderText("backup"),
  ];
  const envelopes = blobs.map(parseEnvelope).filter((item): item is Envelope => Boolean(item));
  if (!envelopes.length) return null;
  envelopes.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
  return envelopes[0] ?? null;
}

async function writeSinks(json: string, data: DeskData | null): Promise<{ inSync: boolean; message: string }> {
  const problems: string[] = [];
  try {
    localStorage.setItem(LS_APP, json);
    localStorage.setItem(LS_BAK, json);
  } catch {
    problems.push("the desk copy");
  }
  try {
    await slotSet("application", json);
    await slotSet("backup", json);
  } catch {
    problems.push("the backup copy");
  }
  for (const slot of ["application", "backup"] as const) {
    const handle = await readableHandle(slot);
    if (!handle) continue;
    try {
      await writeVaultFile(handle, json);
      if (data) await writeAttachments(handle, data);
    } catch {
      problems.push(slot === "application" ? "Y:\\ application folder" : "Y:\\ backup folder");
    }
  }
  latestJson = json;
  if (!problems.length) return { inSync: true, message: "Both copies match." };
  return { inSync: false, message: `Saved, but could not update ${problems.join(" and ")}.` };
}

async function writeVaultFile(dir: FileSystemDirectoryHandle, json: string) {
  const handle = await dir.getFileHandle(VAULT_FILE, { create: true });
  const stream = await handle.createWritable();
  await stream.write(json);
  await stream.close();
}

async function writeAttachments(dir: FileSystemDirectoryHandle, data: DeskData) {
  const folder = await dir.getDirectoryHandle("attachments", { create: true });
  for (const file of data.attachments) {
    const stored = await blobGet(file.id);
    if (!stored) continue;
    const iv = Uint8Array.from(atob(stored.iv), (char) => char.charCodeAt(0));
    const body = new Uint8Array(stored.data);
    const packed = new Uint8Array(iv.length + body.length);
    packed.set(iv, 0);
    packed.set(body, iv.length);
    const handle = await folder.getFileHandle(`${file.id}.bin`, { create: true });
    const stream = await handle.createWritable();
    await stream.write(new Blob([packed]));
    await stream.close();
  }
}

async function blobGet(id: string): Promise<StoredBlob | null> {
  const db = await openDb();
  const tx = db.transaction("blobs", "readonly");
  const value = await req<StoredBlob | undefined>(tx.objectStore("blobs").get(id));
  if (!value?.data || !value.iv) return null;
  return value;
}

async function blobSet(id: string, value: StoredBlob): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("blobs", "readwrite");
  tx.objectStore("blobs").put(value, id);
  await done(tx);
}

async function decryptData(master: CryptoKey, envelope: Envelope): Promise<DeskData> {
  const bytes = await decryptBytes(master, envelope.iv, envelope.data);
  return parseWorkbook(bytes);
}

async function seal(data: DeskData): Promise<string> {
  if (!session) throw new Error("Sign in before saving.");
  const bytes = buildWorkbook(data);
  const exact = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const sealed = await encryptBytes(session.master, exact);
  const envelope: Envelope = {
    version: 1,
    savedAt: new Date().toISOString(),
    wraps: session.wraps,
    iv: sealed.iv,
    data: sealed.data,
  };
  return JSON.stringify(envelope);
}

export type Unlocked = { user: User; data: DeskData };

async function loadVault(): Promise<Unlocked | null> {
  let envelope = await collect();
  if (!envelope) {
    await seedVault();
    envelope = await collect();
  }
  if (!envelope) return null;
  await writeSinks(JSON.stringify(envelope), null);
  const raw = sessionStorage.getItem(SS_KEY);
  const userId = sessionStorage.getItem(SS_USER);
  if (!raw || !userId) return null;
  try {
    const master = await importMaster(JSON.parse(raw) as JsonWebKey);
    const data = await decryptData(master, envelope);
    const user = data.users.find((item) => item.id === userId);
    if (!user) throw new Error("missing user");
    session = { master, wraps: envelope.wraps };
    lastSnapshot = JSON.stringify(data);
    return { user, data };
  } catch {
    sessionStorage.removeItem(SS_KEY);
    sessionStorage.removeItem(SS_USER);
    return null;
  }
}

async function seedVault() {
  const data = buildSeed();
  const master = await createMaster();
  const wraps: Record<string, Wrap> = {};
  for (const user of data.users) wraps[user.username] = await wrapMaster(master, PILOT_PASSWORD);
  wraps.__office__ = await wrapMaster(master, OFFICE_CODE);
  session = { master, wraps };
  const json = await seal(data);
  await writeSinks(json, data);
  session = null;
}

async function remember(user: User, master: CryptoKey) {
  const jwk = await exportMaster(master);
  sessionStorage.setItem(SS_KEY, JSON.stringify(jwk));
  sessionStorage.setItem(SS_USER, user.id);
}

export async function unlock(username: string, password: string): Promise<Unlocked | { error: string }> {
  const envelope = await collect();
  if (!envelope) return { error: "The register could not be opened." };
  const name = username.trim().toLowerCase();
  const wrap = envelope.wraps[name];
  if (!wrap) return { error: "That username or password is not on the register." };
  const master = await unwrapMaster(password, wrap);
  if (!master) return { error: "That username or password is not on the register." };
  try {
    const data = await decryptData(master, envelope);
    const user = data.users.find((item) => item.username === name);
    if (!user) return { error: "That username or password is not on the register." };
    session = { master, wraps: envelope.wraps };
    lastSnapshot = JSON.stringify(data);
    await remember(user, master);
    return { user, data };
  } catch {
    return { error: "The register could not be read. Reset the pilot copy if this keeps happening." };
  }
}

export function cleanUsername(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ".");
}

export function usernameError(username: string): string | null {
  if (!/^[a-z0-9.]{3,24}$/.test(username)) return "Use 3 to 24 letters, numbers or dots.";
  return null;
}

export async function registerAccount(input: {
  name: string;
  username: string;
  password: string;
  officeCode: string;
  job: string;
  team: string;
}): Promise<Unlocked | { error: string }> {
  const envelope = await collect();
  if (!envelope) return { error: "The register could not be opened." };
  const office = envelope.wraps.__office__;
  if (!office) return { error: "Office enrolment is not set up." };
  const master = await unwrapMaster(input.officeCode.trim(), office);
  if (!master) return { error: "That office code was not recognised." };
  const username = cleanUsername(input.username);
  const invalid = usernameError(username);
  if (invalid) return { error: invalid };
  if (input.password.length < 8) return { error: "Use a password of at least 8 characters." };
  if (!input.name.trim()) return { error: "Enter your name." };
  const data = await decryptData(master, envelope);
  if (data.users.some((user) => user.username === username)) {
    return { error: "That username is already on the register." };
  }
  const role: Role = data.users.some((person) => person.role === "manager") ? "user" : "manager";
  const user: User = {
    id: crypto.randomUUID(),
    username,
    name: input.name.trim(),
    role,
    team: input.team.trim() || "Accounts",
    job: input.job.trim() || "Accounts",
  };
  data.users.push(user);
  data.activity.unshift({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    actorId: user.id,
    message: role === "manager" ? `${user.name} joined as the manager.` : `${user.name} joined the desk.`,
  });
  session = { master, wraps: { ...envelope.wraps, [username]: await wrapMaster(master, input.password) } };
  await persist(data, "manual");
  await remember(user, master);
  return { user, data };
}

export async function addColleague(input: {
  actor: User;
  name: string;
  username: string;
  password: string;
  role: Role;
  job: string;
  team: string;
  data: DeskData;
}): Promise<{ data: DeskData } | { error: string }> {
  if (!session) return { error: "Sign in again before adding someone." };
  const username = cleanUsername(input.username);
  const invalid = usernameError(username);
  if (invalid) return { error: invalid };
  if (input.password.length < 8) return { error: "Use a temporary password of at least 8 characters." };
  if (!input.name.trim()) return { error: "Enter their name." };
  if (input.data.users.some((user) => user.username === username)) {
    return { error: "That username is already on the register." };
  }
  const role: Role = input.actor.role === "manager" && input.role === "manager" ? "manager" : "user";
  const user: User = {
    id: crypto.randomUUID(),
    username,
    name: input.name.trim(),
    role,
    team: input.team.trim() || input.actor.team,
    job: input.job.trim() || "Accounts",
  };
  const data: DeskData = {
    ...input.data,
    users: [...input.data.users, user],
    activity: [
      {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        actorId: input.actor.id,
        message: `${input.actor.name} added ${user.name} to the register.`,
      },
      ...input.data.activity,
    ].slice(0, 200),
  };
  session = { ...session, wraps: { ...session.wraps, [username]: await wrapMaster(session.master, input.password) } };
  return { data };
}

export async function changePassword(username: string, password: string): Promise<string | null> {
  if (!session) return "Sign in again.";
  if (password.length < 8) return "Use a password of at least 8 characters.";
  session = { ...session, wraps: { ...session.wraps, [username]: await wrapMaster(session.master, password) } };
  return null;
}

export async function persist(
  data: DeskData,
  reason: "auto" | "manual" | "checkpoint" | "close",
): Promise<{ ok: boolean; savedAt: string | null; message: string; inSync: boolean }> {
  if (!session) return { ok: false, savedAt: null, message: "Not signed in.", inSync: false };
  const snapshot = JSON.stringify(data);
  if (snapshot === lastSnapshot && reason === "auto") {
    return { ok: true, savedAt: null, message: "Both copies match.", inSync: true };
  }
  try {
    const json = await seal(data);
    const written = await writeSinks(json, data);
    lastSnapshot = snapshot;
    const savedAt = new Date().toISOString();
    return { ok: true, savedAt, message: written.message, inSync: written.inSync };
  } catch {
    return { ok: false, savedAt: null, message: "The save did not finish.", inSync: false };
  }
}

let vaultBoot: Promise<Unlocked | null> | null = null;

export function bootVault(): Promise<Unlocked | null> {
  if (!vaultBoot) {
    vaultBoot = loadVault().catch((error) => {
      vaultBoot = null;
      throw error;
    });
  }
  return vaultBoot;
}

export function exportEnvelope(): string {
  return latestJson;
}

export async function storeFile(file: File): Promise<{ id: string } | { error: string }> {
  if (!session) return { error: "Sign in again before attaching a file." };
  if (file.size > 40 * 1024 * 1024) return { error: `${file.name} is over 40 MB.` };
  const id = crypto.randomUUID();
  const sealed = await encryptBlob(session.master, await file.arrayBuffer());
  await blobSet(id, sealed);
  return { id };
}

export async function readFile(id: string, name: string, mime: string): Promise<void> {
  if (!session) return;
  const stored = await blobGet(id);
  if (!stored) return;
  const plain = await decryptBlob(session.master, stored.iv, stored.data);
  const blob = new Blob([plain], { type: mime || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

const RELEASE_TYPES: Record<string, string> = {
  html: "text/html",
  js: "text/javascript",
  mjs: "text/javascript",
  css: "text/css",
  json: "application/json",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  txt: "text/plain",
  map: "application/json",
  webmanifest: "application/manifest+json",
};

export type DeskRelease = { version: string; notes: string };

function releaseType(path: string, fallback: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return RELEASE_TYPES[ext] || fallback || "application/octet-stream";
}

async function collectReleaseFiles(dir: FileSystemDirectoryHandle, prefix: string, out: { path: string; file: File }[]) {
  for await (const [name, handle] of dir.entries()) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "directory") await collectReleaseFiles(handle as FileSystemDirectoryHandle, path, out);
    else if (handle.kind === "file") out.push({ path, file: await (handle as FileSystemFileHandle).getFile() });
  }
}

export async function readDeskRelease(): Promise<DeskRelease | null> {
  const root = await readableHandle("application");
  if (!root) return null;
  try {
    const update = await root.getDirectoryHandle("update");
    const file = await (await update.getFileHandle("release.json")).getFile();
    const parsed = JSON.parse(await file.text()) as { version?: string; notes?: string };
    const version = parsed.version?.trim() ?? "";
    if (!version || !isNewerVersion(version, APP_VERSION)) return null;
    return { version, notes: (parsed.notes ?? "").trim() };
  } catch {
    return null;
  }
}

export async function installDeskRelease(): Promise<string | null> {
  if (!("caches" in window) || !("serviceWorker" in navigator)) {
    return "This browser cannot update itself. Open the desk in Chrome or Edge.";
  }
  const root = await readableHandle("application");
  if (!root) return "Link the application folder first, then try the update again.";
  try {
    const update = await root.getDirectoryHandle("update");
    const app = await update.getDirectoryHandle("app");
    const files: { path: string; file: File }[] = [];
    await collectReleaseFiles(app, "", files);
    if (!files.some((item) => item.path === "index.html")) {
      return "The update folder needs an app folder with index.html.";
    }
    const cache = await caches.open("truedesk-shell");
    const stale = await cache.keys();
    await Promise.all(stale.map((key) => cache.delete(key)));
    for (const item of files) {
      const bytes = await item.file.arrayBuffer();
      const type = releaseType(item.path, item.file.type);
      const headers = { "Content-Type": type };
      await cache.put(`/${item.path}`, new Response(bytes, { headers }));
      if (item.path === "index.html") await cache.put("/", new Response(bytes, { headers }));
    }
    await navigator.serviceWorker.register("/truedesk-sw.js");
    const ready = await navigator.serviceWorker.ready;
    ready.waiting?.postMessage("skip-waiting");
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true });
        window.setTimeout(resolve, 4000);
      });
    }
    window.location.reload();
    return null;
  } catch {
    return "The update on the Y drive could not be read.";
  }
}

export async function linkFolder(slot: Slot): Promise<string | null> {
  const picker = window.showDirectoryPicker;
  if (!picker) {
    return "This browser cannot attach a network folder. Export the protected copy and place the same file in both folders.";
  }
  try {
    const handle = await picker({ mode: "readwrite", id: `truedesk-${slot}` });
    await handleSet(slot, handle);
    if (latestJson) await writeVaultFile(handle, latestJson);
    return null;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null;
    return "That folder could not be linked.";
  }
}

const SHEET_FILE = /\.(xlsx|xlsm|xlsb|xls|csv)$/i;

export async function linkSourceFolder(toolId: string, sourceId: string): Promise<{ name: string } | { error: string } | null> {
  const picker = window.showDirectoryPicker;
  if (!picker) return { error: "This browser cannot attach a folder." };
  try {
    const handle = await picker({ mode: "read", id: `truedesk-${toolId}-${sourceId}` });
    await handleSet(`source:${toolId}:${sourceId}`, handle);
    return { name: handle.name };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null;
    return { error: "That folder could not be linked." };
  }
}

export async function sourceFolderName(toolId: string, sourceId: string): Promise<string | null> {
  const handle = await handleGet(`source:${toolId}:${sourceId}`);
  if (!handle) return null;
  return handle.name;
}

export async function sourceFolderFiles(toolId: string, sourceId: string): Promise<File[]> {
  const handle = await handleGet(`source:${toolId}:${sourceId}`);
  if (!handle) return [];
  if (!(await allowMacroFolder(handle))) return [];
  const files: File[] = [];
  for await (const [name, entry] of handle.entries()) {
    if (entry.kind !== "file" || !SHEET_FILE.test(name)) continue;
    files.push(await (entry as FileSystemFileHandle).getFile());
  }
  return files;
}

async function allowMacroFolder(handle: FileSystemDirectoryHandle, ask = true): Promise<boolean> {
  try {
    let state = await handle.queryPermission?.({ mode: "read" });
    if (state !== "granted" && ask) state = await handle.requestPermission?.({ mode: "read" });
    return state === "granted";
  } catch {
    return false;
  }
}

export async function resetPilot(): Promise<void> {
  session = null;
  latestJson = "";
  lastSnapshot = "";
  sessionStorage.removeItem(SS_KEY);
  sessionStorage.removeItem(SS_USER);
  localStorage.removeItem(LS_APP);
  localStorage.removeItem(LS_BAK);
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
    dbPromise = null;
  }
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("truedesk");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
  await seedVault();
}

export function signOutVault() {
  session = null;
  lastSnapshot = "";
  sessionStorage.removeItem(SS_KEY);
  sessionStorage.removeItem(SS_USER);
}
