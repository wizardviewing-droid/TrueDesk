import { useState } from "react";
import { useDesk } from "@/lib/desk/store";

export function TaskActions({ taskId }: { taskId: string }) {
  const data = useDesk((s) => s.data);
  const user = useDesk((s) => s.user);
  const toggleDone = useDesk((s) => s.toggleDone);
  const removeTask = useDesk((s) => s.removeTask);
  const moveTask = useDesk((s) => s.moveTask);
  const assignTask = useDesk((s) => s.assignTask);
  const [confirming, setConfirming] = useState(false);
  const task = data?.tasks.find((item) => item.id === taskId);
  if (!data || !user || !task) return null;
  const canDelete = user.role === "manager" || task.ownerId === user.id || task.assigneeId === user.id;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2" onClick={(event) => event.stopPropagation()}>
      <button type="button" className="btn btn-navy px-3" onClick={() => toggleDone(task.id)}>
        {task.status === "done" ? "Reopen" : "Done"}
      </button>
      {confirming ? (
        <button
          type="button"
          className="btn btn-ghost px-3 text-danger"
          onClick={() => {
            removeTask(task.id);
            setConfirming(false);
          }}
        >
          Confirm delete
        </button>
      ) : (
        <button type="button" className="btn btn-ghost px-3" disabled={!canDelete} onClick={() => setConfirming(true)}>
          Delete
        </button>
      )}
      <label className="flex items-center gap-2 text-sm text-navy">
        <span className="font-semibold">Reschedule</span>
        <input className="input w-auto" type="date" value={task.date} onChange={(event) => moveTask(task.id, event.target.value)} />
      </label>
      <label className="flex items-center gap-2 text-sm text-navy">
        <span className="font-semibold">Reallocate</span>
        <select
          className="input w-auto"
          value={task.assigneeId}
          onChange={(event) => assignTask(task.id, event.target.value)}
        >
          {data.users.map((person) => (
            <option key={person.id} value={person.id}>{person.name}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
