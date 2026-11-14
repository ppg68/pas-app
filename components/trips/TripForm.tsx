"use client";

import { useState } from "react";
import MoneyInput from "@/components/MoneyInput";
import SubmitButton from "@/components/SubmitButton";
import {
  INSURANCE_LABEL,
  LODGING_LABEL,
  PER_DIEM_GRID,
  SCOPE_LABEL,
  TRANSPORT_OPTIONS,
  TRAVELER_LABEL,
  type InsuranceMode,
  type LodgingMode,
  type TripRow,
  type TripScope,
  type TravelerType,
} from "@/lib/domain/trips";

export interface Holder {
  id: string;
  full_name: string;
  email: string | null;
}

const row: React.CSSProperties = { display: "flex", gap: 12, flexWrap: "wrap" };
const col = (flex = 1, min = 160): React.CSSProperties => ({ flex, minWidth: min });
const area: React.CSSProperties = { resize: "vertical" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h2 style={{ fontSize: "1rem", marginTop: 8, borderBottom: "1px solid var(--line)", paddingBottom: 4 }}>{title}</h2>
      {children}
    </div>
  );
}

export default function TripForm({
  action,
  defaults,
  pms,
  racs,
  requesterIsPm,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  defaults?: Partial<TripRow>;
  /** approver pickers, only when creating */
  pms?: Holder[];
  racs?: Holder[];
  requesterIsPm?: boolean;
  submitLabel: string;
}) {
  const d = defaults ?? {};
  const [scope, setScope] = useState<TripScope>(d.scope ?? "eu");
  const [type, setType] = useState<TravelerType>(d.traveler_type ?? "employee");
  const [lodging, setLodging] = useState<LodgingMode>(d.lodging_mode ?? "none");
  const [rate, setRate] = useState<string>(d.per_diem_rate != null ? String(d.per_diem_rate) : "");
  const [flights, setFlights] = useState(d.flights_needed ?? false);
  const [visa, setVisa] = useState(d.visa_needed ?? false);
  const [insurance, setInsurance] = useState<InsuranceMode>(d.insurance ?? (d.scope === "extra_eu" ? "oikos" : "none"));
  const [compensation, setCompensation] = useState(d.compensation_charged ?? false);
  const transport = d.transport ?? [];
  const perDiemKind = type === "cococo" ? "cococo" : "employee";

  return (
    <form action={action} className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Section title="Traveler">
        <div style={row}>
          <div className="field" style={col(2, 220)}>
            <label>Name and surname *</label>
            <input name="traveler_name" defaultValue={d.traveler_name ?? ""} required />
          </div>
          <div className="field" style={col(1, 200)}>
            <label>Email</label>
            <input name="traveler_email" type="email" defaultValue={d.traveler_email ?? ""} />
          </div>
        </div>
        <div style={row}>
          <div className="field" style={col()}>
            <label>Contract type *</label>
            <select name="traveler_type" value={type} onChange={(e) => setType(e.target.value as TravelerType)}>
              {Object.entries(TRAVELER_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={col()}>
            <label>Role / position</label>
            <input name="role_title" defaultValue={d.role_title ?? ""} placeholder="role related to the project" />
          </div>
          <div className="field" style={col()}>
            <label>Reports to (in Oikos)</label>
            <input name="reference_person" defaultValue={d.reference_person ?? ""} placeholder="position or name" />
          </div>
        </div>
        <label className="checkbox-row">
          <input type="checkbox" name="public_employee" defaultChecked={d.public_employee ?? false} /> Public employee
          (authorization needed)
        </label>
      </Section>

      <Section title="Trip">
        <div style={row}>
          <div className="field" style={col()}>
            <label>Where *</label>
            <select name="scope" value={scope} onChange={(e) => setScope(e.target.value as TripScope)}>
              {Object.entries(SCOPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={col(2, 220)}>
            <label>Destination (city, country) *</label>
            <input name="destination" defaultValue={d.destination ?? ""} required placeholder="e.g. Beirut, Lebanon" />
          </div>
        </div>
        <div className="field">
          <label>Places of work</label>
          <input name="work_place" defaultValue={d.work_place ?? ""} placeholder="e.g. Beirut, Jabal Moussa Biosphere Reserve" />
        </div>
        <div style={row}>
          <div className="field" style={col()}>
            <label>From *</label>
            <input name="start_date" type="date" defaultValue={d.start_date ?? ""} required />
          </div>
          <div className="field" style={col()}>
            <label>To *</label>
            <input name="end_date" type="date" defaultValue={d.end_date ?? ""} required />
          </div>
        </div>
        <div className="field">
          <label>Means of transport</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {TRANSPORT_OPTIONS.map(([k, label]) => (
              <label key={k} className="checkbox-row">
                <input type="checkbox" name="transport" value={k} defaultChecked={transport.includes(k)} /> {label}
              </label>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Project and terms of reference">
        <div className="field">
          <label>Project title (full name) *</label>
          <input name="project_title" defaultValue={d.project_title ?? ""} required />
        </div>
        <div style={row}>
          <div className="field" style={col()}>
            <label>Internal project code *</label>
            <input name="internal_code" defaultValue={d.internal_code ?? ""} required />
          </div>
          <div className="field" style={col()}>
            <label>Donor code</label>
            <input name="donor_code" defaultValue={d.donor_code ?? ""} />
          </div>
          <div className="field" style={col()}>
            <label>Budget line of the trip costs</label>
            <input name="budget_line" defaultValue={d.budget_line ?? ""} />
          </div>
        </div>
        <div className="field">
          <label>Purpose and activities of the trip *</label>
          <textarea name="activities" rows={4} style={area} defaultValue={d.activities ?? ""} required />
        </div>
        <div className="field">
          <label>Objective and final result</label>
          <textarea name="objective" rows={3} style={area} defaultValue={d.objective ?? ""} />
        </div>
        <label className="checkbox-row">
          <input type="checkbox" name="minors" defaultChecked={d.minors ?? false} /> The activities involve contact with
          minors
        </label>
      </Section>

      <Section title="Costs">
        <div style={row}>
          <div className="field" style={col()}>
            <label>Advance requested (€)</label>
            <MoneyInput name="advance_amount" defaultValue={d.advance_amount ?? ""} placeholder="none" />
          </div>
        </div>
        <label className="checkbox-row">
          <input
            type="checkbox"
            name="compensation_charged"
            checked={compensation}
            onChange={(e) => setCompensation(e.target.checked)}
          />{" "}
          The normal contractual compensation (daily fee) is charged to a project for these days
        </label>
        {compensation && (
          <div className="field">
            <label>Project / budget line of the compensation</label>
            <input name="compensation_bl" defaultValue={d.compensation_bl ?? ""} />
          </div>
        )}
        <div className="field">
          <label>Board and lodging</label>
          <select name="lodging_mode" value={lodging} onChange={(e) => setLodging(e.target.value as LodgingMode)}>
            {Object.entries(LODGING_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        {lodging === "per_diem" && (
          <>
            <div style={row}>
              <div className="field" style={col(2, 240)}>
                <label>Oikos grid (gross per day, {perDiemKind === "cococo" ? "Co.Co.Co." : "employee"})</label>
                <select value="" onChange={(e) => e.target.value && setRate(e.target.value)}>
                  <option value="">Pick from the grid…</option>
                  {PER_DIEM_GRID.map((g) => (
                    <option key={g.label} value={String(g[perDiemKind])}>
                      {g.label} — € {g[perDiemKind].toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={col(1, 130)}>
                <label>Per diem per day (€)</label>
                <MoneyInput name="per_diem_rate" value={rate} onValueChange={setRate} />
              </div>
              <div className="field" style={col(1, 110)}>
                <label>Per diem days</label>
                <input name="per_diem_days" inputMode="decimal" defaultValue={d.per_diem_days ?? ""} placeholder="e.g. 10" />
              </div>
            </div>
            <p className="subtitle" style={{ margin: 0 }}>
              Grid valid for trips up to 3 weeks; for longer ones agree with the Direction. Days can be fractions
              (1/3, 2/3) for arrival and departure days.
            </p>
            <div className="field">
              <label>Project / budget line of the per diem *</label>
              <input name="per_diem_bl" defaultValue={d.per_diem_bl ?? ""} />
            </div>
          </>
        )}
        {(lodging === "receipts" || lodging === "free_lodging") && (
          <div className="field">
            <label>Project / budget line of the expenses</label>
            <input name="expenses_bl" defaultValue={d.expenses_bl ?? ""} />
          </div>
        )}
      </Section>

      <Section title="Flights, visa, insurance, bookings (Logistics)">
        <label className="checkbox-row">
          <input type="checkbox" name="flights_needed" checked={flights} onChange={(e) => setFlights(e.target.checked)} />{" "}
          Plane ticket to be bought by Oikos
        </label>
        {flights && (
          <div style={row}>
            <div className="field" style={col(2, 220)}>
              <label>Route and preferred dates</label>
              <input name="flights_route" defaultValue={d.flights_route ?? ""} placeholder="e.g. Milano – Beirut, 05/07 → 15/07" />
            </div>
            <div className="field" style={col()}>
              <label>Project / budget line: flight *</label>
              <input name="flights_bl" defaultValue={d.flights_bl ?? ""} />
            </div>
          </div>
        )}
        <label className="checkbox-row">
          <input type="checkbox" name="visa_needed" checked={visa} onChange={(e) => setVisa(e.target.checked)} /> Visa
          needed
        </label>
        {visa && (
          <div className="field">
            <label>Project / budget line: visa *</label>
            <input name="visa_bl" defaultValue={d.visa_bl ?? ""} />
          </div>
        )}
        <div style={row}>
          <div className="field" style={col()}>
            <label>Insurance {scope === "extra_eu" ? "(extra EU: policies paid by Oikos)" : ""}</label>
            <select name="insurance" value={insurance} onChange={(e) => setInsurance(e.target.value as InsuranceMode)}>
              {Object.entries(INSURANCE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {insurance === "oikos" && (
            <div className="field" style={col()}>
              <label>Project / budget line: insurance *</label>
              <input name="insurance_bl" defaultValue={d.insurance_bl ?? ""} />
            </div>
          )}
        </div>
        <label className="checkbox-row">
          <input type="checkbox" name="hotel_needed" defaultChecked={d.hotel_needed ?? false} /> Logistics must also
          book train / hotel / other
        </label>
        <div className="field">
          <label>What Logistics has to book (train, hotel, preferences)</label>
          <textarea name="tickets_note" rows={2} style={area} defaultValue={d.tickets_note ?? ""} />
        </div>
        <div className="field">
          <label>Other notes</label>
          <textarea name="notes" rows={2} style={area} defaultValue={d.notes ?? ""} />
        </div>
      </Section>

      {pms && racs && (
        <Section title="Approval">
          <p className="subtitle" style={{ margin: 0 }}>
            {requesterIsPm
              ? "You are a PM: your request counts as the PM approval. The RAC or CAR must approve."
              : "The request is sent to the PM / Programme Manager and to the RAC or CAR. Both must approve."}{" "}
            Then Logistics is notified if anything has to be booked.
          </p>
          <div style={row}>
            {!requesterIsPm && (
              <div className="field" style={col()}>
                <label>PM / Programme Manager *</label>
                <select name="approver_PM" required defaultValue="">
                  <option value="" disabled>
                    Choose…
                  </option>
                  {pms.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.full_name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="field" style={col()}>
              <label>RAC / CAR *</label>
              <select name="approver_RAC" required defaultValue="">
                <option value="" disabled>
                  Choose…
                </option>
                {racs.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Section>
      )}

      <SubmitButton className="primary" style={{ width: "fit-content", marginTop: 6 }}>
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
