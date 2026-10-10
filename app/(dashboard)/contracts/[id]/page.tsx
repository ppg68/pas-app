import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  CONTRACT_STATUS_LABEL,
  totalPaid,
  totalScheduled,
  daysUntil,
  formatDateIT,
  formatMoney,
} from "@/lib/domain/contracts";
import { fetchProjectDeadlines, fetchWarnDays, deadlineFor, deadlineAlert } from "@/lib/domain/projectDeadlines";
import ConfirmForm from "@/components/ConfirmForm";
import { fetchProjectCups, cupForProject } from "@/lib/domain/projectCups";
import TranchesTable from "@/components/contracts/TranchesTable";
import ContractInvoicesTable from "@/components/contracts/ContractInvoicesTable";
import {
  deleteContract,
  toggleComplianceField,
} from "../actions";


const COMPLIANCE_FIELDS = [
  { key: "signed", label: "Firmato" },
  { key: "privacy", label: "Privacy" },
  { key: "code_of_conduct", label: "Codice di Condotta" },
  { key: "psea_policy", label: "PSEA Policy" },
  { key: "criminal_record_check", label: "Casellario Giudiziale / autocert." },
  { key: "technical_requirements_check", label: "Autocert. requisiti tecnico professionali" },
  { key: "labor_inspectorate_notice", label: "Comunicazione ispettorato del lavoro" },
] as const;

export default async function ContractDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();
  const [{ data: contract }, { data: tranches }] = await Promise.all([
    supabase.from("contracts").select("*").eq("id", id).single(),
    supabase
      .from("contract_tranches")
      .select("*")
      .eq("contract_id", id)
      .order("seq", { ascending: true }),
  ]);

  if (!contract) {
    return <div style={{ fontSize: 13 }}>Contract not found.</div>;
  }

  const { data: invoices } = await supabase
    .from("contract_invoices")
    .select("*")
    .eq("contract_id", id)
    .order("invoice_date", { ascending: false, nullsFirst: false });

  // Invoices of the IR register ("Fatture", managed by Elisa) linked to this contract.
  const { data: irInvoices } = await supabase
    .from("invoices")
    .select("id, request_id, ir_number, protocol, supplier, due_date, payment_date, payment_note, currency, amount, withholding, balance_due, notes")
    .eq("contract_id", id)
    .order("due_date", { ascending: true, nullsFirst: false });

  const paid = totalPaid(tranches ?? []);
  const scheduled = totalScheduled(tranches ?? []);
  const balance = contract.amount - paid;

  // Overall situation: invoices of both sources ("Elenco Fatture" = older ones, IR register = current ones).
  // Only invoices in the contract currency are summed; others are counted separately.
  const oldInv = invoices ?? [];
  const irAll = irInvoices ?? [];
  const irSame = irAll.filter((i) => i.currency === contract.currency);
  const irOther = irAll.length - irSame.length;
  const invoicedOld = oldInv.reduce((sum, i) => sum + (i.amount ?? 0), 0);
  const invoicedIr = irSame.reduce((sum, i) => sum + (i.amount ?? 0), 0);
  const invoiced = invoicedOld + invoicedIr;
  const paidOld = oldInv
    .filter((i) => i.paid_amount != null || i.payment_date)
    .reduce((sum, i) => sum + (i.amount ?? 0), 0);
  const paidIr = irSame.filter((i) => i.payment_date).reduce((sum, i) => sum + (i.amount ?? 0), 0);
  const invoicedPaid = paidOld + paidIr;
  const invoicedUnpaid = Math.max(invoiced - invoicedPaid, 0);
  const toInvoice = contract.amount - invoiced;
  const pct = (v: number) =>
    contract.amount > 0 ? Math.min(Math.max((v / contract.amount) * 100, 0), 100) : 0;
  const unpaidTranches = (tranches ?? []).filter((t) => !t.paid);
  const nextTranche = unpaidTranches
    .filter((t) => t.due_date)
    .sort((a, b) => (a.due_date as string).localeCompare(b.due_date as string))[0];
  const checks: { ok: boolean; text: string }[] = [
    {
      ok: Math.abs(contract.amount - scheduled) < 0.005 || (tranches ?? []).length === 0,
      text:
        (tranches ?? []).length === 0
          ? "No tranches defined"
          : Math.abs(contract.amount - scheduled) < 0.005
            ? "Tranches match the contract amount"
            : `Tranches total ${formatMoney(scheduled)} vs contract ${formatMoney(contract.amount)}`,
    },
    {
      ok: toInvoice >= -0.005,
      text:
        toInvoice >= -0.005
          ? "Invoiced within the contract amount"
          : `Invoiced exceeds the contract by ${formatMoney(-toInvoice)} ${contract.currency}`,
    },
  ];
  const projectCup = cupForProject(await fetchProjectCups(supabase), contract.project_code);
  const projectEnd = deadlineFor(await fetchProjectDeadlines(supabase), contract.project_code);
  const alert = deadlineAlert(
    {
      ...contract,
      project_deadline: projectEnd,
      paid,
      unpaidTranches: (tranches ?? []).filter((t) => !t.paid).length,
    },
    await fetchWarnDays(supabase)
  );
  const dLeft = daysUntil(contract.end_date);
  const overdue = dLeft !== null && dLeft < 0 && contract.status === "in_corso";

  return (
    <div style={{ maxWidth: 1180 }}>
      <Link href="/contracts" style={{ fontSize: 13, color: "var(--ink-soft)" }}>
        ← Back to Contracts
      </Link>

      <div style={{ margin: "10px 0 20px" }}>
        <h1 style={{ marginBottom: 4 }}>{contract.subject}</h1>
        <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>
          {[contract.legacy_id ? `n. ${contract.legacy_id}` : null, contract.country, contract.project_code]
            .filter(Boolean)
            .join(" · ")}
          {(contract.legacy_id || contract.country || contract.project_code) && " · "}
          {formatMoney(contract.amount)} {contract.currency}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <span className="stamp brand">{CONTRACT_STATUS_LABEL[contract.status]}</span>
          {projectEnd && (
            <span className={alert ? "stamp warn" : "stamp"}>
              project ends {formatDateIT(projectEnd)}
            </span>
          )}
          {contract.end_date && (
            <span className={overdue ? "stamp warn" : "stamp"}>
              ends {formatDateIT(contract.end_date)}
              {overdue && ` · overdue (${Math.abs(dLeft!)}d)`}
            </span>
          )}
        </div>
      </div>

      {alert && (
        <div className="banner error">
          {alert === "overdue"
            ? `The project (${contract.project_code}) ended on ${formatDateIT(projectEnd)}, but this contract is still open with payments pending (balance ${formatMoney(balance)} ${contract.currency}).`
            : `The project (${contract.project_code}) ends on ${formatDateIT(projectEnd)}: this contract is still open with payments pending (balance ${formatMoney(balance)} ${contract.currency}).`}
        </div>
      )}

      {error && <div className="banner error">{decodeURIComponent(error)}</div>}

      {/* Overall situation */}
      <div className="card">
        <h2 style={{ fontSize: 14, marginBottom: 10 }}>Overall situation</h2>
        <div style={{ display: "flex", gap: 22, fontSize: 13, marginBottom: 12, flexWrap: "wrap" }}>
          {[
            ["Contract amount", contract.amount],
            ["Invoiced", invoiced],
            ["Paid (invoices)", invoicedPaid],
            ["Invoiced, not yet paid", invoicedUnpaid],
            ["Still to invoice", toInvoice],
          ].map(([label, value]) => (
            <div key={label as string}>
              <div style={{ color: "var(--ink-soft)", fontSize: 11 }}>{label as string}</div>
              <div className="value" style={{ fontWeight: 600 }}>
                {formatMoney(value as number)} {contract.currency}
              </div>
            </div>
          ))}
        </div>

        <div
          title="Paid / invoiced not yet paid / still to invoice"
          style={{
            display: "flex",
            height: 10,
            borderRadius: 5,
            overflow: "hidden",
            background: "var(--line)",
            marginBottom: 6,
          }}
        >
          <div style={{ width: `${pct(invoicedPaid)}%`, background: "var(--navy)" }} />
          <div style={{ width: `${pct(invoicedUnpaid)}%`, background: "#D9A441" }} />
        </div>
        <div style={{ display: "flex", gap: 14, fontSize: 11, color: "var(--ink-soft)", flexWrap: "wrap", marginBottom: 12 }}>
          <span>■ paid {pct(invoicedPaid).toFixed(0)}%</span>
          <span style={{ color: "#B8862B" }}>■ invoiced, not paid {pct(invoicedUnpaid).toFixed(0)}%</span>
          <span>□ to invoice {Math.max(100 - pct(invoiced), 0).toFixed(0)}%</span>
        </div>

        <div style={{ fontSize: 12, color: "var(--ink-soft)", display: "grid", gap: 3 }}>
          <div>
            Invoices: {oldInv.length} in &quot;Elenco Fatture&quot; ({formatMoney(invoicedOld)}) + {irSame.length} in the IR
            register ({formatMoney(invoicedIr)})
            {irOther > 0 ? ` · ${irOther} in another currency not included` : ""}
          </div>
          <div>
            Tranches: {(tranches ?? []).length - unpaidTranches.length} paid, {unpaidTranches.length} open
            {nextTranche ? ` · next due ${formatDateIT(nextTranche.due_date)} (${formatMoney(nextTranche.amount)} ${contract.currency})` : ""}
          </div>
          <div>
            Project{contract.project_code ? ` ${contract.project_code}` : ""}
            {projectCup ? ` · CUP ${projectCup}` : ""}:{" "}
            {projectEnd ? `ends ${formatDateIT(projectEnd)}` : "no deadline found in Approved projects"}
            {contract.end_date ? ` · contract ends ${formatDateIT(contract.end_date)}` : ""}
          </div>
          {checks.map((c) => (
            <div key={c.text} style={{ color: c.ok ? "var(--ink-soft)" : "var(--brick)", fontWeight: c.ok ? 400 : 600 }}>
              {c.ok ? "✓" : "⚠"} {c.text}
            </div>
          ))}
        </div>
      </div>

      {/* Payment summary */}
      <div className="card">
        <h2 style={{ fontSize: 14, marginBottom: 10 }}>Payments</h2>
        <div style={{ display: "flex", gap: 22, fontSize: 13, marginBottom: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ color: "var(--ink-soft)", fontSize: 11 }}>Contract amount</div>
            <div className="value" style={{ fontWeight: 600 }}>
              {formatMoney(contract.amount)} {contract.currency}
            </div>
          </div>
          <div>
            <div style={{ color: "var(--ink-soft)", fontSize: 11 }}>Scheduled (tranches)</div>
            <div className="value" style={{ fontWeight: 600 }}>
              {formatMoney(scheduled)} {contract.currency}
            </div>
          </div>
          <div>
            <div style={{ color: "var(--ink-soft)", fontSize: 11 }}>Paid</div>
            <div className="value" style={{ fontWeight: 600 }}>
              {formatMoney(paid)} {contract.currency}
            </div>
          </div>
          <div>
            <div style={{ color: "var(--ink-soft)", fontSize: 11 }}>Balance</div>
            <div className="value" style={{ fontWeight: 600 }}>
              {formatMoney(balance)} {contract.currency}
            </div>
          </div>
        </div>

        <TranchesTable
          contractId={contract.id}
          currency={contract.currency}
          contractAmount={contract.amount}
          tranches={(tranches ?? []).map((t) => ({
            id: t.id,
            seq: t.seq,
            label: t.label,
            amount: t.amount,
            due_date: t.due_date,
            due_condition: t.due_condition,
            paid: t.paid,
            paid_date: t.paid_date,
            paid_amount: t.paid_amount,
          }))}
        />
      </div>

      {/* Invoices ("Elenco Fatture") — Elisa's actual recorded invoices; their
          totals are what "importo pagato" really is, separate from the
          planned tranches above. */}
      <div className="card">
        <h2 style={{ fontSize: 14, marginBottom: 10 }}>Invoices</h2>

        <ContractInvoicesTable
          contractId={contract.id}
          legacyId={contract.legacy_id ?? ""}
          currency={contract.currency}
          contractAmount={contract.amount}
          invoices={(invoices ?? []).map((inv) => ({
            id: inv.id,
            invoice_number: inv.invoice_number,
            invoice_date: inv.invoice_date,
            amount: inv.amount,
            protocol: inv.protocol,
            description: inv.description,
            paid_amount: inv.paid_amount,
            payment_date: inv.payment_date,
            payment_note: inv.payment_note,
          }))}
        />
      </div>

      {/* Invoices of the IR register (read-only here; edited in the Invoices page) */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <h2 style={{ fontSize: 14, margin: 0 }}>Invoices from the IR register</h2>
          <Link href="/invoices" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            Open Invoices to edit →
          </Link>
        </div>
        {(irInvoices ?? []).length === 0 ? (
          <p className="empty">No IR-register invoices linked to this contract.</p>
        ) : (
          <>
            <div className="table-wrap" style={{ marginBottom: 8 }}>
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>IR</th>
                    <th>Protocol</th>
                    <th>Due date</th>
                    <th>Payment date</th>
                    <th className="num">Amount</th>
                    <th>Cur.</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {(irInvoices ?? []).map((inv) => (
                    <tr key={inv.id}>
                      <td className="center">
                        <Link
                          href={`/invoices#inv-${inv.id}`}
                          title="Open this invoice in the Invoices page"
                          style={{ fontWeight: 600, color: "var(--navy)" }}
                        >
                          ↗
                        </Link>
                      </td>
                      <td>
                        {inv.request_id ? (
                          <Link href={`/requests/${inv.request_id}`} style={{ color: "var(--navy)", fontWeight: 600 }}>
                            {inv.ir_number ?? "IR"} ↗
                          </Link>
                        ) : (
                          (inv.ir_number ?? "")
                        )}
                      </td>
                      <td>{inv.protocol ?? ""}</td>
                      <td>{formatDateIT(inv.due_date)}</td>
                      <td>
                        {inv.payment_date ? formatDateIT(inv.payment_date) : inv.payment_note ?? <span style={{ color: "var(--brick)" }}>unpaid</span>}
                      </td>
                      <td className="num">{formatMoney(inv.amount)}</td>
                      <td>{inv.currency}</td>
                      <td>{inv.notes ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 600 }}>
                    <td colSpan={5} style={{ padding: "8px 10px" }}>
                      Total ({(irInvoices ?? []).filter((i) => i.payment_date).length} paid of {(irInvoices ?? []).length})
                    </td>
                    <td className="num" style={{ padding: "8px 10px" }}>
                      {formatMoney((irInvoices ?? []).reduce((sum, i) => sum + (i.amount ?? 0), 0))}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="subtitle" style={{ margin: 0 }}>
              Paid so far:{" "}
              {formatMoney(
                (irInvoices ?? []).filter((i) => i.payment_date).reduce((sum, i) => sum + (i.amount ?? 0), 0)
              )}{" "}
              · Still to invoice vs contract:{" "}
              {formatMoney(
                contract.amount - (irInvoices ?? []).reduce((sum, i) => sum + (i.amount ?? 0), 0)
              )}{" "}
              {contract.currency}
            </p>
          </>
        )}
      </div>

      {/* Compliance checklist */}
      <div className="card">
        <h2 style={{ fontSize: 14, marginBottom: 10 }}>Compliance</h2>
        {COMPLIANCE_FIELDS.map(({ key, label }) => {
          const checked = Boolean(contract[key as keyof typeof contract]);
          return (
            <div
              key={key}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: 13,
                padding: "6px 0",
                borderBottom: "0.5px solid #EEF0F3",
              }}
            >
              <span>
                {label} — {checked ? "done" : "pending"}
              </span>
              <form action={toggleComplianceField.bind(null, contract.id, key, !checked)}>
                <button type="submit" className="pill">
                  {checked ? "Undo" : "Mark done"}
                </button>
              </form>
            </div>
          );
        })}
      </div>

      <p className="subtitle" style={{ marginBottom: 8 }}>
        Every other field (subject, dates, amount, project, referent, notes…) can be edited
        directly from the Contracts table — click any cell there.
      </p>

      <ConfirmForm
        action={deleteContract.bind(null, contract.id)}
        message={`Delete contract ${contract.legacy_id ?? ""} — ${contract.subject}?

Its tranches and checklist are deleted with it. Invoices stay in the lists but are no longer linked to a contract.

This cannot be undone.`}
      >
        <button type="submit" className="ghost danger">
          Delete contract
        </button>
      </ConfirmForm>
    </div>
  );
}
