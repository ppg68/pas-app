// Suggests the amount, currency and date of a receipt from the text inside its PDF (no upload, no external service:
// everything runs in the browser). Scanned PDFs have no text: nothing is suggested and the person types the values.

export type ReceiptGuess = {
  amount?: number;
  currency?: string;
  /** YYYY-MM-DD */
  date?: string;
  /** the PDF has no readable text (a scan) */
  noText?: boolean;
};

const SYMBOLS: Record<string, string> = { "€": "EUR", "$": "USD", "£": "GBP" };
const CODES = ["EUR", "USD", "GBP", "CHF", "MZN", "TZS", "LBP", "XOF", "XAF", "KES", "UGX", "ZAR", "INR", "AED", "THB", "TND", "MAD", "EGP", "BRL", "CAD", "AUD", "JPY", "CNY", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "RON"];

/** "1.234,56" / "1,234.56" / "45,50" / "45.50" -> number. */
export function parseNumber(s: string): number | null {
  const t = s.trim();
  const lastComma = t.lastIndexOf(",");
  const lastDot = t.lastIndexOf(".");
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    // the later separator is the decimal one
    normalized = lastComma > lastDot ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (lastComma >= 0) normalized = t.replace(",", ".");
  else normalized = t;
  const v = parseFloat(normalized);
  return Number.isFinite(v) ? v : null;
}

const AMOUNT = /(?<![\d.,])(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})(?![\d])/g;

const STRONG = /(totale\s+(documento|complessivo|fattura|da\s+pagare|generale|importo)|importo\s+(totale|dovuto|da\s+pagare)|totale\s+pagato|da\s+pagare|grand\s+total|total\s+(amount|due|price|paid)|amount\s+(due|paid)|balance\s+due|net\s+to\s+pay|total\s+a\s+pagar|montant\s+total|total\s+ttc)/i;
const WEAK = /(\btotale\b|\btotal\b|\bimporto\b|\bamount\b|\bsum\b|\bpagato\b|\bpaid\b)/i;
const NOT_TOTAL = /(imponibile|\biva\b|subtotal|sub-total|subtotale|\btax\b|\bvat\b|tasse|resto|change|sconto|discount|mancia|tip\b|acconto|deposit)/i;

function detectCurrency(text: string, near: string): string | undefined {
  for (const [sym, code] of Object.entries(SYMBOLS)) if (near.includes(sym)) return code;
  const m = new RegExp(`\\b(${CODES.join("|")})\\b`).exec(near) ?? new RegExp(`\\b(${CODES.join("|")})\\b`).exec(text);
  if (m) return m[1];
  if (/\beuro\b/i.test(near) || /\beuro\b/i.test(text)) return "EUR";
  if (text.includes("€")) return "EUR";
  return undefined;
}

function detectDate(text: string): string | undefined {
  const found: { iso: string; score: number }[] = [];
  const push = (y: number, m: number, d: number, idx: number) => {
    if (y < 2020 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return;
    const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const ctx = text.slice(Math.max(0, idx - 30), idx).toLowerCase();
    found.push({ iso, score: /(data|date|emess|issued|fattura|invoice|datum|fecha)/.test(ctx) ? 1 : 0 });
  };
  for (const m of text.matchAll(/(?<!\d)(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})(?!\d)/g)) push(+m[3], +m[2], +m[1], m.index ?? 0);
  for (const m of text.matchAll(/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g)) push(+m[1], +m[2], +m[3], m.index ?? 0);
  if (found.length === 0) return undefined;
  found.sort((a, b) => b.score - a.score);
  return found[0].iso;
}

/** The suggestions from the text of a receipt. Pure function: easy to test. */
export function guessReceipt(text: string): ReceiptGuess {
  const clean = text.replace(/ /g, " ");
  if (clean.replace(/\s/g, "").length < 15) return { noText: true };
  const lines = clean.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  type Cand = { value: number; rank: number; line: string };
  const cands: Cand[] = [];
  lines.forEach((line, i) => {
    const strong = STRONG.test(line);
    const weak = WEAK.test(line);
    const excluded = NOT_TOTAL.test(line) && !strong;
    // the amount is on the keyword line or on the next one ("Totale" / "45,50")
    const scope = [line, ...(strong || weak ? [lines[i + 1] ?? ""] : [])];
    const isKeyword = strong || weak;
    scope.forEach((s, k) => {
      if (k === 1 && !/^[^\d]*$/.test(line.replace(AMOUNT, ""))) {
        // next line only counts when the keyword line carries no amount of its own
        if ([...line.matchAll(AMOUNT)].length > 0) return;
      }
      for (const m of s.matchAll(AMOUNT)) {
        const value = parseNumber(m[1]);
        if (value == null || value <= 0) continue;
        if (isKeyword && !excluded) cands.push({ value, rank: strong ? 3 : 2, line: s });
        else if (!isKeyword && /[€$£]|\b(EUR|USD|GBP|CHF)\b/.test(s)) cands.push({ value, rank: 1, line: s });
      }
    });
  });
  if (cands.length === 0) return { date: detectDate(clean), currency: detectCurrency(clean, clean) };
  const top = Math.max(...cands.map((c) => c.rank));
  const best = cands.filter((c) => c.rank === top).sort((a, b) => b.value - a.value)[0];
  return { amount: best.value, currency: detectCurrency(clean, best.line), date: detectDate(clean) };
}

/** Reads the text of the first pages of a PDF in the browser. */
export async function readPdfText(file: File, maxPages = 4): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out: string[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, maxPages); p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // one text line per vertical position
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const it of content.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 3);
      const r = rows.get(y) ?? [];
      r.push({ x: it.transform[4], s: it.str });
      rows.set(y, r);
    }
    [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .forEach(([, r]) => out.push(r.sort((a, b) => a.x - b.x).map((x) => x.s).join(" ")));
  }
  return out.join("\n");
}

export async function guessFromPdf(file: File): Promise<ReceiptGuess> {
  try {
    return guessReceipt(await readPdfText(file));
  } catch {
    return { noText: true };
  }
}
