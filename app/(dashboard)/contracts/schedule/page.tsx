import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchProjectDeadlines, deadlineFor } from "@/lib/domain/projectDeadlines";
import ScheduleTable, { type ScheduleRow } from "@/components/contracts/ScheduleTable";

export default async function ContractsSchedulePage() {
  const supabase = await createClient();

  const [{ data: contracts }, { data: tranches }] = await Promise.all([
    supabase
      .from("contracts")
      .select("id, legacy_id, subject, status, unit, project_code, currency")
      .neq("status", "annullato"),
    supabase
      .from("contract_tranches")
      .select("id, contract_id, seq, label, amount, due_date, due_condition")
      .eq("paid", false),
  ]);

  const deadlines = await fetchProjectDeadlines(supabase);
  const byId = new Map((contracts ?? []).map((c) => [c.id, c]));

  const rows: ScheduleRow[] = (tranches ?? [])
    .map((t) => {
      const c = byId.get(t.contract_id);
      if (!c) return null; // belongs to a cancelled contract
      return {
        id: t.id,
        contractId: c.id,
        contractNumber: c.legacy_id,
        subject: c.subject,
        status: c.status,
        unit: c.unit,
        project: c.project_code,
        currency: c.currency,
        seq: t.seq,
        label: t.label,
        amount: t.amount,
        dueDate: t.due_date,
        dueCondition: t.due_condition,
        projectDeadline: deadlineFor(deadlines, c.project_code),
      } satisfies ScheduleRow;
    })
    .filter((r): r is ScheduleRow => r !== null);

  return (
    <div>
      <Link href="/contracts" style={{ fontSize: 13, color: "var(--ink-soft)" }}>
        ← Back to Contracts
      </Link>
      <div className="page-header" style={{ marginTop: 10 }}>
        <div>
          <h1>Payment schedule</h1>
          <p className="subtitle">
            Unpaid tranches of all contracts, by due date. Tranches must be paid within the end date of the
            project they are allocated to.
          </p>
        </div>
      </div>
      <ScheduleTable rows={rows} />
    </div>
  );
}
