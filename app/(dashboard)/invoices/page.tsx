import { createClient } from "@/lib/supabase/server";
import IrInvoicesExplorer, { type IrInvoiceRow } from "@/components/invoices/IrInvoicesExplorer";

export default async function InvoicesPage() {
  const supabase = await createClient();
  const { data: invoices } = await supabase
    .from("invoices")
    .select("*")
    .order("payment_date", { ascending: false, nullsFirst: true });

  const rows: IrInvoiceRow[] = invoices ?? [];

  return (
    <div>
      <div className="page-header">
        <h1>Invoices</h1>
      </div>
      <IrInvoicesExplorer invoices={rows} />
    </div>
  );
}
