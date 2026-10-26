import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { ContractBlock } from "@/lib/domain/contractRequests";
import { OIKOS_LOGO_BASE64 } from "@/lib/domain/oikosLogo";

// Layout copied from the contract in use (45_2026 CIHEAM): Calibri 10 pt, justified text, bold article
// headings, logo centred on the first page, dotted line above the page number.
const FONT = "Calibri";
const SIZE = 20; // half-points: 10 pt

// "**bold**" in the text marks bold runs; the organisation name is always bold.
const ALWAYS_BOLD = /(ISTITUTO OIKOS E\.T\.S\.|ISTITUTO OIKOS ENTE DEL TERZO SETTORE)/g;

function runs(text: string, bold = false): TextRun[] {
  const out: TextRun[] = [];
  text.split("**").forEach((chunk, i) => {
    if (!chunk) return;
    const marked = i % 2 === 1;
    chunk.split(ALWAYS_BOLD).forEach((part) => {
      if (!part) return;
      const always = part === "ISTITUTO OIKOS E.T.S." || part === "ISTITUTO OIKOS ENTE DEL TERZO SETTORE";
      out.push(new TextRun({ text: part, bold: bold || marked || always, font: FONT, size: SIZE }));
    });
  });
  return out;
}

function blockParagraphs(block: ContractBlock, index: number): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  const closing = block.key === "closing";
  const parties = block.key === "parties";

  if (block.title) {
    out.push(
      new Paragraph({
        children: runs(block.title, true),
        alignment: AlignmentType.JUSTIFIED,
        spacing: { before: index > 0 ? 200 : 0 },
        keepNext: true,
      }),
    );
  }

  const bodyLines = block.body.split(/\r?\n/);
  const signers: string[] = [];
  bodyLines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (!line.trim()) {
      out.push(new Paragraph({ children: [], keepNext: closing }));
      return;
    }
    if (closing && /^(per|for) /i.test(line.trim())) {
      signers.push(line.trim());
      void i;
      return;
    }
    if (closing) {
      out.push(new Paragraph({ children: runs(line), keepNext: true }));
      return;
    }
    // premises list: "a. text" with hanging indent
    const item = /^([a-z])\.\s+(.*)$/.exec(line.trim());
    if (block.key === "premises" && item) {
      out.push(
        new Paragraph({
          children: [...runs(`${item[1]}.\t`), ...runs(item[2])],
          alignment: AlignmentType.JUSTIFIED,
          indent: { left: 720, hanging: 360 },
          tabStops: [{ type: "left", position: 720 }],
        }),
      );
      return;
    }
    out.push(
      new Paragraph({
        children: runs(line),
        alignment: parties || block.key === "premises" && /^(premesso|Tutto ciò|whereas|Now,? therefore)/i.test(line) ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
      }),
    );
  });

  // signatures side by side: borderless two-column table, signature line above each name
  if (signers.length) {
    const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
    const borders = { top: none, bottom: none, left: none, right: none };
    const cell = (text: string) =>
      new TableCell({
        borders,
        width: { size: 4500, type: WidthType.DXA },
        children: [
          new Paragraph({ children: runs("________________________________"), spacing: { before: 480 }, keepNext: true }),
          new Paragraph({ children: runs(text) }),
        ],
      });
    out.push(
      new Table({
        width: { size: 9000, type: WidthType.DXA },
        columnWidths: [4500, 4500],
        borders: { ...borders, insideHorizontal: none, insideVertical: none },
        rows: [new TableRow({ cantSplit: true, children: signers.slice(0, 2).map(cell) })],
      }),
    );
  }
  return out;
}

export async function buildContractDocx(blocks: ContractBlock[]): Promise<Buffer> {
  const doc = new Document({
    creator: "Istituto Oikos E.T.S.",
    title: "Contratto",
    sections: [
      {
        properties: { page: { margin: { top: 993, bottom: 1134, left: 1134, right: 1134 } } },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                border: { top: { style: BorderStyle.DOTTED, size: 4, color: "808080", space: 6 } },
                children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 24 })],
              }),
            ],
          }),
        },
        children: [
          // logo centred at the top of the first page
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
            children: [
              new ImageRun({
                type: "png",
                data: Buffer.from(OIKOS_LOGO_BASE64, "base64"),
                transformation: { width: 120, height: 104 },
              }),
            ],
          }),
          ...blocks.flatMap((b, i) => blockParagraphs(b, i)),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
