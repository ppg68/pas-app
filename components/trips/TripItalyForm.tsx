"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TripSaveResult } from "@/app/(dashboard)/trips/actions";
import MoneyInput from "@/components/MoneyInput";
import {
  COST_LABEL,
  ITALY_TRANSPORT_KEYS,
  REIMB_LABEL,
  TRANSPORT_OPTIONS,
  type Allocation,
  type CostType,
  type ReimbKind,
  type TripRow,
} from "@/lib/domain/trips";
import type { Holder } from "@/components/trips/TripForm";

type AllocRow = { cost_type: CostType; project_code: string; budget_line: string };
type Mode = "none" | "per_diem" | "receipts";

const row: React.CSSProperties = { display: "flex", gap: 12, flexWrap: "wrap" };
const col = (flex = 1, min = 160): React.CSSProperties => ({ flex, minWidth: min });

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h2 style={{ fontSize: "1rem", marginTop: 8, borderBottom: "1px solid var(--line)", paddingBottom: 4 }}>{title}</h2>
      {children}
    </div>
  );
}

const fromAlloc = (a: Allocation): AllocRow => ({ cost_type: a.cost_type, project_code: a.project_code, budget_line: a.budget_line });

/** Trip in Italy: online version of PR09_1.6_AA09 "Autorizzazione trasferta singola". */
export default function TripItalyForm({
  action,
  defaults,
  superiors,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<TripSaveResult | void>;
  defaults?: Partial<TripRow>;
  /** the person who authorizes, only when creating */
  superiors?: Holder[];
  submitLabel: string;
}) {
  const d = defaults ?? {};
  const router = useRouter();
  const [start, setStart] = useState(d.start_date ?? "");
  const [end, setEnd] = useState(d.end_date && d.end_date !== d.start_date ? d.end_date : "");
  const [mode, setMode] = useState<Mode>(d.lodging_mode === "per_diem" ? "per_diem" : d.lodging_mode === "receipts" ? "receipts" : "none");
  const [rate, setRate] = useState<string>(d.per_diem_rate != null ? String(d.per_diem_rate) : "");
  const [compensation, setCompensation] = useState(d.compensation_charged ?? false);
  const [hotel, setHotel] = useState(d.hotel_needed ?? false);
  const [alloc, setAlloc] = useState<AllocRow[]>(() => (d.allocations ?? []).map(fromAlloc));
  const transport = d.transport ?? [];
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const applicable = new Set<CostType>([
    ...(compensation ? (["compensation"] as CostType[]) : []),
    ...(mode === "per_diem" ? (["per_diem"] as CostType[]) : []),
    ...(hotel ? (["bookings"] as CostType[]) : []),
  ]);
  const shown = alloc.filter((a) => applicable.has(a.cost_type));
  const types = (["compensation", "per_diem", "bookings"] as CostType[]).filter((c) => applicable.has(c));

  const newRow = (cost: CostType): AllocRow => ({ cost_type: cost, project_code: "", budget_line: "" });
  const seed = (cost: CostType) => setAlloc((a) => (a.some((x) => x.cost_type === cost) ? a : [...a, newRow(cost)]));
  const patch = (i: number, p: Partial<AllocRow>) => {
    const target = shown[i];
    setAlloc((a) => a.map((x) => (x === target ? { ...x, ...p } : x)));
  };
  const removeRow = (i: number) => {
    const target = shown[i];
    setAlloc((a) => a.filter((x) => x !== target));
  };

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

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      onInput={(e) => (e.target as HTMLElement).closest(".field")?.classList.remove("invalid")}
      className="card"
      style={{ display: "flex", flexDirection: "column", gap: 14 }}
    >
      {error && <div className="banner error">{error}</div>}
      <input type="hidden" name="form" value="italy" />
      <input type="hidden" name="allocations_json" value={JSON.stringify(shown)} />

      <Section title="Chi viaggia">
        <div style={row}>
          <div className="field" style={col(2, 220)}>
            <label>Nome e cognome di chi viaggia *</label>
            <input name="traveler_name" defaultValue={d.traveler_name ?? ""} required />
          </div>
          <div className="field" style={col(1, 200)}>
            <label>Indirizzo email</label>
            <input name="traveler_email" type="email" defaultValue={d.traveler_email ?? ""} />
          </div>
        </div>
        <div className="field">
          <label>Ruolo</label>
          <input name="role_title" defaultValue={d.role_title ?? ""} />
        </div>
      </Section>

      <Section title="La trasferta">
        <div className="field">
          <label>Luogo (città, o città e paese per Svizzera/Europa) *</label>
          <input name="destination" defaultValue={d.destination ?? ""} required placeholder="es. Roma" />
        </div>
        <div style={row}>
          <div className="field" style={col()}>
            <label>Il giorno, oppure dal *</label>
            <input name="start_date" type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
          </div>
          <div className="field" style={col()}>
            <label>Al (vuoto se è un solo giorno)</label>
            <input name="end_date" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Motivi della trasferta *</label>
          <textarea name="tdr" rows={4} style={{ resize: "vertical" }} defaultValue={d.tdr ?? ""} required />
        </div>
        <div className="field">
          <label>Utilizzando</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {TRANSPORT_OPTIONS.filter(([k]) => ITALY_TRANSPORT_KEYS.includes(k)).map(([k, label]) => (
              <label key={k} className="checkbox-row">
                <input type="checkbox" name="transport" value={k} defaultChecked={transport.includes(k)} /> {label}
              </label>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Costi">
        <div className="field" style={{ maxWidth: 260 }}>
          <label>Anticipo richiesto (€)</label>
          <MoneyInput name="advance_amount" defaultValue={d.advance_amount ?? ""} placeholder="nessuno" />
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
          Il normale compenso contrattuale è caricato su un progetto
        </label>
        <div className="field">
          <label>Vitto e alloggio</label>
          <select
            name="lodging_mode"
            value={mode}
            onChange={(e) => {
              const v = e.target.value as Mode;
              setMode(v);
              if (v === "per_diem") seed("per_diem");
            }}
          >
            <option value="none">Nessuna indennità e nessun rimborso</option>
            <option value="per_diem">Indennità di trasferta (Per Diem)</option>
            <option value="receipts">Rimborso delle spese</option>
          </select>
        </div>
        {mode === "per_diem" && (
          <div className="field" style={{ maxWidth: 260 }}>
            <label>Per Diem (€ al giorno) *</label>
            <MoneyInput name="per_diem_rate" defaultValue={rate} onValueChange={setRate} />
          </div>
        )}
        {mode === "receipts" && (
          <div className="field">
            <label>Quale rimborso *</label>
            <select name="reimb_kind" defaultValue={d.reimb_kind ?? ""} required>
              <option value="" disabled>
                Scegli…
              </option>
              {(Object.keys(REIMB_LABEL) as ReimbKind[]).map((k) => (
                <option key={k} value={k}>
                  {REIMB_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
        )}
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
          Acquisto del biglietto aereo/treno o dell&apos;albergo da parte di Istituto Oikos E.T.S.
        </label>
        {hotel && (
          <div className="field">
            <label>Cosa deve prenotare la Logistica (tratta, date, preferenze)</label>
            <textarea name="tickets_note" rows={2} style={{ resize: "vertical" }} defaultValue={d.tickets_note ?? ""} />
          </div>
        )}
      </Section>

      {types.length > 0 && (
        <Section title="Costi da caricare sui progetti">
          <p className="subtitle" style={{ margin: 0 }}>
            Per ogni costo indica il progetto e la budget line su cui verrà caricato. Se i progetti sono più di uno, aggiungi una riga per ciascuno.
          </p>
          {types.map((c) => (
            <div key={c} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <b style={{ fontSize: "0.9rem" }}>{COST_LABEL[c]}</b>
              {shown.map((a, i) =>
                a.cost_type !== c ? null : (
                  <div key={i} style={{ ...row, alignItems: "flex-end" }}>
                    <div className="field" style={col(2, 150)}>
                      <label>Progetto n° *</label>
                      <input name={`alloc_${i}_code`} value={a.project_code} onChange={(e) => patch(i, { project_code: e.target.value })} />
                    </div>
                    <div className="field" style={col(1, 110)}>
                      <label>Budget line n° *</label>
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
          ))}
        </Section>
      )}

      <Section title="Rimborso">
        <p className="subtitle" style={{ margin: 0 }}>
          Ai fini del rimborso, il/la richiedente si impegna a produrre una Nota Spese corredata da titoli di viaggio, fatture/ricevute per vitto e alloggio, ricevute taxi e parcheggio, spese di autostrada, riepilogo del viaggio effettuato con mezzo proprio.
        </p>
        <div className="field">
          <label>Altre note</label>
          <textarea name="notes" rows={2} style={{ resize: "vertical" }} defaultValue={d.notes ?? ""} />
        </div>
      </Section>

      {superiors && (
        <Section title="Autorizzazione">
          <p className="subtitle" style={{ margin: 0 }}>
            La richiesta va a chi autorizza la trasferta (il Direttore o il Responsabile di Area).
          </p>
          <div className="field" style={{ maxWidth: 420 }}>
            <label>Chi autorizza *</label>
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
