import Link from "next/link";
import { BulkDeleteBar, SelectAllBox } from "@/components/BulkDelete";
import { bulkDeleteTrips } from "./actions";
import { createClient } from "@/lib/supabase/server";
import { SCOPE_LABEL, STATUS_LABEL, dateOnly, type TripApproval, type TripRow } from "@/lib/domain/trips";

type Item = Pick<
  TripRow,
  "id" | "number" | "status" | "traveler_name" | "destination" | "scope" | "start_date" | "end_date" | "requester_name" | "needs_logistics" | "created_at"
>;

export default async function TripsPage({ searchParams }: { searchParams: Promise<{ created?: string; deleted?: string }> }) {
  const { created, deleted } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: myRoles } = await supabase.from("user_roles").select("role").eq("user_id", user?.id ?? "");
  const isAdmin = (myRoles ?? []).some((x) => x.role === "ADMIN");
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
      .map((a) => (a.signer_role === "RAC" ? "RAC / CAR" : "Responsabile"))
      .join(", ");

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Trasferte</h1>
          <p className="subtitle">Autorizzazione di trasferte in Italia e missioni all'estero (PR09). La Logistica viene informata per email.</p>
        </div>
        <div className="page-actions">
          <Link href="/trips/new" className="primary">
            + Nuova trasferta
          </Link>
        </div>
      </div>

      {created && <div className="banner">Richiesta {created} inviata. Chi deve approvare è stato avvisato per email.</div>}
      {deleted && <div className="banner">{deleted} richiest{deleted === "1" ? "a eliminata" : "e eliminate"}.</div>}
      {isAdmin && rows.length > 0 && <BulkDeleteBar formId="trips-bulk" action={bulkDeleteTrips} what="richieste di trasferta" />}

      {rows.length === 0 ? (
        <p className="empty">Nessuna richiesta di trasferta.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {isAdmin && (
                  <th style={{ width: 30 }}>
                    <SelectAllBox formId="trips-bulk" />
                  </th>
                )}
                <th>N.</th>
                <th>Viaggiatore</th>
                <th>Destinazione</th>
                <th>Periodo</th>
                <th>Richiesta da</th>
                <th>Stato</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  {isAdmin && (
                    <td>
                      <input type="checkbox" name="ids" value={r.id} form="trips-bulk" aria-label={`Seleziona ${r.number}`} />
                    </td>
                  )}
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
                      <span style={{ fontSize: 11, color: "var(--ink-soft)", marginLeft: 6 }}>in attesa: {missing(r.id)}</span>
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
