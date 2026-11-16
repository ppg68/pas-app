import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { FuelPriceRow } from "@/lib/domain/fuelPrices";
import ExpenseForm, { type Holder, type TripOption } from "@/components/expenses/ExpenseForm";
import type { ExpenseFileRow, ExpenseLineRow, ExpenseReportRow } from "@/lib/domain/expenses";
import { updateExpenseReport } from "../../actions";

export default async function EditExpensePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("expense_reports").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const r = data as ExpenseReportRow;
  const {
    data: { user: me0 },
  } = await supabase.auth.getUser();
  const [{ data: ls }, { data: fs }, { data: trips }] = await Promise.all([
    supabase.from("expense_lines").select("*").eq("report_id", id).order("seq"),
    supabase.from("expense_files").select("*").eq("report_id", id),
    supabase
      .from("trip_requests")
      .select("id, number, traveler_name, destination, start_date, end_date, project_title, internal_code, donor_code")
      .or(`requested_by.eq.${me0?.id ?? ""}${r.trip_id ? `,id.eq.${r.trip_id}` : ""}`)
      .in("status", ["approved", "closed"])
      .order("start_date", { ascending: false })
      .limit(100),
  ]);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = await supabase.from("profiles").select("can_file_for_others, full_name").eq("id", user?.id ?? "").maybeSingle();
  const { data: people } = me?.can_file_for_others ? await supabase.rpc("expense_superiors") : { data: [] };
  const { data: fp } = await supabase.from("fuel_prices").select("*").order("week_start");
  const fuelPrices = (fp ?? []) as FuelPriceRow[];

  return (
    <div style={{ maxWidth: 980 }}>
      <p style={{ marginBottom: 6 }}>
        <Link href={`/expenses/${id}`}>← {r.number}</Link>
      </p>
      <h1 style={{ marginBottom: 16 }}>Edit expense report {r.number}</h1>
      {error && <div className="banner error">{error}</div>}
      <ExpenseForm
        action={updateExpenseReport.bind(null, id)}
        defaults={r}
        defaultLines={(ls ?? []) as ExpenseLineRow[]}
        defaultFiles={(fs ?? []) as ExpenseFileRow[]}
        trips={(trips ?? []) as TripOption[]}
        fuelPrices={fuelPrices}
        workerName={me?.full_name ?? ""}
        people={(people as Holder[] | null) ?? []}
        canFileForOthers={Boolean(me?.can_file_for_others)}
        submitLabel="Save changes"
      />
    </div>
  );
}
