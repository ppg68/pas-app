import { createClient } from "@/lib/supabase/server";
import RequestsExplorer from "@/components/requests/RequestsExplorer";
import { fetchProjectCups, cupForProject } from "@/lib/domain/projectCups";

export default async function RequestListPage() {
  const supabase = await createClient();
  const { data: requestsRaw } = await supabase
    .from("requests")
    .select(
      "id, code, country, project_code, budget_line, description, estimated_price, currency, proc_code, derogation, derogation_reason, coordination_cost, cup_code, institutional_activity, occasional_collaborator, stage, winner_offer_id, folder_path, ir_number, legacy_protocol, pm_required, created_at, initiated_by, legacy_initiator_name"
    )
    .order("created_at", { ascending: false });

  // the CUP of the project (Approved projects) wins over what was stored on the request
  const projectCups = await fetchProjectCups(supabase);
  const requests = (requestsRaw ?? []).map((r) => ({
    ...r,
    cup_code: cupForProject(projectCups, r.project_code) ?? r.cup_code,
  }));

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: myRoles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user?.id ?? "");
  const canDelete = (myRoles ?? []).some((r) => r.role === "ADMIN");

  const [{ data: myApprovals }, { data: irSignatures }] = await Promise.all([
    supabase.from("request_approvers").select("request_id, signer_role").eq("user_id", user?.id ?? ""),
    supabase.from("signatures").select("request_id, signer_role").eq("phase", "ir_auth"),
  ]);
  const signedKeys = new Set((irSignatures ?? []).map((s) => `${s.request_id}:${s.signer_role}`));
  const pmRequiredIds = new Set(requests.filter((r) => r.pm_required).map((r) => r.id));
  const awaitingMeIds = new Set(
    (myApprovals ?? [])
      // the PM signs only on requests where the PM signature is required (older ones: for information)
      .filter(
        (a) =>
          (a.signer_role !== "PM" || pmRequiredIds.has(a.request_id)) &&
          !signedKeys.has(`${a.request_id}:${a.signer_role}`)
      )
      .map((a) => a.request_id)
  );

  const requestIds = (requests ?? []).map((r) => r.id);
  const initiatorIds = Array.from(
    new Set((requests ?? []).map((r) => r.initiated_by).filter((id): id is string => !!id))
  );

  // Offers are read in batches: one "in (...)" with ~800 ids makes the request URL too long and the whole
  // query fails (the supplier column went empty).
  const OFFER_BATCH = 100;
  const offerBatches: Promise<{ id: string; request_id: string; supplier: string }[]>[] = [];
  for (let i = 0; i < requestIds.length; i += OFFER_BATCH) {
    const ids = requestIds.slice(i, i + OFFER_BATCH);
    offerBatches.push(
      (async () => {
        const { data } = await supabase.from("offers").select("id, request_id, supplier").in("request_id", ids);
        return (data ?? []) as { id: string; request_id: string; supplier: string }[];
      })()
    );
  }

  const [{ data: initiators }, offerChunks] = await Promise.all([
    initiatorIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", initiatorIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    Promise.all(offerBatches),
  ]);
  const offers = offerChunks.flat();

  // Accounting protocol(s) of each IR: protocols of the invoices linked to it (kept by Elisa; RLS limits the
  // invoices to the CONTRACTS role) plus the protocol stored on historical requests.
  const protocolsByRequest = new Map<string, string[]>();
  const addProtocol = (requestId: string, protocol: string | null | undefined) => {
    const p = (protocol ?? "").trim();
    if (!p) return;
    const list = protocolsByRequest.get(requestId) ?? [];
    if (!list.includes(p)) list.push(p);
    protocolsByRequest.set(requestId, list);
  };
  for (let from = 0; ; from += 1000) {
    const { data: invs } = await supabase
      .from("invoices")
      .select("request_id, protocol")
      .not("request_id", "is", null)
      .not("protocol", "is", null)
      .order("created_at", { ascending: true })
      .range(from, from + 999);
    (invs ?? []).forEach((i) => addProtocol(i.request_id as string, i.protocol));
    if (!invs || invs.length < 1000) break;
  }
  // protocols typed on the invoices uploaded in the "Procedure files" box (they stay after the archiving)
  for (let from = 0; ; from += 1000) {
    const { data: fileProtocols } = await supabase
      .from("request_files")
      .select("request_id, protocol")
      .eq("doc_key", "07")
      .not("protocol", "is", null)
      .order("uploaded_at", { ascending: true })
      .range(from, from + 999);
    (fileProtocols ?? []).forEach((f) => addProtocol(f.request_id, f.protocol));
    if (!fileProtocols || fileProtocols.length < 1000) break;
  }
  requests.forEach((r) => addProtocol(r.id, r.legacy_protocol));

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
      awaitingMe: r.stage === "ir_auth" && awaitingMeIds.has(r.id),
      initiatedByName:
        (r.initiated_by ? nameById.get(r.initiated_by) : undefined) ?? r.legacy_initiator_name ?? "",
      winnerSupplier: r.winner_offer_id
        ? requestOffers.find((o) => o.id === r.winner_offer_id)?.supplier ?? ""
        : "",
      offersCount: requestOffers.length,
      protocol: (protocolsByRequest.get(r.id) ?? []).join(" · "),
    };
  });

  return (
    <div>
      <h1 style={{ marginBottom: 20 }}>Requests</h1>
      <RequestsExplorer requests={rows} canDelete={canDelete} />
    </div>
  );
}
