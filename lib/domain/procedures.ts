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
  /** Administration roles, ANY ONE of which signs (CAR or RAC). The PM signs in addition, see pmRequired. */
  signers: Role[];
}

// PR04 §4.2 thresholds.
export const PROC_CONFIG: ProcConfig[] = [
  // signers = administration roles for the IR approval and the payment authorization: any ONE of them signs.
  // Oikos rule: every expense, including direct purchases, is approved by the administration (CAR or RAC);
  // above DIR the PM (Budget Holder's project manager) signs as well, see pmRequired / irSlots.
  { code: "DIR", label: "Direct Purchase", max: 200, minOffers: 0, signers: ["CAR", "RAC"] },
  { code: "SQ", label: "Single Quotation", max: 2500, minOffers: 1, signers: ["CAR", "RAC"] },
  { code: "3Q", label: "Three Quotations", max: 20000, minOffers: 3, signers: ["CAR", "RAC"] },
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

const PROC_ORDER: ProcCode[] = ["DIR", "SQ", "3Q", "SP", "TEN"];

/**
 * The procedure is chosen by whoever compiles the request: it follows the budget line of the project (e.g. a
 * 2.000 EUR purchase on a 10.000 EUR budget line needs 3Q). The thresholds only give an indication.
 * A procedure higher than the indicated one is always fine; a lower one is allowed only for the
 * derogation 3Q -> SQ (see isDerogation).
 */
export function procedureAllowed(chosen: ProcCode, amount: number | string): boolean {
  const indicated = computeProcedure(amount);
  return PROC_ORDER.indexOf(chosen) >= PROC_ORDER.indexOf(indicated) || isDerogation(chosen, amount);
}

/** Derogation: the amount falls in the 3Q range but the request is run as a Single Quotation. */
export function isDerogation(chosen: ProcCode, amount: number | string): boolean {
  return chosen === "SQ" && computeProcedure(amount) === "3Q";
}

export const DOCS_BY_PROC: Record<ProcCode, string[]> = {
  DIR: ["07"],
  SQ: ["02", "03", "06", "07", "08"],
  "3Q": ["02", "03", "04", "05", "06", "07", "08"],
  SP: ["02", "03", "04", "05", "06", "07", "08"],
  TEN: ["02", "03", "04", "05", "06", "07", "08"],
};

export const OPTIONAL_DOCS = new Set(["02", "05", "06", "08"]);

/** Optional folders for a procedure: the comparative bid (04) is required only for Three Quotations. */
export function isOptionalDoc(procCode: ProcCode, key: string): boolean {
  return OPTIONAL_DOCS.has(key) || (key === "04" && procCode !== "3Q");
}

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
  "rejected",
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
  rejected: "Rejected",
};

const PROC_LETTER: Record<ProcCode, string> = { DIR: "A", SQ: "B", "3Q": "C", SP: "D", TEN: "E" };

/** One required signature: satisfied by a signature of ANY of its roles. */
export interface SignSlot {
  /** form field / key: the role itself, or "ADM" for the CAR-or-RAC slot */
  id: string;
  roles: Role[];
}

function slotOf(roles: Role[]): SignSlot {
  return { id: roles.length === 1 ? roles[0] : "ADM", roles };
}

/**
 * Does the PM sign? Every procedure above Direct Purchase needs the PM besides the administration, unless the
 * request is a coordination cost (no project, so no PM) or the person who compiles it is the PM
 * (nobody signs their own request, so the PM signature is skipped).
 */
export function pmSigns(procCode: ProcCode, coordinationCost: boolean, creatorIsPm: boolean): boolean {
  return procCode !== "DIR" && !coordinationCost && !creatorIsPm;
}

function adminSlots(req: { procCode: ProcCode; coordinationCost: boolean }): SignSlot[] {
  if (req.coordinationCost) return [slotOf(["RAC"])];
  return [slotOf(procConfigFor(req.procCode).signers)];
}

/**
 * Signatures required for the IR approval: PM (when it signs) + one administration signature (CAR or RAC,
 * as the procedure says; coordination costs: RAC). A derogation (3Q -> SQ) needs the prior authorization of
 * the RAC in addition: then CAR and RAC both sign (PR04 section 5).
 */
export function irSlots(req: {
  procCode: ProcCode;
  coordinationCost: boolean;
  derogation: boolean;
  pmRequired: boolean;
}): SignSlot[] {
  const pm = req.pmRequired ? [slotOf(["PM"])] : [];
  if (req.derogation && !req.coordinationCost && req.procCode !== "DIR") {
    return [...pm, slotOf(["CAR"]), slotOf(["RAC"])];
  }
  return [...pm, ...adminSlots(req)];
}

/** Signatures required for each payment authorization (PA): PM (when it signs) + administration. */
export function paymentSlots(req: {
  procCode: ProcCode;
  coordinationCost: boolean;
  pmRequired: boolean;
}): SignSlot[] {
  return [...(req.pmRequired ? [slotOf(["PM"])] : []), ...adminSlots(req)];
}

export function slotLabel(slot: SignSlot): string {
  return slot.roles.length === 1 ? ROLE_LABEL[slot.roles[0]] : "Administration (CAR or RAC)";
}

/** Short form for tables: "PM + CAR/RAC". */
export function slotsShort(slots: SignSlot[]): string {
  return slots.length ? slots.map((s) => s.roles.join("/")).join(" + ") : "none";
}

export function slotSigned(slot: SignSlot, signedRoles: Iterable<Role>): boolean {
  const set = new Set(signedRoles);
  return slot.roles.some((r) => set.has(r));
}

/** The role under which the user would sign this slot (first one they hold). */
export function slotRoleFor(slot: SignSlot, mine: Set<Role>): Role | undefined {
  return slot.roles.find((r) => mine.has(r));
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
  irToken: string; // IR number of the office with "/" replaced by "-" (e.g. "12-IT"), used when country === "IT"
  fieldProgressive: number; // used when country !== "IT" (count of same country+project+proc so far, +1)
}): string {
  const { country, procCode, description, projectCode, irToken, fieldProgressive } = params;
  if (country === "IT") {
    const letter = PROC_LETTER[procCode];
    const shortDesc = (description || "").trim().replace(/\s+/g, " ");
    return `${irToken}_${letter}_${procCode}${shortDesc ? "_" + shortDesc : ""}${projectCode ? "_" + projectCode : ""}`;
  }
  return `${country}/${projectCode}/${procCode}/${String(fieldProgressive).padStart(2, "0")}`;
}

/** Documents gate: all required (non-optional) docs checked -> ready for payment. The folder path is optional. */
export function documentsComplete(
  procCode: ProcCode,
  docs: Record<string, boolean>
): boolean {
  const required = DOCS_BY_PROC[procCode].filter((k) => !isOptionalDoc(procCode, k));
  return required.every((k) => docs[k]);
}
