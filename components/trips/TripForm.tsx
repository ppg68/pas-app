"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TripSaveResult } from "@/app/(dashboard)/trips/actions";
import MoneyInput from "@/components/MoneyInput";
import {
  COST_LABEL,
  MISSION_KINDS,
  PER_DIEM_GRID,
  tripDays,
  type Allocation,
  type CompensationKind,
  type CostType,
  type InsuranceMode,
  type LodgingMode,
  type TripRow,
  type TripScope,
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

/** The mission kind of an existing request (volunteers and others had no place in the sheet: partner). */
function kindOf(d: Partial<TripRow>): string {
  if (!d.traveler_type) return "";
  if (d.traveler_type === "employee" || d.traveler_type === "cococo") return `${d.traveler_type}_${d.scope === "extra_eu" ? "extra_eu" : "eu"}`;
  return "partner";
}

/** Scheda di attivazione missioni (PR09_1.5 AA14): same order and wording as the Word form. */
export default function TripForm({
  action,
  defaults,
  superiors,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<TripSaveResult | void>;
  defaults?: Partial<TripRow>;
  /** approver picker, only when creating */
  superiors?: Holder[];
  submitLabel: string;
}) {
  const d = defaults ?? {};
  const [kind, setKind] = useState<string>(kindOf(d));
  const [partnerScope, setPartnerScope] = useState<TripScope>(d.scope === "extra_eu" ? "extra_eu" : "eu");
  const [start, setStart] = useState(d.start_date ?? "");
  const [end, setEnd] = useState(d.end_date ?? "");
  const [comp, setComp] = useState<CompensationKind | "">(d.compensation_kind ?? (d.compensation_charged ? "contract" : ""));
  const [lodging, setLodging] = useState<LodgingMode>(d.lodging_mode ?? "per_diem");
  const [rate, setRate] = useState<string>(d.per_diem_rate != null ? String(d.per_diem_rate) : "");
  const [flights, setFlights] = useState(d.flights_needed ?? false);
  const [visa, setVisa] = useState(d.visa_needed ?? false);
  const [hotel, setHotel] = useState(d.hotel_needed ?? false);
  const [mainCode, setMainCode] = useState(d.internal_code ?? "");
  const [alloc, setAlloc] = useState<AllocRow[]>(() => (d.allocations ?? []).map(fromAlloc));
  const mk = MISSION_KINDS.find((m) => m.key === kind);
  const scope: TripScope = mk?.scope ?? partnerScope;
  const travelerType = mk?.traveler_type ?? "employee";
  const [insurance, setInsurance] = useState<InsuranceMode>(d.insurance ?? (d.scope === "extra_eu" ? "oikos" : "none"));
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const perDiem = lodging === "per_diem" || lodging === "free_lodging";
  const days = start && end && end >= start ? tripDays(start, end) : null;
  const rateNum = parseFloat(rate);

  // the costs that exist for this mission, from the choices made above
  const applicable = new Set<CostType>([
    ...(comp ? (["compensation"] as CostType[]) : []),
    ...(perDiem ? (["per_diem"] as CostType[]) : []),
    ...(flights ? (["flight"] as CostType[]) : []),
    ...(visa ? (["visa"] as CostType[]) : []),
    ...(insurance === "oikos" ? (["insurance"] as CostType[]) : []),
    ...(hotel ? (["bookings"] as CostType[]) : []),
  ]);
  const shown = alloc.filter((a) => applicable.has(a.cost_type));

  const newRow = (cost: CostType): AllocRow => ({ cost_type: cost, project_code: mainCode, budget_line: "" });
  const seed = (cost: CostType) => setAlloc((a) => (a.some((x) => x.cost_type === cost) ? a : [...a, newRow(cost)]));

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

  function changeKind(v: string) {
    setKind(v);
    const m = MISSION_KINDS.find((x) => x.key === v);
    const sc = m?.scope ?? partnerScope;
    // by procedure: EU = European health card, extra EU = Oikos policies
    const ins: InsuranceMode = sc === "extra_eu" ? "oikos" : "none";
    setInsurance(ins);
    if (ins === "oikos") seed("insurance");
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget;
    form.querySelectorAll(".field.invalid").forEach((el) => el.classList.remove("invalid"));
    setError(null);
    setBusy(true);
    try {
      const res = await action(new FormData(form));
      if (res && res.redirectTo) {
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

  const allocBlock = (c: CostType, note?: string) =>
    applicable.has(c) ? (
      <div key={c} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <b style={{ fontSize: "0.9rem" }}>{note ?? COST_LABEL[c]}: progetto e budget line</b>
        {shown.map((a, i) =>
          a.cost_type !== c ? null : (
            <div key={i} style={{ ...row, alignItems: "flex-end" }}>
              <div className="field" style={col(2, 150)}>
                <label>Progetto (nome completo o codice) *</label>
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
          <input type="hidden" name={`alloc_add_${c}`} />
          <button type="button" className="ghost" onClick={() => setAlloc((a) => [...a, newRow(c)])}>
            + Aggiungi un progetto
          </button>
        </div>
      </div>
    ) : null;

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      onInput={(e) => (e.target as HTMLElement).closest(".field")?.classList.remove("invalid")}
      className="card"
      style={{ display: "flex", flexDirection: "column", gap: 14 }}
    >
      {error && <div className="banner error">{error}</div>}
      <input type="hidden" name="form" value="abroad" />
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="traveler_type" value={travelerType} />
      <input type="hidden" name="allocations_json" value={JSON.stringify(shown)} />
      <p className="subtitle" style={{ margin: 0 }}>
        Scheda di attivazione missioni (PR09_1.5 AA14). Dopo l&apos;approvazione l&apos;amministrazione del personale prepara la lettera di incarico.
      </p>

      <Section title="Chi parte">
        <div style={row}>
          <div className="field" style={col(2, 220)}>
            <label>Nome e cognome *</label>
            <input name="traveler_name" defaultValue={d.traveler_name ?? ""} required />
          </div>
          <div className="field" style={col(1, 200)}>
            <label>Indirizzo mail</label>
            <input name="traveler_email" type="email" defaultValue={d.traveler_email ?? ""} />
          </div>
        </div>
        <label className="checkbox-row">
          <input type="checkbox" name="public_employee" defaultChecked={d.public_employee ?? false} /> Dipendente pubblico (serve l&apos;autorizzazione)
        </label>
      </Section>

      <Section title="Durata e tipologia della missione">
        <div style={row}>
          <div className="field" style={col()}>
            <label>Data di inizio *</label>
            <input name="start_date" type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
          </div>
          <div className="field" style={col()}>
            <label>Fine missione *</label>
            <input name="end_date" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} required />
          </div>
        </div>
        <div className="field">
          <label>Tipologia missione (scegli il contratto) *</label>
          <select value={kind} onChange={(e) => changeKind(e.target.value)} required>
            <option value="" disabled>
              Scegli…
            </option>
            {MISSION_KINDS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        {kind === "partner" && (
          <div className="field" style={{ maxWidth: 260 }}>
            <label>Dove</label>
            <select value={partnerScope} onChange={(e) => setPartnerScope(e.target.value as TripScope)}>
              <option value="eu">Missione in Europa (UE, Svizzera...)</option>
              <option value="extra_eu">Missione extra UE</option>
            </select>
          </div>
        )}
        <div style={row}>
          <div className="field" style={col(2, 220)}>
            <label>Paese di destinazione (città, paese) *</label>
            <input name="destination" defaultValue={d.destination ?? ""} required placeholder="es. Beirut, Libano" />
          </div>
          <div className="field" style={col(2, 220)}>
            <label>Sede di lavoro</label>
            <input name="work_place" defaultValue={d.work_place ?? ""} placeholder="città o luogo di lavoro" />
          </div>
        </div>
        <div style={row}>
          <div className="field" style={col()}>
            <label>Ruolo (incarico relativo al progetto su cui è caricata la missione)</label>
            <input name="role_title" defaultValue={d.role_title ?? ""} placeholder="es. Project Manager" />
          </div>
          <div className="field" style={col()}>
            <label>Funzioni a cui farà riferimento (figura professionale da organigramma e, se applicabile, nominativo)</label>
            <input name="reference_person" defaultValue={d.reference_person ?? ""} placeholder="posizione o nome" />
          </div>
        </div>
      </Section>

      <Section title="Titolo e codice progetto (solo quando è un unico progetto)">
        <div className="field">
          <label>Progetto</label>
          <input name="project_title" defaultValue={d.project_title ?? ""} />
        </div>
        <div style={row}>
          <div className="field" style={col()}>
            <label>Codice interno progetto</label>
            <input name="internal_code" value={mainCode} onChange={(e) => changeMainCode(e.target.value)} />
          </div>
          <div className="field" style={col()}>
            <label>Finanziatore / codice attribuito dal donatore</label>
            <input name="donor_code" defaultValue={d.donor_code ?? ""} />
          </div>
        </div>
        <label className="checkbox-row">
          <input type="checkbox" name="minors" defaultChecked={d.minors ?? false} /> Le attività comportano contatti con minorenni
        </label>
      </Section>

      <Section title="Compenso e anticipo">
        <div className="field">
          <label>Importo compenso e progetto di scarico del costo</label>
          <select
            name="compensation_kind"
            value={comp}
            onChange={(e) => {
              const v = e.target.value as CompensationKind | "";
              setComp(v);
              if (v) seed("compensation");
            }}
          >
            <option value="">Nessun compenso caricato sul progetto</option>
            <option value="gross">1) Compenso lordo o aziendale</option>
            <option value="contract">2) Compenso giornaliero come da contratto in essere</option>
          </select>
        </div>
        {allocBlock("compensation", "Compenso")}
        <div className="field" style={{ maxWidth: 260 }}>
          <label>Anticipo (indicare importo, €)</label>
          <MoneyInput name="advance_amount" defaultValue={d.advance_amount ?? ""} placeholder="nessuno" />
        </div>
      </Section>

      <Section title="Alloggio, vitto e per diem">
        <div className="field">
          <label>Alloggio e vitto</label>
          <select
            name="lodging_mode"
            value={lodging}
            onChange={(e) => {
              const v = e.target.value as LodgingMode;
              setLodging(v);
              if (v === "per_diem" || v === "free_lodging") seed("per_diem");
            }}
          >
            <option value="per_diem">Per diem (come da griglia qui sotto)</option>
            <option value="receipts">Rimborso piè di lista, in tal caso il collaboratore non percepirà per diem</option>
            <option value="free_lodging">Alloggio gratuito presso struttura Oikos (in tal caso il per diem sarà riproporzionato)</option>
            <option value="self">A carico del collaboratore</option>
          </select>
        </div>
        {perDiem && (
          <>
            <div className="field">
              <label>Per diem: griglie Oikos da applicare a missioni di massimo 3 settimane (costo aziendale)</label>
              <select
                value={PER_DIEM_GRID.findIndex((g) => g.company === rateNum) >= 0 ? String(PER_DIEM_GRID.findIndex((g) => g.company === rateNum)) : ""}
                onChange={(e) => {
                  if (e.target.value !== "") setRate(String(PER_DIEM_GRID[Number(e.target.value)].company));
                }}
              >
                <option value="">Altro importo (scrivilo qui sotto)</option>
                {PER_DIEM_GRID.map((g, i) => (
                  <option key={i} value={i}>
                    pari a circa Euro {g.company.toLocaleString("it-IT", { minimumFractionDigits: 2 })} di costo aziendale - {g.label}
                  </option>
                ))}
              </select>
              <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                In caso di missioni superiori alle 3 settimane è necessario accordo con la direzione. (*) Il per diem viene ridotto ai valori EU se inferiori.
                È comunque possibile procedere con il rimborso a piè di lista qualora si ritenga opportuno.
              </span>
            </div>
            <div className="field" style={{ maxWidth: 300 }}>
              <label>Per diem giornaliero, costo aziendale (€)</label>
              <MoneyInput name="per_diem_rate" value={rate} onValueChange={setRate} />
              {days && Number.isFinite(rateNum) && (
                <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  {days} {days === 1 ? "giorno" : "giorni"} × {rateNum.toLocaleString("it-IT", { minimumFractionDigits: 2 })} ={" "}
                  {(days * rateNum).toLocaleString("it-IT", { minimumFractionDigits: 2 })} €
                </span>
              )}
            </div>
            {allocBlock("per_diem", "Per diem")}
          </>
        )}
      </Section>

      <Section title="Voli e visti">
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
        {allocBlock("flight", "Volo")}
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
        {allocBlock("visa", "Visto")}
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
          La Logistica deve prenotare anche treno / albergo / altro (compresa la fornitura di attrezzatura)
        </label>
        {hotel && (
          <div className="field">
            <label>Cosa deve prenotare la Logistica (treno, albergo, preferenze)</label>
            <textarea name="tickets_note" rows={2} style={area} defaultValue={d.tickets_note ?? ""} />
          </div>
        )}
        {allocBlock("bookings", "Prenotazioni")}
      </Section>

      <Section title="Assicurazione">
        <div className="field" style={{ maxWidth: 520 }}>
          <label>Assicurazione</label>
          <select
            name="insurance"
            value={insurance}
            onChange={(e) => {
              const v = e.target.value as InsuranceMode;
              setInsurance(v);
              if (v === "oikos") seed("insurance");
            }}
          >
            <option value="none">Come da procedure: tessera europea di assicurazione malattia (nessuna copertura aggiuntiva)</option>
            <option value="oikos">Come da procedure: polizze Oikos (missioni extra UE)</option>
            <option value="self">Da indicare: altra copertura (scrivila nelle note)</option>
          </select>
        </div>
        {allocBlock("insurance", "Assicurazione")}
      </Section>

      <Section title="Altre note">
        <div className="field">
          <textarea name="notes" rows={2} style={area} defaultValue={d.notes ?? ""} />
        </div>
      </Section>

      <Section title="Termini di Riferimento">
        <div className="field">
          <label>Titolo progetto/i - donatore - codice interno progetto; incarico; attività; obiettivi e risultato finale *</label>
          <textarea
            name="tdr"
            rows={14}
            style={area}
            defaultValue={d.tdr ?? ""}
            required
            placeholder={"Titolo progetto/i - donatore - codice interno progetto\nIncarico\n\nAttività nell’ambito del progetto o dell’incarico:\n• ...\n\nObiettivi e Risultato Finale nell’ambito del progetto o dell’incarico:\n• ..."}
          />
          <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>Testo libero. Finisce nell&apos;Addendum della lettera di incarico.</span>
        </div>
      </Section>

      {superiors && (
        <Section title="Approvazione">
          <p className="subtitle" style={{ margin: 0 }}>
            La scheda va al Responsabile di Area o Programme Manager, che la approva. Poi la Logistica e l&apos;amministrazione del personale sono informate per email.
          </p>
          <div className="field" style={{ maxWidth: 420 }}>
            <label>Responsabile di Area o Programme Manager per approvazione *</label>
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
