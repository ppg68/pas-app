import MoneyInput from "@/components/MoneyInput";
import SubmitButton from "@/components/SubmitButton";
import { PROC_TYPES, type ContractRequestRow, type RequestKind } from "@/lib/domain/contractRequests";

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

export default function SchedaForm({
  kind,
  action,
  defaults,
  pms,
  racs,
  submitLabel,
}: {
  kind: RequestKind;
  action: (formData: FormData) => void | Promise<void>;
  defaults?: Partial<ContractRequestRow>;
  /** approver pickers, only when creating */
  pms?: Holder[];
  racs?: Holder[];
  submitLabel: string;
}) {
  const d = defaults ?? {};
  const x = d.data ?? {};
  const company = kind === "company";

  return (
    <form action={action} className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Section title={company ? "Company / organisation" : "Individual"}>
        <div style={row}>
          <div className="field" style={col(2, 220)}>
            <label>{company ? "Legal name" : "Name and surname"} *</label>
            <input name="party_name" defaultValue={d.party_name ?? ""} required />
          </div>
          {company ? (
            <>
              <div className="field" style={col(1, 140)}>
                <label>Short name (used in the text)</label>
                <input name="party_short" defaultValue={d.party_short ?? ""} placeholder="e.g. CIHEAM Bari" />
              </div>
              <div className="field" style={{ width: 120 }}>
                <label>Article</label>
                <select name="party_art" defaultValue={x.party_art ?? "il"}>
                  <option value="il">il (il …)</option>
                  <option value="lo">lo</option>
                  <option value="la">la</option>
                  <option value="l'">l’</option>
                  <option value="">none</option>
                </select>
              </div>
            </>
          ) : (
            <div className="field" style={col(1, 140)}>
              <label>Nationality</label>
              <input name="nationality" defaultValue={d.nationality ?? ""} />
            </div>
          )}
        </div>
        <div className="field">
          <label>{company ? "Registered office" : "Residence"}</label>
          <input name="address" defaultValue={d.address ?? ""} placeholder="e.g. 20134 Milano – Via … 1" />
        </div>
        <div style={row}>
          <div className="field" style={col()}>
            <label>Tax code (C.F.)</label>
            <input name="tax_code" defaultValue={d.tax_code ?? ""} />
          </div>
          <div className="field" style={col()}>
            <label>VAT number (P.IVA)</label>
            <input name="vat_number" defaultValue={d.vat_number ?? ""} />
          </div>
        </div>
        {company ? (
          <>
            <div style={row}>
              <div className="field" style={col()}>
                <label>Legal representative *</label>
                <input name="legal_rep" defaultValue={d.legal_rep ?? ""} required />
              </div>
              <div className="field" style={col()}>
                <label>Role of the representative</label>
                <input name="legal_rep_role" defaultValue={d.legal_rep_role ?? "Legale Rappresentante"} />
              </div>
            </div>
            <div style={row}>
              <div className="field" style={col()}>
                <label>Contact person (art. 12)</label>
                <input name="contact_person" defaultValue={d.contact_person ?? ""} />
              </div>
              <div className="field" style={col()}>
                <label>Contact email</label>
                <input name="contact_email" type="email" defaultValue={d.contact_email ?? ""} />
              </div>
              <div className="field" style={col()}>
                <label>Administration email</label>
                <input name="contact_email_admin" type="email" defaultValue={d.contact_email_admin ?? ""} />
              </div>
            </div>
            <div className="field">
              <label>PEC</label>
              <input name="pec" defaultValue={d.pec ?? ""} />
            </div>
          </>
        ) : (
          <div style={row}>
            <div className="field" style={col()}>
              <label>Email</label>
              <input name="email" type="email" defaultValue={d.email ?? ""} />
            </div>
            <div className="field" style={col()}>
              <label>PEC</label>
              <input name="pec" defaultValue={d.pec ?? ""} />
            </div>
            <div className="field" style={col()}>
              <label>Capacity (in qualità di)</label>
              <input name="capacity" defaultValue={x.capacity ?? "Consulente"} />
            </div>
          </div>
        )}
      </Section>

      <Section title="Contract">
        <div style={row}>
          <div className="field" style={col(2, 240)}>
            <label>Type</label>
            <select name="contract_type" defaultValue={d.contract_type ?? "consultancy_vat"}>
              <option value="consultancy_vat">1.5.1.4 Consulenza con P.I. o Cod. Identificativo (fattura)</option>
              <option value="occasional">1.5.13 Lavoro autonomo occasionale (nota)</option>
            </select>
          </div>
          <div className="field" style={col(1, 120)}>
            <label>IR number (if any)</label>
            <input name="ir_code" defaultValue={d.ir_code ?? ""} placeholder="e.g. 531/2025" />
          </div>
          <div className="field" style={{ width: 130 }}>
            <label>Procedure type</label>
            <select name="proc_type" defaultValue={d.proc_type ?? ""}>
              <option value=""></option>
              {PROC_TYPES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={row}>
          <div className="field" style={col()}>
            <label>Start date</label>
            <input name="start_date" type="date" defaultValue={d.start_date ?? ""} />
            <label className="checkbox-row" style={{ marginTop: 4 }}>
              <input type="checkbox" name="start_on_signature" defaultChecked={d.start_on_signature ?? false} /> from the signature of the contract
            </label>
          </div>
          <div className="field" style={col()}>
            <label>End date *</label>
            <input name="end_date" type="date" defaultValue={d.end_date ?? ""} required />
          </div>
          <div className="field" style={col()}>
            <label>Date of the contract (optional)</label>
            <input name="signing_date" type="date" defaultValue={x.signing_date ?? ""} />
          </div>
        </div>
      </Section>

      <Section title="Project and role">
        <div className="field">
          <label>Project title</label>
          <input name="project_title" defaultValue={d.project_title ?? ""} />
        </div>
        <div style={row}>
          <div className="field" style={col()}>
            <label>Donor code</label>
            <input name="donor_code" defaultValue={d.donor_code ?? ""} />
          </div>
          <div className="field" style={col()}>
            <label>Internal code (e.g. 209E)</label>
            <input name="internal_code" defaultValue={d.internal_code ?? ""} />
          </div>
          <div className="field" style={col()}>
            <label>Budget line</label>
            <input name="budget_line" defaultValue={d.budget_line ?? ""} />
          </div>
        </div>
        <div className="field">
          <label>Role and budget line (e.g. Consulente / Valutazione di progetto)</label>
          <input name="role_title" defaultValue={d.role_title ?? ""} />
          <label className="checkbox-row" style={{ marginTop: 4 }}>
            <input type="checkbox" name="staff_like" defaultChecked={d.staff_like ?? false} /> Consultancy similar to STAFF (to be entered in Geco)
          </label>
        </div>
        <div className="field">
          <label>Activities to be carried out *{company ? "" : " (one per line)"}</label>
          <textarea name="activities" rows={4} style={area} defaultValue={d.activities ?? ""} required />
        </div>
        <div className="field">
          <label>Final objective</label>
          <textarea name="objective" rows={2} style={area} defaultValue={d.objective ?? ""} />
        </div>
        <div style={row}>
          <div className="field" style={col(2, 220)}>
            <label>Place of work</label>
            <input name="work_place" defaultValue={d.work_place ?? ""} placeholder="e.g. Arusha (Tanzania)" />
          </div>
          <div className="field" style={col(1, 200)}>
            <label>Contact with minors?</label>
            <label className="checkbox-row">
              <input type="checkbox" name="minors" defaultChecked={d.minors ?? false} /> Yes, the activities involve minors
            </label>
          </div>
          {company && (
            <div className="field" style={col(1, 200)}>
              <label>Terms of Reference</label>
              <label className="checkbox-row">
                <input type="checkbox" name="tdr" defaultChecked={x.tdr ?? false} /> ToR attached to the contract
              </label>
            </div>
          )}
        </div>
      </Section>

      <Section title="Fee and payment">
        <div style={row}>
          <div className="field" style={col()}>
            <label>Amount *</label>
            <MoneyInput name="amount" required defaultValue={d.amount ?? ""} />
          </div>
          <div className="field" style={{ width: 90 }}>
            <label>Currency</label>
            <input name="currency" defaultValue={d.currency ?? "EUR"} />
          </div>
          {!company && (
            <div className="field" style={col()}>
              <label>The amount is</label>
              <select name="fee_mode" defaultValue={d.fee_mode ?? "total"}>
                <option value="total">the total fee of the contract</option>
                <option value="daily">the daily fee</option>
              </select>
            </div>
          )}
        </div>
        <div className="field">
          <label>
            {company
              ? "Payment tranches (one per line, e.g. “30% alla firma del contratto”)"
              : "Payment terms (e.g. “a presentazione e approvazione del Rapporto di Missione”)"}
          </label>
          <textarea name="payment_terms" rows={3} style={area} defaultValue={d.payment_terms ?? ""} />
        </div>
        <div className="field">
          <label>Internal note on the fee (e.g. “220 €/day + VAT”; not printed in the contract)</label>
          <input name="fee_note" defaultValue={d.fee_note ?? ""} />
        </div>
      </Section>

      {!company && (
        <Section title="Expenses, travel and insurance">
          <div style={row}>
            <div className="field" style={col()}>
              <label>Accommodation</label>
              <select name="accommodation" defaultValue={x.accommodation ?? ""}>
                <option value=""></option>
                <option value="self">at the consultant’s expense</option>
                <option value="oikos_reimbursed">reimbursed by Oikos (receipts)</option>
                <option value="oikos_free">free, Oikos facility</option>
              </select>
            </div>
            <div className="field" style={col()}>
              <label>Meals</label>
              <select name="meals" defaultValue={x.meals ?? ""}>
                <option value=""></option>
                <option value="self">at the consultant’s expense</option>
                <option value="oikos_reimbursed">reimbursed by Oikos (receipts)</option>
              </select>
            </div>
            <div className="field" style={col()}>
              <label>Per diem (Oikos tables)</label>
              <select name="per_diem" defaultValue={x.per_diem ?? ""}>
                <option value=""></option>
                <option value="yes">yes</option>
                <option value="no">no</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>Other reimbursements</label>
            <input name="other_reimb" defaultValue={x.other_reimb ?? ""} />
          </div>
          <div style={row}>
            <div className="field" style={{ width: 110 }}>
              <label>Flights (no.)</label>
              <input name="flights_count" defaultValue={x.flights_count ?? ""} inputMode="numeric" />
            </div>
            <div className="field" style={col(1, 180)}>
              <label>Route (e.g. Milano – Beirut)</label>
              <input name="flights_route" defaultValue={x.flights_route ?? ""} />
            </div>
            <div className="field" style={col(1, 140)}>
              <label>Max reimbursable (incl. CO2)</label>
              <input name="flights_max" defaultValue={x.flights_max ?? ""} />
            </div>
          </div>
          <div style={row}>
            <div className="field" style={col()}>
              <label>Budget line: flights</label>
              <input name="flight_bl" defaultValue={x.flight_bl ?? ""} />
            </div>
            <div className="field" style={col()}>
              <label>Budget line: visa (fill in if a visa is reimbursed)</label>
              <input name="visa_bl" defaultValue={x.visa_bl ?? ""} />
            </div>
            <div className="field" style={col()}>
              <label>Budget line: accommodation / meals</label>
              <input name="accommodation_bl" defaultValue={x.accommodation_bl ?? ""} />
            </div>
          </div>
          <div style={row}>
            <div className="field" style={col()}>
              <label>Insurance</label>
              <select name="insurance" defaultValue={x.insurance ?? ""}>
                <option value=""></option>
                <option value="self">at the consultant’s expense</option>
                <option value="oikos">paid by Oikos (policies listed in art. 7)</option>
              </select>
            </div>
            <div className="field" style={col()}>
              <label>Budget line: insurance</label>
              <input name="insurance_bl" defaultValue={x.insurance_bl ?? ""} />
            </div>
          </div>
          <div style={row}>
            <div className="field" style={col()}>
              <label>Equipment provided</label>
              <input name="equipment" defaultValue={x.equipment ?? ""} placeholder="none" />
            </div>
            <div className="field" style={col()}>
              <label>Public employee? (needs authorization)</label>
              <select name="public_employee" defaultValue={x.public_employee ?? ""}>
                <option value=""></option>
                <option value="no">no</option>
                <option value="yes">yes, authorization required</option>
              </select>
            </div>
          </div>
        </Section>
      )}

      {pms && racs && (
        <Section title="Approval">
          <p className="subtitle" style={{ margin: 0 }}>
            The request is sent to the PM / Programme Manager and to the RAC. Both must approve before Contracts prepares the contract.
          </p>
          <div style={row}>
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
            <div className="field" style={col()}>
              <label>RAC *</label>
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
