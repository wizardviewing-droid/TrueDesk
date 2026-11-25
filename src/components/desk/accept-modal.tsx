import * as Dialog from "@radix-ui/react-dialog";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import { parseISODate } from "@/lib/desk/dates";
import { useDesk } from "@/lib/desk/store";

export function AcceptModal() {
  const data = useDesk((s) => s.data);
  const user = useDesk((s) => s.user);
  const acceptTask = useDesk((s) => s.acceptTask);
  const declineTask = useDesk((s) => s.declineTask);
  const openTask = useDesk((s) => s.openTask);
  const downloadAttachment = useDesk((s) => s.downloadAttachment);
  const [snoozed, setSnoozed] = useState<string[]>(() => {
    if (typeof sessionStorage === "undefined") return [];
    try {
      const stored = JSON.parse(sessionStorage.getItem("truedesk-snooze") || "[]") as unknown;
      return Array.isArray(stored) ? stored.filter((item): item is string => typeof item === "string") : [];
    } catch {
      return [];
    }
  });
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [declining, setDeclining] = useState(false);

  const pending = data && user ? data.tasks.filter((task) => task.assigneeId === user.id && task.status === "pending") : [];
  const waiting = pending.filter((task) => !snoozed.includes(task.id));
  const current = waiting[0];
  const signature = waiting.map((task) => task.id).join("|");

  useEffect(() => {
    if (signature) setOpen(true);
  }, [signature]);

  useEffect(() => {
    const wake = () => {
      sessionStorage.removeItem("truedesk-snooze");
      setSnoozed([]);
      setOpen(true);
      setDeclining(false);
    };
    window.addEventListener("truedesk-wake", wake);
    return () => window.removeEventListener("truedesk-wake", wake);
  }, []);

  function snooze() {
    const next = [...new Set([...snoozed, ...pending.map((task) => task.id)])];
    sessionStorage.setItem("truedesk-snooze", JSON.stringify(next));
    setSnoozed(next);
    setOpen(false);
    setDeclining(false);
    setReason("");
  }

  if (!data || !user || !current) return null;
  const from = data.users.find((person) => person.id === current.assignerId);
  const note = data.notes.find((item) => item.taskId === current.id);
  const files = data.attachments.filter((item) => item.taskId === current.id);

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) snooze(); else setOpen(true); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-navy/45" />
        <Dialog.Content className="modal fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-card p-6 shadow-2xl">
          <p className="text-xs font-semibold tracking-widest text-gold uppercase">Task for you</p>
          <Dialog.Title className="mt-2 text-2xl font-semibold text-navy">
            {from?.name ?? "A colleague"} has asked you to take this on
          </Dialog.Title>
          <Dialog.Description className="mt-3 text-muted">
            Accept it and it goes on your diary. Decline it and it returns to them.
          </Dialog.Description>
          <div className="mt-5 rounded-md bg-paper px-4 py-3">
            <p className="text-lg font-semibold">{current.title}</p>
            <p className="mt-1 text-sm text-muted">
              {current.date ? format(parseISODate(current.date), "d MMM yyyy") : "No date"}
              {current.time ? ` at ${current.time}` : ""}
            </p>
            {note ? <p className="mt-3 text-sm">{note.body}</p> : null}
            {files.length ? (
              <ul className="mt-3 grid gap-1">
                {files.map((file) => (
                  <li key={file.id}>
                    <button type="button" className="text-sm font-semibold text-navy underline" onClick={() => void downloadAttachment(file.id)}>
                      Open {file.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {waiting.length > 1 ? <p className="mt-3 text-sm text-muted">1 of {waiting.length} waiting</p> : null}
          {declining ? (
            <form
              className="mt-5 grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                declineTask(current.id, reason);
                setReason("");
                setDeclining(false);
              }}
            >
              <label>
                <span className="label">Reason</span>
                <textarea className="input min-h-20 py-2" value={reason} onChange={(event) => setReason(event.target.value)} />
              </label>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-navy" type="submit">Send it back</button>
                <button className="btn btn-ghost" type="button" onClick={() => setDeclining(false)}>Cancel</button>
              </div>
            </form>
          ) : (
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-gold"
                onClick={() => acceptTask(current.id)}
              >
                Accept
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setDeclining(true)}>Reject</button>
              <button type="button" className="btn btn-quiet" onClick={() => { openTask(current.id); snooze(); }}>
                Open first
              </button>
              <button type="button" className="btn btn-quiet" onClick={snooze}>Not now</button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
