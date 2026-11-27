export const LETTER_TO = "proclaim@true.co.uk";

export const LETTER_PATHS: Record<string, string> = {
  bills: "Y:\\accounts\\success fee bills\\",
  lists: "Y:\\accounts\\Tools\\Task application",
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function matterLines(value: string): string[] {
  const seen = new Set<string>();
  const rows: string[] = [];
  for (const line of value.split(/\r?\n/)) {
    const matter = line.trim();
    if (!matter) continue;
    const key = matter.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(matter);
  }
  return rows;
}

export function listStamp(when = new Date()): { year: string; month: string; name: string } {
  const year = String(when.getFullYear());
  const month = MONTHS[when.getMonth()] ?? "January";
  return { year, month, name: `${when.getDate()} ${month} ${year}.xlsx` };
}

export function cleanEmail(value: string): string {
  const text = value.trim().replace(/\s+/g, "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(text)) return "";
  return text;
}

export function letterFile(names: string[], matter: string): string {
  const needle = `our ref_ ${matter}`.toLowerCase();
  return names.find((name) => {
    const lower = name.toLowerCase();
    if (!/\.docx?$/i.test(name)) return false;
    const at = lower.indexOf(needle);
    if (at < 0) return false;
    const next = name[at + needle.length] ?? "";
    return next === "" || !/[A-Za-z0-9]/.test(next);
  }) ?? "";
}

export function billFile(names: string[], matter: string): string {
  const ref = matter.toLowerCase();
  return names.find((name) => {
    if (!/\.xlsx?$/i.test(name) && !/\.xlsm$/i.test(name)) return false;
    const cleaned = name.replace(/\u00a0/g, " ");
    const dot = cleaned.lastIndexOf(".");
    const stem = (dot > 0 ? cleaned.slice(0, dot) : cleaned).trim();
    const lower = stem.toLowerCase();
    const titled = lower.startsWith("success fee bill sent to client") || lower.startsWith("sf bill sent to account");
    return titled && stem.length >= matter.length && stem.slice(-matter.length).toLowerCase() === ref;
  }) ?? "";
}

export function letterBody(): string {
  return [
    "Hello,",
    "",
    "Please see attached documents relating to a payment which was recently sent to your account.",
    "",
    "Should you have any queries, please contact your file handler, whose contact details are on the attached letter.",
    "Kind Regards",
  ].join("\r\n");
}

export function sentName(name: string): string {
  return /^sent\b/i.test(name) ? name : `SENT ${name}`;
}
