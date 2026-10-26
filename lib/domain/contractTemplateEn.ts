// English version of the contract template in contractRequests.ts (same blocks, same keys, same logic).
// Keep the two files aligned: a change to the Italian wording must be mirrored here.
import { OIKOS_POLICIES, type ContractBlock, type ContractRequestRow } from "@/lib/domain/contractRequests";

const MONTHS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function dateLongEn(iso: string | null | undefined): string {
  if (!iso) return "____________";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return "____________";
  return `${d} ${MONTHS_EN[m - 1]} ${y}`;
}

function moneyEn(n: number, currency = "EUR"): string {
  const s = n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === "EUR" ? `EUR ${s}` : `${currency} ${s}`;
}

const ONES = [
  "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function below1000En(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h) parts.push(`${ONES[h]} hundred`);
  if (r) {
    if (h) parts.push("and");
    parts.push(r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? `-${ONES[r % 10]}` : ""));
  }
  return parts.join(" ");
}

function wordsEn(n: number): string {
  if (n === 0) return "zero";
  const out: string[] = [];
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  if (millions) out.push(`${below1000En(millions)} million`);
  if (thousands) out.push(`${below1000En(thousands)} thousand`);
  if (rest) out.push(rest < 100 && out.length ? `and ${below1000En(rest)}` : below1000En(rest));
  return out.join(" ");
}

/** "forty-nine thousand nine hundred and sixty-nine/80" */
function amountInWordsEn(amount: number): string {
  const cents = Math.round(amount * 100);
  return `${wordsEn(Math.floor(cents / 100))}/${String(cents % 100).padStart(2, "0")}`;
}

function lines(text: string | null | undefined): string[] {
  return (text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

function bullets(text: string | null | undefined): string {
  return lines(text).map((l) => `- ${l.replace(/^[-•]\s*/, "")}`).join("\n");
}

const OIKOS_HEAD = [
  "ISTITUTO OIKOS E.T.S.",
  "with administrative office in 20134 Milan – Via Crescenzago 1",
  "Tax Code 97182800157 - VAT No. 02503750123",
  "Giuseppe Guida as Legal Representative",
];

export function buildContractBlocksEn(r: ContractRequestRow): ContractBlock[] {
  const d = r.data ?? {};
  const company = r.kind === "company";
  const name = r.party_name.trim();
  const short = (r.party_short || name).trim();
  const B = `**${name}**`;
  const S = `**${short}**`;

  const project = [r.donor_code, r.project_title].filter(Boolean).join(" - ");
  const projectQuoted = `**${project ? `“${project}”` : "“____________”"}**`;
  const internal = r.internal_code ? ` (int. code ${r.internal_code})` : "";
  const fee = amountInWordsEn(r.amount);
  const amountTxt = moneyEn(r.amount, r.currency);
  const occasional = r.contract_type === "occasional";
  const startTxt = r.start_on_signature ? "from the signature of this contract" : `from ${dateLongEn(r.start_date)}`;
  const endTxt = `to ${dateLongEn(r.end_date)}`;

  const blocks: ContractBlock[] = [];
  const add = (key: string, title: string, body: string) => blocks.push({ key, title, body });

  // ---- opening + parties
  if (company) {
    add(
      "parties",
      "",
      [
        "This collaboration contract is drawn up to regulate the relationship between",
        "",
        ...OIKOS_HEAD.map((l, i) => (i === 0 ? "ISTITUTO OIKOS ENTE DEL TERZO SETTORE" : l)),
        "of the one part",
        "and",
        `**${name}**`,
        r.address ? `with registered office in ${r.address}` : "",
        [r.tax_code ? `Tax Code ${r.tax_code}` : "", r.vat_number ? `VAT No. ${r.vat_number}` : ""].filter(Boolean).join(" - "),
        r.legal_rep ? `${r.legal_rep} as ${r.legal_rep_role || "Legal Representative"}` : "",
        "of the other part",
        "",
        "hereinafter, individually, a “Party” or, jointly, the “Parties”",
      ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n"),
    );
  } else {
    add(
      "parties",
      "",
      [
        "This commercial collaboration contract is drawn up to regulate the relationship",
        "",
        "between",
        "",
        ...OIKOS_HEAD,
        "",
        "of the one part",
        "and",
        "",
        `**${name.toUpperCase()}**`,
        r.address ? `Resident in ${r.address}` : "",
        [r.tax_code ? `Tax Code ${r.tax_code}` : "", r.vat_number ? `VAT No. ${r.vat_number}` : ""].filter(Boolean).join(" - "),
        `in the capacity of ${d.capacity || "Consultant"}`,
        "",
        "hereinafter, individually, a “Party” or, jointly, the “Parties”",
      ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n"),
    );
  }

  // ---- premises
  const prem: string[] = [
    "",
    "whereas:",
    "",
    "a. ISTITUTO OIKOS E.T.S. operates in Italy and abroad in the fields of environmental management and protection and international cooperation",
    "",
    company
      ? `b. ISTITUTO OIKOS E.T.S. has received funding for the project ${projectQuoted} in the framework of which the “services” of a party with suitable knowledge are required, as specified in article 4 of this contract${d.tdr ? " and in the attached Terms of Reference" : ""}.`
      : `b. ISTITUTO OIKOS E.T.S. has received funding for the following project ${projectQuoted} for which the “services” of a party with suitable knowledge are required, as specified in article 4 of this contract.`,
  ];
  if (r.ir_code) prem.push("", `c. The contractor was selected through procedure no. IR ${r.ir_code}.`);
  prem.push("", "Now, therefore, the Parties agree and stipulate as follows:");
  add("premises", "", prem.join("\n"));

  add("art1", "ARTICLE 1 – RECITALS AND ANNEXES", "The recitals and the Annexes form an integral and substantial part of the Contract and the Parties declare that they have taken full notice of them and accept their content without reservation.");
  add("art2", "ARTICLE 2 – PRINCIPLES GOVERNING THE CONTRACT", [
    "In performing the Contract, the Parties undertake, among other things:",
    "2.1 to act in good faith to safeguard the mutual benefit deriving from the Contract pursuant to art. 1375 of the Italian Civil Code;",
    "2.2 to cooperate in the best possible way to give effective implementation to the provisions of the Contract, each making available to the other knowledge, documentation, tools and data, always in compliance with the laws in force;",
    "2.3 to promptly inform each other of any circumstances that may be relevant or useful to the other Party for the performance of the Contract.",
  ].join("\n"));
  add("art3", "ARTICLE 3 – NATURE AND SCOPE OF THE CONTRACT", [
    "3.1 The Parties acknowledge that the relationship established by the Contract cannot in any way be considered, either by them or by third parties, as a joint venture or other form of association (including a participation association), the Parties remaining, towards each other and towards third parties, free from any bond not expressly provided for in the Contract.",
    "3.2 Any previous agreement, written or verbal, entered into between the Parties with reference to the subject of the Contract shall be deemed superseded and replaced by this Contract.",
  ].join("\n"));

  // ---- art. 4 object
  if (company) {
    add("art4", "ARTICLE 4 – SUBJECT OF THE CONTRACT", [
      `4.1 By this Contract, ${S} undertakes to provide the service to ISTITUTO OIKOS E.T.S. under the economic conditions and terms specified in the economic agreement.`,
      "",
      `ISTITUTO OIKOS E.T.S. entrusts ${S}, which accepts, to carry out its activity for: ${(r.activities ?? "").trim() || "____________"}`,
      `in the framework of the project: ${projectQuoted}${internal}`,
      ...(r.objective ? [`Objective: ${r.objective.trim()}`] : []),
      ...(d.tdr ? ["Specific objectives and activities are set out in the Terms of Reference (ToR) attached to the contract."] : []),
    ].join("\n"));
  } else {
    add("art4", "ARTICLE 4 – SUBJECT OF THE CONTRACT", [
      `4.1 By this Contract, ${B} undertakes to provide the Service to ISTITUTO OIKOS E.T.S. under the economic conditions and terms specified in the economic agreement.`,
      "",
      `ISTITUTO OIKOS E.T.S. entrusts ${B}, who accepts, to provide consultancy and carry out the following activities:`,
      bullets(r.activities),
      "",
      r.work_place ? `The consultant will perform their duties at: ${r.work_place.trim()}, in the framework of the project:` : "The consultant will perform their duties in the framework of the project:",
      "",
      `${projectQuoted}${internal}`,
      ...(r.objective ? ["", `The final objective of the consultancy is: ${r.objective.trim()}`] : []),
    ].join("\n"));
  }

  add("art5", "ARTICLE 5 – WARRANTIES", "5.1 Each Party shall carry out the activities for which it is responsible with the best professional diligence pursuant to art. 1176 of the Italian Civil Code.");

  // ---- art. 6 fees
  const feeLines: string[] = [];
  if (company) {
    feeLines.push(
      `6.1 For the activities covered by this Contract the Parties agree a total gross fee of **${amountTxt}** (${fee}), inclusive of any charges borne by the Organisation.`,
      `6.2 Payment will be made by bank transfer${lines(r.payment_terms).length > 1 ? ` in ${lines(r.payment_terms).length} instalments:` : ":"}`,
      bullets(r.payment_terms),
      `6.3 Payment will be made upon issue of regular invoices and/or debit notes showing the project reference${r.donor_code ? " and its code" : ""}: ${project || "____________"}.`,
    );
  } else {
    const what = r.fee_mode === "daily" ? "a total daily fee" : "a total gross fee";
    const incl = occasional
      ? "inclusive of withholding tax and any charges borne by the Organisation"
      : "inclusive of VAT and any charges borne by the Organisation";
    feeLines.push(
      `6.1 For the activities covered by this Contract the Parties agree ${what} of **${amountTxt}** (${fee}), ${incl}.`,
      `6.2 Payment will be made by bank transfer following:`,
      `- the issue of ${occasional ? "a regular occasional-service note" : "regular invoices"}${r.payment_terms ? ` ${r.payment_terms.trim()}` : ""}.`,
      `6.3 Should the assignment not be carried out for reasons exclusively attributable to force majeure, ${B} shall be paid a share proportional to the work performed.`,
      `6.4 Should the assignment not be carried out for any reason attributable to ${B}, nothing further shall be due except a share proportional to the work performed, from which any damage caused to ISTITUTO OIKOS E.T.S. by the failure to complete the work shall be deducted.`,
      "6.5 In case of delay in carrying out the assignment by the consultant, except for delay caused by force majeure, the fee shall be paid taking into account any damages charged to ISTITUTO OIKOS E.T.S. as a consequence of such delay.",
    );
  }
  feeLines.push("", `Payments shall be made in ${r.currency} into the bank account notified by ${company ? S : "the consultant"} to ISTITUTO OIKOS E.T.S.`);
  add("art6","ARTICLE 6 – FEES", feeLines.join("\n"));

  // ---- art. 7 expenses
  const exp: string[] = [];
  const flights = Number(d.flights_count || 0) > 0;
  if (!company && (flights || d.insurance === "oikos")) {
    if (flights) {
      exp.push(`ISTITUTO OIKOS E.T.S., in the framework of the missions, will bear the cost of the return air ticket${d.flights_route ? ` ${d.flights_route}` : ""}${d.insurance === "oikos" ? " and the cost of the health insurance" : ""}${d.flights_max ? ` (maximum reimbursable amount ${d.flights_max}, including CO2 offsetting where applicable)` : ""}.`);
    } else {
      exp.push("ISTITUTO OIKOS E.T.S. will bear the cost of the health insurance.");
    }
    if (d.insurance === "oikos") {
      exp.push("", "The following policies will be activated:", ...OIKOS_POLICIES.map((p) => `- ${p}`));
    }
    if (flights) {
      exp.push("", "The consultant undertakes to hand over to the principal the return air ticket complete with all boarding passes, failing which the amount of the air ticket and the fee for the period of work not covered by suitable documentation certifying their presence at the place established for the performance of their duties shall be deducted from their fee.");
    }
  }
  const reimb: string[] = [];
  if (d.visa_bl) reimb.push("Visa costs;");
  if (flights) reimb.push("Transport to and from the airport;");
  if (d.other_reimb) reimb.push(`${d.other_reimb.trim()};`);
  if (!company && reimb.length) {
    exp.push("", "The principal will also bear, or reimburse to the consultant, the cost of the following expenses, previously authorised and duly documented:", ...reimb.map((x) => `- ${x}`));
  }
  exp.push("", "Any other expense not foreseen in the estimate, for extra services, must be examined and agreed by both parties after a written extra estimate has been drawn up.");
  add("art7", "ARTICLE 7 – EXPENSES", exp.join("\n").replace(/^\n+/, ""));

  // ---- art. 8 duration
  if (company) {
    add("art8", "ARTICLE 8 – DURATION AND WITHDRAWAL", [
      `8.1 This Contract shall run ${startTxt} ${endTxt}.`,
      "8.2 The contract may be terminated by mutual consent of the contracting parties, for breach or for reasons of force majeure. The revocation or interruption of the funding by the public or private body responsible for the intervention is also deemed to be force majeure.",
      "8.3 The Parties shall also have the right to withdraw from this Contract at any time, by written notice sent to the other Party by registered letter with return receipt or by certified email (PEC), with at least 30 (thirty) days’ notice, sent to the addresses set out in Art. 12.1 below.",
      `8.4 It is understood between the Parties that, at the end of this Contract for any reason, each Party shall remain bound only to perform the obligations already accrued on the date the termination takes effect. In any case ${S} retains the right to receive the fees accrued for the activities actually carried out up to the date the termination takes effect, as well as the reimbursement of any duly documented costs.`,
      "8.5 Should the services not be performed in the manner provided for in this contract, the provisions of the applicable law shall apply.",
    ].join("\n"));
  } else {
    add("art8", "ARTICLE 8 – DURATION AND WITHDRAWAL", [
      `8.1 This Contract shall run ${startTxt} ${endTxt}.`,
      "8.2 The contract may be terminated by mutual consent of the contracting parties, for just cause or for reasons of force majeure. In the case of services performed abroad in which, in the host country, police operations, military operations, political activities or natural disasters arise that require the immediate repatriation of the service provider for their own safety, the principal shall have the right to withdraw from this contract without notice.",
      "8.3 The Parties shall also have the right to withdraw from this Contract at any time, by written notice sent to the other Party by registered letter with return receipt, with at least 30 (thirty) days’ notice, sent to the addresses set out in Art. 12.1 below.",
      "8.4 It is understood between the Parties that, at the end of this Contract for any reason, the commitments shall remain in force until all initiatives in progress or started have been successfully completed and ISTITUTO OIKOS E.T.S. shall not be required to pay any indemnity or compensation of any kind, on any account, to the other Party.",
      `8.5 The parties agree and stipulate the following express termination clause (art. 1456 of the Italian Civil Code): this contract shall be automatically terminated if the services are not performed in the manner provided for in art. 4 of the contract. The obligations to be performed on pain of termination and borne by ${B} concern, precisely, the delivery of the services and initiatives referred to in art. 4.`,
      "This clause shall be considered an integral part of this contract.",
    ].join("\n"));
  }

  add("art9", "ARTICLE 9 – PROHIBITION OF ASSIGNMENT OF THE CONTRACT", "Unless the other Party expressly consents in writing, neither Party may assign the Contract or the rights and obligations deriving from it, for any or all of the obligations arising from the contract itself.");
  add("art10", "ARTICLE 10 – AMENDMENTS AND ADDITIONS", "Any amendment or addition to the Contract may be made by mutual agreement of the Parties only in writing.");

  add("art11", "ARTICLE 11 – CONCLUSION OF THE CONTRACT", [
    company
      ? `11.1 The Contract shall be deemed concluded when ISTITUTO OIKOS E.T.S. receives the duly signed Contract from ${S}.`
      : `11.1 The Contract shall be concluded by exchange of commercial correspondence and shall therefore be deemed concluded when ISTITUTO OIKOS E.T.S. receives from ${B} the duly signed acceptance of the Contract.`,
    "11.2 Each Party warrants to the other: (I) that it has taken all resolutions necessary to enter into and perform the Contract, (II) that the Contract is fully binding on it, (III) that the Contract does not violate the provisions of other contracts entered into by it or any prohibitions, of whatever origin or nature, to which it is subject.",
  ].join("\n"));

  // ---- art. 12 communications
  if (company) {
    add("art12", "ARTICLE 12 – COMMUNICATIONS", [
      "12.1 The communications provided for in this Contract shall be made in writing by email to the attention of the following contact persons, at the following offices:",
      "For ISTITUTO OIKOS E.T.S.",
      "Attn. Legal Representative Giuseppe Guida – Administrative Office in 20134 Milan – Via Crescenzago 1 – email: segreteria.it@istituto-oikos.org – PEC: istituto.oikos@pec.it",
      `For ${S}`,
      `${r.contact_person ? `Attn. ${r.contact_person} – ` : ""}${r.address ? `Office in ${r.address} - ` : ""}${r.contact_email ? `email: ${r.contact_email}` : ""}`.replace(/ - $/, ""),
      ...(r.contact_email_admin ? [`Administration ${short} – email: ${r.contact_email_admin}`] : []),
      ...(r.pec ? [`PEC: ${r.pec}`] : []),
      "12.2 The Parties may change the above addresses by giving prior suitable notice, on pain of unenforceability, to the other Party, indicating the date from which the new address will take effect.",
      "12.3 Communications concerning ordinary operations may be exchanged between the Parties by any means, provided it can be documented, at the addresses that the Parties will make known during the performance of the Contract.",
      "12.4 Communications shall be effective from the day of their receipt.",
      "12.5 The language of the contract and of all written communications between the Parties shall be English.",
    ].join("\n"));
  } else {
    add("art12", "ARTICLE 12 – COMMUNICATIONS", [
      "12.1 The contractual communications provided for in this agreement shall be made in writing by email to the attention of the following contact persons, at the following offices:",
      "For ISTITUTO OIKOS E.T.S.",
      "Attn. Legal Representative Giuseppe Guida – Administrative Office in 20134 Milan – Via Crescenzago 1 – email: segreteria.it@istituto-oikos.org",
      `For ${B}`,
      `Attn. ${B}${r.address ? ` – tax domicile in ${r.address}` : ""} – email: ${r.email || "____________"}${r.pec ? ` – PEC: ${r.pec}` : ""}`,
      "12.2 The Parties may change the above addresses by giving prior suitable notice, on pain of unenforceability, to the other Party, indicating the date from which the new address will take effect.",
      "12.3 Communications concerning ordinary operations may be exchanged between the Parties by any means, provided it can be documented, at the addresses that the Parties will make known to each other during the performance of the Contract.",
      "12.4 Communications shall be effective from the day of their receipt.",
      "12.5 The language of the contract and of all written communications between the Parties shall be English.",
    ].join("\n"));
  }

  add("art13", "ARTICLE 13 – CONFIDENTIALITY OBLIGATIONS", [
    "13.1 The Parties undertake to maintain the utmost confidentiality on all information, data, news and documents, including ideas and projects relating to the Parties or to third parties (the “Confidential Data”) that have come or come into their possession or knowledge during negotiations or the conclusion of the Contract or in carrying out the activities provided for in and/or dependent on it, and not to disclose them to third parties in any way without the prior written consent of the other Party. Each Party undertakes to ensure that its directors, employees and collaborators in any capacity are aware of the confidentiality obligations of this article and comply with them.",
    "13.2 Except for legal obligations or orders of administrative and/or judicial authorities, the Parties shall not copy, retain, communicate, disseminate or otherwise use the Confidential Data, in any way or form, even indirectly, for purposes other than those provided for in the Contract.",
    "13.3 The confidentiality obligations provided for in this article shall survive the expiry, termination or withdrawal from the Contract or its loss of effectiveness, for any reason and on any account, until the Confidential Data are made public by their lawful owner.",
  ].join("\n"));

  add("art14", "ARTICLE 14 – PROTECTION OF PERSONAL DATA",
    `The Parties acknowledge that they are fully informed of the mutual processing of personal data pursuant to Articles 13 and 14 of the G.D.P.R. (General Data Protection Regulation) EU Regulation 2016/679. ${company ? S : "The consultant"} acknowledges having duly received the notice referred to in Articles 13 and 14 of the said G.D.P.R.`);

  // ---- art. 15 liability
  if (company) {
    add("art15", "ARTICLE 15 – LIABILITY AND SAFETY PROVISIONS", [
      `ISTITUTO OIKOS E.T.S. is exempt from any liability for damage to persons and/or property caused by ${S} during the contract. ${S} is required to adopt all safety measures relating to the performance of the activities covered by this contract.`,
      `ISTITUTO OIKOS E.T.S. is hereby released from any claim for compensation concerning accidents of any kind and nature affecting the personnel of ${S} or third parties.`,
      `ISTITUTO OIKOS E.T.S. may claim against ${S} for any damage caused to third parties during the performance of the activities, where such damage was caused by wilful misconduct or gross negligence of the latter or of its personnel.`,
    ].join("\n"));
  } else {
    add("art15", "ARTICLE 15 – LIABILITY AND SAFETY PROVISIONS", [
      `ISTITUTO OIKOS E.T.S. is exempt from any liability for damage to persons and/or property caused by ${B} during the contract.`,
      `${B} is required to adopt all safety measures.`,
      `ISTITUTO OIKOS E.T.S. is hereby released from any claim for compensation concerning accidents of any kind and nature affecting ${B} or third parties.`,
      `ISTITUTO OIKOS E.T.S. may claim against ${B} for any damage caused to third parties during the performance of the service, where such damage was caused by wilful misconduct or gross negligence of the latter or of their personnel.`,
    ].join("\n"));
  }

  add("art16", "ARTICLE 16 – ANNEXES", [
    "The following documents, to be signed upon signature of the contract, form an integral part of the contract:",
    "- Privacy notice and consent to data processing",
    "- Code of Ethics and Conduct",
    "- PSEA Policy – Protection from sexual exploitation and abuse, sexual harassment (including child)",
    ...(d.tdr ? ["- Terms of Reference"] : []),
    `The Parties declare that they have taken full notice of them, accept their content without reservation and undertake to act consistently with them in carrying out ${company ? "the assignment signed" : "the assignments signed"}.`,
  ].join("\n"));

  add("art17", "ARTICLE 17 – JURISDICTION", "For anything not expressly provided for in this agreement, the provisions of law shall apply; any dispute arising from or connected with this relationship shall in any case be brought before the Court of Milan.");

  // ---- closing / signatures
  const when = d.signing_date ? new Date(d.signing_date + "T00:00:00").toLocaleDateString("en-GB") : dateLongEn(r.start_date);
  add("closing", "", [
    `Milan, ${when}`,
    "",
    company ? "for Istituto Oikos E.T.S.: Giuseppe Guida" : "for the principal: Giuseppe Guida",
    "",
    company ? `for ${S}: ${r.legal_rep || "____________"}` : `for the consultant: ${B}`,
  ].join("\n"));

  return blocks;
}
