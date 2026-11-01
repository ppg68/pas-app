import {
  PROC_CONFIG,
  irSlots,
  paymentSlots,
  slotsShort,
  type ProcCode,
} from "@/lib/domain/procedures";
import { formatMoney } from "@/lib/domain/contracts";

/**
 * Reference table of the approval levels (PR04). Built from the same rules the workflow applies,
 * so it can never drift from what the app really asks. `current` highlights the row of the
 * procedure resulting from the amount typed in the form.
 */
export default function ApprovalLevelsTable({ current }: { current?: ProcCode | null }) {
  const rows = PROC_CONFIG.map((p, i) => {
    const from = i === 0 ? 0 : PROC_CONFIG[i - 1].max;
    const range =
      p.max === Infinity
        ? `over ${formatMoney(from)}`
        : from === 0
          ? `up to ${formatMoney(p.max)}`
          : `${formatMoney(from)} – ${formatMoney(p.max)}`;
    const base = { procCode: p.code, coordinationCost: false, derogation: false, pmRequired: p.code !== "DIR" };
    return {
      code: p.code,
      label: p.label,
      range,
      offers: p.minOffers === 0 ? "—" : p.minOffers === 1 ? "1 quotation" : `${p.minOffers} offers`,
      ir: slotsShort(irSlots(base)),
      payment: slotsShort(paymentSlots(base)),
    };
  });

  return (
    <details className="card" style={{ marginBottom: 16 }} open>
      <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
        Approval levels (PR04) — indicative thresholds
      </summary>
      <div className="table-wrap" style={{ marginTop: 10 }}>
        <table>
          <thead>
            <tr>
              <th>Procedure</th>
              <th>Amount (EUR)</th>
              <th>Offers</th>
              <th>IR approval</th>
              <th>Payment</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.code}
                style={r.code === current ? { background: "#EAF1FB", fontWeight: 600 } : undefined}
              >
                <td>
                  {r.code} — {r.label}
                </td>
                <td>{r.range}</td>
                <td>{r.offers}</td>
                <td>{r.ir}</td>
                <td>{r.payment}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul style={{ fontSize: 12, color: "var(--ink-soft)", margin: "10px 0 0", paddingLeft: 18 }}>
        <li>The thresholds are only an indication: you choose the procedure, which follows the budget line of the project (a 2.000 EUR purchase on a budget line that needs 3Q is a 3Q). A lower procedure than the amount indicates is allowed only as a derogation (SQ instead of 3Q).</li>
        <li>Every expense, including direct purchases, needs the approval of the administration: CAR or RAC (one of the two), both for the IR and for each payment authorization.</li>
        <li>Above a direct purchase the PM signs as well: dual authorization, PM + administration. If the person who compiles the request is the PM, the PM signature is skipped (nobody signs their own request).</li>
        <li>Coordination cost (no linked project): RAC alone, for IR approval and payment.</li>
        <li>Derogation (SQ instead of 3Q): CAR and RAC both sign the IR approval (prior authorization of the RAC), besides the PM.</li>
        <li>Whoever creates the request cannot sign it, and the same person cannot give two of the signatures.</li>
      </ul>
    </details>
  );
}
