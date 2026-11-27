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
  writeAttachment: (username: string, id: string, base64: string) => Promise<DiskStatus>;
  claimAttachment: (username: string, id: string) => Promise<void>;
  deleteAttachment: (id: string) => Promise<void>;
  writeTools: (json: string) => Promise<DiskStatus>;
  writeUserTasks: (username: string, json: string) => Promise<DiskStatus>;
  readRelease: () => Promise<string | null>;
};

const preview = {
  vault: null as string | null,
  profiles: new Map<string, string>(),
  files: new Map<string, string>(),
  tools: null as string | null,
  userTasks: new Map<string, string>(),
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
    readAttachment: async (id) => {
      for (const [key, value] of preview.files) {
        if (key === id || key.endsWith(`/${id}`)) return value;
      }
      return null;
    },
    writeAttachment: async (username, id, base64) => {
      preview.files.set(`${username}/${id}`, base64);
      return both;
    },
    claimAttachment: async (username, id) => {
      const legacy = preview.files.get(id);
      if (!legacy) return;
      preview.files.set(`${username}/${id}`, legacy);
      preview.files.delete(id);
    },
    deleteAttachment: async (id) => {
      for (const key of [...preview.files.keys()]) {
        if (key === id || key.endsWith(`/${id}`)) preview.files.delete(key);
      }
    },
    writeTools: async (json) => {
      preview.tools = json;
      return both;
    },
    writeUserTasks: async (username, json) => {
      preview.userTasks.set(username, json);
      return both;
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
    writeAttachment: (username, id, base64) => api.writeAttachment(username, id, base64),
    claimAttachment: (username, id) => api.claimAttachment(username, id),
    deleteAttachment: (id) => api.deleteAttachment(id),
    writeTools: (json) => api.writeTools(json),
    writeUserTasks: (username, json) => api.writeUserTasks(username, json),
    readRelease: () => api.readRelease(),
  };
}

export function deskDisk(): DeskDisk {
  const api = typeof window === "undefined" ? undefined : window.trueDesk;
  if (api) return sharedDisk(api);
  return previewDisk();
}
