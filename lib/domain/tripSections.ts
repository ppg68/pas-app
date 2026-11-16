import type { PdfSection } from "@/lib/domain/requestPdf";
import {
  INSURANCE_LABEL,
  LODGING_LABEL,
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

const yn = (b: boolean) => (b ? "Yes" : "No");

/** The sections of the trip sheet, shown on the page and printed in the PDF (one source for both). */
export function tripSections(r: TripRow, approvals: TripApproval[]): PdfSection[] {
  const days = tripDays(r.start_date, r.end_date);
  const perDiemTotal = r.per_diem_rate && r.per_diem_days ? r.per_diem_rate * r.per_diem_days : null;

  const sections: PdfSection[] = [];

  sections.push({
    title: "Traveler",
    rows: [
      ["Name", r.traveler_name],
      ["Email", r.traveler_email ?? ""],
      ["Contract type", TRAVELER_LABEL[r.traveler_type]],
      ["Public employee", r.public_employee ? "Yes (authorization needed)" : "No"],
      ["Role", r.role_title ?? ""],
      ["Reports to", r.reference_person ?? ""],
    ],
  });

  sections.push({
    title: "Trip",
    rows: [
      ["Where", SCOPE_LABEL[r.scope]],
      ["Destination", r.destination],
      ["Places of work", r.work_place ?? ""],
      ["Period", `${dateOnly(r.start_date)} to ${dateOnly(r.end_date)} (${days} ${days === 1 ? "day" : "days"})`],
      ["Means of transport", r.transport.map((t) => TRANSPORT_LABEL[t] ?? t).join(", ")],
    ],
  });

  sections.push({
    title: "Project and terms of reference",
    rows: [
      ["Project", [r.donor_code, r.project_title].filter(Boolean).join(" - ")],
      ["Internal code", r.internal_code ?? ""],
      ["Contact with minors", yn(r.minors)],
    ],
  });

  // the TDR is plain text to copy and paste into the supporting documents
  if (r.tdr) sections.push({ title: TDR_TITLE, notes: [r.tdr] });

  sections.push({
    title: "Costs",
    rows: [
      ["Advance", r.advance_amount != null ? `EUR ${money(r.advance_amount)}` : "None"],
      ["Daily compensation charged to projects", r.compensation_charged ? "Yes" : "No"],
      ["Board and lodging", LODGING_LABEL[r.lodging_mode]],
      ...(r.lodging_mode === "per_diem"
        ? ([
            ...(r.per_diem_rate
              ? ([
                  [
                    "Per diem",
                    `EUR ${money(r.per_diem_rate)} x ${r.per_diem_days ?? "?"} days${perDiemTotal != null ? ` = EUR ${money(perDiemTotal)} gross` : ""}`,
                  ],
                ] as [string, string][])
              : []),
          ] as [string, string][])
        : []),
    ],
  });

  sections.push({
    title: "Flights, visa, insurance, bookings",
    rows: [
      ["Plane ticket by Oikos", r.flights_needed ? `Yes - ${r.flights_route ?? ""}` : "No"],
      ["Visa", r.visa_needed ? "Yes" : "No"],
      ["Insurance", INSURANCE_LABEL[r.insurance]],
      ["Train / hotel / other by Logistics", r.hotel_needed ? "Yes" : "No"],
      ["Logistics to book", r.tickets_note ?? ""],
      ["Notes", r.notes ?? ""],
    ],
  });

  // costs charged to projects: one line per cost, one row per project
  const allocRows: [string, string][] = COST_TYPES.flatMap((c) => {
    const rows = (r.allocations ?? []).filter((a) => a.cost_type === c.key);
    if (rows.length === 0) return [];
    return [
      [
        COST_LABEL[c.key],
        rows.map((a) => `${a.project_code} - budget line ${a.budget_line}`).join("\n"),
      ] as [string, string],
    ];
  });
  if (allocRows.length > 0) sections.push({ title: "Costs charged to projects", rows: allocRows });

  // approvals and history: every step with who and when
  const approvalRows: [string, string][] = [
    ["Filed by", `${r.requester_name} on ${dt(r.created_at)}`],
  ];
  if (!approvals.some((a) => a.signer_role === "PM")) {
    approvalRows.push(["Superior", "No superior recorded"]);
  }
  for (const a of approvals) {
    approvalRows.push([
      a.signer_role === "RAC" ? "RAC / CAR" : "Superior",
      a.signed_at ? `Approved by ${a.user_name} on ${dt(a.signed_at)}` : `Waiting for ${a.user_name}`,
    ]);
  }
  approvalRows.push([
    "Status",
    r.status === "closed" && r.closed_at ? `Closed on ${dt(r.closed_at)}` : STATUS_LABEL[r.status],
  ]);
  sections.push({ title: "Approvals and history", rows: approvalRows });

  return sections;
}

/** The sheet as an HTML table list, for the email to Logistics (who books and informs everybody by email). */
export function tripSectionsHtml(sections: PdfSection[]): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return sections
    .filter((s) => s.title !== "Approvals and history")
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
