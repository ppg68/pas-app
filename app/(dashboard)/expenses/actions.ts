"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendEmail, escapeHtml } from "@/lib/notify";
import { lineAmountEur, round2, type LineInput } from "@/lib/domain/expenses";

function fail(path: string, message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

const str = (f: FormData, k: string) => String(f.get(k) || "").trim();
const opt = (f: FormData, k: string) => str(f, k) || null;
const numOrNull = (s: string) => {
  const v = parseFloat(String(s ?? "").replace(",", "."));
  return Number.isFinite(v) ? v : null;
};

type Holder = { id: string; full_name: string; email: string | null };
type Role = "PM" | "RAC" | "CAR";
type Supa = Awaited<ReturnType<typeof createClient>>;

async function holders(supabase: Supa, role: Role) {
  const { data } = await supabase.rpc("contract_role_holders", { r: role });
  return (data ?? []) as Holder[];
}

async function racOrCar(supabase: Supa) {
  const [racs, cars] = await Promise.all([holders(supabase, "RAC"), holders(supabase, "CAR")]);
  const seen = new Set<string>();
  return [...racs, ...cars].filter((h) => !seen.has(h.id) && seen.add(h.id)).sort((a, b) => a.full_name.localeCompare(b.full_name));
}

async function baseUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "";
}

const SECTIONS = ["km", "transport", "meals", "equipment", "invoices"];

function parseReport(f: FormData, path: string) {
  let raw: LineInput[] = [];
  try {
    raw = JSON.parse(str(f, "lines_json") || "[]");
  } catch {
    fail(path, "The expense rows could not be read. Reload the page and try again.");
  }
  const lines = raw
    .filter((l) => SECTIONS.includes(l.section))
    .map((l, i) => {
      const amount_eur = lineAmountEur(l);
      const isKm = l.section === "km";
      return {
        section: l.section,
        seq: i + 1,
        line_date: l.line_date || null,
        budget_line: (l.budget_line || "").trim() || null,
        location: (l.location || "").trim() || null,
        motive: (l.motive || "").trim() || null,
        km: isKm ? numOrNull(l.km) : null,
        fuel_price: isKm ? numOrNull(l.fuel_price) : null,
        currency: isKm ? "EUR" : (l.currency || "EUR").trim().toUpperCase(),
        amount_orig: isKm ? null : numOrNull(l.amount_orig),
        exchange_rate: !isKm && (l.currency || "EUR").trim().toUpperCase() !== "EUR" ? numOrNull(l.exchange_rate) : null,
        amount_eur,
      };
    });

  if (lines.length === 0) fail(path, "Add at least one expense row.");
  lines.forEach((l, i) => {
    const n = `Row ${i + 1}`;
    if (!l.line_date) fail(path, `${n}: enter the document date.`);
    if (!l.budget_line) fail(path, `${n}: enter the budget line.`);
    if (l.section === "km") {
      if (!l.km || !l.fuel_price) fail(path, `${n}: enter the km and the ACI fuel cost per litre.`);
    } else {
      if (!l.amount_orig) fail(path, `${n}: enter the amount.`);
      if (l.currency !== "EUR" && !l.exchange_rate) fail(path, `${n}: enter the exchange rate for ${l.currency}.`);
    }
    if (!(l.amount_eur > 0)) fail(path, `${n}: the amount in euros is zero.`);
  });

  const report = {
    worker_name: str(f, "worker_name"),
    subject: str(f, "subject"),
    donor_code: opt(f, "donor_code"),
    internal_code: opt(f, "internal_code"),
    trip_id: opt(f, "trip_id"),
    car_model: opt(f, "car_model"),
    fuel: opt(f, "fuel"),
    notes: opt(f, "notes"),
    total_eur: round2(lines.reduce((s, l) => s + l.amount_eur, 0)),
  };
  if (!report.worker_name || !report.subject) fail(path, "Enter the name of the worker and the object of the expenses.");
  if (!report.internal_code) fail(path, "Enter the internal project code.");
  return { report, lines };
}

export async function createExpenseReport(formData: FormData) {
  const back = "/expenses/new";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) fail(back, "Session expired, please log in again.");

  const { report, lines } = parseReport(formData, back);

  const [pms, racs] = await Promise.all([holders(supabase, "PM"), racOrCar(supabase)]);
  const requesterIsPm = pms.some((h) => h.id === user.id);
  const pmId = str(formData, "approver_PM");
  const racId = str(formData, "approver_RAC");
  if (!racId || (!requesterIsPm && !pmId)) {
    fail(back, requesterIsPm ? "Choose the RAC or CAR who will approve." : "Choose the PM / Programme Manager and the RAC or CAR who will approve.");
  }
  if (racId === user.id || (pmId === user.id && !requesterIsPm)) fail(back, "You cannot approve your own report.");
  const pm = requesterIsPm ? null : pms.find((h) => h.id === pmId);
  const rac = racs.find((h) => h.id === racId);
  if ((!requesterIsPm && !pm) || !rac) fail(back, "The chosen approver no longer holds the role. Choose again.");

  const { data: profile } = await supabase.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle();

  const { data: inserted, error } = await supabase
    .from("expense_reports")
    .insert({
      ...report,
      requested_by: user.id,
      requester_name: profile?.full_name ?? user.email ?? "",
      requester_email: profile?.email ?? user.email ?? null,
    })
    .select("id, number")
    .single();
  if (error || !inserted) fail(back, error?.message ?? "Could not save the report.");

  const { error: lineErr } = await supabase.from("expense_lines").insert(lines.map((l) => ({ ...l, report_id: inserted.id })));
  const approvalRows = [
    ...(pm ? [{ report_id: inserted.id, signer_role: "PM" as const, user_id: pm.id, user_name: pm.full_name }] : []),
    { report_id: inserted.id, signer_role: "RAC" as const, user_id: rac!.id, user_name: rac!.full_name },
  ];
  const { error: apErr } = lineErr ? { error: lineErr } : await supabase.from("expense_approvals").insert(approvalRows);
  if (apErr) {
    await supabase.from("expense_reports").delete().eq("id", inserted.id);
    fail(back, apErr.message);
  }

  // the approvers are told once the receipts are attached: the requester continues on the report page
  revalidatePath("/expenses");
  redirect(`/expenses/${inserted.id}?new=1`);
}

/** The approvers are emailed when the requester confirms the receipts are attached. */
export async function sendExpenseReport(id: string) {
  const supabase = await createClient();
  const { data: rep } = await supabase
    .from("expense_reports")
    .select("number, worker_name, requester_name, total_eur, status")
    .eq("id", id)
    .maybeSingle();
  if (!rep) fail("/expenses", "Report not found.");
  const { count } = await supabase.from("expense_files").select("id", { count: "exact", head: true }).eq("report_id", id);
  if (!count) fail(`/expenses/${id}`, "Attach at least one receipt first.");
  const { data: aps } = await supabase.from("expense_approvals").select("user_id, user_name").eq("report_id", id);
  const ids = (aps ?? []).map((a) => a.user_id);
  const link = `${await baseUrl()}/expenses/${id}`;
  const people = await Promise.all([holders(supabase, "PM"), racOrCar(supabase)]);
  const list = people.flat().filter((h, i, a) => ids.includes(h.id) && a.findIndex((x) => x.id === h.id) === i);
  after(async () => {
    for (const h of list) {
      if (!h.email) continue;
      try {
        await sendEmail({
          to: h.email,
          subject: `Expense report ${rep.number}: your approval is needed`,
          html: `<p>Hello ${escapeHtml(h.full_name)},</p>
<p><b>${escapeHtml(rep.requester_name)}</b> submitted the expense report <b>${escapeHtml(rep.number)}</b> of ${escapeHtml(rep.worker_name)} (€ ${rep.total_eur.toLocaleString("it-IT", { minimumFractionDigits: 2 })}). Your approval is needed.</p>
${link ? `<p><a href="${link}">Open the report in PAS</a></p>` : ""}`,
        });
      } catch (e) {
        console.error("[expenses] approval email failed", e);
      }
    }
  });
  redirect(`/expenses?created=${encodeURIComponent(rep.number)}`);
}

export async function updateExpenseReport(id: string, formData: FormData) {
  const path = `/expenses/${id}/edit`;
  const supabase = await createClient();
  const { report, lines } = parseReport(formData, path);
  const { error } = await supabase.from("expense_reports").update(report).eq("id", id);
  if (error) fail(path, error.message);
  const { error: delErr } = await supabase.from("expense_lines").delete().eq("report_id", id);
  if (delErr) fail(path, delErr.message);
  const { error: insErr } = await supabase.from("expense_lines").insert(lines.map((l) => ({ ...l, report_id: id })));
  if (insErr) fail(path, insErr.message);
  revalidatePath(`/expenses/${id}`);
  redirect(`/expenses/${id}`);
}

export async function signExpenseReport(id: string, role: "PM" | "RAC") {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sign_expense_report", { rid: id, as_role: role });
  if (error) fail(`/expenses/${id}`, error.message);

  type Mail = { to: string; subject: string; html: string };
  const mails: Mail[] = [];
  try {
    const { data: rep } = await supabase
      .from("expense_reports")
      .select("number, worker_name, requester_name, requester_email, total_eur")
      .eq("id", id)
      .maybeSingle();
    const link = `${await baseUrl()}/expenses/${id}`;
    const label = role === "RAC" ? "RAC / CAR" : role;
    if (rep) {
      const allSigned = Boolean((data as { all_signed?: boolean } | null)?.all_signed);
      const amount = rep.total_eur.toLocaleString("it-IT", { minimumFractionDigits: 2 });
      if (allSigned) {
        const admin = await racOrCar(supabase);
        for (const h of admin) {
          if (!h.email || h.email === rep.requester_email) continue;
          mails.push({
            to: h.email,
            subject: `Expense report ${rep.number} approved: to record in Callisto`,
            html: `<p>Hello ${escapeHtml(h.full_name)},</p><p>The expense report <b>${escapeHtml(rep.number)}</b> of ${escapeHtml(rep.worker_name)} (€ ${amount}) is fully approved. It can be recorded in Callisto.</p>${link ? `<p><a href="${link}">Open the report in PAS</a></p>` : ""}`,
          });
        }
        if (rep.requester_email) {
          mails.push({
            to: rep.requester_email,
            subject: `Expense report ${rep.number} approved`,
            html: `<p>Hello ${escapeHtml(rep.requester_name)},</p><p>Your expense report <b>${escapeHtml(rep.number)}</b> (€ ${amount}) is approved. The administration will record it for reimbursement.</p>${link ? `<p><a href="${link}">Open the report</a></p>` : ""}`,
          });
        }
      } else if (rep.requester_email) {
        mails.push({
          to: rep.requester_email,
          subject: `Expense report ${rep.number}: ${label} approved`,
          html: `<p>Hello ${escapeHtml(rep.requester_name)},</p><p>The ${label} approved your expense report <b>${escapeHtml(rep.number)}</b>. The other approval is still needed.</p>${link ? `<p><a href="${link}">Open the report</a></p>` : ""}`,
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
      } catch (e) {
        console.error("[expenses] email failed", e);
      }
    }
  });
  revalidatePath(`/expenses/${id}`);
  redirect(`/expenses/${id}`);
}

/** Administration: records the report in Callisto (protocol) and closes it. */
export async function registerExpenseReport(id: string, formData: FormData) {
  const supabase = await createClient();
  const protocol = str(formData, "callisto_protocol");
  if (!protocol) fail(`/expenses/${id}`, "Enter the accounting protocol.");
  const { error } = await supabase.rpc("register_expense_report", { rid: id, protocol, note: str(formData, "registration_note") });
  if (error) fail(`/expenses/${id}`, error.message);

  try {
    const { data: rep } = await supabase
      .from("expense_reports")
      .select("number, requester_name, requester_email, total_eur")
      .eq("id", id)
      .maybeSingle();
    const link = `${await baseUrl()}/expenses/${id}`;
    if (rep?.requester_email) {
      after(async () => {
        try {
          await sendEmail({
            to: rep.requester_email!,
            subject: `Expense report ${rep.number}: recorded`,
            html: `<p>Hello ${escapeHtml(rep.requester_name)},</p><p>Your expense report <b>${escapeHtml(rep.number)}</b> (€ ${rep.total_eur.toLocaleString("it-IT", { minimumFractionDigits: 2 })}) has been recorded in Callisto, protocol ${escapeHtml(protocol)}. The sheet is closed.</p>${link ? `<p><a href="${link}">Open the report</a></p>` : ""}`,
          });
        } catch (e) {
          console.error("[expenses] registration email failed", e);
        }
      });
    }
  } catch {
    // best effort
  }
  revalidatePath(`/expenses/${id}`);
  redirect(`/expenses/${id}`);
}

export async function cancelExpenseReport(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("expense_reports").update({ status: "cancelled" }).eq("id", id);
  if (error) fail(`/expenses/${id}`, error.message);
  revalidatePath("/expenses");
  redirect(`/expenses/${id}`);
}

export async function deleteExpenseReport(id: string) {
  const supabase = await createClient();
  const { data: files } = await supabase.from("expense_files").select("storage_path").eq("report_id", id);
  const { error } = await supabase.from("expense_reports").delete().eq("id", id);
  if (error) fail(`/expenses/${id}`, error.message);
  if (files?.length) await supabase.storage.from("pas-request-files").remove(files.map((f) => f.storage_path));
  revalidatePath("/expenses");
  redirect("/expenses");
}
