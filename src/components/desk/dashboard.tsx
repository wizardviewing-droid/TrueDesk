import { format } from "date-fns";
import { AlertTriangle, Calculator, CalendarDays, ChevronRight, CircleCheck, ClipboardList, Coins, Paperclip, Table, Users, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { TaskActions } from "@/components/desk/task-actions";
import { cx } from "@/lib/cx";
import { occursOn, parseISODate, todayISO, toISODate } from "@/lib/desk/dates";
import { matchesQuery, priorityRank, useDesk } from "@/lib/desk/store";
import { assigneeLabel, repeatLabel, seesTeamTask, taskRepeat, type Attachment, type Task } from "@/lib/desk/types";

type Lens = "all" | "open" | "overdue" | "done";

function notesFor(taskId: string, notes: { taskId: string; body: string }[]) {
  return notes.filter((note) => note.taskId === taskId).map((note) => note.body).join(" ");
}

function doneOn(stamp: string): string {
  const parsed = new Date(stamp);
  if (Number.isNaN(parsed.getTime())) return stamp.slice(0, 10);
  return toISODate(parsed);
}

function listFor(pool: Task[], lens: Lens, today: string, byWhen: (a: Task, b: Task) => number, pendingToo: boolean) {
  const live = pool.filter((task) => task.status === "accepted" || (pendingToo && task.status === "pending")).sort(byWhen);
  const dueToday = (task: Task) => Boolean(task.date) && occursOn(task.date, taskRepeat(task), today);
  const overdue = live.filter((task) => task.date && task.date < today && !dueToday(task));
  const todayTasks = live.filter(dueToday);
  const done = pool
    .filter((task) => task.status === "done" && doneOn(task.completedAt || task.updatedAt) === today)
    .sort((a, b) => (b.completedAt || b.updatedAt).localeCompare(a.completedAt || a.updatedAt));
  const todayOpen = todayTasks;
  const tasks = lens === "done" ? done : lens === "overdue" ? overdue : lens === "open" ? todayOpen : [...overdue, ...todayTasks];
  return { live, overdue, done, tasks, todayOpen };
}

export function Dashboard() {
  const data = useDesk((s) => s.data);
  const user = useDesk((s) => s.user);
  const query = useDesk((s) => s.query);
  const openTask = useDesk((s) => s.openTask);
  const downloadAttachment = useDesk((s) => s.downloadAttachment);
  const acceptTask = useDesk((s) => s.acceptTask);
  const setView = useDesk((s) => s.setView);
  const [lens, setLens] = useState<Lens>("all");
  const [board, setBoard] = useState<"mine" | "team">("mine");
  const [calculator, setCalculator] = useState(false);
  if (!data || !user) return null;

  const today = todayISO();
  const visible = (task: Task) => matchesQuery(task, notesFor(task.id, data.notes), query);
  const byWhen = (a: Task, b: Task) =>
    (a.time || "99:99").localeCompare(b.time || "99:99") || priorityRank(a.priority) - priorityRank(b.priority) || a.title.localeCompare(b.title);
  const mine = listFor(data.tasks.filter((task) => visible(task) && task.assigneeId === user.id), lens, today, byWhen, false);
  const team = listFor(
    data.tasks.filter((task) => {
      if (!visible(task) || task.assigneeId === user.id) return false;
      if (task.assigneeId.startsWith("group:")) return seesTeamTask(task.assigneeId, user.role);
      return true;
    }),
    lens,
    today,
    byWhen,
    true,
  );
  const pending = data.tasks.filter((task) => visible(task) && task.assigneeId === user.id && task.status === "pending").sort(byWhen);
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const yourTitle = lens === "done" ? "Today's completed tasks" : lens === "overdue" ? "Your overdue tasks" : lens === "open" ? "Today's outstanding tasks" : "Your tasks – today";
  const teamTitle = lens === "done" ? "Team completed today" : lens === "overdue" ? "Team overdue" : lens === "open" ? "Today's team tasks" : "Team tasks – today";

  function pick(next: Lens) {
    setLens((current) => (current === next ? "all" : next));
  }

  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-navy">
            {hello}, {user.name.split(" ")[0]}
          </h1>
          <p className="mt-1 text-muted">{user.team}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="flex items-center gap-2 rounded-full bg-card px-4 py-2 text-sm font-semibold text-navy shadow-sm">
            <CalendarDays className="size-5" aria-hidden="true" />
            {format(new Date(), "EEE d MMMM yyyy")}
          </p>
          <button type="button" className="btn btn-navy rounded-full shadow-sm" onClick={() => setCalculator(true)}>
            <Calculator className="size-4" aria-hidden="true" />
            Calculator
          </button>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        <Jump icon={CalendarDays} label="Calendar" tone="gold" onClick={() => setView("calendar")} />
        <Jump icon={Wrench} label="Tools" tone="lilac" onClick={() => setView("tools")} />
        <Jump icon={Table} label="My work list" tone="sky" onClick={() => setView("register")} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Today's outstanding tasks" value={mine.todayOpen.length} tone="sky" icon={ClipboardList} active={board === "mine" && lens === "open"} onClick={() => { setBoard("mine"); pick("open"); }} />
        <Stat label="Overdue tasks" value={mine.overdue.length} tone="coral" icon={AlertTriangle} active={board === "mine" && lens === "overdue"} onClick={() => { setBoard("mine"); pick("overdue"); }} />
        <Stat label="Today's completed" value={mine.done.length} tone="sage" icon={CircleCheck} active={board === "mine" && lens === "done"} onClick={() => { setBoard("mine"); pick("done"); }} />
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
                  <span className="text-sm text-muted">{task.time ? `${task.time} · ` : ""}{repeatLabel(taskRepeat(task))}</span>
                </button>
                <button type="button" className="btn btn-gold" onClick={() => acceptTask(task.id)}>Accept</button>
                {data.attachments.filter((file) => file.taskId === task.id).map((file) => (
                  <button key={file.id} type="button" className="flex min-h-9 w-full items-center gap-2 rounded-md bg-paper px-2 text-left text-sm font-medium" onClick={() => void downloadAttachment(file.id)}>
                    <Paperclip className="size-3.5" aria-hidden="true" />
                    <span className="truncate">{file.name}</span>
                    <span className="ml-auto text-xs text-muted">Open</span>
                  </button>
                ))}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {board === "mine" ? (
        <TaskPanel title={yourTitle} tasks={mine.tasks} today={today} files={(id) => data.attachments.filter((file) => file.taskId === id)} empty={lens === "done" ? "Nothing completed today." : "Nothing on your desk."} onOpen={openTask} onFile={(id) => void downloadAttachment(id)} />
      ) : (
        <TaskPanel title={teamTitle} tasks={team.tasks} today={today} who={(id) => assigneeLabel(id, data.users)} files={(id) => data.attachments.filter((file) => file.taskId === id)} empty={lens === "done" ? "No finished team work." : "Nothing on the team desk."} onOpen={openTask} onFile={(id) => void downloadAttachment(id)} />
      )}
      {calculator ? <DeskCalculator onClose={() => setCalculator(false)} /> : null}
    </div>
  );
}

function TaskPanel({
  title,
  tasks,
  today,
  who,
  files,
  empty,
  onOpen,
  onFile,
}: {
  title: string;
  tasks: Task[];
  today: string;
  who?: (id: string) => string | undefined;
  files: (id: string) => Attachment[];
  empty: string;
  onOpen: (id: string) => void;
  onFile: (id: string) => void;
}) {
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3 px-1">
        <h2 className="text-2xl font-semibold text-navy">{title}</h2>
        <span className="text-sm font-semibold tabular-nums text-muted">{tasks.length}</span>
      </div>
      {tasks.length === 0 ? (
        <p className="card px-5 py-10 text-muted">{empty}</p>
      ) : (
        <ul className="grid gap-2">
          {tasks.map((task, index) => (
            <TaskRow key={task.id} task={task} index={index} today={today} who={who?.(task.assigneeId)} files={files(task.id)} done={task.status === "done"} onOpen={() => onOpen(task.id)} onFile={onFile} />
          ))}
        </ul>
      )}
    </section>
  );
}

function formatCalc(value: number): string {
  if (!Number.isFinite(value)) return "Error";
  const rounded = Math.round(value * 1e10) / 1e10;
  const text = String(rounded);
  return text.length > 14 ? rounded.toExponential(6) : text;
}

function calculate(left: number, right: number, operator: string): number {
  if (operator === "+") return left + right;
  if (operator === "-") return left - right;
  if (operator === "*") return left * right;
  if (operator === "/") return right === 0 ? Number.NaN : left / right;
  return right;
}

function DeskCalculator({ onClose }: { onClose: () => void }) {
  const [display, setDisplay] = useState("0");
  const [stored, setStored] = useState<number | null>(null);
  const [operator, setOperator] = useState<string | null>(null);
  const [fresh, setFresh] = useState(true);

  function typeDigit(digit: string) {
    setDisplay((current) => {
      if (fresh) return digit === "." ? "0." : digit;
      if (digit === "." && current.includes(".")) return current;
      if (current === "0" && digit !== ".") return digit;
      if (current.replace("-", "").replace(".", "").length >= 12) return current;
      return current + digit;
    });
    setFresh(false);
  }

  function choose(next: string) {
    const value = Number(display);
    if (stored !== null && operator && !fresh) {
      const result = calculate(stored, value, operator);
      setStored(Number.isFinite(result) ? result : null);
      setDisplay(formatCalc(result));
    } else {
      setStored(value);
    }
    setOperator(next);
    setFresh(true);
  }

  function equals() {
    if (stored === null || !operator) return;
    const result = calculate(stored, Number(display), operator);
    setDisplay(formatCalc(result));
    setStored(null);
    setOperator(null);
    setFresh(true);
  }

  function clear() {
    setDisplay("0");
    setStored(null);
    setOperator(null);
    setFresh(true);
  }

  function backspace() {
    if (fresh) return;
    setDisplay((current) => (current.length <= 1 || (current.length === 2 && current.startsWith("-")) ? "0" : current.slice(0, -1)));
  }

  function percent() {
    const value = Number(display);
    if (!Number.isFinite(value)) return;
    setDisplay(formatCalc(value / 100));
    setFresh(true);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key;
      if (key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (/^[0-9]$/.test(key)) {
        event.preventDefault();
        typeDigit(key);
        return;
      }
      if (key === "." || key === ",") {
        event.preventDefault();
        typeDigit(".");
        return;
      }
      if (key === "+" || key === "-" || key === "*" || key === "/") {
        event.preventDefault();
        choose(key);
        return;
      }
      if (key === "Enter" || key === "=") {
        event.preventDefault();
        equals();
        return;
      }
      if (key === "Backspace") {
        event.preventDefault();
        backspace();
        return;
      }
      if (key === "Delete" || key.toLowerCase() === "c") {
        event.preventDefault();
        clear();
        return;
      }
      if (key === "%") {
        event.preventDefault();
        percent();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const keys: { label: string; run: () => void; tone?: "gold" | "navy" | "quiet" }[] = [
    { label: "C", run: clear, tone: "quiet" },
    { label: "⌫", run: backspace, tone: "quiet" },
    { label: "%", run: percent, tone: "quiet" },
    { label: "÷", run: () => choose("/"), tone: "gold" },
    { label: "7", run: () => typeDigit("7") },
    { label: "8", run: () => typeDigit("8") },
    { label: "9", run: () => typeDigit("9") },
    { label: "×", run: () => choose("*"), tone: "gold" },
    { label: "4", run: () => typeDigit("4") },
    { label: "5", run: () => typeDigit("5") },
    { label: "6", run: () => typeDigit("6") },
    { label: "−", run: () => choose("-"), tone: "gold" },
    { label: "1", run: () => typeDigit("1") },
    { label: "2", run: () => typeDigit("2") },
    { label: "3", run: () => typeDigit("3") },
    { label: "+", run: () => choose("+"), tone: "gold" },
    { label: "0", run: () => typeDigit("0") },
    { label: ".", run: () => typeDigit(".") },
    { label: "=", run: equals, tone: "navy" },
  ];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy/45 p-4" role="dialog" aria-label="Calculator" onMouseDown={onClose}>
      <div className="w-full max-w-xs rounded-2xl bg-card p-4 shadow-lg" onMouseDown={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-semibold text-navy">Calculator</h2>
          <button type="button" className="btn btn-quiet min-w-11 px-3" onClick={onClose}>Close</button>
        </div>
        <p className="mb-3 overflow-hidden rounded-xl bg-navy px-4 py-3 text-right text-3xl font-semibold text-paper tabular-nums" aria-live="polite">{display}</p>
        <div className="grid grid-cols-4 gap-2">
          {keys.map((key) => (
            <button
              key={key.label}
              type="button"
              className={cx(
                "min-h-12 rounded-xl text-lg font-semibold",
                key.label === "0" && "col-span-2",
                key.tone === "gold" ? "bg-gold text-navy" : key.tone === "navy" ? "bg-navy text-paper" : key.tone === "quiet" ? "bg-paper text-navy" : "bg-sky-soft text-navy",
              )}
              onClick={key.run}
            >
              {key.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-center text-xs text-muted">Number keys, + − * /, Enter, Backspace and Esc</p>
      </div>
    </div>
  );
}

function Jump({ icon: Icon, label, tone, onClick }: { icon: typeof CalendarDays; label: string; tone: "gold" | "lilac" | "sky"; onClick: () => void }) {
  const wash = {
    gold: "from-[#fff8ea] to-[#ffe7b0]",
    lilac: "from-[#f6f1ff] to-[#e4dcff]",
    sky: "from-[#f3f8ff] to-[#d9ebff]",
  }[tone];
  return (
    <button type="button" className={cx("relative flex min-h-20 items-center gap-3 overflow-hidden rounded-2xl border border-white bg-linear-to-r px-4 text-left shadow-sm", wash)} onClick={onClick}>
      <span className="grid size-11 place-items-center rounded-full bg-card/80 text-navy shadow-sm">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="text-lg font-semibold text-navy">{label}</span>
      <ChevronRight className="ml-auto size-4 text-muted" aria-hidden="true" />
      <JumpArt tone={tone} />
    </button>
  );
}

function JumpArt({ tone }: { tone: "gold" | "lilac" | "sky" }) {
  const color = tone === "gold" ? "#e7c56a" : tone === "lilac" ? "#b7a6e8" : "#9ec4ef";
  return (
    <svg className="pointer-events-none absolute right-8 bottom-1 h-14 w-20 opacity-80" viewBox="0 0 80 56" aria-hidden="true">
      {tone === "lilac" ? (
        <>
          <circle cx="28" cy="30" r="12" fill="none" stroke={color} strokeWidth="3" />
          <circle cx="50" cy="22" r="9" fill="none" stroke={color} strokeWidth="3" />
          <circle cx="54" cy="40" r="7" fill="none" stroke={color} strokeWidth="3" />
        </>
      ) : tone === "sky" ? (
        <>
          <rect x="18" y="8" width="36" height="42" rx="6" fill="none" stroke={color} strokeWidth="3" />
          <path d="M26 22h20M26 30h16M26 38h12" stroke={color} strokeWidth="3" strokeLinecap="round" />
        </>
      ) : (
        <>
          <rect x="16" y="10" width="34" height="36" rx="5" fill="none" stroke={color} strokeWidth="3" />
          <path d="M16 20h34" stroke={color} strokeWidth="3" />
          <path d="M26 6v8M40 6v8" stroke={color} strokeWidth="3" strokeLinecap="round" />
        </>
      )}
    </svg>
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
    sky: "from-[#e7f3ff] to-[#d5e9fb] text-sky",
    coral: "from-[#fdeceb] to-[#f8d5d1] text-coral",
    sage: "from-[#e7f7ec] to-[#d3f0dc] text-sage",
    gold: "from-[#fff6dc] to-[#ffe7a8] text-navy",
  }[tone];
  const numberClass = {
    sky: "text-sky",
    coral: "text-coral",
    sage: "text-sage",
    gold: "text-[#c49212]",
  }[tone];
  return (
    <button type="button" className={cx("relative flex min-h-20 items-center gap-3 overflow-hidden rounded-2xl bg-linear-to-r px-4 text-left shadow-sm", toneClass, active && "outline-2 outline-offset-2 outline-navy")} aria-pressed={active} onClick={onClick}>
      <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-10 w-full opacity-50" viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 24 C40 8 80 36 120 18 C150 6 180 28 200 14 L200 40 L0 40 Z" fill="white" />
      </svg>
      <Icon className="relative size-5 shrink-0" aria-hidden="true" />
      <span className="relative font-semibold text-navy">{label}</span>
      <span className={cx("relative ml-auto text-3xl font-semibold tabular-nums", numberClass)}>{value}</span>
    </button>
  );
}

function TaskRow({ task, index, today, who, files, done, onOpen, onFile }: { task: Task; index: number; today: string; who?: string; files: Attachment[]; done: boolean; onOpen: () => void; onFile: (id: string) => void }) {
  const repeat = taskRepeat(task);
  const overdue = !done && Boolean(task.date && task.date < today) && !occursOn(task.date, repeat, today);
  const waiting = task.status === "pending";
  const dueToday = !done && occursOn(task.date, repeat, today);
  const warm = index % 2 === 1;
  const bits = [
    task.matter,
    who,
    repeat !== "once" ? repeatLabel(repeat) : "",
    files.length ? `${files.length} file${files.length === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  const due = done ? "Done" : waiting ? "To accept" : overdue ? "Overdue" : dueToday ? "Due today" : task.date ? format(parseISODate(task.date), "d MMM") : "No date";
  return (
    <li className={cx("relative overflow-hidden rounded-xl border border-white shadow-sm", warm ? "bg-linear-to-r from-[#fff8e8] to-[#fff3d4]" : "bg-linear-to-r from-[#eef6ff] to-[#e4f1ff]", done && "opacity-75")}>
      <span className={cx("absolute inset-y-0 left-0 w-1.5", done ? "bg-sage" : overdue ? "bg-coral" : warm ? "bg-gold" : "bg-sky")} />
      <div className="flex flex-wrap items-center gap-3 py-2 pr-3 pl-4">
        <button type="button" className="flex min-w-48 flex-1 items-center gap-3 text-left" onClick={onOpen}>
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-card/80 text-navy">
            {warm ? <Coins className="size-4" aria-hidden="true" /> : <ClipboardList className="size-4" aria-hidden="true" />}
          </span>
          <span className="min-w-0">
            <span className={cx("block truncate font-semibold text-navy", done && "text-muted line-through")}>{task.title}</span>
            {bits.length ? <span className="block truncate text-sm text-muted">{bits.join(" · ")}</span> : null}
          </span>
        </button>
        {task.time ? (
          <span className="shrink-0 rounded-full bg-navy px-3 py-1 text-sm font-semibold text-white tabular-nums">{task.time}</span>
        ) : null}
        <span className={cx("shrink-0 rounded-full bg-[#d9e8f8] px-3 py-1 text-sm font-semibold text-navy", overdue && "bg-coral-soft text-coral", done && "bg-sage-soft text-sage", warm && !overdue && !done && "bg-[#f3e2a4]")}>
          {due}
        </span>
        <TaskActions taskId={task.id} />
      </div>
      {files.length ? (
        <ul className="grid gap-1 px-4 pb-2">
          {files.map((file) => (
            <li key={file.id}>
              <button type="button" className="flex h-8 w-full items-center gap-2 rounded-lg bg-card/70 px-3 text-left text-sm font-medium text-navy" onClick={() => onFile(file.id)}>
                <Paperclip className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{file.name}</span>
                <span className="ml-auto text-xs text-muted">Open</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
