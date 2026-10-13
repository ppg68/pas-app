"use client";

import { useMemo, useState } from "react";
import MoneyInput from "@/components/MoneyInput";
import SubmitButton from "@/components/SubmitButton";
import { createInvoiceFromForm } from "@/app/(dashboard)/invoices/actions";
import { formatMoney, normalizeContractNumber } from "@/lib/domain/contracts";
import { cupForProject } from "@/lib/domain/projectCups";
import { irKey, type IrRef } from "@/lib/domain/irRefs";

export type FormContract = {
  number: string;
  subject: string;
  amount: number;
  currency: string;
  project: string | null;
  invoiced: number;
};

/** A request that is waiting for its invoice (winner chosen, or direct purchase), offered to Elisa as a picker. */
export type AwaitingRequest = {
  id: string;
  ir: string;
  description: string;
  project: string | null;
  currency: string;
  procedure: string;
  stage: string;
  supplier: string | null;
  /** value of the winning offer; direct purchases: the estimated amount */
  value: number;
};

const row: React.CSSProperties = { display: "flex", gap: 12, flexWrap: "wrap" };

export default function NewInvoiceForm({
  contracts,
  projectCups,
  irRefs,
  awaiting = [],
}: {
  contracts: FormContract[];
  projectCups: Record<string, string>;
  irRefs: Record<string, IrRef>;
  awaiting?: AwaitingRequest[];
}) {
  const [pickFilter, setPickFilter] = useState("");
  const [picked, setPicked] = useState("");
  const [contractNumber, setContractNumber] = useState("");
  const [supplier, setSupplier] = useState("");
  const [project, setProject] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [amount, setAmount] = useState("");
  // last values filled in automatically from a contract: they are replaced when the contract changes,
  // unless the user typed something different in the meantime
  const [autoSupplier, setAutoSupplier] = useState("");
  const [autoProject, setAutoProject] = useState("");
  const [irNumber, setIrNumber] = useState("");
  const [budget, setBudget] = useState("");
  const irRef = irNumber.trim() ? irRefs[irKey(irNumber)] : undefined;

  function onIrChange(v: string) {
    setIrNumber(v);
    const ref = v.trim() ? irRefs[irKey(v)] : undefined;
    // the IR request is the source of project and budget line: they follow it
    if (ref?.project) {
      setProject(ref.project);
      setAutoProject(ref.project);
    }
    if (ref?.budget) setBudget(ref.budget);
  }

  const byNumber = useMemo(() => {
    const m = new Map<string, FormContract>();
    contracts.forEach((c) => m.set(normalizeContractNumber(c.number), c));
    return m;
  }, [contracts]);

  const projectCup = cupForProject(projectCups, project);
  const match = contractNumber.trim() ? byNumber.get(normalizeContractNumber(contractNumber)) : undefined;
  const amountNum = parseFloat(amount.replace(",", "."));
  const sameCurrency = match ? match.currency === currency.trim().toUpperCase() : true;
  const afterThis =
    match && sameCurrency && Number.isFinite(amountNum) ? match.amount - match.invoiced - amountNum : null;

  const pickedReq = awaiting.find((r) => r.id === picked);
  const visibleAwaiting = awaiting.filter((r) => {
    const q = pickFilter.trim().toLowerCase();
    if (!q) return true;
    return [r.ir, r.supplier ?? "", r.description, r.project ?? ""].some((x) => x.toLowerCase().includes(q));
  });

  function onPick(id: string) {
    setPicked(id);
    const r = awaiting.find((x) => x.id === id);
    if (!r) return;
    onIrChange(r.ir);
    if (r.supplier) {
      setSupplier(r.supplier);
      setAutoSupplier(r.supplier);
    }
    if (r.project) {
      setProject(r.project);
      setAutoProject(r.project);
    }
    setCurrency(r.currency);
  }

  function onContractChange(v: string) {
    setContractNumber(v);
    const c = v.trim() ? byNumber.get(normalizeContractNumber(v)) : undefined;
    if (c) {
      // fill supplier / project from the contract when empty or still holding the previous automatic value
      if (!supplier.trim() || supplier === autoSupplier) {
        setSupplier(c.subject);
        setAutoSupplier(c.subject);
      }
      if (!project.trim() || project === autoProject) {
        setProject(c.project ?? "");
        setAutoProject(c.project ?? "");
      }
      setCurrency(c.currency);
    }
  }

  return (
    <form action={createInvoiceFromForm} className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {awaiting.length > 0 && (
        <div className="field" style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, padding: 10 }}>
          <label>Which request is this invoice for? (optional — fills IR, supplier, project)</label>
          <input
            type="search"
            placeholder="Filter by supplier, IR, description or project…"
            value={pickFilter}
            onChange={(e) => setPickFilter(e.target.value)}
            style={{ marginBottom: 6 }}
          />
          <select value={picked} onChange={(e) => onPick(e.target.value)}>
            <option value="">— choose the request awaiting this invoice ({visibleAwaiting.length}) —</option>
            {visibleAwaiting.map((r) => (
              <option key={r.id} value={r.id}>
                {`${r.ir} — ${r.supplier ?? "no supplier (direct purchase)"} — ${r.description} — ${formatMoney(r.value)} ${r.currency}`}
              </option>
            ))}
          </select>
          {pickedReq && (
            <div style={{ fontSize: 12, marginTop: 6, color: "var(--ink-soft)" }}>
              {pickedReq.procedure} · {pickedReq.project ?? "no project"} · stage {pickedReq.stage} ·{" "}
              {pickedReq.supplier ? "winning offer" : "estimated amount"}{" "}
              <b>
                {formatMoney(pickedReq.value)} {pickedReq.currency}
              </b>
              {pickedReq.stage !== "payment" && " · the request has not reached the payment stage yet"}
            </div>
          )}
        </div>
      )}
      <div className="field">
        <label>Contract # (optional — links the invoice to the contract)</label>
        <input
          name="contract_number"
          value={contractNumber}
          onChange={(e) => onContractChange(e.target.value)}
          placeholder="e.g. 36/25"
          list="contract-numbers"
          autoComplete="off"
        />
        <datalist id="contract-numbers">
          {contracts.map((c) => (
            <option key={c.number} value={c.number}>
              {c.subject}
            </option>
          ))}
        </datalist>
        {contractNumber.trim() && (
          <div
            style={{
              marginTop: 6,
              fontSize: 12,
              color: match ? "var(--ink-soft)" : "var(--brick)",
              fontWeight: match ? 400 : 600,
            }}
          >
            {match ? (
              <>
                ✓ {match.subject} · contract value{" "}
                <b>
                  {formatMoney(match.amount)} {match.currency}
                </b>{" "}
                · already invoiced {formatMoney(match.invoiced)}
                {afterThis !== null && (
                  <>
                    {" "}
                    · balance after this invoice{" "}
                    <b style={{ color: afterThis < -0.005 ? "var(--brick)" : undefined }}>
                      {formatMoney(afterThis)} {match.currency}
                    </b>
                  </>
                )}
                {!sameCurrency && ` · ⚠ contract currency is ${match.currency}`}
              </>
            ) : (
              "No contract found with this number"
            )}
          </div>
        )}
      </div>

      <div style={row}>
        <div className="field" style={{ flex: 2, minWidth: 220 }}>
          <label>Supplier</label>
          <input name="supplier" required value={supplier} onChange={(e) => setSupplier(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 140 }}>
          <label>IR # (fills project and budget line)</label>
          <input name="ir_number" value={irNumber} onChange={(e) => onIrChange(e.target.value)} />
          {irNumber.trim() && (
            <div style={{ fontSize: 12, marginTop: 4, color: irRef ? "var(--ink-soft)" : "var(--ink-soft)" }}>
              {irRef
                ? `✓ request found${irRef.project ? ` · project ${irRef.project}` : ""}${irRef.budget ? ` · budget line ${irRef.budget}` : ""}`
                : "IR not found in the app (type project and budget line by hand)"}
            </div>
          )}
        </div>
        <div className="field" style={{ flex: 1, minWidth: 160 }}>
          <label>Protocol</label>
          <input name="protocol" />
        </div>
      </div>

      <div style={row}>
        <div className="field" style={{ flex: 1, minWidth: 130 }}>
          <label>Currency</label>
          <input name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 150 }}>
          <label>Amount</label>
          <MoneyInput name="amount" required value={amount} onValueChange={(v) => setAmount(v)} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 150 }}>
          <label>Withholding</label>
          <MoneyInput name="withholding" />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 130, justifyContent: "flex-end" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input name="pa_signed" type="checkbox" style={{ width: "auto" }} /> PA signed
          </label>
        </div>
      </div>

      <div style={row}>
        <div className="field" style={{ flex: 1, minWidth: 150 }}>
          <label>Due date</label>
          <input name="due_date" type="date" />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 150 }}>
          <label>Payment date</label>
          <input name="payment_date" type="date" />
        </div>
        <div className="field" style={{ flex: 2, minWidth: 220 }}>
          <label>Payment note</label>
          <input name="payment_note" />
        </div>
      </div>

      <div style={row}>
        <div className="field" style={{ flex: 1, minWidth: 130 }}>
          <label>Project</label>
          <input name="project_code" value={project} onChange={(e) => setProject(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 130 }}>
          <label>Budget line</label>
          <input name="budget_line" value={budget} onChange={(e) => setBudget(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 2, minWidth: 220 }}>
          <label>CUP / AID{projectCup ? " (from Approved projects)" : ""}</label>
          {projectCup ? (
            <input name="cup" value={projectCup} readOnly title="Read from the project in Approved projects" />
          ) : (
            <input name="cup" />
          )}
        </div>
      </div>

      <div className="field">
        <label>Notes</label>
        <input name="notes" />
      </div>

      <div>
        <SubmitButton>Create invoice</SubmitButton>
      </div>
    </form>
  );
}
