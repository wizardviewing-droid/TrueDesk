import { format } from "date-fns";
import { create } from "zustand";
import { nextRepeatDate, nextWorkingDay, parseISODate, todayISO } from "@/lib/desk/dates";
import {
  addColleague,
  bootVault,
  changePassword,
  cleanUsername,
  deleteProfileFolders,
  discardAttachment,
  dropWrap,
  exportEnvelope,
  folderLinks,
  installDeskRelease,
  linkFolder,
  persist,
  readDeskRelease,
  readFile,
  readSharedDesk,
  registerAccount,
  resetPilot,
  restoreWrap,
  signOutVault,
  storeFile,
  unlock,
  usernameError,
  wrapFor,
  applySharedPaths,
  markPathsDirty,
  pathsAwaitingSave,
} from "@/lib/desk/storage";
import type {
  CustomMode,
  DeskData,
  DeskTool,
  Priority,
  Repeat,
  Role,
  Task,
  User,
  View,
} from "@/lib/desk/types";
import type { DeskRelease } from "@/lib/desk/storage";
import { taskRepeat } from "@/lib/desk/types";
import { buildWorkbook } from "@/lib/desk/workbook";
import { withStandardTools } from "@/lib/desk/seed";
import { downloadBytes, XLSX_MIME } from "@/lib/desk/tools-run";

export type SavePhase = "saved" | "saving" | "dirty" | "error";
export type Scope = "mine" | "team";

type State = {
  booted: boolean;
  bootError: string;
  user: User | null;
  data: DeskData | null;
  view: View;
  query: string;
  scope: Scope;
  editorId: string | null;
  toolId: string | null;
  phase: SavePhase;
  savedAt: string | null;
  saveMessage: string;
  inSync: boolean;
  links: { application: boolean; backup: boolean };
  toast: string | null;
  release: DeskRelease | null;
  checkRelease: () => Promise<void>;
  installRelease: () => Promise<void>;
  composer: {
    date: string;
    time: string;
    priority: Priority;
    repeat: Repeat;
    assigneeId: string;
  };
  setComposer: (patch: Partial<State["composer"]>) => void;
  boot: () => Promise<void>;
  signIn: (username: string, password: string) => Promise<string | null>;
  register: (input: {
    name: string;
    username: string;
    password: string;
    officeCode: string;
    job: string;
    team: string;
  }) => Promise<string | null>;
  signOut: () => Promise<void>;
  saveNow: () => Promise<void>;
  setView: (view: View) => void;
  setQuery: (query: string) => void;
  setScope: (scope: Scope) => void;
  setTool: (toolId: string | null) => void;
  openTask: (id: string | null) => void;
  showToast: (toast: string) => void;
  createTask: (partial?: Partial<Task>, open?: boolean) => string | null;
  updateTask: (id: string, patch: Partial<Task>) => void;
  assignTask: (id: string, assigneeId: string) => void;
  moveTask: (id: string, date: string) => void;
  moveOn: (id: string) => void;
  toggleDone: (id: string) => void;
  acceptTask: (id: string) => void;
  declineTask: (id: string, reason: string) => void;
  dismissNotice: (id: string) => void;
  removeTask: (id: string) => void;
  addNote: (taskId: string, body: string) => void;
  attachFiles: (taskId: string, files: File[], quiet?: boolean) => Promise<void>;
  addFilesAsTasks: (files: File[], date?: string) => Promise<void>;
  downloadAttachment: (id: string) => Promise<void>;
  setUserRole: (id: string, role: Role) => void;
  addUser: (input: {
    name: string;
    username: string;
    password: string;
    role: Role;
    job: string;
    team: string;
  }) => Promise<string | null>;
  removeUser: (id: string) => Promise<string | null>;
  updateOwnPassword: (password: string) => Promise<string | null>;
  togglePin: (id: string) => void;
  addCustomTool: (input: {
    name: string;
    description: string;
    mode: CustomMode;
    column: string;
    sumColumn?: string;
    days?: number;
  }) => void;
  removeTool: (id: string) => void;
  setLookupPath: (toolId: string, sourceId: string, path: string) => void;
  link: (slot: "application" | "backup") => Promise<string | null>;
  downloadExcel: () => void;
  downloadVault: () => Promise<void>;
  reset: () => Promise<void>;
};

let api: () => State = () => {
  throw new Error("Desk store is not ready.");
};

let chain: Promise<void> = Promise.resolve();
let timer = 0;
let toastTimer = 0;
let checkpoint = 0;
let bootStarted = false;
let hooked = false;

function enqueue(reason: "auto" | "manual" | "checkpoint" | "close"): Promise<void> {
  if (reason !== "auto") window.clearTimeout(timer);
  const run = chain.then(() => flush(reason));
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function pullPaths() {
  const state = api();
  if (!state.data || !state.user || state.phase === "saving" || pathsAwaitingSave()) return;
  const shared = await readSharedDesk();
  if (!shared) return;
  const latest = api().data;
  if (!latest || api().phase === "saving") return;
  const next = structuredClone(latest);
  if (!applySharedPaths(next, shared)) return;
  if (api().phase === "saving") return;
  useDesk.setState({ data: next });
}

function schedule() {
  api().phase;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    void enqueue("auto");
  }, 800);
}

async function flush(reason: "auto" | "manual" | "checkpoint" | "close") {
  const current = api();
  const data = current.data;
  const user = current.user;
  if (!data || !user) return;
  useDesk.setState({ phase: "saving" });
  const before = JSON.stringify(data);
  let report = await persist(data, reason);
  const latest = api().data;
  if (latest && JSON.stringify(latest) !== before) report = await persist(latest, reason);
  const links = await folderLinks().catch(() => api().links);
  useDesk.setState({
    phase: report.ok ? "saved" : "error",
    savedAt: report.savedAt ?? api().savedAt,
    saveMessage: report.message,
    inSync: report.inSync,
    links,
  });
}

function edit(mutator: (data: DeskData) => void) {
  const current = api().data;
  if (!current) return;
  const data = structuredClone(current);
  if (!data.notices) data.notices = [];
  mutator(data);
  data.activity = data.activity.slice(0, 200);
  data.notices = data.notices.slice(0, 100);
  useDesk.setState({ data, phase: "dirty" });
  schedule();
}

function log(data: DeskData, actorId: string, message: string, taskId?: string) {
  data.activity.unshift({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    actorId,
    message,
    taskId,
  });
}

function taskById(data: DeskData, id: string) {
  return data.tasks.find((task) => task.id === id);
}

function handOver(data: DeskData, task: Task, actor: User): "own" | "manager" | "ask" {
  if (!data.notices) data.notices = [];
  if (task.assigneeId === actor.id) {
    task.status = "accepted";
    task.managerAssigned = false;
    return "own";
  }
  if (actor.role === "manager") {
    task.status = "accepted";
    task.managerAssigned = true;
    task.returnNote = "";
    data.notices.unshift({
      id: crypto.randomUUID(),
      userId: task.assigneeId,
      taskId: task.id,
      message: `${actor.name} put “${task.title}” on your desk.`,
      at: new Date().toISOString(),
      read: false,
      kind: "desk",
    });
    return "manager";
  }
  task.status = "pending";
  task.managerAssigned = false;
  return "ask";
}

export const useDesk = create<State>((set, get) => {
  api = get;
  return {
    booted: false,
    bootError: "",
    user: null,
    data: null,
    view: "today",
    query: "",
    scope: "mine",
    editorId: null,
    toolId: "tool-ax",
    phase: "saved",
    savedAt: null,
    saveMessage: "Both copies match.",
    inSync: true,
    links: { application: false, backup: false },
    toast: null,
    release: null,
    composer: { date: todayISO(), time: "", priority: "normal", repeat: "once", assigneeId: "" },
    setComposer: (patch) => set({ composer: { ...get().composer, ...patch } }),
    boot: async () => {
      if (bootStarted) return;
      bootStarted = true;
      try {
        const restored = await bootVault();
        const links = await folderLinks();
        const data = restored ? withStandardTools(restored.data) : null;
        set({
          booted: true,
          user: restored?.user ?? null,
          data,
          links,
          phase: "saved",
        });
        if (restored && data && data !== restored.data) void enqueue("auto");
        if (!checkpoint) {
          checkpoint = window.setInterval(() => {
            if (api().data && api().user) void enqueue("checkpoint");
          }, 10 * 60 * 1000);
        }
        if (!hooked) {
          hooked = true;
          const hidden = () => {
            if (document.visibilityState === "hidden" && api().data && api().user) void enqueue("close");
          };
          window.addEventListener("pagehide", () => {
            if (api().data && api().user) void enqueue("close");
          });
          document.addEventListener("visibilitychange", hidden);
          window.setInterval(() => {
            void api().checkRelease();
            void pullPaths();
          }, 10 * 60 * 1000);
          window.setInterval(() => {
            void pullPaths();
          }, 20 * 1000);
          window.addEventListener("focus", () => {
            void api().checkRelease();
            void pullPaths();
          });
        }
        void get().checkRelease();
      } catch (error) {
        set({ booted: true, bootError: error instanceof Error ? error.message : "The desk could not be opened." });
      }
    },
    signIn: async (username, password) => {
      const result = await unlock(username, password);
      if ("error" in result) return result.error;
      const data = withStandardTools(result.data);
      set({ user: result.user, data, view: "today", editorId: null, phase: "saved" });
      if (data !== result.data) void enqueue("auto");
      void get().checkRelease();
      return null;
    },
    register: async (input) => {
      const result = await registerAccount(input);
      if ("error" in result) return result.error;
      const data = withStandardTools(result.data);
      set({ user: result.user, data, view: "today", editorId: null, phase: "saved" });
      if (data !== result.data) void enqueue("auto");
      void get().checkRelease();
      return null;
    },
    signOut: async () => {
      await enqueue("manual");
      signOutVault();
      set({ user: null, data: null, editorId: null, toast: null });
    },
    saveNow: async () => {
      await enqueue("manual");
      get().showToast("Saved to both copies.");
    },
    setView: (view) => set({ view }),
    setQuery: (query) => set({ query }),
    setScope: (scope) => set({ scope }),
    setTool: (toolId) => set({ toolId, view: "tools" }),
    openTask: (editorId) => set({ editorId }),
    showToast: (toast) => {
      set({ toast });
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => set({ toast: null }), 3600);
    },
    checkRelease: async () => {
      const release = await readDeskRelease().catch(() => null);
      set({ release });
    },
    installRelease: async () => {
      get().showToast("Updating the desk…");
      const error = await installDeskRelease();
      if (error) get().showToast(error);
    },
    createTask: (partial = {}, open = true) => {
      const user = get().user;
      if (!user) return null;
      const now = new Date().toISOString();
      const assigneeId = partial.assigneeId || user.id;
      const id = crypto.randomUUID();
      const task: Task = {
        id,
        title: partial.title?.trim() || "New task",
        matter: partial.matter ?? "",
        client: partial.client ?? "",
        practice: partial.practice || "Personal injury",
        priority: partial.priority || "normal",
        status: "accepted",
        date: partial.date ?? todayISO(),
        time: partial.time ?? "",
        ownerId: user.id,
        assigneeId,
        assignerId: user.id,
        managerAssigned: false,
        returnNote: "",
        createdAt: now,
        updatedAt: now,
        completedAt: "",
        repeat: partial.repeat && partial.repeat !== "once" ? partial.repeat : "once",
      };
      edit((data) => {
        data.tasks.unshift(task);
        const assignee = data.users.find((item) => item.id === assigneeId);
        const placed = handOver(data, task, user);
        const who = assignee?.name ?? "a colleague";
        log(
          data,
          user.id,
          placed === "own"
            ? `${user.name} added “${task.title}”.`
            : placed === "manager"
              ? `${user.name} put “${task.title}” on ${who}'s desk.`
              : `${user.name} asked ${who} to accept “${task.title}”.`,
          id,
        );
      });
      if (open) set({ editorId: id });
      return id;
    },
    updateTask: (id, patch) => {
      edit((data) => {
        const task = taskById(data, id);
        if (!task) return;
        Object.assign(task, patch, { updatedAt: new Date().toISOString() });
      });
    },
    assignTask: (id, assigneeId) => {
      const user = get().user;
      if (!user) return;
      let toast = "";
      edit((data) => {
        const task = taskById(data, id);
        const assignee = data.users.find((item) => item.id === assigneeId);
        if (!task || !assignee) return;
        task.assigneeId = assigneeId;
        task.assignerId = user.id;
        task.updatedAt = new Date().toISOString();
        task.completedAt = "";
        const placed = handOver(data, task, user);
        if (placed === "own") {
          log(data, user.id, `${user.name} kept “${task.title}” on their own desk.`, id);
          toast = "Kept on your desk.";
        } else if (placed === "manager") {
          log(data, user.id, `${user.name} put “${task.title}” on ${assignee.name}'s desk.`, id);
          toast = `On ${assignee.name}'s desk. They have been told.`;
        } else {
          log(data, user.id, `${user.name} asked ${assignee.name} to accept “${task.title}”.`, id);
          toast = `Asked ${assignee.name} to accept it.`;
        }
      });
      if (toast) get().showToast(toast);
    },
    moveTask: (id, date) => {
      const user = get().user;
      if (!user || !date) return;
      edit((data) => {
        const task = taskById(data, id);
        if (!task || task.date === date) return;
        task.date = date;
        task.updatedAt = new Date().toISOString();
        log(data, user.id, `${user.name} moved “${task.title}” on.`, id);
      });
    },
    moveOn: (id) => {
      const task = get().data?.tasks.find((item) => item.id === id);
      if (!task) return;
      const from = task.date || todayISO();
      get().moveTask(id, nextWorkingDay(from));
      get().showToast("Moved on to the next working day.");
    },
    toggleDone: (id) => {
      const user = get().user;
      if (!user) return;
      let toast = "";
      edit((data) => {
        const task = taskById(data, id);
        if (!task) return;
        const now = new Date().toISOString();
        const repeat = taskRepeat(task);
        if (task.status !== "done" && repeat !== "once") {
          const from = task.date || todayISO();
          const next = nextRepeatDate(from, repeat);
          data.tasks.unshift({
            ...task,
            id: crypto.randomUUID(),
            status: "done",
            repeat: "once",
            date: from,
            completedAt: now,
            updatedAt: now,
          });
          task.date = next;
          task.status = "accepted";
          task.completedAt = "";
          task.repeat = repeat;
          task.updatedAt = now;
          log(data, user.id, `${user.name} completed “${task.title}”. The next one is ${next}.`, id);
          toast = `Done. Next one is ${format(parseISODate(next), "EEE d MMM")}.`;
          return;
        }
        const done = task.status !== "done";
        task.status = done ? "done" : "accepted";
        task.completedAt = done ? now : "";
        task.updatedAt = now;
        log(data, user.id, `${user.name} marked “${task.title}” ${done ? "done" : "open"}.`, id);
      });
      if (toast) get().showToast(toast);
    },
    acceptTask: (id) => {
      const user = get().user;
      if (!user) return;
      edit((data) => {
        const task = taskById(data, id);
        if (!task) return;
        task.status = "accepted";
        task.returnNote = "";
        task.updatedAt = new Date().toISOString();
        log(data, user.id, `${user.name} accepted “${task.title}”.`, id);
      });
    },
    declineTask: (id, reason) => {
      const user = get().user;
      if (!user) return;
      edit((data) => {
        const task = taskById(data, id);
        if (!task) return;
        const backTo = task.assignerId;
        const note = reason.trim() || "No reason given.";
        task.returnNote = note;
        task.assigneeId = backTo;
        task.status = "accepted";
        task.managerAssigned = false;
        task.updatedAt = new Date().toISOString();
        data.notes.push({
          id: crypto.randomUUID(),
          taskId: id,
          authorId: user.id,
          body: `Declined: ${note}`,
          createdAt: new Date().toISOString(),
        });
        data.notices.unshift({
          id: crypto.randomUUID(),
          userId: backTo,
          taskId: id,
          message: `${user.name} rejected “${task.title}”. It is back on your desk.`,
          at: new Date().toISOString(),
          read: false,
          kind: "rejected",
        });
        log(data, user.id, `${user.name} rejected “${task.title}”.`, id);
      });
      get().showToast("Sent back.");
    },
    dismissNotice: (id) => {
      edit((data) => {
        const notice = data.notices.find((item) => item.id === id);
        if (notice) notice.read = true;
      });
    },
    removeTask: (id) => {
      const user = get().user;
      if (!user) return;
      const gone: string[] = [];
      edit((data) => {
        const task = taskById(data, id);
        if (!task) return;
        if (user.role !== "manager" && task.ownerId !== user.id && task.assigneeId !== user.id) return;
        gone.push(...data.attachments.filter((item) => item.taskId === id).map((item) => item.id));
        data.tasks = data.tasks.filter((item) => item.id !== id);
        data.notes = data.notes.filter((item) => item.taskId !== id);
        data.attachments = data.attachments.filter((item) => item.taskId !== id);
        log(data, user.id, `${user.name} removed “${task.title}”.`);
      });
      for (const fileId of gone) void discardAttachment(fileId);
      if (get().editorId === id) set({ editorId: null });
    },
    addNote: (taskId, body) => {
      const user = get().user;
      const text = body.trim();
      if (!user || !text) return;
      edit((data) => {
        data.notes.push({
          id: crypto.randomUUID(),
          taskId,
          authorId: user.id,
          body: text,
          createdAt: new Date().toISOString(),
        });
        const task = taskById(data, taskId);
        if (task) task.updatedAt = new Date().toISOString();
      });
    },
    attachFiles: async (taskId, files, quiet = false) => {
      const user = get().user;
      if (!user) return;
      let added = 0;
      for (const file of files) {
        const stored = await storeFile(file);
        if ("error" in stored) {
          get().showToast(stored.error);
          continue;
        }
        edit((data) => {
          data.attachments.push({
            id: stored.id,
            taskId,
            name: file.name,
            mime: file.type || "application/octet-stream",
            size: file.size,
            addedBy: user.id,
            addedAt: new Date().toISOString(),
          });
          const task = taskById(data, taskId);
          if (task) task.updatedAt = new Date().toISOString();
          log(data, user.id, `${user.name} attached ${file.name}.`, taskId);
        });
        added += 1;
      }
      if (added && !quiet) get().showToast(added === 1 ? "File added to the task." : `${added} files added.`);
    },
    addFilesAsTasks: async (files, date) => {
      const user = get().user;
      const composer = get().composer;
      if (!user || !files.length) return;
      const assigneeId = composer.assigneeId || user.id;
      let first: string | null = null;
      for (const file of files) {
        const title = file.name.replace(/\.[^.]+$/, "") || file.name;
        const id = get().createTask(
          {
            title,
            date: date || composer.date || todayISO(),
            time: composer.time,
            priority: composer.priority,
            repeat: composer.repeat,
            assigneeId,
          },
          false,
        );
        if (!id) continue;
        if (!first) first = id;
        await get().attachFiles(id, [file], true);
      }
      const assignee = get().data?.users.find((item) => item.id === assigneeId);
      const other = assigneeId !== user.id;
      const who = assignee?.name;
      if (first) set({ editorId: first });
      if (other) get().showToast(user.role === "manager" ? `On ${who ?? "their"} desk.` : `Sent to ${who ?? "them"} to accept.`);
      else if (files.length > 1) get().showToast(`${files.length} tasks added from files.`);
    },
    downloadAttachment: async (id) => {
      const file = get().data?.attachments.find((item) => item.id === id);
      if (!file) return;
      try {
        const opened = await readFile(file.id, file.name, file.mime);
        if (!opened) get().showToast("That file is not on this desk any more.");
      } catch (error) {
        get().showToast(error instanceof Error ? error.message : "That file could not be opened.");
      }
    },
    setUserRole: (id, role) => {
      const actor = get().user;
      if (!actor || actor.role !== "manager") return;
      edit((data) => {
        const person = data.users.find((item) => item.id === id);
        if (!person || person.role === role) return;
        person.role = role;
        log(data, actor.id, `${actor.name} set ${person.name} as ${role === "manager" ? "a manager" : "a normal user"}.`);
      });
    },
    addUser: async (input) => {
      const actor = get().user;
      const data = get().data;
      if (!actor || !data) return "Sign in again.";
      const result = await addColleague({ actor, data, ...input });
      if ("error" in result) return result.error;
      set({ data: result.data, phase: "dirty" });
      schedule();
      get().showToast(`${input.name.trim()} can sign in.`);
      return null;
    },
    removeUser: async (id) => {
      const actor = get().user;
      const data = get().data;
      if (!actor || !data) return "Sign in again.";
      if (actor.role !== "manager") return "Only a manager can delete a profile.";
      if (actor.id === id) return "You cannot delete the profile you are signed in with.";
      const person = data.users.find((item) => item.id === id);
      if (!person) return "That profile is not on the register.";
      if (person.role === "manager" && data.users.filter((item) => item.role === "manager").length <= 1) {
        return "Keep at least one manager.";
      }
      const next = structuredClone(data);
      const now = new Date().toISOString();
      next.users = next.users.filter((item) => item.id !== id);
      for (const task of next.tasks) {
        if (task.assigneeId === id) {
          task.assigneeId = actor.id;
          task.assignerId = actor.id;
          if (task.status !== "done") task.status = "accepted";
          task.managerAssigned = false;
          task.updatedAt = now;
        }
        if (task.ownerId === id) task.ownerId = actor.id;
      }
      next.notices = (next.notices ?? []).filter((notice) => notice.userId !== id);
      log(next, actor.id, `${actor.name} deleted ${person.name}'s profile.`);
      const wrap = wrapFor(person.username);
      dropWrap(person.username);
      set({ data: next, phase: "dirty" });
      await enqueue("manual");
      if (get().phase === "error") {
        if (wrap) restoreWrap(person.username, wrap);
        set({ data, phase: "error" });
        return "The shared drive could not be updated, so the profile was kept.";
      }
      const folderError = await deleteProfileFolders(person.username);
      if (folderError) return folderError;
      get().showToast(`${person.name}'s profile was deleted.`);
      return null;
    },
    updateOwnPassword: async (password) => {
      const user = get().user;
      const data = get().data;
      if (!user || !data) return "Sign in again.";
      const error = await changePassword(user.username, password);
      if (error) return error;
      schedule();
      get().showToast("Password updated. Both copies will save it.");
      return null;
    },
    togglePin: (id) => {
      edit((data) => {
        const tool = data.tools.find((item) => item.id === id);
        if (tool) tool.pinned = !tool.pinned;
      });
    },
    addCustomTool: (input) => {
      const user = get().user;
      if (!user || !input.name.trim() || !input.column.trim()) return;
      const tool: DeskTool = {
        id: crypto.randomUUID(),
        name: input.name.trim(),
        description: input.description.trim() || "A desk tool saved from the library.",
        kind: "custom",
        pinned: true,
        config: {
          mode: input.mode,
          column: input.column.trim(),
          sumColumn: input.sumColumn?.trim() || undefined,
          days: input.days,
        },
      };
      edit((data) => {
        data.tools.push(tool);
        log(data, user.id, `${user.name} added the ${tool.name} tool.`);
      });
      set({ toolId: tool.id, view: "tools" });
    },
    removeTool: (id) => {
      edit((data) => {
        data.tools = data.tools.filter((tool) => tool.id !== id || tool.kind !== "custom");
      });
    },
    setLookupPath: (toolId, sourceId, path) => {
      markPathsDirty();
      edit((data) => {
        const tool = data.tools.find((item) => item.id === toolId);
        if (!tool) return;
        const lookups = [...(tool.lookups ?? [])];
        const next = path.trim();
        const row = lookups.find((item) => item.id === sourceId);
        if (!next) {
          tool.lookups = lookups.filter((item) => item.id !== sourceId);
          return;
        }
        if (row) row.path = next;
        else lookups.push({ id: sourceId, path: next });
        tool.lookups = lookups;
      });
    },
    link: async (slot) => {
      const error = await linkFolder(slot);
      if (error) return error;
      await enqueue("manual");
      const links = await folderLinks();
      set({ links });
      if (slot === "application") void get().checkRelease();
      get().showToast(slot === "application" ? "Application folder linked." : "Backup folder linked.");
      return null;
    },
    downloadExcel: () => {
      const data = get().data;
      if (!data) return;
      downloadBytes(buildWorkbook(data), "TrueDesk.xlsx", XLSX_MIME);
    },
    downloadVault: async () => {
      await enqueue("manual");
      const json = exportEnvelope();
      if (!json) return;
      downloadBytes(new TextEncoder().encode(json), "TrueDesk.vault.json", "application/json");
    },
    reset: async () => {
      await resetPilot();
      set({ user: null, data: null, editorId: null, phase: "saved", links: { application: false, backup: false } });
    },
  };
});

export function matchesQuery(task: Task, notes: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [task.title, task.matter, task.client, task.practice, notes].join(" ").toLowerCase().includes(q);
}

export function cleanUser(value: string): string {
  return cleanUsername(value);
}

export function userNameError(value: string): string | null {
  return usernameError(value);
}

export function priorityRank(priority: Priority): number {
  if (priority === "high") return 0;
  if (priority === "normal") return 1;
  return 2;
}
