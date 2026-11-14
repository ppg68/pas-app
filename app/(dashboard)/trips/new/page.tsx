import { createClient } from "@/lib/supabase/server";
import TripForm, { type Holder } from "@/components/trips/TripForm";
import { createTripRequest } from "../actions";

export default async function NewTripPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const [{ data: pms }, { data: racList }, { data: carList }] = await Promise.all([
    supabase.rpc("contract_role_holders", { r: "PM" }),
    supabase.rpc("contract_role_holders", { r: "RAC" }),
    supabase.rpc("contract_role_holders", { r: "CAR" }),
  ]);
  const seen = new Set<string>();
  const racs = [...((racList as Holder[] | null) ?? []), ...((carList as Holder[] | null) ?? [])]
    .filter((h) => !seen.has(h.id) && seen.add(h.id))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const requesterIsPm = ((pms as Holder[] | null) ?? []).some((h) => h.id === user?.id);
  const notMe = (list: Holder[] | null) => (list ?? []).filter((h) => h.id !== user?.id);

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={{ marginBottom: 16 }}>New trip request</h1>
      {error && <div className="banner error">{error}</div>}
      <TripForm
        action={createTripRequest}
        pms={notMe(pms as Holder[] | null)}
        racs={notMe(racs)}
        requesterIsPm={requesterIsPm}
        submitLabel="Send for approval"
      />
    </div>
  );
}
