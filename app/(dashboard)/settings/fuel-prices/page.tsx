import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/SubmitButton";
import { importFuelPrices } from "./actions";

export default async function FuelPricesPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { error, ok } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: myRoles } = await supabase.from("user_roles").select("role").eq("user_id", user?.id ?? "");
  if (!(myRoles ?? []).some((r) => r.role === "ADMIN")) redirect("/");
  const { data } = await supabase.from("fuel_prices").select("*").order("week_start", { ascending: false }).limit(12);
  const fmt = (n: number | null) => (n == null ? "" : n.toFixed(3).replace(".", ","));
  const d = (s: string) => s.split("-").reverse().join("/");

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ marginBottom: 4 }}>ACI fuel prices</h1>
      <p className="subtitle" style={{ marginBottom: 16 }}>
        Weekly national average prices (euro per litre) used to fill in the ACI cost of the mileage rows. Paste the new rows of the ACI PDF
        (date, petrol, diesel, LPG and, if you have them, methane per kg and electricity per kWh): rows already present are updated. Methane arrives by itself every week; electricity is pasted from the ACI table.
      </p>
      {error && <div className="banner error">{error}</div>}
      {ok && <div className="banner">{ok} week(s) saved.</div>}
      <form action={importFuelPrices} className="card" style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
        <textarea name="rows" rows={6} placeholder={"09/11/2026 2,050 2,200 0,770 1,880 0,250"} style={{ fontFamily: "monospace" }} />
        <SubmitButton style={{ width: "fit-content" }} pendingLabel="Saving…">
          Save prices
        </SubmitButton>
      </form>
      <h2 style={{ fontSize: "1rem", marginBottom: 6 }}>Latest weeks</h2>
      <table style={{ borderCollapse: "collapse", fontSize: "0.9rem" }}>
        <thead>
          <tr style={{ textAlign: "left" }}>
            <th style={{ padding: "3px 14px 3px 0" }}>Week of</th>
            <th style={{ padding: "3px 14px" }}>Petrol</th>
            <th style={{ padding: "3px 14px" }}>Diesel</th>
            <th style={{ padding: "3px 14px" }}>LPG</th>
            <th style={{ padding: "3px 14px" }}>Methane €/kg</th>
            <th style={{ padding: "3px 14px" }}>Electricity €/kWh</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((p) => (
            <tr key={p.week_start}>
              <td style={{ padding: "3px 14px 3px 0" }}>{d(p.week_start)}</td>
              <td style={{ padding: "3px 14px" }}>{fmt(p.petrol)}</td>
              <td style={{ padding: "3px 14px" }}>{fmt(p.diesel)}</td>
              <td style={{ padding: "3px 14px" }}>{fmt(p.lpg)}</td>
              <td style={{ padding: "3px 14px" }}>{fmt(p.methane)}</td>
              <td style={{ padding: "3px 14px" }}>{fmt(p.electricity)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
