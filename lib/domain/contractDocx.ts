import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  ImageRun,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  TextRun,
} from "docx";
import type { ContractBlock } from "@/lib/domain/contractRequests";
import { OIKOS_LOGO_BASE64 } from "@/lib/domain/oikosLogo";

const FONT = "Calibri";
const SIZE = 22; // half-points: 11 pt

function runs(text: string, bold = false): TextRun[] {
  return [new TextRun({ text, bold, font: FONT, size: SIZE })];
}

function blockParagraphs(block: ContractBlock): Paragraph[] {
  const out: Paragraph[] = [];
  const closing = block.key === "closing";

  if (block.title) {
    out.push(
      new Paragraph({
        children: runs(block.title, true),
        spacing: { before: 240, after: 80 },
        keepNext: true,
      }),
    );
  }

  const lines = block.body.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (!line.trim()) {
      out.push(new Paragraph({ children: [], spacing: { after: 0 } }));
      return;
    }
    if (closing && /^per /i.test(line.trim())) {
      out.push(new Paragraph({ children: runs("________________________________"), spacing: { before: 360 } }));
      out.push(new Paragraph({ children: runs(line), alignment: AlignmentType.LEFT }));
      return;
    }
    if (/^-\s+/.test(line.trim())) {
      out.push(
        new Paragraph({
          children: runs(line.trim().replace(/^-\s+/, "")),
          numbering: { reference: "bullets", level: 0 },
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 40 },
        }),
      );
      return;
    }
    // the party block is centred (as in the letterhead layout), articles are justified
    const justify = block.title !== "" || line.length > 90;
    out.push(
      new Paragraph({
        // in the party block the names in capitals (Oikos, the other party) are bold
        children: runs(line, block.key === "parties" && line.length > 3 && line === line.toUpperCase()),
        alignment: block.key === "parties" ? AlignmentType.CENTER : justify ? AlignmentType.JUSTIFIED : AlignmentType.LEFT,
        spacing: { after: block.title ? 80 : 0 },
      }),
    );
    void i;
  });
  return out;
}

export async function buildContractDocx(blocks: ContractBlock[]): Promise<Buffer> {
  const doc = new Document({
    creator: "Istituto Oikos E.T.S.",
    title: "Contratto",
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
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
          // letterhead: logo centred at the top of the first page
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
          ...blocks.flatMap(blockParagraphs),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
