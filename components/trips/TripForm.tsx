"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TripSaveResult } from "@/app/(dashboard)/trips/actions";
import MoneyInput from "@/components/MoneyInput";
import {
  COST_LABEL,
  COST_TYPES,
  INSURANCE_LABEL,
  LODGING_LABEL,
  SCOPE_LABEL,
  TRANSPORT_OPTIONS,
  TRAVELER_LABEL,
  type Allocation,
  type CostType,
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

type AllocRow = { cost_type: CostType; project_code: string; budget_line: string };

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

const fromAlloc = (a: Allocation): AllocRow => ({
  cost_type: a.cost_type,
  project_code: a.project_code,
  budget_line: a.budget_line,
});

export default function TripForm({
  action,
  defaults,
  superiors,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<TripSaveResult | void>;
  defaults?: Partial<TripRow>;
  /** approver pickers, only when creating */
  superiors?: Holder[];
  submitLabel: string;
}) {
  const d = defaults ?? {};
  const [scope, setScope] = useState<TripScope>(d.scope && d.scope !== "italy" ? d.scope : "eu");
  const [type, setType] = useState<TravelerType>(d.traveler_type ?? "employee");
  const [lodging, setLodging] = useState<LodgingMode>(d.lodging_mode ?? "none");
  const [flights, setFlights] = useState(d.flights_needed ?? false);
  const [visa, setVisa] = useState(d.visa_needed ?? false);
  const [insurance, setInsurance] = useState<InsuranceMode>(d.insurance ?? (d.scope === "extra_eu" ? "oikos" : "none"));
  const [compensation, setCompensation] = useState(d.compensation_charged ?? false);
  const [hotel, setHotel] = useState(d.hotel_needed ?? false);
  const [mainCode, setMainCode] = useState(d.internal_code ?? "");
  const [alloc, setAlloc] = useState<AllocRow[]>(() => (d.allocations ?? []).map(fromAlloc));
  const transport = d.transport ?? [];
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // the costs that exist for this trip, from the choices made above
  const applicable = new Set<CostType>([
    ...(compensation ? (["compensation"] as CostType[]) : []),
    ...(lodging === "per_diem" ? (["per_diem"] as CostType[]) : []),
    ...(lodging === "receipts" || lodging === "free_lodging" ? (["expenses"] as CostType[]) : []),
    ...(flights ? (["flight"] as CostType[]) : []),
    ...(visa ? (["visa"] as CostType[]) : []),
    ...(insurance === "oikos" ? (["insurance"] as CostType[]) : []),
    ...(hotel ? (["bookings"] as CostType[]) : []),
  ]);
  const shown = alloc.filter((a) => applicable.has(a.cost_type));
  const types = COST_TYPES.filter((c) => applicable.has(c.key));

  const newRow = (cost: CostType): AllocRow => ({ cost_type: cost, project_code: mainCode, budget_line: "" });
  /** a cost that has just been chosen starts with one row */
  const seed = (cost: CostType) => setAlloc((a) => (a.some((x) => x.cost_type === cost) ? a : [...a, newRow(cost)]));

  // the main project code is copied into the rows that still carry the previous one (or none)
  function changeMainCode(v: string) {
    setAlloc((a) => a.map((x) => (x.project_code === "" || x.project_code === mainCode ? { ...x, project_code: v } : x)));
    setMainCode(v);
  }

  function patch(shownIdx: number, p: Partial<AllocRow>) {
    const target = shown[shownIdx];
    setAlloc((a) => a.map((x) => (x === target ? { ...x, ...p } : x)));
  }
  const removeRow = (shownIdx: number) => {
    const target = shown[shownIdx];
    setAlloc((a) => a.filter((x) => x !== target));
  };

  function clearInvalid(form: HTMLFormElement) {
    form.querySelectorAll(".field.invalid").forEach((el) => el.classList.remove("invalid"));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget;
    clearInvalid(form);
    setError(null);
    setBusy(true);
    try {
      const res = await action(new FormData(form));
      if (res && res.redirectTo) {
        // saved: leave the button disabled while the next page opens
        router.push(res.redirectTo);
        return;
      }
      if (res && res.error) {
        setError(res.error);
        if (res.field) {
          const el = form.querySelector<HTMLElement>(`[name="${res.field}"]`);
          const box = el?.closest(".field");
          box?.classList.add("invalid");
          (box ?? el)?.scrollIntoView({ behavior: "smooth", block: "center" });
          if (el && el.getAttribute("type") !== "hidden") el.focus({ preventScroll: true });
        } else {
          form.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
      setBusy(false);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Could not save the request. Try again.");
    }
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      onInput={(e) => (e.target as HTMLElement).closest(".field")?.classList.remove("invalid")}
      className="card"
      style={{ display: "flex", flexDirection: "column", gap: 14 }}
    >
      {error && <div className="banner error">{error}</div>}
      <input type="hidden" name="form" value="abroad" />
      <input type="hidden" name="allocations_json" value={JSON.stringify(shown)} />
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
              {Object.entries(SCOPE_LABEL).filter(([k]) => k !== "italy").map(([k, v]) => (
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
          <label>Project title(s) (full name) *</label>
          <input name="project_title" defaultValue={d.project_title ?? ""} required />
        </div>
        <div style={row}>
          <div className="field" style={col()}>
            <label>Main internal project code *</label>
            <input name="internal_code" value={mainCode} onChange={(e) => changeMainCode(e.target.value)} required />
          </div>
          <div className="field" style={col()}>
            <label>Donor code</label>
            <input name="donor_code" defaultValue={d.donor_code ?? ""} />
          </div>
        </div>
        <div className="field">
          <label>Termini di Riferimento (Terms of Reference of the mission) *</label>
          <textarea
            name="tdr"
            rows={14}
            style={area}
            defaultValue={d.tdr ?? ""}
            required
            placeholder={"Paste here the text of the TDR, for example:\n\nAttività nell’ambito del progetto o dell’incarico:\n• ...\n• ...\n\nObiettivi e Risultato Finale nell’ambito del progetto o dell’incarico:\n• ...\n• ..."}
          />
          <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            Free text, copy and paste. Whoever prepares the documents of the mission copies it from the sheet.
          </span>
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
            onChange={(e) => {
              setCompensation(e.target.checked);
              if (e.target.checked) seed("compensation");
            }}
          />{" "}
          The normal contractual compensation (daily fee) is charged to projects for these days
        </label>
        <div className="field">
          <label>Board and lodging</label>
          <select
            name="lodging_mode"
            value={lodging}
            onChange={(e) => {
              const v = e.target.value as LodgingMode;
              setLodging(v);
              if (v === "per_diem") seed("per_diem");
              if (v === "receipts" || v === "free_lodging") seed("expenses");
            }}
          >
            {Object.entries(LODGING_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </Section>

      <Section title="Flights, visa, insurance, bookings (Logistics)">
        <label className="checkbox-row">
          <input
            type="checkbox"
            name="flights_needed"
            checked={flights}
            onChange={(e) => {
              setFlights(e.target.checked);
              if (e.target.checked) seed("flight");
            }}
          />{" "}
          Plane ticket to be bought by Oikos
        </label>
        {flights && (
          <div className="field">
            <label>Route and preferred dates</label>
            <input name="flights_route" defaultValue={d.flights_route ?? ""} placeholder="e.g. Milano – Beirut, 05/07 → 15/07" />
          </div>
        )}
        <label className="checkbox-row">
          <input
            type="checkbox"
            name="visa_needed"
            checked={visa}
            onChange={(e) => {
              setVisa(e.target.checked);
              if (e.target.checked) seed("visa");
            }}
          />{" "}
          Visa needed
        </label>
        <div className="field" style={{ maxWidth: 420 }}>
          <label>Insurance {scope === "extra_eu" ? "(extra EU: policies paid by Oikos)" : ""}</label>
          <select
            name="insurance"
            value={insurance}
            onChange={(e) => {
              const v = e.target.value as InsuranceMode;
              setInsurance(v);
              if (v === "oikos") seed("insurance");
            }}
          >
            {Object.entries(INSURANCE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <label className="checkbox-row">
          <input
            type="checkbox"
            name="hotel_needed"
            checked={hotel}
            onChange={(e) => {
              setHotel(e.target.checked);
              if (e.target.checked) seed("bookings");
            }}
          />{" "}
          Logistics must also book train / hotel / other
        </label>
        <div className="field">
          <label>What Logistics has to book (train, hotel, preferences)</label>
          <textarea name="tickets_note" rows={2} style={area} defaultValue={d.tickets_note ?? ""} />
        </div>
      </Section>

      <Section title="Costs charged to projects">
        {types.length === 0 ? (
          <p className="subtitle" style={{ margin: 0 }}>
            No cost to charge: choose compensation, per diem, flights, visa, insurance or bookings above and the rows appear
            here.
          </p>
        ) : (
          <>
            <p className="subtitle" style={{ margin: 0 }}>
              For each cost say which project and budget line it will be charged to. If more projects are involved,
              add a row for each one.
            </p>
            {types.map((c) => {
              return (
                <div key={c.key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <b style={{ fontSize: "0.9rem" }}>{COST_LABEL[c.key]}</b>
                  {shown.map((a, i) =>
                    a.cost_type !== c.key ? null : (
                      <div key={i} style={{ ...row, alignItems: "flex-end" }}>
                        <div className="field" style={col(2, 150)}>
                          <label>Project code *</label>
                          <input name={`alloc_${i}_code`} value={a.project_code} onChange={(e) => patch(i, { project_code: e.target.value })} />
                        </div>
                        <div className="field" style={col(1, 110)}>
                          <label>Budget line *</label>
                          <input name={`alloc_${i}_bl`} value={a.budget_line} onChange={(e) => patch(i, { budget_line: e.target.value })} />
                        </div>
                        <button type="button" className="ghost danger" onClick={() => removeRow(i)} title="Remove the row">
                          ×
                        </button>
                      </div>
                    )
                  )}
                  <div className="field" style={{ alignItems: "flex-start" }}>
                    <input type="hidden" name={`alloc_add_${c.key}`} />
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setAlloc((a) => [...a, newRow(c.key)])}
                    >
                      + Add a project
                    </button>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </Section>

      <Section title="Notes">
        <div className="field">
          <label>Other notes</label>
          <textarea name="notes" rows={2} style={area} defaultValue={d.notes ?? ""} />
        </div>
      </Section>

      {superiors && (
        <Section title="Approval">
          <p className="subtitle" style={{ margin: 0 }}>
            The request is sent to your superior, who approves it. Then Logistics is informed if anything has to be booked.
          </p>
          <div className="field" style={{ maxWidth: 420 }}>
            <label>Superior who approves *</label>
            <select name="approver_PM" required defaultValue="">
              <option value="" disabled>
                Choose…
              </option>
              {superiors.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.full_name}
                </option>
              ))}
            </select>
          </div>
        </Section>
      )}

      <button type="submit" className="primary" style={{ width: "fit-content", marginTop: 6 }} disabled={busy}>
        {busy ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
