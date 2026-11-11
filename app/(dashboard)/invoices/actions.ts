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
// payment_date is derived from the invoice payments (see recomputeInvoicePayment)
const DATE_FIELDS = new Set(["due_date"]);
// contract_value and balance_due are no longer editable: they are computed from the linked contract.
const NUMBER_FIELDS = new Set(["amount"]);

type Sb = Awaited<ReturnType<typeof createClient>>;
const BUCKET = "pas-request-files";

/**
 * Keeps folder 07 of the IR in step with the invoice: when the invoice has a file and is linked to an IR, the file
 * (and the invoice protocol) appears in 07 of that IR; when the link or the protocol changes, 07 follows.
 */
async function syncInvoiceFile(supabase: Sb, invoiceId: string) {
  const { data: inv } = await supabase
    .from("invoices")
    .select("request_id, protocol, file_name, file_path, file_size")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!inv?.file_path) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // rows of this file in other IRs (the invoice was moved): remove them and clear 07 there when it is now empty
  const { data: others } = await supabase
    .from("request_files")
    .select("id, request_id")
    .eq("storage_path", inv.file_path)
    .is("archived_at", null);
  for (const o of others ?? []) {
    if (o.request_id === inv.request_id) continue;
    await supabase.from("request_files").delete().eq("id", o.id);
    await uncheckIfEmpty(supabase, o.request_id);
  }
  if (!inv.request_id) return;

  const { data: existing } = await supabase
    .from("request_files")
    .select("id")
    .eq("request_id", inv.request_id)
    .eq("storage_path", inv.file_path)
    .maybeSingle();
  if (existing) {
    await supabase.from("request_files").update({ protocol: inv.protocol }).eq("id", existing.id);
  } else {
    await supabase.from("request_files").insert({
      request_id: inv.request_id,
      doc_key: "07",
      file_name: inv.file_name ?? "invoice",
      storage_path: inv.file_path,
      size_bytes: inv.file_size ?? 0,
      protocol: inv.protocol,
      uploaded_by: user?.id ?? null,
    });
  }
  await supabase.from("request_documents").upsert({
    request_id: inv.request_id,
    doc_key: "07",
    checked: true,
    checked_by: user?.id ?? null,
    checked_at: new Date().toISOString(),
  });
  revalidatePath(`/requests/${inv.request_id}`);
}

async function uncheckIfEmpty(supabase: Sb, requestId: string) {
  const { count } = await supabase
    .from("request_files")
    .select("id", { count: "exact", head: true })
    .eq("request_id", requestId)
    .eq("doc_key", "07");
  if (!count) await supabase.from("request_documents").update({ checked: false }).eq("request_id", requestId).eq("doc_key", "07");
  revalidatePath(`/requests/${requestId}`);
}

/** Removes the invoice file from storage and from folder 07 (the invoice row is updated by the caller). */
async function dropInvoiceFile(supabase: Sb, invoiceId: string) {
  const { data: inv } = await supabase.from("invoices").select("file_path").eq("id", invoiceId).maybeSingle();
  if (!inv?.file_path) return;
  const { data: rows } = await supabase
    .from("request_files")
    .select("id, request_id")
    .eq("storage_path", inv.file_path)
    .is("archived_at", null);
  for (const r of rows ?? []) {
    await supabase.from("request_files").delete().eq("id", r.id);
    await uncheckIfEmpty(supabase, r.request_id);
  }
  await supabase.storage.from(BUCKET).remove([inv.file_path]);
}

/** After the browser has uploaded the file to storage: record it on the invoice and send it to folder 07. */
export async function attachInvoiceFile(invoiceId: string, file: { path: string; name: string; size: number }) {
  if (!file.path.startsWith("invoices/")) return { ok: false, error: "Invalid file path." };
  if (file.size > 20 * 1024 * 1024) return { ok: false, error: "File larger than 20 MB." };
  const supabase = await createClient();
  await dropInvoiceFile(supabase, invoiceId); // replacing: the old file goes away
  const { error } = await supabase
    .from("invoices")
    .update({ file_name: file.name, file_path: file.path, file_size: file.size })
    .eq("id", invoiceId);
  if (error) return { ok: false, error: error.message };
  await syncInvoiceFile(supabase, invoiceId);
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  return { ok: true };
}

export async function removeInvoiceFile(invoiceId: string) {
  const supabase = await createClient();
  await dropInvoiceFile(supabase, invoiceId);
  await supabase.from("invoices").update({ file_name: null, file_path: null, file_size: null }).eq("id", invoiceId);
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  return { ok: true };
}

/** Download link (60 s) of the invoice file. */
export async function getInvoiceFileUrl(invoiceId: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  const supabase = await createClient();
  const { data: inv } = await supabase.from("invoices").select("file_path, file_name").eq("id", invoiceId).maybeSingle();
  if (!inv?.file_path) return { ok: false, error: "No file on this invoice." };
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(inv.file_path, 60, { download: inv.file_name ?? true });
  if (error || !data) return { ok: false, error: "The file is no longer available here (it may be archived on the server)." };
  return { ok: true, url: data.signedUrl };
}

/** An invoice counts as paid when the dated payments cover its amount (1 currency unit of tolerance). */
const PAID_TOLERANCE = 1;

/**
 * invoices.payment_date = date of the last payment once the invoice is fully paid; empty while it is unpaid or
 * only partly paid (the contract pages read it as "paid").
 */
async function recomputeInvoicePayment(supabase: Sb, invoiceId: string) {
  const [{ data: inv }, { data: pays }] = await Promise.all([
    supabase.from("invoices").select("amount, payment_date").eq("id", invoiceId).maybeSingle(),
    supabase.from("invoice_payments").select("payment_date, amount").eq("invoice_id", invoiceId),
  ]);
  if (!inv) return;
  const dated = (pays ?? []).filter((p) => p.payment_date);
  const paid = dated.reduce((sum, p) => sum + (p.amount ?? 0), 0);
  const last = dated.map((p) => p.payment_date as string).sort().pop() ?? null;
  const fullyPaid = dated.length > 0 && paid >= (inv.amount ?? 0) - PAID_TOLERANCE;
  const next = fullyPaid ? last : null;
  if (next !== inv.payment_date) await supabase.from("invoices").update({ payment_date: next }).eq("id", invoiceId);
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
}

export async function addInvoicePayment(invoiceId: string, payment: { payment_date: string; amount: number; note: string }) {
  const supabase = await createClient();
  const { error } = await supabase.from("invoice_payments").insert({
    invoice_id: invoiceId,
    payment_date: payment.payment_date || null,
    amount: Number.isFinite(payment.amount) && payment.amount > 0 ? payment.amount : 0,
    note: payment.note.trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  await recomputeInvoicePayment(supabase, invoiceId);
  return { ok: true };
}

export async function updateInvoicePayment(paymentId: string, invoiceId: string, field: "payment_date" | "amount" | "note", raw: string) {
  const supabase = await createClient();
  const patch: { payment_date?: string | null; amount?: number; note?: string | null } = {};
  if (field === "payment_date") patch.payment_date = raw.trim() || null;
  else if (field === "amount") {
    const n = parseFloat(raw);
    patch.amount = Number.isFinite(n) && n > 0 ? n : 0;
  } else patch.note = raw.trim() || null;
  const { error } = await supabase.from("invoice_payments").update(patch).eq("id", paymentId);
  if (error) return { ok: false, error: error.message };
  await recomputeInvoicePayment(supabase, invoiceId);
  return { ok: true };
}

export async function deleteInvoicePayment(paymentId: string, invoiceId: string) {
  const supabase = await createClient();
  await supabase.from("invoice_payments").delete().eq("id", paymentId);
  await recomputeInvoicePayment(supabase, invoiceId);
  return { ok: true };
}

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

  if (field === "ir_number" || field === "protocol") await syncInvoiceFile(supabase, invoiceId);
  if (field === "amount") await recomputeInvoicePayment(supabase, invoiceId);

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
      ...(str(formData, "file_path").startsWith("invoices/")
        ? { file_path: str(formData, "file_path"), file_name: str(formData, "file_name") || "invoice", file_size: parseInt(str(formData, "file_size")) || 0 }
        : {}),
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect("/invoices/new?error=" + encodeURIComponent(error?.message ?? "Unable to create the invoice."));
  }

  await syncInvoiceFile(supabase, data.id);
  if (str(formData, "payment_date")) {
    // an invoice entered already paid: that date and the whole amount are its one payment
    await supabase.from("invoice_payments").insert({ invoice_id: data.id, payment_date: str(formData, "payment_date"), amount });
    await recomputeInvoicePayment(supabase, data.id);
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
  await dropInvoiceFile(supabase, invoiceId);
  await supabase.from("invoices").delete().eq("id", invoiceId);
  revalidatePath("/invoices");
  redirect("/invoices");
}

export async function deleteInvoice(invoiceId: string) {
  const supabase = await createClient();
  await dropInvoiceFile(supabase, invoiceId);
  await supabase.from("invoices").delete().eq("id", invoiceId);
  revalidatePath("/invoices");
}
