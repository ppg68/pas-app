import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { OIKOS_LOGO_BASE64 } from "@/lib/domain/oikosLogo";
import { dateOnly, dt, money, type CostType, type TripApproval, type TripRow } from "@/lib/domain/trips";

// "Autorizzazione alla trasferta in Italia, in Svizzera ed Europa in giornata, uscite paese per rinnovo visto"
// (PR09_1.6_AA09), as a PDF that reads like the Word form: sentence, ticked options, signatures.

const W = 595.28;
const H = 841.89;
const M = 56;
const SIZE = 10.5;
const LEAD = 15;

function clean(text: string): string {
  return String(text ?? "").replace(/[^\x20-\x7E\xA0-\xFF—–…‘’“”•€\n]/g, "?");
}

export async function buildItalyTripPdf(r: TripRow, approvals: TripApproval[]) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.12, 0.16);
  const soft = rgb(0.4, 0.44, 0.5);
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;

  const ensure = (h: number) => {
    if (y - h < M + 20) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  };

  function wrapRuns(parts: { t: string; b?: boolean }[], width: number, size = SIZE): { t: string; b?: boolean; g?: boolean }[][] {
    // words keep their weight; lines are lists of words
    const words: { t: string; b?: boolean; g?: boolean }[] = [];
    let prevEndsSpace = true;
    for (const p of parts) {
      const t = clean(p.t);
      const ws = t.split(/\s+/).filter(Boolean);
      ws.forEach((w, i) => words.push({ t: w, b: p.b, g: i === 0 && !prevEndsSpace && !/^\s/.test(t) }));
      if (ws.length) prevEndsSpace = /\s$/.test(t);
    }
    const lines: { t: string; b?: boolean; g?: boolean }[][] = [];
    let cur: { t: string; b?: boolean; g?: boolean }[] = [];
    let curW = 0;
    const sp = font.widthOfTextAtSize(" ", size);
    for (const w of words) {
      const ww = (w.b ? bold : font).widthOfTextAtSize(w.t, size);
      const gap = w.g ? 0 : sp;
      if (cur.length && curW + gap + ww > width) {
        lines.push(cur);
        cur = [];
        curW = 0;
      }
      curW += (cur.length ? gap : 0) + ww;
      cur.push(w);
    }
    if (cur.length) lines.push(cur);
    return lines;
  }

  /** A paragraph made of normal and bold pieces, wrapped; `x` is the left edge. */
  function para(parts: { t: string; b?: boolean }[], opts: { x?: number; size?: number; gap?: number; color?: ReturnType<typeof rgb> } = {}) {
    const x0 = opts.x ?? M;
    const size = opts.size ?? SIZE;
    const lines = wrapRuns(parts, W - M - x0, size);
    ensure(lines.length * LEAD + 4);
    for (const ln of lines) {
      let x = x0;
      ln.forEach((w, i) => {
        if (i > 0 && !w.g) x += font.widthOfTextAtSize(" ", size);
        const f = w.b ? bold : font;
        page.drawText(w.t, { x, y: y - size, size, font: f, color: opts.color ?? ink });
        x += f.widthOfTextAtSize(w.t, size);
      });
      y -= LEAD;
    }
    y -= opts.gap ?? 4;
  }

  function option(checked: boolean, parts: { t: string; b?: boolean }[]) {
    const box = 9;
    const x0 = M + 14;
    const lines = wrapRuns(parts, W - M - x0 - 16);
    ensure(lines.length * LEAD + 4);
    page.drawRectangle({ x: x0, y: y - box - 1.5, width: box, height: box, borderColor: ink, borderWidth: 0.8 });
    if (checked) {
      page.drawLine({ start: { x: x0 + 1.5, y: y - 3 }, end: { x: x0 + box - 1.5, y: y - box }, thickness: 1.2, color: ink });
      page.drawLine({ start: { x: x0 + 1.5, y: y - box }, end: { x: x0 + box - 1.5, y: y - 3 }, thickness: 1.2, color: ink });
    }
    for (const ln of lines) {
      let x = x0 + 16;
      ln.forEach((w, i) => {
        if (i > 0 && !w.g) x += font.widthOfTextAtSize(" ", SIZE);
        const f = w.b ? bold : font;
        page.drawText(w.t, { x, y: y - SIZE, size: SIZE, font: f, color: ink });
        x += f.widthOfTextAtSize(w.t, SIZE);
      });
      y -= LEAD;
    }
    y -= 2;
  }

  // ---------------------------------------------------------------- header
  try {
    const logo = await pdf.embedPng(Buffer.from(OIKOS_LOGO_BASE64, "base64"));
    const lw = 54;
    const lh = (logo.height / logo.width) * lw;
    page.drawImage(logo, { x: M, y: y - lh, width: lw, height: lh });
    page.drawText(clean("PR09_1.6_AA09"), { x: W - M - bold.widthOfTextAtSize("PR09_1.6_AA09", 9), y: y - 10, size: 9, font: bold, color: soft });
    page.drawText(clean(r.number), { x: W - M - font.widthOfTextAtSize(r.number, 9), y: y - 24, size: 9, font, color: soft });
    y -= lh + 14;
  } catch {
    y -= 10;
  }
  for (const l of wrapRuns([{ t: "AUTORIZZAZIONE ALLA TRASFERTA IN ITALIA, IN SVIZZERA ED EUROPA IN GIORNATA, USCITE PAESE PER RINNOVO VISTO", b: true }], W - 2 * M, 12)) {
    let x = M;
    for (const w of l) {
      page.drawText(w.t, { x, y: y - 12, size: 12, font: bold, color: ink });
      x += bold.widthOfTextAtSize(w.t + " ", 12);
    }
    y -= 17;
  }
  y -= 10;

  // ---------------------------------------------------------------- sentence
  const approver = approvals.find((a) => a.signer_role === "PM");
  const when =
    r.start_date === r.end_date ? [{ t: "il giorno " }, { t: dateOnly(r.start_date), b: true }] : [{ t: "dal " }, { t: dateOnly(r.start_date), b: true }, { t: " al " }, { t: dateOnly(r.end_date), b: true }];
  para([
    { t: "Il/La sottoscritto/a " },
    { t: approver?.user_name ?? "____________", b: true },
    { t: ", in qualità di Direttore o Responsabile di Area, autorizza " },
    { t: r.traveler_name, b: true },
    { t: r.role_title ? ` (${r.role_title})` : "" },
    { t: " a recarsi " },
    ...when,
    { t: " a " },
    { t: r.destination, b: true },
    { t: " per i seguenti motivi: " },
    { t: r.tdr ?? "____________", b: true },
  ]);
  y -= 4;
  para([{ t: "utilizzando:" }], { gap: 2 });
  const has = (k: string) => r.transport.includes(k);
  option(has("company_car"), [{ t: "auto di servizio" }]);
  option(has("own_car"), [{ t: "mezzo proprio a benzina/diesel/GPL" }]);
  option(has("own_electric"), [{ t: "mezzo proprio elettrico" }]);
  option(has("public"), [{ t: "mezzo pubblico (car sharing, treno, autobus/tram)" }]);
  y -= 6;

  const alloc = (c: CostType) => {
    const rows = (r.allocations ?? []).filter((a) => a.cost_type === c);
    return rows.length ? rows.map((a) => `progetto n° ${a.project_code}, Budget line n° ${a.budget_line}`).join("; ") : "";
  };
  const charge = (c: CostType) => (alloc(c) ? [{ t: ` (da caricare sul ${alloc(c)})` }] : []);

  option(r.advance_amount != null, [{ t: "con richiesta di anticipo di € " }, { t: r.advance_amount != null ? money(r.advance_amount) : "________", b: r.advance_amount != null }]);
  option(r.compensation_charged, [{ t: "Il suo normale compenso contrattualmente stabilito" }, ...(r.compensation_charged ? charge("compensation") : [])]);
  option(r.lodging_mode === "per_diem", [
    { t: "Indennità di trasferta (Per Diem) di € " },
    { t: r.lodging_mode === "per_diem" && r.per_diem_rate ? money(r.per_diem_rate) : "________", b: r.lodging_mode === "per_diem" && !!r.per_diem_rate },
    { t: " al giorno" },
    ...(r.lodging_mode === "per_diem" ? charge("per_diem") : []),
  ]);
  const rk = r.lodging_mode === "receipts" ? r.reimb_kind : null;
  option(rk === "either", [{ t: "Rimborso analitico delle spese di vitto o alloggio, oppure vitto o alloggio gratuito" }]);
  option(rk === "both", [{ t: "Rimborso analitico delle spese di vitto e alloggio, oppure vitto e alloggio gratuito" }]);
  option(rk === "expat_exit", [{ t: "Rimborso analitico delle spese di viaggio dell'espatriato, per l'uscita dal paese a seguito di rinnovo visto, fino ad un massimo di 250,00 Euro." }]);
  option(r.hotel_needed, [
    { t: "Acquisto biglietto Aereo/Treno o Albergo da parte di Istituto Oikos E.T.S." },
    ...(r.hotel_needed ? charge("bookings") : []),
    ...(r.hotel_needed && r.tickets_note ? [{ t: ` - ${r.tickets_note}`, b: false }] : []),
  ]);
  y -= 8;

  if (r.notes) para([{ t: "Note: ", b: true }, { t: r.notes }]);
  y -= 4;
  para([
    {
      t: "Ai fini del rimborso, il/la richiedente si impegna a produrre una Nota Spese corredata da titoli di viaggio, fatture/ricevute per vitto e alloggio, ricevute taxi e parcheggio, spese di autostrada, riepilogo del viaggio effettuato con mezzo proprio.",
    },
  ]);

  // ---------------------------------------------------------------- signatures
  y -= 14;
  ensure(120);
  const place = "Milano";
  para([{ t: `Luogo e data: ${place}, ${dateOnly(r.created_at.slice(0, 10))}` }], { gap: 10 });
  const colW = (W - 2 * M) / 2;
  const top = y;
  page.drawText("Il/La collaboratore/trice (richiedente)", { x: M, y: top - 10, size: 9, font: bold, color: soft });
  page.drawText(clean(`${r.requester_name}`), { x: M, y: top - 26, size: SIZE, font, color: ink });
  page.drawText(clean(`firmato online il ${dt(r.created_at)}`), { x: M, y: top - 40, size: 8.5, font, color: soft });
  page.drawText("Il/La responsabile", { x: M + colW, y: top - 10, size: 9, font: bold, color: soft });
  if (approver) {
    page.drawText(clean(approver.user_name), { x: M + colW, y: top - 26, size: SIZE, font, color: ink });
    page.drawText(clean(approver.signed_at ? `firmato online il ${dt(approver.signed_at)}` : "in attesa di firma"), {
      x: M + colW,
      y: top - 40,
      size: 8.5,
      font,
      color: soft,
    });
  }
  y = top - 64;

  para(
    [
      {
        t: "Per trasferte in Europa e Svizzera, il lavoratore è tenuto ad avere sempre con sé la tessera europea di assicurazione malattia che dà diritto all'assistenza sanitaria statale in caso di permanenza temporanea in uno dei 27 Stati membri dell'UE, in Islanda, in Liechtenstein, in Norvegia e in Svizzera, alle stesse condizioni e allo stesso costo (gratuitamente in alcuni paesi) degli assistiti del paese in cui ci si trova. Pertanto, NON è prevista l'attivazione di una copertura assicurativa aggiuntiva.",
      },
    ],
    { size: 8.5, color: soft },
  );

  page.drawText(clean(`Generato dal PAS il ${dt(new Date().toISOString())}`), { x: M, y: 24, size: 8, font, color: soft });
  return pdf.save();
}

export type { PDFFont };
