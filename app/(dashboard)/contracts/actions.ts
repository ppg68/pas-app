"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ContractStatus } from "@/lib/domain/contracts";

// redirect() throws internally — used here to bring a readable error message
// back to the originating page instead of letting the server action blow up
// with a raw Postgres exception (same pattern as lib/domain/workflow.ts).
function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function str(formData: FormData, key: string): string {
  return String(formData.get(key) || "").trim();
}

function optStr(formData: FormData, key: string): string | null {
  const v = str(formData, key);
  return v || null;
}

function optDate(formData: FormData, key: string): string | null {
  const v = str(formData, key);
  return v || null;
}

export async function createContract(formData: FormData) {
  const subject = str(formData, "subject");
  const amount = parseFloat(str(formData, "amount"));

  if (!subject || !Number.isFinite(amount) || amount < 0) {
    fail("/contracts/new", "Subject and a valid amount are required.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) fail("/contracts/new", "Session expired, please log in again.");

  const { data: inserted, error } = await supabase
    .from("contracts")
    .insert({
      subject,
      status: (str(formData, "status") || "in_corso") as ContractStatus,
      typology: optStr(formData, "typology"),
      unit: optStr(formData, "unit"),
      role_title: optStr(formData, "role_title"),
      activity: optStr(formData, "activity"),
      country: optStr(formData, "country"),
      project_code: optStr(formData, "project_code"),
      ir_code: optStr(formData, "ir_code"),
      contract_kind: optStr(formData, "contract_kind"),
      signed_date: optDate(formData, "signed_date"),
      start_date: optDate(formData, "start_date"),
      end_date: optDate(formData, "end_date"),
      project_deadline: optDate(formData, "project_deadline"),
      currency: str(formData, "currency") || "EUR",
      amount,
      payment_terms: optStr(formData, "payment_terms"),
      referent: optStr(formData, "referent"),
      notes: optStr(formData, "notes"),
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    fail("/contracts/new", error?.message ?? "Unable to create the contract.");
  }

  revalidatePath("/contracts");
  redirect(`/contracts/${inserted.id}`);
}

export async function updateContract(contractId: string, formData: FormData) {
  const subject = str(formData, "subject");
  const amount = parseFloat(str(formData, "amount"));
  if (!subject || !Number.isFinite(amount) || amount < 0) {
    fail(`/contracts/${contractId}`, "Subject and a valid amount are required.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("contracts")
    .update({
      subject,
      status: (str(formData, "status") || "in_corso") as ContractStatus,
      typology: optStr(formData, "typology"),
      unit: optStr(formData, "unit"),
      role_title: optStr(formData, "role_title"),
      activity: optStr(formData, "activity"),
      country: optStr(formData, "country"),
      project_code: optStr(formData, "project_code"),
      ir_code: optStr(formData, "ir_code"),
      contract_kind: optStr(formData, "contract_kind"),
      signed_date: optDate(formData, "signed_date"),
      start_date: optDate(formData, "start_date"),
      end_date: optDate(formData, "end_date"),
      project_deadline: optDate(formData, "project_deadline"),
      currency: str(formData, "currency") || "EUR",
      amount,
      payment_terms: optStr(formData, "payment_terms"),
      referent: optStr(formData, "referent"),
      notes: optStr(formData, "notes"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", contractId);

  if (error) fail(`/contracts/${contractId}`, error.message);

  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/contracts");
}

export async function deleteContract(contractId: string) {
  const supabase = await createClient();
  await supabase.from("contracts").delete().eq("id", contractId);
  revalidatePath("/contracts");
  redirect("/contracts");
}

/** Generic toggle for the compliance checklist columns (Firmato, privacy, PSEA Policy, ...). */
export async function toggleComplianceField(
  contractId: string,
  field:
    | "signed"
    | "privacy"
    | "code_of_conduct"
    | "psea_policy"
    | "criminal_record_check"
    | "technical_requirements_check"
    | "labor_inspectorate_notice",
  value: boolean
) {
  const supabase = await createClient();
  const patch: Record<string, boolean | string> = {
    [field]: value,
    updated_at: new Date().toISOString(),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await supabase.from("contracts").update(patch as any).eq("id", contractId);
  revalidatePath(`/contracts/${contractId}`);
}

export async function addTranche(contractId: string, formData: FormData) {
  const amount = parseFloat(str(formData, "amount"));
  if (!Number.isFinite(amount) || amount <= 0) {
    fail(`/contracts/${contractId}`, "The tranche amount must be a positive number.");
  }

  const supabase = await createClient();
  const { count } = await supabase
    .from("contract_tranches")
    .select("id", { count: "exact", head: true })
    .eq("contract_id", contractId);

  const { error } = await supabase.from("contract_tranches").insert({
    contract_id: contractId,
    seq: (count ?? 0) + 1,
    label: optStr(formData, "label"),
    amount,
    due_date: optDate(formData, "due_date"),
    due_condition: optStr(formData, "due_condition"),
    notes: optStr(formData, "notes"),
  });

  if (error) fail(`/contracts/${contractId}`, error.message);

  revalidatePath(`/contracts/${contractId}`);
}

export async function deleteTranche(contractId: string, trancheId: string) {
  const supabase = await createClient();
  await supabase.from("contract_tranches").delete().eq("id", trancheId);
  revalidatePath(`/contracts/${contractId}`);
}

export async function toggleTranchePaid(contractId: string, trancheId: string, paid: boolean) {
  const supabase = await createClient();
  await supabase
    .from("contract_tranches")
    .update({
      paid,
      paid_date: paid ? new Date().toISOString().slice(0, 10) : null,
    })
    .eq("id", trancheId);
  revalidatePath(`/contracts/${contractId}`);
}
