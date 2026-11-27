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

function nominalDate(anchor: string, year: number, month: number): string {
  const start = parseISODate(anchor);
  const last = new Date(year, month + 1, 0).getDate();
  return toISODate(new Date(year, month, Math.min(start.getDate(), last)));
}

/** Saturday and Sunday move back to the Friday. Weekdays stay put. */
export function onWorkingDay(iso: string): string {
  const d = parseISODate(iso);
  const day = d.getDay();
  if (day === 6) d.setDate(d.getDate() - 1);
  else if (day === 0) d.setDate(d.getDate() - 2);
  return toISODate(d);
}

function rolledMatch(anchor: string, repeat: "monthly" | "annual", iso: string): boolean {
  const start = parseISODate(anchor);
  const day = parseISODate(iso);
  for (let offset = 0; offset <= 1; offset += 1) {
    const probe = new Date(day.getFullYear(), day.getMonth() + offset, 1);
    if (repeat === "annual" && probe.getMonth() !== start.getMonth()) continue;
    const nominal = nominalDate(anchor, probe.getFullYear(), probe.getMonth());
    if (nominal < anchor) continue;
    if (onWorkingDay(nominal) === iso) return true;
  }
  return false;
}

export function occursOn(date: string, repeat: "once" | "daily" | "weekly" | "monthly" | "annual" | undefined, iso: string): boolean {
  if (!date || !iso) return false;
  if (!repeat || repeat === "once") return date === iso;
  if (iso < date && repeat !== "monthly" && repeat !== "annual") return false;
  if (repeat === "daily") return iso >= date;
  if (repeat === "weekly") return iso >= date && (utcDay(iso) - utcDay(date)) % 7 === 0;
  if (repeat === "monthly" || repeat === "annual") return rolledMatch(date, repeat, iso);
  return false;
}

/** Easter Sunday, Gregorian calendar. The date moves every year. */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return toISODate(new Date(year, month - 1, day));
}

function firstMonday(year: number, month: number): string {
  const date = new Date(year, month, 1);
  date.setDate(1 + ((1 - date.getDay() + 7) % 7));
  return toISODate(date);
}

function lastMonday(year: number, month: number): string {
  const date = new Date(year, month + 1, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return toISODate(date);
}

function label(map: Map<string, string>, iso: string, name: string) {
  const existing = map.get(iso);
  map.set(iso, existing ? `${existing} · ${name}` : name);
}

const holidayYears = new Map<number, Map<string, string>>();

/** England and Wales bank holidays for one year, including Christmas, Easter, and substitute days. */
export function bankHolidays(year: number): Map<string, string> {
  const cached = holidayYears.get(year);
  if (cached) return cached;
  const map = new Map<string, string>();
  const newYear = `${year}-01-01`;
  label(map, newYear, "New Year's Day");
  const newYearDay = parseISODate(newYear).getDay();
  if (newYearDay === 6) label(map, `${year}-01-03`, "New Year bank holiday");
  if (newYearDay === 0) label(map, `${year}-01-02`, "New Year bank holiday");

  const easter = easterSunday(year);
  label(map, addDays(easter, -2), "Good Friday");
  label(map, easter, "Easter Sunday");
  label(map, addDays(easter, 1), "Easter Monday");

  label(map, firstMonday(year, 4), "Early May bank holiday");
  label(map, lastMonday(year, 4), "Spring bank holiday");
  label(map, lastMonday(year, 7), "Summer bank holiday");

  const christmas = `${year}-12-25`;
  const boxing = `${year}-12-26`;
  label(map, christmas, "Christmas Day");
  label(map, boxing, "Boxing Day");
  const christmasDay = parseISODate(christmas).getDay();
  const boxingDay = parseISODate(boxing).getDay();
  if (christmasDay === 6) {
    label(map, `${year}-12-27`, "Christmas bank holiday");
    label(map, `${year}-12-28`, "Boxing Day bank holiday");
  } else if (christmasDay === 0) {
    label(map, `${year}-12-27`, "Christmas bank holiday");
  } else if (boxingDay === 6) {
    label(map, `${year}-12-28`, "Boxing Day bank holiday");
  } else if (boxingDay === 0) {
    label(map, `${year}-12-27`, "Boxing Day bank holiday");
  }
  holidayYears.set(year, map);
  return map;
}

export function holidayOn(iso: string): string {
  if (!iso || iso.length < 4) return "";
  const year = Number(iso.slice(0, 4));
  if (!Number.isFinite(year)) return "";
  return bankHolidays(year).get(iso) ?? "";
}

export function dayBefore(iso: string): string {
  return addDays(iso, -1);
}

export function monthsBetween(fromISO: string, toISO: string): number {
  const a = parseISODate(fromISO);
  const b = parseISODate(toISO);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}
