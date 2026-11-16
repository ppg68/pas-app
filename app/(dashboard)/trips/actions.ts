"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendEmail, escapeHtml } from "@/lib/notify";
import { COST_LABEL, COST_TYPES, type Allocation, type CostType, type InsuranceMode, type LodgingMode, type TravelerType, type TripApproval, type TripRow, type TripScope } from "@/lib/domain/trips";
import { tripSections, tripSectionsHtml } from "@/lib/domain/tripSections";

// redirect() throws internally: used to bring a readable message back to the page.
function fail(path: string, message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

export type TripSaveResult = { error?: string; field?: string; redirectTo?: string };

class FormError extends Error {
  field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.field = field;
  }
}
/** validation problem: returned to the form (nothing is lost on screen, the field is highlighted) */
function bad(message: string, field?: string): never {
  throw new FormError(message, field);
}

const str = (f: FormData, k: string) => String(f.get(k) || "").trim();
const opt = (f: FormData, k: string) => str(f, k) || null;
const num = (f: FormData, k: string) => {
  const v = parseFloat(str(f, k).replace(",", "."));
  return Number.isFinite(v) ? v : null;
};

type Holder = { id: string; full_name: string; email: string | null };
type Role = "PM" | "RAC" | "CAR" | "LOG";
type Supa = Awaited<ReturnType<typeof createClient>>;

async function holders(supabase: Supa, role: Role) {
  const { data } = await supabase.rpc("contract_role_holders", { r: role });
  return (data ?? []) as Holder[];
}

/** Second approver: anyone holding the RAC or the CAR role. */
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

function parseTrip(f: FormData) {
  const flights = f.get("flights_needed") === "on";
  const visa = f.get("visa_needed") === "on";
  const insurance = (str(f, "insurance") || "none") as InsuranceMode;
  const hotel = f.get("hotel_needed") === "on";
  const lodging = (str(f, "lodging_mode") || "none") as LodgingMode;
  const compensation = f.get("compensation_charged") === "on";
  return {
    traveler_name: str(f, "traveler_name"),
    traveler_email: opt(f, "traveler_email"),
    traveler_type: (str(f, "traveler_type") || "employee") as TravelerType,
    public_employee: f.get("public_employee") === "on",
    role_title: opt(f, "role_title"),
    reference_person: opt(f, "reference_person"),
    scope: (str(f, "scope") || "eu") as TripScope,
    destination: str(f, "destination"),
    work_place: opt(f, "work_place"),
    start_date: str(f, "start_date"),
    end_date: str(f, "end_date"),
    transport: f.getAll("transport").map(String),
    project_title: opt(f, "project_title"),
    internal_code: opt(f, "internal_code"),
    donor_code: opt(f, "donor_code"),
    budget_line: null,
    activities: null,
    objective: null,
    tdr: opt(f, "tdr"),
    minors: f.get("minors") === "on",
    advance_amount: num(f, "advance_amount"),
    compensation_charged: compensation,
    compensation_bl: null,
    lodging_mode: lodging,
    per_diem_rate: null,
    per_diem_days: null,
    per_diem_bl: null,
    expenses_bl: null,
    flights_needed: flights,
    flights_route: flights ? opt(f, "flights_route") : null,
    flights_bl: null,
    visa_needed: visa,
    visa_bl: null,
    insurance,
    insurance_bl: null,
    hotel_needed: hotel,
    tickets_note: opt(f, "tickets_note"),
    notes: opt(f, "notes"),
    needs_logistics: flights || visa || insurance === "oikos" || hotel,
    allocations: [] as Allocation[],
  };
}

function validate(t: ReturnType<typeof parseTrip>) {
  if (!t.traveler_name) bad("Enter the name of the traveler.", "traveler_name");
  if (!t.destination) bad("Enter the destination.", "destination");
  if (!t.start_date) bad("Enter the start date.", "start_date");
  if (!t.end_date) bad("Enter the end date.", "end_date");
  if (t.end_date < t.start_date) bad("The end date is before the start date.", "end_date");
  if (!t.project_title) bad("Enter the project title.", "project_title");
  if (!t.internal_code) bad("Enter the internal project code.", "internal_code");
  if (!t.tdr) bad("Enter the Termini di Riferimento of the mission.", "tdr");
}

/** The costs that exist for the trip: each needs at least one (project code, budget line, share) row. */
function applicableCosts(t: ReturnType<typeof parseTrip>): CostType[] {
  const list: CostType[] = [];
  if (t.compensation_charged) list.push("compensation");
  if (t.lodging_mode === "per_diem") list.push("per_diem");
  if (t.lodging_mode === "receipts" || t.lodging_mode === "free_lodging") list.push("expenses");
  if (t.flights_needed) list.push("flight");
  if (t.visa_needed) list.push("visa");
  if (t.insurance === "oikos") list.push("insurance");
  if (t.hotel_needed) list.push("bookings");
  return list;
}

/** Reads and checks the allocation rows. Row i of the form is named alloc_<i>_code / _bl / _share. */
function parseAllocations(f: FormData, t: ReturnType<typeof parseTrip>): Allocation[] {
  let raw: { cost_type?: string; project_code?: string; budget_line?: string; share?: string | number }[] = [];
  try {
    raw = JSON.parse(str(f, "allocations_json") || "[]");
  } catch {
    bad("The cost rows could not be read. Reload the page and try again.");
  }
  const costs = applicableCosts(t);
  const out: Allocation[] = [];
  raw.forEach((r, i) => {
    const type = r.cost_type as CostType;
    if (!costs.includes(type)) return;
    const label = COST_LABEL[type];
    const code = String(r.project_code ?? "").trim();
    const bl = String(r.budget_line ?? "").trim();
    const share = parseFloat(String(r.share ?? "").replace(",", "."));
    if (!code) bad(`${label}: enter the project code.`, `alloc_${i}_code`);
    if (!bl) bad(`${label}: enter the budget line.`, `alloc_${i}_bl`);
    if (!Number.isFinite(share) || share <= 0 || share > 100) bad(`${label}: enter the share (between 0 and 100%).`, `alloc_${i}_share`);
    out.push({ cost_type: type, project_code: code, budget_line: bl, share: Math.round(share * 100) / 100 });
  });
  for (const c of COST_TYPES) {
    if (!costs.includes(c.key)) continue;
    const rows = out.filter((a) => a.cost_type === c.key);
    if (rows.length === 0) bad(`${c.label}: add the project code and the budget line.`, `alloc_add_${c.key}`);
    const total = rows.reduce((s, a) => s + a.share, 0);
    if (Math.abs(total - 100) > 0.01) {
      const firstIdx = raw.findIndex((r) => r.cost_type === c.key);
      bad(`${c.label}: the shares add up to ${Math.round(total * 100) / 100}%, they must add up to 100%.`, `alloc_${firstIdx}_share`);
    }
  }
  return out;
}

async function createImpl(formData: FormData) {
  const back = "/trips/new";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) fail(back, "Session expired, please log in again.");

  const trip = parseTrip(formData);
  validate(trip);
  trip.allocations = parseAllocations(formData, trip);

  const [pms, racs] = await Promise.all([holders(supabase, "PM"), racOrCar(supabase)]);
  // A PM filing the request: the filing is already the PM's sign-off, only RAC / CAR is asked.
  const requesterIsPm = pms.some((h) => h.id === user.id);
  const pmId = str(formData, "approver_PM");
  const racId = str(formData, "approver_RAC");
  if (!racId || (!requesterIsPm && !pmId)) {
    if (!requesterIsPm && !pmId) bad("Choose the PM / Programme Manager who will approve.", "approver_PM");
    bad("Choose the RAC or CAR who will approve.", "approver_RAC");
  }
  if (racId === user.id || (pmId === user.id && !requesterIsPm)) bad("You cannot approve your own request.", racId === user.id ? "approver_RAC" : "approver_PM");
  const pm = requesterIsPm ? null : pms.find((h) => h.id === pmId);
  const rac = racs.find((h) => h.id === racId);
  if ((!requesterIsPm && !pm) || !rac) bad("The chosen approver no longer holds the role. Choose again.", "approver_RAC");

  const { data: profile } = await supabase.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle();

  const { data: inserted, error } = await supabase
    .from("trip_requests")
    .insert({
      ...trip,
      requested_by: user.id,
      requester_name: profile?.full_name ?? user.email ?? "",
      requester_email: profile?.email ?? user.email ?? null,
    })
    .select("id, number")
    .single();
  if (error || !inserted) bad(error?.message ?? "Could not save the request.");

  const approvalRows = [
    ...(pm ? [{ request_id: inserted.id, signer_role: "PM" as const, user_id: pm.id, user_name: pm.full_name }] : []),
    { request_id: inserted.id, signer_role: "RAC" as const, user_id: rac!.id, user_name: rac!.full_name },
  ];
  const { error: apErr } = await supabase.from("trip_approvals").insert(approvalRows);
  if (apErr) {
    await supabase.from("trip_requests").delete().eq("id", inserted.id);
    bad(apErr.message);
  }

  const link = `${await baseUrl()}/trips/${inserted.id}`;
  const requester = profile?.full_name ?? "A colleague";
  const list = pm ? [pm, rac!] : [rac!];
  after(async () => {
    for (const h of list) {
      if (!h.email) continue;
      try {
        const res = await sendEmail({
          to: h.email,
          subject: `Trip request ${inserted.number}: your approval is needed`,
          html: `<p>Hello ${escapeHtml(h.full_name)},</p>
<p><b>${escapeHtml(requester)}</b> asks to authorize the trip of <b>${escapeHtml(trip.traveler_name)}</b> to ${escapeHtml(trip.destination)} (${escapeHtml(inserted.number)}). Your approval is needed.</p>
${link ? `<p><a href="${link}">Open the request in PAS</a></p>` : ""}`,
        });
        console.log(`[trips] approval email ${inserted.number} -> ${h.email}: ${res.ok ? "sent" : res.error}`);
      } catch (e) {
        console.error("[trips] approval email failed", e);
      }
    }
  });
  revalidatePath("/trips");
  // the form navigates (a redirect from an action called by script is not reliable)
  return { redirectTo: `/trips?created=${encodeURIComponent(inserted.number)}` };
}

export async function createTripRequest(formData: FormData): Promise<TripSaveResult> {
  try {
    return (await createImpl(formData)) ?? {};
  } catch (e) {
    if (e instanceof FormError) return { error: e.message, field: e.field };
    throw e;
  }
}

async function updateImpl(id: string, formData: FormData) {
  const path = `/trips/${id}/edit`;
  const supabase = await createClient();
  const trip = parseTrip(formData);
  validate(trip);
  trip.allocations = parseAllocations(formData, trip);
  const { error } = await supabase.from("trip_requests").update(trip).eq("id", id);
  if (error) bad(error.message);
  revalidatePath(`/trips/${id}`);
  return { redirectTo: `/trips/${id}` };
}

export async function updateTripRequest(id: string, formData: FormData): Promise<TripSaveResult> {
  try {
    return (await updateImpl(id, formData)) ?? {};
  } catch (e) {
    if (e instanceof FormError) return { error: e.message, field: e.field };
    throw e;
  }
}

export async function signTripRequest(id: string, role: "PM" | "RAC") {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sign_trip_request", { rid: id, as_role: role });
  if (error) fail(`/trips/${id}`, error.message);

  type Mail = { to: string; subject: string; html: string; replyTo?: string };
  const mails: Mail[] = [];
  try {
    const { data: req } = await supabase.from("trip_requests").select("*").eq("id", id).maybeSingle();
    const link = `${await baseUrl()}/trips/${id}`;
    const label = role === "RAC" ? "RAC / CAR" : role;
    if (req) {
      const allSigned = Boolean((data as { all_signed?: boolean } | null)?.all_signed);
      if (allSigned) {
        if (req.needs_logistics) {
          // Logistics gets the whole sheet by email: it books and informs the people involved by email
          const { data: aps } = await supabase.from("trip_approvals").select("*").eq("request_id", id);
          const detail = tripSectionsHtml(tripSections(req as TripRow, (aps ?? []) as TripApproval[]));
          const needs = [
            req.flights_needed ? "plane ticket" : "",
            req.visa_needed ? "visa" : "",
            req.insurance === "oikos" ? "insurance" : "",
            req.hotel_needed ? "train / hotel / other" : "",
          ].filter(Boolean).join(", ");
          const logistics = await holders(supabase, "LOG");
          for (const h of logistics) {
            if (!h.email) continue;
            mails.push({
              to: h.email,
              replyTo: req.requester_email ?? undefined,
              subject: `Trip ${req.number} approved: ${needs} for ${req.traveler_name} (${req.destination})`,
              html: `<p>Hello ${escapeHtml(h.full_name)},</p>
<p>The trip <b>${escapeHtml(req.number)}</b> of <b>${escapeHtml(req.traveler_name)}</b> to ${escapeHtml(req.destination)} (${escapeHtml(req.start_date)} to ${escapeHtml(req.end_date)}) is approved. Please arrange: <b>${escapeHtml(needs)}</b>.</p>
<p>Requested by ${escapeHtml(req.requester_name)}${req.requester_email ? ` (${escapeHtml(req.requester_email)})` : ""}${req.traveler_email ? `, traveler ${escapeHtml(req.traveler_email)}` : ""}. Reply to this email or write to them: nothing has to be recorded in PAS.</p>
${detail}
${link ? `<p><a href="${link}">Open the request in PAS</a></p>` : ""}`,
            });
          }
        }
        if (req.requester_email) {
          mails.push({
            to: req.requester_email,
            subject: `Trip request ${req.number} approved`,
            html: `<p>Hello ${escapeHtml(req.requester_name)},</p><p>Your trip request <b>${escapeHtml(req.number)}</b> (${escapeHtml(req.traveler_name)}, ${escapeHtml(req.destination)}) is approved.${
              req.needs_logistics ? " Logistics has been informed by email and will contact you for the bookings. The sheet is closed." : " The sheet is closed."
            }</p>${link ? `<p><a href="${link}">Open the request</a></p>` : ""}`,
          });
        }
      } else if (req.requester_email) {
        mails.push({
          to: req.requester_email,
          subject: `Trip request ${req.number}: ${label} approved`,
          html: `<p>Hello ${escapeHtml(req.requester_name)},</p><p>The ${label} approved your trip request <b>${escapeHtml(req.number)}</b>. The other approval is still needed.</p>${link ? `<p><a href="${link}">Open the request</a></p>` : ""}`,
        });
      }
    }
  } catch {
    // best effort
  }
  after(async () => {
    for (const m of mails) {
      try {
        const res = await sendEmail(m);
        console.log(`[trips] email '${m.subject}' -> ${m.to}: ${res.ok ? "sent" : res.error}`);
      } catch (e) {
        console.error("[trips] email failed", e);
      }
    }
  });
  revalidatePath(`/trips/${id}`);
  redirect(`/trips/${id}`);
}

export async function cancelTripRequest(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("trip_requests").update({ status: "cancelled" }).eq("id", id);
  if (error) fail(`/trips/${id}`, error.message);
  revalidatePath("/trips");
  redirect(`/trips/${id}`);
}

export async function deleteTripRequest(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("trip_requests").delete().eq("id", id);
  if (error) fail(`/trips/${id}`, error.message);
  revalidatePath("/trips");
  redirect("/trips");
}
