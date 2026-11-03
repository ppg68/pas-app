import { createClient } from "@/lib/supabase/server";
import { cupForProject, fetchProjectCups } from "@/lib/domain/projectCups";
import { buildRequestPdf, type PdfSection } from "@/lib/domain/requestPdf";
import {
  procConfigFor,
  irSlots,
  paymentSlots,
  slotLabel,
  slotSigned,
  DOCS_BY_PROC,
  FOLDER_NAMES,
  isOptionalDoc,
  ROLE_LABEL,
  STAGE_TITLES,
  type Role,
} from "@/lib/domain/procedures";

export const dynamic = "force-dynamic";

const when = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat("it-IT", {
        timeZone: "Europe/Rome",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date(iso))
    : "—";
const money = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Not authenticated", { status: 401 });

  const { data: r } = await supabase.from("requests").select("*").eq("id", id).maybeSingle();
  if (!r) return new Response("Request not found", { status: 404 });

  const [
    { data: signatures },
    { data: offers },
    { data: docs },
    { data: approvers },
    { data: payAuths },
    { data: invoices },
    { data: audit },
  ] = await Promise.all([
    supabase.from("signatures").select("phase, signer_role, signed_by, signed_at").eq("request_id", id),
    supabase.from("offers").select("id, supplier, price, created_at").eq("request_id", id).order("created_at"),
    supabase.from("request_documents").select("doc_key, checked").eq("request_id", id),
    supabase.from("request_approvers").select("signer_role, user_id").eq("request_id", id),
    supabase.from("payment_authorizations").select("*").eq("request_id", id).order("created_at"),
    supabase.from("invoices").select("id, supplier, amount, currency, protocol").eq("request_id", id).order("created_at"),
    supabase.from("audit_log").select("ts, user_id, role, action").eq("request_id", id).order("ts"),
  ]);
  const paIds = (payAuths ?? []).map((a) => a.id);
  const { data: paSigs } = paIds.length
    ? await supabase
        .from("payment_authorization_signatures")
        .select("payment_authorization_id, signer_role, signed_by, signed_at")
        .in("payment_authorization_id", paIds)
        .order("signed_at")
    : { data: [] as { payment_authorization_id: string; signer_role: string; signed_by: string; signed_at: string }[] };

  // names of everybody mentioned
  const ids = new Set<string>();
  [r.initiated_by, r.rejected_by].forEach((v) => v && ids.add(v));
  (signatures ?? []).forEach((s) => s.signed_by && ids.add(s.signed_by));
  (approvers ?? []).forEach((a) => ids.add(a.user_id));
  (payAuths ?? []).forEach((a) => {
    if (a.prepared_by) ids.add(a.prepared_by);
    if (a.authorized_by) ids.add(a.authorized_by);
  });
  (paSigs ?? []).forEach((s) => ids.add(s.signed_by));
  (audit ?? []).forEach((a) => a.user_id && ids.add(a.user_id));
  const { data: profiles } = ids.size
    ? await supabase.from("profiles").select("id, full_name").in("id", [...ids])
    : { data: [] as { id: string; full_name: string }[] };
  const name = (uid: string | null | undefined) => (profiles ?? []).find((p) => p.id === uid)?.full_name ?? "—";

  const config = procConfigFor(r.proc_code);
  const cup = cupForProject(await fetchProjectCups(supabase), r.project_code) ?? r.cup_code;
  const winner = (offers ?? []).find((o) => o.id === r.winner_offer_id) ?? null;

  const sections: PdfSection[] = [];

  sections.push({
    title: "Request details",
    rows: [
      ["IR number", r.ir_number ?? r.legacy_ir_number ?? "—"],
      ["Compiled by", r.initiated_by ? name(r.initiated_by) : (r.legacy_initiator_name ?? "—")],
      ["Date", when(r.created_at)],
      ["Office / country", r.country],
      ["Project", r.project_code],
      ["Budget line", r.budget_line],
      ["Description", r.description],
      ["Estimated amount", `${money(r.estimated_price)} ${r.currency}`],
      ["Procedure", config.label],
      ["Donor Procedure Type (if applicable)", r.donor_procedure || "—"],
      ["CUP\\AID", cup ?? "—"],
      ["Derogation", r.derogation ? `Yes - ${r.derogation_reason ?? "no reason given"}` : "No"],
      ["Coordination cost", r.coordination_cost ? "Yes (no linked project)" : "No"],
      ["Institutional activity", r.institutional_activity ? "Yes" : "No"],
      ["Occasional collaborator", r.occasional_collaborator ? "Yes" : "No"],
      ["Current stage", STAGE_TITLES[r.stage]],
    ],
  });

  if (r.stage === "rejected") {
    sections.push({
      title: "Rejection",
      rows: [
        ["Rejected by", name(r.rejected_by)],
        ["Date", when(r.rejected_at)],
        ["Reason", r.rejected_reason ?? "—"],
      ],
    });
  }

  // IR approval
  const irSigs = (signatures ?? []).filter((s) => s.phase === "ir_auth");
  const slots = irSlots({
    procCode: r.proc_code,
    coordinationCost: r.coordination_cost,
    derogation: r.derogation,
    pmRequired: r.pm_required,
  });
  sections.push({
    title: "IR approval",
    rows: slots.map((slot) => {
      const sig = irSigs.find((s) => slot.roles.includes(s.signer_role as Role));
      const designated = (approvers ?? []).find((a) => slot.roles.includes(a.signer_role as Role));
      return [
        slotLabel(slot),
        sig
          ? `Approved by ${name(sig.signed_by)} (${ROLE_LABEL[sig.signer_role as Role]}) on ${when(sig.signed_at)}`
          : `Pending${designated ? ` - designated: ${name(designated.user_id)}` : ""}`,
      ] as [string, string];
    }),
  });

  if ((offers ?? []).length > 0) {
    sections.push({
      title: "Offers",
      rows: (offers ?? []).map((o) => [
        o.supplier,
        `${money(o.price)} ${r.currency}${o.id === r.winner_offer_id ? " - WINNER" : ""}`,
      ]),
      notes: r.winner_note ? [`Winner note: ${r.winner_note}`] : [],
    });
  }

  const checked = new Map((docs ?? []).map((d) => [d.doc_key, d.checked]));
  sections.push({
    title: "Documents",
    rows: DOCS_BY_PROC[r.proc_code as keyof typeof DOCS_BY_PROC].map((k) => [
      FOLDER_NAMES[k] ?? k,
      `${checked.get(k) ? "Present" : "Missing"}${isOptionalDoc(r.proc_code, k) ? " (optional)" : ""}`,
    ]),
    notes: r.folder_path ? [`Folder: ${r.folder_path}`] : [],
  });

  if ((invoices ?? []).length > 0) {
    sections.push({
      title: "Invoices",
      rows: (invoices ?? []).map((i) => [
        i.supplier ?? "—",
        `${money(i.amount)} ${i.currency}${i.protocol ? ` - protocol ${i.protocol}` : ""}`,
      ]),
    });
  }

  // payments
  const increment = Number(r.increment_amount ?? 0);
  const supplyValue = winner ? winner.price : r.estimated_price;
  const paySlotList = paymentSlots({
    procCode: r.proc_code,
    coordinationCost: r.coordination_cost,
    pmRequired: r.pm_required,
  });
  if ((payAuths ?? []).length > 0 || increment > 0) {
    sections.push({
      title: "Payment summary",
      rows: [
        ["Value of the supply", `${money(supplyValue)} ${r.currency}`],
        ["Additional service", `${money(increment)} ${r.currency}`],
        ["Total to pay", `${money(supplyValue + increment)} ${r.currency}`],
      ],
      notes: r.increment_reason ? [`Additional service reason: ${r.increment_reason}`] : [],
    });
  }
  (payAuths ?? []).forEach((a, i) => {
    const sigs = (paSigs ?? []).filter((x) => x.payment_authorization_id === a.id);
    const signedRoles = sigs.map((x) => x.signer_role as Role);
    const inv = (invoices ?? []).find((x) => x.id === a.invoice_id);
    sections.push({
      title: `Payment authorization ${i + 1}`,
      rows: [
        ["Date", when(a.created_at).slice(0, 10)],
        ["Description", a.description],
        ["Invoice", inv ? `${inv.supplier ?? "—"}${inv.protocol ? ` - ${inv.protocol}` : ""}` : "—"],
        ["Beneficiary", a.beneficiary],
        ["IBAN / payment details", a.payment_details ?? "—"],
        [
          "Payment type",
          a.payment_type === "bank_transfer"
            ? "Bank transfer"
            : a.payment_type === "cash"
              ? "Cash"
              : (a.payment_type_other ?? "Other"),
        ],
        ["Bank transfer description", a.bank_description ?? "—"],
        ["Amount", `${money(a.amount)} ${a.currency}`],
        ["Balance still to pay", a.balance_after != null ? `${money(a.balance_after)} ${a.currency}` : "—"],
        ["Euro equivalent", a.euro_equivalent != null && a.currency !== "EUR" ? `EUR ${money(a.euro_equivalent)}` : "—"],
        ["Prepared by", `${name(a.prepared_by)} on ${when(a.created_at)}`],
        [
          "Approval",
          [
            a.status === "authorized"
              ? `Authorized on ${when(a.authorized_at)}`
              : a.status === "recorded"
                ? "Recorded (no approval required)"
                : `Waiting for: ${paySlotList.filter((sl) => !slotSigned(sl, signedRoles)).map(slotLabel).join(" + ")}`,
            ...sigs.map(
              (x) => `Approved by ${name(x.signed_by)} (${ROLE_LABEL[x.signer_role as Role]}) on ${when(x.signed_at)}`
            ),
            ...(sigs.length === 0 && a.status === "authorized" && a.authorized_by
              ? [
                  `Approved by ${name(a.authorized_by)} (${a.authorized_role ? ROLE_LABEL[a.authorized_role as Role] : "—"}) on ${when(a.authorized_at)}`,
                ]
              : []),
          ].join("\n"),
        ],
      ],
    });
  });

  if ((audit ?? []).length > 0) {
    sections.push({
      title: "History",
      rows: (audit ?? []).map((a) => [
        when(a.ts),
        `${a.action.replace(/_/g, " ")}${a.user_id ? ` - ${name(a.user_id)}` : ""}${a.role ? ` (${ROLE_LABEL[a.role as Role] ?? a.role})` : ""}`,
      ]),
    });
  }

  const bytes = await buildRequestPdf(
    {
      title: `IR ${r.code}`,
      subtitle: `${r.description} - ${config.label} - ${money(r.estimated_price)} ${r.currency}`,
      generated: `Generated by PAS on ${when(new Date().toISOString())}`,
    },
    sections
  );
  const safe = String(r.code).replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "IR";
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="IR ${safe}.pdf"`,
    },
  });
}
