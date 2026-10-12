import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL, ROLES, type Role } from "@/lib/domain/procedures";
import { addRole, removeRole, cancelPending } from "./actions";
import RemovePersonButton from "./RemovePersonButton";
import ConfirmForm from "@/components/ConfirmForm";

export default async function TeamSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
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

  const { data: pending } = await supabase
    .from("pending_roles")
    .select("email, role")
    .order("email");

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
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end" }}>
                {roles.map((r) => (
                  <ConfirmForm
                    key={r}
                    action={removeRole.bind(null, p.id, r)}
                    message={`Remove the role "${ROLE_LABEL[r]}" from ${p.full_name || p.email || "this person"}?`}
                  >
                    <button type="submit" className="pill">
                      {ROLE_LABEL[r]} ×
                    </button>
                  </ConfirmForm>
                ))}
                {p.id !== user?.id && <RemovePersonButton userId={p.id} name={p.full_name || p.email || "this person"} />}
              </div>
            </div>
          );
        })}
      </div>

      {(pending ?? []).length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, marginBottom: 8 }}>Pending — not signed in yet</h2>
          {(pending ?? []).map((p) => (
            <div
              key={`${p.email}-${p.role}`}
              className="card"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{p.email}</div>
                <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  {ROLE_LABEL[p.role as Role]} — applied automatically at first sign-in
                </div>
              </div>
              <ConfirmForm
                action={cancelPending.bind(null, p.email, p.role as Role)}
                message={`Cancel the pending role "${ROLE_LABEL[p.role as Role]}" for ${p.email}?`}
              >
                <button type="submit" className="pill">Cancel ×</button>
              </ConfirmForm>
            </div>
          ))}
        </div>
      )}

      {error && <div className="banner error">{error}</div>}

      <form action={addRole} style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Email address of the person (if they have not signed in yet, the role stays pending)</label>
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
