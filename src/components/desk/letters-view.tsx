import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { desktopApi, filesFromPath } from "@/lib/desk/desktop";
import { LETTER_PATHS, LETTER_TO, billFile, cleanEmail, letterBody, letterFile, listStamp } from "@/lib/desk/letters";
import { bytesToBase64 } from "@/lib/desk/tools-run";
import type { DeskTool } from "@/lib/desk/types";
import { useDesk } from "@/lib/desk/store";

type Mark = "" | "yes" | "no";
type Line = { matter: string; sf: string; letter: Mark; bill: Mark; cc: string };

const BLANKS = 8;

function emptyLine(): Line {
  return { matter: "", sf: "", letter: "", bill: "", cc: "" };
}

function lookup(tool: DeskTool, id: string): string {
  return tool.lookups?.find((item) => item.id === id)?.path?.trim() || LETTER_PATHS[id] || "";
}

function sheetRows(bytes: ArrayBuffer, preferred: string): string[][] {
  const book = XLSX.read(bytes, { type: "array" });
  const name = book.SheetNames.find((item) => item.toLowerCase() === preferred.toLowerCase()) ?? book.SheetNames[0];
  if (!name) return [];
  return XLSX.utils.sheet_to_json<string[]>(book.Sheets[name], { header: 1, raw: false, defval: "" });
}

function listBytes(rows: string[][]): Uint8Array {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "Matters");
  const out = XLSX.write(book, { type: "array", bookType: "xlsx" }) as number[];
  return Uint8Array.from(out);
}

function sfValue(value: string): string {
  const text = value.trim().toUpperCase();
  if (text.startsWith("Y")) return "Y";
  if (text.startsWith("N")) return "N";
  return "";
}

function markOf(value: string): Mark {
  const text = value.trim().toLowerCase();
  if (!text) return "";
  if (text.startsWith("no")) return "no";
  if (text.includes("found") || text === "yes") return "yes";
  return "";
}

function pad(lines: Line[]): Line[] {
  const next = [...lines];
  while (next.length < BLANKS) next.push(emptyLine());
  return next;
}

function sheetFrom(lines: Line[]): string[][] {
  return [
    ["Matter number", "SF?", "Letter found", "Bill found"],
    ...lines
      .filter((line) => line.matter.trim())
      .map((line) => [
        line.matter.trim(),
        line.sf,
        line.letter === "yes" ? "Letter found" : line.letter === "no" ? "No letter" : "",
        line.bill === "yes" ? "Bill found" : line.bill === "no" ? "No bill" : "",
      ]),
  ];
}

function MarkIcon({ found, label }: { found: Mark; label: string }) {
  if (!found) return <span className="text-sm text-muted">—</span>;
  const yes = found === "yes";
  return (
    <svg viewBox="0 0 32 32" className="mx-auto size-8" role="img" aria-label={yes ? `${label} found` : `No ${label.toLowerCase()}`}>
      <circle cx="16" cy="16" r="14" fill={yes ? "#1f8a4c" : "#d64545"} />
      {yes ? (
        <path d="M8.5 16.5 13.2 21.2 23.5 10.8" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M11 11 21 21 M21 11 11 21" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      )}
    </svg>
  );
}

export function LettersDesk({ tool }: { tool: DeskTool }) {
  const user = useDesk((s) => s.user);
  const showToast = useDesk((s) => s.showToast);
  const [lines, setLines] = useState<Line[]>(() => pad([]));
  const [busy, setBusy] = useState("");
  const [outstanding, setOutstanding] = useState<{ name: string; path: string; year: string; month: string }[]>([]);
  const [selected, setSelected] = useState("");
  const [ran, setRan] = useState(false);
  const [note, setNote] = useState("");
  const root = lookup(tool, "lists");

  function edit(index: number, patch: Partial<Line>) {
    setLines((current) => current.map((line, item) => (item === index ? { ...line, ...patch } : line)));
    setRan(false);
  }

  async function refresh() {
    const api = desktopApi();
    if (!api?.lettersList || !root) return;
    const files = await api.lettersList(root);
    setOutstanding(files);
    setSelected((current) => (files.some((file) => file.path === current) ? current : ""));
  }

  useEffect(() => {
    void refresh().catch(() => setNote("The saved lists folder could not be read."));
  }, [root]);

  async function openList(filePath: string) {
    setSelected(filePath);
    setRan(false);
    setNote("");
    const [saved] = await filesFromPath(filePath);
    if (!saved) {
      setNote("That list could not be read.");
      return;
    }
    const table = sheetRows(await saved.arrayBuffer(), "Matters").slice(1);
    const loaded = table
      .map((row) => ({
        matter: String(row[0] ?? "").trim(),
        sf: sfValue(String(row[1] ?? "")),
        letter: markOf(String(row[2] ?? "")),
        bill: markOf(String(row[3] ?? "")),
        cc: "",
      }))
      .filter((line) => line.matter);
    setLines(pad(loaded));
  }

  function pasteMatters(index: number, text: string) {
    const chunks = text.split(/\r?\n/).map((line) => line.split("\t")).filter((chunk, item, all) => chunk.join("").trim() || item < all.length - 1);
    if (chunks.length < 2 && !text.includes("\t")) return false;
    setLines((current) => {
      const next = [...current];
      chunks.forEach((chunk, offset) => {
        const at = index + offset;
        while (next.length <= at) next.push(emptyLine());
        next[at] = {
          ...next[at],
          matter: (chunk[0] ?? "").trim(),
          sf: chunk[1] ? sfValue(chunk[1]) : next[at].sf,
          letter: "",
          bill: "",
        };
      });
      return next;
    });
    setRan(false);
    return true;
  }

  async function fileNames() {
    const api = desktopApi();
    if (!api?.lettersDir) throw new Error("Checking the files works in the Windows app.");
    return api.lettersDir(lookup(tool, "bills"));
  }

  async function checkFiles() {
    const filled = lines.filter((line) => line.matter.trim());
    if (!filled.length) {
      setNote("Enter at least one matter number.");
      return;
    }
    setBusy("Checking the letters and bills…");
    setNote("");
    try {
      const names = await fileNames();
      setLines((current) =>
        current.map((line) => {
          if (!line.matter.trim()) return line;
          return {
            ...line,
            letter: letterFile(names.map((item) => item.name), line.matter.trim()) ? "yes" : "no",
            bill: billFile(names.map((item) => item.name), line.matter.trim()) ? "yes" : "no",
          };
        }),
      );
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Those files could not be checked.");
    }
    setBusy("");
  }

  async function saveList() {
    const api = desktopApi();
    const filled = lines.filter((line) => line.matter.trim());
    if (!api?.lettersWrite) {
      setNote("Saving a list works in the Windows app.");
      return;
    }
    if (!filled.length) {
      setNote("Enter at least one matter number.");
      return;
    }
    setBusy("Saving…");
    setNote("");
    try {
      const stamp = listStamp();
      const saved = await api.lettersWrite({
        root,
        year: stamp.year,
        month: stamp.month,
        name: stamp.name,
        base64: bytesToBase64(listBytes(sheetFrom(lines))),
      });
      await refresh();
      setSelected(saved);
      showToast(`Saved ${saved.split(/[/\\]/).pop() ?? "the list"}.`);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "That list could not be saved.");
    }
    setBusy("");
  }

  async function runSelected() {
    const api = desktopApi();
    const filled = lines.filter((line) => line.matter.trim());
    if (!api?.lettersDir || !api.openOutlook || !filled.length) {
      setNote("Enter the matter numbers first.");
      return;
    }
    setBusy("Reading the files…");
    setNote("");
    try {
      const names = await fileNames();
      const emails = new Map<string, string>();
      const emailPath = lookup(tool, "emails");
      if (emailPath) {
        const [book] = await filesFromPath(emailPath);
        if (book) {
          for (const line of sheetRows(await book.arrayBuffer(), "Data1").slice(1)) {
            const key = String(line[0] ?? "").trim().toLowerCase();
            const email = cleanEmail(String(line[1] ?? ""));
            if (key && email) emails.set(key, email);
          }
        }
      }
      const body = letterBody();
      const made: Line[] = [];
      for (let index = 0; index < filled.length; index += 1) {
        const line = filled[index];
        const matter = line.matter.trim();
        setBusy(`Opening ${index + 1} of ${filled.length}`);
        const letterName = letterFile(names.map((item) => item.name), matter);
        const billName = billFile(names.map((item) => item.name), matter);
        const letter = names.find((item) => item.name === letterName)?.path ?? "";
        const bill = names.find((item) => item.name === billName)?.path ?? "";
        const cc = emails.get(matter.toLowerCase()) ?? "";
        if (letter || bill) {
          await api.openOutlook({
            to: LETTER_TO,
            cc,
            subject: `A1${matter}`,
            body,
            username: user?.username ?? "",
            fileName: "",
            fileBase64: "",
            files: [letter, bill].filter(Boolean),
          });
        }
        made.push({ ...line, matter, letter: letter ? "yes" : "no", bill: bill ? "yes" : "no", cc });
      }
      setLines(pad(made));
      setRan(true);
      if (selected && api.lettersWrite) {
        await api.lettersWrite({ root, filePath: selected, base64: bytesToBase64(listBytes(sheetFrom(made))) });
      }
      setNote(emailPath ? "" : "No email list is set, so the messages have no CC address. Choose it in Settings.");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "That list could not be run.");
    }
    setBusy("");
  }

  async function confirm() {
    const api = desktopApi();
    if (!api?.lettersRename || !selected) return;
    setBusy("Renaming…");
    try {
      const next = await api.lettersRename({ root, filePath: selected });
      setLines(pad([]));
      setRan(false);
      setSelected("");
      await refresh();
      showToast(`Completed. Renamed to ${next.split(/[/\\]/).pop() ?? "SENT"}.`);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "That file could not be renamed.");
    }
    setBusy("");
  }

  return (
    <div className="grid gap-4">
      <div className="overflow-auto rounded-xl border border-line">
        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
          <thead>
            <tr className="bg-paper">
              {["Matter number", "SF?", "Letter found", "Bill found"].map((title) => (
                <th key={title} className="border border-line px-3 py-2 font-semibold text-navy">{title}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={index}>
                <td className="border border-line p-0">
                  <input
                    className="h-11 w-full bg-transparent px-3 outline-none"
                    value={line.matter}
                    aria-label={`Matter number ${index + 1}`}
                    onChange={(event) => edit(index, { matter: event.target.value, letter: "", bill: "" })}
                    onPaste={(event) => {
                      if (pasteMatters(index, event.clipboardData.getData("text"))) event.preventDefault();
                    }}
                  />
                </td>
                <td className="w-24 border border-line p-0">
                  <input
                    className="h-11 w-full bg-transparent px-3 text-center font-semibold uppercase outline-none"
                    value={line.sf}
                    maxLength={1}
                    aria-label={`SF for row ${index + 1}`}
                    placeholder="Y/N"
                    onChange={(event) => edit(index, { sf: sfValue(event.target.value) })}
                  />
                </td>
                <td className="w-36 border border-line px-3 py-1 text-center"><MarkIcon found={line.letter} label="Letter" /></td>
                <td className="w-36 border border-line px-3 py-1 text-center"><MarkIcon found={line.bill} label="Bill" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-ghost" onClick={() => setLines((current) => [...current, emptyLine()])}>Add a row</button>
        <button type="button" className="btn btn-navy" disabled={Boolean(busy)} onClick={() => void checkFiles()}>Check files</button>
        <button type="button" className="btn btn-gold" disabled={Boolean(busy)} onClick={() => void saveList()}>Save today's list</button>
      </div>
      {busy ? <p className="text-sm text-muted">{busy}</p> : null}
      <p className="text-sm text-muted">A letter is the Word document. A bill is the Excel document. A green tick means it was found. A red cross means it was not.</p>
      <div className="rounded-2xl border border-line">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h3 className="font-semibold text-navy">Outstanding letters</h3>
          <button type="button" className="btn btn-ghost" onClick={() => void refresh()}>Refresh</button>
        </div>
        {outstanding.length ? (
          <ul className="max-h-48 overflow-auto">
            {outstanding.map((file) => (
              <li key={file.path}>
                <button type="button" className={file.path === selected ? "w-full bg-gold/20 px-4 py-2 text-left" : "w-full px-4 py-2 text-left"} onClick={() => void openList(file.path)}>
                  <span className="block font-medium">{file.name}</span>
                  <span className="text-sm text-muted">{file.month} {file.year}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="px-4 py-3 text-sm text-muted">No lists are waiting. A file leaves this list when you confirm it is completed.</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-navy" disabled={Boolean(busy)} onClick={() => void runSelected()}>Run</button>
        {ran && selected ? <button type="button" className="btn btn-gold" disabled={Boolean(busy)} onClick={() => void confirm()}>Confirm completed</button> : null}
      </div>
      {note ? <p className="text-sm text-muted">{note}</p> : null}
    </div>
  );
}
