export {};

declare global {
  interface FileSystemHandle {
    queryPermission?(descriptor?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
    requestPermission?(descriptor?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
  }

  interface FileSystemDirectoryHandle {
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  }

  interface Window {
    showDirectoryPicker?(options?: {
      mode?: "read" | "readwrite";
      id?: string;
    }): Promise<FileSystemDirectoryHandle>;
    trueDesk?: {
      readSpreadsheets: (target: string) => Promise<{ name: string; base64: string }[]>;
      pickFile: () => Promise<string | null>;
      focusWindow?: () => Promise<void>;
      clearAttention?: () => Promise<void>;
      openOutlook: (url: string) => Promise<void>;
      openFile: (username: string, name: string, base64: string) => Promise<void>;
      readVault: () => Promise<{ json: string | null; application: boolean; backup: boolean }>;
      writeVault: (json: string) => Promise<{ application: boolean; backup: boolean }>;
      readProfile: (username: string) => Promise<string | null>;
      writeProfile: (username: string, json: string) => Promise<{ application: boolean; backup: boolean }>;
      deleteProfile: (username: string) => Promise<void>;
      readAttachment: (id: string) => Promise<string | null>;
      writeAttachment: (username: string, id: string, base64: string) => Promise<{ application: boolean; backup: boolean }>;
      claimAttachment: (username: string, id: string) => Promise<void>;
      deleteAttachment: (id: string) => Promise<void>;
      writeTools: (json: string) => Promise<{ application: boolean; backup: boolean }>;
      writeUserTasks: (username: string, json: string) => Promise<{ application: boolean; backup: boolean }>;
      readRelease: () => Promise<string | null>;
    };
  }
}
