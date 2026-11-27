import { useEffect, useState } from "react";
import { occursOn, parseISODate, todayISO } from "@/lib/desk/dates";
import { useDesk } from "@/lib/desk/store";
import { remindMinutes, seesTeamTask, taskRepeat, type Task } from "@/lib/desk/types";

const seen = new Set<string>();
let audio: AudioContext | null = null;
let pulse: number | null = null;

function clock(day: string, time: string): Date | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const when = parseISODate(day);
  when.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return when;
}

function due(task: Task, now: Date): boolean {
  const minutes = remindMinutes(task.remind);
  if (!minutes || task.status === "done" || !task.time) return false;
  const today = todayISO(now);
  if (!occursOn(task.date, taskRepeat(task), today)) return false;
  const start = clock(today, task.time);
  if (!start) return false;
  start.setMinutes(start.getMinutes() - minutes);
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + minutes + 10);
  return now >= start && now <= end;
}

function ring() {
  if (!audio) return;
  const now = audio.currentTime;
  [0, 0.2, 0.4].forEach((offset, index) => {
    const tone = audio!.createOscillator();
    const gain = audio!.createGain();
    tone.type = "sine";
    tone.frequency.value = index === 1 ? 880 : 660;
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.18, now + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.16);
    tone.connect(gain);
    gain.connect(audio!.destination);
    tone.start(now + offset);
    tone.stop(now + offset + 0.18);
  });
}

function startAlarm() {
  stopAlarm();
  const Context = window.AudioContext;
  if (!Context) return;
  audio = new Context();
  void audio.resume();
  ring();
  pulse = window.setInterval(ring, 1700);
  void window.trueDesk?.focusWindow?.();
}

function stopAlarm() {
  if (pulse) window.clearInterval(pulse);
  pulse = null;
  void audio?.close();
  audio = null;
  void window.trueDesk?.clearAttention?.();
}

export function Reminders() {
  const data = useDesk((s) => s.data);
  const user = useDesk((s) => s.user);
  const openTask = useDesk((s) => s.openTask);
  const [task, setTask] = useState<Task | null>(null);

  useEffect(() => {
    if (!data || !user) return;
    const look = () => {
      const now = new Date();
      const today = todayISO(now);
      const next = data.tasks.find((item) => {
        if (item.assigneeId !== user.id && !seesTeamTask(item.assigneeId, user.role)) return false;
        const key = `${item.id}|${today}|${item.time}|${remindMinutes(item.remind)}`;
        return due(item, now) && !seen.has(key);
      });
      if (!next) return;
      seen.add(`${next.id}|${today}|${next.time}|${remindMinutes(next.remind)}`);
      setTask(next);
      startAlarm();
    };
    look();
    const timer = window.setInterval(look, 10000);
    return () => window.clearInterval(timer);
  }, [data, user]);

  useEffect(() => () => stopAlarm(), []);

  if (!task) return null;
  const minutes = remindMinutes(task.remind);

  function close() {
    stopAlarm();
    setTask(null);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy/55 p-4" role="alertdialog" aria-label="Task reminder">
      <div className="card w-full max-w-md p-6 shadow-2xl">
        <p className="text-sm font-semibold tracking-wide text-gold uppercase">Reminder</p>
        <h2 className="mt-2 text-2xl font-semibold text-navy">{task.title}</h2>
        <p className="mt-2 text-muted">
          Due at {task.time}. {minutes} minutes before.
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={close}>Dismiss</button>
          <button
            type="button"
            className="btn btn-gold"
            onClick={() => {
              openTask(task.id);
              close();
            }}
          >
            Open task
          </button>
        </div>
      </div>
    </div>
  );
}
