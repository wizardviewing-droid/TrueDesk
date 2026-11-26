import * as XLSX from "xlsx";
import type {
  Activity,
  Attachment,
  CustomMode,
  DeskData,
  DeskTool,
  Note,
  Notice,
  Priority,
  Role,
  Task,
  TaskStatus,
  ToolKind,
  ToolLookup,
  User,
  Repeat,
} from "@/lib/desk/types";

const TASK_HEADERS = [
  "id",
  "title",
  "matter",
  "client",
  "practice",
  "priority",
  "status",
  "date",
  "time",
  "ownerId",
  "assigneeId",
  "assignerId",
  "managerAssigned",
  "returnNote",
  "createdAt",
  "updatedAt",
  "completedAt",
  "repeat",
] as const;

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function sheetRows(wb: XLSX.WorkBook, name: string): Record<string, unknown>[] {
  const sheet = wb.Sheets[name];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
}

function toolPayload(tool: DeskTool): string {
  const payload: Record<string, unknown> = {};
  if (tool.config) Object.assign(payload, tool.config);
  if (tool.lookups?.length) payload.lookups = tool.lookups;
  return Object.keys(payload).length ? JSON.stringify(payload) : "";
}

function addSheet(wb: XLSX.WorkBook, name: string, rows: Record<string, unknown>[], header: string[]) {
  const sheet = XLSX.utils.json_to_sheet(rows, { header });
  sheet["!cols"] = header.map((key) => ({ wch: Math.min(42, Math.max(12, key.length + 8)) }));
  XLSX.utils.book_append_sheet(wb, sheet, name);
}

const PRIORITIES = new Set<Priority>(["high", "normal", "low"]);
const STATUSES = new Set<TaskStatus>(["pending", "accepted", "done"]);
const KINDS = new Set<ToolKind>(["limitation", "time", "bundle", "disbursement", "cleaner", "ax", "infotrack", "kindertons", "custom"]);
const REPEATS = new Set<Repeat>(["once", "daily", "weekly", "monthly", "annual"]);
const MODES = new Set<CustomMode>(["sum-by", "add-days", "dedupe"]);

export function buildWorkbook(data: DeskData): Uint8Array {
  const wb = XLSX.utils.book_new();
  addSheet(
    wb,
    "Users",
    data.users.map((user) => ({ ...user })),
    ["id", "username", "name", "role", "team", "job"],
  );
  addSheet(
    wb,
    "Tasks",
    data.tasks.map((task) => ({
      ...task,
      repeat: task.repeat || "once",
      managerAssigned: task.managerAssigned ? "yes" : "",
    })),
    [...TASK_HEADERS],
  );
  addSheet(
    wb,
    "Notes",
    data.notes.map((note) => ({ ...note })),
    ["id", "taskId", "authorId", "body", "createdAt"],
  );
  addSheet(
    wb,
    "Files",
    data.attachments.map((file) => ({ ...file })),
    ["id", "taskId", "name", "mime", "size", "addedBy", "addedAt"],
  );
  addSheet(
    wb,
    "Tools",
    data.tools.map((tool) => ({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      kind: tool.kind,
      pinned: tool.pinned ? "yes" : "",
      configJson: toolPayload(tool),
    })),
    ["id", "name", "description", "kind", "pinned", "configJson"],
  );
  addSheet(
    wb,
    "Activity",
    data.activity.map((item) => ({
      id: item.id,
      at: item.at,
      actorId: item.actorId,
      message: item.message,
      taskId: item.taskId ?? "",
    })),
    ["id", "at", "actorId", "message", "taskId"],
  );
  addSheet(
    wb,
    "Notices",
    (data.notices ?? []).map((item) => ({
      id: item.id,
      userId: item.userId,
      taskId: item.taskId ?? "",
      message: item.message,
      at: item.at,
      read: item.read ? "yes" : "",
      kind: item.kind === "desk" ? "desk" : "rejected",
    })),
    ["id", "userId", "taskId", "message", "at", "read", "kind"],
  );
  addSheet(
    wb,
    "Meta",
    [
      { key: "product", value: "True Desk" },
      { key: "firm", value: "True Solicitors LLP" },
      { key: "savedAt", value: new Date().toISOString() },
    ],
    ["key", "value"],
  );
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new Uint8Array(out);
}

export function parseWorkbook(bytes: ArrayBuffer | Uint8Array): DeskData {
  const wb = XLSX.read(bytes, { type: "array" });
  const users: User[] = sheetRows(wb, "Users")
    .map((row) => {
      const role: Role = text(row.role) === "manager" ? "manager" : "user";
      return {
        id: text(row.id),
        username: text(row.username).toLowerCase(),
        name: text(row.name),
        role,
        team: text(row.team),
        job: text(row.job),
      };
    })
    .filter((user) => user.id && user.username);

  const tasks: Task[] = sheetRows(wb, "Tasks")
    .map((row) => {
      const priority = text(row.priority) as Priority;
      const status = text(row.status) as TaskStatus;
      const repeat = text(row.repeat) as Repeat;
      return {
        id: text(row.id),
        title: text(row.title),
        matter: text(row.matter),
        client: text(row.client),
        practice: text(row.practice) || "Personal injury",
        priority: PRIORITIES.has(priority) ? priority : "normal",
        status: STATUSES.has(status) ? status : "accepted",
        date: text(row.date),
        time: text(row.time),
        ownerId: text(row.ownerId),
        assigneeId: text(row.assigneeId),
        assignerId: text(row.assignerId),
        managerAssigned: text(row.managerAssigned) === "yes",
        returnNote: text(row.returnNote),
        createdAt: text(row.createdAt),
        updatedAt: text(row.updatedAt),
        completedAt: text(row.completedAt),
        repeat: REPEATS.has(repeat) ? repeat : "once",
      };
    })
    .filter((task) => task.id && task.title);

  const notes: Note[] = sheetRows(wb, "Notes")
    .map((row) => ({
      id: text(row.id),
      taskId: text(row.taskId),
      authorId: text(row.authorId),
      body: text(row.body),
      createdAt: text(row.createdAt),
    }))
    .filter((note) => note.id && note.taskId && note.body);

  const attachments: Attachment[] = sheetRows(wb, "Files")
    .map((row) => ({
      id: text(row.id),
      taskId: text(row.taskId),
      name: text(row.name),
      mime: text(row.mime) || "application/octet-stream",
      size: Number(row.size) || 0,
      addedBy: text(row.addedBy),
      addedAt: text(row.addedAt),
    }))
    .filter((file) => file.id && file.taskId && file.name);

  const tools: DeskTool[] = sheetRows(wb, "Tools")
    .map((row) => {
      const kind = text(row.kind) as ToolKind;
      let config: DeskTool["config"];
      let lookups: ToolLookup[] | undefined;
      const raw = text(row.configJson);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as DeskTool["config"] & { lookups?: ToolLookup[] };
          if (parsed?.mode && MODES.has(parsed.mode) && parsed.column) {
            config = { mode: parsed.mode, column: parsed.column, sumColumn: parsed.sumColumn, days: parsed.days };
          }
          if (Array.isArray(parsed?.lookups)) {
            lookups = parsed.lookups
              .filter((item) => item && item.id && typeof item.path === "string")
              .map((item) => ({ id: String(item.id), path: String(item.path) }));
          }
        } catch {
          config = undefined;
        }
      }
      return {
        id: text(row.id),
        name: text(row.name),
        description: text(row.description),
        kind: KINDS.has(kind) ? kind : "custom",
        pinned: text(row.pinned) === "yes",
        lookups: lookups?.length ? lookups : undefined,
        config,
      };
    })
    .filter((tool) => tool.id && tool.name);

  const activity: Activity[] = sheetRows(wb, "Activity")
    .map((row) => ({
      id: text(row.id),
      at: text(row.at),
      actorId: text(row.actorId),
      message: text(row.message),
      taskId: text(row.taskId) || undefined,
    }))
    .filter((item) => item.id && item.message);

  const notices: Notice[] = sheetRows(wb, "Notices")
    .map((row) => ({
      id: text(row.id),
      userId: text(row.userId),
      taskId: text(row.taskId) || undefined,
      message: text(row.message),
      at: text(row.at),
      read: text(row.read) === "yes",
      kind: text(row.kind) === "desk" ? ("desk" as const) : ("rejected" as const),
    }))
    .filter((item) => item.id && item.userId && item.message);

  return { users, tasks, notes, attachments, tools, activity, notices };
}
