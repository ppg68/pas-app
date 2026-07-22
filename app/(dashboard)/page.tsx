import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { procConfigFor, STAGE_TITLES } from "@/lib/domain/procedures";

export default async function RequestListPage() {
  const supabase = await createClient();
  const { data: requests } = await supabase
    .from("requests")
    .select("id, code, description, estimated_price, currency, proc_code, stage, created_at")
    .order("created_at", { ascending: false });

  return (
    <div style={{ maxWidth: 900, padding: 24 }}>
      <h1 style={{ fontSize: 18, fontWeight: 500, marginBottom: 20 }}>Richieste</h1>

      {(!requests || requests.length === 0) && (
        <p style={{ fontSize: 13, color: "#5f5e5a" }}>Nessuna richiesta ancora.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(requests ?? []).map((r) => (
          <Link
            key={r.id}
            href={`/requests/${r.id}`}
            style={{
              border: "0.5px solid #d3d1c7",
              borderRadius: 10,
              padding: 12,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              color: "inherit",
              textDecoration: "none",
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{r.code}</div>
              <div style={{ fontSize: 12, color: "#888780" }}>
                {r.description} · {procConfigFor(r.proc_code).label} · {r.estimated_price}{" "}
                {r.currency}
              </div>
            </div>
            <div
              style={{
                fontSize: 11,
                border: "0.5px solid #b4b2a9",
                borderRadius: 999,
                padding: "3px 10px",
              }}
            >
              {STAGE_TITLES[r.stage]}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
