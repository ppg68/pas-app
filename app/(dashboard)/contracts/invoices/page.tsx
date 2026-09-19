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
    <div style={{ padding: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <div>
          <Link href="/contracts" style={{ fontSize: 13, color: "#5f5e5a" }}>
            ← Back to Contracts
          </Link>
          <h1 style={{ fontSize: 18, fontWeight: 500, marginTop: 4 }}>Invoices</h1>
        </div>
      </div>
      <InvoicesExplorer invoices={rows} />
    </div>
  );
}
