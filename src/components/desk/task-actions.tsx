import { useEffect, useRef, useState } from "react";
import { useDesk } from "@/lib/desk/store";

export function TaskActions({ taskId }: { taskId: string }) {
  const data = useDesk((s) => s.data);
  const user = useDesk((s) => s.user);
  const toggleDone = useDesk((s) => s.toggleDone);
  const removeTask = useDesk((s) => s.removeTask);
  const moveTask = useDesk((s) => s.moveTask);
  const assignTask = useDesk((s) => s.assignTask);
  const dateRef = useRef<HTMLInputElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [picking, setPicking] = useState(false);
  const task = data?.tasks.find((item) => item.id === taskId);
  const [choice, setChoice] = useState(task?.assigneeId ?? "");
  useEffect(() => {
    if (task) setChoice(task.assigneeId);
  }, [task?.assigneeId]);
  if (!data || !user || !task) return null;
  const canDelete = user.role === "manager" || task.ownerId === user.id || task.assigneeId === user.id;
  const moving = choice !== task.assigneeId;
  const nextName = data.users.find((person) => person.id === choice)?.name ?? "them";

  function openDate() {
    const input = dateRef.current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      input.focus();
      input.click();
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2" onClick={(event) => event.stopPropagation()}>
      <button type="button" className="btn btn-navy h-9 min-h-9 rounded-lg px-3 text-sm" onClick={() => toggleDone(task.id)}>
        {task.status === "done" ? "Reopen" : "Done"}
      </button>
      <button
        type="button"
        className="btn btn-ghost h-9 min-h-9 rounded-lg bg-card px-3 text-sm"
        disabled={!canDelete}
        onClick={() => {
          if (!confirming) {
            setConfirming(true);
            return;
          }
          removeTask(task.id);
          setConfirming(false);
        }}
      >
        {confirming ? "Confirm delete" : "Delete"}
      </button>
      <span className="relative">
        <button type="button" className="btn btn-ghost h-9 min-h-9 rounded-lg bg-card px-3 text-sm" onClick={openDate}>
          Reschedule
        </button>
        <input
          ref={dateRef}
          className="sr-only"
          type="date"
          tabIndex={-1}
          value={task.date}
          onChange={(event) => {
            if (event.target.value) moveTask(task.id, event.target.value);
          }}
        />
      </span>
      {picking ? (
        <>
          <select className="input h-9 min-h-9 w-auto rounded-lg py-0 text-sm" value={choice} onChange={(event) => setChoice(event.target.value)}>
            {data.users.map((person) => (
              <option key={person.id} value={person.id}>{person.name}</option>
            ))}
          </select>
          {moving ? (
            <button type="button" className="btn btn-gold h-9 min-h-9 rounded-lg px-3 text-sm" onClick={() => { assignTask(task.id, choice); setPicking(false); }}>
              Confirm {nextName}
            </button>
          ) : null}
          <button type="button" className="btn btn-quiet h-9 min-h-9 px-2 text-sm" onClick={() => { setChoice(task.assigneeId); setPicking(false); }}>
            Cancel
          </button>
        </>
      ) : (
        <button type="button" className="btn btn-ghost h-9 min-h-9 rounded-lg bg-card px-3 text-sm" onClick={() => setPicking(true)}>
          Reallocate
        </button>
      )}
    </div>
  );
}
