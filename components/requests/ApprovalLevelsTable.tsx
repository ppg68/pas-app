import {
  PROC_CONFIG,
  irSigners,
  paymentSigners,
  type ProcCode,
  type Role,
} from "@/lib/domain/procedures";
import { formatMoney } from "@/lib/domain/contracts";

const names = (roles: Role[]) => (roles.length ? roles.join(" + ") : "none");

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
    const base = { procCode: p.code, coordinationCost: false, derogation: false };
    return {
      code: p.code,
      label: p.label,
      range,
      offers: p.minOffers === 0 ? "—" : p.minOffers === 1 ? "1 quotation" : `${p.minOffers} offers`,
      ir: names(irSigners(base)),
      payment: names(paymentSigners(base)),
    };
  });

  return (
    <details className="card" style={{ marginBottom: 16 }} open>
      <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
        Approval levels (PR04)
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
        <li>Direct purchase: no IR approval (the IR only provides the number for archiving). Only the payment authorization form (PA) is filled in, with no approval.</li>
        <li>Coordination cost (no linked project): RAC alone, for IR approval and payment.</li>
        <li>Derogation 3Q → SQ: the RAC also signs the IR approval (prior authorization).</li>
        <li>The Budget Holder is the PM: only CAR / RAC sign. Whoever creates the request cannot sign it.</li>
      </ul>
    </details>
  );
}
