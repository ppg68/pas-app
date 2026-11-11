import { createClient } from "@/lib/supabase/server";
import MoneyInput from "@/components/MoneyInput";
import { fetchProjectCups, cupForProject } from "@/lib/domain/projectCups";
import {
  procConfigFor,
  paymentSlots,
  irSlots,
  slotLabel,
  slotSigned,
  slotRoleFor,
  canSign,
  documentsComplete,
  DOCS_BY_PROC,
  isOptionalDoc,
  FOLDER_NAMES,
  ROLE_LABEL,
  STAGE_TITLES,
  type Role,
} from "@/lib/domain/procedures";
import {
  signIrAuth,
  rejectIrAuth,
  addOffer,
  closeOffers,
  selectWinner,
  authorizePaymentAuth,
} from "@/lib/domain/workflow";
import SubmitButton from "@/components/SubmitButton";
import PaymentAuthorizationForm from "@/components/requests/PaymentAuthorizationForm";
import IncrementForm from "@/components/requests/IncrementForm";
import FilesCard, { type RequestFile } from "@/components/requests/FilesCard";

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
  const paIds = (payAuths ?? []).map((a) => a.id);
  const { data: paSignatures } = paIds.length
    ? await supabase
        .from("payment_authorization_signatures")
        .select("payment_authorization_id, signer_role, signed_by, signed_at")
        .in("payment_authorization_id", paIds)
        .order("signed_at", { ascending: true })
    : { data: [] as { payment_authorization_id: string; signer_role: string; signed_by: string; signed_at: string }[] };
  const paNameIds = Array.from(
    new Set(
      [
        ...(payAuths ?? []).flatMap((a) => [a.prepared_by, a.authorized_by]),
        ...(paSignatures ?? []).map((x) => x.signed_by),
      ].filter((v): v is string => !!v)
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
  // value of the supply the payments are measured against: winning offer + any approved increment
  const incrementAmount = Number(request.increment_amount ?? 0);
  const baseValue = winnerOffer ? winnerOffer.price : request.estimated_price;
  const incrementCap = Math.round(baseValue * 0.5 * 100) / 100;
  const incrementLeft = Math.max(incrementCap - incrementAmount, 0);
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
  const irSlotList = irSlots({
    procCode: request.proc_code,
    coordinationCost: request.coordination_cost,
    derogation: request.derogation,
    pmRequired: request.pm_required,
  });
  const paySlotList = paymentSlots({
    procCode: request.proc_code,
    coordinationCost: request.coordination_cost,
    pmRequired: request.pm_required,
  });
  // the designated approver of a slot (stored under the role they hold)
  const approverOfSlot = (roles: Role[]) => roles.map((r) => approverByRole.get(r)).find((x) => !!x);
  // who signed an IR slot
  const irSignatureOf = (roles: Role[]) => roles.map((r) => irSignedRoles.get(r)).find((x) => !!x);
  const iHaveSignedIr = [...irSignedRoles.values()].some((x) => x.signed_by === userId);

  const docsMap: Record<string, boolean> = {};
  (docs ?? []).forEach((d) => {
    docsMap[d.doc_key] = d.checked;
  });
  const requiredDocs = DOCS_BY_PROC[request.proc_code];
  const docsOk = documentsComplete(request.proc_code, docsMap);

  // Files uploaded to the PAS for this procedure (moved to the server folders when it is closed)
  const { data: fileRows } = await supabase
    .from("request_files")
    .select("id, doc_key, file_name, size_bytes, protocol, uploaded_at, uploaded_by, archived_at")
    .eq("request_id", id)
    .order("uploaded_at", { ascending: true });
  const uploaderIds = Array.from(new Set((fileRows ?? []).map((f) => f.uploaded_by).filter((x): x is string => !!x)));
  const { data: uploaderProfiles } = uploaderIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", uploaderIds)
    : { data: [] as { id: string; full_name: string }[] };
  const requestFiles: RequestFile[] = (fileRows ?? []).map((f) => ({
    id: f.id,
    doc_key: f.doc_key,
    file_name: f.file_name,
    size_bytes: Number(f.size_bytes),
    protocol: f.protocol,
    uploaded_at: f.uploaded_at,
    uploaded_by_name: (uploaderProfiles ?? []).find((p) => p.id === f.uploaded_by)?.full_name ?? "",
    archived_at: f.archived_at,
    mine: f.uploaded_by === userId,
  }));
  // 01 Internal Request and 09 Payment authorization are generated by the PAS itself (IR and PA), nothing to upload
  const fileDocKeys = Array.from(new Set([...requiredDocs, "10"])).sort();
  const canUploadFiles = roles.size > 0 || request.initiated_by === userId;
  const canArchiveFiles = roles.has("CAR") || roles.has("RAC") || roles.has("CONTRACTS" as Role);
  const showFiles = request.stage !== "rejected" && (!request.is_legacy || requestFiles.length > 0);

  const showOffers = config.minOffers > 0;
  const offersIndex = STAGE_ORDER.indexOf("offers");
  const winnerIndex = STAGE_ORDER.indexOf("winner");
  const paymentIndex = STAGE_ORDER.indexOf("payment");
  const effectiveCup = cupForProject(await fetchProjectCups(supabase), request.project_code) ?? request.cup_code;

  // new payment authorization form: in the payment card for the first payment, in its own card at the bottom for tranches
  const paForm = (
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
        offerValue={winnerOffer ? winnerOffer.price + incrementAmount : null}
        authorizedTotal={authorizedTotal}
        currency={request.currency}
        defaultBankDescription={effectiveCup ?? request.project_code}
      />
  );

  const showOffersBlock = showOffers && stageIndex >= offersIndex;
  const offersInFiles = showOffersBlock && showFiles && fileDocKeys.includes("03");
  const offersCardAlone = showOffersBlock && !offersInFiles;
  const offersBlock = (
    <>
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
                  <MoneyInput name="price" required />
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
    </>
  );

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>{request.code}</h1>
        <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>
          {request.description} · {config.label} · {request.estimated_price} {request.currency}
          {effectiveCup ? ` · CUP\\AID ${effectiveCup}` : ""}
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
        <div style={{ marginTop: 10 }}>
          <a href={`/requests/${request.id}/pdf`} download style={{ fontSize: 13 }}>
            Download PDF (whole procedure)
          </a>
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
          {error}
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
              [
                "Compiled by",
                requesterProfile
                  ? `${requesterProfile.full_name}${requesterProfile.email ? ` — ${requesterProfile.email}` : ""}`
                  : (request.legacy_initiator_name ?? "—"),
              ],
              ["Date", fmtWhen(request.created_at)],
              ["Office / country", request.country],
              ["Project", request.project_code],
              ["Budget line", request.budget_line],
              ["Description", request.description],
              ["Estimated amount", `${money(request.estimated_price)} ${request.currency}`],
              ["Procedure", config.label],
              ["Donor Procedure Type (if applicable)", request.donor_procedure || "—"],
              ["CUP\\AID", effectiveCup ?? "—"],
              [
                "Derogation",
                request.derogation ? `Yes — ${request.derogation_reason ?? "no reason given"}` : "No",
              ],
              ["Derogation date", request.derogation && request.derogation_date ? new Date(request.derogation_date).toLocaleDateString("en-GB") : "—"],
              ["Coordination cost", request.coordination_cost ? "Yes (no linked project)" : "No"],
              ["Institutional activity", request.institutional_activity ? "Yes" : "No"],
              ["Occasional collaborator", request.occasional_collaborator ? "Yes" : "No"],
              ...irSlotList.map(
                (slot) =>
                  [
                    `Approver — ${slotLabel(slot)}`,
                    approverOfSlot(slot.roles)?.name ?? "not designated",
                  ] as [string, string]
              ),
              ...(!request.pm_required && approverByRole.get("PM")
                ? ([["PM (for information)", approverByRole.get("PM")!.name]] as [string, string][])
                : []),
              ...(!request.pm_required && !request.is_legacy && request.proc_code !== "DIR" && !request.coordination_cost
                ? ([["PM signature", "not requested (the request was compiled by the PM)"]] as [string, string][])
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
        {irSlotList.map((slot) => {
          const signature = irSignatureOf(slot.roles);
          const myRole = slotRoleFor(slot, roles);
          const canShowButton =
            request.stage === "ir_auth" && !signature && !!myRole && iCanAct && !iHaveSignedIr;
          const designated = approverOfSlot(slot.roles);
          return (
            <div
              key={slot.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: 13,
                padding: "6px 0",
              }}
            >
              <span>
                {slotLabel(slot)} —{" "}
                {signature ? (
                  <>
                    approved by <b>{signerName(signature.signed_by)}</b> ({ROLE_LABEL[signature.signer_role as Role]}) on{" "}
                    <b>{fmtWhen(signature.signed_at)}</b>
                  </>
                ) : (
                  "pending"
                )}
                {designated && (
                  <span style={{ color: "var(--ink-soft)" }}>
                    {" "}
                    · designated: {designated.name}
                    {designated.notified ? " (notified by email)" : " (not emailed)"}
                  </span>
                )}
              </span>
              {canShowButton && myRole && (
                <form action={signIrAuth.bind(null, request.id, myRole)}>
                  <SubmitButton pendingLabel="Approving…">Approve</SubmitButton>
                </form>
              )}
            </div>
          );
        })}
        {irSlotList.length > 0 && irSlotList.every((sl) => !!irSignatureOf(sl.roles)) && (
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
        {request.stage === "rejected" && (
          <p style={{ fontSize: 13, marginTop: 8, color: "#7A5A1C" }}>
            <b>Rejected</b>
            {request.rejected_at ? ` on ${fmtWhen(request.rejected_at)}` : ""}
            {request.rejected_by ? ` by ${signerName(request.rejected_by)}` : ""}: {request.rejected_reason}
            {request.initiated_by === userId && (
              <>
                {" "}
                <a href="/requests/new">Open a new request with the corrections</a>.
              </>
            )}
          </p>
        )}
        {request.stage === "ir_auth" && iCanAct && !iHaveSignedIr && (() => {
          const openSlot = irSlotList.find((sl) => !irSignatureOf(sl.roles) && slotRoleFor(sl, roles));
          const rejectRole = openSlot ? slotRoleFor(openSlot, roles) : null;
          if (!rejectRole) return null;
          return (
            <form
              action={rejectIrAuth.bind(null, request.id, rejectRole)}
              style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 10 }}
            >
              <label style={{ fontSize: 12 }}>Reject this request (errors in the compilation): reason</label>
              <textarea name="reason" required rows={2} style={{ width: "100%", margin: "4px 0 8px" }} />
              <SubmitButton pendingLabel="Rejecting…">Reject</SubmitButton>
            </form>
          );
        })()}
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
        {iCanAct && iHaveSignedIr && request.stage === "ir_auth" && (
          <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 8 }}>
            You have already signed: the other signature must come from a different person (dual authorization).
          </p>
        )}
      </div>

      {/* Offers: shown inside the files card, right after 03 Quotations received, when that folder is listed */}
      {offersCardAlone && <div className="card">{offersBlock}</div>}

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

      {showFiles && (
        <FilesCard
          requestId={request.id}
          docs={fileDocKeys.map((k) => ({
            key: k,
            label: FOLDER_NAMES[k] ?? k,
            kind: !requiredDocs.includes(k) ? ("closing" as const) : isOptionalDoc(request.proc_code, k) ? ("optional" as const) : ("required" as const),
            checked: !!docsMap[k],
          }))}
          files={requestFiles}
          canUpload={canUploadFiles}
          canArchive={canArchiveFiles}
          archiveRequestedAt={request.archive_requested_at ?? null}
          archiveDoneAt={request.archive_done_at ?? null}
          stage={request.stage}
          canFlag={request.stage === "documents"}
          docsOk={docsOk}
          folderPath={request.folder_path ?? null}
          afterDocKey="03"
          afterDoc={offersInFiles ? offersBlock : undefined}
        />
      )}

      {/* Payment: one payment authorization (PR04.AA05) per payment, approved by PM + CAR / RAC */}
      {stageIndex >= paymentIndex && (
        <div className="card">
          <h2 style={{ fontSize: 14, fontWeight: 500, marginBottom: 10 }}>Payment authorizations</h2>
          <p style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 10 }}>
            Each payment is authorized by: {paySlotList.map(slotLabel).join(" + ")}
            {paySlotList.length > 1 ? " (two different people)" : ""}.
          </p>

          {winnerOffer && (
            <p style={{ fontSize: 13, marginBottom: 10 }}>
              Winning offer: <b>{money(winnerOffer.price)} {request.currency}</b> ({winnerOffer.supplier})
              {incrementAmount > 0 && (
                <>
                  {" "}
                  + additional service <b>{money(incrementAmount)}</b>
                </>
              )}{" "}
              · authorized so far: <b>{money(authorizedTotal)}</b> · remaining:{" "}
              <b>{money(Math.max(winnerOffer.price + incrementAmount - authorizedTotal, 0))}</b>
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
                " When the invoice arrives, the Budget Holder prepares one below."}
            </p>
          )}

          {(payAuths ?? []).map((a) => {
            const sigs = (paSignatures ?? []).filter((x) => x.payment_authorization_id === a.id);
            const signedRoles = sigs.map((x) => x.signer_role as Role);
            const iSigned = sigs.some((x) => x.signed_by === userId);
            // slots still open that I could sign
            const mySlot = paySlotList.find((sl) => !slotSigned(sl, signedRoles) && slotRoleFor(sl, roles));
            const myRole = mySlot ? slotRoleFor(mySlot, roles) : undefined;
            const canApprove =
              request.stage === "payment" &&
              a.status === "pending" &&
              iCanAct &&
              userId !== a.prepared_by &&
              !iSigned &&
              !!myRole;
            const inv = (requestInvoices ?? []).find((x) => x.id === a.invoice_id);
            return (
              <div
                key={a.id}
                style={{ borderTop: "0.5px solid #EEF0F3", padding: "10px 0", fontSize: 13 }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <tbody>
                    {(
                      [
                        ["Date", fmtWhen(a.created_at).slice(0, 10)],
                        ["Description", a.description],
                        ["Invoice", inv ? `${inv.supplier ?? "—"}${inv.protocol ? ` · ${inv.protocol}` : ""}` : "—"],
                        ["Beneficiary", a.beneficiary],
                        [
                          "IBAN / payment details",
                          a.payment_details ? (
                            <span style={{ whiteSpace: "pre-wrap", fontFamily: "monospace" }}>{a.payment_details}</span>
                          ) : (
                            "—"
                          ),
                        ],
                        [
                          "Payment type",
                          a.payment_type === "bank_transfer"
                            ? "Bank transfer"
                            : a.payment_type === "cash"
                              ? "Cash"
                              : (a.payment_type_other ?? "Other"),
                        ],
                        ["Bank transfer description", a.bank_description || "—"],
                        [
                          "Amount",
                          <b key="amt">
                            {money(a.amount)} {a.currency}
                          </b>,
                        ],
                        ["Balance still to pay", a.balance_after != null ? `${money(a.balance_after)} ${a.currency}` : "—"],
                        [
                          "Euro equivalent",
                          a.euro_equivalent != null && a.currency !== "EUR" ? `EUR ${money(a.euro_equivalent)}` : "—",
                        ],
                        ["Prepared by", `${paName(a.prepared_by)} on ${fmtWhen(a.created_at)}`],
                      ] as [string, React.ReactNode][]
                    ).map(([label, value]) => (
                      <tr key={label} style={{ borderBottom: "0.5px solid #EEF0F3" }}>
                        <td style={{ width: 190, padding: "5px 8px 5px 0", color: "var(--ink-soft)", verticalAlign: "top" }}>
                          {label}
                        </td>
                        <td style={{ padding: "5px 0" }}>{value}</td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ padding: "5px 8px 5px 0", color: "var(--ink-soft)", verticalAlign: "top" }}>Approval</td>
                      <td style={{ padding: "5px 0" }}>
                        {a.status === "authorized" && (
                          <b style={{ color: "var(--navy)" }}>Authorized on {fmtWhen(a.authorized_at)}</b>
                        )}
                        {a.status === "recorded" && "Recorded (no approval required)"}
                        {a.status === "pending" &&
                          `Waiting for: ${paySlotList.filter((sl) => !slotSigned(sl, signedRoles)).map(slotLabel).join(" + ")}`}
                        {sigs.length > 0 ? (
                          sigs.map((x) => (
                            <div key={x.signer_role} style={{ color: "var(--ink-soft)", fontSize: 12 }}>
                              Approved by {paName(x.signed_by)} ({ROLE_LABEL[x.signer_role as Role]}) on {fmtWhen(x.signed_at)}
                            </div>
                          ))
                        ) : a.status === "authorized" && a.authorized_by ? (
                          <div style={{ color: "var(--ink-soft)", fontSize: 12 }}>
                            Approved by {paName(a.authorized_by)} (
                            {a.authorized_role ? ROLE_LABEL[a.authorized_role as Role] : "—"}) on {fmtWhen(a.authorized_at)}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  </tbody>
                </table>
                {canApprove && myRole && (
                  <form action={authorizePaymentAuth.bind(null, a.id, request.id, myRole)} style={{ marginTop: 10 }}>
                    <button type="submit" className="primary">
                      Authorize payment ({myRole})
                    </button>
                  </form>
                )}
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

          {incrementAmount > 0 && request.increment_reason && (
            <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 10, whiteSpace: "pre-wrap" }}>
              Additional service {money(incrementAmount)} {request.currency} — {request.increment_reason}
            </p>
          )}

          {request.stage === "payment" && request.initiated_by === userId && (payAuths ?? []).length === 0 && (
            <details style={{ marginTop: 12 }} open>
              <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                + New payment authorization
              </summary>
              {paForm}
            </details>
          )}
        </div>
      )}

      {request.stage === "completed" && (
        <div className="card" style={{ textAlign: "center", color: "var(--navy)", fontWeight: 600 }}>
          Request closed
        </div>
      )}

      {/* Additional service: at the bottom of the page */}
      {request.initiated_by === userId &&
        (request.stage === "payment" || request.stage === "completed") &&
        incrementLeft > 0 && (
          <div className="card">
          <details>
            <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              + Additional service (up to {money(incrementLeft)} {request.currency} more, 50% of the initial value)
            </summary>
            <IncrementForm requestId={request.id} currency={request.currency} left={incrementLeft} />
          </details>
          </div>
        )}

      {/* Further payments (tranches): rarely needed, so kept at the bottom */}
      {request.stage === "payment" && request.initiated_by === userId && (payAuths ?? []).length > 0 && (
        <div className="card">
          <details>
            <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              + Another payment authorization (only for payments in tranches)
            </summary>
            {paForm}
          </details>
        </div>
      )}
    </div>
  );
}
