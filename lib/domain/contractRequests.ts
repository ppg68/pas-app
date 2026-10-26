import { buildContractBlocksEn } from "@/lib/domain/contractTemplateEn";

// Contract requests: online version of the Word form "Scheda attivazione contratto prestatori autonomi"
// (PR09_1.5_AA14) and the contract text built from it. Two templates are kept here, the single source of
// truth for the wording: individual (consultant with VAT number / occasional) and company (e.g. CIHEAM Bari).
// Article texts come from the contracts actually in use (38_25 Zibordi, 45_2026 CIHEAM); to change the
// standard wording edit this file, to change the wording of ONE contract use the editor in the app.

export type RequestKind = "person" | "company";
export type RequestStatus = "pending" | "approved" | "cancelled";
export type ContractType = "consultancy_vat" | "occasional";

export const KIND_LABEL: Record<RequestKind, string> = {
  person: "Individual",
  company: "Company / organisation",
};

export const STATUS_LABEL: Record<RequestStatus, string> = {
  pending: "Awaiting approval",
  approved: "Approved",
  cancelled: "Cancelled",
};

export const CONTRACT_TYPE_LABEL: Record<ContractType, string> = {
  consultancy_vat: "1.5.1.4 Consulenza con P.I. o Cod. Identificativo",
  occasional: "1.5.13 Lavoro Autonomo Occasionale",
};

export const PROC_TYPES = ["DIR", "SQ", "3Q", "SP", "TEN"];

/** Secondary scheda fields, stored in contract_requests.data. */
export type SchedaData = {
  capacity?: string; // "Consulente"
  party_art?: "il" | "lo" | "la" | "l'" | ""; // company: article used in the text
  lang?: "it" | "en"; // language of the contract text
  other_reimb?: string;
  flights_count?: string;
  flights_route?: string;
  flights_max?: string;
  flight_bl?: string;
  visa_bl?: string;
  insurance?: "" | "self" | "oikos";
  insurance_bl?: string;
  equipment?: string;
  public_employee?: "" | "yes" | "no";
  tdr?: boolean; // Terms of Reference attached
  signing_date?: string; // yyyy-mm-dd
}

export type ContractRequestRow = {
  id: string;
  number: string;
  kind: RequestKind;
  status: RequestStatus;
  requested_by: string;
  requester_name: string;
  requester_email: string | null;
  ir_code: string | null;
  proc_type: string | null;
  party_name: string;
  party_short: string | null;
  nationality: string | null;
  address: string | null;
  tax_code: string | null;
  vat_number: string | null;
  email: string | null;
  pec: string | null;
  legal_rep: string | null;
  legal_rep_role: string | null;
  contact_person: string | null;
  contact_email: string | null;
  contact_email_admin: string | null;
  contract_type: ContractType;
  start_on_signature: boolean;
  start_date: string | null;
  end_date: string | null;
  project_title: string | null;
  donor_code: string | null;
  internal_code: string | null;
  budget_line: string | null;
  role_title: string | null;
  staff_like: boolean;
  activities: string | null;
  objective: string | null;
  minors: boolean;
  work_place: string | null;
  amount: number;
  currency: string;
  fee_mode: "daily" | "total";
  fee_note: string | null;
  payment_terms: string | null;
  data: SchedaData;
  contract_text: ContractBlock[] | null;
  contract_generated_at: string | null;
  contract_id: string | null;
  created_at: string;
  updated_at: string;
}

export type ContractApproval = {
  request_id: string;
  signer_role: "PM" | "RAC";
  user_id: string;
  user_name: string;
  signed_at: string | null;
}

/** One editable block of the contract: heading (empty for the opening) + body, one paragraph per line. */
export interface ContractBlock {
  key: string;
  title: string;
  body: string;
}

// ------------------------------------------------------------------ formatting helpers

const MONTHS_IT = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

export function dateLong(iso: string | null | undefined): string {
  if (!iso) return "____________";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return "____________";
  return `${d} ${MONTHS_IT[m - 1]} ${y}`;
}

export function moneyIt(n: number, currency = "EUR"): string {
  const s = n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sym = currency === "EUR" ? "€" : currency;
  return `${s} ${sym}`;
}

const UNITS = [
  "", "uno", "due", "tre", "quattro", "cinque", "sei", "sette", "otto", "nove", "dieci", "undici", "dodici",
  "tredici", "quattordici", "quindici", "sedici", "diciassette", "diciotto", "diciannove",
];
const TENS = ["", "", "venti", "trenta", "quaranta", "cinquanta", "sessanta", "settanta", "ottanta", "novanta"];

function below100(n: number): string {
  if (n < 20) return UNITS[n];
  const t = Math.floor(n / 10);
  const u = n % 10;
  let base = TENS[t];
  if (u === 1 || u === 8) base = base.slice(0, -1); // ventuno, ventotto
  return base + (u === 3 ? "tré" : UNITS[u]);
}

function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  let out = h === 0 ? "" : h === 1 ? "cento" : UNITS[h] + "cento";
  if (r === 0) return out;
  if (h > 0 && (r === 80 || Math.floor(r / 10) === 8)) out = out.slice(0, -1); // centottanta
  return out + below100(r);
}

/** Integer in Italian words, joined (as written in contracts): 49969 → quarantanovemilanovecentosessantanove. */
export function wordsIt(n: number): string {
  if (n === 0) return "zero";
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  let out = "";
  if (millions) out += millions === 1 ? "unmilione" : below1000(millions) + "milioni";
  if (thousands) out += thousands === 1 ? "mille" : below1000(thousands) + "mila";
  if (rest) out += below1000(rest);
  return out;
}

/** "(quarantanovemilanovecentosessantanove/80)" */
export function amountInWords(amount: number): string {
  const cents = Math.round(amount * 100);
  const euros = Math.floor(cents / 100);
  const c = String(cents % 100).padStart(2, "0");
  return `${wordsIt(euros)}/${c}`;
}

const FORMS: Record<string, { il: string; di: string; a: string; da: string; su: string; sp: boolean }> = {
  il: { il: "il", di: "del", a: "al", da: "dal", su: "sul", sp: true },
  lo: { il: "lo", di: "dello", a: "allo", da: "dallo", su: "sullo", sp: true },
  la: { il: "la", di: "della", a: "alla", da: "dalla", su: "sulla", sp: true },
  "l'": { il: "l'", di: "dell'", a: "all'", da: "dall'", su: "sull'", sp: false },
  "": { il: "", di: "di", a: "a", da: "da", su: "su", sp: true },
};

function lines(text: string | null | undefined): string[] {
  return (text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

function bullets(text: string | null | undefined): string {
  return lines(text).map((l) => `- ${l.replace(/^[-•]\s*/, "")}`).join("\n");
}

// Oikos standard travel policies quoted in the individual contract (art. 7). Update when renewed.
export const OIKOS_POLICIES = [
  "EUROP ASSISTANCE Multirischi in missione n° 40236Q (ex 11888) Modulo B – MEDIO",
  "GENERALI ITALIA A) Infortuni e Morte n° 764063712 Opzione D: Morte da Infortunio 350.000 € - I.P. Inf. 415.000 € - I.P. Malattia 275.000 €",
  "GENERALI ITALIA Diaria da ricovero da malattia e convalescenza - compreso COVID-19 n° 764063712",
  "GENERALI ITALIA B) Malattia - Rimborso spese mediche n° 360145970 Opzione unica - massimale ricovero 70.000 €",
  "UNIPOL Responsabilita' Civile verso terzi n° 758/65/37870281 NUOVI massimali 3.000.000 €",
];

const OIKOS_HEAD = [
  "ISTITUTO OIKOS E.T.S.",
  "con sede amministrativa in 20134 Milano – Via Crescenzago 1",
  "Cod.Fisc. 97182800157 - P.Iva 02503750123",
  "Giuseppe Guida in qualità di Legale Rappresentante",
];

// ------------------------------------------------------------------ template

export function buildContractBlocks(r: ContractRequestRow): ContractBlock[] {
  if (r.data?.lang === "en") return buildContractBlocksEn(r);
  const d = r.data ?? {};
  const company = r.kind === "company";
  const name = r.party_name.trim();
  const short = (r.party_short || name).trim();
  const art = FORMS[d.party_art ?? "il"] ?? FORMS.il;
  const sp = art.sp ? " " : "";
  // company references: "il CIHEAM Bari", "del CIHEAM Bari", "al CIHEAM Bari", ...
  const B = `**${name}**`;
  const ref = (k: "il" | "di" | "a" | "da" | "su") => `${art[k]}${sp}**${short}**`;
  const refCap = (k: "il" | "di" | "a" | "da" | "su") => {
    const s = ref(k);
    return s.replace(/[a-zà-ÿ]/i, (c) => c.toUpperCase());
  };

  const project = [r.donor_code, r.project_title].filter(Boolean).join(" - ");
  const projectQuoted = `**${project ? `“${project}”` : "“____________”"}**`;
  const internal = r.internal_code ? ` (cod. int. ${r.internal_code})` : "";
  const fee = amountInWords(r.amount);
  const amountTxt = moneyIt(r.amount, r.currency);
  const occasional = r.contract_type === "occasional";
  const startTxt = r.start_on_signature ? "dalla sottoscrizione del presente contratto" : `dal ${dateLong(r.start_date)}`;
  const endTxt = `al ${dateLong(r.end_date)}`;

  const blocks: ContractBlock[] = [];
  const add = (key: string, title: string, body: string) => blocks.push({ key, title, body });

  // ---- opening + parties
  if (company) {
    add(
      "parties",
      "",
      [
        "Il presente contratto di collaborazione viene redatto al fine di regolamentare il rapporto che intercorrerà tra",
        "",
        ...OIKOS_HEAD.map((l, i) => (i === 0 ? "ISTITUTO OIKOS ENTE DEL TERZO SETTORE" : l)),
        "da una parte",
        "e",
        `**${name}**`,
        r.address ? `con sede legale in ${r.address}` : "",
        [r.tax_code ? `Cod.Fisc. ${r.tax_code}` : "", r.vat_number ? `P.Iva ${r.vat_number}` : ""].filter(Boolean).join(" - "),
        r.legal_rep ? `${r.legal_rep} in qualità di ${r.legal_rep_role || "Legale Rappresentante"}` : "",
        "dall’altra parte",
        "",
        "di seguito, singolarmente, “Parte” o, congiuntamente “Parti”",
      ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n"),
    );
  } else {
    add(
      "parties",
      "",
      [
        "Il presente contratto di collaborazione commerciale viene redatto al fine di regolamentare il rapporto che intercorrerà",
        "",
        "tra",
        "",
        ...OIKOS_HEAD,
        "",
        "da una parte",
        "e",
        "",
        `**${name.toUpperCase()}**`,
        r.address ? `Residente in ${r.address}` : "",
        [r.tax_code ? `Cod.Fisc. ${r.tax_code}` : "", r.vat_number ? `P.Iva ${r.vat_number}` : ""].filter(Boolean).join(" - "),
        `in qualità ${d.capacity || "Consulente"}`,
        "",
        "di seguito, singolarmente, “Parte” o, congiuntamente “Parti”",
      ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n"),
    );
  }

  // ---- premises
  const prem: string[] = [
    "",
    "premesso che:",
    "",
    "a. ISTITUTO OIKOS E.T.S. opera in Italia e all’Estero nei settori della gestione e tutela ambientale e della cooperazione internazionale",
    "",
    company
      ? `b. ISTITUTO OIKOS E.T.S. ha ricevuto un finanziamento per il progetto ${projectQuoted} nel cui ambito si rende necessaria la “prestazione” da soggetto in possesso di idonee conoscenze come specificato al punto 4 del presente contratto${d.tdr ? " e nei relativi Termini di Riferimento allegati" : ""}.`
      : `b. ISTITUTO OIKOS E.T.S. ha ricevuto il finanziamento per il seguente progetto ${projectQuoted} per il quale si rende necessaria la “prestazione” da soggetto in possesso di idonee conoscenze come specificato al punto 4 del presente contratto.`,
  ];
  if (r.ir_code) prem.push("", `c. Il contraente è stato selezionato attraverso la procedura n. IR ${r.ir_code}.`);
  prem.push("", "Tutto ciò premesso si conviene e si stipula quanto segue:");
  add("premises", "", prem.join("\n"));

  // ---- art. 1-3 (identical)
  add("art1", "ARTICOLO 1 – PREMESSE ED ALLEGATI", "Le premesse e gli Allegati formano parte integrante e sostanziale del Contratto e le Parti dichiarano di averne preso piena conoscenza e di accettarne il contenuto senza riserve.");
  add("art2", "ARTICOLO 2 – PRINCIPI CHE REGOLANO IL CONTRATTO", [
    "Le Parti, nell’esecuzione di quanto previsto dal Contratto, si impegnano, tra l’altro:",
    "2.1 ad adoperarsi secondo buona fede per salvaguardare l’utilità reciproca derivante dal Contratto ex art. 1375 c.c.;",
    "2.2 a porre in essere la migliore collaborazione per dare efficace attuazione alle previsioni di cui al Contratto, ponendo ciascuna a disposizione dell’altra conoscenze, documentazione, strumenti e dati, sempre nel rispetto degli obblighi di legge vigenti;",
    "2.3 a comunicare reciprocamente con tempestività le circostanze che per l’altra Parte possano essere rilevanti o utili per l’esecuzione del Contratto.",
  ].join("\n"));
  add("art3", "ARTICOLO 3 – NATURA E AMBITO DI APPLICAZIONE DEL CONTRATTO", [
    "3.1 Le Parti si danno reciprocamente atto che il rapporto instaurato per il tramite del Contratto non potrà in alcun modo essere considerato, né da esse, né da terzi, come joint-venture o altra forma di associazione (inclusa l’associazione in partecipazione), restando le Parti medesime, l’una nei confronti dell’altra e tutte nei confronti di terzi, libere da qualsiasi vincolo che non sia espressamente previsto dal Contratto.",
    "3.2 Ogni precedente accordo, scritto e verbale, stipulato tra le Parti con riferimento all’oggetto del Contratto, deve intendersi superato e sostituito dal presente Contratto.",
  ].join("\n"));

  // ---- art. 4 object
  if (company) {
    add("art4", "ARTICOLO 4 – OGGETTO DEL CONTRATTO", [
      `4.1 Con il presente Contratto, ${ref("il")} si impegna a prestare il servizio a ISTITUTO OIKOS E.T.S. alle condizioni economiche e termini specificati nell’accordo economico.`,
      "",
      `ISTITUTO OIKOS E.T.S. conferisce l’incarico ${ref("a")} che accetta di prestare la propria attività per: ${(r.activities ?? "").trim() || "____________"}`,
      `nell’ambito del progetto: ${projectQuoted}${internal}`,
      ...(r.objective ? [`Obiettivo: ${r.objective.trim()}`] : []),
      ...(d.tdr ? ["Obiettivi ed attività specifiche sono riportate nei Termini di Riferimento (TdR) allegati al contratto."] : []),
    ].join("\n"));
  } else {
    add("art4", "ARTICOLO 4 – OGGETTO DEL CONTRATTO", [
      `4.1 Con il presente Contratto, ${B} si impegna a prestare il Servizio a ISTITUTO OIKOS E.T.S. alle condizioni economiche e termini specificati nell’accordo economico.`,
      "",
      `ISTITUTO OIKOS E.T.S. conferisce l’incarico a ${B}, che accetta di prestare consulenza e compiere le seguenti attività:`,
      bullets(r.activities),
      "",
      r.work_place ? `Il consulente svolgerà le sue funzioni presso: ${r.work_place.trim()}, nell’ambito del progetto:` : "Il consulente svolgerà le sue funzioni nell’ambito del progetto:",
      "",
      `${projectQuoted}${internal}`,
      ...(r.objective ? ["", `L’obiettivo finale della consulenza consiste in: ${r.objective.trim()}`] : []),
    ].join("\n"));
  }

  add("art5", "ARTICOLO 5 – GARANZIE", "5.1 Ciascuna Parte è tenuta a svolgere le attività poste a proprio carico con la migliore diligenza professionale ex art. 1176 c.c.");

  // ---- art. 6 fees
  const feeLines: string[] = [];
  if (company) {
    feeLines.push(
      `6.1 Le Parti convengono, per le attività oggetto del presente Contratto, un compenso totale lordo pari a **${amountTxt}** (${fee}), omnicomprensivo degli eventuali oneri a carico dell’Ente.`,
      `6.2 Il pagamento avverrà a mezzo di bonifico bancario${lines(r.payment_terms).length > 1 ? ` in ${lines(r.payment_terms).length} rate:` : ":"}`,
      bullets(r.payment_terms),
      `6.3 Il pagamento avverrà a seguito dell’emissione di regolari fatture e/o note di addebito riportanti la dicitura del progetto${r.donor_code ? " e il relativo codice" : ""}: ${project || "____________"}.`,
    );
  } else {
    const what = r.fee_mode === "daily" ? "un compenso totale giornaliero" : "un compenso totale lordo";
    const incl = occasional
      ? "comprensivo della ritenuta d’acconto e degli eventuali oneri a carico dell’Ente"
      : "omnicomprensivo di Iva e degli eventuali oneri a carico dell’Ente";
    feeLines.push(
      `6.1 Le Parti convengono, per le attività oggetto del presente Contratto, ${what} pari a **${amountTxt}** (${fee}), ${incl}.`,
      `6.2 Il pagamento avverrà a mezzo di bonifico bancario a seguito:`,
      `- dell’emissione di ${occasional ? "regolare nota di prestazione occasionale" : "regolari fatture"}${r.payment_terms ? ` ${r.payment_terms.trim()}` : ""}.`,
      `6.3 In caso di mancato espletamento dell’incarico, per motivo esclusivamente attribuibile a cause di forza maggiore sarà riconosciuta a ${B}, una quota proporzionale al lavoro svolto.`,
      `6.4 In caso di mancato espletamento dell’incarico, per qualsiasi motivo attribuibile a ${B}, nulla sarà più dovuto se non una quota proporzionale al lavoro svolto a cui sarà detratto l’eventuale danno causato a ISTITUTO OIKOS E.T.S., derivante dal mancato completamento del lavoro.`,
      "6.5 In caso di ritardo nell’espletamento dell’incarico da parte del consulente, fatto salvo il ritardo cagionato da cause di forza maggiore, il corrispettivo verrà liquidato tenendo conto di eventuali danni addebitati ad ISTITUTO OIKOS E.T.S. in conseguenza di tale ritardo.",
    );
  }
  add("art6", "ARTICOLO 6 – CORRISPETTIVI", feeLines.join("\n"));

  // ---- art. 7 expenses
  const exp: string[] = [];
  const flights = Number(d.flights_count || 0) > 0;
  if (!company && (flights || d.insurance === "oikos")) {
    if (flights) {
      exp.push(`ISTITUTO OIKOS E.T.S., nell’ambito delle missioni, assumerà a proprio carico il costo del biglietto aereo A/R${d.flights_route ? ` ${d.flights_route}` : ""}${d.insurance === "oikos" ? " e il costo dell’assicurazione sanitaria" : ""}${d.flights_max ? ` (importo massimo rimborsabile ${d.flights_max}, comprensivo di compensazione CO2 se applicabile)` : ""}.`);
    } else {
      exp.push("ISTITUTO OIKOS E.T.S. assumerà a proprio carico il costo dell’assicurazione sanitaria.");
    }
    if (d.insurance === "oikos") {
      exp.push("", "Verranno attivate le seguenti polizze:", ...OIKOS_POLICIES.map((p) => `- ${p}`));
    }
    if (flights) {
      exp.push("", "Il consulente si impegna a consegnare al committente il biglietto aereo A/R completo di tutte le carte d’imbarco, pena la detrazione dal proprio corrispettivo dell’importo del biglietto aereo e del compenso per il periodo di prestazione di lavoro non coperto da idonea documentazione atta a certificare la sua permanenza nel luogo stabilito per lo svolgimento delle proprie funzioni.");
    }
  }
  const reimb: string[] = [];
  if (d.visa_bl) reimb.push("Spese di visto;");
  if (flights) reimb.push("Spese di trasporto da e per l’aeroporto;");
  if (d.other_reimb) reimb.push(`${d.other_reimb.trim()};`);
  if (!company && reimb.length) {
    exp.push("", "Il committente assumerà altresì a proprio carico, o rimborserà al consulente, il costo delle seguenti spese, preventivamente autorizzate e debitamente documentate:", ...reimb.map((x) => `- ${x}`));
  }
  exp.push("", "Qualunque altra spesa non prevista in preventivo, per servizi extra oggetto, dovrà essere esaminata e concordata da entrambe le parti previo stesura di un extra preventivo scritto.");
  add("art7", "ARTICOLO 7 – SPESE", exp.join("\n").replace(/^\n+/, ""));

  // ---- art. 8 duration
  if (company) {
    add("art8", "ARTICOLO 8 – DURATA E RECESSO", [
      `8.1 Il presente Contratto avrà decorrenza ${startTxt} fino ${endTxt}.`,
      "8.2 Il contratto può essere risolto per mutuo consenso delle parti contraenti, per inadempimento o per motivi di forza maggiore. Deve intendersi come causa di forza maggiore anche la revoca o l’interruzione del finanziamento da parte del soggetto, pubblico o privato, cui fa capo l’intervento.",
      "8.3 Le Parti avranno altresì la facoltà di recedere in qualsiasi momento dal presente Contratto, mediante comunicazione scritta, da inviarsi all’altra Parte, a mezzo di lettera raccomandata A.R. o PEC, con un preavviso di almeno 30 (trenta) giorni, trasmessa agli indirizzi di cui al successivo Art. 12.1",
      `8.4 Resta inteso tra le Parti che, al termine del presente Contratto per qualsiasi causa, ciascuna Parte resterà tenuta esclusivamente all’adempimento delle obbligazioni già maturate alla data di efficacia della cessazione. Resta in ogni caso fermo il diritto ${ref("di")} a ricevere i corrispettivi maturati per le attività effettivamente svolte fino alla data di efficacia della cessazione, nonché al rimborso degli eventuali costi debitamente documentati.`,
      "8.5 Nel caso in cui le prestazioni non vengano adempiute secondo le modalità previste dal presente contratto, si applicherà la disciplina prevista dalla normativa applicabile.",
    ].join("\n"));
  } else {
    add("art8", "ARTICOLO 8 – DURATA E RECESSO", [
      `8.1 Il presente Contratto avrà decorrenza ${startTxt} ${endTxt}.`,
      "8.2 Il contratto può essere risolto per mutuo consenso delle parti contraenti, per giusta causa o per motivi di forza maggiore. Nel caso di prestazione all’estero in cui, nel paese ospitante, dovessero sorgere operazioni di polizia, operazioni di carattere militare, attività politiche o eventi di calamità naturale, che richiedano l’immediato rimpatrio del prestatore d’opera per ragioni di sicurezza dello stesso, il committente avrà la facoltà di dare disdetta dal presente contratto senza preavviso.",
      "8.3 Le Parti avranno altresì la facoltà di recedere in qualsiasi momento dal presente Contratto, mediante comunicazione scritta, da inviarsi all’altra Parte, a mezzo di lettera raccomandata A.R., con un preavviso di almeno 30 (trenta) giorni, trasmessa agli indirizzi di cui al successivo Art. 12.1",
      "8.4 Resta inteso tra le Parti che, al termine del presente Contratto per qualsiasi causa, gli impegni resteranno comunque in vigore fino a quando non saranno giunte a buon fine tutte le iniziative in essere o avviate e ISTITUTO OIKOS E.T.S. non sarà tenuta al pagamento di alcuna indennità o compenso di alcun genere, ad alcun titolo, a favore dell’altra Parte.",
      `8.5 Le parti convengono e stipulano la seguente clausola risolutiva espressa art 1456 C.C: Il presente contratto deve intendersi automaticamente risolto nel caso in cui le prestazioni non vengano adempiute secondo le modalità previste all’art. 4 del contratto. Le obbligazioni da eseguirsi a pena di risoluzione e poste a carico di ${B} riguardano precisamente, la realizzazione di servizi e iniziative di cui all’art. 4.`,
      "La presente clausola è da considerarsi come parte integrante del presente contratto.",
    ].join("\n"));
  }

  add("art9", "ARTICOLO 9 – DIVIETO DI CESSIONE DEL CONTRATTO", "Ciascuna Parte, salvo espresso consenso scritto dall’altra Parte non potrà cedere il Contratto né i diritti e gli obblighi da esso derivanti, per alcuna o tutte delle obbligazioni che discendono dal contratto stesso.");
  add("art10", "ARTICOLO 10 – MODIFICHE ED INTEGRAZIONI", "Qualsiasi modifica e integrazione del Contratto potrà essere apportata di comune accordo tra le Parti soltanto per iscritto.");

  // ---- art. 11 conclusion
  add("art11", "ARTICOLO 11 – MODALITA’ DI CONCLUSIONE DEL CONTRATTO", [
    company
      ? `11.1 Il Contratto si intenderà perfezionato nel momento in cui ISTITUTO OIKOS E.T.S. riceverà ${ref("da")} il Contratto debitamente sottoscritto.`
      : `11.1 Il Contratto si concluderà mediante scambio di corrispondenza commerciale e dunque si intenderà perfezionato nel momento in cui ISTITUTO OIKOS E.T.S. riceverà da ${B} l’accettazione del Contratto debitamente sottoscritta.`,
    "11.2 Ciascuna delle Parti garantisce all’altra: (I) di aver assunto tutte le deliberazioni necessarie per stipulare e dare esecuzione al Contratto, (II) che il Contratto è per essa pienamente vincolante ed impegnativo, (III) che il Contratto non viola disposizioni di altri contratti da essa stipulati né divieti, di qualsiasi origine o natura, ai quali sia assoggettata.",
  ].join("\n"));

  // ---- art. 12 communications
  if (company) {
    add("art12", "ARTICOLO 12 – COMUNICAZIONI", [
      "12.1 Le comunicazioni previste dal presente Contratto saranno effettuate per iscritto via email all’attenzione dei seguenti referenti, presso le sedi:",
      "Per ISTITUTO OIKOS E.T.S.",
      "Att.ne del Rappresentante Legale Giuseppe Guida – Sede Amministrativa in 20134 Milano – Via Crescenzago 1- email: segreteria.it@istituto-oikos.org – PEC: istituto.oikos@pec.it",
      `Per ${ref("il")}`,
      `${r.contact_person ? `Att.ne ${r.contact_person} – ` : ""}${r.address ? `Sede in ${r.address} - ` : ""}${r.contact_email ? `email: ${r.contact_email}` : ""}`.replace(/ - $/, ""),
      ...(r.contact_email_admin ? [`Amministrazione ${short} – email: ${r.contact_email_admin}`] : []),
      ...(r.pec ? [`PEC: ${r.pec}`] : []),
      "12.2 E’ fatta salva la facoltà delle Parti di modificare i suddetti indirizzi, dandone idonea preventiva comunicazione, a pena di inopponibilità, all’altra Parte, nella quale dovrà essere indicato il termine da cui il nuovo indirizzo diverrà efficace.",
      "12.3 Le comunicazioni aventi ad oggetto l’ordinaria operatività potranno essere scambiate tra le Parti con ogni mezzo, purché documentabile, agli indirizzi che le Parti renderanno noti nel corso dell’esecuzione del Contratto.",
      "12.4 Le comunicazioni saranno efficaci dal giorno di ricezione delle stesse.",
    ].join("\n"));
  } else {
    add("art12", "ARTICOLO 12 – COMUNICAZIONI", [
      "12.1 Le comunicazioni contrattualistiche previste dal presente accordo saranno effettuate per iscritto via email all’attenzione dei seguenti referenti, presso le sedi:",
      "Per ISTITUTO OIKOS E.T.S.",
      "Att.ne del Rappresentante Legale Giuseppe Guida – Sede Amministrativa in 20134 Milano – Via Crescenzago 1- email: segreteria.it@istituto-oikos.org",
      `Per ${B}`,
      `Att.ne ${B}${r.address ? ` – domicilio fiscale in ${r.address}` : ""} – email: ${r.email || "____________"}${r.pec ? ` – PEC: ${r.pec}` : ""}`,
      "12.2 È fatta salva la facoltà delle Parti di modificare i suddetti indirizzi, dandone idonea preventiva comunicazione, a pena di inopponibilità, all’altra Parte, nella quale dovrà essere indicato il termine da cui il nuovo indirizzo diverrà efficace.",
      "12.3 Le comunicazioni aventi ad oggetto l’ordinaria operatività potranno essere scambiate tra le Parti con ogni mezzo, purché documentabile, agli indirizzi che le Parti si renderanno noti nel corso dell’esecuzione del Contratto.",
      "12.4 Le comunicazioni saranno efficaci dal giorno di ricezione delle stesse.",
    ].join("\n"));
  }

  add("art13", "ARTICOLO 13 – OBBLIGHI DI RISERVATEZZA", [
    "13.1 Le Parti si impegnano a mantenere la massima riservatezza su tutte le informazioni, i dati, le notizie ed i documenti, comprese idee, progetti relativi alle Parti, o a terzi (i “Dati Riservati”) di cui siano venute o vengano in possesso o a conoscenza nel corso delle trattative o della conclusione del Contratto ovvero nello svolgimento delle attività previste e/o dipendenti dallo stesso e a non rivelare gli stessi a terzi in alcun modo, senza il preventivo assenso scritto dell’altra Parte. Ciascuna delle Parti si impegna a far sì che i propri amministratori, dipendenti e collaboratori a qualsiasi titolo siano al corrente degli obblighi di riservatezza di cui al presente articolo e li rispettino.",
    "13.2 Salvo gli obblighi di legge o provvedimenti delle autorità amministrative e/o giudiziarie, le Parti non copieranno, tratterranno, comunicheranno, diffonderanno e comunque non utilizzeranno i Dati Riservati, in qualsiasi modo o forma, anche in via indiretta, per fini diversi da quelli previsti dal Contratto.",
    "13.3 Gli obblighi di riservatezza previsti dal presente articolo sopravvivranno anche in caso di scadenza, risoluzione o recesso dal Contratto o di perdita di efficacia dello stesso, per qualunque ragione e a qualunque titolo, sino a quando i Dati Riservati non siano eventualmente resi pubblici da parte del legittimo titolare degli stessi.",
  ].join("\n"));

  add("art14", "ARTICOLO 14 – TUTELA DEI DATI PERSONALI",
    `Le Parti si danno reciprocamente atto di esser pienamente informate sul reciproco trattamento dei dati personali ai sensi e per gli effetti degli Articoli 13 e 14 del G.D.P.R (General Data Protection Regulation) Regolamento UE 2016/679. ${company ? refCap("il") : "Il consulente"} dà atto di avere ricevuto correttamente l’informativa di cui all’ art 13 e 14 del suddetto G.D.P.R.`);

  // ---- art. 15 liability
  if (company) {
    add("art15", "ARTICOLO 15 – RESPONSABILITA’ E DISPOSIZIONI IN MATERIA DI SICUREZZA", [
      `ISTITUTO OIKOS E.T.S. è esonerata da ogni responsabilità riguardo a danni causati ${ref("da")} a persone e/o cose in corso di contratto. ${refCap("il")} è tenuto ad adottare tutte le misure di sicurezza relative allo svolgimento delle attività ad oggetto del presente contratto.`,
      `ISTITUTO OIKOS E.T.S. è esonerata fin d’ora da richieste di risarcimento riguardante infortuni di qualsiasi tipo e natura derivanti al personale ${ref("di")} o a terzi.`,
      `ISTITUTO OIKOS E.T.S. potrà rivalersi ${ref("su")} a seguito di eventuali danni causati a terzi, durante lo svolgimento delle attività, quando i predetti danni siano stati causati da dolo o colpa grave di quest'ultimo o dal proprio personale.`,
    ].join("\n"));
  } else {
    add("art15", "ARTICOLO 15 – RESPONSABILITA’ E DISPOSIZIONI IN MATERIA DI SICUREZZA", [
      `ISTITUTO OIKOS E.T.S. è esonerata da ogni responsabilità riguardo a danni causati da ${B} a persone e/o cose in corso di contratto.`,
      `${B} è tenuto ad adottare tutte le misure di sicurezza.`,
      `ISTITUTO OIKOS E.T.S. è esonerata fin d’ora da richieste di risarcimento riguardante infortuni di qualsiasi tipo e natura derivanti a ${B} o a terzi.`,
      `ISTITUTO OIKOS E.T.S. potrà rivalersi su ${B} a seguito di eventuali danni causati a terzi, durante lo svolgimento del servizio, quando i predetti danni siano stati causati da dolo o colpa grave di quest'ultimo o dal proprio personale.`,
    ].join("\n"));
  }

  add("art16", "ARTICOLO 16 – ALLEGATI", [
    "I seguenti documenti, da sottoscrivere all’atto di firma del contratto, costituiscono parte integrante del contratto:",
    "- Informativa privacy e consenso al trattamento dei dati",
    "- Codice Etico e di Condotta",
    "- Policy PSEA Protection from sexual exploitation and abuse, sexual harassment (including child)",
    ...(d.tdr ? ["- Termini di Riferimento"] : []),
    `Le Parti dichiarano di averne preso piena conoscenza, di accettarne il contenuto senza riserve e di agire coerentemente con essi per lo svolgimento ${company ? "dell’incarico sottoscritto" : "degli incarichi sottoscritti"}.`,
  ].join("\n"));

  add("art17", "ARTICOLO 17 – FORO COMPETENTE", "Per qualsiasi eventualità non espressamente prevista da questo accordo, si applicheranno le norme di legge; ogni eventuale controversia derivante dal presente rapporto o collegata allo stesso, dovrà comunque essere portata davanti al Tribunale di Milano.");

  // ---- closing / signatures
  const when = d.signing_date ? new Date(d.signing_date + "T00:00:00").toLocaleDateString("it-IT") : dateLong(r.start_date);
  add("closing", "", [
    `Milano, ${when}`,
    "",
    company ? "per Istituto Oikos E.T.S.: Giuseppe Guida" : "per il committente: Giuseppe Guida",
    "",
    company
      ? `per ${ref("il")}: ${r.legal_rep || "____________"}`
      : `per il consulente: ${B}`,
  ].join("\n"));

  return blocks;
}
