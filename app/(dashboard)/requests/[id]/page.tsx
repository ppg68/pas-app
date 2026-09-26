import { createClient } from "@/lib/supabase/server";
import {
  procConfigFor,
  paymentSigners,
  canSign,
  documentsComplete,
  DOCS_BY_PROC,
  OPTIONAL_DOCS,
  FOLDER_NAMES,
  ROLE_LABEL,
  STAGE_TITLES,
  type Role,
} from "@/lib/domain/procedures";
import {
  signIrAuth,
  addOffer,
  closeOffers,
  selectWinner,
  toggleDoc,
  advanceToPayment,
  signPayment,
} from "@/lib/domain/workflow";

const STAGE_ORDER = ["ir_auth", "offers", "winner", "documents", "payment", "completed"] as const;

export default async function RequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();

  const [{ data: request }, { data: userData }] = await Promise.all([
    supabase.from("requests").select("*").eq("id", id).single(),
    supabase.auth.getUser(),
  ]);

  if (!request) {
    return (
      <div style={{ fontSize: 13 }}>Request not found.</div>
    );
  }

  const userId = userData.user?.id ?? "";

  const [{ data: myRoles }, { data: signatures }, { data: offers }, { data: docs }] =
    await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("signatures").select("phase, signer_role, signed_by, signed_at").eq("request_id", id),
      supabase.from("offers").select("id, supplier, price, created_at").eq("request_id", id),
      supabase.from("request_documents").select("doc_key, checked").eq("request_id", id),
    ]);

  const { data: approverRows } = await supabase
    .from("request_approvers")
    .select("signer_role, user_id, notified_at")
    .eq("request_id", id);
  const approverIds = (approverRows ?? []).map((a) => a.user_id);
  const { data: approverProfiles } = approverIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", approverIds)
    : { data: [] as { id: string; full_name: string }[] };
  const approverByRole = new Map(
    (approverRows ?? []).map((a) => [
      a.signer_role as Role,
      {
        name: (approverProfiles ?? []).find((p) => p.id === a.user_id)?.full_name ?? "—",
        notified: !!a.notified_at,
      },
    ])
  );

  const roles = new Set((myRoles ?? []).map((r) => r.role as Role));
  const config = procConfigFor(request.proc_code);
  const stageIndex = STAGE_ORDER.indexOf(request.stage as (typeof STAGE_ORDER)[number]);
  const iCanAct = !request.initiated_by || canSign(userId, request.initiated_by);

  const irSignedRoles = new Map(
    (signatures ?? [])
      .filter((s) => s.phase === "ir_auth")
      .map((s) => [s.signer_role as Role, s])
  );
  const paySignedRoles = new Map(
    (signatures ?? [])
      .filter((s) => s.phase === "payment")
      .map((s) => [s.signer_role as Role, s])
  );
  const paySigners = paymentSigners({
    procCode: request.proc_code,
    coordinationCost: request.coordination_cost,
  });

  const docsMap: Record<string, boolean> = {};
  (docs ?? []).forEach((d) => {
    docsMap[d.doc_key] = d.checked;
  });
  const requiredDocs = DOCS_BY_PROC[request.proc_code];
  const docsOk = documentsComplete(request.proc_code, docsMap, request.folder_path);

  const showOffers = config.minOffers > 0;
  const offersIndex = STAGE_ORDER.indexOf("offers");
  const winnerIndex = STAGE_ORDER.indexOf("winner");
  const documentsIndex = STAGE_ORDER.indexOf("documents");
  const paymentIndex = STAGE_ORDER.indexOf("payment");

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>{request.code}</h1>
        <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>
          {request.description} · {config.label} · {request.estimated_price} {request.currency}
        </div>
        <div
          style={{
            display: "inline-block",
            marginTop: 8,
            fontSize: 11,
            border: "1px solid var(--line)",
            borderRadius: 999,
            padding: "3px 10px",
          }}
        >
          {STAGE_TITLES[request.stage]}
        </div>
      </div>

      {error && (
        <div
          style={{
            background: "var(--amber-soft)",
            color: "#7A5A1C",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {decodeURIComponent(error)}
        </div>
      )}

      {/* IR approval */}
      <div className="card">
        <h2 style={{ fontSize: 14, fontWeight: 500, marginBottom: 10 }}>IR approval</h2>
        {config.signers.map((role) => {
          const signed = irSignedRoles.get(role);
          const canShowButton =
            request.stage === "ir_auth" && !signed && roles.has(role) && iCanAct;
          return (
            <div
              key={role}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: 13,
                padding: "6px 0",
              }}
            >
              <span>
                {ROLE_LABEL[role]} — {signed ? "signed" : "pending"}
                {approverByRole.get(role) && (
                  <span style={{ color: "var(--ink-soft)" }}>
                    {" "}
                    · designated: {approverByRole.get(role)!.name}
                    {approverByRole.get(role)!.notified ? " (notified by email)" : " (not emailed)"}
                  </span>
                )}
              </span>
              {canShowButton && (
                <form action={signIrAuth.bind(null, request.id, role)}>
                  <button type="submit" className="primary">
                    Sign
                  </button>
                </form>
              )}
            </div>
          );
        })}
        {!iCanAct && request.stage === "ir_auth" && (
          <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 8 }}>
            Whoever created this request cannot sign it (segregation of duties).
          </p>
        )}
      </div>

      {/* Offers */}
      {showOffers && stageIndex >= offersIndex && (
        <div className="card">
          <h2 style={{ fontSize: 14, fontWeight: 500, marginBottom: 10 }}>
            Offers (minimum {config.minOffers})
          </h2>
          {(offers ?? []).length === 0 && (
            <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>No offers yet.</p>
          )}
          {(offers ?? []).map((o) => (
            <div key={o.id} style={{ fontSize: 13, padding: "4px 0" }}>
              {o.supplier} — {o.price} {request.currency}
              {request.winner_offer_id === o.id && (
                <strong style={{ color: "var(--navy)" }}> · winner</strong>
              )}
            </div>
          ))}

          {request.stage === "offers" && (
            <>
              <form
                action={addOffer.bind(null, request.id)}
                style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "flex-end" }}
              >
                <div>
                  <label>
                    Supplier
                  </label>
                  <input name="supplier" required />
                </div>
                <div>
                  <label>
                    Price
                  </label>
                  <input name="price" type="number" step="0.01" min="0.01" required />
                </div>
                <button type="submit" className="primary">
                  Add
                </button>
              </form>

              {(offers ?? []).length >= config.minOffers && (
                <form action={closeOffers.bind(null, request.id)} style={{ marginTop: 10 }}>
                  <button type="submit" className="primary">
                    Close offer collection
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      )}

      {/* Winner */}
      {showOffers && stageIndex >= winnerIndex && (
        <div className="card">
          <h2 style={{ fontSize: 14, fontWeight: 500, marginBottom: 10 }}>Winner</h2>
          {request.stage === "winner" ? (
            <form action={selectWinner.bind(null, request.id)} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(offers ?? []).map((o) => (
                <label key={o.id} style={{ fontSize: 13, display: "flex", gap: 6 }}>
                  <input type="radio" name="offer_id" value={o.id} required />
                  {o.supplier} — {o.price} {request.currency}
                </label>
              ))}
              <input name="note" placeholder="Note (optional)" />
              <button type="submit" className="primary" style={{ width: "fit-content" }}>
                Confirm winner
              </button>
            </form>
          ) : (
            <p style={{ fontSize: 13 }}>
              {request.winner_offer_id
                ? (offers ?? []).find((o) => o.id === request.winner_offer_id)?.supplier
                : "—"}
              {request.winner_note ? ` · ${request.winner_note}` : ""}
            </p>
          )}
        </div>
      )}

      {/* Documents */}
      {stageIndex >= documentsIndex && (
        <div className="card">
          <h2 style={{ fontSize: 14, fontWeight: 500, marginBottom: 10 }}>Documents</h2>
          {requiredDocs.map((docKey) => {
            const checked = !!docsMap[docKey];
            const optional = OPTIONAL_DOCS.has(docKey);
            return (
              <div
                key={docKey}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: 13,
                  padding: "6px 0",
                }}
              >
                <span>
                  {FOLDER_NAMES[docKey]} {optional && "(optional)"} —{" "}
                  {checked ? "completed" : "to do"}
                </span>
                {request.stage === "documents" && (
                  <form action={toggleDoc.bind(null, request.id, docKey, !checked)}>
                    <button
                      type="submit"
                      style={{
                        border: "1px solid var(--line)",
                        borderRadius: 999,
                        padding: "3px 10px",
                        fontSize: 11,
                        background: "transparent",
                        cursor: "pointer",
                      }}
                    >
                      {checked ? "Undo" : "Mark complete"}
                    </button>
                  </form>
                )}
              </div>
            );
          })}

          {request.stage === "documents" ? (
            <form
              action={advanceToPayment.bind(null, request.id)}
              style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "flex-end" }}
            >
              <div style={{ flex: 1 }}>
                <label>
                  Folder path
                </label>
                <input
                  name="folder_path"
                  defaultValue={request.folder_path ?? ""}
                  required
                  
                />
              </div>
              <button type="submit" disabled={!docsOk} className="primary">
                Go to payment
              </button>
            </form>
          ) : (
            request.folder_path && (
              <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 8 }}>
                Folder: {request.folder_path}
              </p>
            )
          )}
        </div>
      )}

      {/* Payment */}
      {stageIndex >= paymentIndex && (
        <div className="card">
          <h2 style={{ fontSize: 14, fontWeight: 500, marginBottom: 10 }}>Payment</h2>
          {paySigners.map((role) => {
            const signed = paySignedRoles.get(role);
            const canShowButton =
              request.stage === "payment" && !signed && roles.has(role) && iCanAct;
            return (
              <div
                key={role}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: 13,
                  padding: "6px 0",
                }}
              >
                <span>
                  {ROLE_LABEL[role]} — {signed ? "signed" : "pending"}
                </span>
                {canShowButton && (
                  <form action={signPayment.bind(null, request.id, role)}>
                    <button type="submit" className="primary">
                      Sign
                    </button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}

      {request.stage === "completed" && (
        <div className="card" style={{ textAlign: "center", color: "var(--navy)", fontWeight: 600 }}>
          Request closed
        </div>
      )}
    </div>
  );
}
