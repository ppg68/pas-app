"use client";

import { FUELS, aciPrice, fuelKey, type FuelPriceRow } from "@/lib/domain/fuelPrices";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { EXPENSE_ACCEPT, EXPENSE_BUCKET, EXPENSE_MAX_BYTES, uploadExpenseFile } from "@/lib/expenseUpload";
import {
  SECTIONS,
  lineAmountEur,
  MIN_EXPENSE_DATE,
  money,
  round2,
  type ExpenseFileRow,
  type ExpenseLineRow,
  type ExpenseSaveResult,
  type ExpenseReportRow,
  type ExpenseSection,
  type LineInput,
} from "@/lib/domain/expenses";

export type Holder = { id: string; full_name: string; email: string | null };
export type TripOption = {
  id: string;
  number: string;
  traveler_name: string;
  destination: string;
  start_date: string;
  end_date: string;
  project_title: string | null;
  internal_code: string | null;
  donor_code: string | null;
};

const row: React.CSSProperties = { display: "flex", gap: 12, flexWrap: "wrap" };
const col = (flex = 1, min = 160): React.CSSProperties => ({ flex, minWidth: min });
const cell: React.CSSProperties = { padding: "3px 4px", verticalAlign: "top" };
const inp: React.CSSProperties = { width: "100%", minWidth: 0 };

/** A row of the form: the typed values plus its receipt (a file chosen now, or the one already saved). */
type Row = LineInput & { key: string; line_id?: string; file: File | null; existing: ExpenseFileRow | null };

const emptyLine = (section: ExpenseSection): Row => ({
  key: crypto.randomUUID(),
  file: null,
  existing: null,
  section,
  line_date: "",
  budget_line: "",
  location: "",
  motive: "",
  km: "",
  fuel_price: "",
  currency: "EUR",
  amount_orig: "",
  exchange_rate: "",
});

function fromRow(l: ExpenseLineRow, files: ExpenseFileRow[]): Row {
  const s = (n: number | null) => (n == null ? "" : String(n));
  return {
    key: l.id,
    line_id: l.id,
    file: null,
    existing: files.find((f) => f.line_id === l.id) ?? null,
    section: l.section,
    line_date: l.line_date ?? "",
    budget_line: l.budget_line ?? "",
    location: l.location ?? "",
    motive: l.motive ?? "",
    km: s(l.km),
    fuel_price: s(l.fuel_price),
    currency: l.currency || "EUR",
    amount_orig: s(l.amount_orig),
    exchange_rate: s(l.exchange_rate),
  };
}

export default function ExpenseForm({
  action,
  defaults,
  defaultLines,
  defaultFiles,
  trips,
  fuelPrices = [],
  workerName,
  pms,
  racs,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<ExpenseSaveResult>;
  defaults?: Partial<ExpenseReportRow>;
  defaultLines?: ExpenseLineRow[];
  defaultFiles?: ExpenseFileRow[];
  trips?: TripOption[];
  fuelPrices?: FuelPriceRow[];
  workerName?: string;
  /** approver pickers, only when creating */
  pms?: Holder[];
  racs?: Holder[];
  submitLabel: string;
}) {
  const d = defaults ?? {};
  const [worker, setWorker] = useState(d.worker_name ?? workerName ?? "");
  const [subject, setSubject] = useState(d.subject ?? "");
  const [donor, setDonor] = useState(d.donor_code ?? "");
  const [internal, setInternal] = useState(d.internal_code ?? "");
  const [tripId, setTripId] = useState(d.trip_id ?? "");
  const [lines, setLines] = useState<Row[]>(() => (defaultLines ?? []).map((l) => fromRow(l, defaultFiles ?? [])));
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fuel, setFuel] = useState(() => fuelKey(d.fuel) ?? "");
  const fk = fuelKey(fuel);

  // the ACI price follows the travel date and the fuel, unless the person typed a different one
  function changeFuel(next: string) {
    const nk = fuelKey(next);
    setFuel(next);
    setLines((ls) =>
      ls.map((l) =>
        l.section === "km" && (!l.fuel_price || l.fuel_price === aciPrice(fuelPrices, l.line_date, fk))
          ? { ...l, fuel_price: aciPrice(fuelPrices, l.line_date, nk) }
          : l
      )
    );
  }
  function changeKmDate(i: number, date: string) {
    setLines((ls) =>
      ls.map((l, k) =>
        k === i
          ? {
              ...l,
              line_date: date,
              fuel_price: !l.fuel_price || l.fuel_price === aciPrice(fuelPrices, l.line_date, fk) ? aciPrice(fuelPrices, date, fk) : l.fuel_price,
            }
          : l
      )
    );
  }

  function pickTrip(id: string) {
    setTripId(id);
    const t = (trips ?? []).find((x) => x.id === id);
    if (!t) return;
    setWorker(t.traveler_name);
    if (!subject) setSubject(`Trip ${t.number}: ${t.destination}`);
    if (!internal && t.internal_code) setInternal(t.internal_code);
    if (!donor && t.donor_code) setDonor(t.donor_code);
  }

  const patch = (i: number, p: Partial<LineInput>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...p } : l)));
  const remove = (i: number) => setLines((ls) => ls.filter((_, k) => k !== i));
  const total = round2(lines.reduce((s, l) => s + lineAmountEur(l), 0));
  const patchRow = (i: number, p: Partial<Row>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...p } : l)));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    // every row but the mileage ones needs its receipt
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (l.section !== "km" && !l.file && !l.existing) {
        setError(`Row ${i + 1}: attach the receipt (mileage rows need none).`);
        return;
      }
      if (l.file && l.file.size > EXPENSE_MAX_BYTES) {
        setError(`Row ${i + 1}: ${l.file.name} is larger than 20 MB.`);
        return;
      }
    }
    setBusy(true);
    try {
      const res = await action(new FormData(e.currentTarget));
      if (res.error || !res.id || !res.lineIds) {
        setError(res.error ?? "Could not save the report.");
        setBusy(false);
        return;
      }
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      // receipts replaced or belonging to removed rows
      const keepIds = new Set(lines.filter((l) => l.existing).map((l) => l.existing!.id));
      const drop = (defaultFiles ?? []).filter((f) => f.line_id && !keepIds.has(f.id));
      const problems: string[] = [];
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (!l.file) continue;
        const msg = await uploadExpenseFile(supabase, res.id, res.lineIds[i], l.budget_line, l.file, user?.id);
        if (msg) problems.push(`Row ${i + 1}: ${msg}`);
        else {
          const old = l.existing;
          if (old && !drop.some((f) => f.id === old.id)) drop.push(old);
        }
      }
      for (const f of drop) {
        const { error: dErr } = await supabase.from("expense_files").delete().eq("id", f.id);
        if (!dErr) await supabase.storage.from(EXPENSE_BUCKET).remove([f.storage_path]);
      }
      if (problems.length > 0) {
        // the report is saved: the missing receipts can be added from the report page
        window.alert(`The report was saved, but some receipts could not be uploaded:\n${problems.join("\n")}\nAttach them again with Edit report.`);
      }
      router.push(defaultLines ? `/expenses/${res.id}` : `/expenses/${res.id}?new=1`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the report.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <input type="hidden" name="lines_json" value={JSON.stringify(lines.map(({ key: _k, file: _f, existing: _e, ...rest }) => rest))} />
      <input type="hidden" name="trip_id" value={tripId} />

      <h2 style={{ fontSize: "1rem", borderBottom: "1px solid var(--line)", paddingBottom: 4 }}>Report</h2>
      {trips && trips.length > 0 && (
        <div className="field">
          <label>Related trip (optional: fills in the data below)</label>
          <select value={tripId} onChange={(e) => pickTrip(e.target.value)}>
            <option value="">— none —</option>
            {trips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.number} · {t.traveler_name} · {t.destination} ({t.start_date})
              </option>
            ))}
          </select>
        </div>
      )}
      <div style={row}>
        <div className="field" style={col(1, 220)}>
          <label>Surname and name of the worker *</label>
          <input name="worker_name" value={worker} onChange={(e) => setWorker(e.target.value)} required />
        </div>
        <div className="field" style={col(2, 220)}>
          <label>Object of the expenses *</label>
          <input name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />
        </div>
      </div>
      <div style={row}>
        <div className="field" style={col()}>
          <label>Official donor project code</label>
          <input name="donor_code" value={donor} onChange={(e) => setDonor(e.target.value)} />
        </div>
        <div className="field" style={col()}>
          <label>Internal project code *</label>
          <input name="internal_code" value={internal} onChange={(e) => setInternal(e.target.value)} required />
        </div>
      </div>

      {SECTIONS.map((sec) => {
        const idx = lines.map((l, i) => [l, i] as const).filter(([l]) => l.section === sec.key);
        const sub = round2(idx.reduce((s, [l]) => s + lineAmountEur(l), 0));
        const isKm = sec.key === "km";
        return (
          <div key={sec.key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h2 style={{ fontSize: "1rem", marginTop: 8, borderBottom: "1px solid var(--line)", paddingBottom: 4 }}>
              {sec.title}
              {sec.account && <span style={{ float: "right", fontWeight: 400, color: "var(--ink-soft)" }}>{sec.account}</span>}
            </h2>
            {isKm && (
              <div style={row}>
                <div className="field" style={col()}>
                  <label>Make and model of the car</label>
                  <input name="car_model" defaultValue={d.car_model ?? ""} />
                </div>
                <div className="field" style={col()}>
                  <label>Fuel used</label>
                  <select name="fuel" value={fuel} onChange={(e) => changeFuel(e.target.value)}>
                    <option value="">— choose —</option>
                    {FUELS.map((x) => (
                      <option key={x.key} value={x.key}>
                        {x.label}
                      </option>
                    ))}
                    {fuel && !fk && <option value={fuel}>{fuel}</option>}
                  </select>
                </div>
              </div>
            )}
            <p className="subtitle" style={{ margin: 0 }}>
              {sec.hint}.{" "}
              {isKm
                ? "The ACI cost per litre is the national average price of the week of the travel date, for the fuel used: it is filled in automatically once you choose the fuel and the date."
                : "For another currency enter the InforEuro rate: foreign units per 1 EUR."}
            </p>
            {isKm && (
              <details style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>
                <summary style={{ cursor: "pointer" }}>If the price is empty or you want to check it on the ACI site</summary>
                <ol style={{ margin: "6px 0 0 18px", padding: 0 }}>
                  <li>
                    Open{" "}
                    <a href="https://www.aci.it/i-servizi/servizi-online/costi-chilometrici.html" target="_blank" rel="noreferrer">
                      ACI - Costi chilometrici
                    </a>{" "}
                    (go to the service; register and log in if asked).
                  </li>
                  <li>Open &quot;Prezzo carburanti&quot; and the PDF of the fuel prices.</li>
                  <li>Find the date of the week of the trip and read the price of the fuel used (e.g. 06/03/2023 petrol 1,853).</li>
                  <li>Type it in the &quot;ACI € / litre&quot; field, with the dot or the comma.</li>
                </ol>
              </details>
            )}
            {idx.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ textAlign: "left" }}>
                      <th style={cell}>Date</th>
                      <th style={cell}></th>
                      <th style={cell}>Budget line</th>
                      <th style={cell}>{isKm ? "From / to" : "Location"}</th>
                      <th style={cell}>Motive</th>
                      {isKm ? (
                        <>
                          <th style={cell}>km</th>
                          <th style={cell}>ACI € / litre</th>
                        </>
                      ) : (
                        <>
                          <th style={cell}>Curr.</th>
                          <th style={cell}>Amount</th>
                          <th style={cell}>Rate</th>
                        </>
                      )}
                      <th style={{ ...cell, textAlign: "right" }}>€</th>
                      <th style={cell}>{isKm ? "" : "Receipt"}</th>
                      <th style={cell}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {idx.map(([l, i], k) => (
                      <tr key={l.key}>
                        <td style={cell}>
                          <input type="date" min={MIN_EXPENSE_DATE} style={inp} value={l.line_date} onChange={(e) => (isKm ? changeKmDate(i, e.target.value) : patch(i, { line_date: e.target.value }))} />
                        </td>
                        <td style={{ ...cell, width: 30 }}>
                          {k > 0 && (
                            <button
                              type="button"
                              className="ghost"
                              title="copy budget line, location and motive from the row above"
                              onClick={() => {
                                const prev = idx[k - 1][0];
                                patch(i, { budget_line: prev.budget_line, location: prev.location, motive: prev.motive });
                              }}
                            >
                              ↑
                            </button>
                          )}
                        </td>
                        <td style={{ ...cell, width: 80 }}>
                          <input style={inp} value={l.budget_line} onChange={(e) => patch(i, { budget_line: e.target.value })} placeholder="03.01" />
                        </td>
                        <td style={cell}>
                          <input style={inp} value={l.location} onChange={(e) => patch(i, { location: e.target.value })} />
                        </td>
                        <td style={cell}>
                          <input style={inp} value={l.motive} onChange={(e) => patch(i, { motive: e.target.value })} />
                        </td>
                        {isKm ? (
                          <>
                            <td style={{ ...cell, width: 70 }}>
                              <input style={inp} inputMode="decimal" value={l.km} onChange={(e) => patch(i, { km: e.target.value })} />
                            </td>
                            <td style={{ ...cell, width: 80 }}>
                              <input style={inp} inputMode="decimal" value={l.fuel_price} onChange={(e) => patch(i, { fuel_price: e.target.value })} />
                            </td>
                          </>
                        ) : (
                          <>
                            <td style={{ ...cell, width: 60 }}>
                              <input style={inp} value={l.currency} onChange={(e) => patch(i, { currency: e.target.value.toUpperCase() })} />
                            </td>
                            <td style={{ ...cell, width: 90 }}>
                              <input style={inp} inputMode="decimal" value={l.amount_orig} onChange={(e) => patch(i, { amount_orig: e.target.value })} />
                            </td>
                            <td style={{ ...cell, width: 70 }}>
                              <input
                                style={inp}
                                inputMode="decimal"
                                value={l.exchange_rate}
                                disabled={(l.currency || "EUR").toUpperCase() === "EUR"}
                                onChange={(e) => patch(i, { exchange_rate: e.target.value })}
                              />
                            </td>
                          </>
                        )}
                        <td style={{ ...cell, textAlign: "right", whiteSpace: "nowrap", paddingTop: 9 }}>{money(lineAmountEur(l))}</td>
                        <td style={{ ...cell, width: 170 }}>
                          {!isKm && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                              {l.existing && !l.file && <span style={{ fontSize: "0.78rem", wordBreak: "break-all" }}>{l.existing.file_name}</span>}
                              <input
                                type="file"
                                accept={EXPENSE_ACCEPT}
                                aria-label={`Receipt of row ${i + 1}`}
                                style={{ fontSize: "0.75rem", maxWidth: 170 }}
                                onChange={(ev) => patchRow(i, { file: ev.target.files?.[0] ?? null })}
                              />
                            </div>
                          )}
                        </td>
                        <td style={cell}>
                          <button type="button" className="ghost danger" onClick={() => remove(i)} title="Remove the row">
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
              <button type="button" className="ghost" onClick={() => setLines((ls) => [...ls, emptyLine(sec.key)])}>
                + Add a row
              </button>
              <b>Total: € {money(sub)}</b>
            </div>
          </div>
        );
      })}

      <div style={{ borderTop: "2px solid var(--ink)", paddingTop: 8, textAlign: "right", fontSize: "1.05rem" }}>
        <b>TOTAL to be reimbursed: € {money(total)}</b>
      </div>

      <div className="field">
        <label>Notes</label>
        <textarea name="notes" rows={2} style={{ resize: "vertical" }} defaultValue={d.notes ?? ""} />
      </div>
      <p className="subtitle" style={{ margin: 0 }}>
        Attach the receipt of every row (mileage rows need none): the approvers can open it from the report.
      </p>

      {pms && racs && (
        <>
          <h2 style={{ fontSize: "1rem", marginTop: 8, borderBottom: "1px solid var(--line)", paddingBottom: 4 }}>Approval</h2>
          <p className="subtitle" style={{ margin: 0 }}>
            If you have a superior, choose them: they approve first. The RAC or CAR always approves last and checks that everything is
            in order. If you choose no superior, the report goes straight to the RAC or CAR. Then the administration records it in Callisto.
          </p>
          <div style={row}>
            <div className="field" style={col()}>
              <label>Superior (optional)</label>
              <select name="approver_PM" defaultValue="">
                <option value="">— no superior —</option>
                {pms.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.full_name}
                  </option>
                ))}
              </select>
            </div>
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
        </>
      )}

      {error && <div className="banner error">{error}</div>}
      <button type="submit" className="primary" style={{ width: "fit-content", marginTop: 6 }} disabled={busy} aria-busy={busy}>
        {busy ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
