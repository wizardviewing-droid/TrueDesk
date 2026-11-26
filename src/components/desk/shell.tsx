import { format } from "date-fns";
import {
  Bell,
  CalendarDays,
  Download,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Save,
  Search,
  Table,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { TrueMark } from "@/components/logo";
import { cx } from "@/lib/cx";
import { todayISO } from "@/lib/desk/dates";
import { useDesk, type SavePhase } from "@/lib/desk/store";
import { PATHS, type View } from "@/lib/desk/types";
import { AcceptModal } from "@/components/desk/accept-modal";
import { CalendarView } from "@/components/desk/calendar-view";
import { Dashboard } from "@/components/desk/dashboard";
import { PeopleView } from "@/components/desk/people-view";
import { RegisterView } from "@/components/desk/register-view";
import { TaskDrawer } from "@/components/desk/task-drawer";
import { ToolsView } from "@/components/desk/tools-view";

const NAV: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "today", label: "My dashboard", icon: LayoutDashboard },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "register", label: "Work list", icon: Table },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "people", label: "Team", icon: Users },
];

function saveLabel(phase: SavePhase, savedAt: string | null): string {
  if (phase === "saving") return "Saving both copies…";
  if (phase === "dirty") return "Unsaved changes";
  if (phase === "error") return "Save failed";
  if (!savedAt) return "Saved";
  return `Saved ${format(new Date(savedAt), "HH:mm")}`;
}

export function Shell() {
  const user = useDesk((s) => s.user);
  const data = useDesk((s) => s.data);
  const view = useDesk((s) => s.view);
  const setView = useDesk((s) => s.setView);
  const query = useDesk((s) => s.query);
  const setQuery = useDesk((s) => s.setQuery);
  const phase = useDesk((s) => s.phase);
  const savedAt = useDesk((s) => s.savedAt);
  const inSync = useDesk((s) => s.inSync);
  const saveNow = useDesk((s) => s.saveNow);
  const signOut = useDesk((s) => s.signOut);
  const createTask = useDesk((s) => s.createTask);
  const addFilesAsTasks = useDesk((s) => s.addFilesAsTasks);
  const attachFiles = useDesk((s) => s.attachFiles);
  const openTask = useDesk((s) => s.openTask);
  const dismissNotice = useDesk((s) => s.dismissNotice);
  const downloadExcel = useDesk((s) => s.downloadExcel);
  const downloadVault = useDesk((s) => s.downloadVault);
  const toast = useDesk((s) => s.toast);
  const release = useDesk((s) => s.release);
  const installRelease = useDesk((s) => s.installRelease);
  const [menu, setMenu] = useState(false);
  const [copies, setCopies] = useState(false);
  const [hot, setHot] = useState(false);
  const depth = useRef(0);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveNow();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveNow]);

  if (!user || !data) return null;
  const today = todayISO();
  const attention = data.tasks.filter(
    (task) => task.assigneeId === user.id && task.status !== "done" && task.status !== "pending" && task.date && task.date <= today,
  ).length;
  const pending = data.tasks.filter((task) => task.assigneeId === user.id && task.status === "pending").length;
  const unread = (data.notices ?? []).filter((notice) => notice.userId === user.id && !notice.read);

  return (
    <div
      className="flex h-dvh bg-paper text-ink"
      onDragEnter={(event) => {
        if (![...event.dataTransfer.types].includes("Files")) return;
        if (view === "tools") return;
        depth.current += 1;
        setHot(true);
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setHot(false);
      }}
      onDragOver={(event) => {
        if ([...event.dataTransfer.types].includes("Files")) event.preventDefault();
      }}
      onDrop={(event) => {
        const files = [...event.dataTransfer.files];
        depth.current = 0;
        setHot(false);
        if (!files.length) return;
        event.preventDefault();
        if (view === "tools") return;
        const target = event.target as HTMLElement | null;
        const taskId = target?.closest("[data-drop-task]")?.getAttribute("data-drop-task");
        const date = target?.closest("[data-drop-date]")?.getAttribute("data-drop-date");
        if (taskId) {
          void attachFiles(taskId, files);
          openTask(taskId);
        } else void addFilesAsTasks(files, date || undefined);
      }}
    >
      <aside className={cx("fixed inset-y-0 left-0 z-30 flex w-72 flex-col bg-navy text-paper md:static md:translate-x-0", menu ? "translate-x-0" : "-translate-x-full md:translate-x-0")}>
        <div className="px-5 pt-6">
          <TrueMark className="h-7 w-auto text-gold" />
          <p className="mt-4 text-xs font-semibold tracking-widest text-gold uppercase">Accounts task desk</p>
        </div>
        <nav className="mt-6 grid gap-1 px-3">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={cx("flex min-h-11 items-center gap-3 rounded-md px-3 text-left text-sm font-semibold", active ? "bg-gold text-navy" : "text-paper/80 hover:bg-paper/5")}
                onClick={() => { setView(item.id); setMenu(false); }}
              >
                <Icon className="size-4" aria-hidden="true" />
                <span className="flex-1">{item.label}</span>
                {item.id === "today" && attention ? <span className={cx("tabular-nums", active ? "text-navy" : "text-gold")}>{attention}</span> : null}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto px-5 py-5 text-sm">
          <p className={cx("font-medium", inSync ? "text-gold" : "text-paper")}>{inSync ? "Both copies match" : "Copies need a check"}</p>
          <p className="mt-1 text-paper/70">Application copy on the shared drive</p>
          <p className="text-paper/70">Backup copy on the shared drive</p>
          <button type="button" className="btn btn-quiet mt-2 text-gold" onClick={() => setCopies(true)}>Workbook copies</button>
          <div className="mt-4 border-t border-paper/15 pt-4">
            <p className="font-semibold">{user.name}</p>
            <p className="text-paper/70">{user.job}</p>
            <button type="button" className="btn btn-quiet mt-2 px-0 text-paper" onClick={() => void signOut()}>
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      </aside>
      {menu ? <button type="button" className="fixed inset-0 z-20 bg-navy/40 md:hidden" aria-label="Close menu" onClick={() => setMenu(false)} /> : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-line bg-card px-4 py-3">
          <button type="button" className="btn btn-ghost min-w-11 px-3 md:hidden" aria-label="Open menu" onClick={() => setMenu(true)}>
            <Menu className="size-4" aria-hidden="true" />
          </button>
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input className="input pl-10" placeholder="Search tasks" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <p className="text-sm text-muted tabular-nums" aria-live="polite">{saveLabel(phase, savedAt)}</p>
          <button type="button" className="btn btn-ghost" onClick={() => void saveNow()}>
            <Save className="size-4" aria-hidden="true" />
            Save
          </button>
          {pending || unread.length ? (
            <button type="button" className="btn btn-navy" onClick={() => window.dispatchEvent(new Event("truedesk-wake"))}>
              <Bell className="size-4" aria-hidden="true" />
              {pending + unread.length}
            </button>
          ) : null}
          <button type="button" className="btn btn-gold" onClick={() => createTask({ title: "New task" })}>
            <Plus className="size-4" aria-hidden="true" />
            Add task
          </button>
        </header>
        {release ? (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-gold px-4 py-3 text-navy">
            <p className="font-semibold">
              True Desk {release.version} is ready on the Y drive.{release.notes ? ` ${release.notes}` : ""}
            </p>
            <button type="button" className="btn btn-navy" onClick={() => void installRelease()}>
              Update
            </button>
          </div>
        ) : null}
        {unread.map((notice) => (
          <div key={notice.id} className="flex flex-wrap items-center justify-between gap-3 bg-coral-soft px-4 py-3 text-navy">
            <p className="font-semibold">{notice.message}</p>
            <span className="flex gap-2">
              {notice.taskId ? (
                <button type="button" className="btn btn-navy" onClick={() => openTask(notice.taskId ?? null)}>Open task</button>
              ) : null}
              <button type="button" className="btn btn-ghost" onClick={() => dismissNotice(notice.id)}>OK</button>
            </span>
          </div>
        ))}
        <main className="min-h-0 flex-1 overflow-auto px-4 py-5 md:px-6">
          {view === "today" ? <Dashboard /> : null}
          {view === "calendar" ? <CalendarView /> : null}
          {view === "register" ? <RegisterView /> : null}
          {view === "tools" ? <ToolsView /> : null}
          {view === "people" ? <PeopleView /> : null}
        </main>
      </div>
      {hot ? (
        <div className="pointer-events-none fixed inset-0 z-30 grid place-items-center bg-navy/50 p-6">
          <p className="rounded-lg bg-card px-6 py-4 text-lg font-semibold text-navy">Drop to add a task</p>
        </div>
      ) : null}
      <TaskDrawer />
      <AcceptModal />
      {toast ? <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md bg-navy px-4 py-3 text-sm text-paper shadow-lg">{toast}</div> : null}
      {copies ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-navy/45 p-4" role="dialog" aria-label="Workbook copies">
          <div className="card modal grid gap-4 p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-navy">Workbook copies</h2>
                <p className="mt-1 text-sm text-muted">Both copies are written only to the shared drive. Each person has a folder in their username. Nothing is stored on this computer.</p>
              </div>
              <button type="button" className="btn btn-ghost min-w-11 px-3" aria-label="Close" onClick={() => setCopies(false)}>
                <X className="size-4" />
              </button>
            </div>
            <CopyRow title="Application" path={PATHS.application} />
            <CopyRow title="Backup" path={PATHS.backup} />
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-navy" onClick={downloadExcel}>
                <Download className="size-4" aria-hidden="true" />
                Export Excel
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => void downloadVault()}>Protected copy</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CopyRow({ title, path }: { title: string; path: string }) {
  return (
    <div className="rounded-md border border-line px-3 py-3">
      <p className="font-semibold text-navy">{title}</p>
      <p className="text-sm break-all text-muted">{path}</p>
      <p className="mt-1 text-sm text-muted">Profiles are folders named with the username.</p>
    </div>
  );
}
