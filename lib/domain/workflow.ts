"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fetchProjectCups, cupForProject } from "@/lib/domain/projectCups";
import { sendEmail, escapeHtml } from "@/lib/notify";
import {
  effectiveProcCode,
  procConfigFor,
  paymentSigners,
  irSigners,
  buildRequestCode,
  documentsComplete,
  ROLE_LABEL,
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

  // Every signer required by the procedure must be designated before the request is created
  // (checked before the IR number is drawn, so a refused request does not burn a number).
  const required = irSigners({ procCode, coordinationCost, derogation });
  const picked = required.map((role) => ({
    role,
    userId: String(formData.get(`approver_${role}`) || "").trim(),
  }));
  const missing = picked.filter((p) => !p.userId).map((p) => ROLE_LABEL[p.role]);
  if (missing.length > 0) {
    fail("/requests/new", `Choose the approver for: ${missing.join(", ")}. The request cannot be created without them.`);
  }
  const selfPicked = picked.filter((p) => p.userId === user.id).map((p) => ROLE_LABEL[p.role]);
  if (selfPicked.length > 0) {
    fail("/requests/new", `You cannot be your own approver (${selfPicked.join(", ")}): pick another person.`);
  }
  const { data: holders } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .in("user_id", picked.map((p) => p.userId));
  const notHolding = picked
    .filter((p) => !(holders ?? []).some((h) => h.user_id === p.userId && h.role === p.role))
    .map((p) => ROLE_LABEL[p.role]);
  if (notHolding.length > 0) {
    fail("/requests/new", `The person chosen does not hold the required role: ${notHolding.join(", ")}.`);
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
      cup_code: cupForProject(await fetchProjectCups(supabase), projectCode) ?? (cupCode || null),
      institutional_activity: institutionalActivity,
      occasional_collaborator: occasionalCollaborator,
      initiated_by: user.id,
      // DIR needs no approval: the request goes straight to the documents stage.
      stage: required.length === 0 ? "documents" : "ir_auth",
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

  await designateAndNotifyApprovers({
    supabase,
    requestId: inserted.id,
    creatorId: user.id,
    signers: required,
    formData,
    code,
    description,
    estimatedPrice,
    currency,
  });

  revalidatePath("/");
  redirect(`/requests/${inserted.id}`);
}

/**
 * Approvers picked on the form (fields "approver_<ROLE>", required and validated in
 * createRequest): stored on the request and emailed a link. Never blocks request creation — email problems are
 * swallowed (the request page shows who was designated and whether they were notified).
 */
async function designateAndNotifyApprovers(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  requestId: string;
  creatorId: string;
  signers: Role[];
  formData: FormData;
  code: string;
  description: string;
  estimatedPrice: number;
  currency: string;
}) {
  const { supabase, requestId, creatorId, signers, formData } = params;

  const picks: { role: Role; userId: string }[] = [];
  for (const role of signers) {
    const userId = String(formData.get(`approver_${role}`) || "").trim();
    if (userId && userId !== creatorId) picks.push({ role, userId });
  }
  if (picks.length === 0) return;

  const ids = Array.from(new Set(picks.map((p) => p.userId)));
  const [{ data: holders }, { data: profiles }] = await Promise.all([
    supabase.from("user_roles").select("user_id, role").in("user_id", ids),
    supabase.from("profiles").select("id, full_name, email").in("id", ids),
  ]);
  // Only people who really hold the role can be designated for it.
  const valid = picks.filter((p) =>
    (holders ?? []).some((h) => h.user_id === p.userId && h.role === p.role)
  );
  if (valid.length === 0) return;

  const { error } = await supabase.from("request_approvers").insert(
    valid.map((p) => ({ request_id: requestId, signer_role: p.role, user_id: p.userId }))
  );
  if (error) return;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const link = host ? `${proto}://${host}/requests/${requestId}` : "";

  for (const userId of ids) {
    const profile = (profiles ?? []).find((p) => p.id === userId);
    if (!profile?.email) continue;
    const roles = valid.filter((v) => v.userId === userId).map((v) => ROLE_LABEL[v.role]);
    const result = await sendEmail({
      to: profile.email,
      subject: `IR ${params.code} is ready for your approval`,
      html: `<p>Hello ${escapeHtml(profile.full_name)},</p>
<p>A new internal request is waiting for your approval as <b>${escapeHtml(roles.join(", "))}</b>:</p>
<p><b>${escapeHtml(params.code)}</b><br>${escapeHtml(params.description)}<br>${params.estimatedPrice} ${escapeHtml(params.currency)}</p>
${link ? `<p><a href="${link}">Open the request in PAS</a></p>` : ""}`,
    });
    if (result.ok) {
      await supabase
        .from("request_approvers")
        .update({ notified_at: new Date().toISOString() })
        .eq("request_id", requestId)
        .eq("user_id", userId);
    }
  }
}

/**
 * Tells whoever compiled the request that a signature has been given (IR approval or payment):
 * once all required signatures are in, that they can proceed / that the payment is authorized.
 * Best effort — an email problem never blocks the signature.
 */
async function notifyInitiatorOfSignature(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  requestId: string;
  signerId: string;
  role: Role;
  phase: "ir_auth" | "payment";
  authorized: boolean;
  pending: Role[];
  req: {
    initiated_by: string | null;
    code: string;
    description: string;
    estimated_price: number;
    currency: string;
  };
}) {
  const { supabase, requestId, signerId, role, phase, authorized, pending, req } = params;
  if (!req.initiated_by || req.initiated_by === signerId) return;
  try {
    const [{ data: initiator }, { data: signer }] = await Promise.all([
      supabase.from("profiles").select("full_name, email").eq("id", req.initiated_by).maybeSingle(),
      supabase.from("profiles").select("full_name").eq("id", signerId).maybeSingle(),
    ]);
    if (!initiator?.email) return;

    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    const link = host ? `${proto}://${host}/requests/${requestId}` : "";

    const who = `${escapeHtml(signer?.full_name ?? "An approver")} (${escapeHtml(ROLE_LABEL[role])})`;
    const isPayment = phase === "payment";
    const outcome = authorized
      ? isPayment
        ? "<p>All required signatures are in: the <b>payment is authorized</b> and the request is closed.</p>"
        : "<p>All required signatures are in: the request is <b>authorized</b> and you can proceed with entering the data.</p>"
      : `<p>Still waiting for: <b>${escapeHtml(pending.map((r) => ROLE_LABEL[r]).join(", "))}</b>.</p>`;
    const subject = isPayment
      ? authorized
        ? `IR ${req.code}: payment authorized`
        : `IR ${req.code}: payment signed by ${signer?.full_name ?? "an approver"}`
      : authorized
        ? `IR ${req.code} authorized: you can proceed`
        : `IR ${req.code} signed by ${signer?.full_name ?? "an approver"}`;

    await sendEmail({
      to: initiator.email,
      subject,
      html: `<p>Hello ${escapeHtml(initiator.full_name)},</p>
<p>${who} has signed the ${isPayment ? "payment authorization of your" : ""} internal request:</p>
<p><b>${escapeHtml(req.code)}</b><br>${escapeHtml(req.description)}<br>${req.estimated_price} ${escapeHtml(req.currency)}</p>
${outcome}
${link ? `<p><a href="${link}">Open the request in PAS</a></p>` : ""}`,
    });
  } catch {
    // notification is best effort
  }
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
    .select("proc_code, stage, derogation, coordination_cost, code, description, estimated_price, currency, initiated_by")
    .eq("id", requestId)
    .single();

  if (req && req.stage === "ir_auth") {
    const { data: sigs } = await supabase
      .from("signatures")
      .select("signer_role")
      .eq("request_id", requestId)
      .eq("phase", "ir_auth");

    const required = irSigners({
      procCode: req.proc_code,
      coordinationCost: req.coordination_cost,
      derogation: req.derogation,
    });
    const signedRoles = new Set((sigs ?? []).map((s) => s.signer_role));
    const allSigned = required.every((r) => signedRoles.has(r));

    if (allSigned) {
      const nextStage = procConfigFor(req.proc_code).minOffers === 0 ? "documents" : "offers";
      await supabase.from("requests").update({ stage: nextStage }).eq("id", requestId);
    }

    await notifyInitiatorOfSignature({
      supabase,
      requestId,
      signerId: user.id,
      role,
      phase: "ir_auth",
      authorized: allSigned,
      pending: required.filter((r) => !signedRoles.has(r)),
      req,
    });
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

export async function advanceToPayment(requestId: string) {
  const supabase = await createClient();
  const { data: req } = await supabase
    .from("requests")
    .select("proc_code, stage, coordination_cost")
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

  if (!documentsComplete(req.proc_code, docsMap)) {
    fail(`/requests/${requestId}`, "Required documents are missing.");
  }

  await supabase
    .from("requests")
    .update({
      // no payment authorization required (DIR): the request closes once its documents are complete
      stage:
        paymentSigners({ procCode: req.proc_code, coordinationCost: req.coordination_cost }).length === 0
          ? "completed"
          : "payment",
    })
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
    .select("proc_code, coordination_cost, stage, code, description, estimated_price, currency, initiated_by")
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

    await notifyInitiatorOfSignature({
      supabase,
      requestId,
      signerId: user.id,
      role,
      phase: "payment",
      authorized: allSigned,
      pending: required.filter((r) => !signedRoles.has(r)),
      req,
    });
  }

  revalidatePath(`/requests/${requestId}`);
}

/** ADMIN-only hard delete (RLS "ADMIN deletes requests" enforces it too). */
export async function deleteRequest(requestId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expired, please log in again." };

  const { data, error } = await supabase.from("requests").delete().eq("id", requestId).select("id");
  if (error) return { ok: false, error: error.message };
  // RLS filters rows silently: zero deleted rows means the caller isn't allowed.
  if (!data || data.length === 0) return { ok: false, error: "You are not allowed to delete this request." };

  revalidatePath("/");
  return { ok: true };
}
