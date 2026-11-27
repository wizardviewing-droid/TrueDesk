export type DesktopFile = { name: string; base64: string };

type DesktopApi = {
  readSpreadsheets: (target: string) => Promise<DesktopFile[]>;
  pickFile: () => Promise<string | null>;
  pickFolder?: () => Promise<string | null>;
  lettersList?: (root: string) => Promise<{ name: string; path: string; year: string; month: string }[]>;
  lettersDir?: (folder: string) => Promise<{ name: string; path: string }[]>;
  lettersWrite?: (payload: { root: string; year?: string; month?: string; name?: string; filePath?: string; base64: string }) => Promise<string>;
  lettersRename?: (payload: { root: string; filePath: string }) => Promise<string>;
  openOutlook: (payload: {
    to: string;
    cc: string;
    subject: string;
    body: string;
    username: string;
    fileName: string;
    fileBase64: string;
    files?: string[];
  }) => Promise<void>;
  openFile: (username: string, name: string, base64: string) => Promise<void>;
};

export function desktopApi(): DesktopApi | null {
  if (typeof window === "undefined") return null;
  return window.trueDesk ?? null;
}

export async function pickFolderPath(): Promise<{ path: string } | "cancel" | "unavailable"> {
  const api = desktopApi();
  if (!api?.pickFolder) return "unavailable";
  const picked = await api.pickFolder();
  if (typeof picked !== "string" || !picked.trim()) return "cancel";
  return { path: picked };
}

export async function pickFilePath(): Promise<{ path: string } | "cancel" | "unavailable"> {
  const api = desktopApi();
  if (!api?.pickFile) return "unavailable";
  const picked = await api.pickFile();
  if (typeof picked !== "string" || !picked.trim()) return "cancel";
  return { path: picked };
}

export async function filesFromPath(target: string): Promise<File[]> {
  const api = desktopApi();
  const path = target.trim();
  if (!api || !path) return [];
  const rows = await api.readSpreadsheets(path);
  return rows.map((row) => {
    const binary = atob(row.base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new File([bytes], row.name);
  });
}
