import { Pin, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { cx } from "@/lib/cx";
import { MACRO_NEEDS } from "@/lib/desk/sources";
import { useDesk } from "@/lib/desk/store";
import { downloadBytes, openOutlook, resultWorkbook, runTool, XLSX_MIME, type ToolResult } from "@/lib/desk/tools-run";
import type { CustomMode, DeskTool } from "@/lib/desk/types";
import { filesFromPath, pickFilePath } from "@/lib/desk/desktop";
import { sourceFolderFiles } from "@/lib/desk/storage";

export function ToolsView() {
  const data = useDesk((s) => s.data);
  const toolId = useDesk((s) => s.toolId);
  const setTool = useDesk((s) => s.setTool);
  const togglePin = useDesk((s) => s.togglePin);
  const addCustomTool = useDesk((s) => s.addCustomTool);
  const removeTool = useDesk((s) => s.removeTool);
  const tool = data?.tools.find((item) => item.id === toolId) ?? data?.tools[0];
  if (!data || !tool) return null;

  return (
    <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="card h-fit overflow-hidden">
        <h1 className="border-b border-line px-4 py-3 text-xl font-semibold text-navy">Tool library</h1>
        <ul>
          {data.tools.map((item) => (
            <li key={item.id} className={cx("border-b border-line last:border-b-0", item.id === tool.id && "bg-gold/15")}>
              <button type="button" className="w-full px-4 py-3 text-left" onClick={() => setTool(item.id)}>
                <span className="block font-medium">{item.name}</span>
                <span className="text-sm text-muted">{item.pinned ? "On the dashboard" : "In the library"}</span>
              </button>
            </li>
          ))}
        </ul>
        <CustomForm onAdd={addCustomTool} />
      </aside>
      <Runner key={tool.id} tool={tool} onPin={() => togglePin(tool.id)} onRemove={() => removeTool(tool.id)} />
    </div>
  );
}

function CustomForm({
  onAdd,
}: {
  onAdd: (input: { name: string; description: string; mode: CustomMode; column: string; sumColumn?: string; days?: number }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<CustomMode>("sum-by");
  const [column, setColumn] = useState("");
  const [sumColumn, setSumColumn] = useState("");
  const [days, setDays] = useState(3);
  if (!open) {
    return (
      <button type="button" className="btn btn-quiet m-3" onClick={() => setOpen(true)}>
        Add a tool
      </button>
    );
  }
  return (
    <form
      className="grid gap-3 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onAdd({ name, description, mode, column, sumColumn, days });
        setName("");
        setColumn("");
        setOpen(false);
      }}
    >
      <label>
        <span className="label">Name</span>
        <input className="input" value={name} onChange={(event) => setName(event.target.value)} required />
      </label>
      <label>
        <span className="label">What it does</span>
        <input className="input" value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <label>
        <span className="label">Action</span>
        <select className="input" value={mode} onChange={(event) => setMode(event.target.value as CustomMode)}>
          <option value="sum-by">Group and total</option>
          <option value="dedupe">Remove duplicates</option>
          <option value="add-days">Add days to a date</option>
        </select>
      </label>
      <label>
        <span className="label">Column</span>
        <input className="input" value={column} placeholder="Matter" onChange={(event) => setColumn(event.target.value)} required />
      </label>
      {mode === "sum-by" ? (
        <label>
          <span className="label">Number column</span>
          <input className="input" value={sumColumn} placeholder="Hours" onChange={(event) => setSumColumn(event.target.value)} />
        </label>
      ) : null}
      {mode === "add-days" ? (
        <label>
          <span className="label">Days</span>
          <input className="input" type="number" value={days} onChange={(event) => setDays(Number(event.target.value))} />
        </label>
      ) : null}
      <button className="btn btn-navy" type="submit">Save to the library</button>
    </form>
  );
}

function MacroSettings({ tool, onPath }: { tool: DeskTool; onPath: (toolId: string, sourceId: string, path: string) => void }) {
  const needs = MACRO_NEEDS[tool.kind as "ax" | "infotrack" | "kindertons"] ?? [];
  if (!needs.length) {
    return (
      <div className="rounded-md border border-line px-4 py-3">
        <p className="font-semibold text-navy">Settings</p>
        <p className="mt-1 text-sm text-muted">Looking for the Infotrack download you drop here. This tool does not use another list.</p>
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      <p className="font-semibold text-navy">Settings</p>
      {needs.map((need) => (
        <SourcePath key={need.id} tool={tool} sourceId={need.id} title={need.title} detail={need.detail} onPath={onPath} />
      ))}
    </div>
  );
}

function SourcePath({
  tool,
  sourceId,
  title,
  detail,
  onPath,
}: {
  tool: DeskTool;
  sourceId: string;
  title: string;
  detail: string;
  onPath: (toolId: string, sourceId: string, path: string) => void;
}) {
  const saved = tool.lookups?.find((item) => item.id === sourceId)?.path ?? "";
  const [path, setPath] = useState(saved);
  const [focused, setFocused] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!focused) setPath(saved);
  }, [saved, focused]);

  async function choose() {
    const picked = await pickFilePath();
    if (picked === "cancel") return;
    if (picked === "unavailable") {
      setNote("Select location works in the Windows app. You can still paste a path.");
      return;
    }
    setPath(picked.path);
    setFocused(false);
    setNote("");
    onPath(tool.id, sourceId, picked.path);
  }

  return (
    <div className="rounded-md border border-line px-4 py-3">
      <p className="font-semibold text-navy">Looking for: {title}</p>
      <p className="mt-1 text-sm text-muted">{detail} The path is saved on the shared drive, so every desk uses the same file.</p>
      <label className="mt-3 block">
        <span className="label">Path</span>
        <input
          className="input"
          value={path}
          placeholder="No file selected"
          onFocus={() => setFocused(true)}
          onChange={(event) => setPath(event.target.value)}
          onBlur={() => {
            setFocused(false);
            onPath(tool.id, sourceId, path);
          }}
        />
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-navy" onClick={() => void choose()}>
          Select location
        </button>
        <span className="text-sm text-muted">{path.trim() ? "Saved for every desk." : "No file selected."}</span>
      </div>
      {note ? <p className="mt-1 text-sm text-muted">{note}</p> : null}
    </div>
  );
}

function Runner({ tool, onPin, onRemove }: { tool: DeskTool; onPin: () => void; onRemove: () => void }) {
  const setLookupPath = useDesk((s) => s.setLookupPath);
  const [files, setFiles] = useState<File[]>([]);
  const [accident, setAccident] = useState("");
  const [dob, setDob] = useState("");
  const [client, setClient] = useState("");
  const [result, setResult] = useState<ToolResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [hot, setHot] = useState(false);
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

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="text-2xl font-semibold text-navy">{tool.name}</h2>
          <p className="mt-1 max-w-2xl text-muted">{tool.description}</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={onPin}>
          <Pin className="size-4" aria-hidden="true" />
          {tool.pinned ? "Unpin" : "Pin to dashboard"}
        </button>
      </div>
      <div className="grid gap-4 px-5 py-4">
        {tool.kind === "limitation" ? (
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
        {macro ? <MacroSettings tool={tool} onPath={setLookupPath} /> : null}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-gold" disabled={busy || (macro && !files.length)} onClick={() => void run(false)}>
            {busy ? "Working…" : files.length || accident ? "Run and build workbook" : macro ? "Drop a file first" : "Run the sample"}
          </button>
          {canSample && (files.length || accident) ? (
            <button type="button" className="btn btn-ghost" onClick={() => void run(true)}>Use the sample instead</button>
          ) : null}
          {tool.kind === "custom" ? (
            <button type="button" className="btn btn-quiet text-danger" onClick={onRemove}>Remove tool</button>
          ) : null}
        </div>
        <label
          data-tool-drop
          className={cx("dropzone block cursor-pointer px-4 py-4 text-center", hot && "is-hot")}
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
          <Upload className="mx-auto size-5 text-navy" aria-hidden="true" />
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
            className="sr-only"
            type="file"
            multiple={several}
            onChange={(event) => setFiles([...(event.target.files ?? [])])}
          />
        </label>
        <p className="text-sm text-muted">
          {tool.kind === "ax"
            ? "Source references come from the AX case list path in settings. Open in Outlook brings up the remittance for you to send."
            : tool.kind === "infotrack"
              ? "You get the ledger, the nominal sheet and the filtered ledger."
              : tool.kind === "kindertons"
                ? "The case list and handler addresses come from the paths in settings. Open in Outlook brings up the court-fee email, then one for each handler."
                : "The desk writes a finished workbook you can download."}
        </p>
        {result ? <ResultCard result={result} name={tool.name} /> : null}
      </div>
    </section>
  );
}

function ResultCard({ result, name }: { result: ToolResult; name: string }) {
  const rows = result.sheets[0]?.rows.slice(0, 8) ?? [];
  const headers = rows[0] ? Object.keys(rows[0]) : [];
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
            onClick={() => downloadBytes(resultWorkbook(result), result.filename || `${name}.xlsx`, XLSX_MIME)}
          >
            Download result
          </button>
          {result.emails?.map((mail, index) => (
            <button
              key={`${mail.subject}-${mail.to}`}
              type="button"
              className="btn btn-gold"
              onClick={() => {
                if (index === 0) downloadBytes(resultWorkbook(result), result.filename || `${name}.xlsx`, XLSX_MIME);
                openOutlook(mail);
              }}
            >
              {index === 0 ? "Open in Outlook" : mail.subject}
            </button>
          ))}
        </div>
      </div>
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
