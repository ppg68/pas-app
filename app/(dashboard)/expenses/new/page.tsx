import { createClient } from "@/lib/supabase/server";
import ExpenseForm, { type Holder, type TripOption } from "@/components/expenses/ExpenseForm";
import { createExpenseReport } from "../actions";

export default async function NewExpensePage({ searchParams }: { searchParams: Promise<{ error?: string; trip?: string }> }) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const [{ data: pms }, { data: racList }, { data: carList }, { data: trips }] = await Promise.all([
    supabase.rpc("contract_role_holders", { r: "PM" }),
    supabase.rpc("contract_role_holders", { r: "RAC" }),
    supabase.rpc("contract_role_holders", { r: "CAR" }),
    supabase
      .from("trip_requests")
      .select("id, number, traveler_name, destination, start_date, end_date, project_title, internal_code, donor_code")
      .in("status", ["approved", "closed"])
      .order("start_date", { ascending: false })
      .limit(100),
  ]);
  const seen = new Set<string>();
  const racs = [...((racList as Holder[] | null) ?? []), ...((carList as Holder[] | null) ?? [])]
    .filter((h) => !seen.has(h.id) && seen.add(h.id))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user?.id ?? "").maybeSingle();
  const requesterIsPm = ((pms as Holder[] | null) ?? []).some((h) => h.id === user?.id);
  const notMe = (list: Holder[] | null) => (list ?? []).filter((h) => h.id !== user?.id);

  return (
    <div style={{ maxWidth: 980 }}>
      <h1 style={{ marginBottom: 16 }}>New expense report</h1>
      {error && <div className="banner error">{error}</div>}
      <ExpenseForm
        action={createExpenseReport}
        trips={(trips ?? []) as TripOption[]}
        workerName={profile?.full_name ?? ""}
        pms={notMe(pms as Holder[] | null)}
        racs={notMe(racs)}
        requesterIsPm={requesterIsPm}
        submitLabel="Save and attach receipts"
      />
    </div>
  );
}
