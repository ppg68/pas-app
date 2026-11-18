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
          <Link href="/trips">← Trasferte</Link>
        </p>
        <h1 style={{ marginBottom: 16 }}>Nuova richiesta di trasferta</h1>
        <p className="subtitle">Dove si va?</p>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <Link href="/trips/new?where=italy" className="card" style={{ flex: 1, minWidth: 240, textDecoration: "none", color: "inherit" }}>
            <h2 style={{ fontSize: "1.1rem", marginBottom: 6 }}>Trasferta in Italia, in Svizzera ed Europa in giornata, uscite paese per rinnovo visto</h2>
            <p className="subtitle" style={{ margin: 0 }}>
              Autorizzazione di trasferta singola (PR09 AA09): luogo, date, motivi, mezzo, indennità o rimborso.
            </p>
          </Link>
          <Link href="/trips/new?where=abroad" className="card" style={{ flex: 1, minWidth: 240, textDecoration: "none", color: "inherit" }}>
            <h2 style={{ fontSize: "1.1rem", marginBottom: 6 }}>Missione all'estero</h2>
            <p className="subtitle" style={{ margin: 0 }}>
              Missione in Europa o fuori dall'UE: scheda di attivazione (PR09 AA14) e poi lettera di incarico per dipendente o collaboratore.
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
        <Link href="/trips/new">← Torna alla scelta</Link>
      </p>
      <h1 style={{ marginBottom: 16 }}>{where === "italy" ? "Nuova trasferta in Italia, in Svizzera ed Europa in giornata, uscita paese per rinnovo visto" : "Nuova missione all'estero"}</h1>
      {error && <div className="banner error">{error}</div>}
      {where === "italy" ? (
        <TripItalyForm action={createTripRequest} superiors={superiors} submitLabel="Invia per autorizzazione" />
      ) : (
        <TripForm action={createTripRequest} superiors={superiors} submitLabel="Invia per approvazione" />
      )}
    </div>
  );
}
