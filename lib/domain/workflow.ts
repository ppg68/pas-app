"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  effectiveProcCode,
  procConfigFor,
  paymentSigners,
  buildRequestCode,
  documentsComplete,
  type Role,
} from "@/lib/domain/procedures";

// redirect() throws internally — used here to bring a readable error message
// back to the originating page instead of letting the server action blow up
// with a raw Postgres exception.
function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function createRequest(formData: FormData) {
  const country = String(formData.get("country") || "").trim().toUpperCase();
  const projectCode = String(formData.get("project_code") || "").trim();
  const budgetLine = String(formData.get("budget_line") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const estimatedPrice = parseFloat(String(formData.get("estimated_price") || ""));
  const currency = String(formData.get("currency") || "EUR").trim() || "EUR";
  const derogation = formData.get("derogation") === "on";
  const derogationReason = String(formData.get("derogation_reason") || "").trim();
  const coordinationCost = formData.get("coordination_cost") === "on";
  const cupCode = String(formData.get("cup_code") || "").trim();
  const institutionalActivity = formData.get("institutional_activity") === "on";
  const occasionalCollaborator = formData.get("occasional_collaborator") === "on";

  if (
    !country ||
    !projectCode ||
    !budgetLine ||
    !description ||
    !Number.isFinite(estimatedPrice) ||
    estimatedPrice <= 0
  ) {
    fail("/requests/new", "Fill in all required fields with a valid amount.");
  }
  if (derogation && !derogationReason) {
    fail("/requests/new", "Derogation requires a reason.");
  }

  const procCode = effectiveProcCode(estimatedPrice, derogation);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) fail("/requests/new", "Session expired, please log in again.");

  const { data: myRoles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  if (!(myRoles ?? []).some((r) => r.role === "BH")) {
    fail("/requests/new", "Only someone with the Budget Holder role can create a request.");
  }

  let hqNumber = 0;
  let fieldProgressive = 0;

  if (country === "IT") {
    // rpc + insert in the same server action: the lock on hq_counter only lasts
    // as long as the next_hq_number() function, so it must be consumed right after.
    const { data, error } = await supabase.rpc("next_hq_number");
    if (error || data == null) {
      fail("/requests/new", error?.message ?? "Unable to generate the IR number.");
    }
    hqNumber = data;
  } else {
    const { count, error } = await supabase
      .from("requests")
      .select("id", { count: "exact", head: true })
      .eq("country", country)
      .eq("project_code", projectCode)
      .eq("proc_code", procCode);
    if (error) fail("/requests/new", error.message);
    fieldProgressive = (count ?? 0) + 1;
  }

  const code = buildRequestCode({
    country,
    procCode,
    description,
    projectCode,
    hqNumber,
    fieldProgressive,
  });

  const { data: inserted, error: insertError } = await supabase
    .from("requests")
    .insert({
      code,
      country,
      project_code: projectCode,
      budget_line: budgetLine,
      description,
      estimated_price: estimatedPrice,
      currency,
      proc_code: procCode,
      derogation,
      derogation_reason: derogation ? derogationReason : null,
      coordination_cost: coordinationCost,
      cup_code: cupCode || null,
      institutional_activity: institutionalActivity,
      occasional_collaborator: occasionalCollaborator,
      initiated_by: user.id,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    fail("/requests/new", insertError?.message ?? "Unable to create the request.");
  }

  await supabase.from("audit_log").insert({
    request_id: inserted.id,
    user_id: user.id,
    action: "request_created",
  });

  revalidatePath("/");
  redirect(`/requests/${inserted.id}`);
}

export async function signIrAuth(requestId: string, role: Role) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // "role holder signs" (RLS) rejects the insert if the user doesn't have `role`; the
  // enforce_segregation_of_duties trigger rejects it if they created the request
  // themselves. In both cases the error is ignored here: the UI only shows the "Sign"
  // button when neither case applies, so this shouldn't happen in normal use.
  const { error } = await supabase.from("signatures").insert({
    request_id: requestId,
    phase: "ir_auth",
    signer_role: role,
    signed_by: user.id,
    signed_at: new Date().toISOString(),
  });
  if (error) {
    revalidatePath(`/requests/${requestId}`);
    return;
  }

  await supabase.from("audit_log").insert({
    request_id: requestId,
    user_id: user.id,
    role,
    action: "ir_auth_signed",
  });

  const { data: req } = await supabase
    .from("requests")
    .select("proc_code, stage")
    .eq("id", requestId)
    .single();

  if (req && req.stage === "ir_auth") {
    const { data: sigs } = await supabase
      .from("signatures")
      .select("signer_role")
      .eq("request_id", requestId)
      .eq("phase", "ir_auth");

    const required = procConfigFor(req.proc_code).signers;
    const signedRoles = new Set((sigs ?? []).map((s) => s.signer_role));
    const allSigned = required.every((r) => signedRoles.has(r));

    if (allSigned) {
      const nextStage = procConfigFor(req.proc_code).minOffers === 0 ? "documents" : "offers";
      await supabase.from("requests").update({ stage: nextStage }).eq("id", requestId);
    }
  }

  revalidatePath(`/requests/${requestId}`);
}

export async function addOffer(requestId: string, formData: FormData) {
  const supplier = String(formData.get("supplier") || "").trim();
  const price = parseFloat(String(formData.get("price") || ""));
  if (!supplier || !Number.isFinite(price) || price <= 0) return;

  const supabase = await createClient();
  await supabase.from("offers").insert({ request_id: requestId, supplier, price });

  revalidatePath(`/requests/${requestId}`);
}

export async function closeOffers(requestId: string) {
  const supabase = await createClient();
  const { data: req } = await supabase
    .from("requests")
    .select("proc_code, stage")
    .eq("id", requestId)
    .single();
  if (!req || req.stage !== "offers") return;

  const { count } = await supabase
    .from("offers")
    .select("id", { count: "exact", head: true })
    .eq("request_id", requestId);

  if ((count ?? 0) < procConfigFor(req.proc_code).minOffers) return;

  await supabase.from("requests").update({ stage: "winner" }).eq("id", requestId);
  revalidatePath(`/requests/${requestId}`);
}

export async function selectWinner(requestId: string, formData: FormData) {
  const offerId = String(formData.get("offer_id") || "");
  const note = String(formData.get("note") || "").trim();
  if (!offerId) return;

  const supabase = await createClient();
  const { data: req } = await supabase
    .from("requests")
    .select("stage")
    .eq("id", requestId)
    .single();
  if (!req || req.stage !== "winner") return;

  await supabase
    .from("requests")
    .update({ winner_offer_id: offerId, winner_note: note || null, stage: "documents" })
    .eq("id", requestId);

  revalidatePath(`/requests/${requestId}`);
}

export async function toggleDoc(requestId: string, docKey: string, checked: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("request_documents").upsert({
    request_id: requestId,
    doc_key: docKey,
    checked,
    checked_by: user.id,
    checked_at: new Date().toISOString(),
  });

  revalidatePath(`/requests/${requestId}`);
}

export async function advanceToPayment(requestId: string, formData: FormData) {
  const folderPath = String(formData.get("folder_path") || "").trim();
  if (!folderPath) fail(`/requests/${requestId}`, "The folder path is required.");

  const supabase = await createClient();
  const { data: req } = await supabase
    .from("requests")
    .select("proc_code, stage")
    .eq("id", requestId)
    .single();
  if (!req || req.stage !== "documents") {
    fail(`/requests/${requestId}`, "The request is not in the documents stage.");
  }

  const { data: docs } = await supabase
    .from("request_documents")
    .select("doc_key, checked")
    .eq("request_id", requestId);

  const docsMap: Record<string, boolean> = {};
  (docs ?? []).forEach((d) => {
    docsMap[d.doc_key] = d.checked;
  });

  if (!documentsComplete(req.proc_code, docsMap, folderPath)) {
    fail(`/requests/${requestId}`, "Required documents or the folder path are missing.");
  }

  await supabase
    .from("requests")
    .update({ folder_path: folderPath, stage: "payment" })
    .eq("id", requestId);

  revalidatePath(`/requests/${requestId}`);
  redirect(`/requests/${requestId}`);
}

export async function signPayment(requestId: string, role: Role) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase.from("signatures").insert({
    request_id: requestId,
    phase: "payment",
    signer_role: role,
    signed_by: user.id,
    signed_at: new Date().toISOString(),
  });
  if (error) {
    revalidatePath(`/requests/${requestId}`);
    return;
  }

  await supabase.from("audit_log").insert({
    request_id: requestId,
    user_id: user.id,
    role,
    action: "payment_signed",
  });

  const { data: req } = await supabase
    .from("requests")
    .select("proc_code, coordination_cost, stage")
    .eq("id", requestId)
    .single();

  if (req && req.stage === "payment") {
    const { data: sigs } = await supabase
      .from("signatures")
      .select("signer_role")
      .eq("request_id", requestId)
      .eq("phase", "payment");

    const required = paymentSigners({
      procCode: req.proc_code,
      coordinationCost: req.coordination_cost,
    });
    const signedRoles = new Set((sigs ?? []).map((s) => s.signer_role));
    const allSigned = required.every((r) => signedRoles.has(r));

    if (allSigned) {
      await supabase.from("requests").update({ stage: "completed" }).eq("id", requestId);
    }
  }

  revalidatePath(`/requests/${requestId}`);
}
