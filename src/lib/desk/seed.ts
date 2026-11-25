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
        id: "tool-limitation",
        name: "Limitation calculator",
        description:
          "Import a sheet of accident dates, or type one date. The desk returns the limitation date and the day to issue by.",
        kind: "limitation",
        pinned: true,
      },
      {
        id: "tool-time",
        name: "Time recording summary",
        description:
          "Import a time sheet. The desk returns hours and value by fee earner and by matter.",
        kind: "time",
        pinned: true,
      },
      {
        id: "tool-bundle",
        name: "Bundle index",
        description: "Drop the files for a hearing. The desk returns a numbered index workbook.",
        kind: "bundle",
        pinned: true,
      },
      {
        id: "tool-disbursement",
        name: "Disbursement checker",
        description:
          "Import a disbursement ledger. The desk flags VAT, totals that do not add up, and duplicate invoices.",
        kind: "disbursement",
        pinned: false,
      },
      {
        id: "tool-cleaner",
        name: "Schedule cleaner",
        description:
          "Import a schedule. The desk tidies names and postcodes, and drops empty rows.",
        kind: "cleaner",
        pinned: false,
      },
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
    ],
    activity: [],
    notices: [],
  };
}

export function withStandardTools(data: DeskData): DeskData {
  const ids = new Set(data.tools.map((tool) => tool.id));
  const extra = buildSeed().tools.filter((tool) => !ids.has(tool.id));
  let users = data.users.map((user) => {
    const role = user.role as string;
    return role === "manager" || role === "user" ? user : { ...user, role: "user" as const };
  });
  if (users.length && !users.some((user) => user.role === "manager")) {
    users = users.map((user, index) => (index === 0 ? { ...user, role: "manager" as const } : user));
  }
  if (!data.notices) data.notices = [];
  const rolesChanged = users.some((user, index) => user !== data.users[index]);
  if (!extra.length && !rolesChanged) return data;
  return { ...data, users, tools: extra.length ? [...data.tools, ...extra] : data.tools };
}
