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
  const canManage = (myRoles ?? []).some((r) => r.role === "RAC" || r.role === "CAR");

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
    <div style={{ maxWidth: 640, padding: 24 }}>
      <h1 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>Team &amp; roles</h1>
      <p style={{ fontSize: 13, color: "#5f5e5a", marginBottom: 20 }}>
        Each person can have multiple roles at once — segregation of duties is
        checked per individual request, not per person (as in the
        prototype).
      </p>

      {!canManage && (
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
          Only those with the RAC or CAR role can assign roles. You can view the list but
          changes will be rejected by the database.
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        {(profiles ?? []).map((p) => {
          const roles = rolesByUser.get(p.id) ?? [];
          return (
            <div
              key={p.id}
              style={{
                border: "0.5px solid #d3d1c7",
                borderRadius: 10,
                padding: 12,
                marginBottom: 8,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{p.full_name}</div>
                <div style={{ fontSize: 12, color: "#888780" }}>
                  {p.email} ·{" "}
                  {roles.length > 0
                    ? roles.map((r) => ROLE_LABEL[r]).join(", ")
                    : "no role assigned — cannot sign anything yet"}
                </div>
              </div>
              {canManage && roles.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {roles.map((r) => (
                    <form key={r} action={removeRole.bind(null, p.id, r)}>
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

      {canManage && (
        <form action={addRole} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: 12, color: "#5f5e5a", marginBottom: 4 }}>
              Email address of the person (must have already signed in at least once)
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
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#5f5e5a", marginBottom: 4 }}>
              Role to assign
            </label>
            <select
              name="role"
              style={{
                border: "0.5px solid #d3d1c7",
                borderRadius: 6,
                padding: "7px 9px",
                fontSize: 13,
              }}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            style={{
              border: 0,
              borderRadius: 6,
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 500,
              background: "#1A3A5C",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Assign
          </button>
        </form>
      )}
    </div>
  );
}
