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

const cardStyle: React.CSSProperties = {
  border: "0.5px solid #d3d1c7",
  borderRadius: 10,
  padding: 16,
  marginBottom: 16,
};
const inputStyle: React.CSSProperties = {
  border: "0.5px solid #d3d1c7",
  borderRadius: 6,
  padding: "7px 9px",
  fontSize: 13,
};
const buttonStyle: React.CSSProperties = {
  border: 0,
  borderRadius: 6,
  padding: "7px 12px",
  fontSize: 13,
  fontWeight: 500,
  background: "#1A3A5C",
  color: "#fff",
  cursor: "pointer",
};

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
      <div style={{ padding: 24, fontSize: 13 }}>Richiesta non trovata.</div>
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

  const roles = new Set((myRoles ?? []).map((r) => r.role as Role));
  const config = procConfigFor(request.proc_code);
  const stageIndex = STAGE_ORDER.indexOf(request.stage as (typeof STAGE_ORDER)[number]);
  const iCanAct = canSign(userId, request.initiated_by);

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
    <div style={{ maxWidth: 700, padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>{request.code}</h1>
        <div style={{ fontSize: 13, color: "#5f5e5a" }}>
          {request.description} · {config.label} · {request.estimated_price} {request.currency}
        </div>
        <div
          style={{
            display: "inline-block",
            marginTop: 8,
            fontSize: 11,
            border: "0.5px solid #b4b2a9",
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

      {/* IR approval */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: 14, fontWeight: 500, marginBottom: 10 }}>Approvazione IR</h2>
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
                {ROLE_LABEL[role]} — {signed ? "firmato" : "in attesa"}
              </span>
              {canShowButton && (
                <form action={signIrAuth.bind(null, request.id, role)}>
                  <button type="submit" style={buttonStyle}>
                    Firma
                  </button>
                </form>
              )}
            </div>
          );
        })}
        {!iCanAct && request.stage === "ir_auth" && (
          <p style={{ fontSize: 12, color: "#888780", marginTop: 8 }}>
            Chi ha creato questa richiesta non può firmarla (segregazione dei compiti).
          </p>
        )}
      </div>

      {/* Offerte */}
      {showOffers && stageIndex >= offersIndex && (
        <div style={cardStyle}>
          <h2 style={{ fontSize: 14, fontWeight: 500, marginBottom: 10 }}>
            Offerte (minimo {config.minOffers})
          </h2>
          {(offers ?? []).length === 0 && (
            <p style={{ fontSize: 13, color: "#888780" }}>Nessuna offerta ancora.</p>
          )}
          {(offers ?? []).map((o) => (
            <div key={o.id} style={{ fontSize: 13, padding: "4px 0" }}>
              {o.supplier} — {o.price} {request.currency}
              {request.winner_offer_id === o.id && (
                <strong style={{ color: "#1A3A5C" }}> · vincitore</strong>
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
                  <label style={{ display: "block", fontSize: 12, color: "#5f5e5a" }}>
                    Fornitore
                  </label>
                  <input name="supplier" required style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: "#5f5e5a" }}>
                    Prezzo
                  </label>
                  <input name="price" type="number" step="0.01" min="0.01" required style={inputStyle} />
                </div>
                <button type="submit" style={buttonStyle}>
                  Aggiungi
                </button>
              </form>

              {(offers ?? []).length >= config.minOffers && (
                <form action={closeOffers.bind(null, request.id)} style={{ marginTop: 10 }}>
                  <button type="submit" style={buttonStyle}>
                    Chiudi raccolta offerte
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      )}

      {/* Vincitore */}
      {showOffers && stageIndex >= winnerIndex && (
        <div style={cardStyle}>
          <h2 style={{ fontSize: 14, fontWeight: 500, marginBottom: 10 }}>Vincitore</h2>
          {request.stage === "winner" ? (
            <form action={selectWinner.bind(null, request.id)} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(offers ?? []).map((o) => (
                <label key={o.id} style={{ fontSize: 13, display: "flex", gap: 6 }}>
                  <input type="radio" name="offer_id" value={o.id} required />
                  {o.supplier} — {o.price} {request.currency}
                </label>
              ))}
              <input name="note" placeholder="Nota (opzionale)" style={inputStyle} />
              <button type="submit" style={{ ...buttonStyle, width: "fit-content" }}>
                Conferma vincitore
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

      {/* Documenti */}
      {stageIndex >= documentsIndex && (
        <div style={cardStyle}>
          <h2 style={{ fontSize: 14, fontWeight: 500, marginBottom: 10 }}>Documenti</h2>
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
                  {FOLDER_NAMES[docKey]} {optional && "(opzionale)"} —{" "}
                  {checked ? "completato" : "da fare"}
                </span>
                {request.stage === "documents" && (
                  <form action={toggleDoc.bind(null, request.id, docKey, !checked)}>
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
                      {checked ? "Annulla" : "Segna completo"}
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
                <label style={{ display: "block", fontSize: 12, color: "#5f5e5a" }}>
                  Percorso cartella
                </label>
                <input
                  name="folder_path"
                  defaultValue={request.folder_path ?? ""}
                  required
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                />
              </div>
              <button type="submit" disabled={!docsOk} style={buttonStyle}>
                Vai al pagamento
              </button>
            </form>
          ) : (
            request.folder_path && (
              <p style={{ fontSize: 12, color: "#888780", marginTop: 8 }}>
                Cartella: {request.folder_path}
              </p>
            )
          )}
        </div>
      )}

      {/* Pagamento */}
      {stageIndex >= paymentIndex && (
        <div style={cardStyle}>
          <h2 style={{ fontSize: 14, fontWeight: 500, marginBottom: 10 }}>Pagamento</h2>
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
                  {ROLE_LABEL[role]} — {signed ? "firmato" : "in attesa"}
                </span>
                {canShowButton && (
                  <form action={signPayment.bind(null, request.id, role)}>
                    <button type="submit" style={buttonStyle}>
                      Firma
                    </button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}

      {request.stage === "completed" && (
        <div style={{ ...cardStyle, textAlign: "center", color: "#1A3A5C", fontWeight: 500 }}>
          Richiesta chiusa
        </div>
      )}
    </div>
  );
}
