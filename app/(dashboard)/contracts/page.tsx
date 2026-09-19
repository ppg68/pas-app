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
    <div style={{ padding: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <h1 style={{ fontSize: 18, fontWeight: 500 }}>Contracts</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link
            href="/contracts/invoices"
            style={{
              border: "0.5px solid #b4b2a9",
              borderRadius: 6,
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 500,
              color: "#1a1a1a",
            }}
          >
            Invoices
          </Link>
          <Link
            href="/contracts/access"
            style={{
              border: "0.5px solid #b4b2a9",
              borderRadius: 6,
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 500,
              color: "#1a1a1a",
            }}
          >
            Manage access
          </Link>
          <Link
            href="/contracts/new"
            style={{
              border: 0,
              borderRadius: 6,
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 500,
              background: "#1A3A5C",
              color: "#fff",
            }}
          >
            New contract
          </Link>
        </div>
      </div>
      <ContractsExplorer contracts={rows} />
    </div>
  );
}
