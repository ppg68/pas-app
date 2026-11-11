import { createClient } from "@/lib/supabase/server";
import { normalizeContractNumber } from "@/lib/domain/contracts";
import { fetchProjectCups } from "@/lib/domain/projectCups";
import { fetchIrRefs } from "@/lib/domain/irRefs";
import IrInvoicesExplorer, {
  type IrInvoiceListRow,
  type ContractRef,
} from "@/components/invoices/IrInvoicesExplorer";

export default async function InvoicesPage() {
  const supabase = await createClient();
  const { data: invoices } = await supabase
    .from("invoices")
    .select("*")
    .order("payment_date", { ascending: false, nullsFirst: true });

  // Contract access is limited to the CONTRACTS role: without it the list is empty and no link/value is shown.
  const [{ data: contracts }, { data: oldInvoices }] = await Promise.all([
    supabase.from("contracts").select("id, legacy_id, subject, amount, currency"),
    supabase.from("contract_invoices").select("contract_id, amount"),
  ]);

  const oldSum = new Map<string, number>();
  (oldInvoices ?? []).forEach((i) => {
    if (i.contract_id) oldSum.set(i.contract_id, (oldSum.get(i.contract_id) ?? 0) + (i.amount ?? 0));
  });

  const contractRefs: ContractRef[] = (contracts ?? []).map((c) => ({
    id: c.id,
    number: c.legacy_id ?? "",
    subject: c.subject,
    amount: c.amount,
    currency: c.currency,
    oldInvoiced: oldSum.get(c.id) ?? 0,
  }));

  const projectCups = await fetchProjectCups(supabase);
  const irRefs = await fetchIrRefs(supabase);

  const byNumber = new Map<string, string>();
  contractRefs.forEach((c) => {
    if (c.number) byNumber.set(normalizeContractNumber(c.number), c.id);
  });

  // payments of every invoice: dated ones count as paid, undated ones are authorized and still to be paid
  const paidBy = new Map<string, number>();
  const toPayBy = new Map<string, number>();
  for (let from = 0; ; from += 1000) {
    const { data: pays } = await supabase
      .from("invoice_payments")
      .select("invoice_id, payment_date, amount")
      .range(from, from + 999);
    (pays ?? []).forEach((p) => {
      const m = p.payment_date ? paidBy : toPayBy;
      m.set(p.invoice_id, (m.get(p.invoice_id) ?? 0) + (p.amount ?? 0));
    });
    if (!pays || pays.length < 1000) break;
  }

  const rows: IrInvoiceListRow[] = (invoices ?? []).map((inv) => ({
    ...inv,
    paid: paidBy.get(inv.id) ?? 0,
    toPay: toPayBy.get(inv.id) ?? 0,
    contractUuid:
      inv.contract_id ??
      (inv.contract_number ? (byNumber.get(normalizeContractNumber(inv.contract_number)) ?? null) : null),
  }));

  return (
    <div>
      <div className="page-header">
        <h1>Invoices</h1>
      </div>
      <IrInvoicesExplorer invoices={rows} contracts={contractRefs} projectCups={projectCups} irRefs={irRefs} />
    </div>
  );
}
