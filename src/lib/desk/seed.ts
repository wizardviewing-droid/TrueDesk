import type { DeskData } from "@/lib/desk/types";

export const OFFICE_CODE = "TRUE-OFFICE";

export function buildSeed(): DeskData {
  return {
    users: [],
    tasks: [],
    notes: [],
    attachments: [],
    tools: [
      {
        id: "tool-ax",
        name: "AX daily payment",
        description:
          "Drop the posting enquiry. The desk looks each matter up on the AX case list, builds the remittance, and writes the payment email.",
        kind: "ax",
        pinned: false,
      },
      {
        id: "tool-infotrack",
        name: "Infotrack",
        description:
          "Drop the Infotrack download. The desk builds the ledger, the nominal sheet and the filtered ledger.",
        kind: "infotrack",
        pinned: false,
      },
      {
        id: "tool-kindertons",
        name: "Kindertons",
        description:
          "Drop the posting enquiry. The desk builds the court-fee bordereau, the invoice count, and a fee email for each handler. Drop the case list as a second file if it is not already in the workbook.",
        kind: "kindertons",
        pinned: false,
      },
      {
        id: "tool-letters",
        name: "Letters and SF bills",
        description: "Save today's matter numbers, then email the letter and success fee bill for each one.",
        kind: "letters",
        pinned: false,
        lookups: [
          { id: "bills", path: "Y:\\accounts\\success fee bills\\" },
          { id: "lists", path: "Y:\\accounts\\BANK UPLOADS & PAYMENTS\\LETTERS TO BE SENT" },
        ],
      },
    ],
    activity: [],
    notices: [],
  };
}

const SAMPLE_KINDS = new Set(["limitation", "time", "bundle", "disbursement", "cleaner"]);

export function withStandardTools(data: DeskData): DeskData {
  const restored = new Set(data.restoredTools ?? []);
  const retired = new Set(data.retiredTools ?? []);
  let restoredChanged = false;
  if (retired.has("tool-letters") && !restored.has("tool-letters")) {
    retired.delete("tool-letters");
    restored.add("tool-letters");
    restoredChanged = true;
  }
  const kept = data.tools.filter((tool) => !SAMPLE_KINDS.has(tool.kind) && !retired.has(tool.id));
  const repaired = kept.map((tool) => {
    if (tool.id !== "tool-letters" && !/letters and sf/i.test(tool.name)) return tool;
    const lookups = [...(tool.lookups ?? [])];
    const lists = lookups.find((item) => item.id === "lists");
    const oldLists = !lists?.path || lists.path.replace(/[\\/]+$/g, "").toLowerCase() === "y:\\accounts\\tools\\task application";
    const nextLookups = oldLists
      ? [...lookups.filter((item) => item.id !== "lists"), { id: "lists", path: "Y:\\accounts\\BANK UPLOADS & PAYMENTS\\LETTERS TO BE SENT" }]
      : lookups;
    const sameKind = tool.kind === "letters";
    const sameLists = !oldLists;
    if (sameKind && sameLists) return tool;
    return { ...tool, kind: "letters" as const, lookups: nextLookups };
  });
  const ids = new Set(repaired.map((tool) => tool.id));
  const extra = buildSeed().tools.filter((tool) => !ids.has(tool.id) && !retired.has(tool.id));
  let users = data.users.map((user) => {
    const role = user.role as string;
    return role === "manager" || role === "office" || role === "client" || role === "user" ? user : { ...user, role: "user" as const };
  });
  if (users.length && !users.some((user) => user.role === "manager")) {
    users = users.map((user, index) => (index === 0 ? { ...user, role: "manager" as const } : user));
  }
  if (!data.notices) data.notices = [];
  const rolesChanged = users.some((user, index) => user !== data.users[index]);
  const kindChanged = repaired.some((tool, index) => tool !== kept[index]);
  const toolsChanged = extra.length > 0 || repaired.length !== data.tools.length || kindChanged || restoredChanged;
  if (!toolsChanged && !rolesChanged) return data;
  return {
    ...data,
    users,
    tools: extra.length ? [...repaired, ...extra] : repaired,
    retiredTools: [...retired],
    restoredTools: [...restored],
  };
}
