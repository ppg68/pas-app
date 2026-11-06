import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/domain/procedures";
import { fetchProjectCups } from "@/lib/domain/projectCups";
import { fetchProjectPms } from "@/lib/domain/projectPm";
import NewRequestForm, { type Candidate } from "@/components/requests/NewRequestForm";

const APPROVER_ROLES: Role[] = ["PM", "CAR", "RAC"];

export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const projectCups = await fetchProjectCups(supabase);

  const [{ data: roleRows }, { data: profiles }, { data: assignmentRows }] = await Promise.all([
    supabase.from("user_roles").select("user_id, role").in("role", APPROVER_ROLES),
    supabase.from("profiles").select("id, full_name, email"),
    supabase.from("project_assignments").select("project_code, pm_user_id, car_user_id"),
  ]);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const candidates: Partial<Record<Role, Candidate[]>> = {};
  (roleRows ?? []).forEach((r) => {
    // The creator can never sign their own request, so they are not offered.
    if (r.user_id === user?.id) return;
    const p = profileById.get(r.user_id);
    if (!p?.email) return;
    const role = r.role as Role;
    (candidates[role] ??= []).push({ id: p.id, name: p.full_name, email: p.email });
  });
  Object.values(candidates).forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));

  const { data: myRoleRows } = await supabase.from("user_roles").select("role").eq("user_id", user?.id ?? "");
  const creatorHasPmRole = (myRoleRows ?? []).some((r) => r.role === "PM");

  const assignments: Record<string, Partial<Record<"PM" | "CAR", string>>> = {};
  (assignmentRows ?? []).forEach((a) => {
    assignments[a.project_code] = {
      ...(a.pm_user_id ? { PM: a.pm_user_id } : {}),
      ...(a.car_user_id ? { CAR: a.car_user_id } : {}),
    };
  });

  // the PM written in the project card (Progetti approvati) wins over the old project_assignments table
  const projectPms = await fetchProjectPms(supabase);
  Object.entries(projectPms).forEach(([code, pmId]) => {
    assignments[code] = { ...(assignments[code] ?? {}), PM: pmId };
  });

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ marginBottom: 16 }}>New request</h1>

      {error && <div className="banner error">{error}</div>}

      <NewRequestForm candidates={candidates} assignments={assignments} projectCups={projectCups} creatorId={user?.id ?? ""} creatorHasPmRole={creatorHasPmRole} />
    </div>
  );
}
