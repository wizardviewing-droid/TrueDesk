import * as XLSX from "xlsx";
import axCases from "@/lib/desk/lookups/ax-cases.json";
import kindertonsMail from "@/lib/desk/lookups/kindertons-mail.json";
import { parseLooseDate } from "@/lib/desk/dates";
import type { ToolResult } from "@/lib/desk/tools-run";

type Grid = string[][];
type Sheet = { name: string; grid: Grid };

const AX_TO =
  "payments@accidentexchange.com; Laura Rooke <Lrooke@accidentexchange.com>; Andrew Milnes <andrew.milnes@true.co.uk>; Charlotte Hughes <chughes@accidentexchange.com>; Charlotte Payne <charlotte.payne@true.co.uk>; LDance@ax-uk.com; Behnaz.borji@true.co.uk";
const AX_CC = "paul.robinson@true.co.uk";
const AX_BODY = "Hi, payment for the attached remittance will be made today, and will reach your account tomorrow.";
const KINDERTONS_TO = "jass.spencer@kindertons.co.uk; emily.bradbury@kindertons.co.uk; emily.young@kindertons.co.uk";
const KINDERTONS_BODY =
  "Please find attached bordereaux and invoice relating to court fees which we have paid in the latest period.\n\nKind Regards";
const HEARING = new Set(["hearing fee - pba", "hearing fee fee - pba", "hearing fee fee pba"]);

function norm(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function num(value: string): number {
  const n = Number(String(value).replace(/[£,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function money(value: number): string {
  return value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function stamp(date = new Date()): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(date.getDate()).padStart(2, "0")}-${months[date.getMonth()]}-${String(date.getFullYear()).slice(2)}`;
}

function leadNumber(value: string): number | null {
  const match = value.match(/^\d+/);
  return match ? Number(match[0]) : null;
}

export async function readSheets(file: File): Promise<Sheet[]> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  return wb.SheetNames.map((name) => ({
    name,
    grid: XLSX.utils
      .sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: "", raw: false })
      .map((row) => row.map((cell) => String(cell ?? "").trim())),
  }));
}

function col(header: string[], hints: string[]): number {
  const names = header.map(norm);
  for (const hint of hints) {
    const wanted = norm(hint);
    const exact = names.findIndex((name) => name === wanted);
    if (exact >= 0) return exact;
  }
  for (const hint of hints) {
    const wanted = norm(hint);
    const hit = names.findIndex((name) => wanted && name.includes(wanted));
    if (hit >= 0) return hit;
  }
  return -1;
}

function posting(sheets: Sheet[]): { header: string[]; rows: Grid } | null {
  for (const sheet of sheets) {
    const limit = Math.min(sheet.grid.length, 25);
    for (let index = 0; index < limit; index += 1) {
      const header = sheet.grid[index] ?? [];
      if (col(header, ["matter"]) >= 0 && col(header, ["amount"]) >= 0) {
        return { header, rows: sheet.grid.slice(index + 1).filter((row) => row.some(Boolean)) };
      }
    }
  }
  const grid = sheets[0]?.grid.filter((row) => row.some(Boolean)) ?? [];
  if (grid.length < 2) return null;
  return { header: [], rows: grid };
}

function at(row: string[], index: number): string {
  return index >= 0 ? row[index] ?? "" : "";
}

type CaseHit = { client: string; source: string; ref: string; earner: string };

function caseBook(sheets: Sheet[]): Map<string, CaseHit> | null {
  for (const sheet of sheets) {
    const limit = Math.min(sheet.grid.length, 25);
    let headerAt = -1;
    for (let index = 0; index < limit; index += 1) {
      if (col(sheet.grid[index] ?? [], ["casekey", "case key", "key"]) >= 0) {
        headerAt = index;
        break;
      }
    }
    if (headerAt < 0) continue;
    const header = sheet.grid[headerAt] ?? [];
    const key = col(header, ["casekey", "case key", "key"]);
    const client = col(header, ["client"]);
    const ref = col(header, ["sourcereference", "source reference", "reference"]);
    const source = header.findIndex((cell, index) => index !== ref && norm(cell).includes("source"));
    const earner = col(header, ["feeearner", "fee earner", "handler"]);
    const map = new Map<string, CaseHit>();
    for (const row of sheet.grid.slice(headerAt + 1)) {
      const id = at(row, key);
      if (!id || map.has(id)) continue;
      map.set(id, { client: at(row, client), source: at(row, source), ref: at(row, ref), earner: at(row, earner) });
    }
    if (map.size) return map;
  }
  return null;
}

function mailSheet(name: string): boolean {
  const title = norm(name);
  return title === "mailinfo" || title === "emailaddresses" || title.includes("mail");
}

function axFromSheets(sheets: Sheet[]): Record<string, string> | null {
  for (const sheet of sheets) {
    if (!norm(sheet.name).includes("axcase")) continue;
    const map: Record<string, string> = {};
    for (const row of sheet.grid) {
      const key = (row[0] ?? "").trim();
      if (!key || norm(key).includes("case") || norm(key) === "key" || norm(key) === "matter") continue;
      if (!(key in map)) map[key] = (row[2] ?? "").trim();
    }
    if (Object.keys(map).length) return map;
  }
  return null;
}

async function axLookup(references: File[]): Promise<Record<string, string> | null> {
  if (!references.length) return null;
  const sheets = (await Promise.all(references.map(readSheets))).flat();
  return axFromSheets(sheets);
}

function mailBook(sheets: Sheet[]): Map<string, string> {
  const map = new Map<string, string>(Object.entries(kindertonsMail));
  for (const sheet of sheets) {
    if (!mailSheet(sheet.name)) continue;
    for (const row of sheet.grid) {
      const name = row[0]?.trim();
      const to = row[1]?.trim();
      if (name && to && norm(name) !== "name") map.set(name, to);
    }
  }
  return map;
}

function lookupMail(mail: Map<string, string>, name: string): string {
  if (mail.has(name)) return mail.get(name) ?? "";
  const wanted = name.toLowerCase();
  for (const [key, value] of mail) if (key.toLowerCase() === wanted) return value;
  return "";
}

function byDate(rows: Grid, index: number): Grid {
  return rows.slice().sort((a, b) => {
    const left = parseLooseDate(a[index] ?? "") ?? a[index] ?? "";
    const right = parseLooseDate(b[index] ?? "") ?? b[index] ?? "";
    return left.localeCompare(right);
  });
}

export async function runAx(files: File[], references: File[] = []): Promise<ToolResult> {
  if (!files.length) return { summary: "Drop the posting enquiry.", warnings: [], sheets: [] };
  const book = (await Promise.all(files.map(readSheets))).flat();
  const found = posting(book);
  if (!found) return { summary: "Could not see a posting enquiry.", warnings: ["Use the sheet with Matter and Amount columns."], sheets: [] };
  const header = found.header;
  const positioned = header.length === 0;
  const matter = positioned ? 4 : col(header, ["matter"]);
  const date = positioned ? 2 : col(header, ["date"]);
  const type = positioned ? 5 : col(header, ["type"]);
  const narrative = positioned ? 6 : col(header, ["narrative"]);
  const amount = positioned ? 7 : col(header, ["amount"]);
  const payee = positioned ? 10 : col(header, ["payee"]);
  const liveCases = await axLookup(references);
  const cases = liveCases ?? (axCases as Record<string, string>);
  const usedLive = Boolean(liveCases);
  let missed = 0;
  let total = 0;
  const body = found.rows
    .filter((row) => at(row, matter) || at(row, amount))
    .map((row) => {
      const key = at(row, matter);
      const known = Object.prototype.hasOwnProperty.call(cases, key);
      const ref = known ? cases[key] : "";
      if (!known) missed += 1;
      const value = num(at(row, amount));
      total += value;
      return [at(row, date), ref ?? "", key, at(row, type), at(row, narrative), money(value), at(row, payee)];
    });
  const when = stamp();
  const aoa = [
    ["", "", "", "", "", "", ""],
    ["AX", "30-80-12", "16728868", "", "", "", ""],
    ["", "", "", "", "", "", ""],
    ["Date", "Source reference", "Matter", "Type", "Narrative", "Amount", "Payee"],
    ...body,
    ["", "", "", "", "", money(total), ""],
  ];
  return {
    summary: `${body.length} payments, ${money(total)}. Save it as the remittance for ${when}.`,
    filename: `AX remittance ${when}.xlsx`,
    warnings: [
      ...(references.length ? [] : ["No AX case list is linked in settings, so the built-in list was used."]),
      ...(references.length && !usedLive ? ["The linked folder has no AX case list, so the built-in list was used."] : []),
      ...(missed ? [`${missed} matter${missed === 1 ? " was" : "s were"} not on the AX case list, so the source reference is blank.`] : []),
    ],
    emails: [{ to: AX_TO, cc: AX_CC, subject: "Remittance", body: AX_BODY }],
    sheets: [
      { name: "AX", rows: body.map((row) => ({ Date: row[0], "Source reference": row[1], Matter: row[2], Type: row[3], Narrative: row[4], Amount: row[5], Payee: row[6] })), aoa },
      {
        name: "Email",
        rows: [
          { Field: "To", Value: AX_TO },
          { Field: "Cc", Value: AX_CC },
          { Field: "Subject", Value: "Remittance" },
          { Field: "Body", Value: AX_BODY },
        ],
      },
    ],
  };
}

function moveBlock(grid: Grid, from: number, count: number, insertAt: number): Grid {
  return grid.map((row) => {
    const next = row.slice();
    while (next.length < from + count) next.push("");
    const block = next.splice(from, count);
    const atIndex = insertAt > from ? insertAt - count : insertAt;
    next.splice(Math.max(0, atIndex), 0, ...block);
    return next;
  });
}

function dropCols(grid: Grid, indexes: number[]): Grid {
  const drop = new Set(indexes);
  return grid.map((row) => row.filter((_, index) => !drop.has(index)));
}

function tidyMoney(value: string): string {
  if (!value || !/^[-£0-9.,\s]+$/.test(value)) return value;
  return money(num(value));
}

export async function runInfotrack(files: File[]): Promise<ToolResult> {
  if (!files.length) return { summary: "Drop the Infotrack download.", warnings: [], sheets: [] };
  const sheets = await readSheets(files[0]);
  let grid = (sheets[0]?.grid ?? []).filter((row) => row.some(Boolean));
  if (!grid.length) return { summary: "That workbook has no rows.", warnings: [], sheets: [] };
  grid = dropCols(grid, [0, 1, 2, 3]);
  grid = dropCols(grid, [1]);
  grid = dropCols(grid, [3]);
  grid = dropCols(grid, [4]);
  grid = dropCols(grid, [7]);
  grid = moveBlock(grid, 2, 1, 1);
  grid = moveBlock(grid, 3, 1, 2);
  grid = moveBlock(grid, 5, 1, 4);
  grid = moveBlock(grid, 6, 1, 5);
  grid = grid.slice(1);
  grid = moveBlock(grid, 3, 1, 0);
  grid = moveBlock(grid, 3, 1, 2);
  grid = moveBlock(grid, 4, 3, 3);
  grid = grid.map((row) => {
    const next = row.slice();
    while (next.length < 13) next.push("");
    next[3] = tidyMoney(next[3] ?? "");
    next[4] = tidyMoney(next[4] ?? "");
    next[5] = tidyMoney(next[5] ?? "");
    next[6] = "DDINFOTRACK";
    next[7] = "O15";
    next[8] = "Direct Debit";
    next[10] = "Infotrack";
    next[12] = "V8";
    return next;
  });
  const nominal: Grid = [];
  const ledger: Grid = [];
  for (let index = grid.length - 1; index >= 0; index -= 1) {
    const row = grid[index].slice();
    const matterNo = leadNumber(row[0] ?? "");
    if ((row[2] ?? "").toUpperCase().includes("ECOS")) {
      nominal.push(row);
      continue;
    }
    if (matterNo !== null && matterNo >= 635500) {
      row[4] = money(0);
      row[3] = row[5] ?? "";
    }
    ledger.push(row);
  }
  ledger.reverse();
  const nominalRows = nominal.map((row) => {
    const label = `${row[2] ?? ""} - ${row[0] ?? ""}`;
    const next = row.slice();
    next.splice(3, 0, label);
    next.splice(2, 1);
    next[0] = "6007";
    next.splice(1, 0, "0");
    return next;
  });
  const filtered: Grid = [];
  const kept: Grid = [];
  for (let index = ledger.length - 1; index >= 0; index -= 1) {
    const matterNo = leadNumber(ledger[index][0] ?? "");
    if (matterNo !== null && matterNo >= 635500) filtered.push(ledger[index]);
    else kept.push(ledger[index]);
  }
  kept.reverse();
  filtered.reverse();
  if (kept.length > 1) kept.pop();
  const asRows = (rows: Grid) =>
    rows.filter((row) => Array.isArray(row)).map((row) => {
      const cells = Array.from({ length: Math.max(row.length, 1) }, (_, index) => row[index] ?? "");
      return Object.fromEntries(cells.map((cell, index) => [`Column ${index + 1}`, cell]));
    });
  return {
    summary: `${kept.length} ledger rows, ${nominalRows.length} nominal rows, ${filtered.length} filtered.`,
    filename: "Infotrack.xlsx",
    warnings: [],
    sheets: [
      { name: "LEDGER", rows: asRows(kept), aoa: kept },
      { name: "Nominal", rows: asRows(nominalRows), aoa: nominalRows },
      { name: "Filtered LEDGER", rows: asRows(filtered), aoa: filtered },
    ],
  };
}

export async function runKindertons(files: File[], references: File[] = []): Promise<ToolResult> {
  if (!files.length) return { summary: "Drop the posting enquiry.", warnings: [], sheets: [] };
  const book = (await Promise.all(files.map(readSheets))).flat();
  const found = posting(book);
  if (!found) return { summary: "Could not see a posting enquiry.", warnings: ["Use the sheet with Matter and Amount columns."], sheets: [] };
  const header = found.header;
  const positioned = header.length === 0;
  const matter = positioned ? 4 : col(header, ["matter"]);
  const date = positioned ? 2 : col(header, ["date"]);
  const narrative = positioned ? 6 : col(header, ["narrative"]);
  const amount = positioned ? 7 : col(header, ["amount"]);
  const payee = positioned ? 10 : col(header, ["payee"]);
  const lists = references.length ? (await Promise.all(references.map(readSheets))).flat() : [];
  const cases = caseBook([...lists, ...book]);
  const warnings: string[] = [];
  if (!cases && !references.length) warnings.push("No case list is linked in settings, and none was with the posting.");
  else if (!cases) warnings.push("No case list was in the linked folder. Introducer, client, Kindertons ref and handler stay blank.");
  let missed = 0;
  const court = byDate(
    found.rows
      .filter((row) => at(row, matter) || at(row, amount))
      .map((row) => {
        const key = at(row, matter);
        const hit = cases?.get(key);
        if (cases && !hit?.source) missed += 1;
        return [at(row, date), key, hit?.client ?? "", at(row, narrative), money(num(at(row, amount))), at(row, payee), hit?.source ?? "", hit?.ref ?? "", hit?.earner ?? ""];
      })
      .filter((row) => !cases || row[6]),
    0,
  );
  if (missed) warnings.push(`${missed} matter${missed === 1 ? " was" : "s were"} not on the case list and left off the bordereau.`);
  const courtTotal = court.reduce((sum, row) => sum + num(row[4]), 0);
  const courtAoa = [
    ["Date", "Matter", "Client name", "Narrative", "Amount", "Payee", "Introducer", "Kindertons ref"],
    ...court.map((row) => row.slice(0, 8)),
    ["", "", "", "", money(courtTotal), "", "", ""],
  ];
  const invoiceRows = court.filter((row) => {
    const narrativeValue = (row[3] ?? "").trim().toLowerCase();
    return narrativeValue && !HEARING.has(narrativeValue);
  });
  const mail = mailBook([...lists, ...book]);
  const groups = new Map<string, Grid>();
  for (const row of invoiceRows) {
    const handler = row[8] || "No handler";
    const list = groups.get(handler) ?? [];
    list.push(row);
    groups.set(handler, list);
  }
  const emails = [...groups.entries()].map(([handler, rows]) => {
    const to = lookupMail(mail, handler);
    const fees = rows.length * 250;
    return {
      Handler: handler,
      To: to,
      Matters: rows.length,
      Fees: money(fees),
      VAT: money(fees * 0.2),
      Note: to ? "" : "No address on the mail list",
    };
  });
  const when = stamp();
  return {
    summary: `${court.length} court fees, ${money(courtTotal)}. Invoice count ${invoiceRows.length}. ${emails.length} handler email${emails.length === 1 ? "" : "s"}.`,
    filename: `Kindertons court fees ${when}.xlsx`,
    warnings,
    emails: [
      { to: KINDERTONS_TO, subject: "Court Fees Bordereaux and Invoice", body: KINDERTONS_BODY },
      ...emails.flatMap((mail) =>
        mail.To
          ? [{
              to: mail.To,
              subject: `Kindertons Fees for ${mail.Handler}`,
              body: `Hi, please find attached Fees billed to Kindertons in the latest period. Your total fees billed this period to Kindertons is £${mail.Fees}`,
            }]
          : [],
      ),
    ],
    sheets: [
      {
        name: "Court fees",
        aoa: courtAoa,
        rows: court.map((row) => ({ Date: row[0], Matter: row[1], "Client name": row[2], Narrative: row[3], Amount: row[4], Payee: row[5], Introducer: row[6], "Kindertons ref": row[7] })),
      },
      {
        name: "Invoice",
        rows: [
          { Field: "Invoice", Value: `Kindertons invoice ${when}` },
          { Field: "Matters", Value: String(invoiceRows.length) },
          { Field: "Hearing fees left off the invoice", Value: String(court.length - invoiceRows.length) },
        ],
      },
      {
        name: "Handler fees",
        rows: invoiceRows.map((row) => ({
          Handler: row[8] || "No handler",
          Date: row[0],
          Matter: row[1],
          "Client name": row[2],
          Narrative: row[3],
          Fee: money(250),
          VAT: money(50),
          "Kindertons ref": row[7],
        })),
      },
      { name: "Emails", rows: emails },
    ],
  };
}
