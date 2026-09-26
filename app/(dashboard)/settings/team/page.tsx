import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL, ROLES, type Role } from "@/lib/domain/procedures";
import { addRole, removeRole } from "./actions";

export default async function TeamSettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: myRoles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user?.id ?? "");
  // Team is admin-only: everyone else is sent back to the request list.
  if (!(myRoles ?? []).some((r) => r.role === "ADMIN")) redirect("/");

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .order("full_name");
  const { data: allRoles } = await supabase.from("user_roles").select("user_id, role");

  const rolesByUser = new Map<string, Role[]>();
  (allRoles ?? []).forEach((r) => {
    const list = rolesByUser.get(r.user_id) ?? [];
    list.push(r.role as Role);
    rolesByUser.set(r.user_id, list);
  });

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ marginBottom: 4 }}>Team &amp; roles</h1>
      <p className="subtitle" style={{ marginBottom: 20 }}>
        Each person can have multiple roles at once — segregation of duties is
        checked per individual request, not per person (as in the prototype).
      </p>


      <div style={{ marginBottom: 24 }}>
        {(profiles ?? []).map((p) => {
          const roles = rolesByUser.get(p.id) ?? [];
          return (
            <div
              key={p.id}
              className="card"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{p.full_name}</div>
                <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  {p.email} ·{" "}
                  {roles.length > 0
                    ? roles.map((r) => ROLE_LABEL[r]).join(", ")
                    : "no role assigned — cannot sign anything yet"}
                </div>
              </div>
              {roles.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {roles.map((r) => (
                    <form key={r} action={removeRole.bind(null, p.id, r)}>
                      <button type="submit" className="pill">
                        {ROLE_LABEL[r]} ×
                      </button>
                    </form>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <form action={addRole} style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Email address of the person (must have already signed in at least once)</label>
          <input name="email" type="email" required placeholder="firstname.lastname@istituto-oikos.org" />
        </div>
        <div className="field">
          <label>Role to assign</label>
          <select name="role">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="primary">
          Assign
        </button>
      </form>
    </div>
  );
}
