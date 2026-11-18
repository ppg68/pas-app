"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TripSaveResult } from "@/app/(dashboard)/trips/actions";
import MoneyInput from "@/components/MoneyInput";
import {
  COST_LABEL,
  COST_TYPES,
  INSURANCE_LABEL,
  PER_DIEM_GRID,
  LODGING_LABEL,
  SCOPE_LABEL,
  TRANSPORT_OPTIONS,
  TRAVELER_LABEL,
  type Allocation,
  type CostType,
  type LetterData,
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
  const [letter, setLetter] = useState<LetterData>(d.letter ?? {});
  const [rate, setRate] = useState<string>(d.per_diem_rate != null ? String(d.per_diem_rate) : "");
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
      setError(err instanceof Error ? err.message : "Non è stato possibile salvare la richiesta. Riprova.");
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
      <Section title="Viaggiatore">
        <div style={row}>
          <div className="field" style={col(2, 220)}>
            <label>Nome e cognome *</label>
            <input name="traveler_name" defaultValue={d.traveler_name ?? ""} required />
          </div>
          <div className="field" style={col(1, 200)}>
            <label>Indirizzo email</label>
            <input name="traveler_email" type="email" defaultValue={d.traveler_email ?? ""} />
          </div>
        </div>
        <div style={row}>
          <div className="field" style={col()}>
            <label>Tipologia di missione *</label>
            <select name="traveler_type" value={type} onChange={(e) => setType(e.target.value as TravelerType)}>
              {Object.entries(TRAVELER_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={col()}>
            <label>Ruolo / incarico relativo al progetto su cui è caricata la missione</label>
            <input name="role_title" defaultValue={d.role_title ?? ""} placeholder="es. Project Manager" />
          </div>
          <div className="field" style={col()}>
            <label>Funzioni a cui farà riferimento (figura da organigramma e, se applicabile, nominativo)</label>
            <input name="reference_person" defaultValue={d.reference_person ?? ""} placeholder="posizione o nome" />
          </div>
        </div>
        <label className="checkbox-row">
          <input type="checkbox" name="public_employee" defaultChecked={d.public_employee ?? false} /> Dipendente pubblico
          (serve l'autorizzazione)
        </label>
      </Section>

      {(type === "employee" || type === "cococo") && (
        <Section title="Dati per la lettera di incarico">
          <p className="subtitle" style={{ margin: 0 }}>
            Servono per scrivere la lettera di incarico (facoltativi: quello che manca resta da completare nel Word).
          </p>
          <input type="hidden" name="letter_json" value={JSON.stringify(letter)} />
          <div style={row}>
            <div className="field" style={col(2, 200)}>
              <label>Nato/a a</label>
              <input value={letter.birth_place ?? ""} onChange={(e) => setLetter({ ...letter, birth_place: e.target.value })} />
            </div>
            <div className="field" style={col()}>
              <label>Il</label>
              <input type="date" value={letter.birth_date ?? ""} onChange={(e) => setLetter({ ...letter, birth_date: e.target.value })} />
            </div>
          </div>
          <div style={row}>
            <div className="field" style={col(2, 220)}>
              <label>Residente a (città e indirizzo)</label>
              <input value={letter.residence ?? ""} onChange={(e) => setLetter({ ...letter, residence: e.target.value })} />
            </div>
            <div className="field" style={col()}>
              <label>Codice fiscale</label>
              <input value={letter.tax_code ?? ""} onChange={(e) => setLetter({ ...letter, tax_code: e.target.value.toUpperCase() })} />
            </div>
          </div>
          {type === "cococo" && (
            <>
              <div style={row}>
                <div className="field" style={col()}>
                  <label>Profilo professionale (A-F, art. 3 Accordo Collettivo)</label>
                  <select value={letter.profile ?? ""} onChange={(e) => setLetter({ ...letter, profile: e.target.value })}>
                    <option value="">—</option>
                    {["A", "B", "C", "D", "E", "F"].map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field" style={col()}>
                  <label>Compenso giornaliero lordo (€)</label>
                  <MoneyInput value={letter.daily_fee ?? ""} onValueChange={(v: string) => setLetter({ ...letter, daily_fee: v })} />
                </div>
                <div className="field" style={col()}>
                  <label>Compenso aggiuntivo lordo (€)</label>
                  <MoneyInput value={letter.extra_fee ?? ""} onValueChange={(v: string) => setLetter({ ...letter, extra_fee: v })} />
                </div>
              </div>
              <label className="checkbox-row">
                <input type="checkbox" checked={letter.contract_fee ?? false} onChange={(e) => setLetter({ ...letter, contract_fee: e.target.checked })} /> Si applica
                anche il compenso giornaliero già previsto dal contratto in essere
              </label>
            </>
          )}
        </Section>
      )}

      <Section title="Missione">
        <div style={row}>
          <div className="field" style={col()}>
            <label>Dove *</label>
            <select name="scope" value={scope} onChange={(e) => setScope(e.target.value as TripScope)}>
              {Object.entries(SCOPE_LABEL).filter(([k]) => k !== "italy").map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={col(2, 220)}>
            <label>Destinazione (città, paese) *</label>
            <input name="destination" defaultValue={d.destination ?? ""} required placeholder="es. Beirut, Libano" />
          </div>
        </div>
        <div className="field">
          <label>Sede di lavoro</label>
          <input name="work_place" defaultValue={d.work_place ?? ""} placeholder="es. Beirut, Riserva della Biosfera di Jabal Moussa" />
        </div>
        <div style={row}>
          <div className="field" style={col()}>
            <label>Dal (inizio missione) *</label>
            <input name="start_date" type="date" defaultValue={d.start_date ?? ""} required />
          </div>
          <div className="field" style={col()}>
            <label>Al (fine missione) *</label>
            <input name="end_date" type="date" defaultValue={d.end_date ?? ""} required />
          </div>
        </div>
        <div className="field">
          <label>Mezzi di trasporto</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {TRANSPORT_OPTIONS.map(([k, label]) => (
              <label key={k} className="checkbox-row">
                <input type="checkbox" name="transport" value={k} defaultChecked={transport.includes(k)} /> {label}
              </label>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Progetto e termini di riferimento">
        <div className="field">
          <label>Titolo del progetto (nome completo; se i progetti sono più di uno, titoli e codici vanno nei Termini di Riferimento) *</label>
          <input name="project_title" defaultValue={d.project_title ?? ""} required />
        </div>
        <div style={row}>
          <div className="field" style={col()}>
            <label>Codice interno del progetto *</label>
            <input name="internal_code" value={mainCode} onChange={(e) => changeMainCode(e.target.value)} required />
          </div>
          <div className="field" style={col()}>
            <label>Finanziatore / codice attribuito dal donatore</label>
            <input name="donor_code" defaultValue={d.donor_code ?? ""} />
          </div>
        </div>
        <div className="field">
          <label>Termini di Riferimento della missione (attività, obiettivi e risultato finale) *</label>
          <textarea
            name="tdr"
            rows={14}
            style={area}
            defaultValue={d.tdr ?? ""}
            required
            placeholder={"Incolla qui il testo dei Termini di Riferimento, per esempio:\n\nAttività nell’ambito del progetto o dell’incarico:\n• ...\n• ...\n\nObiettivi e Risultato Finale nell’ambito del progetto o dell’incarico:\n• ...\n• ..."}
          />
          <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            Testo libero. Finisce nell'Addendum della lettera di incarico.
          </span>
        </div>
        <label className="checkbox-row">
          <input type="checkbox" name="minors" defaultChecked={d.minors ?? false} /> Le attività comportano contatti con minorenni
        </label>
      </Section>

      <Section title="Costi">
        <div style={row}>
          <div className="field" style={col()}>
            <label>Anticipo richiesto (€)</label>
            <MoneyInput name="advance_amount" defaultValue={d.advance_amount ?? ""} placeholder="nessuno" />
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
          Il compenso giornaliero previsto dal contratto è caricato sui progetti per questi giorni
        </label>
        <div className="field">
          <label>Alloggio e vitto</label>
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
        {lodging === "per_diem" && (
          <div className="field" style={{ maxWidth: 420 }}>
            <label>Per diem giornaliero lordo (€)</label>
            <MoneyInput name="per_diem_rate" value={rate} onValueChange={setRate} />
            <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Griglia Oikos per missioni fino a 3 settimane (lordo, {type === "cococo" ? "collaboratori" : "dipendenti"}):{" "}
              {PER_DIEM_GRID.map((g) => `${g.label} ${(type === "cococo" ? g.cococo : g.employee).toLocaleString("it-IT", { minimumFractionDigits: 2 })}`).join(" · ")}. Oltre le 3
              settimane serve un accordo con la Direzione.
            </span>
          </div>
        )}
      </Section>

      <Section title="Voli, visti, assicurazione, prenotazioni (Logistica)">
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
          Biglietto aereo da acquistare a cura di Oikos
        </label>
        {flights && (
          <div className="field">
            <label>Tratta e date preferite</label>
            <input name="flights_route" defaultValue={d.flights_route ?? ""} placeholder="es. Milano – Beirut, 05/07 → 15/07" />
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
          Visto necessario
        </label>
        <div className="field" style={{ maxWidth: 420 }}>
          <label>Assicurazione {scope === "extra_eu" ? "(extra UE: polizze a carico di Oikos)" : ""}</label>
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
          La Logistica deve prenotare anche treno / albergo / altro
        </label>
        <div className="field">
          <label>Cosa deve prenotare la Logistica (treno, albergo, preferenze)</label>
          <textarea name="tickets_note" rows={2} style={area} defaultValue={d.tickets_note ?? ""} />
        </div>
      </Section>

      <Section title="Costi da caricare sui progetti">
        {types.length === 0 ? (
          <p className="subtitle" style={{ margin: 0 }}>
            Nessun costo da caricare: scegli compenso, per diem, voli, visto, assicurazione o prenotazioni qui sopra e compaiono le righe.
          </p>
        ) : (
          <>
            <p className="subtitle" style={{ margin: 0 }}>
              Per ogni costo indica il progetto (codice o nome completo) e la budget line su cui verrà caricato. Se i progetti sono più di uno, aggiungi una riga per ciascuno.
            </p>
            {types.map((c) => {
              return (
                <div key={c.key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <b style={{ fontSize: "0.9rem" }}>{COST_LABEL[c.key]}</b>
                  {shown.map((a, i) =>
                    a.cost_type !== c.key ? null : (
                      <div key={i} style={{ ...row, alignItems: "flex-end" }}>
                        <div className="field" style={col(2, 150)}>
                          <label>Codice progetto *</label>
                          <input name={`alloc_${i}_code`} value={a.project_code} onChange={(e) => patch(i, { project_code: e.target.value })} />
                        </div>
                        <div className="field" style={col(1, 110)}>
                          <label>Budget line *</label>
                          <input name={`alloc_${i}_bl`} value={a.budget_line} onChange={(e) => patch(i, { budget_line: e.target.value })} />
                        </div>
                        <button type="button" className="ghost danger" onClick={() => removeRow(i)} title="Togli la riga">
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
                      + Aggiungi un progetto
                    </button>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </Section>

      <Section title="Altre note">
        <div className="field">
          <label>Note</label>
          <textarea name="notes" rows={2} style={area} defaultValue={d.notes ?? ""} />
        </div>
      </Section>

      {superiors && (
        <Section title="Approvazione">
          <p className="subtitle" style={{ margin: 0 }}>
            La scheda va al responsabile di Area o Programme Manager, che la approva. Poi la Logistica viene informata se c'è qualcosa da prenotare. Dopo l'approvazione si scarica la lettera di incarico.
          </p>
          <div className="field" style={{ maxWidth: 420 }}>
            <label>Responsabile di Area o Programme Manager che approva *</label>
            <select name="approver_PM" required defaultValue="">
              <option value="" disabled>
                Scegli…
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
        {busy ? "Salvataggio…" : submitLabel}
      </button>
    </form>
  );
}
