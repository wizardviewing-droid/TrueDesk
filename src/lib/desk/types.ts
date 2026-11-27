export type Role = "manager" | "office" | "client" | "user";
export type Priority = "high" | "normal" | "low";
export type Repeat = "once" | "daily" | "weekly" | "monthly" | "annual";
export type TaskStatus = "pending" | "accepted" | "done";
export type Remind = 0 | 5 | 10 | 15 | 30;
export type ToolKind =
  | "limitation"
  | "time"
  | "bundle"
  | "disbursement"
  | "cleaner"
  | "ax"
  | "infotrack"
  | "kindertons"
  | "custom";
export type CustomMode = "sum-by" | "add-days" | "dedupe";
export type View = "today" | "calendar" | "register" | "tools" | "people";
export type SheetName = "tasks" | "diary" | "activity";

export const PRACTICES = [
  "Personal injury",
  "Clinical negligence",
  "Housing disrepair",
  "Conveyancing",
  "Credit hire",
  "Internal",
] as const;

export type DiskStatus = { application: boolean; backup: boolean };

export const PATHS = {
  application: "Y:\\accounts\\Tools\\Task application",
  backup: "Y:\\accounts\\Task app backup",
  update: "Y:\\accounts\\Tools\\Task application\\update",
} as const;

export const VAULT_FILE = "TrueDesk.vault.json";

export type User = {
  id: string;
  username: string;
  name: string;
  role: Role;
  team: string;
  job: string;
};

export type Task = {
  id: string;
  title: string;
  matter: string;
  client: string;
  practice: string;
  priority: Priority;
  status: TaskStatus;
  date: string;
  time: string;
  ownerId: string;
  assigneeId: string;
  assignerId: string;
  managerAssigned: boolean;
  returnNote: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string;
  repeat?: Repeat;
  remind?: Remind;
};

export type Note = {
  id: string;
  taskId: string;
  authorId: string;
  body: string;
  createdAt: string;
};

export type Attachment = {
  id: string;
  taskId: string;
  name: string;
  mime: string;
  size: number;
  addedBy: string;
  addedAt: string;
};

export type ToolLookup = {
  id: string;
  path: string;
};

export type DeskTool = {
  id: string;
  name: string;
  description: string;
  kind: ToolKind;
  pinned: boolean;
  lookups?: ToolLookup[];
  config?: {
    mode: CustomMode;
    column: string;
    sumColumn?: string;
    days?: number;
  };
};

export type Activity = {
  id: string;
  at: string;
  actorId: string;
  message: string;
  taskId?: string;
};

export type Notice = {
  id: string;
  userId: string;
  taskId?: string;
  message: string;
  at: string;
  read: boolean;
  kind?: "desk" | "rejected";
};

export type DeskData = {
  users: User[];
  tasks: Task[];
  notes: Note[];
  attachments: Attachment[];
  tools: DeskTool[];
  activity: Activity[];
  notices: Notice[];
};

export function statusLabel(status: TaskStatus): string {
  if (status === "pending") return "To accept";
  if (status === "done") return "Done";
  return "On the desk";
}

export function roleLabel(role: Role): string {
  if (role === "manager") return "Manager";
  if (role === "office") return "Office team";
  if (role === "client") return "Client team";
  return "Not set";
}

export const ASSIGN_GROUPS = [
  { id: "group:client", label: "Client team" },
  { id: "group:office", label: "Office team" },
  { id: "group:manager", label: "Manager" },
] as const;

export function isAssignGroup(id: string): boolean {
  return ASSIGN_GROUPS.some((group) => group.id === id);
}

export function groupRole(id: string): "manager" | "office" | "client" | null {
  if (id === "group:manager") return "manager";
  if (id === "group:office") return "office";
  if (id === "group:client") return "client";
  return null;
}

export function remindMinutes(value: unknown): Remind {
  const minutes = Number(value);
  if (minutes === 5 || minutes === 10 || minutes === 15 || minutes === 30) return minutes;
  return 0;
}

export function taskRepeat(task: { repeat?: Repeat }): Repeat {
  if (task.repeat === "daily" || task.repeat === "weekly" || task.repeat === "monthly" || task.repeat === "annual") return task.repeat;
  return "once";
}

export function repeatLabel(repeat: Repeat | undefined): string {
  if (repeat === "daily") return "Daily";
  if (repeat === "weekly") return "Weekly";
  if (repeat === "monthly") return "Monthly";
  if (repeat === "annual") return "Annual";
  return "One-off";
}
