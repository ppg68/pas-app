// Lettera di incarico per missione all'estero (PR09_1.5 AA04, AA05, AA06, AA07), generata dalla scheda di
// attivazione (AA14). Quattro varianti: dipendente / collaboratore (Co.Co.Co.) x missione UE / extra UE.
// Il testo e' quello dei modelli in uso; dove la scheda non ha il dato resta uno spazio da completare nel Word.

import { dateLong, moneyIt, type ContractBlock } from "@/lib/domain/contractRequests";
import type { TripRow } from "@/lib/domain/trips";

const BLANK = "____________";
const orBlank = (s: string | null | undefined) => (s && s.trim() ? s.trim() : BLANK);

export type LetterKind = "employee" | "cococo";

/** The letter exists only for employees and Co.Co.Co.; other traveler types have no template. */
export function letterKind(r: Pick<TripRow, "traveler_type" | "scope">): LetterKind | null {
  if (r.scope === "italy") return null;
  if (r.traveler_type === "employee") return "employee";
  if (r.traveler_type === "cococo") return "cococo";
  return null;
}

const amount = (s: string | undefined) => {
  const n = parseFloat(String(s ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? moneyIt(n) : BLANK;
};

const POLICIES = [
  "Assistenza di emergenza e trasferimento sanitario multirischi in missione, comprensiva di assistenza in caso di contenzioso legale derivante dall'esercizio delle funzioni assegnategli, Europ Assistance n. 40236q (ex 11888) opzione B;",
  "Polizza infortuni e morte con diaria da infortunio e malattia - Generali Italia n. 764063712 opzione D",
  "Diaria da ricovero da malattia e convalescenza (compreso COVID-19) - Generali Italia n. 764063712 opzione unica",
  "Polizza rimborso spese mediche - Generali Italia n. 360145970 - opzione B",
  "Polizza Responsabilità civile verso terzi - Unipol n. 758/65/37870281 opzione unica",
];

export function buildLetterBlocks(r: TripRow, today = new Date().toISOString().slice(0, 10)): ContractBlock[] {
  const kind = letterKind(r);
  if (!kind) return [];
  const emp = kind === "employee";
  const extra = r.scope === "extra_eu";
  const L = r.letter ?? {};
  const name = r.traveler_name.trim();
  const who = emp ? "Dipendente" : "Collaboratore";
  const whoLower = emp ? "dipendente" : "collaboratore";
  const country = orBlank(r.destination);
  const period = `dal ${dateLong(r.start_date)} al ${dateLong(r.end_date)}`;
  const place = orBlank(r.work_place || r.destination);
  const boss = orBlank(r.reference_person);
  const role = orBlank(r.role_title);
  const perDiem = r.lodging_mode === "per_diem";
  const perDiemTxt = r.per_diem_rate ? moneyIt(r.per_diem_rate) : BLANK;
  const receipts = r.lodging_mode === "receipts" || r.lodging_mode === "free_lodging";
  const signer = emp ? "Giuseppe Guida" : "Dott. Giuseppe Guida";

  const blocks: ContractBlock[] = [];
  const add = (key: string, title: string, body: string) => blocks.push({ key, title, body });

  // ---- parties
  add(
    "intro",
    "",
    [
      "Fra **ISTITUTO OIKOS E.T.S.** con sede legale e sede operativa in Milano Via Crescenzago, 1 Cod.Fisc. 97182800157 - P.Iva 02503750123, rappresentato dal Dott. Giuseppe Guida in qualità di Legale Rappresentante, d'ora in avanti denominato \"Committente\"",
      "",
      "e:",
      "",
      `**${name}**`,
      `nato a ${orBlank(L.birth_place)} il ${L.birth_date ? dateLong(L.birth_date) : BLANK}`,
      `residente a ${orBlank(L.residence)}`,
      `Codice fiscale ${orBlank(L.tax_code)}`,
      `d'ora in avanti denominato "${who}"`,
    ].join("\n"),
  );

  // ---- premises
  add("parties", "", "premesso che");
  const premises: string[] = [];
  if (emp) premises.push("è in corso un rapporto di lavoro di tipo subordinato tra il Committente e il Dipendente;");
  premises.push(
    extra && emp
      ? "il Committente è una E.T.S., riconosciuta dal Ministero degli Affari Esteri ai sensi dell'Art. 28 della Legge 49/1987, che promuove e realizza attività nell'ambito della cooperazione allo sviluppo e della solidarietà internazionale con specifici interventi, azioni ed operazioni in Italia e all'estero;"
      : "il Committente è riconosciuto dal Ministero degli Affari Esteri ai sensi dell'Art. 28 della Legge 49/1987, che promuove e realizza attività nell'ambito della cooperazione allo sviluppo e della solidarietà internazionale con specifici interventi, azioni ed operazioni in Italia e all'estero;",
    "il Committente ha ricevuto un finanziamento per il progetto di seguito specificato e, nell'ambito delle attività, si rende necessaria la collaborazione di una persona in possesso di idonee conoscenze per la realizzazione di parte di un progetto come specificato nel proseguo;",
    emp
      ? "il Dipendente risulta essere in possesso dei requisiti necessari ed è disponibile ad accettare l'incarico."
      : "il Collaboratore risulta essere in possesso dei requisiti necessari ed è disponibile ad accettare l'incarico;",
  );
  add("premises", "", premises.map((t, i) => `${"abcd"[i]}. ${t}`).join("\n"));
  add("parties", "", "si conviene e stipula quanto segue");

  // ---- assignment
  add(
    "assignment",
    "",
    emp
      ? `Il Committente, come sopra indicato e rappresentato, conferisce al Dipendente, che accetta, l'incarico in qualità di ${role} in base ai Termini di Riferimento indicati nell'Addendum che, allegato, costituisce parte integrante del presente incarico.\nL'incarico si intende conferito alle seguenti condizioni e clausole:`
      : `Il Committente, come sopra indicato e rappresentato, conferisce al Collaboratore, che accetta, l'incarico in qualità di ${role} inquadrabile nel profilo professionale ${orBlank(L.profile)} (A B C D E F) di cui all'art. 3 dell'Accordo Collettivo di riferimento.\n\nDetto ruolo verrà svolto in base ai Termini di Riferimento indicati nell'Addendum che, allegato, costituisce parte integrante del presente incarico.\nL'incarico si intende conferito alle seguenti condizioni e clausole:`,
  );

  // ---- art. 1
  add(
    "art1",
    "Art. 1 OGGETTO DELL'INCARICO",
    `Il ${who} si impegna a collaborare con il Committente svolgendo una missione in ${country} nel periodo ${period}.\n\nLa sede nella quale il ${who} svolgerà le sue funzioni è ${place} con frequenti visite nell'area di intervento del progetto per esigenze inerenti ai compiti affidati.`,
  );

  // ---- art. 2
  const art2: string[] = [];
  if (emp) {
    art2.push(
      `Il/La Dipendente dovrà assolvere alle mansioni affidategli in modo conforme alla dignità del proprio compito, astenendosi da ogni manifestazione che possa nuocere alle buone relazioni tra il Committente ed il Paese ospitante.`,
      "Per tutta la durata dell'incarico nel Paese ospitante, il Dipendente non potrà svolgere attività di polizia o di carattere militare, né attività di natura politica incompatibili con l'incarico, con le finalità della missione o con gli obblighi derivanti dal rapporto di lavoro.",
      extra
        ? "Nel caso in cui, nel paese ospitante, dovessero sorgere operazioni di polizia, operazioni di carattere militare, attività politiche particolari o eventi di calamità naturale, il Dipendente dovrà attenersi alle direttive del Country Security Manager seguendo le Procedure di Sicurezza in vigore nel paese."
        : "Nel caso in cui, nel paese ospitante, dovessero sorgere operazioni di polizia, operazioni di carattere militare, attività politiche particolari o eventi di calamità naturale, il Dipendente dovrà effettuare un immediato rimpatrio.",
      "",
      `Per tutta la durata del presente contratto, nell'esercizio degli incarichi a lui/lei affidati, il/la Dipendente farà riferimento al responsabile ${extra ? "del Committente" : "dell'organismo"} che gli verrà indicato: ${boss}.`,
      "Il/La Dipendente dovrà presentare al responsabile sopra indicato un rapporto di missione entro 1 mese dal rientro della missione in programma.",
      "",
      "Il/La Dipendente non potrà prestare in favore di terzi la propria opera, sia autonoma che subordinata, per attività che siano in concorrenza o contrasto con quelle oggetto del presente contratto, salvo specifica autorizzazione scritta da parte del Committente su richiesta del Dipendente.",
      "Il/La Dipendente compatibilmente con gli impegni assunti e per attività che non siano in concorrenza o contrasto con quelle oggetto del presente contratto, potrà prestare anche in favore di terzi la propria attività sia autonoma che subordinata, previa comunicazione scritta al Committente con autocertificazione, che indichi lo svolgimento di attività non concorrenziali e compatibili con il progetto e che non ne pregiudichino la tempestività ed esatta realizzazione.",
    );
  } else {
    art2.push(
      "Il Collaboratore si impegna a garantire esclusivamente il risultato oggetto del presente incarico, rimanendo libero di organizzare la propria attività in piena autonomia e senza alcun vincolo di subordinazione.",
      "Il Committente si impegna a non interferire nelle modalità di esecuzione della prestazione da parte del Collaboratore, fatto salvo il potere di esercitare un controllo di carattere generale, esclusivamente finalizzato a garantire il coordinamento dell'attività del Collaboratore con l'organizzazione e le esigenze complessive del Committente. Resta conseguentemente inteso che il Collaboratore non sarà sottoposto ad alcuna direttiva tecnico-funzionale, né ad alcun potere disciplinare da parte del Committente, il quale si limiterà ad indicazioni di massima, in armonia con la natura del rapporto di cui trattasi, nell'ambito della sua qualità di committente, e salva l'applicazione diretta dell'art. 2224 cod. civ., primo comma, e analogica dell'art. 1662 cod. civ.",
      "Il Collaboratore deve fornire personalmente la prestazione pattuita al fine del raggiungimento del risultato previsto.",
      "Il Collaboratore nell'esercizio della sua attività è tenuto alla esecuzione contrattuale secondo buona fede e con la massima diligenza ai sensi dell'art. 1375 del Codice civile.",
      "Il Collaboratore dovrà assolvere alle mansioni affidategli in modo conforme alla dignità del proprio compito, astenendosi da ogni manifestazione che possa nuocere alle buone relazioni tra il Committente ed il Paese ospitante.",
      "",
      `Per tutta la durata del presente contratto, nell'esercizio degli incarichi a lui affidati, il Collaboratore farà riferimento al responsabile del Committente che gli verrà indicato: ${boss}.`,
      "Il Collaboratore dovrà presentare al responsabile sopra indicato un rapporto di missione entro 1 mese dal rientro della missione in programma. Il non adempimento potrà essere causa di risoluzione del contratto e della richiesta da parte del Committente di risarcimento per eventuali danni derivati.",
      "",
      "Il Collaboratore non potrà prestare in favore di terzi la propria opera, sia autonoma che subordinata, per attività che siano in concorrenza o contrasto con quelle oggetto del presente contratto, salvo specifica autorizzazione scritta da parte del Committente su richiesta del Collaboratore.",
      "Il Collaboratore compatibilmente con gli impegni assunti e per attività che non siano in concorrenza o contrasto con quelle oggetto del presente contratto, potrà prestare anche in favore di terzi la propria attività sia autonoma che subordinata, previa comunicazione scritta al Committente con autocertificazione, che indichi lo svolgimento di attività non concorrenziali e compatibili con il progetto e che non ne pregiudichino la tempestività ed esatta realizzazione.",
      "Per tutta la durata dell'incarico, il Collaboratore si impegna a non svolgere nel Paese ospitante attività di polizia o di carattere militare, né attività di natura politica che possano risultare incompatibili con l'incarico, con le finalità della missione o con gli obblighi assunti nei confronti del Committente.",
    );
  }
  add("art2", "Art. 2 MODALITA' DI ESECUZIONE DELLA PRESTAZIONE", art2.join("\n"));

  // ---- art. 3
  const art3: string[] = [];
  if (emp) {
    art3.push(`A titolo di corrispettivo per le sue prestazioni il/la Dipendente riceverà dal Committente:`, "", "- la sua retribuzione giornaliera contrattualmente stabilita;");
  } else {
    art3.push("A titolo di corrispettivo per le sue prestazioni il Collaboratore riceverà dal Committente:", "");
    if (L.daily_fee) art3.push(`- Compenso giornaliero pari a ${amount(L.daily_fee)} al lordo degli oneri a carico del collaboratore;`);
    if (L.contract_fee || (!L.daily_fee && !L.extra_fee)) art3.push("- Il suo compenso giornaliero contrattualmente stabilito;");
    if (L.extra_fee) art3.push(`- Compenso aggiuntivo pari a ${amount(L.extra_fee)} al lordo degli oneri a carico del collaboratore;`);
    if (extra && perDiem) art3.push(`- Per Diem (a copertura di spese Vitto e Alloggio) giornaliero pari a ${perDiemTxt} al lordo degli oneri a carico del collaboratore.`);
  }
  art3.push(
    "",
    emp
      ? "Al fine del calcolo del numero di giornate per il pagamento dei Per Diem, si computano la data, l'ora d'inizio e fine della missione, indicata sul biglietto di trasporto, quantificandone nell'arco della giornata solare, il tempo complessivo trascorso, come da procedure interne adottate dal Committente."
      : "Al fine del calcolo del numero di giornate per il pagamento dei Per Diem e del compenso, si computano la data, l'ora d'inizio e fine della missione indicata sul biglietto aereo quantificando, nell'arco della giornata solare, il tempo complessivo trascorso, come da procedure interne adottate dal Committente.",
    "",
    emp
      ? "La liquidazione della retribuzione e dei Per Diem verrà effettuata, previa approvazione del pagamento da parte del responsabile di riferimento sopra indicato, secondo la normale scadenza comunicata dal Committente."
      : "La liquidazione del compenso e dei Per Diem verrà effettuata, previa approvazione del pagamento da parte del responsabile di riferimento sopra indicato, secondo la normale scadenza comunicata dal Committente.",
    "Il Committente provvederà a versare sugli importi corrisposti le ritenute fiscali, previdenziali ed ogni altra ritenuta eventuale, con le modalità, le percentuali ed i termini previsti dalle leggi e dai regolamenti vigenti.",
  );
  add("art3", "Art. 3 Corrispettivo", art3.join("\n"));

  // ---- art. 4
  const exp: string[] = [];
  if (!emp && extra) {
    if (r.flights_needed) exp.push("- Volo aereo a/r Italia/Paese di destinazione (il costo del biglietto dovrà essere preventivamente autorizzato);");
    if (r.visa_needed) exp.push("- Visto di entrata nel Paese di destinazione;");
    exp.push("- Spese di trasporto in loco inerenti ai compiti affidati;", "- Spese di trasporto da e per l'aeroporto in Italia e in loco.");
    if (receipts) exp.push("- Rimborso vitto e alloggio a piè di lista.");
  } else {
    exp.push("- Spese di trasporto (auto propria, treno, autobus, aereo) inerenti ai compiti affidati compresi eventuali tragitti da e per l'aeroporto (il costo del biglietto aereo dovrà essere preventivamente autorizzato);");
    if (receipts) exp.push("- Rimborso vitto e alloggio a piè di lista;");
    if (perDiem) exp.push(`- Per Diem (a copertura di spese Vitto e Alloggio) giornaliero pari a ${perDiemTxt} al lordo degli oneri a carico del ${whoLower}.`);
  }
  add(
    "art4",
    "Art. 4 Spese",
    [
      `Il Committente assumerà a proprio carico o rimborserà al ${who}, previa autorizzazione da parte del responsabile di riferimento sopra indicato, le seguenti spese:`,
      "",
      ...exp,
      "",
      !emp && extra
        ? "Il Collaboratore si impegna a consegnare al Committente il biglietto aereo di A/R per l'Italia completo di tutte le carte d'imbarco, pena la detrazione dal proprio corrispettivo dell'importo dello stesso e del compenso per il periodo di prestazione di lavoro non coperto da idonea documentazione atta a certificare la sua permanenza nel luogo stabilito per lo svolgimento delle proprie funzioni."
        : `Il ${who} si impegna a consegnare al Committente tutti i giustificativi di spesa, secondo le procedure del Committente. In caso di utilizzo treno, autobus, aereo è necessario fornire il biglietto di A/R, per l'aereo è necessario fornire anche le carte d'imbarco, pena la detrazione dal proprio corrispettivo dell'importo dello stesso e del compenso per il periodo di prestazione di lavoro non coperto da idonea documentazione atta a certificare la sua permanenza nel luogo stabilito per lo svolgimento delle proprie funzioni.`,
      "",
      `I rimborsi spese verranno liquidati entro 30 giorni dal ricevimento del modulo "Richiesta rimborso spese" compilato e firmato dal ${who} con allegati i giustificativi di spesa.`,
    ].join("\n"),
  );

  // ---- art. 5
  if (extra) {
    add(
      "art5",
      "Art. 5 Assicurazione",
      [
        emp
          ? "Inoltre, il Committente attiverà al/alla Dipendente, senza oneri per lo/la stesso/a, le seguenti polizze:"
          : "Il Committente attiverà al/alla Collaboratore/trice, senza oneri per lo/la stesso/a, le seguenti polizze:",
        ...POLICIES.map((p) => `- ${p}`),
      ].join("\n"),
    );
  } else {
    add(
      "art5",
      "Art. 5 Assicurazione",
      [
        "La copertura sanitaria è coperta dalla tessera europea di assicurazione malattia che dà diritto all'assistenza sanitaria statale in caso di permanenza temporanea in uno dei 27 Stati membri dell'UE, in Islanda, in Liechtenstein, in Norvegia e in Svizzera, alle stesse condizioni e allo stesso costo (gratuitamente in alcuni paesi) degli assistiti del paese in cui ci si trova.",
        "Pertanto NON è prevista l'attivazione di una copertura assicurativa aggiuntiva.",
        `Il ${who} è tenuto ad avere sempre con sé la tessera europea di assicurazione malattia.`,
      ].join("\n"),
    );
  }

  // ---- art. 6, 7
  add(
    "art6",
    "Art. 6 Responsabilità",
    `Il Committente sarà responsabile per i danni causati a terzi dal ${who} nell'esercizio delle funzioni indicate nel presente contratto. Potrà peraltro rivalersi sul ${who} quando i predetti danni siano stati causati da dolo o colpa grave di quest'ultimo. Il ${who} resterà invece unico responsabile dei danni causati a terzi fuori dall'esercizio delle funzioni indicate nell'art. 1.`,
  );
  add(
    "art7",
    "Art. 7 Salute e Sicurezza sul lavoro",
    [
      `A seguito della presenza nel paese ospitante il ${who} dovrà fare riferimento alle norme inerenti alla sicurezza in vigore nel paese ospitante e ad eventuali integrazioni delle stesse, stabilite dal Committente.`,
      `Il ${who} è tenuto a rispettare tutte le misure di sicurezza, anche in relazione al corretto utilizzo dei DPI.`,
      `È onere del Committente formare ed informare il ${who} dei rischi potenziali e delle norme di sicurezza vigenti, sia in Italia che nel Paese dove viene effettuata la prestazione.`,
      ...(emp ? [] : ["", "Non è consentito al Collaboratore l'uso dei mezzi di trasporto di proprietà del Committente per motivi personali ma esclusivamente per esigenze lavorative secondo le Procedure Interne del Committente per la sede del Paese."]),
    ].join("\n"),
  );

  // ---- signatures
  const sig = (text: string[]) => text.join("\n");
  add("closing", "", sig([`Milano, lì ${dateLong(today)}`, `per il Committente: ${signer}`, `Per accettazione: ${name}`]));
  add(
    "closing",
    "",
    sig([
      "Ai sensi e per gli effetti agli artt. 1341 e 1342 del Codice civile, dichiaro di aver preso piena conoscenza e di approvare le clausole di cui agli articoli 2, 3, 5, 6, del presente contratto.",
      `per il Committente: ${signer}`,
      `Per accettazione: ${name}`,
    ]),
  );

  // ---- addendum
  const project = [r.donor_code, r.project_title, r.internal_code ? `codice interno ${r.internal_code}` : ""].filter(Boolean).join(" - ");
  add(
    "addendum",
    `ADDENDUM ALLA LETTERA DI INCARICO MISSIONI ${extra ? "EXTRA EU" : "EU"}\nTERMINI DI RIFERIMENTO`,
    [
      `Con riferimento alla lettera di incarico missioni ${extra ? "extra EU" : "EU"} si specificano di seguito, il/i progetto/i se applicabile, o l'incarico sui quali il/la ${who} svolgerà le proprie funzioni:`,
      "",
      `- ${project || BLANK}`,
      `- Incarico: ${role}`,
      "",
      ...(r.tdr ? r.tdr.split(/\r?\n/) : [BLANK]),
    ].join("\n"),
  );
  add("closing", "", sig([`Milano, lì ${dateLong(today)}`, `per il Committente: ${signer}`, `Per accettazione: ${name}`]));
  return blocks;
}
