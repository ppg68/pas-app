import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ConfirmForm from "@/components/ConfirmForm";
import SubmitButton from "@/components/SubmitButton";
import MoneyInput from "@/components/MoneyInput";
import { tripSections } from "@/lib/domain/tripSections";
import { STATUS_LABEL, dt, type TripApproval, type TripRow } from "@/lib/domain/trips";
import { bookTripRequest, cancelTripRequest, deleteTripRequest, signTripRequest } from "../actions";

export default async function TripDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase.from("trip_requests").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const r = data as TripRow;

  const [{ data: aps }, { data: myRoles }] = await Promise.all([
    supabase.from("trip_approvals").select("*").eq("request_id", id),
    supabase.from("user_roles").select("role").eq("user_id", user?.id ?? ""),
  ]);
  const approvals = ((aps ?? []) as TripApproval[]).sort((a, b) => (a.signer_role === "PM" ? -1 : 1) - (b.signer_role === "PM" ? -1 : 1));
  const roles = (myRoles ?? []).map((x) => x.role as string);
  const isAdmin = roles.includes("ADMIN");
  const isLog = roles.includes("LOG") || isAdmin;
  const isOwner = r.requested_by === user?.id;
  const anySigned = approvals.some((a) => a.signed_at);
  const canEdit = isOwner && r.status === "pending" && !anySigned;
  const sections = tripSections(r, approvals).filter((s) => s.title !== "Approvals and history" && s.title !== "Bookings (Logistics)");

  return (
    <div style={{ maxWidth: 820 }}>
      <p style={{ marginBottom: 6 }}>
        <Link href="/trips">← Trips</Link>
      </p>
      <div className="page-header">
        <div>
          <h1>
            {r.number} · {r.traveler_name}
          </h1>
          <p className="subtitle">
            {r.destination} · requested by {r.requester_name} on {dt(r.created_at)}
          </p>
        </div>
        <div className="page-actions">
          <span className={`stamp ${r.status === "pending" || r.status === "approved" ? "warn" : r.status === "closed" ? "brand" : ""}`}>
            {STATUS_LABEL[r.status]}
          </span>
          <a href={`/trips/${id}/pdf`} className="ghost">
            PDF
          </a>
        </div>
      </div>

      {error && <div className="banner error">{error}</div>}

      <div className="card" style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: "1rem", marginBottom: 8 }}>Approvals</h2>
        {!approvals.some((a) => a.signer_role === "PM") && (
          <p className="subtitle" style={{ margin: "0 0 6px" }}>
            Filed by the PM ({r.requester_name}): no separate PM approval is needed.
          </p>
        )}
        {approvals.map((a) => (
          <div key={a.signer_role} style={{ display: "flex", gap: 12, alignItems: "center", padding: "4px 0" }}>
            <b style={{ width: 90 }}>{a.signer_role === "RAC" ? "RAC / CAR" : "PM"}</b>
            <span style={{ flex: 1 }}>{a.user_name}</span>
            {a.signed_at ? (
              <span className="stamp brand">approved {dt(a.signed_at)}</span>
            ) : r.status === "pending" && a.user_id === user?.id ? (
              <form action={signTripRequest.bind(null, id, a.signer_role)}>
                <SubmitButton pendingLabel="Approving…">Approve</SubmitButton>
              </form>
            ) : (
              <span className="stamp">waiting</span>
            )}
          </div>
        ))}
        {r.needs_logistics && (
          <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "4px 0" }}>
            <b style={{ width: 90 }}>Logistics</b>
            <span style={{ flex: 1 }}>{r.booked_by_name ?? ""}</span>
            {r.booked_at ? (
              <span className="stamp brand">booked {dt(r.booked_at)}</span>
            ) : (
              <span className="stamp">{r.status === "approved" ? "to do" : "after approval"}</span>
            )}
          </div>
        )}
        {(canEdit || (isOwner && r.status === "pending") || isAdmin) && (
          <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            {canEdit && (
              <Link href={`/trips/${id}/edit`} className="ghost">
                Edit request
              </Link>
            )}
            {(canEdit || isAdmin) && (
              <ConfirmForm
                action={deleteTripRequest.bind(null, id)}
                message={anySigned ? "This request has been signed. Delete it for good?" : "Delete this request?"}
              >
                <button type="submit" className="ghost danger">
                  Delete
                </button>
              </ConfirmForm>
            )}
            {!canEdit && isOwner && r.status === "pending" && (
              <ConfirmForm action={cancelTripRequest.bind(null, id)} message="Cancel this request?">
                <button type="submit" className="ghost danger">
                  Cancel request
                </button>
              </ConfirmForm>
            )}
          </div>
        )}
      </div>

      {r.status === "approved" && isLog && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h2 style={{ fontSize: "1rem", marginBottom: 8 }}>Logistics: record the bookings</h2>
          <p className="subtitle" style={{ margin: "0 0 10px" }}>
            Buy what the sheet asks for (flight, visa, insurance, train / hotel), then write what was done. Saving closes
            the sheet and informs the requester.
          </p>
          <form action={bookTripRequest.bind(null, id)} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="field">
              <label>What was booked (flight, dates, provider, notes) *</label>
              <textarea name="booking_note" rows={4} style={{ resize: "vertical" }} required />
            </div>
            <div className="field" style={{ maxWidth: 220 }}>
              <label>Total cost (€)</label>
              <MoneyInput name="booking_total" placeholder="optional" />
            </div>
            <SubmitButton style={{ width: "fit-content" }} pendingLabel="Saving…">
              Save and close
            </SubmitButton>
          </form>
        </div>
      )}

      {r.status === "approved" && !isLog && (
        <p className="subtitle">The trip is approved. Logistics will arrange the bookings.</p>
      )}

      {r.booked_at && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h2 style={{ fontSize: "1rem", marginBottom: 8 }}>Bookings (Logistics)</h2>
          <p style={{ margin: "0 0 6px" }} className="subtitle">
            {r.booked_by_name} on {dt(r.booked_at)}
            {r.booking_total != null ? ` · € ${r.booking_total.toLocaleString("it-IT", { minimumFractionDigits: 2 })}` : ""}
          </p>
          <div style={{ whiteSpace: "pre-wrap" }}>{r.booking_note}</div>
        </div>
      )}

      {sections.map((s) => (
        <div key={s.title} className="card" style={{ marginBottom: 14 }}>
          <h2 style={{ fontSize: "1rem", marginBottom: 8 }}>{s.title}</h2>
          {(s.rows ?? [])
            .filter(([, v]) => v)
            .map(([label, value]) => (
              <div key={label} style={{ display: "flex", gap: 10, padding: "3px 0", fontSize: "0.88rem" }}>
                <span style={{ width: 190, flexShrink: 0, color: "var(--ink-soft)" }}>{label}</span>
                <span style={{ whiteSpace: "pre-wrap" }}>{value}</span>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}
