import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SchedaForm from "@/components/contract-requests/SchedaForm";
import { updateContractRequest } from "../../actions";
import type { ContractRequestRow } from "@/lib/domain/contractRequests";

export default async function EditContractRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("contract_requests").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const r = data as ContractRequestRow;
  if (r.status === "cancelled") redirect(`/contract-requests/${id}`);

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={{ marginBottom: 16 }}>Edit {r.number}</h1>
      {error && <div className="banner error">{decodeURIComponent(error)}</div>}
      <SchedaForm
        kind={r.kind}
        action={updateContractRequest.bind(null, id)}
        defaults={r}
        submitLabel="Save changes"
      />
    </div>
  );
}
