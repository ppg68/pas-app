import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type PdfSection = {
  title: string;
  /** label / value rows shown as a table */
  rows?: [string, string][];
  /** free paragraphs shown under the rows */
  notes?: string[];
};

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 40;
const LABEL_W = 150;

// the standard PDF fonts only cover WinAnsi: anything else becomes "?"
function clean(text: string): string {
  return String(text ?? "").replace(/[^\x20-\x7E\xA0-\xFF—–…‘’“”•€\n]/g, "?");
}

/** Builds the A4 PDF of a whole IR procedure: header, then one table per section. */
export async function buildRequestPdf(
  header: { title: string; subtitle: string; generated: string },
  sections: PdfSection[]
) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const ink = rgb(0.1, 0.12, 0.16);
  const soft = rgb(0.4, 0.44, 0.5);
  const line = rgb(0.86, 0.88, 0.9);

  function wrap(text: string, f: PDFFont, size: number, width: number): string[] {
    const out: string[] = [];
    for (const para of clean(text).split("\n")) {
      let current = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        let w = word;
        // a single word longer than the line (IBAN, URL) is cut
        while (f.widthOfTextAtSize(w, size) > width) {
          let cut = w.length - 1;
          while (cut > 1 && f.widthOfTextAtSize(w.slice(0, cut), size) > width) cut--;
          if (current) {
            out.push(current);
            current = "";
          }
          out.push(w.slice(0, cut));
          w = w.slice(cut);
        }
        const attempt = current ? `${current} ${w}` : w;
        if (f.widthOfTextAtSize(attempt, size) <= width) current = attempt;
        else {
          out.push(current);
          current = w;
        }
      }
      out.push(current);
    }
    return out;
  }

  function ensure(height: number) {
    if (y - height < MARGIN + 14) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  }

  // header
  page.drawText(clean(header.title), { x: MARGIN, y: y - 14, size: 16, font: bold, color: ink });
  y -= 22;
  for (const l of wrap(header.subtitle, font, 10, PAGE_W - 2 * MARGIN)) {
    page.drawText(l, { x: MARGIN, y: y - 10, size: 10, font, color: soft });
    y -= 13;
  }
  page.drawText(clean(header.generated), { x: MARGIN, y: y - 10, size: 8, font, color: soft });
  y -= 22;

  for (const sec of sections) {
    ensure(40);
    page.drawText(clean(sec.title), { x: MARGIN, y: y - 11, size: 12, font: bold, color: ink });
    y -= 16;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.8, color: ink });
    y -= 4;
    for (const [label, value] of sec.rows ?? []) {
      const labelLines = wrap(label, font, 9, LABEL_W - 8);
      const valueLines = wrap(value || "—", font, 9, PAGE_W - 2 * MARGIN - LABEL_W);
      const n = Math.max(labelLines.length, valueLines.length);
      ensure(n * 12 + 6);
      labelLines.forEach((l, i) => page.drawText(l, { x: MARGIN, y: y - 10 - i * 12, size: 9, font, color: soft }));
      valueLines.forEach((l, i) =>
        page.drawText(l, { x: MARGIN + LABEL_W, y: y - 10 - i * 12, size: 9, font, color: ink })
      );
      y -= n * 12 + 4;
      page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.4, color: line });
      y -= 2;
    }
    for (const note of sec.notes ?? []) {
      const ls = wrap(note, font, 9, PAGE_W - 2 * MARGIN);
      ensure(ls.length * 12 + 6);
      ls.forEach((l, i) => page.drawText(l, { x: MARGIN, y: y - 10 - i * 12, size: 9, font, color: ink }));
      y -= ls.length * 12 + 4;
    }
    y -= 12;
  }

  // page numbers
  const pages = pdf.getPages();
  pages.forEach((p, i) =>
    p.drawText(`${i + 1} / ${pages.length}`, { x: PAGE_W - MARGIN - 30, y: 20, size: 8, font, color: soft })
  );
  return pdf.save();
}
