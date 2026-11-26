export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(now = new Date()): string {
  return toISODate(now);
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function nextWorkingDay(iso: string): string {
  const d = parseISODate(iso);
  do {
    d.setDate(d.getDate() + 1);
  } while (d.getDay() === 0 || d.getDay() === 6);
  return toISODate(d);
}

export function shiftISO(days: number, now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function parseLooseDate(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const uk = v.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (uk) {
    const year = uk[3].length === 2 ? `20${uk[3]}` : uk[3];
    return `${year}-${pad(Number(uk[2]))}-${pad(Number(uk[1]))}`;
  }
  const parsed = new Date(v);
  if (Number.isNaN(parsed.getTime())) return null;
  return toISODate(parsed);
}

export function addMonthsISO(iso: string, months: number): string {
  const d = parseISODate(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toISODate(d);
}

export function nextRepeatDate(fromISO: string, repeat: "daily" | "weekly" | "monthly" | "annual", today = todayISO()): string {
  const step = (iso: string) => {
    if (repeat === "daily") return addDays(iso, 1);
    if (repeat === "weekly") return addDays(iso, 7);
    if (repeat === "monthly") return addMonthsISO(iso, 1);
    return addYearsISO(iso, 1);
  };
  let cursor = fromISO || today;
  let guard = 0;
  do {
    cursor = step(cursor);
    guard += 1;
  } while (cursor <= today && guard < 800);
  return cursor;
}

export function addYearsISO(iso: string, years: number): string {
  const d = parseISODate(iso);
  d.setFullYear(d.getFullYear() + years);
  return toISODate(d);
}

function utcDay(iso: string): number {
  const d = parseISODate(iso);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

export function occursOn(date: string, repeat: "once" | "daily" | "weekly" | "monthly" | "annual" | undefined, iso: string): boolean {
  if (!date || !iso) return false;
  if (!repeat || repeat === "once") return date === iso;
  if (iso < date) return false;
  if (repeat === "daily") return true;
  if (repeat === "weekly") return (utcDay(iso) - utcDay(date)) % 7 === 0;
  const start = parseISODate(date);
  const day = parseISODate(iso);
  if (repeat === "annual") return day.getMonth() === start.getMonth() && day.getDate() === start.getDate();
  const last = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();
  return day.getDate() === Math.min(start.getDate(), last);
}

export function dayBefore(iso: string): string {
  return addDays(iso, -1);
}

export function monthsBetween(fromISO: string, toISO: string): number {
  const a = parseISODate(fromISO);
  const b = parseISODate(toISO);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}
