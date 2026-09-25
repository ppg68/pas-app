"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const TEXT_FIELDS = new Set([
  "ir_number",
  "protocol",
  "contract_number",
  "supplier",
  "payment_note",
  "currency",
  "project_code",
  "budget_line",
  "cup",
  "notes",
]);
const DATE_FIELDS = new Set(["due_date", "payment_date"]);
const NUMBER_FIELDS = new Set(["amount", "withholding", "contract_value", "balance_due"]);

/** Whitelisted inline-edit save for a single cell in the Invoices table. */
export async function updateInvoiceField(invoiceId: string, field: string, rawValue: string) {
  const supabase = await createClient();
  const patch: Record<string, string | number | boolean | null> = {};

  if (field === "pa_signed") {
    patch[field] = rawValue === "true";
  } else if (NUMBER_FIELDS.has(field)) {
    if (!rawValue.trim()) {
      if (field === "amount") return; // amount is not nullable
      patch[field] = null;
    } else {
      const n = parseFloat(rawValue);
      if (!Number.isFinite(n)) return;
      patch[field] = n;
    }
  } else if (DATE_FIELDS.has(field) || TEXT_FIELDS.has(field)) {
    const v = rawValue.trim();
    if (field === "currency") patch[field] = v.toUpperCase() || "EUR";
    else patch[field] = v || null;
  } else {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await supabase.from("invoices").update(patch as any).eq("id", invoiceId);
  revalidatePath("/invoices");
}

export async function createInvoice() {
  const supabase = await createClient();
  await supabase.from("invoices").insert({ supplier: "New invoice" });
  revalidatePath("/invoices");
}

export async function deleteInvoice(invoiceId: string) {
  const supabase = await createClient();
  await supabase.from("invoices").delete().eq("id", invoiceId);
  revalidatePath("/invoices");
}
