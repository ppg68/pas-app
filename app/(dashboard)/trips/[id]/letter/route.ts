import { createClient } from "@/lib/supabase/server";
import { buildContractDocx } from "@/lib/domain/contractDocx";
import type { ContractBlock } from "@/lib/domain/contractRequests";
import { letterKind } from "@/lib/domain/tripLetter";
import type { TripRow } from "@/lib/domain/trips";

export const dynamic = "force-dynamic";

/** Lettera di incarico per missione (Word), generata dalla scheda di attivazione. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Non autenticato", { status: 401 });

  const { data } = await supabase.from("trip_requests").select("*").eq("id", id).maybeSingle();
  if (!data) return new Response("Richiesta non trovata", { status: 404 });
  const r = data as TripRow;
  if (!letterKind(r)) return new Response("Per questo tipo di viaggiatore non c'è un modello di lettera.", { status: 404 });

  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  if (!(roles ?? []).some((x) => x.role === "CAP" || x.role === "ADMIN")) return new Response("La lettera la prepara il CAP.", { status: 403 });
  if (!r.letter_text) return new Response("La lettera non è ancora stata preparata.", { status: 404 });

  const buf = await buildContractDocx(r.letter_text as ContractBlock[]);
  const safe = `${r.number} ${r.traveler_name}`.replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "lettera";
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="Lettera di incarico ${safe}.docx"`,
    },
  });
}
