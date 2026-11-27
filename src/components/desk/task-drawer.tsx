import { format } from "date-fns";
import { Paperclip, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { parseISODate } from "@/lib/desk/dates";
import { TaskActions } from "@/components/desk/task-actions";
import { useDesk } from "@/lib/desk/store";
import { ASSIGN_GROUPS, groupRole, remindMinutes, repeatLabel, roleLabel, taskRepeat, type Priority, type Remind, type Repeat } from "@/lib/desk/types";

export function TaskDrawer() {
  const data = useDesk((s) => s.data);
  const user = useDesk((s) => s.user);
  const editorId = useDesk((s) => s.editorId);
  const openTask = useDesk((s) => s.openTask);
  const updateTask = useDesk((s) => s.updateTask);
  const assignTask = useDesk((s) => s.assignTask);
  const moveTask = useDesk((s) => s.moveTask);
  const addNote = useDesk((s) => s.addNote);
  const downloadAttachment = useDesk((s) => s.downloadAttachment);
  const attachFiles = useDesk((s) => s.attachFiles);
  const task = data?.tasks.find((item) => item.id === editorId);
  const [note, setNote] = useState("");
  const [choice, setChoice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (task) setChoice(task.assigneeId);
  }, [task?.assigneeId]);
  if (!data || !user || !editorId || !task) return null;
  const notes = data.notes.filter((item) => item.taskId === task.id);
  const files = data.attachments.filter((item) => item.taskId === task.id);
  const assignee = data.users.find((item) => item.id === (choice || task.assigneeId));
  const moving = choice !== "" && choice !== task.assigneeId;
  const grouped = groupRole(choice);
  const hint = choice === "group:all"
    ? "Everyone will see this in Team tasks."
    : grouped
    ? `The ${roleLabel(grouped).toLowerCase()} will see this in Team tasks.`
    : moving
      ? `Press confirm before this moves to ${assignee?.name ?? "them"}.`
      : task.assigneeId === user.id
        ? "This sits on your own desk."
        : task.assigneeId.startsWith("group:")
          ? "This is on Team tasks."
        : user.role === "manager"
          ? `${assignee?.name ?? "They"} will be told it is on their desk. They cannot send it back.`
          : `${assignee?.name ?? "They"} will be asked to accept it. If they reject it, it comes back to you.`;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-navy/35" onClick={() => openTask(null)}>
      <aside
        data-drop-task={task.id}
        className="drawer flex h-full flex-col overflow-y-auto bg-card shadow-2xl"
        role="dialog"
        aria-label={task.title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="text-xl font-semibold text-navy">Task</h2>
          <button type="button" className="btn btn-ghost min-w-11 px-3" aria-label="Close task" onClick={() => openTask(null)}>
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="grid gap-4 px-5 py-5">
          <label>
            <span className="label">Title</span>
            <input className="input" value={task.title} autoFocus={task.title === "New task"} onChange={(event) => updateTask(task.id, { title: event.target.value })} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="label">Priority</span>
              <select className="input" value={task.priority} onChange={(event) => updateTask(task.id, { priority: event.target.value as Priority })}>
                <option value="high">High</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </select>
            </label>
            <label>
              <span className="label">Date</span>
              <input className="input" type="date" value={task.date} onChange={(event) => moveTask(task.id, event.target.value)} />
            </label>
            <label>
              <span className="label">Repeats</span>
              <select className="input" value={taskRepeat(task)} onChange={(event) => updateTask(task.id, { repeat: event.target.value as Repeat })}>
                <option value="once">{repeatLabel("once")}</option>
                <option value="daily">{repeatLabel("daily")}</option>
                <option value="weekly">{repeatLabel("weekly")}</option>
                <option value="monthly">{repeatLabel("monthly")}</option>
                <option value="annual">{repeatLabel("annual")}</option>
              </select>
            </label>
            <label>
              <span className="label">Time (optional)</span>
              <input className="input" type="time" value={task.time} onChange={(event) => updateTask(task.id, { time: event.target.value })} />
            </label>
            <label>
              <span className="label">Reminder</span>
              <select className="input" value={String(remindMinutes(task.remind))} onChange={(event) => updateTask(task.id, { remind: Number(event.target.value) as Remind })}>
                <option value="0">No reminder</option>
                <option value="5">5 minutes before</option>
                <option value="10">10 minutes before</option>
                <option value="15">15 minutes before</option>
                <option value="30">30 minutes before</option>
              </select>
            </label>
          </div>
          <label>
            <span className="label">Assign to</span>
            <select className="input" value={choice || task.assigneeId} onChange={(event) => setChoice(event.target.value)}>
              {ASSIGN_GROUPS.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
              {data.users.map((person) => (
                <option key={person.id} value={person.id}>{person.name}</option>
              ))}
            </select>
            <span className="mt-2 block text-sm text-muted">{hint}</span>
            {moving ? (
              <span className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="btn btn-gold px-3" onClick={() => assignTask(task.id, choice)}>Confirm</button>
                <button type="button" className="btn btn-ghost px-3" onClick={() => setChoice(task.assigneeId)}>Cancel</button>
              </span>
            ) : null}
          </label>
          {task.returnNote ? <p className="rounded-md bg-paper px-3 py-2 text-sm text-navy">Returned: {task.returnNote}</p> : null}
          <TaskActions taskId={task.id} />
          <section>
            <h3 className="label">Notes</h3>
            <ul className="grid gap-2">
              {notes.map((item) => (
                <li key={item.id} className="rounded-md bg-paper px-3 py-2">
                  <p className="text-sm">{item.body}</p>
                  <p className="mt-1 text-xs text-muted">
                    {data.users.find((person) => person.id === item.authorId)?.name} · {format(new Date(item.createdAt), "d MMM, HH:mm")}
                  </p>
                </li>
              ))}
            </ul>
            <form
              className="mt-3 grid gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                addNote(task.id, note);
                setNote("");
              }}
            >
              <textarea className="input min-h-24 py-2" placeholder="Add a note" value={note} onChange={(event) => setNote(event.target.value)} />
              <button className="btn btn-ghost justify-self-start" type="submit">Add note</button>
            </form>
          </section>
          <section>
            <div className="flex items-center justify-between gap-3">
              <h3 className="label">Files</h3>
              <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
                <Paperclip className="size-4" aria-hidden="true" />
                Attach a file
              </button>
              <input
                ref={fileRef}
                type="file"
                multiple
                className="sr-only"
                aria-label="Attach a file"
                onChange={(event) => {
                  const files = [...(event.target.files ?? [])];
                  event.target.value = "";
                  if (files.length) void attachFiles(task.id, files);
                }}
              />
            </div>
            {files.length === 0 ? <p className="text-sm text-muted">Optional. Any file type, or drop one here.</p> : (
              <ul className="grid gap-2">
                {files.map((file) => (
                  <li key={file.id}>
                    <button type="button" className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-line px-3 text-left" onClick={() => void downloadAttachment(file.id)}>
                      <span className="truncate font-medium">{file.name}</span>
                      <span className="shrink-0 text-sm font-semibold text-navy">Open</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <p className="text-xs text-muted">Opened {task.date ? format(parseISODate(task.date), "d MMMM yyyy") : "without a date"}.</p>
        </div>
      </aside>
    </div>
  );
}
