"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendEmail, escapeHtml } from "@/lib/notify";
import {
  buildContractBlocks,
  type ContractBlock,
  type ContractRequestRow,
  type ContractType,
  type RequestKind,
  type SchedaData,
} from "@/lib/domain/contractRequests";

// redirect() throws internally: used to bring a readable message back to the page (same pattern as workflow.ts).
function fail(path: string, message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

const str = (f: FormData, k: string) => String(f.get(k) || "").trim();
const opt = (f: FormData, k: string) => str(f, k) || null;

type Holder = { id: string; full_name: string; email: string | null };

async function holders(supabase: Awaited<ReturnType<typeof createClient>>, role: "PM" | "RAC" | "CONTRACTS" | "DG") {
  const { data } = await supabase.rpc("contract_role_holders", { r: role });
  return (data ?? []) as Holder[];
}

async function baseUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "";
}

/** Reads the scheda fields from the form (same field names for create and edit). */
function parseScheda(f: FormData, kind: RequestKind) {
  const amount = parseFloat(str(f, "amount"));
  const data: SchedaData = {
    capacity: str(f, "capacity") || undefined,
    party_art: (str(f, "party_art") as SchedaData["party_art"]) || undefined,
    accommodation: str(f, "accommodation") as SchedaData["accommodation"],
    meals: str(f, "meals") as SchedaData["meals"],
    per_diem: str(f, "per_diem") as SchedaData["per_diem"],
    other_reimb: str(f, "other_reimb") || undefined,
    flights_count: str(f, "flights_count") || undefined,
    flights_route: str(f, "flights_route") || undefined,
    flights_max: str(f, "flights_max") || undefined,
    flight_bl: str(f, "flight_bl") || undefined,
    visa_bl: str(f, "visa_bl") || undefined,
    accommodation_bl: str(f, "accommodation_bl") || undefined,
    insurance: str(f, "insurance") as SchedaData["insurance"],
    insurance_bl: str(f, "insurance_bl") || undefined,
    equipment: str(f, "equipment") || undefined,
    public_employee: str(f, "public_employee") as SchedaData["public_employee"],
    tdr: f.get("tdr") === "on",
    signing_date: str(f, "signing_date") || undefined,
  };
  const startOnSignature = f.get("start_on_signature") === "on";
  return {
    amount,
    fields: {
      kind,
      ir_code: opt(f, "ir_code"),
      proc_type: opt(f, "proc_type"),
      party_name: str(f, "party_name"),
      party_short: opt(f, "party_short"),
      nationality: opt(f, "nationality"),
      address: opt(f, "address"),
      tax_code: opt(f, "tax_code"),
      vat_number: opt(f, "vat_number"),
      email: opt(f, "email"),
      pec: opt(f, "pec"),
      legal_rep: opt(f, "legal_rep"),
      legal_rep_role: opt(f, "legal_rep_role"),
      contact_person: opt(f, "contact_person"),
      contact_email: opt(f, "contact_email"),
      contact_email_admin: opt(f, "contact_email_admin"),
      contract_type: (str(f, "contract_type") === "occasional" ? "occasional" : "consultancy_vat") as ContractType,
      start_on_signature: startOnSignature,
      start_date: startOnSignature ? null : opt(f, "start_date"),
      end_date: opt(f, "end_date"),
      project_title: opt(f, "project_title"),
      donor_code: opt(f, "donor_code"),
      internal_code: opt(f, "internal_code"),
      budget_line: opt(f, "budget_line"),
      role_title: opt(f, "role_title"),
      staff_like: f.get("staff_like") === "on",
      activities: opt(f, "activities"),
      objective: opt(f, "objective"),
      minors: f.get("minors") === "on",
      work_place: opt(f, "work_place"),
      amount,
      currency: str(f, "currency") || "EUR",
      fee_mode: (str(f, "fee_mode") === "daily" ? "daily" : "total") as "daily" | "total",
      fee_note: opt(f, "fee_note"),
      payment_terms: opt(f, "payment_terms"),
      data,
    },
  };
}

function validate(path: string, kind: RequestKind, p: ReturnType<typeof parseScheda>) {
  const f = p.fields;
  if (!f.party_name) fail(path, kind === "company" ? "Enter the name of the company or organisation." : "Enter the name and surname.");
  if (!Number.isFinite(p.amount) || p.amount <= 0) fail(path, "Enter the contract amount.");
  if (!f.activities) fail(path, "Describe the activities to be carried out.");
  if (!f.start_on_signature && !f.start_date) fail(path, "Enter the start date (or tick 'from signature').");
  if (!f.end_date) fail(path, "Enter the end date.");
  if (f.start_date && f.end_date && f.end_date < f.start_date) fail(path, "The end date is before the start date.");
  if (kind === "company" && !f.legal_rep) fail(path, "Enter the legal representative of the company.");
}

export async function createContractRequest(kind: RequestKind, formData: FormData) {
  const path = `/contract-requests/new`;
  const back = `${path}?kind=${kind}`;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) fail(back, "Session expired, please log in again.");

  const parsed = parseScheda(formData, kind);
  validate(back, kind, parsed);

  const pmId = str(formData, "approver_PM");
  const racId = str(formData, "approver_RAC");
  if (!pmId || !racId) fail(back, "Choose the PM / Programme Manager and the RAC who will approve.");
  if (pmId === user.id || racId === user.id) fail(back, "You cannot approve your own request.");

  const [pms, racs] = await Promise.all([holders(supabase, "PM"), holders(supabase, "RAC")]);
  const pm = pms.find((h) => h.id === pmId);
  const rac = racs.find((h) => h.id === racId);
  if (!pm || !rac) fail(back, "The chosen approver no longer holds the role. Choose again.");

  const { data: profile } = await supabase.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle();

  const { data: inserted, error } = await supabase
    .from("contract_requests")
    .insert({
      ...parsed.fields,
      requested_by: user.id,
      requester_name: profile?.full_name ?? user.email ?? "",
      requester_email: profile?.email ?? user.email ?? null,
    })
    .select("id, number")
    .single();
  if (error || !inserted) fail(back, error?.message ?? "Could not save the request.");

  const { error: apErr } = await supabase.from("contract_approvals").insert([
    { request_id: inserted.id, signer_role: "PM", user_id: pm.id, user_name: pm.full_name },
    { request_id: inserted.id, signer_role: "RAC", user_id: rac.id, user_name: rac.full_name },
  ]);
  if (apErr) {
    await supabase.from("contract_requests").delete().eq("id", inserted.id);
    fail(back, apErr.message);
  }

  await notifyApprovers(inserted.id, inserted.number, profile?.full_name ?? "A colleague", parsed.fields.party_name, [pm, rac]);
  revalidatePath("/contract-requests");
  redirect(`/contract-requests?created=${encodeURIComponent(inserted.number)}`);
}

async function notifyApprovers(id: string, number: string, requester: string, party: string, list: Holder[]) {
  const link = `${await baseUrl()}/contract-requests/${id}`;
  // sent after the response, so a slow SMTP server never delays or breaks saving the request
  after(async () => {
    try {
      for (const h of list) {
        if (!h.email) continue;
        await sendEmail({
          to: h.email,
          subject: `Contract request ${number}: your approval is needed`,
          html: `<p>Hello ${escapeHtml(h.full_name)},</p>
<p><b>${escapeHtml(requester)}</b> asks to activate a contract with <b>${escapeHtml(party)}</b> (${escapeHtml(number)}). Your approval is needed.</p>
${link ? `<p><a href="${link}">Open the request in PAS</a></p>` : ""}`,
        });
      }
    } catch {
      // best effort
    }
  });
}

export async function updateContractRequest(id: string, formData: FormData) {
  const path = `/contract-requests/${id}/edit`;
  const supabase = await createClient();
  const { data: row } = await supabase.from("contract_requests").select("kind").eq("id", id).maybeSingle();
  if (!row) fail("/contract-requests", "Request not found.");
  const kind = row.kind as RequestKind;
  const parsed = parseScheda(formData, kind);
  validate(path, kind, parsed);

  const { kind: _kind, ...fields } = parsed.fields;
  void _kind;
  const { error } = await supabase.from("contract_requests").update(fields).eq("id", id);
  if (error) fail(path, error.message);
  revalidatePath(`/contract-requests/${id}`);
  redirect(`/contract-requests/${id}`);
}

export async function signContractRequest(id: string, role: "PM" | "RAC") {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sign_contract_request", { rid: id, as_role: role });
  if (error) fail(`/contract-requests/${id}`, error.message);

  type Mail = { to: string; subject: string; html: string };
  const mails: Mail[] = [];
  try {
    const { data: req } = await supabase
      .from("contract_requests")
      .select("number, party_name, requester_name, requester_email")
      .eq("id", id)
      .maybeSingle();
    const link = `${await baseUrl()}/contract-requests/${id}`;
    if (req) {
      const allSigned = Boolean((data as { all_signed?: boolean } | null)?.all_signed);
      if (allSigned) {
        const [contracts, racs, dgs] = await Promise.all([
          holders(supabase, "CONTRACTS"),
          holders(supabase, "RAC"),
          holders(supabase, "DG"),
        ]);
        const seen = new Set<string>();
        const to = [...contracts, ...racs, ...dgs].filter((h) => h.email && !seen.has(h.email) && seen.add(h.email));
        for (const h of to) {
          mails.push({
            to: h.email!,
            subject: `Contract request ${req.number} approved: ${req.party_name}`,
            html: `<p>Hello ${escapeHtml(h.full_name)},</p>
<p>The contract request <b>${escapeHtml(req.number)}</b> (${escapeHtml(req.party_name)}, requested by ${escapeHtml(req.requester_name)}) is fully approved. Contracts can now prepare the contract.</p>
${link ? `<p><a href="${link}">Open the request in PAS</a></p>` : ""}`,
          });
        }
        if (req.requester_email) {
          mails.push({
            to: req.requester_email,
            subject: `Contract request ${req.number} approved`,
            html: `<p>Hello ${escapeHtml(req.requester_name)},</p><p>Your contract request <b>${escapeHtml(req.number)}</b> (${escapeHtml(req.party_name)}) is approved. Contracts will prepare the contract.</p>${link ? `<p><a href="${link}">Open the request</a></p>` : ""}`,
          });
        }
      } else if (req.requester_email) {
        mails.push({
          to: req.requester_email,
          subject: `Contract request ${req.number}: ${role} approved`,
          html: `<p>Hello ${escapeHtml(req.requester_name)},</p><p>The ${role} approved your contract request <b>${escapeHtml(req.number)}</b> (${escapeHtml(req.party_name)}). The other approval is still needed.</p>${link ? `<p><a href="${link}">Open the request</a></p>` : ""}`,
        });
      }
    }
  } catch {
    // best effort
  }
  after(async () => {
    for (const m of mails) {
      try {
        await sendEmail(m);
      } catch {
        // best effort
      }
    }
  });
  revalidatePath(`/contract-requests/${id}`);
  redirect(`/contract-requests/${id}`);
}

export async function cancelContractRequest(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("contract_requests").update({ status: "cancelled" }).eq("id", id);
  if (error) fail(`/contract-requests/${id}`, error.message);
  revalidatePath("/contract-requests");
  redirect(`/contract-requests/${id}`);
}

export async function deleteContractRequest(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("contract_requests").delete().eq("id", id);
  if (error) fail(`/contract-requests/${id}`, error.message);
  revalidatePath("/contract-requests");
  redirect("/contract-requests");
}

/** Contracts: (re)build the editable contract text from the scheda and the template. */
export async function generateContractText(id: string) {
  const supabase = await createClient();
  const { data: req } = await supabase.from("contract_requests").select("*").eq("id", id).maybeSingle();
  if (!req) fail("/contract-requests", "Request not found.");
  const blocks = buildContractBlocks(req as ContractRequestRow);
  const { error } = await supabase
    .from("contract_requests")
    .update({ contract_text: blocks, contract_generated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) fail(`/contract-requests/${id}`, error.message);
  revalidatePath(`/contract-requests/${id}`);
  redirect(`/contract-requests/${id}`);
}

/** Contracts: save the hand-edited contract text. Fields are title_<i> / body_<i> in block order. */
export async function saveContractText(id: string, formData: FormData) {
  const supabase = await createClient();
  const { data: req } = await supabase.from("contract_requests").select("contract_text").eq("id", id).maybeSingle();
  const current = (req?.contract_text ?? []) as ContractBlock[];
  const next: ContractBlock[] = current
    .map((b, i) => ({
      key: b.key,
      title: String(formData.get(`title_${i}`) ?? b.title),
      body: String(formData.get(`body_${i}`) ?? b.body).replace(/\r\n/g, "\n"),
    }))
    .filter((_, i) => formData.get(`remove_${i}`) !== "on");
  const { error } = await supabase.from("contract_requests").update({ contract_text: next }).eq("id", id);
  if (error) fail(`/contract-requests/${id}`, error.message);
  revalidatePath(`/contract-requests/${id}`);
  redirect(`/contract-requests/${id}?saved=1`);
}

/** Contracts: create the draft in the Contracts register (number assigned by the database). */
export async function createContractDraft(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: req } = await supabase.from("contract_requests").select("*").eq("id", id).maybeSingle();
  if (!req) fail("/contract-requests", "Request not found.");
  const r = req as ContractRequestRow;
  if (r.status !== "approved") fail(`/contract-requests/${id}`, "The request must be approved first.");
  if (r.contract_id) fail(`/contract-requests/${id}`, "A contract is already linked.");

  const { data: created, error } = await supabase
    .from("contracts")
    .insert({
      subject: r.party_name,
      status: "in_corso",
      contract_kind: r.contract_type === "occasional" ? "occasionale" : r.vat_number ? "P.IVA" : null,
      role_title: r.role_title,
      activity: r.activities?.split(/\r?\n/)[0] ?? null,
      project_code: r.internal_code,
      ir_code: r.ir_code,
      start_date: r.start_date,
      end_date: r.end_date,
      currency: r.currency,
      amount: r.amount,
      payment_terms: r.payment_terms,
      referent: r.requester_name,
      notes: `From contract request ${r.number}`,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (error || !created) fail(`/contract-requests/${id}`, error?.message ?? "Could not create the contract.");

  await supabase.from("contract_requests").update({ contract_id: created.id }).eq("id", id);
  revalidatePath(`/contract-requests/${id}`);
  redirect(`/contract-requests/${id}`);
}
