import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Driving distance between two places typed in the mileage rows of an expense report.
// Places are looked up on OpenStreetMap (Nominatim) and the road distance comes from the public OSRM server.
// Only the two place names leave the app, nothing else. Answers are kept in memory to spare the free services.

const UA = "PAS-Oikos-expense-mileage/1.0";
const cache = new Map<string, { km: number; from: string; to: string }>();

type Place = { lat: number; lon: number; name: string };

async function geocode(q: string): Promise<Place | null> {
  // Italy first (most trips), then the whole world
  for (const extra of ["&countrycodes=it", ""]) {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=it&q=${encodeURIComponent(q)}${extra}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) continue;
    const j = (await res.json()) as { lat: string; lon: string; display_name: string }[];
    if (j[0]) return { lat: parseFloat(j[0].lat), lon: parseFloat(j[0].lon), name: j[0].display_name };
  }
  return null;
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });

  const u = new URL(req.url);
  const from = (u.searchParams.get("from") ?? "").trim().slice(0, 120);
  const to = (u.searchParams.get("to") ?? "").trim().slice(0, 120);
  if (!from || !to) return Response.json({ error: "Enter the departure and the arrival place." }, { status: 400 });

  const key = `${from.toLowerCase()}|${to.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit) return Response.json(hit);

  try {
    const a = await geocode(from);
    if (!a) return Response.json({ error: `Place not found: ${from}` }, { status: 404 });
    // Nominatim asks for at most one request per second
    await new Promise((r) => setTimeout(r, 1100));
    const b = await geocode(to);
    if (!b) return Response.json({ error: `Place not found: ${to}` }, { status: 404 });

    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(10000),
    });
    const j = (await r.json()) as { code?: string; routes?: { distance: number }[] };
    if (!r.ok || j.code !== "Ok" || !j.routes?.[0]) return Response.json({ error: "No road route found between the two places." }, { status: 404 });

    const out = { km: Math.round(j.routes[0].distance / 1000), from: a.name, to: b.name };
    cache.set(key, out);
    return Response.json(out);
  } catch {
    return Response.json({ error: "The distance service did not answer. Try again, or type the km." }, { status: 502 });
  }
}
