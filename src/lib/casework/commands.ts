import type Database from "better-sqlite3";
import { z } from "zod";
import { getAdapters } from "../adapters";
import { assertCan, type Principal } from "../auth/principal";
import {
  type ClaimReviewOption, approveFraudEscalation, assignCase, closeCase, completeFollowUp, createAction, decideProof, getCase, getFinding, proposeProof, recordClaimReview, reopenFinding,
  requestFollowUp, requestFraudEscalation, resolveAction, respondClarification, sendClarification, setCauses, startAction, startReview,
} from "../cases/core";
import { nowIso } from "../clock";
import { addDays } from "../dates";
import { DomainError, idempotent } from "../idem";
import { addNote, createDispute, lapseIfDue, linkEvidence, recordEvidenceSearch, resolveDispute, reviewExtraction, syncServiceRequests, transcribeDocument, withdrawClarification } from "./workflow";
import { correctSummary, decideSuggestion, generateCaseSummary, type LiveSummarizer } from "./summary";

/* Satu pintu perintah untuk ruang kasus dan portal faskes. Setiap perintah: divalidasi zod, dijalankan dalam satu transaksi (domain + audit),
   dan idempoten bila klien mengirim kunci. Wewenang diperiksa oleh fungsi domain, bukan oleh pemanggil. */

/* Literal lokal: db/index → seed → modul ini membentuk siklus impor, sehingga nilai dari cases/core tidak boleh dibaca saat modul dimuat. */
const CLAIM_REVIEW_VALUES = ["loloskan", "koreksi_nilai", "tolak", "eskalasi_audit"] as const satisfies readonly ClaimReviewOption[];
const text = (max = 2000) => z.string().trim().max(max);
const id = z.string().trim().min(1).max(40);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid.");

/** Tindakan perbaikan dipakai petugas dan faskes; pembatasan ke faskes sendiri ditegakkan oleh fungsi domain. */
const actionShared = [
  z.object({ type: z.literal("create_action"), findingId: id, description: text(1200), owner: text(120), targetDate: date, remeasurePlan: text(600).optional() }),
  z.object({ type: z.literal("start_action"), actionId: id }),
  z.object({ type: z.literal("resolve_action"), actionId: id, result: text(1200) }),
] as const;

export const staffCommandZ = z.discriminatedUnion("type", [
  z.object({ type: z.literal("assign_case"), caseId: id, assignee: id, reason: text(300) }),
  z.object({ type: z.literal("start_review"), findingId: id }),
  z.object({
    type: z.literal("send_clarification"), findingId: id, issue: text(1200), requestedDocs: z.array(text(160)).max(8).default([]), minimalRef: text(160).optional(),
    dueDays: z.coerce.number().int().min(1).max(60).default(14), suggestionId: id.optional(),
  }),
  z.object({ type: z.literal("withdraw_clarification"), clarificationId: id, reason: text(300) }),
  z.object({ type: z.literal("add_note"), caseId: id, findingId: id.nullish(), text: text(2000) }),
  z.object({
    type: z.literal("link_evidence"), findingId: id, direction: z.enum(["supports", "contradicts", "neutral"]), evidenceId: id.nullish(), documentId: id.nullish(),
    quote: text(400).nullish(), page: z.coerce.number().int().min(1).max(999).nullish(), note: text(600),
  }),
  z.object({
    type: z.literal("record_search"), findingId: id, source: text(80), query: text(300), result: z.enum(["found", "not_found", "inconsistent"]), foundRef: text(120).nullish(), suggestionId: id.optional(),
  }),
  z.object({ type: z.literal("propose_proof"), findingId: id, outcome: z.enum(["verified", "not_verified", "inconclusive"]), reason: text(1200) }),
  z.object({ type: z.literal("decide_proof"), proposalId: z.coerce.number().int().min(1), approve: z.boolean(), note: text(600) }),
  z.object({ type: z.literal("set_causes"), findingId: id, causes: z.array(z.enum(["administrative", "service_process"])).min(1).max(2), note: text(1200) }),
  z.object({ type: z.literal("request_escalation"), findingId: id, reason: text(1200) }),
  z.object({ type: z.literal("decide_escalation"), requestId: z.coerce.number().int().min(1), approve: z.boolean(), note: text(600) }),
  z.object({ type: z.literal("reopen_finding"), findingId: id, reason: text(600) }),
  z.object({ type: z.literal("claim_review"), findingId: id, option: z.enum(CLAIM_REVIEW_VALUES), reason: text(1200), correction: z.coerce.number().min(0).max(10_000_000_000).nullish() }),
  z.object({ type: z.literal("request_followup"), actionId: id, participantId: id.nullish(), dueDays: z.coerce.number().int().min(1).max(120).default(30) }),
  z.object({ type: z.literal("complete_followup"), followUpId: id, outcome: z.enum(["resolved", "still_issue"]), note: text(1000).default("") }),
  z.object({ type: z.literal("close_case"), caseId: id, reason: text(600) }),
  z.object({ type: z.literal("resolve_dispute"), disputeId: id, decision: z.enum(["accepted", "rejected", "noted"]), response: text(1200) }),
  z.object({ type: z.literal("transcribe_document"), documentId: id, text: text(20000) }),
  z.object({ type: z.literal("review_extraction"), extractionId: id, action: z.enum(["confirm", "correct", "reject"]), text: text(20000).optional() }),
  z.object({ type: z.literal("generate_summary"), findingId: id }),
  z.object({ type: z.literal("correct_summary"), summaryId: id, blockId: id, text: text(600), note: text(300) }),
  z.object({ type: z.literal("decide_suggestion"), suggestionId: id, decision: z.enum(["accepted", "modified", "dismissed"]), text: text(900).optional(), reason: text(400).optional() }),
  ...actionShared,
]);

export const facilityCommandZ = z.discriminatedUnion("type", [
  z.object({ type: z.literal("respond_clarification"), clarificationId: id, text: text(4000), documentId: id.nullish() }),
  z.object({ type: z.literal("create_dispute"), findingId: id, text: text(2000) }),
  ...actionShared,
]);

export const allCommandZ = z.discriminatedUnion("type", [
  ...staffCommandZ.options,
  z.object({ type: z.literal("respond_clarification"), clarificationId: id, text: text(4000), documentId: id.nullish() }),
  z.object({ type: z.literal("create_dispute"), findingId: id, text: text(2000) }),
]);
export type Command = z.infer<typeof allCommandZ>;
export type StaffCommand = z.infer<typeof staffCommandZ>;
export type FacilityCommand = z.infer<typeof facilityCommandZ>;

/** Kasus yang terdampak perintah, untuk menyelaraskan status laporan peserta. */
function caseOf(db: Database.Database, c: Command): string | null {
  const q = (sql: string, v: string) => (db.prepare(sql).get(v) as { case_id: string | null } | undefined)?.case_id ?? null;
  switch (c.type) {
    case "assign_case": case "add_note": case "close_case": return c.caseId;
    case "withdraw_clarification": case "respond_clarification": return q("SELECT case_id FROM clarifications WHERE id = ?", c.clarificationId);
    case "resolve_dispute": return q("SELECT f.case_id FROM disputes d JOIN findings f ON f.id = d.ref_id WHERE d.id = ?", c.disputeId);
    case "start_action": case "resolve_action": case "request_followup": return q("SELECT case_id FROM improvement_actions WHERE id = ?", c.actionId);
    case "complete_followup": return q("SELECT a.case_id FROM follow_ups u JOIN improvement_actions a ON a.id = u.action_id WHERE u.id = ?", c.followUpId);
    case "decide_proof": return q("SELECT case_id FROM review_decisions WHERE id = ?", String(c.proposalId));
    case "decide_escalation": return q("SELECT case_id FROM review_decisions WHERE id = ?", String(c.requestId));
    case "transcribe_document": return q("SELECT case_id FROM documents WHERE id = ?", c.documentId);
    case "review_extraction": return q("SELECT d.case_id FROM extractions x JOIN documents d ON d.id = x.document_id WHERE x.id = ?", c.extractionId);
    case "correct_summary": return q("SELECT case_id FROM case_summaries WHERE id = ?", c.summaryId);
    case "decide_suggestion": return q("SELECT case_id FROM assistant_suggestions WHERE id = ?", c.suggestionId);
    default: return "findingId" in c ? q("SELECT case_id FROM findings WHERE id = ?", c.findingId) : null;
  }
}

function notifyAssignee(db: Database.Database, caseId: string | null, topic: string, body: string, refType: string, refId: string) {
  if (!caseId) return;
  const c = getCase(db, caseId);
  if (!c?.assignee_id) return;
  getAdapters(db).notification.notify({ to_role: c.assignee_role ?? "verifikator", to_id: c.assignee_id, topic, body, ref_type: refType, ref_id: refId });
}

/** Menandai saran asisten yang menjadi dasar suatu tindakan petugas: diterima bila isinya sama, diterima dengan perubahan bila berbeda. */
function settleSuggestion(db: Database.Database, p: Principal, suggestionId: string | undefined, kind: string, finalText: string, original: string | null) {
  if (!suggestionId) return;
  const s = db.prepare("SELECT kind, state FROM assistant_suggestions WHERE id = ?").get(suggestionId) as { kind: string; state: string } | undefined;
  if (!s || s.kind !== kind || s.state !== "proposed") return;
  const same = original !== null && original.trim() === finalText.trim();
  decideSuggestion(db, p, suggestionId, same ? "accepted" : "modified", same ? {} : { text: finalText.slice(0, 900), reason: "Diubah petugas saat dikirim." });
}

export interface CommandResult { result: unknown; replayed: boolean }

/** Perintah sinkron (semua kecuali ringkasan asisten). Dipakai seed dan tes; `idemKey` menjamin pengiriman ulang tidak menggandakan efek. */
export function runCommandSync(db: Database.Database, p: Principal, input: unknown, idemKey?: string | null): CommandResult {
  const c = allCommandZ.parse(input);
  if (c.type === "generate_summary") throw new DomainError("Ringkasan asisten dijalankan lewat executeCommand.", 400);
  lapseIfDue(db);
  const run = idempotent(db, `casework:${p.id}:${c.type}`, idemKey, () => db.transaction(() => {
    const result = dispatch(db, p, c);
    const cid = caseOf(db, c) ?? (result && typeof result === "object" && "caseId" in result ? String((result as { caseId: string }).caseId) : null);
    if (cid) syncServiceRequests(db, cid);
    return result;
  })());
  return { result: run.value, replayed: run.replayed };
}

/** Jalankan satu perintah. Ringkasan asisten dapat memanggil model sehingga asinkron; perintah lain selesai dalam satu transaksi. */
export async function executeCommand(db: Database.Database, p: Principal, input: unknown, idemKey?: string | null, deps: { live?: LiveSummarizer } = {}): Promise<CommandResult> {
  const c = allCommandZ.parse(input);
  if (c.type !== "generate_summary") return runCommandSync(db, p, c, idemKey);
  lapseIfDue(db);
  // satu panggilan model per permintaan; hasil disimpan sebagai versi baru dan tidak diulang oleh kunci idempoten
  const r = await generateCaseSummary(db, p, c.findingId, deps);
  const cid = caseOf(db, c);
  if (cid) syncServiceRequests(db, cid);
  return { result: r, replayed: false };
}

function dispatch(db: Database.Database, p: Principal, c: Exclude<Command, { type: "generate_summary" }>): unknown {
  switch (c.type) {
    case "assign_case": assignCase(db, p, c.caseId, c.assignee, c.reason); return { caseId: c.caseId };
    case "start_review": startReview(db, p, c.findingId); return { findingId: c.findingId };
    case "send_clarification": {
      const dueAt = addDays(nowIso(), c.dueDays);
      const f = getFinding(db, c.findingId);
      const cid = sendClarification(db, p, { findingId: c.findingId, issue: c.issue, requestedDocs: c.requestedDocs, minimalRef: c.minimalRef, dueAt });
      if (c.suggestionId) {
        const sg = db.prepare("SELECT payload_json FROM assistant_suggestions WHERE id = ?").get(c.suggestionId) as { payload_json: string } | undefined;
        const orig = sg ? (JSON.parse(sg.payload_json) as { issue?: string }).issue ?? null : null;
        settleSuggestion(db, p, c.suggestionId, "clarification_request", c.issue, orig);
      }
      if (f) getAdapters(db).notification.notify({ to_role: "faskes", to_id: f.facility_id, topic: "Permintaan klarifikasi", body: `Ada permintaan klarifikasi ${cid} yang menunggu jawaban Anda sampai ${dueAt.slice(0, 10)}.`, ref_type: "clarification", ref_id: cid });
      return { clarificationId: cid, dueAt };
    }
    case "withdraw_clarification": withdrawClarification(db, p, c.clarificationId, c.reason); return { clarificationId: c.clarificationId };
    case "add_note": return { noteId: addNote(db, p, c.caseId, c.findingId ?? null, c.text) };
    case "link_evidence": return { linkId: linkEvidence(db, p, { findingId: c.findingId, direction: c.direction, evidenceId: c.evidenceId ?? null, documentId: c.documentId ?? null, quote: c.quote ?? null, page: c.page ?? null, note: c.note }) };
    case "record_search": {
      const sid = recordEvidenceSearch(db, p, { findingId: c.findingId, source: c.source, query: c.query, result: c.result, foundRef: c.foundRef ?? null });
      if (c.suggestionId) {
        const sg = db.prepare("SELECT payload_json FROM assistant_suggestions WHERE id = ?").get(c.suggestionId) as { payload_json: string } | undefined;
        const orig = sg ? (JSON.parse(sg.payload_json) as { query?: string }).query ?? null : null;
        settleSuggestion(db, p, c.suggestionId, "evidence_search", c.query, orig);
      }
      return { searchId: sid };
    }
    case "propose_proof": return { proposalId: proposeProof(db, p, c.findingId, c.outcome, c.reason) };
    case "decide_proof": return { status: decideProof(db, p, c.proposalId, c.approve, c.note) };
    case "set_causes": setCauses(db, p, c.findingId, c.causes, c.note); return { findingId: c.findingId };
    case "request_escalation": return { requestId: requestFraudEscalation(db, p, c.findingId, c.reason) };
    case "decide_escalation": approveFraudEscalation(db, p, c.requestId, c.approve, c.note); return { requestId: c.requestId };
    case "reopen_finding": reopenFinding(db, p, c.findingId, c.reason); return { findingId: c.findingId };
    case "claim_review": return { decisionId: recordClaimReview(db, p, c.findingId, c.option, c.reason, c.correction ?? null), simulated: true };
    case "create_action": {
      const actionId = createAction(db, p, { findingId: c.findingId, description: c.description, owner: c.owner, targetDate: c.targetDate, remeasurePlan: c.remeasurePlan });
      const f = getFinding(db, c.findingId);
      if (f) {
        if (p.role === "faskes") notifyAssignee(db, f.case_id, "Rencana tindakan faskes", `Faskes menyusun tindakan perbaikan ${actionId}.`, "action", actionId);
        else getAdapters(db).notification.notify({ to_role: "faskes", to_id: f.facility_id, topic: "Tindakan perbaikan baru", body: `Tindakan perbaikan ${actionId} dibuat untuk temuan ${f.id}.`, ref_type: "action", ref_id: actionId });
      }
      return { actionId };
    }
    case "start_action": startAction(db, p, c.actionId); return { actionId: c.actionId };
    case "resolve_action": {
      resolveAction(db, p, c.actionId, c.result);
      const a = db.prepare("SELECT case_id FROM improvement_actions WHERE id = ?").get(c.actionId) as { case_id: string | null } | undefined;
      if (p.role === "faskes") notifyAssignee(db, a?.case_id ?? null, "Tindakan faskes selesai dikerjakan", `Faskes melaporkan tindakan ${c.actionId} selesai. Tindak lanjut peserta dan pengukuran ulang menanti petugas.`, "action", c.actionId);
      return { actionId: c.actionId };
    }
    case "request_followup": return { followUpIds: requestFollowUp(db, p, c.actionId, c.participantId ?? null, addDays(nowIso(), c.dueDays).slice(0, 10)) };
    case "complete_followup": completeFollowUp(db, p, c.followUpId, c.outcome, c.note); return { followUpId: c.followUpId };
    case "close_case": closeCase(db, p, c.caseId, c.reason); return { caseId: c.caseId };
    case "resolve_dispute": resolveDispute(db, p, c.disputeId, c.decision, c.response); return { disputeId: c.disputeId };
    case "transcribe_document": return { extractionId: transcribeDocument(db, p, c.documentId, c.text) };
    case "review_extraction": reviewExtraction(db, p, c.extractionId, c.action, c.text); return { extractionId: c.extractionId };
    case "correct_summary": correctSummary(db, p, c.summaryId, c.blockId, c.text, c.note); return { summaryId: c.summaryId };
    case "decide_suggestion":
      decideSuggestion(db, p, c.suggestionId, c.decision, { text: c.text, reason: c.reason });
      return { suggestionId: c.suggestionId };
    case "respond_clarification": {
      respondClarification(db, p, c.clarificationId, c.text, c.documentId ?? null);
      const k = db.prepare("SELECT case_id FROM clarifications WHERE id = ?").get(c.clarificationId) as { case_id: string };
      notifyAssignee(db, k.case_id, "Faskes menjawab klarifikasi", `Klarifikasi ${c.clarificationId} dijawab faskes.`, "clarification", c.clarificationId);
      return { clarificationId: c.clarificationId };
    }
    case "create_dispute": return { disputeId: createDispute(db, p, c.findingId, c.text) };
  }
}

/** Perintah dari portal faskes hanya boleh dari daftar perintah faskes; peran lain ditolak sebelum diproses. */
export async function executeFacilityCommand(db: Database.Database, p: Principal, input: unknown, idemKey?: string | null) {
  assertCan(p, "facility.respond");
  const c = facilityCommandZ.parse(input);
  return executeCommand(db, p, c, idemKey);
}

/** Perintah dari konsol hanya boleh dari daftar perintah petugas. */
export async function executeStaffCommand(db: Database.Database, p: Principal, input: unknown, idemKey?: string | null, deps: { live?: LiveSummarizer } = {}) {
  if (p.role === "faskes" || p.role === "peserta" || p.role === "pendamping") throw new DomainError("Perintah ini bukan untuk peran Anda.", 403);
  const c = staffCommandZ.parse(input);
  return executeCommand(db, p, c, idemKey, deps);
}
