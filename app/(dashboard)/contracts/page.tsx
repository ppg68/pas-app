import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { totalPaid } from "@/lib/domain/contracts";
import ContractsExplorer, { type ContractListRow } from "@/components/contracts/ContractsExplorer";

export default async function ContractsListPage() {
  const supabase = await createClient();
  const { data: contracts } = await supabase
    .from("contracts")
    .select("*")
    .order("created_at", { ascending: false });

  const contractIds = (contracts ?? []).map((c) => c.id);
  const { data: tranches } = contractIds.length
    ? await supabase
        .from("contract_tranches")
        .select("contract_id, amount, paid, paid_amount")
        .in("contract_id", contractIds)
    : { data: [] as { contract_id: string; amount: number; paid: boolean; paid_amount: number | null }[] };

  const tranchesByContract = new Map<string, { amount: number; paid: boolean; paid_amount: number | null }[]>();
  (tranches ?? []).forEach((t) => {
    const list = tranchesByContract.get(t.contract_id) ?? [];
    list.push(t);
    tranchesByContract.set(t.contract_id, list);
  });

  const rows: ContractListRow[] = (contracts ?? []).map((c) => {
    const ts = tranchesByContract.get(c.id) ?? [];
    return {
      ...c,
      paid: totalPaid(ts),
      tranchesCount: ts.length,
    };
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Contracts</h1>
          <p className="subtitle">{rows.length} records</p>
        </div>
        <div className="page-actions">
          <Link href="/contracts/invoices" className="ghost">
            Invoices
          </Link>
          <Link href="/contracts/access" className="ghost">
            Manage access
          </Link>
          <Link href="/contracts/new" className="primary">
            New contract
          </Link>
        </div>
      </div>
      <ContractsExplorer contracts={rows} />
    </div>
  );
}
