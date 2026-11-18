// Trip requests: online version of "Scheda attivazione missioni" (PR09_1.5_AA14) and of the
// "Autorizzazione alla trasferta" (PR09_1.6_AA08/AA09). One sheet for every trip.

export type TripStatus = "pending" | "approved" | "closed" | "cancelled";
export type TripScope = "italy" | "eu" | "extra_eu";
export type TravelerType = "employee" | "cococo" | "volunteer" | "partner" | "other";
export type LodgingMode = "none" | "per_diem" | "receipts" | "free_lodging" | "self";
export type InsuranceMode = "none" | "oikos" | "self";

export const STATUS_LABEL: Record<TripStatus, string> = {
  pending: "In attesa di approvazione",
  approved: "Approvata",
  closed: "Chiusa",
  cancelled: "Annullata",
};

export const SCOPE_LABEL: Record<TripScope, string> = {
  italy: "Italia, Svizzera ed Europa in giornata",
  eu: "Missione in Europa (UE, Svizzera...)",
  extra_eu: "Missione extra UE",
};

export const TRAVELER_LABEL: Record<TravelerType, string> = {
  employee: "Dipendente",
  cococo: "Collaboratore (Co.Co.Co.)",
  volunteer: "Volontario",
  partner: "Personale di un partner di progetto",
  other: "Altro",
};

export const LODGING_LABEL: Record<LodgingMode, string> = {
  none: "Nessun rimborso di vitto e alloggio",
  per_diem: "Per diem (importo giornaliero forfettario)",
  receipts: "Rimborso a piè di lista (senza per diem)",
  free_lodging: "Alloggio gratuito presso una struttura Oikos (per diem riproporzionato)",
  self: "A carico del viaggiatore",
};

export const INSURANCE_LABEL: Record<InsuranceMode, string> = {
  none: "Non serve (tessera sanitaria europea)",
  oikos: "Da attivare a cura di Oikos (come da procedure)",
  self: "Il viaggiatore ha una copertura propria",
};

export type ReimbKind = "either" | "both" | "expat_exit";
export const REIMB_LABEL: Record<ReimbKind, string> = {
  either: "Rimborso analitico delle spese di vitto o alloggio, oppure vitto o alloggio gratuito",
  both: "Rimborso analitico delle spese di vitto e alloggio, oppure vitto e alloggio gratuito",
  expat_exit: "Rimborso analitico delle spese di viaggio dell'espatriato per l'uscita dal paese a seguito di rinnovo visto, fino a un massimo di 250,00 euro",
};
/** Transport options of a trip in Italy (AA09): no plane. */
export const ITALY_TRANSPORT_KEYS = ["company_car", "own_car", "own_electric", "public"];

export const TRANSPORT_OPTIONS: [string, string][] = [
  ["company_car", "Auto di servizio"],
  ["own_car", "Mezzo proprio a benzina/diesel/GPL"],
  ["own_electric", "Mezzo proprio elettrico"],
  ["public", "Mezzo pubblico (car sharing, treno, autobus/tram)"],
  ["plane", "Aereo"],
];
export const TRANSPORT_LABEL: Record<string, string> = Object.fromEntries(TRANSPORT_OPTIONS);

// Per diem grid from the activation sheet (gross daily amount: employee / Co.Co.Co.). Valid for missions up to
// 3 weeks; longer ones need an agreement with the Direction. Edit this list when the grid changes.
export const PER_DIEM_GRID: { label: string; employee: number; cococo: number }[] = [
  { label: "Europa e altre destinazioni extra UE", employee: 133.5, cococo: 136 },
  { label: "Libano, Mozambico", employee: 164, cococo: 168.5 },
  { label: "Tanzania, Thailandia", employee: 141, cococo: 144.5 },
  { label: "Tunisia", employee: 140.5, cococo: 143.5 },
];

export const TDR_TITLE = "Termini di Riferimento";

/** Dati per la lettera di incarico (PR09 AA04-AA07), tutti facoltativi: gli spazi vuoti restano nel Word. */
export type LetterData = {
  birth_place?: string;
  birth_date?: string;
  residence?: string;
  tax_code?: string;
  /** profilo professionale A-F dell'Accordo Collettivo (solo collaboratori) */
  profile?: string;
  /** compenso giornaliero lordo (collaboratori) */
  daily_fee?: string;
  /** compenso aggiuntivo lordo (collaboratori) */
  extra_fee?: string;
  /** usare il compenso giornaliero già previsto dal contratto */
  contract_fee?: boolean;
};

export type CostType = "compensation" | "per_diem" | "expenses" | "flight" | "visa" | "insurance" | "bookings";

/** The costs of a trip that are charged to projects, in the order shown. */
export const COST_TYPES: { key: CostType; label: string }[] = [
  { key: "compensation", label: "Compenso giornaliero" },
  { key: "per_diem", label: "Per diem" },
  { key: "expenses", label: "Spese di vitto e alloggio" },
  { key: "flight", label: "Biglietto aereo" },
  { key: "visa", label: "Visto" },
  { key: "insurance", label: "Assicurazione" },
  { key: "bookings", label: "Treno / albergo / altro (Logistica)" },
];
export const COST_LABEL = Object.fromEntries(COST_TYPES.map((c) => [c.key, c.label])) as Record<CostType, string>;

/** One row of the allocation: a project code and budget line a cost is charged to (no percentage). */
export type Allocation = { cost_type: CostType; project_code: string; budget_line: string };

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
  tdr: string | null;
  minors: boolean;
  transport: string[];
  advance_amount: number | null;
  compensation_charged: boolean;
  compensation_bl: string | null;
  lodging_mode: LodgingMode;
  reimb_kind: ReimbKind | null;
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
  allocations: Allocation[];
  letter: LetterData;
  letter_text: { key: string; title: string; body: string }[] | null;
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
