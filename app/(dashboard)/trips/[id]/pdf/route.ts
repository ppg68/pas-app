import { createClient } from "@/lib/supabase/server";
import { buildRequestPdf } from "@/lib/domain/requestPdf";
import { buildItalyTripPdf } from "@/lib/domain/tripItalyPdf";
import { tripSections } from "@/lib/domain/tripSections";
import { STATUS_LABEL, dateOnly, dt, type TripApproval, type TripRow } from "@/lib/domain/trips";

export const dynamic = "force-dynamic";

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
  const { data: aps } = await supabase.from("trip_approvals").select("*").eq("request_id", id);
  const approvals = ((aps ?? []) as TripApproval[]).sort((a, b) => (a.signer_role === "PM" ? -1 : 1) - (b.signer_role === "PM" ? -1 : 1));

  // trasferte in Italia: il PDF ha la forma del modulo PR09_1.6_AA09
  if (r.scope === "italy") {
    const pdf = await buildItalyTripPdf(r, approvals);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Autorizzazione trasferta ${r.number}.pdf"`,
      },
    });
  }

  const bytes = await buildRequestPdf(
    {
      title: `Trasferta ${r.number}`,
      lines: [`${r.traveler_name} - ${r.destination}`, `Stato: ${STATUS_LABEL[r.status]}`],
      subtitle: `dal ${dateOnly(r.start_date)} al ${dateOnly(r.end_date)} - ${r.project_title ?? ""}`,
      generated: `Generato dal PAS il ${dt(new Date().toISOString())}`,
    },
    tripSections(r, approvals)
  );
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Trasferta ${r.number}.pdf"`,
    },
  });
}
