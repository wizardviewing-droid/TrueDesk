import type { DiskStatus } from "@/lib/desk/types";

type SharedApi = NonNullable<Window["trueDesk"]>;

export type DeskDisk = {
  kind: "shared" | "preview";
  status: () => Promise<DiskStatus>;
  readVault: () => Promise<string | null>;
  writeVault: (json: string) => Promise<DiskStatus>;
  readProfile: (username: string) => Promise<string | null>;
  writeProfile: (username: string, json: string) => Promise<DiskStatus>;
  deleteProfile: (username: string) => Promise<void>;
  readAttachment: (id: string) => Promise<string | null>;
  writeAttachment: (id: string, base64: string) => Promise<DiskStatus>;
  deleteAttachment: (id: string) => Promise<void>;
  readRelease: () => Promise<string | null>;
};

const preview = {
  vault: null as string | null,
  profiles: new Map<string, string>(),
  files: new Map<string, string>(),
  release: null as string | null,
};

const both: DiskStatus = { application: true, backup: true };

function previewDisk(): DeskDisk {
  return {
    kind: "preview",
    status: async () => both,
    readVault: async () => preview.vault,
    writeVault: async (json) => {
      preview.vault = json;
      return both;
    },
    readProfile: async (username) => preview.profiles.get(username) ?? null,
    writeProfile: async (username, json) => {
      preview.profiles.set(username, json);
      return both;
    },
    deleteProfile: async (username) => {
      preview.profiles.delete(username);
    },
    readAttachment: async (id) => preview.files.get(id) ?? null,
    writeAttachment: async (id, base64) => {
      preview.files.set(id, base64);
      return both;
    },
    deleteAttachment: async (id) => {
      preview.files.delete(id);
    },
    readRelease: async () => preview.release,
  };
}

function sharedDisk(api: SharedApi): DeskDisk {
  return {
    kind: "shared",
    status: async () => {
      const got = await api.readVault();
      return { application: got.application, backup: got.backup };
    },
    readVault: async () => (await api.readVault()).json,
    writeVault: (json) => api.writeVault(json),
    readProfile: (username) => api.readProfile(username),
    writeProfile: (username, json) => api.writeProfile(username, json),
    deleteProfile: (username) => api.deleteProfile(username),
    readAttachment: (id) => api.readAttachment(id),
    writeAttachment: (id, base64) => api.writeAttachment(id, base64),
    deleteAttachment: (id) => api.deleteAttachment(id),
    readRelease: () => api.readRelease(),
  };
}

export function deskDisk(): DeskDisk {
  const api = typeof window === "undefined" ? undefined : window.trueDesk;
  if (api) return sharedDisk(api);
  return previewDisk();
}
