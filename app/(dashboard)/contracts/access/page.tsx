import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { grantContractsAccess, revokeContractsAccess } from "./actions";

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
    <div style={{ maxWidth: 560 }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/contracts" style={{ fontSize: 13, color: "var(--ink-soft)" }}>
          ← Back to Contracts
        </Link>
      </div>

      <h1 style={{ marginBottom: 4 }}>Contracts — access</h1>
      <p className="subtitle" style={{ marginBottom: 20 }}>
        Only the people listed here can see or edit the Contracts module — everyone
        else in PAS, including other roles like RAC/CAR, has no access to it.
      </p>

      {error && <div className="banner error">{decodeURIComponent(error)}</div>}

      {!iHaveAccess && (
        <div className="banner">
          You don&apos;t currently have Contracts access yourself, so you can view this
          list but can&apos;t grant or revoke it.
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        {holders.length === 0 && <p className="empty">Nobody has Contracts access yet.</p>}
        {holders.map((p) => (
          <div key={p.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{p.full_name}</div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{p.email}</div>
            </div>
            {iHaveAccess && (
              <form action={revokeContractsAccess.bind(null, p.id)}>
                <button type="submit" className="pill">
                  Remove ×
                </button>
              </form>
            )}
          </div>
        ))}
      </div>

      {iHaveAccess && (
        <form action={grantContractsAccess} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Email address of the person (must have already signed in to PAS at least once)</label>
            <input name="email" type="email" required placeholder="firstname.lastname@istituto-oikos.org" />
          </div>
          <button type="submit" className="primary">
            Grant access
          </button>
        </form>
      )}
    </div>
  );
}
