import type Database from "better-sqlite3";
import { z } from "zod";
import { appendAudit, sha256 } from "../audit";
import { nowIso } from "../clock";
import { json } from "../db";
import { AuthError, assertCan, can, type Principal } from "../auth/principal";
import { validateRule } from "./applicability";
import { GLOSSARY_SEEDS, INDICATOR_SEEDS, SOURCES, STANDARD_SEEDS, STANDARD_VERSION_SEEDS, slotDef } from "./bank";
import type { IndicatorVersionRow, QuestionRow, StageKey, StandardStatus } from "./types";

/* ---------- Seed ---------- */
export function seedStandards(db: Database.Database, at: string = nowIso()) {
  db.transaction(() => {
    const src = db.prepare(
      "INSERT OR REPLACE INTO source_documents (id, kind, title, publisher, url, file_name, doc_date, accessed_at, version, locator_note, scope, relevance, validation_status, validation_owner, notes) VALUES (@id,@kind,@title,@publisher,@url,@file_name,@doc_date,@accessed_at,@version,@locator_note,@scope,@relevance,@validation_status,@validation_owner,@notes)",
    );
    for (const s of SOURCES) src.run(s);
    for (const s of STANDARD_SEEDS) db.prepare("INSERT OR REPLACE INTO standards (id, name, owner) VALUES (?,?,?)").run(s.id, s.name, s.owner);
    for (const v of STANDARD_VERSION_SEEDS) {
      db.prepare("INSERT OR REPLACE INTO standard_versions (id, standard_id, version, status, scope_json, source_ids_json, notes, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)")
        .run(v.id, v.standard_id, v.version, v.status, JSON.stringify(v.scope), JSON.stringify(v.sources), v.notes, "tim-sehati", at);
      db.prepare("INSERT INTO approval_history (object_type, object_id, from_status, to_status, actor, role, note, at) VALUES ('standard_version',?,NULL,?,?,?,?,?)")
        .run(v.id, v.status, "tim-sehati", "admin", "Draf awal dari L1/L2/L3 dan master prompt.", at);
    }
    const insInd = db.prepare(
      "INSERT OR REPLACE INTO indicator_versions (id, indicator_id, version, standard_version_id, title, description, kind, stage, scope_json, applicability_json, required_slots_json, conditional_rules_json, slots_json, signal_rules_json, observable_by_patient, source_id, locator) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    );
    const insQ = db.prepare(
      "INSERT OR REPLACE INTO question_versions (id, indicator_version_id, version, target_slot, text, answer_type, options_json, helper, is_core, ord) VALUES (?,?,?,?,?,?,?,?,?,?)",
    );
    for (const i of INDICATOR_SEEDS) {
      const version = i.version ?? "draft-1";
      const id = `${i.indicator_id}:${version}`;
      insInd.run(
        id, i.indicator_id, version, i.standard, i.title, i.description ?? null, i.kind, i.stage, JSON.stringify(i.scope), i.applicability ? JSON.stringify(i.applicability) : null,
        JSON.stringify(i.required), JSON.stringify(i.conditional ?? []), JSON.stringify(i.slots.map(slotDef)), JSON.stringify(i.signal ?? []), i.observable === false ? 0 : 1, i.source, i.locator,
      );
      for (const q of i.questions) {
        insQ.run(q.id, id, 1, q.slot, q.text, "choice", JSON.stringify(q.options ?? defaultOptions(i, q.slot)), q.helper ?? null, q.core === false ? 0 : 1, q.ord ?? 0);
      }
    }
    for (const g of GLOSSARY_SEEDS) db.prepare("INSERT OR REPLACE INTO glossary (term, plain) VALUES (?,?)").run(g.term, g.plain);
  })();
}

function defaultOptions(i: (typeof INDICATOR_SEEDS)[number], slot: string) {
  const s = i.slots.find((x) => x.id === slot);
  const vals = s?.values ?? ["yes", "no"];
  if (vals.length === 2 && vals.includes("yes")) {
    return [
      { value: "yes", label: "Ya" },
      { value: "no", label: "Tidak" },
      { value: "unknown", label: "Saya lupa / tidak yakin" },
      { value: "not_understood", label: "Saya tidak paham pertanyaannya" },
    ];
  }
  return [
    ...vals.map((v) => ({ value: v, label: s?.valueLabels?.[v] ?? v })),
    { value: "unknown", label: "Saya lupa / tidak yakin" },
    { value: "not_understood", label: "Saya tidak paham pertanyaannya" },
  ];
}

/* ---------- Pembacaan ---------- */
type IndRaw = Record<string, unknown> & { id: string };
export function rowToIndicator(r: IndRaw): IndicatorVersionRow {
  return {
    id: r.id,
    indicator_id: r.indicator_id as string,
    version: r.version as string,
    standard_version_id: r.standard_version_id as string,
    title: r.title as string,
    description: (r.description as string) ?? null,
    kind: r.kind as IndicatorVersionRow["kind"],
    stage: r.stage as StageKey,
    scope: json<string[]>(r.scope_json as string, []),
    applicability: json(r.applicability_json as string, null),
    required_slots: json<string[]>(r.required_slots_json as string, []),
    conditional_rules: json(r.conditional_rules_json as string, []),
    slots: json(r.slots_json as string, []),
    signal_rules: json(r.signal_rules_json as string, []),
    observable_by_patient: !!r.observable_by_patient,
    source_id: (r.source_id as string) ?? null,
    locator: (r.locator as string) ?? null,
  };
}
export function rowToQuestion(r: Record<string, unknown>): QuestionRow {
  return {
    id: r.id as string,
    indicator_version_id: r.indicator_version_id as string,
    version: r.version as number,
    target_slot: r.target_slot as string,
    text: r.text as string,
    answer_type: r.answer_type as "choice" | "free",
    options: json(r.options_json as string, []),
    helper: (r.helper as string) ?? null,
    is_core: !!r.is_core,
    ord: r.ord as number,
  };
}

export interface StandardVersionView {
  id: string;
  standard_id: string;
  standard_name: string;
  version: string;
  status: StandardStatus;
  scope: string[];
  source_ids: string[];
  notes: string | null;
  created_by: string | null;
  created_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
}

export function listStandardVersions(db: Database.Database): StandardVersionView[] {
  const rows = db.prepare("SELECT v.*, s.name AS standard_name FROM standard_versions v JOIN standards s ON s.id = v.standard_id ORDER BY v.standard_id, v.created_at, v.version").all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as string, standard_id: r.standard_id as string, standard_name: r.standard_name as string, version: r.version as string, status: r.status as StandardStatus,
    scope: json<string[]>(r.scope_json as string, []), source_ids: json<string[]>(r.source_ids_json as string, []), notes: (r.notes as string) ?? null,
    created_by: (r.created_by as string) ?? null, created_at: (r.created_at as string) ?? null, reviewed_by: (r.reviewed_by as string) ?? null, reviewed_at: (r.reviewed_at as string) ?? null,
    approved_by: (r.approved_by as string) ?? null, approved_at: (r.approved_at as string) ?? null,
  }));
}

export function getStandardVersion(db: Database.Database, id: string) {
  const v = listStandardVersions(db).find((x) => x.id === id);
  if (!v) return null;
  const indicators = (db.prepare("SELECT * FROM indicator_versions WHERE standard_version_id = ? ORDER BY stage, indicator_id").all(id) as IndRaw[]).map(rowToIndicator);
  const questions = (db.prepare("SELECT q.* FROM question_versions q JOIN indicator_versions i ON i.id = q.indicator_version_id WHERE i.standard_version_id = ? ORDER BY q.indicator_version_id, q.ord").all(id) as Record<string, unknown>[]).map(rowToQuestion);
  const history = db.prepare("SELECT * FROM approval_history WHERE object_type = 'standard_version' AND object_id = ? ORDER BY id").all(id) as Record<string, unknown>[];
  return { version: v, indicators, questions, history };
}

export function getIndicator(db: Database.Database, id: string): IndicatorVersionRow | null {
  const r = db.prepare("SELECT * FROM indicator_versions WHERE id = ?").get(id) as IndRaw | undefined;
  return r ? rowToIndicator(r) : null;
}

export function listSources(db: Database.Database) {
  return db.prepare("SELECT * FROM source_documents ORDER BY CASE kind WHEN 'internal' THEN 0 WHEN 'sop_local' THEN 1 WHEN 'regulation' THEN 2 ELSE 3 END, id").all() as (Omit<typeof SOURCES[number], "kind"> & { kind: string })[];
}

/** Indikator + pertanyaan yang dapat dipakai sesi: butir dari versi standar non-retired. */
export function loadBank(db: Database.Database, opts: { stages?: StageKey[]; allowDraft?: boolean; versionIds?: string[] } = {}) {
  const allowed: StandardStatus[] = opts.allowDraft === false ? ["reviewed", "approved"] : ["draft", "reviewed", "approved"];
  const sv = (db.prepare("SELECT id, status FROM standard_versions").all() as { id: string; status: StandardStatus }[]).filter((s) => allowed.includes(s.status)).map((s) => s.id);
  let inds = (db.prepare("SELECT * FROM indicator_versions").all() as IndRaw[]).map(rowToIndicator).filter((i) => sv.includes(i.standard_version_id));
  if (opts.stages) inds = inds.filter((i) => opts.stages!.includes(i.stage));
  if (opts.versionIds) inds = inds.filter((i) => opts.versionIds!.includes(i.id));
  const ids = new Set(inds.map((i) => i.id));
  const questions = (db.prepare("SELECT * FROM question_versions ORDER BY ord").all() as Record<string, unknown>[]).map(rowToQuestion).filter((q) => ids.has(q.indicator_version_id));
  return { indicators: inds, questions };
}

export function glossaryMap(db: Database.Database) {
  return Object.fromEntries((db.prepare("SELECT term, plain FROM glossary").all() as { term: string; plain: string }[]).map((g) => [g.term, g.plain]));
}

/* ---------- Validasi butir (editor/impor) ---------- */
const slotZ = z.strictObject({ id: z.string().regex(/^[a-z][a-z0-9_]*$/), label: z.string().min(2), values: z.array(z.string().min(1)).min(1), valueLabels: z.record(z.string(), z.string()).optional() });
const condZ = z.strictObject({
  when: z.strictObject({ slot: z.string(), operator: z.enum(["eq", "neq", "in", "nin", "exists", "gt", "lt"]), value: z.string().optional(), values: z.array(z.string()).optional() }),
  require: z.array(z.string()).min(1),
});
const questionZ = z.strictObject({
  id: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  slot: z.string(),
  text: z.string().min(8).max(240),
  core: z.boolean().optional(),
  ord: z.number().int().optional(),
  options: z.array(z.strictObject({ value: z.string(), label: z.string() })).optional(),
  helper: z.string().optional(),
});
export const indicatorImportZ = z.strictObject({
  indicator_id: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  version: z.string().min(1).optional(),
  title: z.string().min(4),
  description: z.string().optional(),
  kind: z.enum(["existence", "communication", "quality", "cost", "administrative"]),
  stage: z.enum(["pre", "intra", "post", "directed"]),
  scope: z.array(z.string()),
  applicability: z.any().optional(),
  required_slots: z.array(z.string()).min(1),
  conditional_rules: z.array(condZ).optional(),
  slots: z.array(slotZ).min(1),
  signal_rules: z.array(z.strictObject({ when: condZ.shape.when, category: z.string(), note: z.string() })).optional(),
  observable_by_patient: z.boolean(),
  source_id: z.string().nullable().optional(),
  locator: z.string().nullable().optional(),
  questions: z.array(questionZ).min(1),
});
export const standardImportZ = z.strictObject({
  standard_id: z.string().regex(/^STD-[A-Z0-9-]+$/),
  name: z.string().min(4),
  version: z.string().min(1),
  scope: z.array(z.string()),
  source_ids: z.array(z.string()).optional(),
  notes: z.string().optional(),
  indicators: z.array(indicatorImportZ).min(1),
});
export type StandardImport = z.infer<typeof standardImportZ>;

export interface ValidationIssue {
  level: "error" | "warning";
  where: string;
  message: string;
}

export function validateIndicatorSemantics(i: z.infer<typeof indicatorImportZ>, knownSources: Set<string>): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const where = i.indicator_id;
  const slotIds = new Set(i.slots.map((s) => s.id));
  for (const r of i.required_slots) if (!slotIds.has(r)) out.push({ level: "error", where, message: `required_slots menyebut slot "${r}" yang tidak didefinisikan.` });
  for (const c of i.conditional_rules ?? []) {
    if (!slotIds.has(c.when.slot)) out.push({ level: "error", where, message: `aturan cabang memakai slot "${c.when.slot}" yang tidak didefinisikan.` });
    for (const r of c.require) if (!slotIds.has(r)) out.push({ level: "error", where, message: `aturan cabang mewajibkan slot "${r}" yang tidak didefinisikan.` });
  }
  for (const e of validateRule(i.applicability, `${where}.applicability`)) out.push({ level: "error", where, message: e });
  const qSlots = new Set(i.questions.map((q) => q.slot));
  for (const q of i.questions) {
    if (!slotIds.has(q.slot)) out.push({ level: "error", where: q.id, message: `pertanyaan menarget slot "${q.slot}" yang tidak didefinisikan.` });
    if (/\bdan apakah\b|\?.*\?/i.test(q.text)) out.push({ level: "error", where: q.id, message: "satu pertanyaan harus mengukur satu fakta (ditemukan dua pertanyaan dalam satu kalimat)." });
    if (q.text.length > 200) out.push({ level: "warning", where: q.id, message: "kalimat panjang; ringkas agar mudah dipahami." });
  }
  for (const r of [...i.required_slots, ...(i.conditional_rules ?? []).flatMap((c) => c.require)]) {
    if (!qSlots.has(r)) out.push({ level: "warning", where, message: `slot wajib "${r}" belum punya pertanyaan; hanya dapat terisi dari jawaban bebas.` });
  }
  if (!i.source_id) out.push({ level: "warning", where, message: "butir tanpa sumber: tidak dapat disetujui sebagai dasar standar (kecuali butir penutup internal)." });
  else if (!knownSources.has(i.source_id)) out.push({ level: "error", where, message: `sumber "${i.source_id}" tidak ada di registry sumber.` });
  if (!i.locator) out.push({ level: "warning", where, message: "locator (halaman/butir) belum diisi: status menunggu validasi." });
  if (i.stage !== "directed" && i.scope.length === 0) out.push({ level: "warning", where, message: "cakupan kosong berarti berlaku untuk semua jenis faskes." });
  return out;
}

export function validateStandardImport(db: Database.Database, raw: unknown): { ok: boolean; data?: StandardImport; issues: ValidationIssue[] } {
  const parsed = standardImportZ.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.slice(0, 40).map((e) => ({ level: "error" as const, where: e.path.join(".") || "(akar)", message: e.message })) };
  }
  const known = new Set((db.prepare("SELECT id FROM source_documents").all() as { id: string }[]).map((r) => r.id));
  const issues = parsed.data.indicators.flatMap((i) => validateIndicatorSemantics(i, known));
  return { ok: !issues.some((i) => i.level === "error"), data: parsed.data, issues };
}

/* ---------- Penulisan (draft saja) ---------- */
function mustDraft(db: Database.Database, standardVersionId: string) {
  const v = db.prepare("SELECT status FROM standard_versions WHERE id = ?").get(standardVersionId) as { status: StandardStatus } | undefined;
  if (!v) throw new AuthError("Versi standar tidak ditemukan.", 403);
  if (v.status !== "draft") throw new RegistryError("Versi yang sudah ditinjau/disetujui tidak boleh diubah. Buat versi draft baru.", 409);
}

export class RegistryError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** Impor JSON standar sebagai versi DRAFT baru. Idempoten: konten yang sama tidak membuat versi ganda. */
export function applyStandardImport(db: Database.Database, p: Principal, data: StandardImport) {
  assertCan(p, "standards.edit");
  const id = `${data.standard_id}@${data.version}`;
  const existing = db.prepare("SELECT id FROM standard_versions WHERE id = ?").get(id);
  const hash = sha256(JSON.stringify(data));
  if (existing) {
    const prev = db.prepare("SELECT value FROM meta WHERE key = ?").get(`stdimport:${id}`) as { value: string } | undefined;
    if (prev?.value === hash) return { id, created: false, note: "Konten identik sudah ada; tidak ada perubahan." };
    throw new RegistryError(`Versi ${id} sudah ada dengan isi berbeda. Gunakan nomor versi baru.`, 409);
  }
  const at = nowIso();
  db.transaction(() => {
    db.prepare("INSERT OR IGNORE INTO standards (id, name, owner) VALUES (?,?,?)").run(data.standard_id, data.name, p.name);
    db.prepare("INSERT INTO standard_versions (id, standard_id, version, status, scope_json, source_ids_json, notes, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)")
      .run(id, data.standard_id, data.version, "draft", JSON.stringify(data.scope), JSON.stringify(data.source_ids ?? []), data.notes ?? null, p.id, at);
    for (const i of data.indicators) writeIndicator(db, id, i);
    db.prepare("INSERT INTO approval_history (object_type, object_id, from_status, to_status, actor, role, note, at) VALUES ('standard_version',?,NULL,'draft',?,?,?,?)").run(id, p.id, p.role, "Impor JSON", at);
    db.prepare("INSERT INTO meta (key, value) VALUES (?, ?)").run(`stdimport:${id}`, hash);
    appendAudit(db, { actor: p.id, actor_role: p.role, action: "standar_diimpor", entity: "standard_version", entity_id: id, detail: { indikator: data.indicators.length } });
  })();
  return { id, created: true, note: "Dibuat sebagai draft." };
}

function writeIndicator(db: Database.Database, standardVersionId: string, i: z.infer<typeof indicatorImportZ>) {
  const version = i.version ?? standardVersionId.split("@")[1];
  const id = `${i.indicator_id}:${version}`;
  db.prepare(
    "INSERT OR REPLACE INTO indicator_versions (id, indicator_id, version, standard_version_id, title, description, kind, stage, scope_json, applicability_json, required_slots_json, conditional_rules_json, slots_json, signal_rules_json, observable_by_patient, source_id, locator) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run(
    id, i.indicator_id, version, standardVersionId, i.title, i.description ?? null, i.kind, i.stage, JSON.stringify(i.scope), i.applicability ? JSON.stringify(i.applicability) : null,
    JSON.stringify(i.required_slots), JSON.stringify(i.conditional_rules ?? []), JSON.stringify(i.slots), JSON.stringify(i.signal_rules ?? []), i.observable_by_patient ? 1 : 0, i.source_id ?? null, i.locator ?? null,
  );
  db.prepare("DELETE FROM question_versions WHERE indicator_version_id = ?").run(id);
  for (const q of i.questions) {
    const opts = q.options ?? defaultOptions({ slots: i.slots } as never, q.slot);
    db.prepare("INSERT INTO question_versions (id, indicator_version_id, version, target_slot, text, answer_type, options_json, helper, is_core, ord) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(q.id, id, 1, q.slot, q.text, "choice", JSON.stringify(opts), q.helper ?? null, q.core === false ? 0 : 1, q.ord ?? 0);
  }
}

/** Salin versi yang sudah ditinjau/disetujui menjadi draft baru (versi lama tidak berubah). */
export function createDraftFrom(db: Database.Database, p: Principal, fromId: string, newVersion: string) {
  assertCan(p, "standards.edit");
  const src = getStandardVersion(db, fromId);
  if (!src) throw new RegistryError("Versi sumber tidak ditemukan.", 404);
  const id = `${src.version.standard_id}@${newVersion}`;
  if (db.prepare("SELECT 1 FROM standard_versions WHERE id = ?").get(id)) throw new RegistryError(`Versi ${id} sudah ada.`, 409);
  const at = nowIso();
  db.transaction(() => {
    db.prepare("INSERT INTO standard_versions (id, standard_id, version, status, scope_json, source_ids_json, notes, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)")
      .run(id, src.version.standard_id, newVersion, "draft", JSON.stringify(src.version.scope), JSON.stringify(src.version.source_ids), `Salinan dari ${fromId}`, p.id, at);
    for (const ind of src.indicators) {
      const nid = `${ind.indicator_id}:${newVersion}`;
      db.prepare(
        "INSERT INTO indicator_versions (id, indicator_id, version, standard_version_id, title, description, kind, stage, scope_json, applicability_json, required_slots_json, conditional_rules_json, slots_json, signal_rules_json, observable_by_patient, source_id, locator) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ).run(nid, ind.indicator_id, newVersion, id, ind.title, ind.description, ind.kind, ind.stage, JSON.stringify(ind.scope), ind.applicability ? JSON.stringify(ind.applicability) : null, JSON.stringify(ind.required_slots), JSON.stringify(ind.conditional_rules), JSON.stringify(ind.slots), JSON.stringify(ind.signal_rules), ind.observable_by_patient ? 1 : 0, ind.source_id, ind.locator);
      for (const q of src.questions.filter((x) => x.indicator_version_id === ind.id)) {
        // ID pertanyaan dibawa serta; versi lama tetap utuh karena ID unik per (id) — pakai akhiran versi bila bentrok
        const qid = db.prepare("SELECT 1 FROM question_versions WHERE id = ?").get(q.id) ? `${q.id}_${newVersion.replace(/[^A-Za-z0-9]/g, "")}` : q.id;
        db.prepare("INSERT INTO question_versions (id, indicator_version_id, version, target_slot, text, answer_type, options_json, helper, is_core, ord) VALUES (?,?,?,?,?,?,?,?,?,?)")
          .run(qid, nid, q.version + 1, q.target_slot, q.text, q.answer_type, JSON.stringify(q.options), q.helper, q.is_core ? 1 : 0, q.ord);
      }
    }
    db.prepare("INSERT INTO approval_history (object_type, object_id, from_status, to_status, actor, role, note, at) VALUES ('standard_version',?,NULL,'draft',?,?,?,?)").run(id, p.id, p.role, `Salinan dari ${fromId}`, at);
    appendAudit(db, { actor: p.id, actor_role: p.role, action: "standar_draft_dibuat", entity: "standard_version", entity_id: id, detail: { dari: fromId } });
  })();
  return id;
}

export function updateQuestionText(db: Database.Database, p: Principal, questionId: string, text: string) {
  assertCan(p, "standards.edit");
  const q = db.prepare("SELECT q.id, i.standard_version_id, q.text FROM question_versions q JOIN indicator_versions i ON i.id = q.indicator_version_id WHERE q.id = ?").get(questionId) as { id: string; standard_version_id: string; text: string } | undefined;
  if (!q) throw new RegistryError("Pertanyaan tidak ditemukan.", 404);
  mustDraft(db, q.standard_version_id);
  const t = text.trim();
  if (t.length < 8 || t.length > 240) throw new RegistryError("Kalimat pertanyaan harus 8-240 karakter.");
  if (/\bdan apakah\b|\?.*\?/i.test(t)) throw new RegistryError("Satu pertanyaan harus mengukur satu fakta.");
  db.prepare("UPDATE question_versions SET text = ?, clinical_reviewed_by = NULL, clinical_reviewed_at = NULL WHERE id = ?").run(t, questionId);
  appendAudit(db, { actor: p.id, actor_role: p.role, action: "pertanyaan_diubah", entity: "question", entity_id: questionId, detail: { standar: q.standard_version_id } });
}

export function updateIndicatorMeta(db: Database.Database, p: Principal, indicatorVersionId: string, patch: { title?: string; locator?: string | null; source_id?: string | null; scope?: string[] }) {
  assertCan(p, "standards.edit");
  const i = getIndicator(db, indicatorVersionId);
  if (!i) throw new RegistryError("Butir tidak ditemukan.", 404);
  mustDraft(db, i.standard_version_id);
  if (patch.source_id) {
    if (!db.prepare("SELECT 1 FROM source_documents WHERE id = ?").get(patch.source_id)) throw new RegistryError("Sumber tidak ada di registry.");
  }
  db.prepare("UPDATE indicator_versions SET title = ?, locator = ?, source_id = ?, scope_json = ? WHERE id = ?").run(
    patch.title?.trim() || i.title, patch.locator === undefined ? i.locator : patch.locator, patch.source_id === undefined ? i.source_id : patch.source_id, JSON.stringify(patch.scope ?? i.scope), indicatorVersionId,
  );
  appendAudit(db, { actor: p.id, actor_role: p.role, action: "butir_diubah", entity: "indicator_version", entity_id: indicatorVersionId, detail: { bidang: Object.keys(patch) } });
}

/* ---------- Alur status: draft → reviewed → approved → retired ---------- */
export function standardIssues(db: Database.Database, id: string): ValidationIssue[] {
  const v = getStandardVersion(db, id);
  if (!v) return [{ level: "error", where: id, message: "versi tidak ditemukan" }];
  const known = new Set((db.prepare("SELECT id FROM source_documents").all() as { id: string }[]).map((r) => r.id));
  return v.indicators.flatMap((i) =>
    validateIndicatorSemantics(
      {
        indicator_id: i.indicator_id, version: i.version, title: i.title, description: i.description ?? undefined, kind: i.kind, stage: i.stage, scope: i.scope, applicability: i.applicability,
        required_slots: i.required_slots, conditional_rules: i.conditional_rules as never, slots: i.slots as never, signal_rules: i.signal_rules as never, observable_by_patient: i.observable_by_patient,
        source_id: i.source_id, locator: i.locator,
        questions: v.questions.filter((q) => q.indicator_version_id === i.id).map((q) => ({ id: q.id, slot: q.target_slot, text: q.text, core: q.is_core, ord: q.ord, options: q.options, helper: q.helper ?? undefined })),
      },
      known,
    ),
  );
}

const TRANSITIONS: Record<string, { to: StandardStatus; cap: "standards.review" | "standards.approve" | "standards.edit" }[]> = {
  draft: [{ to: "reviewed", cap: "standards.review" }],
  reviewed: [{ to: "approved", cap: "standards.approve" }, { to: "draft", cap: "standards.review" }],
  approved: [{ to: "retired", cap: "standards.approve" }],
  retired: [],
};

export function transitionStandard(db: Database.Database, p: Principal, id: string, to: StandardStatus, note: string) {
  const v = db.prepare("SELECT status FROM standard_versions WHERE id = ?").get(id) as { status: StandardStatus } | undefined;
  if (!v) throw new RegistryError("Versi standar tidak ditemukan.", 404);
  const rule = (TRANSITIONS[v.status] ?? []).find((t) => t.to === to);
  if (!rule) throw new RegistryError(`Transisi ${v.status} → ${to} tidak diizinkan.`, 409);
  if (!can(p, rule.cap)) throw new AuthError(`Peran ${p.role} tidak berwenang untuk transisi ini.`);
  if (to !== "draft" && note.trim().length < 5) throw new RegistryError("Catatan keputusan wajib diisi (minimal 5 karakter).");
  if (to === "reviewed" || to === "approved") {
    const errs = standardIssues(db, id).filter((i) => i.level === "error");
    if (errs.length) throw new RegistryError(`Masih ada ${errs.length} galat validasi: ${errs[0].message}`, 422);
  }
  const at = nowIso();
  db.transaction(() => {
    const col = to === "reviewed" ? "reviewed" : to === "approved" ? "approved" : null;
    if (col) db.prepare(`UPDATE standard_versions SET status = ?, ${col}_by = ?, ${col}_at = ? WHERE id = ?`).run(to, p.id, at, id);
    else if (to === "retired") db.prepare("UPDATE standard_versions SET status = ?, retired_at = ? WHERE id = ?").run(to, at, id);
    else db.prepare("UPDATE standard_versions SET status = ? WHERE id = ?").run(to, id);
    db.prepare("INSERT INTO approval_history (object_type, object_id, from_status, to_status, actor, role, note, at) VALUES ('standard_version',?,?,?,?,?,?,?)").run(id, v.status, to, p.id, p.role, note.trim() || null, at);
    appendAudit(db, { actor: p.id, actor_role: p.role, action: `standar_${to}`, entity: "standard_version", entity_id: id, detail: { dari: v.status } });
  })();
}

export const APPROVAL_DISCLAIMER = "Status 'approved' di aplikasi hanya mencatat hasil review tim SEHATI, bukan pengesahan kebijakan BPJS Kesehatan atau Kemenkes.";
