/** Advance payments: a payment authorized before the invoice exists. See supabase/migrations_pas/pas_0057. */

/** Days after the authorization within which the invoice must be linked to the advance. */
export const ADVANCE_INVOICE_DAYS = 30;

export const ADVANCE_REASONS: Record<string, string> = {
  proforma: "Supplier proforma",
  online_card: "Online / card purchase",
  ticket_booking: "Ticket or booking",
  deposit: "Deposit or down payment",
  foreign_supplier: "Foreign supplier",
  other: "Other",
};

/** Document keys where the proforma / order confirmation is uploaded (03 Quotations received, 06 Purchase order). */
export const ADVANCE_PROOF_DOC_KEYS = ["03", "06"];

type AdvanceDates = { authorized_at: string | null; created_at: string };

/** Day the invoice is expected: 30 days after the authorization (after the preparation while not yet authorized). */
export function advanceDueDate(pa: AdvanceDates): Date {
  const d = new Date(pa.authorized_at ?? pa.created_at);
  d.setDate(d.getDate() + ADVANCE_INVOICE_DAYS);
  return d;
}

export function isAdvanceOverdue(pa: AdvanceDates, now: Date = new Date()): boolean {
  return advanceDueDate(pa).getTime() < now.getTime();
}
