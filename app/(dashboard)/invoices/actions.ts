"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { normalizeContractNumber } from "@/lib/domain/contracts";
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
// contract_value and balance_due are no longer editable: they are computed from the linked contract.
const NUMBER_FIELDS = new Set(["amount", "withholding"]);

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

  // Keep the real link to the contract in sync with the typed contract number.
  if (field === "contract_number") {
    const num = String(patch.contract_number ?? "");
    let contractId: string | null = null;
    if (num) {
      const { data: contracts } = await supabase.from("contracts").select("id, legacy_id");
      const target = normalizeContractNumber(num);
      contractId =
        (contracts ?? []).find((c) => c.legacy_id && normalizeContractNumber(c.legacy_id) === target)?.id ?? null;
    }
    patch.contract_id = contractId;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await supabase.from("invoices").update(patch as any).eq("id", invoiceId);
  revalidatePath("/invoices");
}

function str(formData: FormData, key: string): string {
  return String(formData.get(key) || "").trim();
}

/** Creates an invoice from the "New invoice" form, resolving the contract and the IR request. */
export async function createInvoiceFromForm(formData: FormData) {
  const supplier = str(formData, "supplier");
  const amount = parseFloat(str(formData, "amount").replace(",", "."));
  if (!supplier || !Number.isFinite(amount) || amount < 0) {
    redirect("/invoices/new?error=" + encodeURIComponent("Supplier and a valid amount are required."));
  }

  const supabase = await createClient();

  // contract: use the canonical number of the contract when it is found
  let contractId: string | null = null;
  let contractNumber: string | null = str(formData, "contract_number") || null;
  if (contractNumber) {
    const { data: contracts } = await supabase.from("contracts").select("id, legacy_id");
    const target = normalizeContractNumber(contractNumber);
    const found = (contracts ?? []).find((c) => c.legacy_id && normalizeContractNumber(c.legacy_id) === target);
    if (found) {
      contractId = found.id;
      contractNumber = found.legacy_id;
    }
  }

  // IR request (historic requests are matched on their IR number)
  const irNumber = str(formData, "ir_number") || null;
  let requestId: string | null = null;
  if (irNumber) {
    const { data: req } = await supabase.from("requests").select("id").eq("legacy_ir_number", irNumber).limit(1);
    requestId = req?.[0]?.id ?? null;
  }

  const num = (k: string) => {
    const v = str(formData, k).replace(",", ".");
    return v === "" ? null : Number.isFinite(parseFloat(v)) ? parseFloat(v) : null;
  };

  const { data, error } = await supabase
    .from("invoices")
    .insert({
      request_id: requestId,
      contract_id: contractId,
      ir_number: irNumber,
      protocol: str(formData, "protocol") || null,
      contract_number: contractNumber,
      supplier,
      due_date: str(formData, "due_date") || null,
      payment_date: str(formData, "payment_date") || null,
      payment_note: str(formData, "payment_note") || null,
      currency: (str(formData, "currency") || "EUR").toUpperCase(),
      amount,
      withholding: num("withholding"),
      pa_signed: formData.get("pa_signed") === "on",
      project_code: str(formData, "project_code") || null,
      budget_line: str(formData, "budget_line") || null,
      cup: str(formData, "cup") || null,
      notes: str(formData, "notes") || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect("/invoices/new?error=" + encodeURIComponent(error?.message ?? "Unable to create the invoice."));
  }

  revalidatePath("/invoices");
  redirect(`/invoices#inv-${data.id}`);
}

/** Delete from the invoice detail page, then go back to the list. */
export async function deleteInvoiceAndGoBack(invoiceId: string) {
  const supabase = await createClient();
  await supabase.from("invoices").delete().eq("id", invoiceId);
  revalidatePath("/invoices");
  redirect("/invoices");
}

export async function deleteInvoice(invoiceId: string) {
  const supabase = await createClient();
  await supabase.from("invoices").delete().eq("id", invoiceId);
  revalidatePath("/invoices");
}
