// Ported 1:1 from pas_prototype.html — keep this file the single source of truth
// for PR04 thresholds, roles, documents and workflow rules. Update it (and only it)
// if the procedure changes; UI components should never hardcode these values.

export type ProcCode = "DIR" | "SQ" | "3Q" | "SP" | "TEN";
export type Role = "BH" | "PM" | "LOG" | "CAR" | "RAC" | "DG" | "CONTRACTS" | "ADMIN";

export const ROLE_LABEL: Record<Role, string> = {
  BH: "Budget Holder",
  PM: "PM/CCP",
  LOG: "Logistics (LOG)",
  CAR: "CAR / Admin (Project Accounting Officer)",
  RAC: "RAC",
  DG: "Director (DG)",
  // Not a procurement-workflow role: gates the whole Contracts module (see
  // lib/domain/contracts.ts). Managed day-to-day from /contracts/access, not
  // this list — kept here too only so an existing RAC/CAR can bootstrap the
  // very first Contracts admin without needing the Supabase SQL Editor.
  CONTRACTS: "Contracts access",
  // Only role that can open Team and assign roles (see migration 0022).
  ADMIN: "Administrator",
};
export const ROLES = Object.keys(ROLE_LABEL) as Role[];

export interface ProcConfig {
  code: ProcCode;
  label: string;
  max: number;
  minOffers: number;
  signers: Role[];
}

// PR04 §4.2 thresholds.
export const PROC_CONFIG: ProcConfig[] = [
  // signers = who authorizes the IR and the payment in the standard case (PR04 4.5, as applied at Oikos:
  // the Budget Holder is the PM, so only the administrative figures CAR / RAC sign). DIR: no approval at all,
  // the IR only exists to give a number to the archived documents.
  { code: "DIR", label: "Direct Purchase", max: 200, minOffers: 0, signers: [] },
  { code: "SQ", label: "Single Quotation", max: 2500, minOffers: 1, signers: ["CAR"] },
  { code: "3Q", label: "Three Quotations", max: 20000, minOffers: 3, signers: ["CAR"] },
  { code: "SP", label: "Simplified Procedure", max: 100000, minOffers: 3, signers: ["CAR"] },
  { code: "TEN", label: "Tender", max: Infinity, minOffers: 3, signers: ["RAC"] },
];

export function procConfigFor(code: ProcCode): ProcConfig {
  return PROC_CONFIG.find((p) => p.code === code) ?? PROC_CONFIG[0];
}

export function computeProcedure(amount: number | string): ProcCode {
  const n = parseFloat(String(amount)) || 0;
  for (const p of PROC_CONFIG) if (n <= p.max) return p.code;
  return "TEN";
}

/** Derogation rule: a would-be "3Q" downgrades to "SQ" (with RAC sign-off handled at IR-approval stage). */
export function effectiveProcCode(estimatedPrice: number | string, derogation: boolean): ProcCode {
  const computed = computeProcedure(estimatedPrice);
  return derogation && computed === "3Q" ? "SQ" : computed;
}

export const DOCS_BY_PROC: Record<ProcCode, string[]> = {
  DIR: ["07"],
  SQ: ["02", "03", "06", "07", "08"],
  "3Q": ["02", "03", "04", "05", "06", "07", "08"],
  SP: ["02", "03", "04", "05", "06", "07", "08"],
  TEN: ["02", "03", "04", "05", "06", "07", "08"],
};

export const OPTIONAL_DOCS = new Set(["02", "06", "08"]);

export const FOLDER_NAMES: Record<string, string> = {
  "01": "01 Internal Request",
  "02": "02 Quotations request",
  "03": "03 Quotations received",
  "04": "04 Comparative Bid",
  "05": "05 Contract TOR",
  "06": "06 Purchase order",
  "07": "07 Invoice",
  "08": "08 Delivery note",
  "09": "09 Payment authorization",
  "10": "10 ADM Proof of payment",
};

export const STAGE_LABELS = [
  "request",
  "ir_auth",
  "offers",
  "winner",
  "documents",
  "payment",
  "completed",
] as const;
export type Stage = (typeof STAGE_LABELS)[number];

export const STAGE_TITLES: Record<Stage, string> = {
  request: "Request",
  ir_auth: "IR approval",
  offers: "Offers",
  winner: "Winner",
  documents: "Documents",
  payment: "Payment",
  completed: "Closed",
};

const PROC_LETTER: Record<ProcCode, string> = { DIR: "A", SQ: "B", "3Q": "C", SP: "D", TEN: "E" };

/**
 * Who must sign the IR approval. DIR: nobody. Coordination costs (no linked project): RAC instead of CAR.
 * A derogation (3Q -> SQ) needs the prior authorization of the RAC in addition (PR04 section 5).
 */
export function irSigners(req: { procCode: ProcCode; coordinationCost: boolean; derogation: boolean }): Role[] {
  if (req.procCode === "DIR") return [];
  if (req.coordinationCost) return ["RAC"];
  const base = procConfigFor(req.procCode).signers;
  return req.derogation && !base.includes("RAC") ? [...base, "RAC"] : base;
}

/**
 * Which roles must sign the payment authorization for a given request.
 * DIR: none. Coordination costs (no linked project): RAC only. Otherwise the procedure signers.
 */
export function paymentSigners(req: { procCode: ProcCode; coordinationCost: boolean }): Role[] {
  if (req.procCode === "DIR") return [];
  if (req.coordinationCost) return ["RAC"];
  return procConfigFor(req.procCode).signers;
}

/** Segregation of duties: whoever initiated the request cannot sign it (IR approval or payment). */
export function canSign(userId: string, initiatedBy: string): boolean {
  return userId !== initiatedBy;
}

export function buildRequestCode(params: {
  country: string; // "IT" = HQ numbering, anything else = field-office numbering
  procCode: ProcCode;
  description: string;
  projectCode: string;
  hqNumber: number; // used when country === "IT"
  fieldProgressive: number; // used when country !== "IT" (count of same country+project+proc so far, +1)
}): string {
  const { country, procCode, description, projectCode, hqNumber, fieldProgressive } = params;
  if (country === "IT") {
    const letter = PROC_LETTER[procCode];
    const shortDesc = (description || "").trim().replace(/\s+/g, " ");
    return `${hqNumber}_${letter}_${procCode}${shortDesc ? "_" + shortDesc : ""}${projectCode ? "_" + projectCode : ""}`;
  }
  return `${country}/${projectCode}/${procCode}/${String(fieldProgressive).padStart(2, "0")}`;
}

/** Documents gate: all required (non-optional) docs checked -> ready for payment. The folder path is optional. */
export function documentsComplete(
  procCode: ProcCode,
  docs: Record<string, boolean>
): boolean {
  const required = DOCS_BY_PROC[procCode].filter((k) => !OPTIONAL_DOCS.has(k));
  return required.every((k) => docs[k]);
}
