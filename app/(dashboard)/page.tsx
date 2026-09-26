import { createClient } from "@/lib/supabase/server";
import RequestsExplorer from "@/components/requests/RequestsExplorer";

export default async function RequestListPage() {
  const supabase = await createClient();
  const { data: requests } = await supabase
    .from("requests")
    .select(
      "id, code, country, project_code, budget_line, description, estimated_price, currency, proc_code, derogation, derogation_reason, coordination_cost, cup_code, institutional_activity, occasional_collaborator, stage, winner_offer_id, folder_path, created_at, initiated_by, legacy_initiator_name"
    )
    .order("created_at", { ascending: false });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: myRoles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user?.id ?? "");
  const canDelete = (myRoles ?? []).some((r) => r.role === "ADMIN");

  const requestIds = (requests ?? []).map((r) => r.id);
  const initiatorIds = Array.from(
    new Set((requests ?? []).map((r) => r.initiated_by).filter((id): id is string => !!id))
  );

  const [{ data: initiators }, { data: offers }] = await Promise.all([
    initiatorIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", initiatorIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    requestIds.length
      ? supabase.from("offers").select("id, request_id, supplier").in("request_id", requestIds)
      : Promise.resolve({ data: [] as { id: string; request_id: string; supplier: string }[] }),
  ]);

  const nameById = new Map((initiators ?? []).map((p) => [p.id, p.full_name]));
  const offersByRequest = new Map<string, { id: string; supplier: string }[]>();
  (offers ?? []).forEach((o) => {
    const list = offersByRequest.get(o.request_id) ?? [];
    list.push({ id: o.id, supplier: o.supplier });
    offersByRequest.set(o.request_id, list);
  });

  const rows = (requests ?? []).map((r) => {
    const requestOffers = offersByRequest.get(r.id) ?? [];
    return {
      ...r,
      initiatedByName:
        (r.initiated_by ? nameById.get(r.initiated_by) : undefined) ?? r.legacy_initiator_name ?? "",
      winnerSupplier: r.winner_offer_id
        ? requestOffers.find((o) => o.id === r.winner_offer_id)?.supplier ?? ""
        : "",
      offersCount: requestOffers.length,
    };
  });

  return (
    <div>
      <h1 style={{ marginBottom: 20 }}>Requests</h1>
      <RequestsExplorer requests={rows} canDelete={canDelete} />
    </div>
  );
}
