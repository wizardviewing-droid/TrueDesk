import { Pin, Settings, Upload } from "lucide-react";
import { useState } from "react";
import { cx } from "@/lib/cx";
import { MACRO_NEEDS } from "@/lib/desk/sources";
import { useDesk } from "@/lib/desk/store";
import { downloadBytes, bytesToBase64, openOutlook, resultWorkbook, runTool, XLSX_MIME, type MailDraft, type ToolResult } from "@/lib/desk/tools-run";
import type { DeskTool } from "@/lib/desk/types";
import { filesFromPath, pickFilePath, pickFolderPath } from "@/lib/desk/desktop";
import { LettersDesk } from "@/components/desk/letters-view";
import { LETTER_PATHS } from "@/lib/desk/letters";
import { sourceFolderFiles } from "@/lib/desk/storage";

export function ToolsView() {
  const data = useDesk((s) => s.data);
  const toolId = useDesk((s) => s.toolId);
  const setTool = useDesk((s) => s.setTool);
  const togglePin = useDesk((s) => s.togglePin);
  const removeTool = useDesk((s) => s.removeTool);
  const setLookupPath = useDesk((s) => s.setLookupPath);
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const tool = data?.tools.find((item) => item.id === toolId) ?? data?.tools[0];
  const settingsTool = data?.tools.find((item) => item.id === settingsFor) ?? null;
  if (!data || !tool) return null;

  return (
    <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="card h-fit overflow-hidden">
        <h1 className="border-b border-line px-4 py-3 text-xl font-semibold text-navy">Tool library</h1>
        <ul>
          {data.tools.map((item) => (
            <li key={item.id} className={cx("flex items-center border-b border-line last:border-b-0", item.id === tool.id && "bg-gold/15")}>
              <button type="button" className="min-w-0 flex-1 px-4 py-3 text-left" onClick={() => setTool(item.id)}>
                <span className="flex items-center gap-2">
                  <span className={cx("size-2.5 shrink-0 rounded-full", toolLook(item.kind).chip)} aria-hidden="true" />
                  <span className="truncate font-medium">{item.name}</span>
                </span>
                <span className="pl-4 text-sm text-muted">{item.pinned ? "On the menu" : "In the library"}</span>
              </button>
              <button type="button" className="btn btn-quiet mr-2 min-w-11 px-3" aria-label={`Settings for ${item.name}`} onClick={() => setSettingsFor(item.id)}>
                <Settings className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <Runner key={tool.id} tool={tool} onPin={() => togglePin(tool.id)} onRemove={() => removeTool(tool.id)} onSettings={() => setSettingsFor(tool.id)} />
      {settingsTool ? (
        <ToolSettings
          tool={settingsTool}
          onClose={() => setSettingsFor(null)}
          onSave={(paths) => {
            for (const [sourceId, path] of Object.entries(paths)) setLookupPath(settingsTool.id, sourceId, path);
            setSettingsFor(null);
          }}
        />
      ) : null}
    </div>
  );
}

function ToolSettings({
  tool,
  onClose,
  onSave,
}: {
  tool: DeskTool;
  onClose: () => void;
  onSave: (paths: Record<string, string>) => void;
}) {
  const needs = tool.kind === "ax" || tool.kind === "infotrack" || tool.kind === "kindertons" || tool.kind === "letters" ? MACRO_NEEDS[tool.kind] : [];
  const [paths, setPaths] = useState<Record<string, string>>(() =>
    Object.fromEntries(needs.map((need) => [need.id, tool.lookups?.find((item) => item.id === need.id)?.path || LETTER_PATHS[need.id] || ""])),
  );
  const [note, setNote] = useState("");

  async function choose(sourceId: string) {
    const folder = needs.find((need) => need.id === sourceId)?.folder;
    const picked = folder ? await pickFolderPath() : await pickFilePath();
    if (picked === "cancel") return;
    if (picked === "unavailable") {
      setNote("Select location works in the Windows app. You can still paste a path.");
      return;
    }
    setNote("");
    setPaths((current) => ({ ...current, [sourceId]: picked.path }));
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy/45 p-4" role="dialog" aria-label={`${tool.name} settings`}>
      <form
        className="card modal grid max-h-[85dvh] w-full gap-4 overflow-auto p-6"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(paths);
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-navy">{tool.name} settings</h2>
            <p className="mt-1 text-sm text-muted">Choose the files this tool should use, then save. Every desk uses the same paths.</p>
          </div>
          <button type="button" className="btn btn-ghost min-w-11 px-3" onClick={onClose}>Close</button>
        </div>
        {needs.length ? needs.map((need) => (
          <div key={need.id} className="rounded-md border border-line px-4 py-3">
            <p className="font-semibold text-navy">{need.title}</p>
            <p className="mt-1 text-sm text-muted">{need.detail}</p>
            <label className="mt-3 block">
              <span className="label">Path</span>
              <input
                className="input"
                value={paths[need.id] ?? ""}
                placeholder="No file selected"
                onChange={(event) => setPaths((current) => ({ ...current, [need.id]: event.target.value }))}
              />
            </label>
            <button type="button" className="btn btn-navy mt-3" onClick={() => void choose(need.id)}>{need.folder ? "Select folder" : "Select location"}</button>
          </div>
        )) : (
          <p className="text-sm text-muted">This tool has no file paths to set.</p>
        )}
        {note ? <p className="text-sm text-muted">{note}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn btn-gold">Save</button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

function toolLook(kind: string): { wash: string; ink: string; chip: string; eyebrow: string } {
  if (kind === "ax") return { wash: "from-[#0c1c4d] via-[#16356f] to-[#1e4f8a]", ink: "text-paper", chip: "bg-[#1e4f8a]", eyebrow: "Remittance" };
  if (kind === "infotrack") return { wash: "from-[#0c4f4a] via-[#0f6e66] to-[#1a9488]", ink: "text-paper", chip: "bg-[#0f6e66]", eyebrow: "Ledgers" };
  if (kind === "kindertons") return { wash: "from-[#fff1c2] via-[#f0c14a] to-[#e2ae32]", ink: "text-navy", chip: "bg-[#e2ae32]", eyebrow: "Court fees" };
  if (kind === "letters") return { wash: "from-[#14361f] via-[#1f6b3a] to-[#2f9a55]", ink: "text-paper", chip: "bg-[#1f6b3a]", eyebrow: "Letters" };
  return { wash: "from-[#eef6ff] via-[#f6f1ff] to-[#fff6dc]", ink: "text-navy", chip: "bg-[#d9ebff]", eyebrow: "Desk tool" };
}

function Runner({ tool, onPin, onRemove, onSettings }: { tool: DeskTool; onPin: () => void; onRemove: () => void; onSettings: () => void }) {
  const user = useDesk((s) => s.user);
  const [files, setFiles] = useState<File[]>([]);
  const [accident, setAccident] = useState("");
  const [dob, setDob] = useState("");
  const [client, setClient] = useState("");
  const [result, setResult] = useState<ToolResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [hot, setHot] = useState(false);
  const [dropKey, setDropKey] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const macro = tool.kind === "ax" || tool.kind === "infotrack" || tool.kind === "kindertons";
  const needs = tool.kind === "ax" || tool.kind === "infotrack" || tool.kind === "kindertons" ? MACRO_NEEDS[tool.kind] : [];
  const several = tool.kind === "bundle" || tool.kind === "kindertons" || tool.kind === "ax";
  const canSample = !macro && tool.kind !== "bundle" && tool.kind !== "custom";

  async function run(sample: boolean) {
    setBusy(true);
    const references =
      macro && !sample
        ? (
            await Promise.all(
              needs.map(async (need) => {
                const saved = tool.lookups?.find((item) => item.id === need.id)?.path ?? "";
                const fromDisk = await filesFromPath(saved);
                if (fromDisk.length) return fromDisk;
                return sourceFolderFiles(tool.id, need.id);
              }),
            )
          ).flat()
        : [];
    const output = await runTool(tool, sample ? [] : files, sample ? undefined : { accident, dob, name: client }, references);
    setResult(output);
    setBusy(false);
  }

  function finish() {
    setResult(null);
    setFiles([]);
    setAccident("");
    setDob("");
    setClient("");
    setHot(false);
    setDropKey((key) => key + 1);
  }

  const look = toolLook(tool.kind);
  const manager = user?.role === "manager";

  return (
    <section className="card overflow-hidden">
      <div className={cx("relative overflow-hidden bg-linear-to-br px-6 py-6", look.wash, look.ink)}>
        <div className="pointer-events-none absolute -top-8 -right-6 size-32 rounded-full bg-white/15" aria-hidden="true" />
        <div className="pointer-events-none absolute right-16 -bottom-10 size-24 rounded-full bg-white/10" aria-hidden="true" />
        <p className="text-[11px] font-semibold tracking-[0.16em] uppercase opacity-80">{look.eyebrow}</p>
        <h2 className="mt-1 text-3xl font-semibold">{tool.name}</h2>
        <p className="mt-2 max-w-2xl text-sm opacity-90">{tool.description}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn bg-card text-navy shadow-sm" onClick={onSettings}>
            <Settings className="size-4" aria-hidden="true" />
            Settings
          </button>
          <button type="button" className="btn bg-card text-navy shadow-sm" onClick={onPin}>
            <Pin className="size-4" aria-hidden="true" />
            {tool.pinned ? "Unpin" : "Pin to menu"}
          </button>
          {manager ? (
            confirmDelete ? (
              <>
                <button type="button" className="btn bg-card text-danger shadow-sm" onClick={onRemove}>Delete this tool</button>
                <button type="button" className="btn bg-card text-navy shadow-sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
              </>
            ) : (
              <button type="button" className="btn bg-card text-danger shadow-sm" onClick={() => setConfirmDelete(true)}>Delete</button>
            )
          ) : null}
        </div>
      </div>
      <div className="grid gap-4 px-5 py-5">
        {tool.kind === "letters" ? <LettersDesk tool={tool} /> : null}
        {tool.kind === "letters" ? null : tool.kind === "limitation" ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <label>
              <span className="label">Accident date</span>
              <input className="input" type="date" value={accident} onChange={(event) => setAccident(event.target.value)} />
            </label>
            <label>
              <span className="label">Date of birth</span>
              <input className="input" type="date" value={dob} onChange={(event) => setDob(event.target.value)} />
            </label>
            <label>
              <span className="label">Client</span>
              <input className="input" value={client} onChange={(event) => setClient(event.target.value)} />
            </label>
          </div>
        ) : null}
        {tool.kind === "letters" ? null : (
        <>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-gold" disabled={busy || (macro && !files.length)} onClick={() => void run(false)}>
            {busy ? "Working…" : files.length || accident ? "Run and build workbook" : macro ? "Drop a file first" : "Run the sample"}
          </button>
          {canSample && (files.length || accident) ? (
            <button type="button" className="btn btn-ghost" onClick={() => void run(true)}>Use the sample instead</button>
          ) : null}
        </div>
        <label
          data-tool-drop
          className={cx(
            "relative block cursor-pointer overflow-hidden rounded-2xl border border-dashed border-navy/20 bg-linear-to-b from-paper to-card px-6 py-8 text-center",
            hot && "border-gold bg-gold/15",
          )}
          onDragOver={(event) => {
            event.preventDefault();
            setHot(true);
          }}
          onDragLeave={() => setHot(false)}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setHot(false);
            setFiles([...event.dataTransfer.files]);
          }}
        >
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-navy text-gold shadow-sm">
            <Upload className="size-6" aria-hidden="true" />
          </span>
          <span className="mt-2 block font-medium">
            {files.length
              ? files.map((file) => file.name).join(", ")
              : tool.kind === "kindertons"
                ? "Drop the posting enquiry. The case list is read from the path in settings."
                : macro
                  ? "Drop the spreadsheet"
                  : "Drop a spreadsheet, or browse"}
          </span>
          <input
            key={dropKey}
            className="sr-only"
            type="file"
            multiple={several}
            onChange={(event) => setFiles([...(event.target.files ?? [])])}
          />
        </label>
        <p className="text-sm text-muted">
          {tool.kind === "ax"
            ? "Source references come from the AX case list path in settings. Open in Outlook attaches the remittance. Drop or browse if you want a different file."
            : tool.kind === "infotrack"
              ? "You get the ledger, the nominal sheet and the filtered ledger."
              : tool.kind === "kindertons"
                ? "The case list and handler addresses come from the paths in settings. Open in Outlook attaches the workbook. Drop or browse to use a different file."
                : "The desk writes a finished workbook you can download."}
        </p>
        {result ? <ResultCard result={result} name={tool.name} onComplete={finish} /> : null}
        </>
        )}
      </div>
    </section>
  );
}

function ResultCard({ result, name, onComplete }: { result: ToolResult; name: string; onComplete: () => void }) {
  const user = useDesk((s) => s.user);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [hot, setHot] = useState(false);
  const [note, setNote] = useState("");
  const rows = result.sheets[0]?.rows.slice(0, 8) ?? [];
  const headers = rows[0] ? Object.keys(rows[0]) : [];
  const made = result.filename || `${name}.xlsx`;

  async function send(mail: MailDraft) {
    setNote("");
    const chosen = attachment
      ? { name: attachment.name, base64: bytesToBase64(new Uint8Array(await attachment.arrayBuffer())) }
      : { name: made, base64: bytesToBase64(resultWorkbook(result)) };
    try {
      await openOutlook(mail, chosen, user?.username);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Outlook could not be opened.");
    }
  }

  return (
    <div className="rounded-md border border-line">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <p className="font-semibold text-navy">{result.summary}</p>
          {result.sheets.length > 1 ? (
            <p className="text-sm text-muted">{result.sheets.map((sheet) => sheet.name).join(" · ")}</p>
          ) : null}
          {result.warnings.map((warning) => <p key={warning} className="text-sm text-muted">{warning}</p>)}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-navy"
            onClick={() => downloadBytes(resultWorkbook(result), made, XLSX_MIME)}
          >
            Download result
          </button>
          {result.emails?.map((mail, index) => (
            <button
              key={`${mail.subject}-${mail.to}`}
              type="button"
              className="btn btn-gold"
              onClick={() => void send(mail)}
            >
              {index === 0 ? "Open in Outlook" : mail.subject}
            </button>
          ))}
          <button type="button" className="btn btn-gold" onClick={onComplete}>Complete</button>
        </div>
      </div>
      {result.emails?.length ? (
        <label
          className={cx("m-4 block cursor-pointer rounded-md border border-dashed border-line px-3 py-3 text-center text-sm", hot && "border-gold bg-gold/10")}
          onDragOver={(event) => {
            event.preventDefault();
            setHot(true);
          }}
          onDragLeave={() => setHot(false)}
          onDrop={(event) => {
            event.preventDefault();
            setHot(false);
            const file = event.dataTransfer.files[0];
            if (file) setAttachment(file);
          }}
        >
          <span className="font-medium text-navy">
            {attachment ? `Attached: ${attachment.name}` : `Attached: ${made}`}
          </span>
          <span className="mt-1 block text-muted">Drop a file here, or browse, to attach something else.</span>
          <input className="sr-only" type="file" onChange={(event) => setAttachment(event.target.files?.[0] ?? null)} />
        </label>
      ) : null}
      {note ? <p className="px-4 pb-3 text-sm text-muted">{note}</p> : null}
      {headers.length ? (
        <div className="overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>{headers.map((header) => <th key={header} className="border-b border-line px-3 py-2 font-semibold text-muted">{header}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  {headers.map((header) => <td key={header} className="border-b border-line px-3 py-2 tabular-nums">{String(row[header] ?? "")}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
