import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ExpenseForm, { type TripOption } from "@/components/expenses/ExpenseForm";
import type { ExpenseLineRow, ExpenseReportRow } from "@/lib/domain/expenses";
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
  const [{ data: ls }, { data: trips }] = await Promise.all([
    supabase.from("expense_lines").select("*").eq("report_id", id).order("seq"),
    supabase
      .from("trip_requests")
      .select("id, number, traveler_name, destination, start_date, end_date, project_title, internal_code, donor_code")
      .in("status", ["approved", "closed"])
      .order("start_date", { ascending: false })
      .limit(100),
  ]);

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
        trips={(trips ?? []) as TripOption[]}
        submitLabel="Save changes"
      />
    </div>
  );
}
