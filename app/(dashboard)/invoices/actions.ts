"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { normalizeContractNumber } from "@/lib/domain/contracts";
import { fetchProjectCups, cupForProject } from "@/lib/domain/projectCups";
import { irKey, findRequestByIr } from "@/lib/domain/irRefs";
import { notifyInvoiceArrived } from "@/lib/domain/invoiceNotify";
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
const NUMBER_FIELDS = new Set(["amount"]);

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

  // IR number: link the request and take project code and budget line from it.
  if (field === "ir_number") {
    const ir = irKey(String(patch.ir_number ?? ""));
    let requestId: string | null = null;
    if (ir) {
      const r = await findRequestByIr(supabase, ir);
      if (r) {
        requestId = r.id;
        if (r.project_code) patch.project_code = r.project_code;
        if (r.budget_line) patch.budget_line = r.budget_line;
      }
    }
    patch.request_id = requestId;
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

  // IR number typed on an existing invoice: remember which request it was linked to before.
  let previousRequestId: string | null = null;
  if (field === "ir_number") {
    const { data: before } = await supabase.from("invoices").select("request_id").eq("id", invoiceId).maybeSingle();
    previousRequestId = before?.request_id ?? null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await supabase.from("invoices").update(patch as any).eq("id", invoiceId);

  if (field === "ir_number" && typeof patch.request_id === "string" && patch.request_id !== previousRequestId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: inv } = await supabase
      .from("invoices")
      .select("supplier, amount, currency")
      .eq("id", invoiceId)
      .maybeSingle();
    await notifyInvoiceArrived({
      supabase,
      requestId: patch.request_id,
      enteredBy: user?.id ?? null,
      supplier: inv?.supplier ?? null,
      amount: inv?.amount ?? 0,
      currency: inv?.currency ?? "EUR",
    });
  }

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
  let reqProject: string | null = null;
  let reqBudget: string | null = null;
  if (irNumber) {
    const found = await findRequestByIr(supabase, irNumber);
    requestId = found?.id ?? null;
    reqProject = found?.project_code ?? null;
    reqBudget = found?.budget_line ?? null;
  }

  // the CUP of the project (Approved projects) wins over what was typed
  const projectCode = str(formData, "project_code") || reqProject;
  const cup = cupForProject(await fetchProjectCups(supabase), projectCode) ?? (str(formData, "cup") || null);

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
      pa_signed: formData.get("pa_signed") === "on",
      project_code: projectCode,
      budget_line: str(formData, "budget_line") || reqBudget,
      cup,
      notes: str(formData, "notes") || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect("/invoices/new?error=" + encodeURIComponent(error?.message ?? "Unable to create the invoice."));
  }

  if (requestId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await notifyInvoiceArrived({
      supabase,
      requestId,
      enteredBy: user?.id ?? null,
      supplier,
      amount,
      currency: (str(formData, "currency") || "EUR").toUpperCase(),
    });
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
