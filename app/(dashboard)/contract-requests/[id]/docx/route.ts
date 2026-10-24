import { createClient } from "@/lib/supabase/server";
import { buildContractDocx } from "@/lib/domain/contractDocx";
import type { ContractBlock } from "@/lib/domain/contractRequests";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Not authenticated", { status: 401 });

  const { data } = await supabase
    .from("contract_requests")
    .select("number, party_name, contract_text")
    .eq("id", id)
    .maybeSingle();
  if (!data || !data.contract_text) return new Response("Contract text not available", { status: 404 });

  const buf = await buildContractDocx(data.contract_text as ContractBlock[]);
  const safe = `${data.number} ${data.party_name}`.replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "contract";
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="Contratto ${safe}.docx"`,
    },
  });
}
