import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { grantContractsAccess, revokeContractsAccess } from "./actions";

const cardStyle: React.CSSProperties = {
  border: "0.5px solid #d3d1c7",
  borderRadius: 10,
  padding: 12,
  marginBottom: 8,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};
const buttonStyle: React.CSSProperties = {
  border: 0,
  borderRadius: 6,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 500,
  background: "#1A3A5C",
  color: "#fff",
  cursor: "pointer",
};

export default async function ContractsAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: myRoles }, { data: contractRoles }, { data: profiles }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", user?.id ?? ""),
    supabase.from("user_roles").select("user_id").eq("role", "CONTRACTS"),
    supabase.from("profiles").select("id, full_name, email"),
  ]);

  const iHaveAccess = (myRoles ?? []).some((r) => r.role === "CONTRACTS");
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const holders = (contractRoles ?? [])
    .map((r) => profileById.get(r.user_id))
    .filter((p): p is { id: string; full_name: string; email: string | null } => !!p);

  return (
    <div style={{ maxWidth: 560, padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/contracts" style={{ fontSize: 13, color: "#5f5e5a" }}>
          ← Back to Contracts
        </Link>
      </div>

      <h1 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>Contracts — access</h1>
      <p style={{ fontSize: 13, color: "#5f5e5a", marginBottom: 20 }}>
        Only the people listed here can see or edit the Contracts module — everyone
        else in PAS, including other roles like RAC/CAR, has no access to it.
      </p>

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

      {!iHaveAccess && (
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
          You don&apos;t currently have Contracts access yourself, so you can view this
          list but can&apos;t grant or revoke it.
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        {holders.length === 0 && (
          <p style={{ fontSize: 13, color: "#888780" }}>Nobody has Contracts access yet.</p>
        )}
        {holders.map((p) => (
          <div key={p.id} style={cardStyle}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{p.full_name}</div>
              <div style={{ fontSize: 12, color: "#888780" }}>{p.email}</div>
            </div>
            {iHaveAccess && (
              <form action={revokeContractsAccess.bind(null, p.id)}>
                <button
                  type="submit"
                  style={{
                    border: "0.5px solid #b4b2a9",
                    borderRadius: 999,
                    padding: "3px 10px",
                    fontSize: 11,
                    background: "transparent",
                    cursor: "pointer",
                  }}
                >
                  Remove ×
                </button>
              </form>
            )}
          </div>
        ))}
      </div>

      {iHaveAccess && (
        <form action={grantContractsAccess} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: 12, color: "#5f5e5a", marginBottom: 4 }}>
              Email address of the person (must have already signed in to PAS at least once)
            </label>
            <input
              name="email"
              type="email"
              required
              placeholder="firstname.lastname@istituto-oikos.org"
              style={{
                width: "100%",
                boxSizing: "border-box",
                border: "0.5px solid #d3d1c7",
                borderRadius: 6,
                padding: "7px 9px",
                fontSize: 13,
              }}
            />
          </div>
          <button type="submit" style={buttonStyle}>
            Grant access
          </button>
        </form>
      )}
    </div>
  );
}
