import {
  createMaster,
  decryptBlob,
  decryptBytes,
  encryptBlob,
  encryptBytes,
  fromB64,
  toB64,
  unwrapMaster,
  wrapMaster,
  type Wrap,
} from "@/lib/desk/crypto";
import { deskDisk } from "@/lib/desk/disk";
import { buildSeed, OFFICE_CODE } from "@/lib/desk/seed";
import type { DeskData, DiskStatus, Role, User } from "@/lib/desk/types";
import { APP_VERSION, isNewerVersion } from "@/lib/desk/version";
import { buildWorkbook, parseWorkbook } from "@/lib/desk/workbook";

export type Slot = "application" | "backup";

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
type ProfileFile = {
  username: string;
  wrap: Wrap;
};

const RESERVED_USERS = new Set(["update", "attachments"]);
const handles = new Map<string, FileSystemDirectoryHandle>();
const memoryBlobs = new Map<string, StoredBlob>();

let session: Session | null = null;
let latestJson = "";
let lastSnapshot = "";

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

function parseProfile(json: string | null): ProfileFile | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as ProfileFile;
    if (!value?.username || !value.wrap?.salt || !value.wrap.iv || !value.wrap.wrapped) return null;
    return value;
  } catch {
    return null;
  }
}

function packBlob(stored: StoredBlob): string {
  const iv = fromB64(stored.iv);
  const body = new Uint8Array(stored.data);
  const packed = new Uint8Array(iv.byteLength + body.byteLength);
  packed.set(iv, 0);
  packed.set(body, iv.byteLength);
  return toB64(packed);
}

function unpackBlob(packed: string): StoredBlob | null {
  const bytes = fromB64(packed);
  if (bytes.byteLength <= 12) return null;
  const iv = bytes.slice(0, 12);
  const body = bytes.slice(12);
  return { iv: toB64(iv), data: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) };
}

async function handleGet(slot: string): Promise<FileSystemDirectoryHandle | null> {
  return handles.get(slot) ?? null;
}

async function handleSet(slot: string, handle: FileSystemDirectoryHandle): Promise<void> {
  handles.set(slot, handle);
}

async function readableHandle(slot: Slot): Promise<FileSystemDirectoryHandle | null> {
  return handles.get(slot) ?? null;
}

export async function folderLinks(): Promise<DiskStatus> {
  return deskDisk().status();
}

async function collect(): Promise<Envelope | null> {
  return parseEnvelope(await deskDisk().readVault());
}

function savedMessage(status: DiskStatus): { inSync: boolean; message: string } {
  if (status.application && status.backup) return { inSync: true, message: "Both copies match." };
  if (!status.application && !status.backup) return { inSync: false, message: "The shared drive could not be updated." };
  const missed = status.application ? "the backup folder" : "the application folder";
  return { inSync: false, message: `Saved, but could not update ${missed}.` };
}

async function writeProfiles(data: DeskData): Promise<string | null> {
  if (!session) return null;
  for (const user of data.users) {
    const wrap = session.wraps[user.username];
    if (!wrap) continue;
    const json = JSON.stringify({
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      team: user.team,
      job: user.job,
      wrap,
      savedAt: new Date().toISOString(),
    });
    const status = await deskDisk().writeProfile(user.username, json);
    if (!status.application && !status.backup) return `${user.name}'s profile folder could not be saved.`;
  }
  return null;
}

async function writeSinks(json: string, data: DeskData | null): Promise<{ inSync: boolean; message: string }> {
  const status = await deskDisk().writeVault(json);
  latestJson = json;
  const report = savedMessage(status);
  if (!report.inSync && !status.application && !status.backup) return report;
  if (data) {
    const profileError = await writeProfiles(data);
    if (profileError) return { inSync: false, message: profileError };
  }
  return report;
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
  const disk = deskDisk();
  const status = await disk.status();
  if (disk.kind === "shared" && !status.application && !status.backup) {
    throw new Error("The shared drive is not available. The desk only saves to Y:\\accounts\\Tools\\Task application and Y:\\accounts\\Task app backup.");
  }
  const envelope = await collect();
  if (!envelope) await seedVault();
  return null;
}

async function seedVault() {
  const data = buildSeed();
  const master = await createMaster();
  const wraps: Record<string, Wrap> = {};
  wraps.__office__ = await wrapMaster(master, OFFICE_CODE);
  session = { master, wraps };
  const json = await seal(data);
  await writeSinks(json, data);
  session = null;
}

export async function unlock(username: string, password: string): Promise<Unlocked | { error: string }> {
  const envelope = await collect();
  if (!envelope) return { error: "The register could not be opened." };
  const name = username.trim().toLowerCase();
  const profile = parseProfile(await deskDisk().readProfile(name));
  const wrap = profile?.wrap ?? envelope.wraps[name];
  if (!wrap) return { error: "That username or password is not on the register." };
  const master = await unwrapMaster(password, wrap);
  if (!master) return { error: "That username or password is not on the register." };
  try {
    const data = await decryptData(master, envelope);
    const user = data.users.find((item) => item.username === name);
    if (!user) return { error: "That username or password is not on the register." };
    session = { master, wraps: { ...envelope.wraps, [name]: wrap } };
    lastSnapshot = JSON.stringify(data);
    return { user, data };
  } catch {
    return { error: "The register could not be read." };
  }
}

export function cleanUsername(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ".");
}

export function usernameError(username: string): string | null {
  if (!/^[a-z0-9.]{3,24}$/.test(username)) return "Use 3 to 24 letters, numbers or dots.";
  if (RESERVED_USERS.has(username)) return "That username is reserved.";
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

export function dropWrap(username: string) {
  if (!session) return;
  const wraps = { ...session.wraps };
  delete wraps[username];
  session = { ...session, wraps };
}

export function wrapFor(username: string): Wrap | undefined {
  return session?.wraps[username];
}

export function restoreWrap(username: string, wrap: Wrap) {
  if (!session) return;
  session = { ...session, wraps: { ...session.wraps, [username]: wrap } };
}

export async function deleteProfileFolders(username: string): Promise<string | null> {
  try {
    await deskDisk().deleteProfile(username);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "That profile folder could not be deleted.";
  }
}

export async function discardAttachment(id: string): Promise<void> {
  memoryBlobs.delete(id);
  try {
    await deskDisk().deleteAttachment(id);
  } catch {
    /* The task is already gone. A later save will not bring the file back. */
  }
}

async function blobGet(id: string): Promise<StoredBlob | null> {
  const cached = memoryBlobs.get(id);
  if (cached) return cached;
  const packed = await deskDisk().readAttachment(id);
  if (!packed) return null;
  const stored = unpackBlob(packed);
  if (stored) memoryBlobs.set(id, stored);
  return stored;
}

export async function storeFile(file: File): Promise<{ id: string } | { error: string }> {
  if (!session) return { error: "Sign in again before attaching a file." };
  if (file.size > 40 * 1024 * 1024) return { error: `${file.name} is over 40 MB.` };
  const id = crypto.randomUUID();
  const sealed = await encryptBlob(session.master, await file.arrayBuffer());
  try {
    const status = await deskDisk().writeAttachment(id, packBlob(sealed));
    if (!status.application && !status.backup) return { error: "That file could not be saved to the shared drive." };
  } catch {
    return { error: "That file could not be saved to the shared drive." };
  }
  memoryBlobs.set(id, sealed);
  return { id };
}

export async function readFile(id: string, name: string, mime: string): Promise<boolean> {
  if (!session) return false;
  const stored = await blobGet(id);
  if (!stored) return false;
  const plain = await decryptBlob(session.master, stored.iv, stored.data);
  if (window.trueDesk?.openFile) {
    await window.trueDesk.openFile(name, toB64(plain));
    return true;
  }
  const blob = new Blob([plain], { type: mime || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank", "noopener");
  if (!opened) {
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
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
  const text = await deskDisk().readRelease();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as { version?: string; notes?: string };
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

export async function linkFolder(_slot: Slot): Promise<string | null> {
  return "The desk already saves to the shared drive. Nothing is stored on this computer.";
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
  memoryBlobs.clear();
}

export function signOutVault() {
  session = null;
  lastSnapshot = "";
}
