"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendEmail, escapeHtml } from "@/lib/notify";
import { COST_LABEL, COST_TYPES, type Allocation, type CostType, type InsuranceMode, type LodgingMode, type ReimbKind, type LetterData, ITALY_TRANSPORT_KEYS, tripDays, type TravelerType, type TripApproval, type TripRow, type TripScope } from "@/lib/domain/trips";
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
type Role = "PM" | "RAC" | "CAR" | "LOG" | "CAP";
type Supa = Awaited<ReturnType<typeof createClient>>;

async function holders(supabase: Supa, role: Role) {
  const { data } = await supabase.rpc("contract_role_holders", { r: role });
  return (data ?? []) as Holder[];
}

/** Second approver: anyone holding the RAC or the CAR role. */
/** Everybody registered in PAS: the superior is chosen freely. */
async function superiors(supabase: Supa) {
  const { data } = await supabase.rpc("expense_superiors");
  return (data ?? []) as Holder[];
}

async function baseUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "";
}

function parseTrip(f: FormData): ReturnType<typeof parseTripBase> {
  return str(f, "form") === "italy" ? parseItalyTrip(f) : parseTripBase(f);
}

function parseTripBase(f: FormData) {
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
    reimb_kind: null as ReimbKind | null,
    per_diem_rate: lodging === "per_diem" ? num(f, "per_diem_rate") : (null as number | null),
    per_diem_days: lodging === "per_diem" ? tripDays(str(f, "start_date") || "2000-01-01", str(f, "end_date") || str(f, "start_date") || "2000-01-01") : (null as number | null),
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
    letter: parseLetter(f),
  };
}

/** Dati per la lettera di incarico: campo nascosto letter_json, solo testi puliti. */
function parseLetter(f: FormData): LetterData {
  try {
    const raw = JSON.parse(str(f, "letter_json") || "{}") as Record<string, unknown>;
    const out: LetterData = {};
    for (const k of ["birth_place", "birth_date", "residence", "tax_code", "profile", "daily_fee", "extra_fee"] as const) {
      const v = typeof raw[k] === "string" ? (raw[k] as string).trim() : "";
      if (v) out[k] = v;
    }
    if (raw.contract_fee === true) out.contract_fee = true;
    return out;
  } catch {
    return {};
  }
}

/** Trip in Italy (AA09): one day or a period, reasons, transport, and the costs the form lists. */
function parseItalyTrip(f: FormData): ReturnType<typeof parseTripBase> {
  const base = parseTripBase(f);
  const start = str(f, "start_date");
  const end = str(f, "end_date") || start;
  const mode = str(f, "lodging_mode") || "none";
  const lodging = (["none", "per_diem", "receipts", "free_lodging"].includes(mode) ? mode : "none") as LodgingMode;
  const kind = str(f, "reimb_kind") as ReimbKind;
  const hotel = f.get("hotel_needed") === "on";
  const rate = lodging === "per_diem" ? num(f, "per_diem_rate") : null;
  return {
    ...base,
    traveler_type: "employee",
    scope: "italy",
    destination: str(f, "destination"),
    start_date: start,
    end_date: end,
    transport: f.getAll("transport").map(String).filter((k) => ITALY_TRANSPORT_KEYS.includes(k)),
    project_title: null,
    internal_code: null,
    donor_code: null,
    tdr: opt(f, "tdr"),
    advance_amount: num(f, "advance_amount"),
    compensation_charged: f.get("compensation_charged") === "on",
    lodging_mode: lodging,
    reimb_kind: lodging === "receipts" && ["either", "both", "expat_exit"].includes(kind) ? kind : null,
    per_diem_rate: rate,
    per_diem_days: rate && start && end && end >= start ? tripDays(start, end) : null,
    flights_needed: false,
    flights_route: null,
    visa_needed: false,
    insurance: "none",
    hotel_needed: hotel,
    tickets_note: hotel ? opt(f, "tickets_note") : null,
    needs_logistics: hotel,
  };
}

function validate(t: ReturnType<typeof parseTrip>) {
  if (t.scope === "italy") {
    if (!t.traveler_name) bad("Inserisci il nome di chi viaggia.", "traveler_name");
    if (!t.destination) bad("Inserisci il luogo della trasferta.", "destination");
    if (!t.start_date) bad("Inserisci la data della trasferta.", "start_date");
    if (t.end_date < t.start_date) bad("La data di fine è prima di quella di inizio.", "end_date");
    if (!t.tdr) bad("Inserisci i motivi della trasferta.", "tdr");
    if (t.lodging_mode === "per_diem" && !t.per_diem_rate) bad("Inserisci l'importo del Per Diem al giorno.", "per_diem_rate");
    if (t.lodging_mode === "receipts" && !t.reimb_kind) bad("Scegli quale rimborso è autorizzato.", "reimb_kind");
    return;
  }
  if (!t.traveler_name) bad("Inserisci il nome di chi viaggia.", "traveler_name");
  if (!t.destination) bad("Inserisci la destinazione.", "destination");
  if (!t.start_date) bad("Inserisci la data di inizio.", "start_date");
  if (!t.end_date) bad("Inserisci la data di fine.", "end_date");
  if (t.end_date < t.start_date) bad("La data di fine è prima di quella di inizio.", "end_date");
  if (!t.project_title) bad("Inserisci il titolo del progetto.", "project_title");
  if (!t.internal_code) bad("Inserisci il codice interno del progetto.", "internal_code");
  if (!t.tdr) bad("Inserisci i Termini di Riferimento della missione.", "tdr");
}

/** The costs that exist for the trip: each needs at least one (project code, budget line) row. */
function applicableCosts(t: ReturnType<typeof parseTrip>): CostType[] {
  const list: CostType[] = [];
  if (t.compensation_charged) list.push("compensation");
  if (t.lodging_mode === "per_diem") list.push("per_diem");
  // trips in Italy: receipts are not charged here (the expense report carries the codes)
  if (t.scope !== "italy" && (t.lodging_mode === "receipts" || t.lodging_mode === "free_lodging")) list.push("expenses");
  if (t.flights_needed) list.push("flight");
  if (t.visa_needed) list.push("visa");
  if (t.insurance === "oikos") list.push("insurance");
  if (t.hotel_needed) list.push("bookings");
  return list;
}

/** Reads and checks the allocation rows. Row i of the form is named alloc_<i>_code / _bl. */
function parseAllocations(f: FormData, t: ReturnType<typeof parseTrip>): Allocation[] {
  let raw: { cost_type?: string; project_code?: string; budget_line?: string }[] = [];
  try {
    raw = JSON.parse(str(f, "allocations_json") || "[]");
  } catch {
    bad("Le righe dei costi non si leggono. Ricarica la pagina e riprova.");
  }
  const costs = applicableCosts(t);
  const out: Allocation[] = [];
  raw.forEach((r, i) => {
    const type = r.cost_type as CostType;
    if (!costs.includes(type)) return;
    const label = COST_LABEL[type];
    const code = String(r.project_code ?? "").trim();
    const bl = String(r.budget_line ?? "").trim();
    if (!code) bad(`${label}: inserisci il codice progetto.`, `alloc_${i}_code`);
    if (!bl) bad(`${label}: inserisci la budget line.`, `alloc_${i}_bl`);
    out.push({ cost_type: type, project_code: code, budget_line: bl });
  });
  for (const c of COST_TYPES) {
    if (!costs.includes(c.key)) continue;
    const rows = out.filter((a) => a.cost_type === c.key);
    if (rows.length === 0) bad(`${c.label}: aggiungi il codice progetto e la budget line.`, `alloc_add_${c.key}`);
  }
  return out;
}

async function createImpl(formData: FormData) {
  const back = "/trips/new";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) fail(back, "Sessione scaduta, accedi di nuovo.");

  const trip = parseTrip(formData);
  validate(trip);
  trip.allocations = parseAllocations(formData, trip);

  // one approval only: the superior, chosen freely among the people registered in PAS
  const superiorId = str(formData, "approver_PM");
  if (!superiorId) bad("Scegli chi approva la richiesta.", "approver_PM");
  if (superiorId === user.id) bad("Non puoi approvare la tua stessa richiesta.", "approver_PM");
  const superior = (await superiors(supabase)).find((h) => h.id === superiorId);
  if (!superior) bad("La persona scelta non è stata trovata. Scegli di nuovo.", "approver_PM");

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
  if (error || !inserted) bad(error?.message ?? "Non è stato possibile salvare la richiesta.");

  const approvalRows = [{ request_id: inserted.id, signer_role: "PM" as const, user_id: superior.id, user_name: superior.full_name }];
  const { error: apErr } = await supabase.from("trip_approvals").insert(approvalRows);
  if (apErr) {
    await supabase.from("trip_requests").delete().eq("id", inserted.id);
    bad(apErr.message);
  }

  const link = `${await baseUrl()}/trips/${inserted.id}`;
  const requester = profile?.full_name ?? "Un collega";
  const list = [superior];
  after(async () => {
    for (const h of list) {
      if (!h.email) continue;
      try {
        const res = await sendEmail({
          to: h.email,
          subject: `Richiesta di trasferta ${inserted.number}: serve la tua approvazione`,
          html: `<p>Ciao ${escapeHtml(h.full_name)},</p>
<p><b>${escapeHtml(requester)}</b> chiede di autorizzare la trasferta di <b>${escapeHtml(trip.traveler_name)}</b> a ${escapeHtml(trip.destination)} (${escapeHtml(inserted.number)}). Serve la tua approvazione.</p>
${link ? `<p><a href="${link}">Apri la richiesta nel PAS</a></p>` : ""}`,
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
    const label = role === "RAC" ? "RAC / CAR" : "responsabile";
    if (req) {
      const allSigned = Boolean((data as { all_signed?: boolean } | null)?.all_signed);
      if (allSigned) {
        if (req.needs_logistics) {
          // Logistics gets the whole sheet by email: it books and informs the people involved by email
          const { data: aps } = await supabase.from("trip_approvals").select("*").eq("request_id", id);
          const detail = tripSectionsHtml(tripSections(req as TripRow, (aps ?? []) as TripApproval[]));
          const needs = [
            req.flights_needed ? "biglietto aereo" : "",
            req.visa_needed ? "visto" : "",
            req.insurance === "oikos" ? "assicurazione" : "",
            req.hotel_needed ? (req.scope === "italy" ? "acquisto biglietto aereo/treno o albergo" : "treno / albergo / altro") : "",
          ].filter(Boolean).join(", ");
          const logistics = await holders(supabase, "LOG");
          for (const h of logistics) {
            if (!h.email) continue;
            mails.push({
              to: h.email,
              replyTo: req.requester_email ?? undefined,
              subject: `Trasferta ${req.number} approvata: ${needs} per ${req.traveler_name} (${req.destination})`,
              html: `<p>Ciao ${escapeHtml(h.full_name)},</p>
<p>La trasferta <b>${escapeHtml(req.number)}</b> di <b>${escapeHtml(req.traveler_name)}</b> a ${escapeHtml(req.destination)} (dal ${escapeHtml(req.start_date)} al ${escapeHtml(req.end_date)}) è approvata. Per favore occupati di: <b>${escapeHtml(needs)}</b>.</p>
<p>Richiesta da ${escapeHtml(req.requester_name)}${req.requester_email ? ` (${escapeHtml(req.requester_email)})` : ""}${req.traveler_email ? `, viaggiatore ${escapeHtml(req.traveler_email)}` : ""}. Rispondi a questa email o scrivi loro: nel PAS non va registrato nulla.</p>
${detail}
${link ? `<p><a href="${link}">Apri la richiesta nel PAS</a></p>` : ""}`,
            });
          }
        }
        // CAP (amministrazione del personale): semplice email informativa, nessuna azione nel PAS
        {
          const { data: aps } = await supabase.from("trip_approvals").select("*").eq("request_id", id);
          const detail = tripSectionsHtml(tripSections(req as TripRow, (aps ?? []) as TripApproval[]));
          const already = new Set(mails.map((m) => m.to));
          for (const h of await holders(supabase, "CAP")) {
            if (!h.email || already.has(h.email)) continue;
            mails.push({
              to: h.email,
              replyTo: req.requester_email ?? undefined,
              subject: `Trasferta ${req.number} approvata: ${req.traveler_name} (${req.destination}, dal ${req.start_date} al ${req.end_date})`,
              html: `<p>Ciao ${escapeHtml(h.full_name)},</p>
<p>per tua informazione: la trasferta <b>${escapeHtml(req.number)}</b> di <b>${escapeHtml(req.traveler_name)}</b> a ${escapeHtml(req.destination)} (dal ${escapeHtml(req.start_date)} al ${escapeHtml(req.end_date)}) è stata approvata. Non serve nessuna azione nel PAS.</p>
${detail}
${link ? `<p><a href="${link}">Apri la richiesta nel PAS</a></p>` : ""}`,
            });
          }
        }
        if (req.requester_email) {
          mails.push({
            to: req.requester_email,
            subject: `Richiesta di trasferta ${req.number} approvata`,
            html: `<p>Ciao ${escapeHtml(req.requester_name)},</p><p>La tua richiesta di trasferta <b>${escapeHtml(req.number)}</b> (${escapeHtml(req.traveler_name)}, ${escapeHtml(req.destination)}) è approvata.${
              req.needs_logistics ? " La Logistica è stata informata per email e ti contatterà per le prenotazioni. La scheda è chiusa." : " La scheda è chiusa."
            }${req.scope !== "italy" ? " La lettera di incarico si scarica dalla scheda." : ""}</p>${link ? `<p><a href="${link}">Apri la richiesta</a></p>` : ""}`,
          });
        }
      } else if (req.requester_email) {
        mails.push({
          to: req.requester_email,
          subject: `Richiesta di trasferta ${req.number}: approvata dal ${label}`,
          html: `<p>Ciao ${escapeHtml(req.requester_name)},</p><p>Il ${label} ha approvato la tua richiesta di trasferta <b>${escapeHtml(req.number)}</b>. Manca ancora l'altra approvazione.</p>${link ? `<p><a href="${link}">Apri la richiesta</a></p>` : ""}`,
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

/** ADMIN: deletes the ticked trip requests (list page). */
export async function bulkDeleteTrips(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user?.id ?? "");
  if (!(roles ?? []).some((r) => r.role === "ADMIN")) fail("/trips", "Solo un ADMIN può eliminare le richieste di trasferta.");
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  if (ids.length === 0) fail("/trips", "Spunta le richieste di trasferta da eliminare.");
  const { data, error } = await supabase.from("trip_requests").delete().in("id", ids).select("id");
  if (error) fail("/trips", error.message);
  revalidatePath("/trips");
  redirect(`/trips?deleted=${(data ?? []).length}`);
}

export async function deleteTripRequest(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("trip_requests").delete().eq("id", id);
  if (error) fail(`/trips/${id}`, error.message);
  revalidatePath("/trips");
  redirect("/trips");
}
