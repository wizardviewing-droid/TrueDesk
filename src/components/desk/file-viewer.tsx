import { useEffect, useState } from "react";
import { isMailName, previewBytes, type FilePreview } from "@/lib/desk/preview-file";
import { readAttachmentBytes } from "@/lib/desk/storage";
import { useDesk } from "@/lib/desk/store";

export function FileViewer() {
  const viewingId = useDesk((s) => s.viewingId);
  const closeViewer = useDesk((s) => s.closeViewer);
  const downloadAttachment = useDesk((s) => s.downloadAttachment);
  const file = useDesk((s) => s.data?.attachments.find((item) => item.id === s.viewingId) ?? null);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!file) return;
    let cancel = false;
    let url = "";
    setPreview(null);
    setError("");
    void readAttachmentBytes(file.id)
      .then(async (bytes) => {
        if (cancel) return;
        if (!bytes) {
          setError("That file is not on this desk any more.");
          return;
        }
        const next = await previewBytes(file.name, file.mime || "", bytes.slice(0, 12_000_000));
        if (cancel) {
          if (next.kind === "image" || next.kind === "pdf") URL.revokeObjectURL(next.url);
          return;
        }
        if (next.kind === "image" || next.kind === "pdf") url = next.url;
        setPreview(next);
      })
      .catch((reason: unknown) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : "That file could not be shown.");
      });
    return () => {
      cancel = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);

  if (!viewingId || !file) return null;
  const mail = isMailName(file.name);
  const shown = preview?.kind === "mail" ? preview.mail : null;
  const body = shown?.text || (shown?.html ? shown.html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "");

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy/45 p-4" role="dialog" aria-label={file.name} onMouseDown={closeViewer}>
      <div className="card modal grid max-h-[85dvh] w-full max-w-2xl gap-4 overflow-auto p-6" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.14em] text-muted uppercase">{mail ? "Email" : "Attachment"}</p>
            <h2 className="truncate text-xl font-semibold text-navy">{shown?.subject || file.name}</h2>
          </div>
          <button type="button" className="btn btn-ghost min-w-11 px-3" onClick={closeViewer}>Close</button>
        </div>
        {error ? <p className="text-sm text-muted">{error}</p> : null}
        {!preview && !error ? <p className="text-sm text-muted">Opening…</p> : null}
        {shown ? (
          <div className="grid gap-2 rounded-xl bg-paper px-4 py-3 text-sm">
            {shown.from ? <p><span className="font-semibold text-navy">From </span>{shown.from}</p> : null}
            {shown.to ? <p><span className="font-semibold text-navy">To </span>{shown.to}</p> : null}
            {body ? <p className="whitespace-pre-wrap text-ink">{body.slice(0, 8000)}</p> : <p className="text-muted">The message is ready to open in Outlook.</p>}
          </div>
        ) : null}
        {preview?.kind === "image" ? <img src={preview.url} alt="" className="max-h-[50dvh] w-full rounded-xl object-contain bg-paper" /> : null}
        {preview?.kind === "pdf" ? <iframe title={file.name} src={preview.url} className="h-[50dvh] w-full rounded-xl bg-white" /> : null}
        {preview?.kind === "text" ? <pre className="max-h-[50dvh] overflow-auto whitespace-pre-wrap rounded-xl bg-paper px-4 py-3 text-sm">{preview.text}</pre> : null}
        {preview?.kind === "sheet" ? (
          <div className="grid gap-3">
            {preview.sheets.map((sheet) => (
              <div key={sheet.name} className="overflow-auto rounded-xl border border-line">
                <p className="border-b border-line px-3 py-2 text-sm font-semibold text-navy">{sheet.name}</p>
                <table className="w-full text-left text-sm">
                  <tbody>
                    {sheet.rows.map((row, index) => (
                      <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className="border-b border-line px-2 py-1">{cell}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        ) : null}
        {preview?.kind === "file" ? <p className="text-sm text-muted">This file can be opened in its own program.</p> : null}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-gold" onClick={() => void downloadAttachment(file.id, mail)}>
            {mail ? "Open in Outlook" : "Open file"}
          </button>
        </div>
      </div>
    </div>
  );
}
