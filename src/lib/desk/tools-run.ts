import * as XLSX from "xlsx";
import { addYearsISO, dayBefore, monthsBetween, parseLooseDate, todayISO } from "@/lib/desk/dates";
import type { DeskTool } from "@/lib/desk/types";
import { runAx, runInfotrack, runKindertons } from "@/lib/desk/macros";

export type TableRow = Record<string, string | number>;

export type MailDraft = {
  to: string;
  cc?: string;
  subject: string;
  body: string;
};

export type ToolResult = {
  summary: string;
  filename?: string;
  warnings: string[];
  emails?: MailDraft[];
  sheets: { name: string; rows: TableRow[]; aoa?: (string | number)[][] }[];
};

function norm(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function findKey(row: Record<string, string>, hints: string[]): string | undefined {
  const keys = Object.keys(row);
  for (const hint of hints) {
    const hit = keys.find((key) => norm(key).includes(norm(hint)));
    if (hit) return hit;
  }
  return undefined;
}

export async function readTable(file: File): Promise<Record<string, string>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0] ?? ""];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  return rows.map((row) => {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) out[String(key).trim()] = String(value ?? "").trim();
    return out;
  });
}

function money(value: number): string {
  return value.toLocaleString("en-GB", { style: "currency", currency: "GBP" });
}

function num(value: string): number {
  const n = Number(String(value).replace(/[£,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b([a-z])/g, (letter) => letter.toUpperCase());
}

export function limitationFor(accidentISO: string, dobISO: string | null, today = todayISO()): TableRow {
  let limitation = addYearsISO(accidentISO, 3);
  let rule = "Three years from the accident";
  if (dobISO) {
    const eighteenth = addYearsISO(dobISO, 18);
    const fromMajority = addYearsISO(eighteenth, 3);
    if (fromMajority > limitation) {
      limitation = fromMajority;
      rule = "Child: three years from the 18th birthday";
    }
  }
  const issueBy = dayBefore(limitation);
  const months = monthsBetween(today, limitation);
  return {
    "Limitation date": limitation,
    "Issue by": issueBy,
    Rule: rule,
    "Months left": months,
    Watch: months < 0 ? "Passed" : months < 6 ? "Inside six months" : "In time",
  };
}

const SAMPLE_TIME: Record<string, string>[] = [
  { Date: "02/11/2026", "Fee earner": "Fee earner 1", Matter: "10001", Hours: "1.5", Rate: "220" },
  { Date: "03/11/2026", "Fee earner": "Fee earner 1", Matter: "10002", Hours: "0.8", Rate: "220" },
  { Date: "03/11/2026", "Fee earner": "Fee earner 2", Matter: "10003", Hours: "2.2", Rate: "210" },
  { Date: "04/11/2026", "Fee earner": "Fee earner 2", Matter: "10001", Hours: "0.6", Rate: "310" },
  { Date: "04/11/2026", "Fee earner": "Fee earner 2", Matter: "10003", Hours: "1.1", Rate: "210" },
  { Date: "05/11/2026", "Fee earner": "Fee earner 3", Matter: "10004", Hours: "1.4", Rate: "120" },
];

const SAMPLE_DISB: Record<string, string>[] = [
  { Date: "01/11/2026", Supplier: "North Medical", Invoice: "NM-1001", Net: "400", VAT: "80", Gross: "480" },
  { Date: "02/11/2026", Supplier: "Court", Invoice: "FEE-22", Net: "154", VAT: "0", Gross: "154" },
  { Date: "03/11/2026", Supplier: "North Medical", Invoice: "NM-1001", Net: "400", VAT: "80", Gross: "480" },
  { Date: "04/11/2026", Supplier: "Records co", Invoice: "RC-9", Net: "90", VAT: "10", Gross: "100" },
  { Date: "05/11/2026", Supplier: "Counsel", Invoice: "", Net: "750", VAT: "150", Gross: "900" },
];

const SAMPLE_CLEAN: Record<string, string>[] = [
  { Name: "  helen fraser ", Email: "Helen@Fraser.co.uk", Postcode: "ne1 8ap", Matter: "pi-20418" },
  { Name: "MARK adelayo", Email: "mark@example.com", Postcode: "sr1 1pp", Matter: "hd-3310" },
  { Name: "", Email: "", Postcode: "", Matter: "" },
  { Name: "claire   nguyen", Email: "CLAIRE@NGUYEN.COM", Postcode: "dh1 3hp", Matter: "PI-18802" },
];

const SAMPLE_LIMIT: Record<string, string>[] = [
  { Client: "Robert Keane", "Accident date": "25/11/2023", "Date of birth": "04/02/1981" },
  { Client: "A. Singh", "Accident date": "12/06/2024", "Date of birth": "19/09/2014" },
  { Client: "Helen Fraser", "Accident date": "02/01/2025", "Date of birth": "" },
];

export function sampleRows(kind: DeskTool["kind"]): Record<string, string>[] | null {
  if (kind === "time") return SAMPLE_TIME;
  if (kind === "disbursement") return SAMPLE_DISB;
  if (kind === "cleaner") return SAMPLE_CLEAN;
  if (kind === "limitation") return SAMPLE_LIMIT;
  if (kind === "bundle") {
    return [
      { name: "Witness statement - Owen Blake.pdf", type: "application/pdf", size: "240000" },
      { name: "Orthopaedic report.pdf", type: "application/pdf", size: "1800000" },
      { name: "Photographs.zip", type: "application/zip", size: "8400000" },
      { name: "Schedule of loss.xlsx", type: "application/vnd.ms-excel", size: "64000" },
    ];
  }
  return null;
}

function summariseTime(rows: Record<string, string>[]): ToolResult {
  if (!rows.length) return { summary: "That sheet had no rows.", warnings: [], sheets: [] };
  const earnerKey = findKey(rows[0], ["fee earner", "earner", "name", "user"]);
  const matterKey = findKey(rows[0], ["matter", "reference", "ref", "file"]);
  const hoursKey = findKey(rows[0], ["hours", "units", "time"]);
  const rateKey = findKey(rows[0], ["rate", "charge"]);
  if (!earnerKey || !hoursKey) {
    return {
      summary: "Could not see a fee earner column and an hours column.",
      warnings: ["Use headings such as Fee earner, Matter, Hours and Rate."],
      sheets: [{ name: "Imported", rows }],
    };
  }
  const byEarner = new Map<string, { hours: number; value: number }>();
  const byMatter = new Map<string, { hours: number; value: number }>();
  let hours = 0;
  let value = 0;
  const detail = rows.map((row) => {
    const h = num(row[hoursKey] ?? "");
    const rate = rateKey ? num(row[rateKey] ?? "") : 0;
    const v = rate ? h * rate : 0;
    const earner = row[earnerKey] || "Unnamed";
    const matter = matterKey ? row[matterKey] || "No matter" : "No matter";
    hours += h;
    value += v;
    const e = byEarner.get(earner) ?? { hours: 0, value: 0 };
    e.hours += h;
    e.value += v;
    byEarner.set(earner, e);
    const m = byMatter.get(matter) ?? { hours: 0, value: 0 };
    m.hours += h;
    m.value += v;
    byMatter.set(matter, m);
    return { ...row, Value: v ? money(v) : "" };
  });
  const earnerRows = [...byEarner.entries()].map(([name, tot]) => ({
    "Fee earner": name,
    Hours: Math.round(tot.hours * 100) / 100,
    Value: money(tot.value),
  }));
  const matterRows = [...byMatter.entries()].map(([name, tot]) => ({
    Matter: name,
    Hours: Math.round(tot.hours * 100) / 100,
    Value: money(tot.value),
  }));
  return {
    summary: `${rows.length} lines. ${Math.round(hours * 100) / 100} hours, ${money(value)}.`,
    warnings: rateKey ? [] : ["No rate column, so values were left blank."],
    sheets: [
      { name: "By fee earner", rows: earnerRows },
      { name: "By matter", rows: matterRows },
      { name: "Detail", rows: detail },
    ],
  };
}

function checkDisbursements(rows: Record<string, string>[]): ToolResult {
  if (!rows.length) return { summary: "That sheet had no rows.", warnings: [], sheets: [] };
  const netKey = findKey(rows[0], ["net"]);
  const vatKey = findKey(rows[0], ["vat"]);
  const grossKey = findKey(rows[0], ["gross", "total"]);
  const invoiceKey = findKey(rows[0], ["invoice", "inv"]);
  if (!netKey) {
    return {
      summary: "Could not see a Net column.",
      warnings: ["Use headings Net, VAT, Gross and Invoice."],
      sheets: [{ name: "Imported", rows }],
    };
  }
  const seen = new Map<string, number>();
  const flagged: TableRow[] = [];
  rows.forEach((row, index) => {
    const net = num(row[netKey] ?? "");
    const vat = vatKey ? num(row[vatKey] ?? "") : 0;
    const gross = grossKey ? num(row[grossKey] ?? "") : net + vat;
    const invoice = invoiceKey ? row[invoiceKey] ?? "" : "";
    const notes: string[] = [];
    if (invoiceKey && !invoice) notes.push("Missing invoice");
    if (invoice) seen.set(invoice, (seen.get(invoice) ?? 0) + 1);
    if (vatKey && Math.abs(vat - net * 0.2) > 0.02 && vat !== 0) notes.push("VAT is not 20% of net");
    if (grossKey && Math.abs(gross - (net + vat)) > 0.02) notes.push("Gross does not equal net plus VAT");
    if (notes.length) {
      flagged.push({
        Row: index + 2,
        Invoice: invoice || "—",
        Net: net,
        VAT: vat,
        Gross: gross,
        Flags: notes.join("; "),
      });
    }
  });
  for (const [invoice, count] of seen) {
    if (count > 1) flagged.push({ Row: "", Invoice: invoice, Net: "", VAT: "", Gross: "", Flags: `Duplicate invoice (${count})` });
  }
  return {
    summary: flagged.length
      ? `${flagged.length} item${flagged.length === 1 ? "" : "s"} to look at.`
      : "Nothing to flag.",
    warnings: [],
    sheets: [
      { name: "Flags", rows: flagged },
      { name: "Imported", rows },
    ],
  };
}

function cleanSchedule(rows: Record<string, string>[]): ToolResult {
  if (!rows.length) return { summary: "That sheet had no rows.", warnings: [], sheets: [] };
  const keys = Object.keys(rows[0]);
  let dropped = 0;
  const cleaned = rows.flatMap((row) => {
    const next: Record<string, string> = {};
    let any = false;
    for (const key of keys) {
      let value = (row[key] ?? "").replace(/\s+/g, " ").trim();
      const n = norm(key);
      if (n.includes("email")) value = value.toLowerCase();
      else if (n.includes("postcode") || n === "pc") value = value.toUpperCase();
      else if (n.includes("name")) value = titleCase(value);
      if (value) any = true;
      next[key] = value;
    }
    if (!any) {
      dropped += 1;
      return [];
    }
    return [next];
  });
  return {
    summary: `${cleaned.length} rows kept. ${dropped} empty row${dropped === 1 ? "" : "s"} dropped.`,
    warnings: [],
    sheets: [{ name: "Cleaned", rows: cleaned }],
  };
}

function runLimitation(rows: Record<string, string>[], single?: { accident: string; dob: string; name: string }): ToolResult {
  const source = rows.length ? rows : single?.accident ? [{ Client: single.name || "Client", "Accident date": single.accident, "Date of birth": single.dob }] : [];
  if (!source.length) {
    return { summary: "Add an accident date or import a sheet.", warnings: [], sheets: [] };
  }
  const accidentKey = findKey(source[0], ["accident", "incident", "doa", "date"]);
  const dobKey = findKey(source[0], ["birth", "dob"]);
  const nameKey = findKey(source[0], ["client", "name"]);
  if (!accidentKey) {
    return {
      summary: "Could not see a date column.",
      warnings: ["Use a heading such as Accident date."],
      sheets: [{ name: "Imported", rows: source }],
    };
  }
  const today = todayISO();
  const warnings: string[] = [];
  const out = source.map((row) => {
    const accident = parseLooseDate(row[accidentKey] ?? "");
    const dob = dobKey ? parseLooseDate(row[dobKey] ?? "") : null;
    if (!accident) {
      warnings.push(`Skipped a row with no readable accident date (${row[nameKey ?? ""] || "unnamed"}).`);
      return { Client: nameKey ? row[nameKey] : "", "Accident date": row[accidentKey] ?? "", Note: "Date not read" };
    }
    return {
      Client: nameKey ? row[nameKey] : "",
      "Accident date": accident,
      ...(dobKey ? { "Date of birth": dob ?? "" } : {}),
      ...limitationFor(accident, dob, today),
    };
  });
  return {
    summary: `${out.length} diary date${out.length === 1 ? "" : "s"}. Check them before you rely on them.`,
    warnings,
    sheets: [{ name: "Limitation", rows: out as TableRow[] }],
  };
}

function runBundle(files: { name: string; type: string; size: number }[]): ToolResult {
  const rows = files.map((file, index) => ({
    No: index + 1,
    Document: file.name,
    Type: file.type || "File",
    "Size (KB)": Math.max(1, Math.round(file.size / 1024)),
    Pages: "",
    Included: "Yes",
  }));
  return {
    summary: `${rows.length} document${rows.length === 1 ? "" : "s"} indexed.`,
    warnings: ["Page counts are left blank for you to fill in."],
    sheets: [{ name: "Index", rows }],
  };
}

function runCustom(rows: Record<string, string>[], tool: DeskTool): ToolResult {
  const config = tool.config;
  if (!config) return { summary: "This tool has no setup yet.", warnings: [], sheets: [] };
  if (!rows.length) return { summary: "Import a sheet first.", warnings: [], sheets: [] };
  const column = findKey(rows[0], [config.column]) ?? (config.column in rows[0] ? config.column : undefined);
  if (!column) {
    return {
      summary: `Could not see a column called ${config.column}.`,
      warnings: [],
      sheets: [{ name: "Imported", rows }],
    };
  }
  if (config.mode === "dedupe") {
    const seen = new Set<string>();
    const kept = rows.filter((row) => {
      const key = (row[column] ?? "").toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return {
      summary: `${kept.length} unique rows. ${rows.length - kept.length} duplicates removed on ${column}.`,
      warnings: [],
      sheets: [{ name: "Deduped", rows: kept }],
    };
  }
  if (config.mode === "add-days") {
    const days = config.days ?? 0;
    const out = rows.map((row) => {
      const iso = parseLooseDate(row[column] ?? "");
      return { ...row, [`${column} plus ${days} days`]: iso ? shiftDays(iso, days) : "" };
    });
    return {
      summary: `Added ${days} days to ${column}.`,
      warnings: [],
      sheets: [{ name: "Dates", rows: out }],
    };
  }
  const sumKey = config.sumColumn ? findKey(rows[0], [config.sumColumn]) : undefined;
  const groups = new Map<string, { count: number; sum: number }>();
  for (const row of rows) {
    const key = row[column] || "(blank)";
    const g = groups.get(key) ?? { count: 0, sum: 0 };
    g.count += 1;
    if (sumKey) g.sum += num(row[sumKey] ?? "");
    groups.set(key, g);
  }
  const out = [...groups.entries()].map(([key, g]) => ({
    [column]: key,
    Rows: g.count,
    ...(sumKey ? { [sumKey]: Math.round(g.sum * 100) / 100 } : {}),
  }));
  return {
    summary: `${out.length} groups on ${column}.`,
    warnings: sumKey ? [] : ["No number column, so only row counts are shown."],
    sheets: [{ name: "Summary", rows: out }],
  };
}

function shiftDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  date.setDate(date.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export async function runTool(
  tool: DeskTool,
  files: File[],
  single?: { accident: string; dob: string; name: string },
  references: File[] = [],
): Promise<ToolResult> {
  if (tool.kind === "ax") return runAx(files, references);
  if (tool.kind === "infotrack") return runInfotrack(files);
  if (tool.kind === "kindertons") return runKindertons(files, references);
  if (tool.kind === "bundle") {
    const list = files.length
      ? files.map((file) => ({ name: file.name, type: file.type, size: file.size }))
      : (sampleRows("bundle") ?? []).map((row) => ({
          name: row.name,
          type: row.type,
          size: Number(row.size),
        }));
    return runBundle(list);
  }
  let rows: Record<string, string>[] = [];
  if (files[0]) rows = await readTable(files[0]);
  else rows = sampleRows(tool.kind) ?? [];
  if (tool.kind === "limitation") return runLimitation(files[0] ? rows : single?.accident ? [] : rows, single);
  if (tool.kind === "time") return summariseTime(rows);
  if (tool.kind === "disbursement") return checkDisbursements(rows);
  if (tool.kind === "cleaner") return cleanSchedule(rows);
  return runCustom(rows, tool);
}

export function resultWorkbook(result: ToolResult): Uint8Array {
  const wb = XLSX.utils.book_new();
  const sheets = result.sheets.length ? result.sheets : [{ name: "Result", rows: [] }];
  for (const sheet of sheets) {
    const ws = sheet.aoa?.length ? XLSX.utils.aoa_to_sheet(sheet.aoa) : XLSX.utils.json_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new Uint8Array(out);
}

export function downloadBytes(bytes: Uint8Array, filename: string, mime: string) {
  const blob = new Blob([copyBytes(bytes)], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function mailList(value: string): string {
  return value
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(",");
}

export function openOutlook(mail: MailDraft) {
  const query = new URLSearchParams();
  if (mail.cc) query.set("cc", mailList(mail.cc));
  query.set("subject", mail.subject);
  query.set("body", mail.body);
  const href = `mailto:${mailList(mail.to)}?${query.toString()}`;
  if (typeof window !== "undefined" && window.trueDesk) {
    void window.trueDesk.openOutlook(href);
    return;
  }
  const link = document.createElement("a");
  link.href = href;
  link.click();
}

function copyBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
