import { createClient } from "@/lib/supabase/server";
import IrInvoicesExplorer, { type IrInvoiceListRow } from "@/components/invoices/IrInvoicesExplorer";

/** Same normalisation used when the historic data was imported: "07/25" and "7/25" are the same contract. */
function normalizeContractNumber(n: string): string {
  return n.trim().toUpperCase().replace(/(^|\/)0+(\d)/g, "$1$2");
}

export default async function InvoicesPage() {
  const supabase = await createClient();
  const { data: invoices } = await supabase
    .from("invoices")
    .select("*")
    .order("payment_date", { ascending: false, nullsFirst: true });

  // Contract access is limited to the CONTRACTS role: without it the map is empty and no link is shown.
  const { data: contracts } = await supabase.from("contracts").select("id, legacy_id");
  const byNumber = new Map<string, string>();
  (contracts ?? []).forEach((c) => {
    if (c.legacy_id) byNumber.set(normalizeContractNumber(c.legacy_id), c.id);
  });

  const rows: IrInvoiceListRow[] = (invoices ?? []).map((inv) => ({
    ...inv,
    contractUuid:
      inv.contract_id ??
      (inv.contract_number ? (byNumber.get(normalizeContractNumber(inv.contract_number)) ?? null) : null),
  }));

  return (
    <div>
      <div className="page-header">
        <h1>Invoices</h1>
      </div>
      <IrInvoicesExplorer invoices={rows} />
    </div>
  );
}
