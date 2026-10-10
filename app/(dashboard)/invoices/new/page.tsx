import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import NewInvoiceForm, { type FormContract } from "@/components/invoices/NewInvoiceForm";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data: contracts }, { data: oldInvoices }, { data: irInvoices }] = await Promise.all([
    supabase.from("contracts").select("id, legacy_id, subject, amount, currency, project_code"),
    supabase.from("contract_invoices").select("contract_id, amount"),
    supabase.from("invoices").select("contract_id, amount, currency").not("contract_id", "is", null),
  ]);

  const invoiced = new Map<string, number>();
  (oldInvoices ?? []).forEach((i) => {
    if (i.contract_id) invoiced.set(i.contract_id, (invoiced.get(i.contract_id) ?? 0) + (i.amount ?? 0));
  });
  const cur = new Map((contracts ?? []).map((c) => [c.id, c.currency]));
  (irInvoices ?? []).forEach((i) => {
    if (i.contract_id && cur.get(i.contract_id) === i.currency) {
      invoiced.set(i.contract_id, (invoiced.get(i.contract_id) ?? 0) + (i.amount ?? 0));
    }
  });

  const formContracts: FormContract[] = (contracts ?? [])
    .filter((c) => c.legacy_id)
    .map((c) => ({
      number: c.legacy_id as string,
      subject: c.subject,
      amount: c.amount,
      currency: c.currency,
      project: c.project_code,
      invoiced: invoiced.get(c.id) ?? 0,
    }));

  return (
    <div style={{ maxWidth: 760 }}>
      <Link href="/invoices" style={{ fontSize: 13, color: "var(--ink-soft)" }}>
        ← Back to Invoices
      </Link>
      <h1 style={{ margin: "10px 0 16px" }}>New invoice</h1>
      {error && <div className="banner error">{decodeURIComponent(error)}</div>}
      <NewInvoiceForm contracts={formContracts} />
    </div>
  );
}
