import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import InvoiceDetail, { type DetailContract, type InvoiceRecord } from "@/components/invoices/InvoiceDetail";
import ConfirmForm from "@/components/ConfirmForm";
import { deleteInvoiceAndGoBack } from "../actions";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: invoice } = await supabase.from("invoices").select("*").eq("id", id).single();
  if (!invoice) {
    return (
      <div style={{ fontSize: 13 }}>
        Invoice not found. <Link href="/invoices">← Back to Invoices</Link>
      </div>
    );
  }

  const [{ data: contracts }, { data: oldInvoices }, { data: irInvoices }] = await Promise.all([
    supabase.from("contracts").select("id, legacy_id, subject, amount, currency, project_code"),
    supabase.from("contract_invoices").select("contract_id, amount"),
    supabase.from("invoices").select("id, contract_id, amount, currency").not("contract_id", "is", null),
  ]);

  // invoiced per contract, EXCLUDING this invoice (the page adds it back with its live amount/currency)
  const invoicedOthers = new Map<string, number>();
  (oldInvoices ?? []).forEach((i) => {
    if (i.contract_id) invoicedOthers.set(i.contract_id, (invoicedOthers.get(i.contract_id) ?? 0) + (i.amount ?? 0));
  });
  const curOf = new Map((contracts ?? []).map((c) => [c.id, c.currency]));
  (irInvoices ?? []).forEach((i) => {
    if (i.id !== id && i.contract_id && curOf.get(i.contract_id) === i.currency) {
      invoicedOthers.set(i.contract_id, (invoicedOthers.get(i.contract_id) ?? 0) + (i.amount ?? 0));
    }
  });

  const detailContracts: DetailContract[] = (contracts ?? [])
    .filter((c) => c.legacy_id)
    .map((c) => ({
      id: c.id,
      number: c.legacy_id as string,
      subject: c.subject,
      amount: c.amount,
      currency: c.currency,
      project: c.project_code,
      invoicedOthers: invoicedOthers.get(c.id) ?? 0,
    }));

  const record: InvoiceRecord = {
    id: invoice.id,
    request_id: invoice.request_id,
    ir_number: invoice.ir_number,
    protocol: invoice.protocol,
    contract_number: invoice.contract_number,
    supplier: invoice.supplier,
    due_date: invoice.due_date,
    payment_date: invoice.payment_date,
    payment_note: invoice.payment_note,
    currency: invoice.currency,
    amount: invoice.amount,
    withholding: invoice.withholding,
    pa_signed: invoice.pa_signed,
    project_code: invoice.project_code,
    budget_line: invoice.budget_line,
    cup: invoice.cup,
    notes: invoice.notes,
  };

  return (
    <div style={{ maxWidth: 820 }}>
      <Link href={`/invoices#inv-${invoice.id}`} style={{ fontSize: 13, color: "var(--ink-soft)" }}>
        ← Back to Invoices
      </Link>
      <h1 style={{ margin: "10px 0 4px" }}>{invoice.supplier || "Invoice"}</h1>
      <p className="subtitle" style={{ marginBottom: 16 }}>
        {[invoice.protocol && `prot. ${invoice.protocol}`, invoice.ir_number && `IR ${invoice.ir_number}`]
          .filter(Boolean)
          .join(" · ") || "Changes are saved automatically."}
      </p>

      <InvoiceDetail record={record} contracts={detailContracts} />

      <div style={{ marginTop: 16 }}>
        <ConfirmForm
          action={deleteInvoiceAndGoBack.bind(null, invoice.id)}
          message={`Delete this invoice?\n\n${invoice.supplier ?? ""}${invoice.protocol ? " · prot. " + invoice.protocol : ""} · ${invoice.amount} ${invoice.currency}\n\nThis cannot be undone.`}
        >
          <button type="submit" className="ghost danger">
            Delete invoice
          </button>
        </ConfirmForm>
      </div>
    </div>
  );
}
