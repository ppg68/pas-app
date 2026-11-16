import { createClient } from "@/lib/supabase/server";
import type { FuelPriceRow } from "@/lib/domain/fuelPrices";
import ExpenseForm, { type Holder, type TripOption } from "@/components/expenses/ExpenseForm";
import { createExpenseReport } from "../actions";

export default async function NewExpensePage({ searchParams }: { searchParams: Promise<{ error?: string; trip?: string }> }) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const [{ data: people }, { data: racList }, { data: carList }, { data: trips }] = await Promise.all([
    supabase.rpc("expense_superiors"),
    supabase.rpc("contract_role_holders", { r: "RAC" }),
    supabase.rpc("contract_role_holders", { r: "CAR" }),
    supabase
      .from("trip_requests")
      .select("id, number, traveler_name, destination, start_date, end_date, project_title, internal_code, donor_code")
      .in("status", ["approved", "closed"])
      .order("start_date", { ascending: false })
      .limit(100),
  ]);
  const { data: fp } = await supabase.from("fuel_prices").select("*").order("week_start");
  const fuelPrices = (fp ?? []) as FuelPriceRow[];
  const seen = new Set<string>();
  const racs = [...((racList as Holder[] | null) ?? []), ...((carList as Holder[] | null) ?? [])]
    .filter((h) => !seen.has(h.id) && seen.add(h.id))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user?.id ?? "").maybeSingle();
  const { data: me } = await supabase.from("profiles").select("can_file_for_others").eq("id", user?.id ?? "").maybeSingle();
  const notMe = (list: Holder[] | null) => (list ?? []).filter((h) => h.id !== user?.id);

  return (
    <div style={{ maxWidth: 980 }}>
      <h1 style={{ marginBottom: 16 }}>New expense report</h1>
      {error && <div className="banner error">{error}</div>}
      <ExpenseForm
        action={createExpenseReport}
        trips={(trips ?? []) as TripOption[]}
        workerName={profile?.full_name ?? ""}
        people={(people as Holder[] | null) ?? []}
        canFileForOthers={Boolean(me?.can_file_for_others)}
        pms={notMe(people as Holder[] | null)}
        racs={notMe(racs)}
        fuelPrices={fuelPrices}
        submitLabel="Save and attach receipts"
      />
    </div>
  );
}
