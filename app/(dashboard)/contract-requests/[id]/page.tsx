import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ConfirmForm from "@/components/ConfirmForm";
import SubmitButton from "@/components/SubmitButton";
import {
  CONTRACT_TYPE_LABEL,
  KIND_LABEL,
  STATUS_LABEL,
  type ContractApproval,
  type ContractRequestRow,
} from "@/lib/domain/contractRequests";
import {
  cancelContractRequest,
  createContractDraft,
  deleteContractRequest,
  generateContractText,
  saveContractText,
  signContractRequest,
} from "../actions";

const dt = (s: string | null) => (s ? new Date(s).toLocaleString("it-IT", { timeZone: "Europe/Rome" }) : "");

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "" || value === false) return null;
  return (
    <div style={{ display: "flex", gap: 10, padding: "3px 0", fontSize: "0.88rem" }}>
      <span style={{ width: 190, flexShrink: 0, color: "var(--ink-soft)" }}>{label}</span>
      <span style={{ whiteSpace: "pre-wrap" }}>{value}</span>
    </div>
  );
}

export default async function ContractRequestDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { error, saved } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase.from("contract_requests").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const r = data as ContractRequestRow;

  const [{ data: aps }, { data: myRoles }] = await Promise.all([
    supabase.from("contract_approvals").select("*").eq("request_id", id),
    supabase.from("user_roles").select("role").eq("user_id", user?.id ?? ""),
  ]);
  const approvals = (aps ?? []) as ContractApproval[];
  const roles = (myRoles ?? []).map((x) => x.role as string);
  const isEditor = roles.includes("CONTRACTS") || roles.includes("ADMIN");
  const isOwner = r.requested_by === user?.id;
  const anySigned = approvals.some((a) => a.signed_at);
  const canEdit = isOwner && r.status === "pending" && !anySigned;
  const myPending = approvals.find((a) => a.user_id === user?.id && !a.signed_at);
  const x = r.data ?? {};

  let linked: { id: string; legacy_id: string | null } | null = null;
  if (r.contract_id && isEditor) {
    const { data: c } = await supabase.from("contracts").select("id, legacy_id").eq("id", r.contract_id).maybeSingle();
    linked = c;
  }

  return (
    <div style={{ maxWidth: 820 }}>
      <p style={{ marginBottom: 6 }}>
        <Link href="/contract-requests">← Contract requests</Link>
      </p>
      <div className="page-header">
        <div>
          <h1>
            {r.number} · {r.party_name}
          </h1>
          <p className="subtitle">
            {KIND_LABEL[r.kind]} · requested by {r.requester_name} on {dt(r.created_at)}
          </p>
        </div>
        <div className="page-actions">
          <span className={`stamp ${r.status === "pending" ? "warn" : r.status === "approved" ? "brand" : ""}`}>
            {STATUS_LABEL[r.status]}
          </span>
        </div>
      </div>

      {error && <div className="banner error">{decodeURIComponent(error)}</div>}
      {saved && <div className="banner">Contract text saved.</div>}

      <div className="card" style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: "1rem", marginBottom: 8 }}>Approvals</h2>
        {approvals.map((a) => (
          <div key={a.signer_role} style={{ display: "flex", gap: 12, alignItems: "center", padding: "4px 0" }}>
            <b style={{ width: 50 }}>{a.signer_role}</b>
            <span style={{ flex: 1 }}>{a.user_name}</span>
            {a.signed_at ? (
              <span className="stamp brand">approved {dt(a.signed_at)}</span>
            ) : r.status === "pending" && a.user_id === user?.id ? (
              <form action={signContractRequest.bind(null, id, a.signer_role)}>
                <SubmitButton pendingLabel="Approving…">Approve</SubmitButton>
              </form>
            ) : (
              <span className="stamp">waiting</span>
            )}
          </div>
        ))}
        {myPending && r.status === "pending" && (
          <p className="subtitle" style={{ margin: "8px 0 0" }}>
            Check the data below before approving: after approval the request is locked.
          </p>
        )}
        {(canEdit || (isOwner && r.status === "pending")) && (
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            {canEdit && (
              <Link href={`/contract-requests/${id}/edit`} className="ghost">
                Edit request
              </Link>
            )}
            {canEdit && (
              <ConfirmForm action={deleteContractRequest.bind(null, id)} message="Delete this request?">
                <button type="submit" className="ghost danger">Delete</button>
              </ConfirmForm>
            )}
            {!canEdit && (
              <ConfirmForm action={cancelContractRequest.bind(null, id)} message="Cancel this request?">
                <button type="submit" className="ghost danger">Cancel request</button>
              </ConfirmForm>
            )}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: "1rem", marginBottom: 8 }}>Scheda</h2>
        <Item label="IR number" value={[r.ir_code, r.proc_type].filter(Boolean).join(" · ")} />
        <Item label="Name" value={r.party_name} />
        <Item label="Short name" value={r.party_short} />
        <Item label="Nationality" value={r.nationality} />
        <Item label="Address" value={r.address} />
        <Item label="Tax code / VAT" value={[r.tax_code, r.vat_number].filter(Boolean).join(" / ")} />
        <Item label="Email / PEC" value={[r.email, r.pec].filter(Boolean).join(" / ")} />
        <Item label="Legal representative" value={[r.legal_rep, r.legal_rep_role].filter(Boolean).join(", ")} />
        <Item label="Contact" value={[r.contact_person, r.contact_email, r.contact_email_admin].filter(Boolean).join(" · ")} />
        <Item label="Contract type" value={CONTRACT_TYPE_LABEL[r.contract_type]} />
        <Item label="Period" value={`${r.start_on_signature ? "from signature" : r.start_date} → ${r.end_date}`} />
        <Item label="Project" value={[r.donor_code, r.project_title].filter(Boolean).join(" - ")} />
        <Item label="Internal code / budget line" value={[r.internal_code, r.budget_line].filter(Boolean).join(" / ")} />
        <Item label="Role" value={r.role_title} />
        <Item label="Similar to STAFF" value={r.staff_like ? "Yes (to be entered in Geco)" : ""} />
        <Item label="Activities" value={r.activities} />
        <Item label="Final objective" value={r.objective} />
        <Item label="Place of work" value={r.work_place} />
        <Item label="Contact with minors" value={r.minors ? "Yes" : "No"} />
        <Item
          label="Amount"
          value={`${r.amount.toLocaleString("it-IT", { minimumFractionDigits: 2 })} ${r.currency}${r.kind === "person" ? (r.fee_mode === "daily" ? " per day" : " total") : ""}`}
        />
        <Item label="Fee note" value={r.fee_note} />
        <Item label="Payment" value={r.payment_terms} />
        <Item label="Accommodation" value={x.accommodation} />
        <Item label="Meals" value={x.meals} />
        <Item label="Per diem" value={x.per_diem} />
        <Item label="Other reimbursements" value={x.other_reimb} />
        <Item label="Flights" value={[x.flights_count, x.flights_route, x.flights_max && `max ${x.flights_max}`, x.flight_bl && `BL ${x.flight_bl}`].filter(Boolean).join(" · ")} />
        <Item label="Visa budget line" value={x.visa_bl} />
        <Item label="Accommodation budget line" value={x.accommodation_bl} />
        <Item label="Insurance" value={[x.insurance, x.insurance_bl && `BL ${x.insurance_bl}`].filter(Boolean).join(" · ")} />
        <Item label="Equipment" value={x.equipment} />
        <Item label="Public employee" value={x.public_employee} />
        <Item label="Terms of Reference" value={x.tdr ? "attached" : ""} />
      </div>

      {r.status === "approved" && isEditor && (
        <div className="card">
          <h2 style={{ fontSize: "1rem", marginBottom: 8 }}>Contract</h2>
          {linked ? (
            <p style={{ marginBottom: 10 }}>
              In the register as <Link href={`/contracts/${linked.id}`}>{linked.legacy_id ?? "contract"}</Link>.
            </p>
          ) : (
            <form action={createContractDraft.bind(null, id)} style={{ marginBottom: 10 }}>
              <SubmitButton className="ghost" pendingLabel="Creating…">
                Create draft in Contracts register
              </SubmitButton>
            </form>
          )}

          {!r.contract_text ? (
            <form action={generateContractText.bind(null, id)}>
              <SubmitButton pendingLabel="Preparing…">Prepare the contract text</SubmitButton>
            </form>
          ) : (
            <>
              <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                <a href={`/contract-requests/${id}/docx`} className="primary">
                  Download Word (.docx)
                </a>
                <ConfirmForm
                  action={generateContractText.bind(null, id)}
                  message="Rebuild the text from the scheda? Your manual changes to the text will be lost."
                >
                  <button type="submit" className="ghost">Rebuild from scheda</button>
                </ConfirmForm>
              </div>
              <p className="subtitle" style={{ margin: "0 0 10px" }}>
                Edit the text of this contract here, then download it. Each line is a paragraph; start a line with “- ” for a bullet.
                Tick “remove” to delete an article.
              </p>
              <form action={saveContractText.bind(null, id)} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {r.contract_text.map((b, i) => (
                  <div key={b.key + i} className="field" style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                    {b.title ? (
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <input name={`title_${i}`} defaultValue={b.title} style={{ flex: 1, fontWeight: 600 }} />
                        <label className="checkbox-row" style={{ whiteSpace: "nowrap" }}>
                          <input type="checkbox" name={`remove_${i}`} /> remove
                        </label>
                      </div>
                    ) : (
                      <input type="hidden" name={`title_${i}`} value="" />
                    )}
                    <textarea
                      name={`body_${i}`}
                      defaultValue={b.body}
                      rows={Math.min(18, Math.max(3, b.body.split("\n").length + 1))}
                      style={{ resize: "vertical", fontFamily: "inherit" }}
                    />
                  </div>
                ))}
                <SubmitButton style={{ width: "fit-content" }}>Save contract text</SubmitButton>
              </form>
            </>
          )}
        </div>
      )}

      {r.status === "approved" && !isEditor && (
        <p className="subtitle">The request is approved. Contracts will now prepare the contract.</p>
      )}
    </div>
  );
}
