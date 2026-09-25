import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import InvoicesExplorer, { type InvoiceListRow } from "@/components/contracts/InvoicesExplorer";

export default async function InvoicesListPage() {
  const supabase = await createClient();
  const { data: invoices } = await supabase
    .from("contract_invoices")
    .select("*")
    .order("invoice_date", { ascending: false, nullsFirst: false });

  const rows: InvoiceListRow[] = (invoices ?? []).map((inv) => ({
    ...inv,
    contractUuid: inv.contract_id,
  }));

  return (
    <div>
      <div className="page-header">
        <div>
          <Link href="/contracts" style={{ fontSize: 13, color: "var(--ink-soft)" }}>
            ← Back to Contracts
          </Link>
          <h1 style={{ marginTop: 4 }}>Contract invoices</h1>
        </div>
      </div>
      <InvoicesExplorer invoices={rows} />
    </div>
  );
}
