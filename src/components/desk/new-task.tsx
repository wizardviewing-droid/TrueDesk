import { useState } from "react";
import { todayISO } from "@/lib/desk/dates";
import { useDesk } from "@/lib/desk/store";
import { repeatLabel, type Priority, type Repeat } from "@/lib/desk/types";

export function NewTaskDialog() {
  const data = useDesk((s) => s.data);
  const user = useDesk((s) => s.user);
  const composer = useDesk((s) => s.composer);
  const closeCompose = useDesk((s) => s.closeCompose);
  const createTask = useDesk((s) => s.createTask);
  const addNote = useDesk((s) => s.addNote);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(composer.date || todayISO());
  const [time, setTime] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [repeat, setRepeat] = useState<Repeat>("once");
  const [assigneeId, setAssigneeId] = useState(user?.id ?? "");
  const [note, setNote] = useState("");

  if (!data || !user) return null;
  const assignee = data.users.find((person) => person.id === assigneeId);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    const id = createTask(
      {
        title: trimmed,
        date,
        time,
        priority,
        repeat,
        assigneeId: assigneeId || user!.id,
      },
      false,
    );
    if (id && note.trim()) addNote(id, note.trim());
    closeCompose();
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-navy/45 p-4" onClick={closeCompose}>
      <form
        className="card grid w-full max-w-lg gap-4 p-6 shadow-2xl"
        role="dialog"
        aria-label="Add a task"
        onClick={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <div>
          <h2 className="text-2xl font-semibold text-navy">Add a task</h2>
          <p className="mt-1 text-sm text-muted">Nothing is added until you press Add task.</p>
        </div>
        <label>
          <span className="label">Title</span>
          <input className="input" value={title} autoFocus onChange={(event) => setTitle(event.target.value)} required />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="label">Date</span>
            <input className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
          </label>
          <label>
            <span className="label">Time</span>
            <input className="input" type="time" value={time} onChange={(event) => setTime(event.target.value)} />
          </label>
          <label>
            <span className="label">Priority</span>
            <select className="input" value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label>
            <span className="label">Repeats</span>
            <select className="input" value={repeat} onChange={(event) => setRepeat(event.target.value as Repeat)}>
              <option value="once">{repeatLabel("once")}</option>
              <option value="daily">{repeatLabel("daily")}</option>
              <option value="weekly">{repeatLabel("weekly")}</option>
              <option value="monthly">{repeatLabel("monthly")}</option>
              <option value="annual">{repeatLabel("annual")}</option>
            </select>
          </label>
        </div>
        <label>
          <span className="label">Assign to</span>
          <select className="input" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
            {data.users.map((person) => (
              <option key={person.id} value={person.id}>{person.name}</option>
            ))}
          </select>
          <span className="mt-2 block text-sm text-muted">
            {assigneeId === user.id
              ? "This will sit on your own desk."
              : user.role === "manager"
                ? `${assignee?.name ?? "They"} will be told it is on their desk.`
                : `${assignee?.name ?? "They"} will be asked to accept it.`}
          </span>
        </label>
        <label>
          <span className="label">Note</span>
          <textarea className="input min-h-20 py-2" value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={closeCompose}>Cancel</button>
          <button type="submit" className="btn btn-gold" disabled={!title.trim()}>Add task</button>
        </div>
      </form>
    </div>
  );
}
