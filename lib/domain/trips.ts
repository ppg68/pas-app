// Trip requests: online version of "Scheda attivazione missioni" (PR09_1.5_AA14) and of the
// "Autorizzazione alla trasferta" (PR09_1.6_AA08/AA09). One sheet for every trip.

export type TripStatus = "pending" | "approved" | "closed" | "cancelled";
export type TripScope = "italy" | "eu" | "extra_eu";
export type TravelerType = "employee" | "cococo" | "volunteer" | "partner" | "other";
export type LodgingMode = "none" | "per_diem" | "receipts" | "free_lodging" | "self";
export type InsuranceMode = "none" | "oikos" | "self";

export const STATUS_LABEL: Record<TripStatus, string> = {
  pending: "Awaiting approval",
  approved: "Awaiting Logistics",
  closed: "Closed",
  cancelled: "Cancelled",
};

export const SCOPE_LABEL: Record<TripScope, string> = {
  italy: "Italy",
  eu: "Europe (EU, Switzerland...)",
  extra_eu: "Extra EU",
};

export const TRAVELER_LABEL: Record<TravelerType, string> = {
  employee: "Employee",
  cococo: "Co.Co.Co.",
  volunteer: "Volunteer",
  partner: "Project partner staff",
  other: "Other",
};

export const LODGING_LABEL: Record<LodgingMode, string> = {
  none: "No board and lodging reimbursement",
  per_diem: "Per diem (flat rate)",
  receipts: "Reimbursement against receipts (no per diem)",
  free_lodging: "Free lodging at an Oikos facility (per diem proportioned)",
  self: "At the traveler's expense",
};

export const INSURANCE_LABEL: Record<InsuranceMode, string> = {
  none: "Not needed (EU health card)",
  oikos: "To be activated by Oikos",
  self: "Traveler has their own cover",
};

export const TRANSPORT_OPTIONS: [string, string][] = [
  ["company_car", "Company car"],
  ["own_car", "Own car (petrol / diesel / LPG)"],
  ["own_electric", "Own electric car"],
  ["public", "Public transport (car sharing, train, bus / tram)"],
  ["plane", "Plane"],
];
export const TRANSPORT_LABEL: Record<string, string> = Object.fromEntries(TRANSPORT_OPTIONS);

// Per diem grid from the activation sheet (gross daily amount: employee / Co.Co.Co.). Valid for missions up to
// 3 weeks; longer ones need an agreement with the Direction. Edit this list when the grid changes.
export const PER_DIEM_GRID: { label: string; employee: number; cococo: number }[] = [
  { label: "Europe and other extra EU destinations", employee: 133.5, cococo: 136 },
  { label: "Lebanon, Mozambique", employee: 164, cococo: 168.5 },
  { label: "Tanzania, Thailand", employee: 141, cococo: 144.5 },
  { label: "Tunisia", employee: 140.5, cococo: 143.5 },
];

export type TripApproval = {
  request_id: string;
  signer_role: "PM" | "RAC";
  user_id: string;
  user_name: string;
  signed_at: string | null;
}

export type TripRow = {
  id: string;
  number: string;
  status: TripStatus;
  requested_by: string;
  requester_name: string;
  requester_email: string | null;
  traveler_name: string;
  traveler_email: string | null;
  traveler_type: TravelerType;
  public_employee: boolean;
  role_title: string | null;
  scope: TripScope;
  destination: string;
  work_place: string | null;
  start_date: string;
  end_date: string;
  project_title: string | null;
  internal_code: string | null;
  donor_code: string | null;
  budget_line: string | null;
  reference_person: string | null;
  activities: string | null;
  objective: string | null;
  minors: boolean;
  transport: string[];
  advance_amount: number | null;
  compensation_charged: boolean;
  compensation_bl: string | null;
  lodging_mode: LodgingMode;
  per_diem_rate: number | null;
  per_diem_days: number | null;
  per_diem_bl: string | null;
  expenses_bl: string | null;
  flights_needed: boolean;
  flights_route: string | null;
  flights_bl: string | null;
  visa_needed: boolean;
  visa_bl: string | null;
  insurance: InsuranceMode;
  insurance_bl: string | null;
  hotel_needed: boolean;
  tickets_note: string | null;
  notes: string | null;
  needs_logistics: boolean;
  booked_by: string | null;
  booked_by_name: string | null;
  booked_at: string | null;
  booking_note: string | null;
  booking_total: number | null;
  closed_at: string | null;
  created_at: string;
}

export const dt = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString("it-IT", { timeZone: "Europe/Rome" }) : "";
export const dateOnly = (s: string | null | undefined) =>
  s ? new Date(s + (s.length === 10 ? "T00:00:00" : "")).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" }) : "";
export const money = (n: number | null | undefined) =>
  n == null ? "" : n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Calendar days of the trip, both ends included. */
export function tripDays(start: string, end: string) {
  const ms = new Date(end + "T00:00:00Z").getTime() - new Date(start + "T00:00:00Z").getTime();
  return Math.round(ms / 86400000) + 1;
}
