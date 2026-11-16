import { createClient } from "@/lib/supabase/server";
import TripForm, { type Holder } from "@/components/trips/TripForm";
import { createTripRequest } from "../actions";

export default async function NewTripPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: people } = await supabase.rpc("expense_superiors");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const superiors = ((people as Holder[] | null) ?? []).filter((h) => h.id !== user?.id);

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={{ marginBottom: 16 }}>New trip request</h1>
      {error && <div className="banner error">{error}</div>}
      <TripForm action={createTripRequest} superiors={superiors} submitLabel="Send for approval" />
    </div>
  );
}
