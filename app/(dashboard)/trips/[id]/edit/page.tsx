import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TripForm from "@/components/trips/TripForm";
import type { TripRow } from "@/lib/domain/trips";
import { updateTripRequest } from "../../actions";

export default async function EditTripPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("trip_requests").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const r = data as TripRow;

  return (
    <div style={{ maxWidth: 760 }}>
      <p style={{ marginBottom: 6 }}>
        <Link href={`/trips/${id}`}>← {r.number}</Link>
      </p>
      <h1 style={{ marginBottom: 16 }}>Edit trip request {r.number}</h1>
      {error && <div className="banner error">{error}</div>}
      <TripForm action={updateTripRequest.bind(null, id)} defaults={r} submitLabel="Save changes" />
    </div>
  );
}
