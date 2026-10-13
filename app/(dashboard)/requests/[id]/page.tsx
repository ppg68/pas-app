import { createClient } from "@/lib/supabase/server";
import { fetchProjectCups, cupForProject } from "@/lib/domain/projectCups";
import {
  procConfigFor,
  paymentSigners,
  irSigners,
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
  authorizePaymentAuth,
} from "@/lib/domain/workflow";
import SubmitButton from "@/components/SubmitButton";
import PaymentAuthorizationForm from "@/components/requests/PaymentAuthorizationForm";

const STAGE_ORDER = ["ir_auth", "offers", "winner", "documents", "payment", "completed"] as const;

/** Date and time of a signature, always in Italian time with seconds (audit trail). */
function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(iso));
}

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

  // names of the people who signed (audit trail shown on the page)
  const signerIds = Array.from(
    new Set((signatures ?? []).map((s) => s.signed_by).filter((v): v is string => !!v))
  );
  const { data: signerProfiles } = signerIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", signerIds)
    : { data: [] as { id: string; full_name: string }[] };
  const signerName = (uid: string | null | undefined) =>
    (signerProfiles ?? []).find((p) => p.id === uid)?.full_name ?? "—";

  const [{ data: payAuths }, { data: requestInvoices }] = await Promise.all([
    supabase
      .from("payment_authorizations")
      .select("*")
      .eq("request_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("invoices")
      .select("id, supplier, amount, currency, protocol, ir_number")
      .eq("request_id", id)
      .order("created_at", { ascending: true }),
  ]);
  const paNameIds = Array.from(
    new Set(
      (payAuths ?? [])
        .flatMap((a) => [a.prepared_by, a.authorized_by])
        .filter((v): v is string => !!v)
    )
  );
  const { data: paProfiles } = paNameIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", paNameIds)
    : { data: [] as { id: string; full_name: string }[] };
  const paName = (uid: string | null | undefined) =>
    (paProfiles ?? []).find((p) => p.id === uid)?.full_name ?? "—";
  const { data: requesterProfile } = request.initiated_by
    ? await supabase.from("profiles").select("full_name, email").eq("id", request.initiated_by).maybeSingle()
    : { data: null };
  const winnerOffer = (offers ?? []).find((o) => o.id === request.winner_offer_id) ?? null;
  const authorizedTotal = (payAuths ?? [])
    .filter((a) => a.status === "authorized")
    .reduce(
      (sum, a) =>
        sum +
        (a.currency === request.currency
          ? a.amount
          : request.currency === "EUR"
            ? (a.euro_equivalent ?? 0)
            : 0),
      0
    );
  const money = (n: number) =>
    n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  const irRoles = irSigners({
    procCode: request.proc_code,
    coordinationCost: request.coordination_cost,
    derogation: request.derogation,
  });
  const paySigners = paymentSigners({
    procCode: request.proc_code,
    coordinationCost: request.coordination_cost,
  });

  const docsMap: Record<string, boolean> = {};
  (docs ?? []).forEach((d) => {
    docsMap[d.doc_key] = d.checked;
  });
  const requiredDocs = DOCS_BY_PROC[request.proc_code];
  const docsOk = documentsComplete(request.proc_code, docsMap);

  const showOffers = config.minOffers > 0;
  const offersIndex = STAGE_ORDER.indexOf("offers");
  const winnerIndex = STAGE_ORDER.indexOf("winner");
  const documentsIndex = STAGE_ORDER.indexOf("documents");
  const paymentIndex = STAGE_ORDER.indexOf("payment");
  const effectiveCup = cupForProject(await fetchProjectCups(supabase), request.project_code) ?? request.cup_code;

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>{request.code}</h1>
        <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>
          {request.description} · {config.label} · {request.estimated_price} {request.currency}
          {effectiveCup ? ` · CUP ${effectiveCup}` : ""}
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

      {/* Request details: everything the approver needs to check before approving */}
      <div className="card">
        <h2 style={{ fontSize: 14, fontWeight: 500, marginBottom: 10 }}>Request details</h2>
        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(150px, 220px) 1fr",
            gap: "6px 16px",
            fontSize: 13,
            margin: 0,
          }}
        >
          {(
            [
              ["IR number", request.ir_number ?? request.legacy_ir_number ?? request.code],
              ["Compiled by", requesterProfile?.full_name ?? request.legacy_initiator_name ?? "—"],
              ["Date", fmtWhen(request.created_at)],
              ["Office / country", request.country],
              ["Project", request.project_code],
              ["Budget line", request.budget_line],
              ["Description", request.description],
              ["Estimated amount", `${money(request.estimated_price)} ${request.currency}`],
              ["Procedure", config.label],
              ["CUP / AID", effectiveCup ?? "—"],
              [
                "Derogation",
                request.derogation ? `Yes — ${request.derogation_reason ?? "no reason given"}` : "No",
              ],
              ["Coordination cost", request.coordination_cost ? "Yes (no linked project)" : "No"],
              ["Institutional activity", request.institutional_activity ? "Yes" : "No"],
              ["Occasional collaborator", request.occasional_collaborator ? "Yes" : "No"],
              ...irRoles.map(
                (role) =>
                  [
                    `Approver — ${ROLE_LABEL[role]}`,
                    approverByRole.get(role)?.name ?? "not designated",
                  ] as [string, string]
              ),
              ...(approverByRole.get("PM")
                ? ([["PM (for information)", approverByRole.get("PM")!.name]] as [string, string][])
                : []),
            ] as [string, string][]
          ).map(([label, value]) => (
            <div key={label} style={{ display: "contents" }}>
              <dt style={{ color: "var(--ink-soft)" }}>{label}</dt>
              <dd style={{ margin: 0 }}>{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* IR approval */}
      <div className="card">
        <h2 style={{ fontSize: 14, fontWeight: 500, marginBottom: 10 }}>IR approval</h2>
        {irRoles.length === 0 && (
          <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
            Direct purchase: no IR approval required. This IR number is used to archive the documents; the payment data is filled in with the payment authorization form.
          </p>
        )}
        {irRoles.map((role) => {
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
                {ROLE_LABEL[role]} —{" "}
                {signed ? (
                  <>
                    approved by <b>{signerName(signed.signed_by)}</b> ({ROLE_LABEL[role]}) on{" "}
                    <b>{fmtWhen(signed.signed_at)}</b>
                  </>
                ) : (
                  "pending"
                )}
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
                  <SubmitButton pendingLabel="Approving…">Approve</SubmitButton>
                </form>
              )}
            </div>
          );
        })}
        {irRoles.length > 0 && irRoles.every((r) => irSignedRoles.has(r)) && (
          <p style={{ fontSize: 13, marginTop: 8, fontWeight: 600, color: "var(--navy)" }}>
            Authorized on{" "}
            {fmtWhen(
              [...irSignedRoles.values()]
                .map((x) => x.signed_at)
                .filter((v): v is string => !!v)
                .sort()
                .slice(-1)[0]
            )}{" "}
            (all required IR signatures present)
          </p>
        )}
        {request.is_legacy && irSignedRoles.size === 0 && paySignedRoles.size === 0 && (
          <p style={{ fontSize: 12, marginTop: 8, color: "var(--ink-soft)" }}>
            Historical request imported from the IR register: the authorization evidence is outside the app
            {request.legacy_protocol ? ` (protocol ${request.legacy_protocol})` : ""}.
          </p>
        )}
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
              style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}
            >
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

      {/* Payment: one payment authorization (PR04.AA05) per payment, approved by CAR / RAC */}
      {stageIndex >= paymentIndex &&
        (paySigners.length > 0 || request.proc_code === "DIR" || (payAuths ?? []).length > 0) && (
        <div className="card">
          <h2 style={{ fontSize: 14, fontWeight: 500, marginBottom: 10 }}>Payment authorizations</h2>
          {request.proc_code === "DIR" && (
            <p style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 10 }}>
              Direct purchase: fill in the payment data below. No approval is required; once submitted the
              request is closed and Contracts is notified.
            </p>
          )}

          {winnerOffer && (
            <p style={{ fontSize: 13, marginBottom: 10 }}>
              Winning offer: <b>{money(winnerOffer.price)} {request.currency}</b> ({winnerOffer.supplier}) · authorized so
              far: <b>{money(authorizedTotal)}</b> · remaining:{" "}
              <b>{money(Math.max(winnerOffer.price - authorizedTotal, 0))}</b>
              {request.stage === "payment" && (
                <span style={{ color: "var(--ink-soft)" }}>
                  {" "}
                  — the request closes when the authorized payments reach the winning offer.
                </span>
              )}
            </p>
          )}

          {(payAuths ?? []).length === 0 && (
            <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
              No payment authorization yet.
              {request.stage === "payment" &&
                " When the invoice arrives, the Budget Holder or the PM prepares one below."}
            </p>
          )}

          {(payAuths ?? []).map((a) => {
            const approverRoles = paySigners.filter((r) => r === "CAR" || r === "RAC");
            const canApprove =
              request.stage === "payment" &&
              a.status === "pending" &&
              iCanAct &&
              userId !== a.prepared_by &&
              approverRoles.some((r) => roles.has(r));
            const myRole = approverRoles.find((r) => roles.has(r));
            const inv = (requestInvoices ?? []).find((x) => x.id === a.invoice_id);
            return (
              <div
                key={a.id}
                style={{ borderTop: "0.5px solid #EEF0F3", padding: "10px 0", fontSize: 13 }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                  <div>
                    <b>
                      {money(a.amount)} {a.currency}
                    </b>{" "}
                    to {a.beneficiary}
                    {inv?.protocol ? ` · invoice ${inv.protocol}` : ""}
                    <div style={{ color: "var(--ink-soft)", fontSize: 12 }}>
                      {a.description} · {a.payment_type === "bank_transfer" ? "bank transfer" : a.payment_type === "cash" ? "cash" : a.payment_type_other ?? "other"}
                      {a.balance_after != null ? ` · balance still to pay ${money(a.balance_after)}` : ""}
                      {a.euro_equivalent != null && a.currency !== "EUR" ? ` · EUR ${money(a.euro_equivalent)}` : ""}
                    </div>
                    <div style={{ color: "var(--ink-soft)", fontSize: 12 }}>
                      Prepared by {paName(a.prepared_by)} on {fmtWhen(a.created_at)}
                      {a.status === "authorized" && (
                        <>
                          {" "}
                          · <b style={{ color: "var(--navy)" }}>authorized</b> by {paName(a.authorized_by)} (
                          {a.authorized_role ? ROLE_LABEL[a.authorized_role as Role] : "—"}) on {fmtWhen(a.authorized_at)}
                        </>
                      )}
                      {a.status === "recorded" && " · recorded (no approval required)"}
                      {a.status === "pending" && " · waiting for authorization"}
                    </div>
                  </div>
                  {canApprove && myRole && (
                    <form action={authorizePaymentAuth.bind(null, a.id, request.id, myRole)}>
                      <button type="submit" className="primary">
                        Authorize payment
                      </button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}

          {paySignedRoles.size > 0 && (
            <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 10 }}>
              Payment signatures recorded before the payment authorization form:{" "}
              {[...paySignedRoles.entries()]
                .map(([r, sig]) => `${ROLE_LABEL[r]} — ${signerName(sig.signed_by)} (${fmtWhen(sig.signed_at)})`)
                .join("; ")}
            </p>
          )}

          {request.stage === "payment" && (request.initiated_by === userId || roles.has("PM")) && (
            <details style={{ marginTop: 12 }} open={(payAuths ?? []).length === 0}>
              <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                + New payment authorization
              </summary>
              <PaymentAuthorizationForm
                requestId={request.id}
                fixed={{
                  ir: request.code,
                  project: request.project_code,
                  budgetLine: request.budget_line,
                  procedure: config.label,
                }}
                invoices={(requestInvoices ?? []).map((i) => ({
                  id: i.id,
                  label: `${i.supplier ?? "—"} — ${money(i.amount)} ${i.currency}${i.protocol ? ` — ${i.protocol}` : ""}`,
                  supplier: i.supplier,
                  amount: i.amount,
                  currency: i.currency,
                }))}
                winnerSupplier={winnerOffer?.supplier ?? null}
                offerValue={winnerOffer ? winnerOffer.price : null}
                authorizedTotal={authorizedTotal}
                currency={request.currency}
                defaultBankDescription={effectiveCup ?? request.project_code}
                direct={request.proc_code === "DIR"}
              />
            </details>
          )}
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
