import { format } from "date-fns";
import { AlertTriangle, CalendarDays, Check, ChevronRight, CircleCheck, ClipboardList, Table, Users, Wrench } from "lucide-react";
import { useState } from "react";
import { cx } from "@/lib/cx";
import { parseISODate, todayISO } from "@/lib/desk/dates";
import { matchesQuery, priorityRank, useDesk } from "@/lib/desk/store";
import { repeatLabel, taskRepeat, type Priority, type Task } from "@/lib/desk/types";

type Lens = "all" | "open" | "overdue" | "done";

function notesFor(taskId: string, notes: { taskId: string; body: string }[]) {
  return notes.filter((note) => note.taskId === taskId).map((note) => note.body).join(" ");
}

function listFor(pool: Task[], lens: Lens, today: string, byWhen: (a: Task, b: Task) => number, pendingToo: boolean) {
  const live = pool.filter((task) => task.status === "accepted" || (pendingToo && task.status === "pending")).sort(byWhen);
  const overdue = live.filter((task) => task.date && task.date < today);
  const todayTasks = live.filter((task) => task.date === today);
  const done = pool.filter((task) => task.status === "done").sort((a, b) => (b.completedAt || b.updatedAt).localeCompare(a.completedAt || a.updatedAt));
  const tasks = lens === "done" ? done : lens === "overdue" ? overdue : lens === "open" ? live : [...overdue, ...todayTasks];
  return { live, overdue, done, tasks };
}

export function Dashboard() {
  const data = useDesk((s) => s.data);
  const user = useDesk((s) => s.user);
  const query = useDesk((s) => s.query);
  const openTask = useDesk((s) => s.openTask);
  const toggleDone = useDesk((s) => s.toggleDone);
  const acceptTask = useDesk((s) => s.acceptTask);
  const setView = useDesk((s) => s.setView);
  const [lens, setLens] = useState<Lens>("all");
  const [board, setBoard] = useState<"mine" | "team">("mine");
  if (!data || !user) return null;

  const today = todayISO();
  const visible = (task: Task) => matchesQuery(task, notesFor(task.id, data.notes), query);
  const byWhen = (a: Task, b: Task) =>
    (a.time || "99:99").localeCompare(b.time || "99:99") || priorityRank(a.priority) - priorityRank(b.priority) || a.title.localeCompare(b.title);
  const mine = listFor(data.tasks.filter((task) => visible(task) && task.assigneeId === user.id), lens, today, byWhen, false);
  const team = listFor(data.tasks.filter((task) => visible(task) && task.assigneeId !== user.id), lens, today, byWhen, true);
  const pending = data.tasks.filter((task) => visible(task) && task.assigneeId === user.id && task.status === "pending").sort(byWhen);
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const yourTitle = lens === "done" ? "Your completed tasks" : lens === "overdue" ? "Your overdue tasks" : lens === "open" ? "Your outstanding tasks" : "Your tasks – today";
  const teamTitle = lens === "done" ? "Team completed" : lens === "overdue" ? "Team overdue" : lens === "open" ? "Team outstanding" : "Team tasks – today";

  function pick(next: Lens) {
    setLens((current) => (current === next ? "all" : next));
  }

  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-navy">
            {hello}, {user.name.split(" ")[0]}
          </h1>
          <p className="mt-1 text-muted">{user.team}</p>
        </div>
        <p className="flex items-center gap-2 px-1 font-semibold text-navy">
          <CalendarDays className="size-5" aria-hidden="true" />
          {format(new Date(), "EEE d MMMM yyyy")}
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        <Jump icon={CalendarDays} label="Calendar" onClick={() => setView("calendar")} />
        <Jump icon={Wrench} label="Tools" onClick={() => setView("tools")} />
        <Jump icon={Table} label="My work list" onClick={() => setView("register")} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Outstanding tasks" value={mine.live.length} tone="sky" icon={ClipboardList} active={board === "mine" && lens === "open"} onClick={() => { setBoard("mine"); pick("open"); }} />
        <Stat label="Overdue tasks" value={mine.overdue.length} tone="coral" icon={AlertTriangle} active={board === "mine" && lens === "overdue"} onClick={() => { setBoard("mine"); pick("overdue"); }} />
        <Stat label="Completed tasks" value={mine.done.length} tone="sage" icon={CircleCheck} active={board === "mine" && lens === "done"} onClick={() => { setBoard("mine"); pick("done"); }} />
        <Stat label="Team tasks" value={team.live.length} tone="gold" icon={Users} active={board === "team"} onClick={() => setBoard((current) => (current === "team" ? "mine" : "team"))} />
      </div>

      {pending.length ? (
        <section className="overflow-hidden rounded-lg border border-gold/60 bg-gold-soft">
          <h2 className="px-4 py-3 font-semibold text-navy">Needs your acceptance</h2>
          <ul className="grid gap-2 px-3 pb-3">
            {pending.map((task) => (
              <li key={task.id} className="card flex flex-wrap items-center justify-between gap-3 px-3 py-3">
                <button type="button" className="min-w-0 text-left" onClick={() => openTask(task.id)}>
                  <span className="block font-semibold">{task.title}</span>
                  <span className="text-sm text-muted">{repeatLabel(taskRepeat(task))}</span>
                </button>
                <button type="button" className="btn btn-gold" onClick={() => acceptTask(task.id)}>Accept</button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {board === "mine" ? (
        <TaskPanel title={yourTitle} tasks={mine.tasks} today={today} empty={lens === "done" ? "Finished work shows up here." : "Nothing on your desk."} onOpen={openTask} onDone={toggleDone} />
      ) : (
        <TaskPanel title={teamTitle} tasks={team.tasks} today={today} who={(id) => data.users.find((person) => person.id === id)?.name} empty={lens === "done" ? "No finished team work." : "Nothing on the team desk."} onOpen={openTask} onDone={user.role === "manager" ? toggleDone : undefined} />
      )}
    </div>
  );
}

function TaskPanel({
  title,
  tasks,
  today,
  who,
  empty,
  onOpen,
  onDone,
}: {
  title: string;
  tasks: Task[];
  today: string;
  who?: (id: string) => string | undefined;
  empty: string;
  onOpen: (id: string) => void;
  onDone?: (id: string) => void;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-2 bg-navy px-4 py-3 text-paper">
        <ClipboardList className="size-4" aria-hidden="true" />
        <h2 className="font-semibold">{title}</h2>
        <span className="ml-auto tabular-nums text-gold">{tasks.length}</span>
      </div>
      {tasks.length === 0 ? (
        <p className="px-4 py-8 text-muted">{empty}</p>
      ) : (
        <ul>
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} today={today} who={who?.(task.assigneeId)} done={task.status === "done"} onOpen={() => onOpen(task.id)} onDone={onDone && task.status !== "pending" ? () => onDone(task.id) : undefined} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Jump({ icon: Icon, label, onClick }: { icon: typeof CalendarDays; label: string; onClick: () => void }) {
  return (
    <button type="button" className="card flex min-h-16 items-center gap-3 px-4 text-left" onClick={onClick}>
      <span className="grid size-10 place-items-center rounded-md bg-paper text-navy">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="font-semibold text-navy">{label}</span>
      <ChevronRight className="ml-auto size-4 text-muted" aria-hidden="true" />
    </button>
  );
}

function Stat({
  label,
  value,
  tone,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone: "sky" | "coral" | "sage" | "gold";
  icon: typeof ClipboardList;
  active: boolean;
  onClick: () => void;
}) {
  const toneClass = {
    sky: "bg-sky-soft text-sky",
    coral: "bg-coral-soft text-coral",
    sage: "bg-sage-soft text-sage",
    gold: "bg-gold-soft text-navy",
  }[tone];
  return (
    <button type="button" className={cx("flex min-h-16 items-center gap-3 rounded-lg px-4 text-left", toneClass, active && "outline-2 outline-offset-2 outline-navy")} aria-pressed={active} onClick={onClick}>
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      <span className="font-semibold text-navy">{label}</span>
      <span className="ml-auto text-2xl font-semibold tabular-nums">{value}</span>
    </button>
  );
}

function priorityPill(priority: Priority) {
  if (priority === "high") return { label: "High", className: "bg-coral-soft text-coral" };
  if (priority === "low") return { label: "Low", className: "bg-sky-soft text-sky" };
  return { label: "Normal", className: "bg-gold-soft text-navy" };
}

function TaskRow({ task, today, who, done, onOpen, onDone }: { task: Task; today: string; who?: string; done: boolean; onOpen: () => void; onDone?: () => void }) {
  const pill = priorityPill(task.priority);
  const repeat = taskRepeat(task);
  const overdue = !done && Boolean(task.date && task.date < today);
  const waiting = task.status === "pending";
  return (
    <li className="flex items-center gap-2 border-b border-line px-3 py-2 last:border-b-0">
      {onDone ? (
        <button type="button" className="grid size-11 shrink-0 place-items-center" aria-label={done ? `Reopen ${task.title}` : `Mark ${task.title} done`} onClick={onDone}>
          <span className={cx("grid size-5 place-items-center rounded-sm border-2", done ? "border-sage bg-sage text-card" : "border-navy/30 bg-card text-navy")}>
            {done ? <Check className="size-3" aria-hidden="true" /> : null}
          </span>
        </button>
      ) : (
        <span className="w-2 shrink-0" />
      )}
      <button type="button" className="min-w-0 flex-1 py-1 text-left" onClick={onOpen}>
        <span className={cx("block font-semibold", done && "text-muted line-through")}>{task.title}</span>
        <span className="mt-1 flex flex-wrap gap-1">
          {who ? <span className="rounded-md bg-paper px-2 py-0.5 text-xs font-semibold text-navy">{who}</span> : null}
          <span className={cx("rounded-md px-2 py-0.5 text-xs font-semibold", overdue ? "bg-coral-soft text-coral" : "bg-paper text-navy")}>
            {task.date ? format(parseISODate(task.date), "d MMM") : "No date"}
          </span>
          {task.time ? <span className="rounded-md bg-paper px-2 py-0.5 text-xs font-semibold text-navy">{task.time}</span> : null}
          <span className="rounded-md bg-paper px-2 py-0.5 text-xs font-semibold text-navy">{repeatLabel(repeat)}</span>
        </span>
      </button>
      <span className={cx("shrink-0 rounded-md px-2 py-1 text-xs font-semibold", done ? "bg-sage-soft text-sage" : waiting ? "bg-gold-soft text-navy" : pill.className)}>
        {done ? "Done" : waiting ? "To accept" : pill.label}
      </span>
    </li>
  );
}
