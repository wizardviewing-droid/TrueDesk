import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { desktopApi, filesFromPath } from "@/lib/desk/desktop";
import { LETTER_PATHS, LETTER_TO, billFile, cleanEmail, letterBody, letterFile, listStamp, matterLines } from "@/lib/desk/letters";
import { bytesToBase64 } from "@/lib/desk/tools-run";
import type { DeskTool } from "@/lib/desk/types";
import { useDesk } from "@/lib/desk/store";

type Row = { matter: string; letter: string; bill: string; cc: string; opened: boolean };

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

export function LettersDesk({ tool }: { tool: DeskTool }) {
  const user = useDesk((s) => s.user);
  const showToast = useDesk((s) => s.showToast);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState("");
  const [outstanding, setOutstanding] = useState<{ name: string; path: string; year: string; month: string }[]>([]);
  const [selected, setSelected] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [note, setNote] = useState("");
  const root = lookup(tool, "lists");
  const ready = Boolean(desktopApi()?.lettersList);

  async function refresh() {
    const api = desktopApi();
    if (!api?.lettersList || !root) return;
    const files = await api.lettersList(root);
    setOutstanding(files);
    setSelected((current) => (files.some((file) => file.path === current) ? current : files[0]?.path ?? ""));
  }

  useEffect(() => {
    void refresh().catch(() => setNote("The saved lists folder could not be read."));
  }, [root]);

  async function saveList() {
    const api = desktopApi();
    const matters = matterLines(draft);
    if (!api?.lettersWrite) {
      setNote("Saving a list works in the Windows app.");
      return;
    }
    if (!matters.length) {
      setNote("Enter at least one matter number.");
      return;
    }
    setBusy("Saving…");
    setNote("");
    try {
      const stamp = listStamp();
      const bytes = listBytes([["Matter number", "", "Letter", "Bill"], ...matters.map((matter) => [matter, "", "", ""])]);
      const saved = await api.lettersWrite({ root, year: stamp.year, month: stamp.month, name: stamp.name, base64: bytesToBase64(bytes) });
      setDraft("");
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
    const file = outstanding.find((item) => item.path === selected);
    if (!api?.lettersDir || !api.lettersWrite || !file) return;
    setBusy("Reading the list…");
    setRows([]);
    setNote("");
    try {
      const [saved] = await filesFromPath(file.path);
      if (!saved) throw new Error("That list could not be read.");
      const table = sheetRows(await saved.arrayBuffer(), "Matters");
      const matters = table.slice(1).map((row) => String(row[0] ?? "").trim()).filter(Boolean);
      if (!matters.length) throw new Error("That list has no matter numbers.");
      const bills = lookup(tool, "bills");
      const names = await api.lettersDir(bills);
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
      const made: Row[] = [];
      for (let index = 0; index < matters.length; index += 1) {
        const matter = matters[index];
        setBusy(`Opening ${index + 1} of ${matters.length}`);
        const letterName = letterFile(names.map((item) => item.name), matter);
        const billName = billFile(names.map((item) => item.name), matter);
        const letter = names.find((item) => item.name === letterName)?.path ?? "";
        const bill = names.find((item) => item.name === billName)?.path ?? "";
        const cc = emails.get(matter.toLowerCase()) ?? "";
        const opened = Boolean(letter || bill);
        if (opened && api.openOutlook) {
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
        made.push({ matter, letter: letter ? "Letter found" : "No letter", bill: bill ? "Bill found" : "No bill", cc, opened });
      }
      const updated = listBytes([
        ["Matter number", "", "Letter", "Bill"],
        ...made.map((row) => [row.matter, "", row.letter, row.bill]),
      ]);
      await api.lettersWrite({ root, filePath: file.path, base64: bytesToBase64(updated) });
      setRows(made);
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
      setRows([]);
      await refresh();
      showToast(`Completed. Renamed to ${next.split(/[/\\]/).pop() ?? "SENT"}.`);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "That file could not be renamed.");
    }
    setBusy("");
  }

  if (!ready) return <p className="text-sm text-muted">This tool runs in the Windows app, where it can save to the shared drive and open Outlook.</p>;

  return (
    <div className="grid gap-4">
      <label>
        <span className="label">Matter numbers</span>
        <textarea className="input min-h-36 py-2" value={draft} placeholder="One matter number on each line" onChange={(event) => setDraft(event.target.value)} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-gold" disabled={Boolean(busy)} onClick={() => void saveList()}>Save today's list</button>
        <span className="self-center text-sm text-muted">Saved under the year and month, named as today's date.</span>
      </div>
      <div className="rounded-2xl border border-line">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h3 className="font-semibold text-navy">Outstanding letters</h3>
          <button type="button" className="btn btn-ghost" onClick={() => void refresh()}>Refresh</button>
        </div>
        {outstanding.length ? (
          <ul className="max-h-64 overflow-auto">
            {outstanding.map((file) => (
              <li key={file.path}>
                <button type="button" className={file.path === selected ? "w-full bg-gold/20 px-4 py-2 text-left" : "w-full px-4 py-2 text-left"} onClick={() => { setSelected(file.path); setRows([]); }}>
                  <span className="block font-medium">{file.name}</span>
                  <span className="text-sm text-muted">{file.month} {file.year}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="px-4 py-3 text-sm text-muted">No lists are waiting. A file leaves this list when you confirm it is completed.</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-navy" disabled={!selected || Boolean(busy)} onClick={() => void runSelected()}>{busy || "Run selected list"}</button>
        {rows.length ? <button type="button" className="btn btn-gold" disabled={Boolean(busy)} onClick={() => void confirm()}>Confirm completed</button> : null}
      </div>
      {note ? <p className="text-sm text-muted">{note}</p> : null}
      {rows.length ? (
        <div className="overflow-auto rounded-xl border border-line">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>{["Matter", "Letter", "Bill", "CC"].map((title) => <th key={title} className="border-b border-line px-3 py-2 font-semibold text-muted">{title}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.matter}>
                  <td className="border-b border-line px-3 py-2">{row.matter}</td>
                  <td className="border-b border-line px-3 py-2">{row.letter}</td>
                  <td className="border-b border-line px-3 py-2">{row.bill}</td>
                  <td className="border-b border-line px-3 py-2">{row.cc || (row.opened ? "No CC" : "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
