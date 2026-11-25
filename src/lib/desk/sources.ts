export type MacroNeed = {
  id: string;
  title: string;
  detail: string;
};

export const MACRO_NEEDS: Record<"ax" | "infotrack" | "kindertons", MacroNeed[]> = {
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
};
