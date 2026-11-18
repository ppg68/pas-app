import type { PdfSection } from "@/lib/domain/requestPdf";
import {
  INSURANCE_LABEL,
  LODGING_LABEL,
  REIMB_LABEL,
  SCOPE_LABEL,
  COST_LABEL,
  TDR_TITLE,
  COST_TYPES,
  STATUS_LABEL,
  TRANSPORT_LABEL,
  TRAVELER_LABEL,
  dateOnly,
  dt,
  money,
  tripDays,
  type TripApproval,
  type TripRow,
} from "@/lib/domain/trips";

const yn = (b: boolean) => (b ? "Sì" : "No");

/** Le sezioni della scheda, mostrate nella pagina e stampate nel PDF (una sola fonte per entrambi). */
export function tripSections(r: TripRow, approvals: TripApproval[]): PdfSection[] {
  const days = tripDays(r.start_date, r.end_date);
  const perDiemTotal = r.per_diem_rate && r.per_diem_days ? r.per_diem_rate * r.per_diem_days : null;
  const italy = r.scope === "italy";

  const sections: PdfSection[] = [];

  sections.push({
    title: "Viaggiatore",
    rows: [
      ["Nome", r.traveler_name],
      ["Email", r.traveler_email ?? ""],
      ...(italy ? [] : ([["Tipologia", TRAVELER_LABEL[r.traveler_type]]] as [string, string][])),
      ["Dipendente pubblico", r.public_employee ? "Sì (serve l'autorizzazione)" : italy ? "" : "No"],
      ["Ruolo", r.role_title ?? ""],
      ["Funzioni di riferimento", r.reference_person ?? ""],
    ],
  });

  if (!italy && (r.traveler_type === "employee" || r.traveler_type === "cococo")) {
    const L = r.letter ?? {};
    sections.push({
      title: "Dati per la lettera di incarico",
      rows: [
        ["Nato/a a", L.birth_place ?? ""],
        ["Nato/a il", L.birth_date ? dateOnly(L.birth_date) : ""],
        ["Residente a", L.residence ?? ""],
        ["Codice fiscale", L.tax_code ?? ""],
        ["Profilo professionale", L.profile ?? ""],
        ["Compenso giornaliero lordo", L.daily_fee ? `EUR ${L.daily_fee}` : ""],
        ["Compenso aggiuntivo lordo", L.extra_fee ? `EUR ${L.extra_fee}` : ""],
        ["Compenso contrattuale in essere", L.contract_fee ? "Sì" : ""],
      ],
    });
  }

  sections.push({
    title: italy ? "Trasferta" : "Missione",
    rows: [
      ["Dove", SCOPE_LABEL[r.scope]],
      ["Destinazione", r.destination],
      ["Sede di lavoro", r.work_place ?? ""],
      [
        "Periodo",
        r.start_date === r.end_date
          ? `${dateOnly(r.start_date)} (1 giorno)`
          : `dal ${dateOnly(r.start_date)} al ${dateOnly(r.end_date)} (${days} giorni)`,
      ],
      ["Mezzi di trasporto", r.transport.map((t) => TRANSPORT_LABEL[t] ?? t).join(", ")],
      ...(italy ? ([["Motivi", r.tdr ?? ""]] as [string, string][]) : []),
    ],
  });

  if (!italy) {
    sections.push({
      title: "Progetto",
      rows: [
        ["Progetto", [r.donor_code, r.project_title].filter(Boolean).join(" - ")],
        ["Codice interno", r.internal_code ?? ""],
        ["Contatti con minorenni", yn(r.minors)],
      ],
    });

    // il TDR e' testo semplice da copiare nei documenti
    if (r.tdr) sections.push({ title: TDR_TITLE, notes: [r.tdr] });
  }

  sections.push({
    title: "Costi",
    rows: [
      ["Anticipo", r.advance_amount != null ? `EUR ${money(r.advance_amount)}` : "Nessuno"],
      ["Compenso giornaliero caricato sui progetti", r.compensation_charged ? "Sì" : "No"],
      [
        "Alloggio e vitto",
        r.lodging_mode === "receipts" && r.reimb_kind ? REIMB_LABEL[r.reimb_kind] : LODGING_LABEL[r.lodging_mode],
      ],
      ...(r.lodging_mode === "per_diem" && r.per_diem_rate
        ? ([
            [
              "Per diem",
              `EUR ${money(r.per_diem_rate)} x ${r.per_diem_days ?? "?"} giorni${perDiemTotal != null ? ` = EUR ${money(perDiemTotal)} lordi` : ""}`,
            ],
          ] as [string, string][])
        : []),
    ],
  });

  if (italy) {
    sections.push({
      title: "Acquisti a cura di Oikos",
      rows: [
        ["Biglietto o albergo da Istituto Oikos", r.hotel_needed ? "Sì" : "No"],
        ["La Logistica deve prenotare", r.tickets_note ?? ""],
        ["Note", r.notes ?? ""],
      ],
    });
  } else {
    sections.push({
      title: "Voli, visti, assicurazione, prenotazioni",
      rows: [
        ["Biglietto aereo a cura di Oikos", r.flights_needed ? `Sì - ${r.flights_route ?? ""}` : "No"],
        ["Visto", r.visa_needed ? "Sì" : "No"],
        ["Assicurazione", INSURANCE_LABEL[r.insurance]],
        ["Treno / albergo / altro a cura della Logistica", r.hotel_needed ? "Sì" : "No"],
        ["La Logistica deve prenotare", r.tickets_note ?? ""],
        ["Note", r.notes ?? ""],
      ],
    });
  }

  // costi caricati sui progetti: una riga per costo, una riga per progetto
  const allocRows: [string, string][] = COST_TYPES.flatMap((c) => {
    const rows = (r.allocations ?? []).filter((a) => a.cost_type === c.key);
    if (rows.length === 0) return [];
    return [[COST_LABEL[c.key], rows.map((a) => `${a.project_code} - budget line ${a.budget_line}`).join("\n")] as [string, string]];
  });
  if (allocRows.length > 0) sections.push({ title: "Costi caricati sui progetti", rows: allocRows });

  // approvazioni e storia: ogni passaggio con chi e quando
  const approvalRows: [string, string][] = [["Compilata da", `${r.requester_name} il ${dt(r.created_at)}`]];
  if (!approvals.some((a) => a.signer_role === "PM")) {
    approvalRows.push(["Responsabile", "Nessun responsabile registrato"]);
  }
  for (const a of approvals) {
    approvalRows.push([
      a.signer_role === "RAC" ? "RAC / CAR" : "Responsabile",
      a.signed_at ? `Approvata da ${a.user_name} il ${dt(a.signed_at)}` : `In attesa di ${a.user_name}`,
    ]);
  }
  approvalRows.push(["Stato", r.status === "closed" && r.closed_at ? `Chiusa il ${dt(r.closed_at)}` : STATUS_LABEL[r.status]]);
  sections.push({ title: "Approvazioni e storia", rows: approvalRows });

  return sections;
}

/** La scheda come elenco di tabelle HTML, per l'email alla Logistica (che prenota e informa tutti per email). */
export function tripSectionsHtml(sections: PdfSection[]): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return sections
    .filter((s) => s.title !== "Approvazioni e storia")
    .map((s) => {
      const rows = (s.rows ?? [])
        .filter(([, v]) => v)
        .map(
          ([k, v]) =>
            `<tr><td style="padding:2px 12px 2px 0;color:#667;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:2px 0">${esc(v).replace(/\n/g, "<br>")}</td></tr>`
        )
        .join("");
      const notes = (s.notes ?? []).map((n) => `<div style="white-space:pre-wrap;font-size:13px">${esc(n).replace(/\n/g, "<br>")}</div>`).join("");
      return `<h3 style="margin:14px 0 4px">${esc(s.title)}</h3>${rows ? `<table style="border-collapse:collapse;font-size:13px">${rows}</table>` : ""}${notes}`;
    })
    .join("");
}
