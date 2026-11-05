import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SchedaForm, { type Holder } from "@/components/contract-requests/SchedaForm";
import { createContractRequest } from "../actions";
import type { RequestKind } from "@/lib/domain/contractRequests";

export default async function NewContractRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; error?: string }>;
}) {
  const { kind: kindParam, error } = await searchParams;
  const kind: RequestKind | null = kindParam === "person" || kindParam === "company" ? kindParam : null;

  if (!kind) {
    return (
      <div style={{ maxWidth: 640 }}>
        <h1 style={{ marginBottom: 16 }}>New contract request</h1>
        <p className="subtitle">Who is the contract with?</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/contract-requests/new?kind=person" className="card" style={{ flex: 1, minWidth: 220 }}>
            <b>Individual</b>
            <p className="subtitle" style={{ margin: "6px 0 0" }}>Consultant with VAT number or occasional service.</p>
          </Link>
          <Link href="/contract-requests/new?kind=company" className="card" style={{ flex: 1, minWidth: 220 }}>
            <b>Company / organisation</b>
            <p className="subtitle" style={{ margin: "6px 0 0" }}>Company, institute, association.</p>
          </Link>
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: pms }, { data: racList }, { data: carList }] = await Promise.all([
    supabase.rpc("contract_role_holders", { r: "PM" }),
    supabase.rpc("contract_role_holders", { r: "RAC" }),
    supabase.rpc("contract_role_holders", { r: "CAR" }),
  ]);
  const seenIds = new Set<string>();
  const racs = [...((racList as Holder[] | null) ?? []), ...((carList as Holder[] | null) ?? [])]
    .filter((h) => !seenIds.has(h.id) && seenIds.add(h.id))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const notMe = (list: Holder[] | null) => (list ?? []).filter((h) => h.id !== user?.id);

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={{ marginBottom: 16 }}>New contract request — {kind === "company" ? "company" : "individual"}</h1>
      {error && <div className="banner error">{error}</div>}
      <SchedaForm
        kind={kind}
        action={createContractRequest.bind(null, kind)}
        pms={notMe(pms as Holder[] | null)}
        racs={notMe(racs)}
        submitLabel="Send for approval"
      />
    </div>
  );
}
