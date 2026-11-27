export type MailView = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type SheetView = { name: string; rows: string[][] };

export type FilePreview =
  | { kind: "mail"; mail: MailView }
  | { kind: "image"; url: string }
  | { kind: "pdf"; url: string }
  | { kind: "text"; text: string }
  | { kind: "sheet"; sheets: SheetView[] }
  | { kind: "file" };

const MAIL = /\.(msg|eml|oft)$/i;

export function isMailName(name: string): boolean {
  return MAIL.test(name);
}

export async function previewBytes(name: string, mime: string, bytes: Uint8Array): Promise<FilePreview> {
  const lower = name.toLowerCase();
  if (lower.endsWith(".eml") || mime === "message/rfc822") return { kind: "mail", mail: parseEml(bytes) };
  if (lower.endsWith(".msg") || lower.endsWith(".oft")) return { kind: "mail", mail: parseMsg(bytes) };
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp)$/i.test(name)) {
    return { kind: "image", url: blobUrl(bytes, mime || "image/png") };
  }
  if (mime === "application/pdf" || lower.endsWith(".pdf")) return { kind: "pdf", url: blobUrl(bytes, "application/pdf") };
  if (/\.(xlsx|xlsm|xlsb|xls|csv)$/i.test(name)) {
    const sheets = await previewSheets(bytes);
    if (sheets.length) return { kind: "sheet", sheets };
  }
  if (mime.startsWith("text/") || /\.(txt|csv|json|xml|html?|log)$/i.test(name)) {
    return { kind: "text", text: new TextDecoder().decode(bytes).slice(0, 20000) };
  }
  return { kind: "file" };
}

function blobUrl(bytes: Uint8Array, type: string): string {
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return URL.createObjectURL(new Blob([copy], { type }));
}

function parseEml(bytes: Uint8Array): MailView {
  const raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const split = raw.split(/\r?\n\r?\n/);
  const headerText = split.shift() ?? "";
  const body = split.join("\n\n");
  const headers = unfold(headerText);
  const subject = decodeWords(headerValue(headers, "subject"));
  const from = decodeWords(headerValue(headers, "from"));
  const to = decodeWords(headerValue(headers, "to"));
  const contentType = headerValue(headers, "content-type");
  const encoding = headerValue(headers, "content-transfer-encoding").toLowerCase();
  const boundary = /boundary="?([^";]+)"?/i.exec(contentType)?.[1] ?? "";
  if (/multipart/i.test(contentType) && boundary) {
    const part = pickPart(body, boundary);
    if (part) return { from, to, subject, ...part };
  }
  const decoded = decodeBody(body, encoding);
  if (/text\/html/i.test(contentType)) return { from, to, subject, text: "", html: decoded };
  return { from, to, subject, text: decoded, html: "" };
}

function unfold(headerText: string): Map<string, string> {
  const lines = headerText.replace(/\r\n/g, "\n").split("\n");
  const map = new Map<string, string>();
  let key = "";
  for (const line of lines) {
    if (/^\s/.test(line) && key) {
      map.set(key, `${map.get(key) ?? ""} ${line.trim()}`);
      continue;
    }
    const match = /^([^:]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    key = match[1].toLowerCase();
    map.set(key, match[2]);
  }
  return map;
}

function headerValue(headers: Map<string, string>, name: string): string {
  return headers.get(name) ?? "";
}

function pickPart(body: string, boundary: string): { text: string; html: string } | null {
  const chunks = body.split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  let text = "";
  let html = "";
  for (const chunk of chunks) {
    const piece = chunk.replace(/^\r?\n/, "");
    if (!piece || piece.startsWith("--")) continue;
    const split = piece.split(/\r?\n\r?\n/);
    const headers = unfold(split.shift() ?? "");
    const type = headerValue(headers, "content-type");
    const encoding = headerValue(headers, "content-transfer-encoding").toLowerCase();
    const decoded = decodeBody(split.join("\n\n"), encoding);
    if (/text\/plain/i.test(type) && !text) text = decoded;
    if (/text\/html/i.test(type) && !html) html = decoded;
  }
  if (!text && !html) return null;
  return { text, html };
}

function decodeBody(body: string, encoding: string): string {
  if (encoding.includes("base64")) {
    try {
      const binary = atob(body.replace(/\s/g, ""));
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    } catch {
      return body;
    }
  }
  if (encoding.includes("quoted-printable")) return new TextDecoder("utf-8", { fatal: false }).decode(qpBytes(body));
  return body.replace(/\r\n/g, "\n");
}

function qpBytes(input: string): Uint8Array {
  const stripped = input.replace(/=\r?\n/g, "");
  const out: number[] = [];
  for (let index = 0; index < stripped.length; index += 1) {
    const pair = stripped.slice(index + 1, index + 3);
    if (stripped[index] === "=" && /^[0-9A-Fa-f]{2}$/.test(pair)) {
      out.push(Number.parseInt(pair, 16));
      index += 2;
    } else out.push(stripped.charCodeAt(index) & 0xff);
  }
  return Uint8Array.from(out);
}

function decodeWords(value: string): string {
  return value.replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (_all, charset: string, kind: string, data: string) => {
    const bytes = kind.toLowerCase() === "b" ? base64Bytes(data) : qpBytes(data.replace(/_/g, " "));
    const label = /utf-8/i.test(charset) ? "utf-8" : "windows-1252";
    try {
      return new TextDecoder(label).decode(bytes);
    } catch {
      return new TextDecoder().decode(bytes);
    }
  });
}

function base64Bytes(data: string): Uint8Array {
  try {
    const binary = atob(data.replace(/\s/g, ""));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return new Uint8Array();
  }
}

function parseMsg(bytes: Uint8Array): MailView {
  const files = readCompound(bytes);
  const text = (id: string) => streamText(files, id);
  const html = text("1013001F");
  return {
    from: text("0C1A001F") || text("0C1F001F") || text("0042001F"),
    to: text("0E04001F") || text("0E03001F"),
    subject: text("0037001F") || text("0037001E"),
    text: text("1000001F") || text("1000001E"),
    html,
  };
}

function streamText(files: Map<string, Uint8Array>, id: string): string {
  const hit = files.get(`__substg1.0_${id}`);
  if (!hit) return "";
  if (id.endsWith("001F")) return utf16(hit).trim();
  return new TextDecoder("windows-1252").decode(hit).replace(/\u0000/g, "").trim();
}

function utf16(bytes: Uint8Array): string {
  let text = "";
  for (let index = 0; index + 1 < bytes.length; index += 2) text += String.fromCharCode(bytes[index] | (bytes[index + 1] << 8));
  return text.replace(/\u0000+$/g, "");
}

function readCompound(bytes: Uint8Array): Map<string, Uint8Array> {
  const empty = new Map<string, Uint8Array>();
  if (bytes.length < 512 || bytes[0] !== 0xd0 || bytes[1] !== 0xcf || bytes[2] !== 0x11 || bytes[3] !== 0xe0) return empty;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sectorSize = 2 ** view.getUint16(0x1e, true);
  const miniSize = 2 ** view.getUint16(0x20, true);
  const fatCount = view.getUint32(0x2c, true);
  const dirStart = view.getInt32(0x30, true);
  const cutoff = view.getUint32(0x38, true) || 4096;
  const miniFatStart = view.getInt32(0x3c, true);
  const difatStart = view.getInt32(0x44, true);
  const difatCount = view.getUint32(0x48, true);
  const fat: number[] = [];
  const difat: number[] = [];
  for (let index = 0; index < 109 && difat.length < fatCount; index += 1) {
    const sector = view.getInt32(0x4c + index * 4, true);
    if (sector >= 0) difat.push(sector);
  }
  let next = difatStart;
  let guard = 0;
  while (next >= 0 && guard < difatCount + 4) {
    guard += 1;
    const base = (next + 1) * sectorSize;
    const entries = sectorSize / 4 - 1;
    for (let index = 0; index < entries && difat.length < fatCount; index += 1) difat.push(view.getInt32(base + index * 4, true));
    next = view.getInt32(base + entries * 4, true);
  }
  for (const sector of difat) {
    if (sector < 0) continue;
    const base = (sector + 1) * sectorSize;
    for (let index = 0; index < sectorSize / 4; index += 1) fat.push(view.getInt32(base + index * 4, true));
  }
  const readChain = (start: number, size: number) => {
    const out = new Uint8Array(size);
    let sector = start;
    let offset = 0;
    const seen = new Set<number>();
    while (sector >= 0 && sector < 0xfffffffa && offset < size && !seen.has(sector)) {
      seen.add(sector);
      const from = (sector + 1) * sectorSize;
      const take = Math.min(sectorSize, size - offset);
      out.set(bytes.subarray(from, from + take), offset);
      offset += take;
      sector = fat[sector] ?? -2;
    }
    return out;
  };
  const dirBytes = readChain(dirStart, sectorSize * 64);
  const entries: { name: string; start: number; size: number; type: number }[] = [];
  for (let offset = 0; offset + 128 <= dirBytes.length; offset += 128) {
    const entry = new DataView(dirBytes.buffer, dirBytes.byteOffset + offset, 128);
    const nameLength = entry.getUint16(64, true);
    if (!nameLength) continue;
    let name = "";
    for (let index = 0; index < nameLength / 2 - 1; index += 1) name += String.fromCharCode(entry.getUint16(index * 2, true));
    entries.push({ name, type: dirBytes[offset + 66], start: entry.getInt32(116, true), size: entry.getUint32(120, true) });
  }
  const root = entries[0];
  const miniStream = root ? readChain(root.start, root.size) : new Uint8Array();
  const miniFatBytes = miniFatStart >= 0 ? readChain(miniFatStart, sectorSize * 32) : new Uint8Array();
  const miniFat: number[] = [];
  const miniView = new DataView(miniFatBytes.buffer, miniFatBytes.byteOffset, miniFatBytes.byteLength);
  for (let index = 0; index + 4 <= miniFatBytes.length; index += 4) miniFat.push(miniView.getInt32(index, true));
  const files = new Map<string, Uint8Array>();
  for (const entry of entries) {
    if (entry.type !== 2 || !entry.size) continue;
    if (entry.size < cutoff) {
      const out = new Uint8Array(entry.size);
      let sector = entry.start;
      let offset = 0;
      const seen = new Set<number>();
      while (sector >= 0 && sector < 0xfffffffa && offset < entry.size && !seen.has(sector)) {
        seen.add(sector);
        const from = sector * miniSize;
        const take = Math.min(miniSize, entry.size - offset);
        out.set(miniStream.subarray(from, from + take), offset);
        offset += take;
        sector = miniFat[sector] ?? -2;
      }
      files.set(entry.name, out);
    } else files.set(entry.name, readChain(entry.start, entry.size));
  }
  return files;
}

async function previewSheets(bytes: Uint8Array): Promise<SheetView[]> {
  const xlsx = await import("xlsx");
  const book = xlsx.read(bytes, { type: "array" });
  return book.SheetNames.slice(0, 3).map((name) => {
    const rows = xlsx.utils.sheet_to_json<(string | number | null)[]>(book.Sheets[name], { header: 1, raw: false });
    return {
      name,
      rows: rows.slice(0, 12).map((row) => (row ?? []).slice(0, 8).map((cell) => String(cell ?? ""))),
    };
  }).filter((sheet) => sheet.rows.length);
}
