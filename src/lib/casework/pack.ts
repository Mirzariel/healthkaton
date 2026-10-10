import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import { SVC } from "../catalog";
import { evidenceCounts, rightOfReplySatisfied, type FindingRow } from "../cases/core";
import { checkServices, parseSignals, type EvidenceState, type Sig, type SignalCtx } from "../cases/signals";
import { json } from "../db";
import { isMetaValue } from "../survey/engine";

/* Paket bukti satu temuan: semua yang diketahui sistem, dengan nomor sumber. Dipakai ruang kasus (tampilan)
   dan penyusun ringkasan (simulasi maupun langsung). Satu sumber kebenaran agar ringkasan tidak mengarang. */

export interface ServiceLine {
  id: string;
  code: string;
  name: string;
  performed_at: string;
  performer: string;
  qty: number;
  amount: number;
  needs_record: boolean;
  state: EvidenceState;
  reasons: string[];
  flagged: boolean;
}
export interface RecordRow { id: string; service_id: string | null; type: string; recorded_at: string; performer: string; summary: string }
export interface FactRow {
  id: string; session_id: string; stage: string; slot: string; subject: string | null; value: string; status: string; origin: string;
  quote: string | null; respondent_role: string; created_at: string; supersedes_id: string | null; meta: boolean;
}
export interface RequestRow { id: string; category: string; text: string; created_at: string; status: string }
export interface ClarificationRow {
  id: string; status: "sent" | "answered" | "lapsed" | "withdrawn"; issue: string; requested_docs: string[]; minimal_ref: string | null; due_at: string; sent_at: string;
  sent_by: string; answered_at: string | null; response_text: string | null; lapsed_at: string | null;
  messages: { author_role: string; author_id: string; text: string; document_id: string | null; at: string }[];
}
export interface LinkRow {
  id: string; direction: "supports" | "contradicts" | "neutral"; evidence_id: string | null; document_id: string | null; quote: string | null; page: number | null; note: string | null; linked_by: string; linked_at: string;
}
export interface DocRow { id: string; name: string; kind: string; mime: string; size: number; processing_status: string; clarification_id: string | null; created_at: string; uploaded_role: string; extraction: { id: string; status: string; engine: string; excerpt: string } | null }
export interface SearchRow { id: number; source: string; query: string; result: string; found_ref: string | null; at: string; actor: string }
export interface IndicatorInfo {
  version_id: string; indicator_id: string; title: string; stage: string; kind: string; locator: string | null;
  standard_version_id: string; standard_id: string; standard_name: string; standard_version: string; standard_status: string;
  source: { id: string; title: string; publisher: string | null; validation_status: string; validation_owner: string | null; url: string | null } | null;
}

export interface EvidencePack {
  finding: Pick<FindingRow, "id" | "case_id" | "type" | "source" | "title" | "summary" | "limit_text" | "score" | "tier" | "proof_status" | "indicator_id" | "claim_id" | "related_claim_id" | "service_id" | "episode_id" | "facility_id" | "signal_active">;
  signals: Sig[];
  episode: { id: string; kind: string; admit_at: string; discharge_at: string; dx_text: string | null; hospital: string | null; context: Record<string, unknown> };
  claim: { id: string; claim_no: string; amount: number; status: string; group_code: string | null; submitted_at: string | null; paid_at: string | null } | null;
  related: { id: string; claim_no: string; amount: number; status: string; group_code: string | null; episode_id: string } | null;
  services: ServiceLine[];
  records: RecordRow[];
  facts: FactRow[];
  requests: RequestRow[];
  clarifications: ClarificationRow[];
  links: LinkRow[];
  documents: DocRow[];
  searches: SearchRow[];
  indicator: IndicatorInfo | null;
  readiness: { supports: number; contradicts: number; neutral: number; replySatisfied: boolean; replyReason: string };
}

/** Konteks minimal bagi checkServices (hanya satu episode). */
function miniCtx(db: Database.Database, episodeId: string, claimId: string | null): SignalCtx {
  const ep = db.prepare("SELECT id, participant_id, facility_id, kind, admit_at, discharge_at, dx_code, group_code FROM episodes WHERE id = ?").get(episodeId) as never;
  const services = db.prepare("SELECT id, episode_id, code, name, performed_at, performer, qty, amount FROM services WHERE episode_id = ?").all(episodeId) as never[];
  const evidence = db.prepare("SELECT id, episode_id, service_id, type, recorded_at, performer FROM evidence WHERE episode_id = ?").all(episodeId) as never[];
  const claimServices = new Map<string, never[]>();
  if (claimId) {
    const rows = db.prepare("SELECT s.id, s.episode_id, s.code, s.name, s.performed_at, s.performer, s.qty, s.amount FROM claim_items ci JOIN services s ON s.id = ci.service_id WHERE ci.claim_id = ?").all(claimId) as never[];
    claimServices.set(claimId, rows);
  }
  return {
    ep: new Map([[episodeId, ep]]),
    servicesByEpisode: new Map([[episodeId, services]]),
    evidenceByEpisode: new Map([[episodeId, evidence]]),
    claimServices,
  } as unknown as SignalCtx;
}

export function resolveIndicator(db: Database.Database, indicatorId: string | null): IndicatorInfo | null {
  if (!indicatorId) return null;
  const r = db.prepare(
    `SELECT i.id version_id, i.indicator_id, i.title, i.stage, i.kind, i.locator, i.standard_version_id, sv.standard_id, st.name standard_name, sv.version standard_version, sv.status standard_status, i.source_id
     FROM indicator_versions i JOIN standard_versions sv ON sv.id = i.standard_version_id JOIN standards st ON st.id = sv.standard_id
     WHERE i.id = ? OR i.indicator_id = ? ORDER BY CASE WHEN i.id = ? THEN 0 ELSE 1 END, i.version DESC LIMIT 1`,
  ).get(indicatorId, indicatorId, indicatorId) as (Omit<IndicatorInfo, "source"> & { source_id: string | null }) | undefined;
  if (!r) return null;
  const src = r.source_id ? (db.prepare("SELECT id, title, publisher, validation_status, validation_owner, url FROM source_documents WHERE id = ?").get(r.source_id) as IndicatorInfo["source"]) : null;
  const { source_id: _s, ...rest } = r;
  void _s;
  return { ...rest, source: src ?? null };
}

export function buildPack(db: Database.Database, f: FindingRow): EvidencePack {
  const ep = db.prepare("SELECT id, kind, admit_at, discharge_at, dx_text, hospital, context_json FROM episodes WHERE id = ?").get(f.episode_id) as { id: string; kind: string; admit_at: string; discharge_at: string; dx_text: string | null; hospital: string | null; context_json: string };
  const claimRow = f.claim_id ? (db.prepare("SELECT id, claim_no, amount, status, group_code, submitted_at, paid_at FROM claims WHERE id = ?").get(f.claim_id) as EvidencePack["claim"]) : null;
  const related = f.related_claim_id ? (db.prepare("SELECT id, claim_no, amount, status, group_code, episode_id FROM claims WHERE id = ?").get(f.related_claim_id) as EvidencePack["related"]) : null;

  const ctx = miniCtx(db, f.episode_id, f.claim_id);
  const checks = claimRow
    ? checkServices(ctx, { id: claimRow.id, claim_no: claimRow.claim_no, episode_id: f.episode_id, facility_id: f.facility_id, group_code: claimRow.group_code ?? "", amount: claimRow.amount, status: claimRow.status, submitted_at: claimRow.submitted_at, paid_at: claimRow.paid_at })
    : [];
  const svcRows = (claimRow
    ? db.prepare("SELECT s.id, s.code, s.name, s.performed_at, s.performer, s.qty, ci.amount amount FROM claim_items ci JOIN services s ON s.id = ci.service_id WHERE ci.claim_id = ? ORDER BY s.performed_at").all(claimRow.id)
    : db.prepare("SELECT id, code, name, performed_at, performer, qty, amount FROM services WHERE episode_id = ? ORDER BY performed_at").all(f.episode_id)) as { id: string; code: string; name: string; performed_at: string; performer: string; qty: number; amount: number }[];
  const services: ServiceLine[] = svcRows.map((s) => {
    const c = checks.find((x) => x.service_id === s.id);
    return { ...s, needs_record: !!SVC[s.code]?.needsRecord, state: c?.state ?? "tersedia", reasons: c?.reasons ?? [], flagged: !!c && c.state !== "tersedia" };
  });
  const records = db.prepare("SELECT id, service_id, type, recorded_at, performer, summary FROM evidence WHERE episode_id = ? ORDER BY recorded_at").all(f.episode_id) as RecordRow[];

  const facts = (db.prepare(
    `SELECT pf.id, pf.session_id, s.stage, pf.slot, pf.subject, pf.value, pf.status, pf.origin, pf.source_quote quote, s.respondent_role, pf.created_at, pf.supersedes_id
     FROM participant_facts pf JOIN survey_sessions s ON s.id = pf.session_id WHERE s.episode_id = ? AND s.is_sandbox = 0 ORDER BY pf.created_at, pf.id`,
  ).all(f.episode_id) as Omit<FactRow, "meta">[]).map((x) => ({ ...x, meta: isMetaValue(x.value) }));
  const requests = db.prepare("SELECT id, category, text, created_at, status FROM service_requests WHERE finding_id = ? OR case_id = ? ORDER BY created_at").all(f.id, f.case_id) as RequestRow[];

  const clarRaw = db.prepare("SELECT * FROM clarifications WHERE finding_id = ? ORDER BY sent_at, id").all(f.id) as (Omit<ClarificationRow, "requested_docs" | "messages"> & { requested_docs_json: string })[];
  const clarifications: ClarificationRow[] = clarRaw.map((c) => ({
    id: c.id, status: c.status, issue: c.issue, requested_docs: json<string[]>(c.requested_docs_json, []), minimal_ref: c.minimal_ref, due_at: c.due_at, sent_at: c.sent_at, sent_by: c.sent_by,
    answered_at: c.answered_at, response_text: c.response_text, lapsed_at: c.lapsed_at,
    messages: db.prepare("SELECT author_role, author_id, text, document_id, at FROM clarification_messages WHERE clarification_id = ? ORDER BY id").all(c.id) as ClarificationRow["messages"],
  }));
  const links = db.prepare("SELECT id, direction, evidence_id, document_id, quote, page, note, linked_by, linked_at FROM evidence_links WHERE finding_id = ? ORDER BY linked_at, id").all(f.id) as LinkRow[];
  const docs = db.prepare("SELECT id, name, kind, mime, size, processing_status, clarification_id, created_at, uploaded_role FROM documents WHERE finding_id = ? OR case_id = ? ORDER BY created_at, id").all(f.id, f.case_id) as Omit<DocRow, "extraction">[];
  const documents: DocRow[] = docs.map((d) => {
    const x = db.prepare("SELECT id, status, engine, text FROM extractions WHERE document_id = ? ORDER BY created_at LIMIT 1").get(d.id) as { id: string; status: string; engine: string; text: string } | undefined;
    return { ...d, extraction: x ? { id: x.id, status: x.status, engine: x.engine, excerpt: x.text.slice(0, 400) } : null };
  });
  const searches = db.prepare("SELECT id, source, query, result, found_ref, at, actor FROM evidence_searches WHERE finding_id = ? OR (claim_id IS NOT NULL AND claim_id = ?) ORDER BY at, id").all(f.id, f.claim_id) as SearchRow[];
  const counts = evidenceCounts(db, f.id);
  const rr = rightOfReplySatisfied(db, f.id);
  return {
    finding: f,
    signals: parseSignals(f.signals_json),
    episode: { id: ep.id, kind: ep.kind, admit_at: ep.admit_at, discharge_at: ep.discharge_at, dx_text: ep.dx_text, hospital: ep.hospital, context: json<Record<string, unknown>>(ep.context_json, {}) },
    claim: claimRow,
    related,
    services,
    records,
    facts,
    requests,
    clarifications,
    links,
    documents,
    searches,
    indicator: resolveIndicator(db, f.indicator_id),
    readiness: { ...counts, replySatisfied: rr.satisfied, replyReason: rr.reason },
  };
}

/** Sidik jari isi paket, untuk mendeteksi ringkasan yang sudah kedaluwarsa karena bukti berubah. */
export function packFingerprint(pack: EvidencePack): string {
  const core = {
    s: pack.finding.proof_status, sc: pack.finding.score,
    f: pack.facts.map((x) => [x.id, x.status]),
    c: pack.clarifications.map((c) => [c.id, c.status, c.messages.length]),
    l: pack.links.map((l) => l.id),
    d: pack.documents.map((d) => [d.id, d.processing_status, d.extraction?.status ?? null]),
    q: pack.searches.map((s) => s.id),
    r: pack.requests.map((r) => r.id),
    v: pack.services.map((s) => [s.id, s.state]),
  };
  return createHash("sha256").update(JSON.stringify(core)).digest("hex").slice(0, 16);
}
