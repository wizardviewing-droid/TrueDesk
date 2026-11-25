export type DesktopFile = { name: string; base64: string };

type DesktopApi = {
  readSpreadsheets: (target: string) => Promise<DesktopFile[]>;
  openOutlook: (url: string) => Promise<void>;
};

export function desktopApi(): DesktopApi | null {
  if (typeof window === "undefined") return null;
  return window.trueDesk ?? null;
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
