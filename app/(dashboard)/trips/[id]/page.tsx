import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ConfirmForm from "@/components/ConfirmForm";
import SubmitButton from "@/components/SubmitButton";
import CopyText from "@/components/trips/CopyText";
import { tripSections } from "@/lib/domain/tripSections";
import { letterKind } from "@/lib/domain/tripLetter";
import { TRAVELER_LABEL, STATUS_LABEL, TDR_TITLE, dt, type TripApproval, type TripRow } from "@/lib/domain/trips";
import { cancelTripRequest, deleteTripRequest, prepareTripLetter, saveTripLetterText, signTripRequest } from "../actions";

export default async function TripDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; letter?: string }>;
}) {
  const { id } = await params;
  const { error, letter } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase.from("trip_requests").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const r = data as TripRow;

  const [{ data: aps }, { data: myRoles }] = await Promise.all([
    supabase.from("trip_approvals").select("*").eq("request_id", id),
    supabase.from("user_roles").select("role").eq("user_id", user?.id ?? ""),
  ]);
  const approvals = ((aps ?? []) as TripApproval[]).sort((a, b) => (a.signer_role === "PM" ? -1 : 1) - (b.signer_role === "PM" ? -1 : 1));
  const roles = (myRoles ?? []).map((x) => x.role as string);
  const isAdmin = roles.includes("ADMIN");
  const isOwner = r.requested_by === user?.id;
  const anySigned = approvals.some((a) => a.signed_at);
  const canEdit = isOwner && r.status === "pending" && !anySigned;
  const canPrepareLetter = Boolean(letterKind(r)) && (roles.includes("CAP") || isAdmin) && (r.status === "approved" || r.status === "closed");
  const sections = tripSections(r, approvals).filter((s) => s.title !== "Approvazioni e storia");

  return (
    <div style={{ maxWidth: 820 }}>
      <p style={{ marginBottom: 6 }}>
        <Link href="/trips">← Trasferte</Link>
      </p>
      <div className="page-header">
        <div>
          <h1>
            {r.number} · {r.traveler_name}
          </h1>
          <p className="subtitle">
            {r.destination} · richiesta da {r.requester_name} il {dt(r.created_at)}
          </p>
        </div>
        <div className="page-actions">
          <span className={`stamp ${r.status === "pending" || r.status === "approved" ? "warn" : r.status === "closed" ? "brand" : ""}`}>
            {STATUS_LABEL[r.status]}
          </span>
          <a href={`/trips/${id}/pdf`} className="ghost">
            PDF
          </a>
        </div>
      </div>

      {error && <div className="banner error">{error}</div>}

      <div className="card" style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: "1rem", marginBottom: 8 }}>Approvazioni</h2>
        {!approvals.some((a) => a.signer_role === "PM") && (
          <p className="subtitle" style={{ margin: "0 0 6px" }}>
            Nessun responsabile registrato per questa richiesta.
          </p>
        )}
        {approvals.map((a) => (
          <div key={a.signer_role} style={{ display: "flex", gap: 12, alignItems: "center", padding: "4px 0" }}>
            <b style={{ width: 120, flexShrink: 0 }}>{a.signer_role === "RAC" ? "RAC / CAR" : "Responsabile"}</b>
            <span style={{ flex: 1 }}>{a.user_name}</span>
            {a.signed_at ? (
              <span className="stamp brand">approvata {dt(a.signed_at)}</span>
            ) : r.status === "pending" && a.user_id === user?.id ? (
              <form action={signTripRequest.bind(null, id, a.signer_role)}>
                <SubmitButton pendingLabel={r.scope === "italy" ? "Autorizzazione…" : "Approvazione…"}>{r.scope === "italy" ? "Autorizza" : "Approva"}</SubmitButton>
              </form>
            ) : (
              <span className="stamp">in attesa</span>
            )}
          </div>
        ))}
        {(canEdit || (isOwner && r.status === "pending") || isAdmin) && (
          <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            {canEdit && (
              <Link href={`/trips/${id}/edit`} className="ghost">
                Modifica la richiesta
              </Link>
            )}
            {(canEdit || isAdmin) && (
              <ConfirmForm
                action={deleteTripRequest.bind(null, id)}
                message={anySigned ? "Questa richiesta è già stata approvata. Eliminarla definitivamente?" : "Eliminare questa richiesta?"}
              >
                <button type="submit" className="ghost danger">
                  Elimina
                </button>
              </ConfirmForm>
            )}
            {!canEdit && isOwner && r.status === "pending" && (
              <ConfirmForm action={cancelTripRequest.bind(null, id)} message="Annullare questa richiesta?">
                <button type="submit" className="ghost danger">
                  Annulla la richiesta
                </button>
              </ConfirmForm>
            )}
          </div>
        )}
      </div>

      {!canPrepareLetter && (roles.includes("CAP") || isAdmin) && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h2 style={{ fontSize: "1rem", marginBottom: 8 }}>Lettera di incarico</h2>
          <p className="subtitle" style={{ margin: 0 }}>
            {r.scope === "italy"
              ? "Le trasferte in Italia (modulo AA09) non hanno lettera di incarico."
              : !letterKind(r)
                ? `Per questo tipo di viaggiatore (${TRAVELER_LABEL[r.traveler_type]}) non c'è un modello di lettera: le lettere esistono per dipendenti e collaboratori.`
                : "La lettera si prepara dopo l'approvazione della richiesta."}
          </p>
        </div>
      )}

      {canPrepareLetter && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h2 style={{ fontSize: "1rem", marginBottom: 8 }}>Lettera di incarico</h2>
          {letter === "ready" && <div className="banner">Testo della lettera preparato. Controllalo, correggilo se serve e scarica il Word.</div>}
          {letter === "saved" && <div className="banner">Testo salvato.</div>}
          <p className="subtitle" style={{ margin: "0 0 10px" }}>
            Compila i dati qui sotto e prepara il testo della lettera. Poi puoi modificare ogni paragrafo prima di scaricare il Word.
          </p>
          <form action={prepareTripLetter.bind(null, id)} style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div className="field" style={{ flex: 2, minWidth: 200 }}>
                <label>Nato/a a</label>
                <input name="l_birth_place" defaultValue={r.letter?.birth_place ?? ""} />
              </div>
              <div className="field" style={{ flex: 1, minWidth: 160 }}>
                <label>Il</label>
                <input name="l_birth_date" type="date" defaultValue={r.letter?.birth_date ?? ""} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div className="field" style={{ flex: 2, minWidth: 220 }}>
                <label>Residente a (città e indirizzo)</label>
                <input name="l_residence" defaultValue={r.letter?.residence ?? ""} />
              </div>
              <div className="field" style={{ flex: 1, minWidth: 160 }}>
                <label>Codice fiscale</label>
                <input name="l_tax_code" defaultValue={r.letter?.tax_code ?? ""} />
              </div>
            </div>
            {r.traveler_type === "cococo" && (
              <>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <div className="field" style={{ flex: 1, minWidth: 160 }}>
                    <label>Profilo professionale (A-F)</label>
                    <select name="l_profile" defaultValue={r.letter?.profile ?? ""}>
                      <option value="">—</option>
                      {["A", "B", "C", "D", "E", "F"].map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field" style={{ flex: 1, minWidth: 160 }}>
                    <label>Compenso giornaliero lordo (€)</label>
                    <input name="l_daily_fee" defaultValue={r.letter?.daily_fee ?? ""} inputMode="decimal" />
                  </div>
                  <div className="field" style={{ flex: 1, minWidth: 160 }}>
                    <label>Compenso aggiuntivo lordo (€)</label>
                    <input name="l_extra_fee" defaultValue={r.letter?.extra_fee ?? ""} inputMode="decimal" />
                  </div>
                </div>
                <label className="checkbox-row">
                  <input type="checkbox" name="l_contract_fee" defaultChecked={r.letter?.contract_fee ?? false} /> Si applica anche il compenso
                  giornaliero già previsto dal contratto in essere
                </label>
              </>
            )}
            <SubmitButton className="ghost" pendingLabel="Preparazione…" style={{ width: "fit-content" }}>
              {r.letter_text ? "Rigenera il testo dai dati (perde le modifiche a mano)" : "Prepara il testo della lettera"}
            </SubmitButton>
          </form>

          {r.letter_text && (
            <>
              <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                <a href={`/trips/${id}/letter`} className="primary">
                  Scarica Word (.docx)
                </a>
              </div>
              <p className="subtitle" style={{ margin: "0 0 10px" }}>
                Ogni riga è un paragrafo. Metti <b>due asterischi</b> attorno alle parole da stampare in grassetto. Spunta &ldquo;togli&rdquo; per eliminare un articolo.
              </p>
              <form action={saveTripLetterText.bind(null, id)} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {r.letter_text.map((b, i) => (
                  <div key={b.key + i} className="field" style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                    {b.title ? (
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <textarea name={`title_${i}`} defaultValue={b.title} rows={b.title.includes("\n") ? 2 : 1} style={{ flex: 1, fontWeight: 600, resize: "vertical" }} />
                        <label className="checkbox-row" style={{ whiteSpace: "nowrap" }}>
                          <input type="checkbox" name={`remove_${i}`} /> togli
                        </label>
                      </div>
                    ) : (
                      <input type="hidden" name={`title_${i}`} value="" />
                    )}
                    <textarea
                      name={`body_${i}`}
                      defaultValue={b.body}
                      rows={Math.min(18, Math.max(3, b.body.split("\n").length + 1))}
                      style={{ resize: "vertical", fontFamily: "inherit" }}
                    />
                  </div>
                ))}
                <SubmitButton style={{ width: "fit-content" }} pendingLabel="Salvataggio…">
                  Salva il testo
                </SubmitButton>
              </form>
            </>
          )}
        </div>
      )}

      {sections.map((s) => (
        <div key={s.title} className="card" style={{ marginBottom: 14 }}>
          <h2 style={{ fontSize: "1rem", marginBottom: 8 }}>{s.title}</h2>
          {s.title === TDR_TITLE && <CopyText text={(s.notes ?? []).join("\n")} />}
          {(s.rows ?? [])
            .filter(([, v]) => v)
            .map(([label, value]) => (
              <div key={label} style={{ display: "flex", gap: 10, padding: "3px 0", fontSize: "0.88rem" }}>
                <span style={{ width: 190, flexShrink: 0, color: "var(--ink-soft)" }}>{label}</span>
                <span style={{ whiteSpace: "pre-wrap" }}>{value}</span>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}
