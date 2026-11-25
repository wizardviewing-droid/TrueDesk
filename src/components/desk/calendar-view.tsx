import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { cx } from "@/lib/cx";
import { TaskActions } from "@/components/desk/task-actions";
import { parseISODate, todayISO, toISODate } from "@/lib/desk/dates";
import { matchesQuery, useDesk } from "@/lib/desk/store";

export function CalendarView() {
  const data = useDesk((s) => s.data);
  const user = useDesk((s) => s.user);
  const query = useDesk((s) => s.query);
  const scope = useDesk((s) => s.scope);
  const setScope = useDesk((s) => s.setScope);
  const moveTask = useDesk((s) => s.moveTask);
  const openTask = useDesk((s) => s.openTask);
  const downloadAttachment = useDesk((s) => s.downloadAttachment);
  const createTask = useDesk((s) => s.createTask);
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(todayISO());
  const days = useMemo(() => {
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const grid = new Date(start);
    grid.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(grid);
      day.setDate(grid.getDate() + index);
      return day;
    });
  }, [cursor]);

  if (!data || !user) return null;
  const today = todayISO();
  const tasks = data.tasks.filter((task) => {
    if (!task.date) return false;
    if (scope === "mine" && task.assigneeId !== user.id) return false;
    const notes = data.notes.filter((note) => note.taskId === task.id).map((note) => note.body).join(" ");
    return matchesQuery(task, notes, query);
  });
  const selectedTasks = tasks.filter((task) => task.date === selected).sort((a, b) => (a.time || "").localeCompare(b.time || ""));

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <section className="card overflow-hidden lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-ghost min-w-11 px-3" aria-label="Previous month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <h1 className="min-w-40 text-center text-xl font-semibold text-navy">{format(cursor, "MMMM yyyy")}</h1>
            <button type="button" className="btn btn-ghost min-w-11 px-3" aria-label="Next month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-quiet" onClick={() => { const now = new Date(); setCursor(now); setSelected(todayISO()); }}>
              Today
            </button>
            <button type="button" className={scope === "mine" ? "btn btn-navy" : "btn btn-ghost"} onClick={() => setScope("mine")}>Mine</button>
            <button type="button" className={scope === "team" ? "btn btn-navy" : "btn btn-ghost"} onClick={() => setScope("team")}>Team</button>
          </div>
        </div>
        <div className="grid grid-cols-7 border-b border-line bg-paper text-center text-xs font-semibold tracking-wide text-muted uppercase">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
            <div key={day} className="px-1 py-2">{day}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const iso = toISODate(day);
            const inMonth = day.getMonth() === cursor.getMonth();
            const items = tasks.filter((task) => task.date === iso);
            return (
              <div
                key={iso}
                data-drop-date={iso}
                className={cx(
                  "cal-cell border-r border-b border-line p-1 text-left",
                  !inMonth && "bg-paper",
                  selected === iso && "bg-gold/25",
                )}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  const id = event.dataTransfer.getData("application/x-truedesk-task");
                  if (!id) return;
                  event.preventDefault();
                  event.stopPropagation();
                  moveTask(id, iso);
                  setSelected(iso);
                }}
              >
                <button type="button" className="flex min-h-11 w-full items-center px-1" onClick={() => setSelected(iso)}>
                  <span className={cx("grid size-7 place-items-center rounded-full text-sm tabular-nums", iso === today && "bg-navy text-paper")}>
                    {day.getDate()}
                  </span>
                </button>
                <div className="mt-1 hidden flex-col gap-1 md:flex">
                  {items.slice(0, 3).map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("application/x-truedesk-task", task.id);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      onClick={() => openTask(task.id)}
                      className="truncate rounded-sm bg-paper px-1 py-0.5 text-left text-xs text-navy"
                    >
                      {task.time ? `${task.time} ` : ""}
                      {task.title}
                    </button>
                  ))}
                  {items.length > 3 ? <span className="px-1 text-xs text-muted">+{items.length - 3}</span> : null}
                </div>
                {items.length ? (
                  <span className="mt-1 flex justify-center gap-1 md:hidden">
                    {items.slice(0, 3).map((task) => <span key={task.id} className="size-1.5 rounded-full bg-navy" />)}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
      <section className="card h-fit overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="font-semibold text-navy">{format(parseISODate(selected), "EEEE d MMMM")}</h2>
          <button type="button" className="btn btn-gold" onClick={() => createTask({ date: selected, title: "New task" })}>
            <Plus className="size-4" aria-hidden="true" />
            Add
          </button>
        </div>
        {selectedTasks.length === 0 ? (
          <p className="px-4 py-8 text-sm text-muted">Nothing on this day. Drop a file on the date, or add a task.</p>
        ) : (
          <ul>
            {selectedTasks.map((task) => {
              const files = data.attachments.filter((file) => file.taskId === task.id);
              return (
              <li key={task.id} className="border-b border-line px-4 py-3 last:border-b-0">
                <button type="button" className="w-full text-left" onClick={() => openTask(task.id)}>
                  <span className="block font-medium">{task.title}</span>
                  <span className="text-sm text-muted">
                    {task.time || "Any time"} · {data.users.find((person) => person.id === task.assigneeId)?.name}
                    {files.length ? ` · ${files.length} attached` : ""}
                  </span>
                </button>
                {files.map((file) => (
                  <button key={file.id} type="button" className="mt-2 flex min-h-9 w-full items-center gap-2 rounded-md bg-paper px-2 text-left text-sm font-medium" onClick={() => void downloadAttachment(file.id)}>
                    {file.name}
                    <span className="ml-auto text-xs text-muted">Open</span>
                  </button>
                ))}
                <TaskActions taskId={task.id} />
              </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
