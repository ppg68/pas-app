"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendEmail, escapeHtml } from "@/lib/notify";
import { MIN_EXPENSE_DATE, lineAmountEur, round2, type ExpenseSaveResult, type LineInput } from "@/lib/domain/expenses";

function fail(path: string, message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

class FormError extends Error {}
/** validation problem: returned to the form (nothing is lost on screen) instead of redirecting */
function bad(message: string): never {
  throw new FormError(message);
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

async function superiors(supabase: Supa) {
  const { data } = await supabase.rpc("expense_superiors");
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

function parseReport(f: FormData) {
  let raw: (LineInput & { line_id?: string })[] = [];
  try {
    raw = JSON.parse(str(f, "lines_json") || "[]");
  } catch {
    bad("The expense rows could not be read. Reload the page and try again.");
  }
  const kept = raw.filter((l) => SECTIONS.includes(l.section));
  const lineIds = kept.map((l) => (typeof l.line_id === "string" ? l.line_id : ""));
  const lines = kept
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

  if (lines.length === 0) bad("Add at least one expense row.");
  lines.forEach((l, i) => {
    const n = `Row ${i + 1}`;
    if (!l.line_date) bad(`${n}: enter the document date.`);
    if (l.line_date < MIN_EXPENSE_DATE) bad(`${n}: expenses dated before 1 January 2026 are no longer accepted.`);
    if (!l.budget_line) bad(`${n}: enter the budget line.`);
    if (l.section === "km") {
      if (!l.km || !l.fuel_price) bad(`${n}: enter the km and the ACI fuel cost per litre.`);
    } else {
      if (!l.amount_orig) bad(`${n}: enter the amount.`);
      if (l.currency !== "EUR" && !l.exchange_rate) bad(`${n}: enter the exchange rate for ${l.currency}.`);
    }
    if (!(l.amount_eur > 0)) bad(`${n}: the amount in euros is zero.`);
  });

  const report = {
    worker_name: str(f, "worker_name"),
    worker_id: opt(f, "worker_id"),
    subject: str(f, "subject"),
    donor_code: opt(f, "donor_code"),
    cup_code: opt(f, "cup_code"),
    internal_code: opt(f, "internal_code"),
    trip_id: opt(f, "trip_id"),
    car_model: opt(f, "car_model"),
    fuel: opt(f, "fuel"),
    notes: opt(f, "notes"),
    total_eur: round2(lines.reduce((s, l) => s + l.amount_eur, 0)),
  };
  if (!report.worker_name || !report.subject) bad("Enter the name of the worker and the object of the expenses.");
  if (!report.internal_code) bad("Enter the internal project code.");
  return { report, lines, lineIds };
}

/** The report is for another person only if the filer carries the flag; the name comes from the chosen profile. */
async function resolveWorker(supabase: Supa, userId: string, report: { worker_id: string | null; worker_name: string }) {
  if (!report.worker_id || report.worker_id === userId) {
    report.worker_id = null;
    return;
  }
  const { data: me } = await supabase.from("profiles").select("can_file_for_others").eq("id", userId).maybeSingle();
  if (!me?.can_file_for_others) bad("You are not allowed to file an expense report for another person.");
  const person = (await superiors(supabase)).find((h) => h.id === report.worker_id);
  if (!person) bad("The person chosen for this report was not found.");
  report.worker_name = person.full_name;
}

async function createImpl(formData: FormData): Promise<ExpenseSaveResult> {
  const back = "/expenses/new";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) bad("Session expired, please log in again.");

  const { report, lines } = parseReport(formData);
  await resolveWorker(supabase, user.id, report);

  // the superior is optional (any registered person); the RAC / CAR signature is always required
  const [people, racs] = await Promise.all([superiors(supabase), racOrCar(supabase)]);
  const pmId = str(formData, "approver_PM");
  const racId = str(formData, "approver_RAC");
  if (!racId) bad("Choose the RAC or CAR who will approve.");
  if (racId === user.id || pmId === user.id) bad("You cannot approve your own report.");
  if (report.worker_id && (racId === report.worker_id || pmId === report.worker_id)) bad("The person the report is for cannot approve it.");
  const pm = pmId ? people.find((h) => h.id === pmId) : null;
  const rac = racs.find((h) => h.id === racId);
  if ((pmId && !pm) || !rac) bad("The chosen approver is no longer available. Choose again.");

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
  if (error || !inserted) bad(error?.message ?? "Could not save the report.");

  const { data: insLines, error: lineErr } = await supabase
    .from("expense_lines")
    .insert(lines.map((l) => ({ ...l, report_id: inserted.id })))
    .select("id, seq");
  const approvalRows = [
    ...(pm ? [{ report_id: inserted.id, signer_role: "PM" as const, user_id: pm.id, user_name: pm.full_name }] : []),
    { report_id: inserted.id, signer_role: "RAC" as const, user_id: rac!.id, user_name: rac!.full_name },
  ];
  const { error: apErr } = lineErr ? { error: lineErr } : await supabase.from("expense_approvals").insert(approvalRows);
  if (apErr) {
    await supabase.from("expense_reports").delete().eq("id", inserted.id);
    bad(apErr.message);
  }

  // the approvers are told when the requester presses "Send to the approvers" on the report page
  revalidatePath("/expenses");
  const lineIds = (insLines ?? []).sort((x, y) => x.seq - y.seq).map((x) => x.id);
  return { id: inserted.id, lineIds };
}

export async function createExpenseReport(formData: FormData): Promise<ExpenseSaveResult> {
  try {
    return await createImpl(formData);
  } catch (e) {
    if (e instanceof FormError) return { error: e.message };
    throw e;
  }
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
  const [{ data: fl }, { data: ln }] = await Promise.all([
    supabase.from("expense_files").select("line_id").eq("report_id", id),
    supabase.from("expense_lines").select("id, section, seq").eq("report_id", id).order("seq"),
  ]);
  const legacy = (fl ?? []).some((f) => !f.line_id); // receipts attached by budget line (older reports)
  const withFile = new Set((fl ?? []).map((f) => f.line_id));
  const missing = (ln ?? []).filter((l) => l.section !== "km" && !withFile.has(l.id));
  if (missing.length > 0 && !legacy) {
    fail(`/expenses/${id}`, `Attach the receipt of every expense row (missing: row ${missing.map((m) => m.seq).join(", ")}). Mileage rows need none.`);
  }
  const { data: aps } = await supabase.from("expense_approvals").select("user_id, signer_role").eq("report_id", id);
  // the superior (if any) approves first; otherwise the RAC / CAR
  const first = (aps ?? []).find((a) => a.signer_role === "PM") ?? (aps ?? []).find((a) => a.signer_role === "RAC");
  const link = `${await baseUrl()}/expenses/${id}`;
  const people = await Promise.all([superiors(supabase), racOrCar(supabase)]);
  const list = people.flat().filter((h, i, a) => h.id === first?.user_id && a.findIndex((x) => x.id === h.id) === i);
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

async function updateImpl(id: string, formData: FormData): Promise<ExpenseSaveResult> {
  const supabase = await createClient();
  const { report, lines, lineIds } = parseReport(formData);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) bad("Session expired, please log in again.");
  await resolveWorker(supabase, user.id, report);
  if (report.worker_id) {
    const { data: aps } = await supabase.from("expense_approvals").select("user_id").eq("report_id", id);
    if ((aps ?? []).some((x) => x.user_id === report.worker_id)) bad("The person the report is for is one of the approvers: choose another approver or person.");
  }
  const { error } = await supabase.from("expense_reports").update(report).eq("id", id);
  if (error) bad(error.message);

  // rows that already exist keep their id (their receipt stays attached); the others are added; the missing ones are removed
  const { data: ex } = await supabase.from("expense_lines").select("id").eq("report_id", id);
  const existing = new Set((ex ?? []).map((x) => x.id));
  const keep = new Set(lineIds.filter((x) => x && existing.has(x)));
  const gone = [...existing].filter((x) => !keep.has(x));
  if (gone.length) {
    const { error: delErr } = await supabase.from("expense_lines").delete().in("id", gone);
    if (delErr) bad(delErr.message);
  }
  const ids: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const rid = lineIds[i];
    if (rid && keep.has(rid)) {
      const { error: uErr } = await supabase.from("expense_lines").update(lines[i]).eq("id", rid);
      if (uErr) bad(uErr.message);
      ids.push(rid);
    } else {
      const { data: ins, error: iErr } = await supabase
        .from("expense_lines")
        .insert({ ...lines[i], report_id: id })
        .select("id")
        .single();
      if (iErr || !ins) bad(iErr?.message ?? "Could not save the row.");
      ids.push(ins.id);
    }
  }
  revalidatePath(`/expenses/${id}`);
  return { id, lineIds: ids };
}

export async function updateExpenseReport(id: string, formData: FormData): Promise<ExpenseSaveResult> {
  try {
    return await updateImpl(id, formData);
  } catch (e) {
    if (e instanceof FormError) return { error: e.message };
    throw e;
  }
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
      .select("number, worker_name, worker_id, requester_name, requester_email, total_eur")
      .eq("id", id)
      .maybeSingle();
    const link = `${await baseUrl()}/expenses/${id}`;
    const label = role === "RAC" ? "RAC / CAR" : "superior";
    if (rep) {
      const allSigned = Boolean((data as { all_signed?: boolean } | null)?.all_signed);
      const amount = rep.total_eur.toLocaleString("it-IT", { minimumFractionDigits: 2 });
      if (allSigned) {
        // only the RAC / CAR chosen on this report (not every CAR / RAC): the one who just approved it
        const { data: chosen } = await supabase.from("expense_approvals").select("user_id").eq("report_id", id).eq("signer_role", "RAC").maybeSingle();
        const admin = (await racOrCar(supabase)).filter((h) => h.id === chosen?.user_id);
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
        // filed on behalf of somebody: the worker is told too
        if (rep.worker_id) {
          const { data: w } = await supabase.from("profiles").select("full_name, email").eq("id", rep.worker_id).maybeSingle();
          if (w?.email && w.email !== rep.requester_email) {
            mails.push({
              to: w.email,
              subject: `Expense report ${rep.number} approved`,
              html: `<p>Hello ${escapeHtml(w.full_name)},</p><p>The expense report <b>${escapeHtml(rep.number)}</b> that ${escapeHtml(rep.requester_name)} filed for you (€ ${amount}) is approved. The administration will record it for reimbursement.</p>${link ? `<p><a href="${link}">Open the report</a></p>` : ""}`,
            });
          }
        }
      } else if (role === "PM") {
        // the superior has approved: now the RAC / CAR must sign
        const { data: racRow } = await supabase.from("expense_approvals").select("user_id").eq("report_id", id).eq("signer_role", "RAC").maybeSingle();
        const rac = (await racOrCar(supabase)).find((h) => h.id === racRow?.user_id);
        if (rac?.email) {
          mails.push({
            to: rac.email,
            subject: `Expense report ${rep.number}: your approval is needed`,
            html: `<p>Hello ${escapeHtml(rac.full_name)},</p><p>The expense report <b>${escapeHtml(rep.number)}</b> of ${escapeHtml(rep.worker_name)} (€ ${amount}), submitted by ${escapeHtml(rep.requester_name)}, was approved by the superior. Your approval as RAC / CAR is needed.</p>${link ? `<p><a href="${link}">Open the report in PAS</a></p>` : ""}`,
          });
        }
        if (rep.requester_email) {
          mails.push({
            to: rep.requester_email,
            subject: `Expense report ${rep.number}: superior approved`,
            html: `<p>Hello ${escapeHtml(rep.requester_name)},</p><p>The superior approved your expense report <b>${escapeHtml(rep.number)}</b>. The RAC / CAR approval is still needed.</p>${link ? `<p><a href="${link}">Open the report</a></p>` : ""}`,
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

/** Flag users (Logistics / Contracts) and ADMIN: flags the report as paid, or removes the flag. */
export async function setExpensePaid(id: string, paid: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_expense_paid", { rid: id, paid });
  if (error) fail(`/expenses/${id}`, error.message);

  if (paid) {
    try {
      const { data: rep } = await supabase
        .from("expense_reports")
        .select("number, requester_name, requester_email, worker_id, worker_name, total_eur")
        .eq("id", id)
        .maybeSingle();
      const link = `${await baseUrl()}/expenses/${id}`;
      if (rep) {
        // only the people involved: whoever filed it and the worker, when different
        const to: { name: string; email: string }[] = [];
        if (rep.requester_email) to.push({ name: rep.requester_name, email: rep.requester_email });
        if (rep.worker_id) {
          const { data: w } = await supabase.from("profiles").select("full_name, email").eq("id", rep.worker_id).maybeSingle();
          if (w?.email && !to.some((x) => x.email === w.email)) to.push({ name: w.full_name, email: w.email });
        }
        after(async () => {
          for (const x of to) {
            try {
              await sendEmail({
                to: x.email,
                subject: `Expense report ${rep.number}: paid`,
                html: `<p>Hello ${escapeHtml(x.name)},</p><p>The expense report <b>${escapeHtml(rep.number)}</b> of ${escapeHtml(rep.worker_name)} (€ ${rep.total_eur.toLocaleString("it-IT", { minimumFractionDigits: 2 })}) has been paid.</p>${link ? `<p><a href="${link}">Open the report</a></p>` : ""}`,
              });
            } catch (e) {
              console.error("[expenses] paid email failed", e);
            }
          }
        });
      }
    } catch {
      // best effort
    }
  }
  revalidatePath(`/expenses/${id}`);
  revalidatePath("/expenses");
  redirect(`/expenses/${id}`);
}

/** Administration: records the report in Callisto (protocol) and closes it. */
export async function registerExpenseReport(id: string, formData: FormData) {
  const supabase = await createClient();
  const protocol = str(formData, "callisto_protocol"); // optional
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
            html: `<p>Hello ${escapeHtml(rep.requester_name)},</p><p>Your expense report <b>${escapeHtml(rep.number)}</b> (€ ${rep.total_eur.toLocaleString("it-IT", { minimumFractionDigits: 2 })}) has been recorded in Callisto${protocol ? `, protocol ${escapeHtml(protocol)}` : ""}. The sheet is closed.</p>${link ? `<p><a href="${link}">Open the report</a></p>` : ""}`,
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

/** ADMIN: deletes the ticked expense reports with their receipts (list page). */
export async function bulkDeleteExpenses(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user?.id ?? "");
  if (!(roles ?? []).some((r) => r.role === "ADMIN")) fail("/expenses", "Only an ADMIN can delete expense reports.");
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  if (ids.length === 0) fail("/expenses", "Tick the expense reports you want to delete.");
  const { data: files } = await supabase.from("expense_files").select("storage_path").in("report_id", ids);
  const { data, error } = await supabase.from("expense_reports").delete().in("id", ids).select("id");
  if (error) fail("/expenses", error.message);
  if (files?.length) await supabase.storage.from("pas-request-files").remove(files.map((f) => f.storage_path));
  revalidatePath("/expenses");
  redirect(`/expenses?deleted=${(data ?? []).length}`);
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
