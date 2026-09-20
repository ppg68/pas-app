import { createRequest } from "@/lib/domain/workflow";

export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div style={{ maxWidth: 480 }}>
      <h1 style={{ marginBottom: 16 }}>New request</h1>

      {error && <div className="banner error">{decodeURIComponent(error)}</div>}

      <form action={createRequest} className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="field">
          <label>Country (IT for HQ numbering)</label>
          <input name="country" defaultValue="IT" required />
        </div>
        <div className="field">
          <label>Project code</label>
          <input name="project_code" required />
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
            <input name="estimated_price" type="number" step="0.01" min="0.01" required />
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
          <input type="checkbox" name="derogation" /> Derogation (3Q → SQ)
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

        <button type="submit" className="primary" style={{ marginTop: 6, width: "fit-content" }}>
          Create request
        </button>
      </form>
    </div>
  );
}
