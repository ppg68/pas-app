import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchProjectCups } from "@/lib/domain/projectCups";
import { fetchIrRefs } from "@/lib/domain/irRefs";
import { procConfigFor } from "@/lib/domain/procedures";
import NewInvoiceForm, { type FormContract, type AwaitingRequest } from "@/components/invoices/NewInvoiceForm";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const projectCups = await fetchProjectCups(supabase);
  const irRefs = await fetchIrRefs(supabase);
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

  // Requests created in the app that are waiting for their invoice: winner chosen (or direct purchase),
  // not yet closed.
  const { data: open } = await supabase
    .from("requests")
    .select("id, code, ir_number, country, description, project_code, currency, proc_code, estimated_price, stage, winner_offer_id")
    .eq("is_legacy", false)
    .in("stage", ["documents", "payment"])
    .order("created_at", { ascending: false });
  const winnerIds = (open ?? []).map((r) => r.winner_offer_id).filter((v): v is string => !!v);
  const { data: winnerOffers } = winnerIds.length
    ? await supabase.from("offers").select("id, supplier, price").in("id", winnerIds)
    : { data: [] as { id: string; supplier: string; price: number }[] };
  const awaiting: AwaitingRequest[] = (open ?? []).map((r) => {
    const w = (winnerOffers ?? []).find((o) => o.id === r.winner_offer_id);
    return {
      id: r.id,
      ir: r.ir_number ?? (r.country === "IT" ? r.code.split("_")[0] : r.code),
      description: r.description,
      project: r.project_code,
      currency: r.currency,
      procedure: procConfigFor(r.proc_code).label,
      stage: r.stage,
      supplier: w?.supplier ?? null,
      value: w?.price ?? r.estimated_price,
    };
  });

  return (
    <div style={{ maxWidth: 760 }}>
      <Link href="/invoices" style={{ fontSize: 13, color: "var(--ink-soft)" }}>
        ← Back to Invoices
      </Link>
      <h1 style={{ margin: "10px 0 16px" }}>New invoice</h1>
      {error && <div className="banner error">{decodeURIComponent(error)}</div>}
      <NewInvoiceForm contracts={formContracts} projectCups={projectCups} irRefs={irRefs} awaiting={awaiting} />
    </div>
  );
}
