import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import TripForm, { type Holder } from "@/components/trips/TripForm";
import TripItalyForm from "@/components/trips/TripItalyForm";
import { createTripRequest } from "../actions";

export default async function NewTripPage({ searchParams }: { searchParams: Promise<{ error?: string; where?: string }> }) {
  const { error, where } = await searchParams;

  if (where !== "italy" && where !== "abroad") {
    return (
      <div style={{ maxWidth: 760 }}>
        <p style={{ marginBottom: 6 }}>
          <Link href="/trips">← Trips</Link>
        </p>
        <h1 style={{ marginBottom: 16 }}>New trip request</h1>
        <p className="subtitle">Where is the trip?</p>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <Link href="/trips/new?where=italy" className="card" style={{ flex: 1, minWidth: 240, textDecoration: "none", color: "inherit" }}>
            <h2 style={{ fontSize: "1.1rem", marginBottom: 6 }}>Italy</h2>
            <p className="subtitle" style={{ margin: 0 }}>
              Single trip authorization (PR09 AA09): place, dates, reasons, transport, allowance or reimbursement.
            </p>
          </Link>
          <Link href="/trips/new?where=abroad" className="card" style={{ flex: 1, minWidth: 240, textDecoration: "none", color: "inherit" }}>
            <h2 style={{ fontSize: "1.1rem", marginBottom: 6 }}>Abroad</h2>
            <p className="subtitle" style={{ margin: 0 }}>
              Mission in Europe or outside the EU: terms of reference, flights, visa, insurance, bookings.
            </p>
          </Link>
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: people } = await supabase.rpc("expense_superiors");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const superiors = ((people as Holder[] | null) ?? []).filter((h) => h.id !== user?.id);

  return (
    <div style={{ maxWidth: 760 }}>
      <p style={{ marginBottom: 6 }}>
        <Link href="/trips/new">← Italy or abroad</Link>
      </p>
      <h1 style={{ marginBottom: 16 }}>{where === "italy" ? "New trip in Italy" : "New trip abroad"}</h1>
      {error && <div className="banner error">{error}</div>}
      {where === "italy" ? (
        <TripItalyForm action={createTripRequest} superiors={superiors} submitLabel="Send for authorization" />
      ) : (
        <TripForm action={createTripRequest} superiors={superiors} submitLabel="Send for approval" />
      )}
    </div>
  );
}
