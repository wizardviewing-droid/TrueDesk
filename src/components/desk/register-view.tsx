import { format } from "date-fns";
import { useEffect, useState } from "react";
import { cx } from "@/lib/cx";
import { parseISODate } from "@/lib/desk/dates";
import { matchesQuery, useDesk } from "@/lib/desk/store";
import { assigneeLabel, repeatLabel, seesTeamTask, statusLabel, taskRepeat, type Priority, type Repeat, type SheetName, type Task, type TaskStatus } from "@/lib/desk/types";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const TASK_COLUMNS: { key: string; title: string; kind: string }[] = [
  { key: "done", title: "Done", kind: "done" },
  { key: "title", title: "Task", kind: "text" },
  { key: "priority", title: "Priority", kind: "priority" },
  { key: "date", title: "Date", kind: "date" },
  { key: "time", title: "Time", kind: "time" },
  { key: "repeat", title: "Repeats", kind: "repeat" },
  { key: "assignee", title: "Assignee", kind: "assignee" },
  { key: "status", title: "Status", kind: "status" },
  { key: "files", title: "Files", kind: "files" },
];

export function RegisterView() {
  const data = useDesk((s) => s.data);
  const user = useDesk((s) => s.user);
  const query = useDesk((s) => s.query);
  const scope = useDesk((s) => s.scope);
  const setScope = useDesk((s) => s.setScope);
  const updateTask = useDesk((s) => s.updateTask);
  const assignTask = useDesk((s) => s.assignTask);
  const moveTask = useDesk((s) => s.moveTask);
  const toggleDone = useDesk((s) => s.toggleDone);
  const openTask = useDesk((s) => s.openTask);
  const [sheet, setSheet] = useState<SheetName>("tasks");
  const [sel, setSel] = useState({ r: 0, c: 1 });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (!data || !user) return null;
  const tasks = data.tasks
    .filter((task) => {
      if (scope === "mine" && task.assigneeId !== user.id && task.assignerId !== user.id) return false;
      if (scope === "team" && task.assigneeId.startsWith("group:") && !seesTeamTask(task.assigneeId, user.role)) return false;
      const notes = data.notes.filter((note) => note.taskId === task.id).map((note) => note.body).join(" ");
      return matchesQuery(task, notes, query);
    })
    .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || (a.time || "").localeCompare(b.time || ""));

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h1 className="text-xl font-semibold text-navy">Register</h1>
          <p className="text-sm text-muted">The Excel workbook behind the desk. Double-click a cell to edit.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={scope === "mine" ? "btn btn-navy" : "btn btn-ghost"} onClick={() => setScope("mine")}>Mine</button>
          <button type="button" className={scope === "team" ? "btn btn-navy" : "btn btn-ghost"} onClick={() => setScope("team")}>Team</button>
        </div>
      </div>
      {sheet === "tasks" ? (
        <TaskGrid
          tasks={tasks}
          users={data.users}
          fileCount={(id) => data.attachments.filter((file) => file.taskId === id).length}
          sel={sel}
          setSel={setSel}
          editing={editing}
          setEditing={setEditing}
          draft={draft}
          setDraft={setDraft}
          onUpdate={updateTask}
          onAssign={assignTask}
          onMove={moveTask}
          onDone={toggleDone}
          onOpen={openTask}
        />
      ) : null}
      {sheet === "diary" ? <DiarySheet tasks={tasks} users={data.users} onOpen={openTask} /> : null}
      {sheet === "activity" ? <ActivitySheet activity={data.activity} users={data.users} /> : null}
      <div className="flex gap-1 border-t border-line bg-paper px-2 py-2">
        {([
          ["tasks", "Tasks"],
          ["diary", "Diary"],
          ["activity", "Activity"],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" className={cx("btn", sheet === id ? "btn-navy" : "btn-ghost")} onClick={() => setSheet(id)}>
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}

function cellValue(task: Task, key: string, users: { id: string; name: string }[], files: number): string {
  if (key === "done") return task.status === "done" ? "Yes" : "";
  if (key === "assignee") return assigneeLabel(task.assigneeId, users);
  if (key === "status") return statusLabel(task.status);
  if (key === "files") return files ? String(files) : "";
  if (key === "repeat") return taskRepeat(task);
  const value = task[key as keyof Task];
  return typeof value === "string" ? value : "";
}

function TaskGrid({
  tasks,
  users,
  fileCount,
  sel,
  setSel,
  editing,
  setEditing,
  draft,
  setDraft,
  onUpdate,
  onAssign,
  onMove,
  onDone,
  onOpen,
}: {
  tasks: Task[];
  users: { id: string; name: string }[];
  fileCount: (id: string) => number;
  sel: { r: number; c: number };
  setSel: (sel: { r: number; c: number }) => void;
  editing: boolean;
  setEditing: (value: boolean) => void;
  draft: string;
  setDraft: (value: string) => void;
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onAssign: (id: string, assigneeId: string) => void;
  onMove: (id: string, date: string) => void;
  onDone: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const task = tasks[sel.r];
  const column = TASK_COLUMNS[sel.c];
  const shown = task && column ? cellValue(task, column.key, users, fileCount(task.id)) : "";

  useEffect(() => {
    if (!editing) setDraft(shown);
  }, [shown, editing, setDraft]);

  function commit(value: string) {
    if (!task || !column) return;
    setEditing(false);
    if (column.kind === "assignee") {
      const match = users.find((user) => user.name === value || user.id === value);
      if (match) onAssign(task.id, match.id);
      return;
    }
    if (column.kind === "date") {
      onMove(task.id, value);
      return;
    }
    if (column.kind === "priority") onUpdate(task.id, { priority: value as Priority });
    else if (column.kind === "repeat") onUpdate(task.id, { repeat: value as Repeat });
    else if (column.kind === "status") onUpdate(task.id, { status: value as TaskStatus });
    else if (column.key === "title" || column.key === "time") {
      onUpdate(task.id, { [column.key]: value });
    }
  }

  function move(dr: number, dc: number) {
    setEditing(false);
    setSel({
      r: Math.max(0, Math.min(tasks.length - 1, sel.r + dr)),
      c: Math.max(0, Math.min(TASK_COLUMNS.length - 1, sel.c + dc)),
    });
  }

  return (
    <div
      className="overflow-auto"
      tabIndex={0}
      onKeyDown={(event) => {
        if (!tasks.length) return;
        if (editing) {
          if (event.key === "Escape") setEditing(false);
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          if (column?.kind === "files" || column?.kind === "done") onOpen(task.id);
          else {
            setDraft(shown);
            setEditing(true);
          }
        } else if (event.key === "ArrowDown") move(1, 0);
        else if (event.key === "ArrowUp") move(-1, 0);
        else if (event.key === "ArrowRight") move(0, 1);
        else if (event.key === "ArrowLeft") move(0, -1);
      }}
    >
      <div className="flex items-center gap-2 border-b border-line bg-paper px-3 py-2">
        <span className="w-16 text-xs font-semibold text-muted tabular-nums">
          {column ? `${LETTERS[sel.c + 1]}${sel.r + 1}` : ""}
        </span>
        <span className="text-xs font-semibold text-gold">fx</span>
        <span className="truncate text-sm">{editing ? draft : shown}</span>
      </div>
      <div className="sheet-head">
        <div className="cell cell-head justify-center">#</div>
        {TASK_COLUMNS.map((item, index) => (
          <div key={item.key} className="cell cell-head">{LETTERS[index + 1]} · {item.title}</div>
        ))}
      </div>
      {tasks.length === 0 ? <p className="px-4 py-8 text-muted">No tasks in this view.</p> : tasks.map((item, row) => (
        <div key={item.id} className="sheet-row">
          <div className="cell cell-head justify-center">{row + 1}</div>
          {TASK_COLUMNS.map((itemColumn, col) => {
            const selected = sel.r === row && sel.c === col;
            const value = cellValue(item, itemColumn.key, users, fileCount(item.id));
            return (
              <div
                key={itemColumn.key}
                className={cx("cell", selected && "is-selected", item.status === "done" && "text-muted")}
                onClick={() => {
                  setSel({ r: row, c: col });
                  setEditing(false);
                  if (itemColumn.kind === "done") onDone(item.id);
                }}
                onDoubleClick={() => {
                  setSel({ r: row, c: col });
                  if (itemColumn.kind === "files" || itemColumn.kind === "done") onOpen(item.id);
                  else {
                    setDraft(value);
                    setEditing(true);
                  }
                }}
              >
                {selected && editing && itemColumn.kind !== "done" && itemColumn.kind !== "files" ? (
                  <Editor column={itemColumn.kind} value={draft} users={users} onChange={setDraft} onCommit={commit} />
                ) : itemColumn.kind === "done" ? (
                  <span className={cx("grid size-4 place-items-center rounded-sm border", item.status === "done" ? "border-navy bg-navy text-paper" : "border-line")}>
                    {item.status === "done" ? "✓" : ""}
                  </span>
                ) : (
                  <span className="truncate">{itemColumn.kind === "repeat" ? repeatLabel(taskRepeat(item)) : value}</span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Editor({
  column,
  value,
  users,
  onChange,
  onCommit,
}: {
  column: string;
  value: string;
  users: { id: string; name: string }[];
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
}) {
  const className = "w-full bg-transparent outline-none";
  if (column === "repeat") {
    return (
      <select className={className} value={value} autoFocus onChange={(event) => onCommit(event.target.value)}>
        <option value="once">One-off</option>
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
        <option value="annual">Annual</option>
      </select>
    );
  }
  if (column === "priority") {
    return (
      <select className={className} value={value} autoFocus onChange={(event) => onCommit(event.target.value)} onBlur={(event) => onCommit(event.target.value)}>
        <option value="high">high</option>
        <option value="normal">normal</option>
        <option value="low">low</option>
      </select>
    );
  }
  if (column === "assignee") {
    return (
      <select className={className} value={users.find((user) => user.name === value)?.id ?? ""} autoFocus onChange={(event) => onCommit(event.target.value)}>
        {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
      </select>
    );
  }
  if (column === "status") {
    return (
      <select className={className} value={value === "To accept" ? "pending" : value === "Done" ? "done" : "accepted"} autoFocus onChange={(event) => onCommit(event.target.value)}>
        <option value="pending">pending</option>
        <option value="accepted">accepted</option>
        <option value="done">done</option>
      </select>
    );
  }
  return (
    <input
      className={className}
      autoFocus
      type={column === "date" ? "date" : column === "time" ? "time" : "text"}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={(event) => onCommit(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onCommit((event.target as HTMLInputElement).value);
        event.stopPropagation();
      }}
    />
  );
}

function DiarySheet({ tasks, users, onOpen }: { tasks: Task[]; users: { id: string; name: string }[]; onOpen: (id: string) => void }) {
  const rows = [...tasks].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  return (
    <div className="overflow-auto">
      <div className="diary-head">
        {["Date", "Time", "Task", "Matter", "Assignee", "Status"].map((title) => <div key={title} className="cell cell-head">{title}</div>)}
      </div>
      {rows.map((task) => (
        <button key={task.id} type="button" className="diary-row w-full text-left" onClick={() => onOpen(task.id)}>
          <span className="cell">{task.date ? format(parseISODate(task.date), "d MMM yyyy") : ""}</span>
          <span className="cell">{task.time}</span>
          <span className="cell">{task.title}</span>
          <span className="cell">{task.matter}</span>
          <span className="cell">{assigneeLabel(task.assigneeId, users)}</span>
          <span className="cell">{statusLabel(task.status)}</span>
        </button>
      ))}
    </div>
  );
}

function ActivitySheet({ activity, users }: { activity: { id: string; at: string; actorId: string; message: string }[]; users: { id: string; name: string }[] }) {
  return (
    <div className="overflow-auto">
      <div className="log-head">
        {["When", "Who", "What happened"].map((title) => <div key={title} className="cell cell-head">{title}</div>)}
      </div>
      {activity.map((item) => (
        <div key={item.id} className="log-row">
          <span className="cell">{format(new Date(item.at), "d MMM yyyy HH:mm")}</span>
          <span className="cell">{users.find((user) => user.id === item.actorId)?.name}</span>
          <span className="cell">{item.message}</span>
        </div>
      ))}
    </div>
  );
}
