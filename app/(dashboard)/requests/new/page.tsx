import { createRequest } from "@/lib/domain/workflow";

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "0.5px solid #d3d1c7",
  borderRadius: 6,
  padding: "8px 10px",
  fontSize: 14,
};
const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "#5f5e5a",
  marginBottom: 4,
};

export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div style={{ maxWidth: 480, padding: 24 }}>
      <h1 style={{ fontSize: 18, fontWeight: 500, marginBottom: 16 }}>New request</h1>

      {error && (
        <div
          style={{
            background: "#faeeda",
            color: "#633806",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {decodeURIComponent(error)}
        </div>
      )}

      <form action={createRequest} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label style={labelStyle}>Country (IT for HQ numbering)</label>
          <input name="country" defaultValue="IT" required style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Project code</label>
          <input name="project_code" required style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Budget line</label>
          <input name="budget_line" required style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Description</label>
          <input name="description" required style={inputStyle} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Estimated amount</label>
            <input
              name="estimated_price"
              type="number"
              step="0.01"
              min="0.01"
              required
              style={inputStyle}
            />
          </div>
          <div style={{ width: 90 }}>
            <label style={labelStyle}>Currency</label>
            <input name="currency" defaultValue="EUR" style={inputStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>CUP (optional)</label>
          <input name="cup_code" style={inputStyle} />
        </div>

        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" name="derogation" /> Derogation (3Q → SQ)
        </label>
        <div>
          <label style={labelStyle}>Derogation reason (required if checked above)</label>
          <input name="derogation_reason" style={inputStyle} />
        </div>

        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" name="coordination_cost" /> Coordination cost (no
          linked project)
        </label>
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" name="institutional_activity" /> Institutional activity
        </label>
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" name="occasional_collaborator" /> Occasional collaborator
        </label>

        <button
          type="submit"
          style={{
            border: 0,
            borderRadius: 6,
            padding: "9px 14px",
            fontSize: 14,
            fontWeight: 500,
            background: "#1A3A5C",
            color: "#fff",
            cursor: "pointer",
            marginTop: 8,
          }}
        >
          Create request
        </button>
      </form>
    </div>
  );
}
