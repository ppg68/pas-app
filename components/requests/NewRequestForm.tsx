"use client";

import { useState } from "react";
import { createRequest } from "@/lib/domain/workflow";
import {
  effectiveProcCode,
  procConfigFor,
  ROLE_LABEL,
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
}: {
  candidates: Partial<Record<Role, Candidate[]>>;
  assignments: Record<string, Partial<Record<"PM" | "CAR", string>>>;
}) {
  const [project, setProject] = useState("");
  const [amount, setAmount] = useState("");
  const [derogation, setDerogation] = useState(false);
  const [chosen, setChosen] = useState<Partial<Record<Role, string>>>({});

  const price = parseFloat(amount);
  const signers =
    Number.isFinite(price) && price > 0
      ? procConfigFor(effectiveProcCode(price, derogation)).signers
      : [];

  function suggestion(role: Role): string {
    const assigned = assignments[project.trim()]?.[role as "PM" | "CAR"];
    const list = candidates[role] ?? [];
    if (assigned && list.some((c) => c.id === assigned)) return assigned;
    return list.length === 1 ? list[0].id : "";
  }

  return (
    <form action={createRequest} className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="field">
        <label>Country (IT for HQ numbering)</label>
        <input name="country" defaultValue="IT" required />
      </div>
      <div className="field">
        <label>Project code</label>
        <input name="project_code" required value={project} onChange={(e) => setProject(e.target.value)} />
      </div>
      <div className="field">
        <label>Budget line</label>
        <input name="budget_line" required />
      </div>
      <div className="field">
        <label>Description</label>
        <input name="description" required />
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Estimated amount</label>
          <input
            name="estimated_price"
            type="number"
            step="0.01"
            min="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="field" style={{ width: 90 }}>
          <label>Currency</label>
          <input name="currency" defaultValue="EUR" />
        </div>
      </div>
      <div className="field">
        <label>CUP (optional)</label>
        <input name="cup_code" />
      </div>

      <label className="checkbox-row">
        <input
          type="checkbox"
          name="derogation"
          checked={derogation}
          onChange={(e) => setDerogation(e.target.checked)}
        />{" "}
        Derogation (3Q → SQ)
      </label>
      <div className="field">
        <label>Derogation reason (required if checked above)</label>
        <input name="derogation_reason" />
      </div>

      <label className="checkbox-row">
        <input type="checkbox" name="coordination_cost" /> Coordination cost (no linked project)
      </label>
      <label className="checkbox-row">
        <input type="checkbox" name="institutional_activity" /> Institutional activity
      </label>
      <label className="checkbox-row">
        <input type="checkbox" name="occasional_collaborator" /> Occasional collaborator
      </label>

      {signers.length > 0 && (
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Approvers (optional)</div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            Each person you pick receives an email as soon as the request is created. Only registered
            users holding the role are listed.
          </div>
          {signers.map((role) => {
            const list = candidates[role] ?? [];
            const value = chosen[role] ?? suggestion(role);
            return (
              <div className="field" key={role}>
                <label>{ROLE_LABEL[role]}</label>
                <select
                  name={`approver_${role}`}
                  value={value}
                  onChange={(e) => setChosen((c) => ({ ...c, [role]: e.target.value }))}
                >
                  <option value="">— none, assign later —</option>
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

      <button type="submit" className="primary" style={{ marginTop: 6, width: "fit-content" }}>
        Create request
      </button>
    </form>
  );
}
