import type { PdfSection } from "@/lib/domain/requestPdf";
import {
  INSURANCE_LABEL,
  LODGING_LABEL,
  SCOPE_LABEL,
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
      ["Budget line", r.budget_line ?? ""],
      ["Purpose and activities", r.activities ?? ""],
      ["Objective and final result", r.objective ?? ""],
      ["Contact with minors", yn(r.minors)],
    ],
  });

  sections.push({
    title: "Costs",
    rows: [
      ["Advance", r.advance_amount != null ? `EUR ${money(r.advance_amount)}` : "None"],
      ["Daily compensation charged", r.compensation_charged ? `Yes - ${r.compensation_bl ?? "no budget line given"}` : "No"],
      ["Board and lodging", LODGING_LABEL[r.lodging_mode]],
      ...(r.lodging_mode === "per_diem"
        ? ([
            [
              "Per diem",
              `EUR ${money(r.per_diem_rate)} x ${r.per_diem_days ?? "?"} days${perDiemTotal != null ? ` = EUR ${money(perDiemTotal)} gross` : ""}`,
            ],
            ["Per diem project / budget line", r.per_diem_bl ?? ""],
          ] as [string, string][])
        : []),
      ...(r.expenses_bl ? ([["Expenses project / budget line", r.expenses_bl]] as [string, string][]) : []),
    ],
  });

  sections.push({
    title: "Flights, visa, insurance, bookings",
    rows: [
      ["Plane ticket by Oikos", r.flights_needed ? `Yes - ${r.flights_route ?? ""}` : "No"],
      ...(r.flights_needed ? ([["Flight project / budget line", r.flights_bl ?? ""]] as [string, string][]) : []),
      ["Visa", r.visa_needed ? `Yes - ${r.visa_bl ?? ""}` : "No"],
      ["Insurance", INSURANCE_LABEL[r.insurance] + (r.insurance_bl ? ` - ${r.insurance_bl}` : "")],
      ["Train / hotel / other by Logistics", r.hotel_needed ? "Yes" : "No"],
      ["Logistics to book", r.tickets_note ?? ""],
      ["Notes", r.notes ?? ""],
    ],
  });

  // approvals and history: every step with who and when
  const approvalRows: [string, string][] = [
    ["Filed by", `${r.requester_name} on ${dt(r.created_at)}`],
  ];
  if (!approvals.some((a) => a.signer_role === "PM")) {
    approvalRows.push(["PM / Programme Manager", `Filed by the PM (${r.requester_name}): no separate approval needed`]);
  }
  for (const a of approvals) {
    approvalRows.push([
      a.signer_role === "RAC" ? "RAC / CAR" : "PM / Programme Manager",
      a.signed_at ? `Approved by ${a.user_name} on ${dt(a.signed_at)}` : `Waiting for ${a.user_name}`,
    ]);
  }
  if (r.needs_logistics) {
    approvalRows.push([
      "Logistics",
      r.booked_at
        ? `Booked by ${r.booked_by_name ?? "Logistics"} on ${dt(r.booked_at)}`
        : r.status === "cancelled"
          ? "Not done (request cancelled)"
          : "Waiting for bookings",
    ]);
  }
  approvalRows.push([
    "Status",
    r.status === "closed" && r.closed_at ? `Closed on ${dt(r.closed_at)}` : STATUS_LABEL[r.status],
  ]);
  sections.push({ title: "Approvals and history", rows: approvalRows });

  if (r.booked_at) {
    sections.push({
      title: "Bookings (Logistics)",
      rows: [
        ["Booked by", `${r.booked_by_name ?? ""} on ${dt(r.booked_at)}`],
        ["Total cost", r.booking_total != null ? `EUR ${money(r.booking_total)}` : ""],
      ],
      notes: r.booking_note ? [r.booking_note] : [],
    });
  }

  return sections;
}
