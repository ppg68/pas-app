import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SCOPE_LABEL, STATUS_LABEL, dateOnly, type TripApproval, type TripRow } from "@/lib/domain/trips";

type Item = Pick<
  TripRow,
  "id" | "number" | "status" | "traveler_name" | "destination" | "scope" | "start_date" | "end_date" | "requester_name" | "needs_logistics" | "created_at"
>;

export default async function TripsPage({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const { created } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from("trip_requests")
    .select("id, number, status, traveler_name, destination, scope, start_date, end_date, requester_name, needs_logistics, created_at")
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as Item[];
  const { data: aps } = await supabase.from("trip_approvals").select("request_id, signer_role, signed_at");
  const approvals = (aps ?? []) as Pick<TripApproval, "request_id" | "signer_role" | "signed_at">[];
  const missing = (id: string) =>
    approvals
      .filter((a) => a.request_id === id && !a.signed_at)
      .map((a) => (a.signer_role === "RAC" ? "RAC / CAR" : a.signer_role))
      .join(", ");

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Trips</h1>
          <p className="subtitle">Authorization of trips and missions in Italy and abroad (PR09), with bookings by Logistics.</p>
        </div>
        <div className="page-actions">
          <Link href="/trips/new" className="primary">
            + New trip
          </Link>
        </div>
      </div>

      {created && <div className="banner">Trip request {created} sent. The approvers have been notified by email.</div>}

      {rows.length === 0 ? (
        <p className="empty">No trip requests yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>No.</th>
                <th>Traveler</th>
                <th>Destination</th>
                <th>Period</th>
                <th>Requested by</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/trips/${r.id}`}>{r.number}</Link>
                  </td>
                  <td>{r.traveler_name}</td>
                  <td>
                    {r.destination} <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>({SCOPE_LABEL[r.scope]})</span>
                  </td>
                  <td>
                    {dateOnly(r.start_date)} → {dateOnly(r.end_date)}
                  </td>
                  <td>{r.requester_name}</td>
                  <td>
                    <span className={`stamp ${r.status === "pending" || r.status === "approved" ? "warn" : r.status === "closed" ? "brand" : ""}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                    {r.status === "pending" && missing(r.id) ? (
                      <span style={{ fontSize: 11, color: "var(--ink-soft)", marginLeft: 6 }}>waiting: {missing(r.id)}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
