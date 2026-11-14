"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendEmail, escapeHtml } from "@/lib/notify";
import type { InsuranceMode, LodgingMode, TravelerType, TripScope } from "@/lib/domain/trips";

// redirect() throws internally: used to bring a readable message back to the page.
function fail(path: string, message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
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
    budget_line: opt(f, "budget_line"),
    activities: opt(f, "activities"),
    objective: opt(f, "objective"),
    minors: f.get("minors") === "on",
    advance_amount: num(f, "advance_amount"),
    compensation_charged: compensation,
    compensation_bl: compensation ? opt(f, "compensation_bl") : null,
    lodging_mode: lodging,
    per_diem_rate: lodging === "per_diem" ? num(f, "per_diem_rate") : null,
    per_diem_days: lodging === "per_diem" ? num(f, "per_diem_days") : null,
    per_diem_bl: lodging === "per_diem" ? opt(f, "per_diem_bl") : null,
    expenses_bl: lodging === "receipts" || lodging === "free_lodging" ? opt(f, "expenses_bl") : null,
    flights_needed: flights,
    flights_route: flights ? opt(f, "flights_route") : null,
    flights_bl: flights ? opt(f, "flights_bl") : null,
    visa_needed: visa,
    visa_bl: visa ? opt(f, "visa_bl") : null,
    insurance,
    insurance_bl: insurance === "oikos" ? opt(f, "insurance_bl") : null,
    hotel_needed: hotel,
    tickets_note: opt(f, "tickets_note"),
    notes: opt(f, "notes"),
    needs_logistics: flights || visa || insurance === "oikos" || hotel,
  };
}

function validate(path: string, t: ReturnType<typeof parseTrip>) {
  if (!t.traveler_name) fail(path, "Enter the name of the traveler.");
  if (!t.destination) fail(path, "Enter the destination.");
  if (!t.start_date || !t.end_date) fail(path, "Enter the start and end dates.");
  if (t.end_date < t.start_date) fail(path, "The end date is before the start date.");
  if (!t.project_title || !t.internal_code) fail(path, "Enter the project title and the internal project code.");
  if (!t.activities) fail(path, "Describe the purpose and the activities of the trip.");
  if (t.lodging_mode === "per_diem" && (!t.per_diem_rate || !t.per_diem_days || !t.per_diem_bl)) {
    fail(path, "Per diem: enter the daily amount, the number of days and the budget line.");
  }
  if (t.flights_needed && !t.flights_bl) fail(path, "Enter the budget line of the flight.");
  if (t.visa_needed && !t.visa_bl) fail(path, "Enter the budget line of the visa.");
  if (t.insurance === "oikos" && !t.insurance_bl) fail(path, "Enter the budget line of the insurance.");
}

export async function createTripRequest(formData: FormData) {
  const back = "/trips/new";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) fail(back, "Session expired, please log in again.");

  const trip = parseTrip(formData);
  validate(back, trip);

  const [pms, racs] = await Promise.all([holders(supabase, "PM"), racOrCar(supabase)]);
  // A PM filing the request: the filing is already the PM's sign-off, only RAC / CAR is asked.
  const requesterIsPm = pms.some((h) => h.id === user.id);
  const pmId = str(formData, "approver_PM");
  const racId = str(formData, "approver_RAC");
  if (!racId || (!requesterIsPm && !pmId)) {
    fail(back, requesterIsPm ? "Choose the RAC or CAR who will approve." : "Choose the PM / Programme Manager and the RAC or CAR who will approve.");
  }
  if (racId === user.id || (pmId === user.id && !requesterIsPm)) fail(back, "You cannot approve your own request.");
  const pm = requesterIsPm ? null : pms.find((h) => h.id === pmId);
  const rac = racs.find((h) => h.id === racId);
  if ((!requesterIsPm && !pm) || !rac) fail(back, "The chosen approver no longer holds the role. Choose again.");

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
  if (error || !inserted) fail(back, error?.message ?? "Could not save the request.");

  const approvalRows = [
    ...(pm ? [{ request_id: inserted.id, signer_role: "PM" as const, user_id: pm.id, user_name: pm.full_name }] : []),
    { request_id: inserted.id, signer_role: "RAC" as const, user_id: rac!.id, user_name: rac!.full_name },
  ];
  const { error: apErr } = await supabase.from("trip_approvals").insert(approvalRows);
  if (apErr) {
    await supabase.from("trip_requests").delete().eq("id", inserted.id);
    fail(back, apErr.message);
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
  redirect(`/trips?created=${encodeURIComponent(inserted.number)}`);
}

export async function updateTripRequest(id: string, formData: FormData) {
  const path = `/trips/${id}/edit`;
  const supabase = await createClient();
  const trip = parseTrip(formData);
  validate(path, trip);
  const { error } = await supabase.from("trip_requests").update(trip).eq("id", id);
  if (error) fail(path, error.message);
  revalidatePath(`/trips/${id}`);
  redirect(`/trips/${id}`);
}

export async function signTripRequest(id: string, role: "PM" | "RAC") {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sign_trip_request", { rid: id, as_role: role });
  if (error) fail(`/trips/${id}`, error.message);

  type Mail = { to: string; subject: string; html: string };
  const mails: Mail[] = [];
  try {
    const { data: req } = await supabase
      .from("trip_requests")
      .select("number, traveler_name, destination, start_date, end_date, requester_name, requester_email, needs_logistics")
      .eq("id", id)
      .maybeSingle();
    const link = `${await baseUrl()}/trips/${id}`;
    const label = role === "RAC" ? "RAC / CAR" : role;
    if (req) {
      const allSigned = Boolean((data as { all_signed?: boolean } | null)?.all_signed);
      if (allSigned) {
        if (req.needs_logistics) {
          const logistics = await holders(supabase, "LOG");
          for (const h of logistics) {
            if (!h.email) continue;
            mails.push({
              to: h.email,
              subject: `Trip ${req.number} approved: bookings needed`,
              html: `<p>Hello ${escapeHtml(h.full_name)},</p>
<p>The trip <b>${escapeHtml(req.number)}</b> of <b>${escapeHtml(req.traveler_name)}</b> to ${escapeHtml(req.destination)} (${escapeHtml(req.start_date)} → ${escapeHtml(req.end_date)}) is approved. Please arrange the bookings and record them in PAS.</p>
${link ? `<p><a href="${link}">Open the request in PAS</a></p>` : ""}`,
            });
          }
        }
        if (req.requester_email) {
          mails.push({
            to: req.requester_email,
            subject: `Trip request ${req.number} approved`,
            html: `<p>Hello ${escapeHtml(req.requester_name)},</p><p>Your trip request <b>${escapeHtml(req.number)}</b> (${escapeHtml(req.traveler_name)}, ${escapeHtml(req.destination)}) is approved.${
              req.needs_logistics ? " Logistics will now arrange the bookings." : " The sheet is closed."
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

/** Logistics: records what was booked and closes the sheet. */
export async function bookTripRequest(id: string, formData: FormData) {
  const supabase = await createClient();
  const note = str(formData, "booking_note");
  if (!note) fail(`/trips/${id}`, "Write what was booked (flight, hotel, visa, insurance...).");
  const { error } = await supabase.rpc("book_trip_request", { rid: id, note, total: num(formData, "booking_total") });
  if (error) fail(`/trips/${id}`, error.message);

  try {
    const { data: req } = await supabase
      .from("trip_requests")
      .select("number, traveler_name, destination, requester_name, requester_email, traveler_email")
      .eq("id", id)
      .maybeSingle();
    const link = `${await baseUrl()}/trips/${id}`;
    if (req) {
      const to = [req.requester_email, req.traveler_email].filter((e, i, a): e is string => !!e && a.indexOf(e) === i);
      after(async () => {
        for (const addr of to) {
          try {
            await sendEmail({
              to: addr,
              subject: `Trip ${req.number}: bookings done`,
              html: `<p>Logistics has completed the bookings for the trip of <b>${escapeHtml(req.traveler_name)}</b> to ${escapeHtml(req.destination)} (${escapeHtml(req.number)}). The sheet is closed.</p><p>${escapeHtml(note).replace(/\n/g, "<br>")}</p>${link ? `<p><a href="${link}">Open the request</a></p>` : ""}`,
            });
          } catch (e) {
            console.error("[trips] booking email failed", e);
          }
        }
      });
    }
  } catch {
    // best effort
  }
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
