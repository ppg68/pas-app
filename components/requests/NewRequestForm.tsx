"use client";

import { useState } from "react";
import MoneyInput from "@/components/MoneyInput";
import SubmitButton from "@/components/SubmitButton";
import { createRequest } from "@/lib/domain/workflow";
import { cupForProject } from "@/lib/domain/projectCups";
import ApprovalLevelsTable from "@/components/requests/ApprovalLevelsTable";
import {
  computeProcedure,
  isDerogation,
  PROC_CONFIG,
  type ProcCode,
  irSlots,
  pmSigns,
  creatorIsProjectPm,
  byProjectCode,
  slotLabel,
  type Role,
} from "@/lib/domain/procedures";

export type Candidate = { id: string; name: string; email: string };

/**
 * New-request form. The optional "approvers" block follows the procedure: the
 * signers required for the typed amount (and derogation) each get a picker of the
 * registered people who hold that role. Suggestion = the project's assigned PM/CAR
 * (project_assignments) or, failing that, the only person holding the role.
 */
export default function NewRequestForm({
  candidates,
  assignments,
  projectCups,
  creatorId,
  creatorHasPmRole,
}: {
  candidates: Partial<Record<Role, Candidate[]>>;
  assignments: Record<string, Partial<Record<"PM" | "CAR", string>>>;
  projectCups: Record<string, string>;
  creatorId: string;
  /** has the PM role (used only when the project has no PM assigned) */
  creatorHasPmRole: boolean;
}) {
  const [project, setProject] = useState("");
  const [amount, setAmount] = useState("");
  const [procChoice, setProcChoice] = useState<ProcCode | "">("");
  const [coordination, setCoordination] = useState(false);
  const [derogationFlag, setDerogationFlag] = useState(false);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [compileAsPm, setCompileAsPm] = useState(false);

  const projectCup = cupForProject(projectCups, project);
  // the PM signature is skipped only when the person compiling is the PM of THIS project (not just any PM)
  const creatorIsPm = creatorIsProjectPm({
    creatorId,
    creatorHasPmRole,
    assignedPmId: byProjectCode(assignments, project)?.PM,
    declaredAsPm: compileAsPm,
  });
  // project without a PM assigned and a creator who holds the PM role: ask in which capacity they compile
  const askCapacity = creatorHasPmRole && !byProjectCode(assignments, project)?.PM;
  const price = parseFloat(amount);
  const validPrice = Number.isFinite(price) && price > 0;
  // the amount only suggests the procedure; whoever compiles the request decides (budget line of the project)
  const indicated = validPrice ? computeProcedure(price) : null;
  const proc: ProcCode | null = procChoice || indicated;
  // automatic when the amount is in the 3Q range but SQ is chosen; otherwise ticked by hand
  const autoDerogation = !!proc && validPrice && isDerogation(proc, price);
  const derogation = autoDerogation || derogationFlag;
  const slots = proc
    ? irSlots({
        procCode: proc,
        coordinationCost: coordination,
        derogation,
        pmRequired: pmSigns(proc, coordination, creatorIsPm),
      })
    : [];

  // people who can fill a slot: holders of any of its roles (CAR or RAC for the administration slot)
  function slotCandidates(roles: Role[]): Candidate[] {
    const seen = new Set<string>();
    const out: Candidate[] = [];
    for (const r of roles) {
      for (const c of candidates[r] ?? []) {
        if (!seen.has(c.id)) {
          seen.add(c.id);
          out.push(c);
        }
      }
    }
    return out.sort((x, y) => x.name.localeCompare(y.name));
  }

  function suggestion(roles: Role[]): string {
    const list = slotCandidates(roles);
    for (const r of roles) {
      const assigned = r === "PM" || r === "CAR" ? assignments[project.trim()]?.[r] : undefined;
      if (assigned && list.some((c) => c.id === assigned)) return assigned;
    }
    return list.length === 1 ? list[0].id : "";
  }

  return (
    <>
    <ApprovalLevelsTable current={proc} />
    <form action={createRequest} className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="field">
        <label>Country (IT for HQ numbering)<span style={{ color: "var(--brick)" }} title="Required"> *</span></label>
        <input name="country" defaultValue="IT" required />
      </div>
      <div className="field">
        <label>Project code<span style={{ color: "var(--brick)" }} title="Required"> *</span></label>
        <input name="project_code" required value={project} onChange={(e) => setProject(e.target.value)} />
      </div>
      <div className="field">
        <label>Budget line<span style={{ color: "var(--brick)" }} title="Required"> *</span></label>
        <input name="budget_line" required />
      </div>
      <div className="field">
        <label>Description<span style={{ color: "var(--brick)" }} title="Required"> *</span></label>
        <input name="description" required />
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Estimated amount<span style={{ color: "var(--brick)" }} title="Required"> *</span></label>
          <MoneyInput name="estimated_price" required value={amount} onValueChange={(v) => setAmount(v)} />
        </div>
        <div className="field" style={{ width: 90 }}>
          <label>Currency</label>
          <input name="currency" defaultValue="EUR" />
        </div>
      </div>
      <div className="field">
        <label>CUP\AID{projectCup ? " (from Approved projects)" : ""}</label>
        {projectCup ? (
          <input name="cup_code" value={projectCup} readOnly title="Read from the project in Approved projects" />
        ) : (
          <input name="cup_code" />
        )}
      </div>

      <div className="field">
        <label>Procedure<span style={{ color: "var(--brick)" }} title="Required"> *</span></label>
        <select name="proc_code" required value={proc ?? ""} onChange={(e) => setProcChoice(e.target.value as ProcCode)}>
          <option value="" disabled>
            — choose the procedure —
          </option>
          {PROC_CONFIG.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.label}
            </option>
          ))}
        </select>
        <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>
          You decide: it follows the budget line of the project (for example, if the budget line needs Three Quotations,
          every purchase on it does, whatever the amount).
          {indicated && ` The amount alone would indicate ${indicated}.`}
        </div>
      </div>
      <div className="field">
        <label>Donor Procedure Type (if applicable):</label>
        <input name="donor_procedure" />
      </div>
      <label className="checkbox-row">
        <input
          type="checkbox"
          name="derogation"
          checked={derogation}
          disabled={autoDerogation}
          onChange={(e) => setDerogationFlag(e.target.checked)}
        />{" "}
        Derogation from the procedure
      </label>
      {derogation && (
        <div className="field">
          <label>Reason supporting the derogation (required)</label>
          <input name="derogation_reason" required />
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>
            CAR and RAC both sign the IR approval.
          </div>
        </div>
      )}

      <label className="checkbox-row">
        <input
          type="checkbox"
          name="coordination_cost"
          checked={coordination}
          onChange={(e) => setCoordination(e.target.checked)}
        />{" "}
        Coordination cost (no linked project)
      </label>
      <label className="checkbox-row">
        <input type="checkbox" name="institutional_activity" /> Institutional activity
      </label>
      <label className="checkbox-row">
        <input type="checkbox" name="occasional_collaborator" /> Occasional collaborator
      </label>

      {slots.length > 0 && (
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Approvers (required)</div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            Every expense needs the administration (CAR or RAC); above a direct purchase the PM signs as well.
            Choose who must sign: the request cannot be created without an approver for each signature.
            Each person you pick receives an email as soon as the request is created. Only registered
            users holding the role are listed.
          </div>
          {askCapacity && proc && proc !== "DIR" && !coordination && (
            <div className="field" style={{ gap: 4 }}>
              <label>I am compiling this request as</label>
              <label className="checkbox-row">
                <input type="radio" name="compile_as" value="bh" checked={!compileAsPm} onChange={() => setCompileAsPm(false)} />{" "}
                Budget Holder — the PM of the project signs as well
              </label>
              <label className="checkbox-row">
                <input type="radio" name="compile_as" value="pm" checked={compileAsPm} onChange={() => setCompileAsPm(true)} />{" "}
                PM of this project — only the administration (CAR or RAC) signs
              </label>
            </div>
          )}
          {creatorIsPm && proc && proc !== "DIR" && (
            <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              You are the PM of this project: your signature is not requested (nobody signs their own request).
            </div>
          )}
          {slots.map((slot) => {
            const list = slotCandidates(slot.roles);
            const value = chosen[slot.id] ?? suggestion(slot.roles);
            return (
              <div className="field" key={slot.id}>
                <label>{slotLabel(slot)}</label>
                <select
                  name={`approver_${slot.id}`}
                  required
                  value={value}
                  onChange={(e) => setChosen((c) => ({ ...c, [slot.id]: e.target.value }))}
                >
                  <option value="">— choose the approver —</option>
                  {list.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.email})
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}

      <SubmitButton style={{ marginTop: 6, width: "fit-content" }}>Create request</SubmitButton>
    </form>
    </>
  );
}
