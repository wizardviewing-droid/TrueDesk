export type MacroNeed = {
  id: string;
  title: string;
  detail: string;
  folder?: boolean;
};

export const MACRO_NEEDS: Record<"ax" | "infotrack" | "kindertons" | "letters", MacroNeed[]> = {
  ax: [
    {
      id: "cases",
      title: "AX case list",
      detail: "The sheet named ax cases. Column A is the matter. Column C is the source reference. It usually sits in the AX Daily Payment macro workbook.",
    },
  ],
  kindertons: [
    {
      id: "cases",
      title: "Kindertons case list",
      detail: "Case key, client, source, fee earner and Kindertons reference. This is the All cases sheet, or All files and files handlers and email data.",
    },
    {
      id: "mail",
      title: "Handler email list",
      detail: "Mailinfo or Email addresses. The name is in column A and the email address is in column B.",
    },
  ],
  infotrack: [],
  letters: [
    {
      id: "bills",
      title: "Letters and bills",
      detail: "Where the Word letters and the success fee bills are saved. The usual folder is Y:\\accounts\\success fee bills\\",
      folder: true,
    },
    {
      id: "lists",
      title: "Saved lists",
      detail: "Where today's matter list is saved, in a year folder and a month folder. The usual folder is Y:\\accounts\\Tools\\Task application",
      folder: true,
    },
    {
      id: "emails",
      title: "Email list",
      detail: "The workbook with the Data1 sheet. Column A is the matter number and column B is the email address.",
    },
  ],
};
