"use client";

import { useState } from "react";

type Step = { title: string; who: string; text: string[] };

const STEPS: Step[] = [
  {
    title: "Compilare la richiesta (IR)",
    who: "Chi apre la IR: Budget Holder o PM",
    text: [
      "Compila progetto, linea di budget, descrizione e importo, e scegli la procedura: la scegli tu, non viene proposta in base all'importo (segue la linea di budget del progetto).",
      "Scegliere Single Quotation per un importo da Three Quotations è una deroga: serve il motivo, la data e firmano sia CAR sia RAC.",
      "Indica chi deve approvare: ogni spesa ha l'approvazione dell'amministrazione (CAR o RAC); sopra l'acquisto diretto firma anche il PM. Chi è scelto riceve subito una email.",
    ],
  },
  {
    title: "Approvazione della IR",
    who: "CAR o RAC (e PM se richiesto)",
    text: [
      "Gli approvatori ricevono l'email, aprono la richiesta e firmano. Nessuno può firmare una richiesta che ha aperto lui.",
      "Chi ha aperto la IR riceve una email a ogni firma e quando l'approvazione è completa.",
    ],
  },
  {
    title: "Offerte e vincitore",
    who: "Chi ha aperto la IR",
    text: [
      "Per Single Quotation, Three Quotations, Simplified Procedure e Tender inserisci fornitore e importo di ogni offerta nella scheda «Procedure files», subito sotto la cartella 03 Quotations received. Il numero minimo è indicato sopra l'elenco.",
      "Premi «Close offer collection» e scegli il vincitore. L'acquisto diretto non ha offerte: il fornitore si scrive nella richiesta.",
    ],
  },
  {
    title: "Documenti nelle cartelle",
    who: "Chi ha aperto la IR",
    text: [
      "Carica i file nelle cartelle della scheda «Procedure files». La 02 Quotations request è obbligatoria (non per l'acquisto diretto); la 04 Comparative Bid serve solo per Three Quotations; 05, 06 e 08 sono facoltative.",
      "Sono accettati PDF, immagini, Word, Excel, email salvate (.eml, .msg) e ZIP, fino a 20 MB. Il pulsante «Preview» mostra PDF, immagini, Word ed Excel senza scaricarli.",
      "La cartella 07 Invoice non si carica qui: si riempie da sola (passo 5).",
    ],
  },
  {
    title: "Fattura",
    who: "Amministrazione (Elisa)",
    text: [
      "Quando arriva la fattura, l'amministrazione la registra nella sezione Invoices con numero IR e protocollo e carica il file.",
      "La fattura compare da sola nella cartella 07 della IR, con il protocollo. Chi ha aperto la IR riceve una email: può procedere con la richiesta di pagamento.",
    ],
  },
  {
    title: "Autorizzazione al pagamento",
    who: "Chi ha aperto la IR; approva CAR o RAC",
    text: [
      "Con le cartelle obbligatorie complete, premi «Go to payment» (sopra la cartella 10) e compila l'autorizzazione: importo, beneficiario, IBAN. La valuta è sempre quella della IR.",
      "CAR o RAC approvano; chi l'ha preparata e Contracts ricevono l'email. Per un pagamento a rate usa «+ Another payment authorization» in fondo alla pagina.",
      "L'amministrazione paga e carica la prova di pagamento nella cartella 10 con il protocollo della fattura: chi ha aperto la IR riceve la email «payment made». Una fattura può essere pagata in più parti: i versamenti si registrano nelle Invoices.",
    ],
  },
  {
    title: "Chiusura e archiviazione",
    who: "Amministrazione (CAR, RAC o Contracts)",
    text: [
      "A pagamenti completati, l'amministrazione preme «Close procedure and archive». I file vengono spostati sul server entro pochi minuti e tolti dal PAS.",
      "Nell'elenco Requests la IR passa da «Closed · awaiting archive» a «Closed · archived»: il filtro Stage permette di vedere quelle ancora da archiviare.",
    ],
  },
];

/** Which step a request is in, from its stage (null: not shown). */
export function stepForStage(stage: string): number | null {
  switch (stage) {
    case "request":
      return 0;
    case "ir_auth":
      return 1;
    case "offers":
    case "winner":
      return 2;
    case "documents":
      return 3;
    case "payment":
      return 5;
    case "completed":
      return 6;
    default:
      return null;
  }
}

/** "?" button that opens the step-by-step guide of the procedure, in Italian. */
export default function ProcedureGuide({ currentStage }: { currentStage?: string }) {
  const [open, setOpen] = useState(false);
  const current = currentStage ? stepForStage(currentStage) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Come funziona la procedura"
        aria-label="Guida alla procedura"
        style={{
          border: "1px solid var(--line)",
          borderRadius: "50%",
          width: 26,
          height: 26,
          fontSize: 14,
          fontWeight: 700,
          cursor: "pointer",
          background: "transparent",
          color: "var(--navy)",
          flexShrink: 0,
        }}
      >
        ?
      </button>
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 10, width: "min(720px, 100%)", maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderBottom: "1px solid var(--line)" }}>
              <b style={{ fontSize: 15 }}>Come funziona la procedura</b>
              <button type="button" className="primary" onClick={() => setOpen(false)}>
                Chiudi
              </button>
            </div>
            <div style={{ overflow: "auto", padding: "8px 16px 16px" }}>
              {STEPS.map((s, i) => (
                <div
                  key={s.title}
                  style={{
                    padding: "10px 12px",
                    margin: "8px 0",
                    borderRadius: 8,
                    border: i === current ? "1.5px solid var(--navy)" : "1px solid var(--line)",
                    background: i === current ? "var(--navy-soft)" : "transparent",
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {i + 1}. {s.title}
                    {i === current && <span style={{ marginLeft: 8, fontSize: 12, color: "var(--navy)" }}>← siete qui</span>}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-soft)", margin: "2px 0 6px" }}>Chi: {s.who}</div>
                  {s.text.map((t, j) => (
                    <p key={j} style={{ fontSize: 13, margin: "4px 0", lineHeight: 1.5 }}>
                      {t}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
