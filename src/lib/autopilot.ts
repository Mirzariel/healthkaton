import type Database from "better-sqlite3";
import { ActionError, DECISIONS, type Decision } from "./actions";
import { appendAudit } from "./audit";
import { rupiah } from "./dates";
import { buildCtx } from "./engine/context";
import { checkServices } from "./engine/stages";
import { loadDataset } from "./db";
import type { Modus, Role, Signal } from "./types";

/* ============================================================================
   AUTOPILOT KEPUTUSAN (SIMULASI)
   ----------------------------------------------------------------------------
   Memutus kasus secara otomatis memakai mesin aturan yang sudah ada (bukan model AI
   sungguhan). Setiap keputusan otomatis:
     - dicatat di jejak audit berantai dengan pelaku "otomatis",
     - menyimpan alasan, dasar (bullet), dan tingkat keyakinan,
     - bisa dikonfirmasi, diubah, atau dikembalikan ke antrean manual oleh petugas.
   Kasus berkeyakinan rendah + sampel acak 1 dari 10 ditandai "perlu ditinjau".
   Cara mengganti dengan AI sungguhan: lihat docs/AI-AUTOPILOT.md.
   ========================================================================== */

export type AutoMode = "manual" | "otomatis";
export const ENGINE_LABEL = "Mesin otomatis SEHATI v0 (simulasi berbasis aturan)";
/** Di bawah ambang ini keputusan otomatis selalu masuk daftar tinjau. */
export const REVIEW_CONFIDENCE = 70;

export interface Verdict {
  kind: "putus" | "tanya_peserta";
  decision: Decision | null;
  correction: number | null;
  confidence: number;
  /** Satu kalimat ringkas untuk petugas & jejak audit. */
  summary: string;
  /** Dasar keputusan, poin per poin. */
  basis: string[];
}

export interface AutoRow {
  case_id: string;
  state: "diputus" | "menunggu_peserta";
  decision: Decision | null;
  correction: number | null;
  confidence: number;
  summary: string;
  basis: string;
  engine: string;
  at: string;
  review_flag: "keyakinan_rendah" | "sampel_acak" | null;
  review_status: "belum" | "dikonfirmasi" | "diubah" | "dibuka_kembali";
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
}

// Tabel `auto_decisions` didefinisikan di SCHEMA (lib/db.ts). Pastikan juga ada pada basis data
// yang sudah terbuka sebelum fitur ini ditambahkan (server dev yang berjalan lama).
const ready = new WeakSet<Database.Database>();
function ensure(db: Database.Database) {
  if (ready.has(db)) return;
  db.exec(
    "CREATE TABLE IF NOT EXISTS auto_decisions (case_id TEXT PRIMARY KEY, state TEXT, decision TEXT, correction INTEGER, confidence INTEGER, summary TEXT, basis TEXT, engine TEXT, at TEXT, review_flag TEXT, review_status TEXT DEFAULT 'belum', reviewed_by TEXT, reviewed_at TEXT, review_note TEXT)",
  );
  ready.add(db);
}

const nowIso = () => new Date().toISOString().slice(0, 16);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));

/* ---------- Mode ---------- */

export function getMode(db: Database.Database): AutoMode {
  ensure(db);
  const r = db.prepare("SELECT value FROM meta WHERE key='autopilot_mode'").get() as { value: string } | undefined;
  return r?.value === "otomatis" ? "otomatis" : "manual";
}

export function setMode(db: Database.Database, mode: AutoMode, actor: Role) {
  if (actor !== "verifikator" && actor !== "auditor") throw new ActionError("Hanya verifikator atau auditor yang dapat mengubah mode keputusan.", 403);
  if (mode !== "manual" && mode !== "otomatis") throw new ActionError("Mode tidak dikenal.");
  if (getMode(db) === mode) return;
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('autopilot_mode', ?)").run(mode);
  appendAudit(db, { actor, action: "mode_keputusan_diubah", entity: "system", entity_id: "autopilot", detail: { mode } });
}

/* ---------- Penalaran ---------- */

interface CaseInput {
  caseId: string;
  modus: Modus;
  score: number;
  signals: Signal[];
  claimId: string;
  claimAmount: number;
  claimNo: string;
  relatedClaimId: string | null;
}

function loadCaseInput(db: Database.Database, caseId: string): CaseInput | null {
  const r = db
    .prepare(
      `SELECT c.id case_id, f.modus, f.score, f.signals, f.claim_id, f.related_claim_id, cl.amount, cl.claim_no
       FROM cases c JOIN findings f ON f.id=c.finding_id JOIN claims cl ON cl.id=f.claim_id WHERE c.id=?`,
    )
    .get(caseId) as
    | { case_id: string; modus: Modus; score: number; signals: string; claim_id: string; related_claim_id: string | null; amount: number; claim_no: string }
    | undefined;
  if (!r) return null;
  let signals: Signal[] = [];
  try {
    signals = JSON.parse(r.signals) as Signal[];
  } catch {}
  return { caseId: r.case_id, modus: r.modus, score: r.score, signals, claimId: r.claim_id, claimAmount: r.amount, claimNo: r.claim_no, relatedClaimId: r.related_claim_id };
}

const has = (s: Signal[], key: string) => s.some((x) => x.key === key);
/** Keyakinan: makin jauh skor dari ambang keputusan, makin yakin. */
const confFrom = (score: number, threshold: number, base = 70) => clamp(base + Math.abs(score - threshold) * 0.6, 40, 97);
const round1000 = (n: number) => Math.round(n / 1000) * 1000;

function reasonRepeat(db: Database.Database, x: CaseInput): Verdict {
  const related = x.relatedClaimId ? (db.prepare("SELECT claim_no, amount FROM claims WHERE id=?").get(x.relatedClaimId) as { claim_no: string; amount: number } | undefined) : undefined;
  const ref = related ? `klaim ${related.claim_no} (${rupiah(related.amount)}) yang sudah dibayar` : "klaim lain yang sudah dibayar";
  const basis = x.signals.map((s) => `${s.label} (${s.weight > 0 ? "+" : ""}${s.weight})`);
  if (has(x.signals, "medical_indication") || x.score < 50) {
    return { kind: "putus", decision: "loloskan", correction: null, confidence: confFrom(x.score, 50, 62), summary: `Diloloskan: kemiripan dengan ${ref} lemah atau ada indikasi medis untuk perawatan baru.`, basis };
  }
  if (has(x.signals, "same_episode") || x.score >= 70) {
    return { kind: "putus", decision: "tolak", correction: null, confidence: confFrom(x.score, 70, 78), summary: `Ditolak: perawatan yang sama sudah ditagihkan dan dibayar lewat ${ref}.`, basis };
  }
  const corr = round1000(x.claimAmount * 0.5);
  return { kind: "putus", decision: "koreksi", correction: corr, confidence: confFrom(x.score, 60, 55), summary: `Dikoreksi ${rupiah(corr)}: sebagian layanan sama persis dengan ${ref} (estimasi potongan 50%, simulasi).`, basis };
}

function reasonFragmentation(x: CaseInput, relatedNo: string | null): Verdict {
  const basis = x.signals.map((s) => `${s.label} (${s.weight > 0 ? "+" : ""}${s.weight})`);
  const prev = relatedNo ? `klaim ${relatedNo}` : "episode sebelumnya";
  if (has(x.signals, "medical_indication") || x.score < 50) {
    return { kind: "putus", decision: "loloskan", correction: null, confidence: confFrom(x.score, 50, 62), summary: "Diloloskan: perawatan terpisah didukung indikasi medis atau jeda cukup panjang.", basis };
  }
  if (x.score >= 70) {
    return { kind: "putus", decision: "tolak", correction: null, confidence: confFrom(x.score, 70, 76), summary: `Ditolak sebagai klaim terpisah: perawatan ini lanjutan dari ${prev}. Rumah sakit dapat mengajukan ulang sebagai satu episode.`, basis };
  }
  const corr = round1000(x.claimAmount * 0.5);
  return { kind: "putus", decision: "koreksi", correction: corr, confidence: confFrom(x.score, 60, 52), summary: `Dikoreksi ${rupiah(corr)}: tarif paket tidak dibayar dua kali untuk perawatan beruntun (estimasi 50%, simulasi).`, basis };
}

function reasonPhantom(db: Database.Database, x: CaseInput): Verdict {
  const ds = loadDataset(db);
  const ctx = buildCtx(ds);
  const claim = ds.claims.find((c) => c.id === x.claimId);
  const basis = x.signals.map((s) => `${s.label} (${s.weight > 0 ? "+" : ""}${s.weight})`);
  if (!claim) return { kind: "putus", decision: "eskalasi", correction: null, confidence: 40, summary: "Data klaim tidak lengkap; dieskalasi.", basis };
  const svc = new Map((ctx.servicesByEpisode.get(claim.episode_id) ?? []).map((s) => [s.id, s]));
  const flagged = checkServices(ctx, claim).filter((c) => c.state !== "tersedia");
  const amount = flagged.reduce((a, c) => a + (svc.get(c.service_id)?.amount ?? 0), 0);
  const names = flagged.map((c) => svc.get(c.service_id)?.name ?? c.service_id).join(", ");
  const answers = flagged.map((c) => {
    const list = (ctx.confByService.get(c.service_id) ?? []).slice().sort((a, b) => b.at.localeCompare(a.at));
    return list[0]?.answer ?? null;
  });
  const disputed = answers.includes("tidak_sesuai");
  const unsure = answers.includes("tidak_ingat");
  const allConfirmed = answers.length > 0 && answers.every((a) => a === "sesuai");
  const noAnswer = answers.every((a) => a === null);

  if (disputed) {
    return {
      kind: "putus",
      decision: "koreksi",
      correction: amount,
      confidence: clamp(82 + (x.score - 70) * 0.4, 75, 96),
      summary: `Dikoreksi ${rupiah(amount)}: ${names} tidak didukung lembar tindakan dan peserta menyatakan tidak menerimanya.`,
      basis: [...basis, "Peserta menjawab \"TIDAK pernah\" lewat aplikasi peserta"],
    };
  }
  if (allConfirmed) {
    return {
      kind: "putus",
      decision: "loloskan",
      correction: null,
      confidence: 74,
      summary: `Diloloskan: peserta mengonfirmasi menerima ${names}. Rumah sakit diminta melengkapi lembar tindakan.`,
      basis: [...basis, "Peserta menjawab \"YA, saya menjalani\""],
    };
  }
  if (noAnswer && x.score < 70) {
    return {
      kind: "tanya_peserta",
      decision: null,
      correction: null,
      confidence: 0,
      summary: `Menunggu konfirmasi peserta untuk ${names} lewat aplikasi peserta sebelum memutus. Bukti kurang belum berarti tindakan tidak dilakukan.`,
      basis,
    };
  }
  return {
    kind: "putus",
    decision: "koreksi",
    correction: amount,
    confidence: unsure ? 58 : confFrom(x.score, 70, 66),
    summary: `Dikoreksi ${rupiah(amount)}: ${names} belum didukung bukti pelaksanaan${unsure ? " dan peserta tidak yakin" : ""}. Bisa dipulihkan bila rumah sakit melampirkan bukti.`,
    basis: [...basis, ...(unsure ? ["Peserta menjawab \"Saya lupa / tidak yakin\""] : [])],
  };
}

/** Hitung usulan keputusan untuk satu kasus tanpa menyimpan apa pun. */
export function proposeDecision(db: Database.Database, caseId: string): Verdict | null {
  const x = loadCaseInput(db, caseId);
  if (!x) return null;
  if (x.modus === "repeat_billing") return reasonRepeat(db, x);
  if (x.modus === "fragmentation") {
    const rel = x.relatedClaimId ? (db.prepare("SELECT claim_no FROM claims WHERE id=?").get(x.relatedClaimId) as { claim_no: string } | undefined) : undefined;
    return reasonFragmentation(x, rel?.claim_no ?? null);
  }
  return reasonPhantom(db, x);
}

/** Sampel acak tetap (1 dari 10) agar sebagian keputusan otomatis selalu diperiksa manusia. */
function sampled(caseId: string) {
  let h = 0;
  for (const ch of caseId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 10 === 0;
}

/* ---------- Eksekusi ---------- */

export interface RunResult {
  decided: { caseId: string; decision: Decision; confidence: number; review: boolean }[];
  waiting: string[];
  ms: number;
}

/** Jalankan autopilot pada kasus yang belum diputus (opsional: hanya milik satu peserta). */
export function runAutopilot(db: Database.Database, opts: { participantId?: string; now?: string } = {}): RunResult {
  ensure(db);
  const t0 = Date.now();
  const now = opts.now ?? nowIso();
  const rows = (
    opts.participantId
      ? db
          .prepare(
            `SELECT c.id FROM cases c JOIN findings f ON f.id=c.finding_id JOIN episodes e ON e.id=f.episode_id
             WHERE c.status!='decided' AND e.participant_id=? ORDER BY c.id`,
          )
          .all(opts.participantId)
      : db.prepare("SELECT id FROM cases WHERE status!='decided' ORDER BY id").all()
  ) as { id: string }[];

  const res: RunResult = { decided: [], waiting: [], ms: 0 };
  const upsert = db.prepare(
    `INSERT INTO auto_decisions (case_id, state, decision, correction, confidence, summary, basis, engine, at, review_flag, review_status)
     VALUES (@case_id, @state, @decision, @correction, @confidence, @summary, @basis, @engine, @at, @review_flag, 'belum')
     ON CONFLICT(case_id) DO UPDATE SET state=@state, decision=@decision, correction=@correction, confidence=@confidence,
       summary=@summary, basis=@basis, engine=@engine, at=@at, review_flag=@review_flag, review_status='belum',
       reviewed_by=NULL, reviewed_at=NULL, review_note=NULL`,
  );

  db.transaction(() => {
    for (const { id } of rows) {
      const v = proposeDecision(db, id);
      if (!v) continue;
      const prev = db.prepare("SELECT state FROM auto_decisions WHERE case_id=?").get(id) as { state: string } | undefined;
      if (v.kind === "tanya_peserta") {
        if (prev?.state !== "menunggu_peserta") {
          upsert.run({ case_id: id, state: "menunggu_peserta", decision: null, correction: null, confidence: 0, summary: v.summary, basis: JSON.stringify(v.basis), engine: ENGINE_LABEL, at: now, review_flag: null });
          appendAudit(db, { ts: now, actor: "otomatis", action: "konfirmasi_peserta_diminta", entity: "case", entity_id: id, detail: { alasan: v.summary } });
        }
        res.waiting.push(id);
        continue;
      }
      const decision = v.decision!;
      const flag = v.confidence < REVIEW_CONFIDENCE ? "keyakinan_rendah" : sampled(id) ? "sampel_acak" : null;
      upsert.run({ case_id: id, state: "diputus", decision, correction: v.correction, confidence: v.confidence, summary: v.summary, basis: JSON.stringify(v.basis), engine: ENGINE_LABEL, at: now, review_flag: flag });
      db.prepare(
        `UPDATE cases SET status='decided', decision=?, decision_reason=?, correction_amount=?, decided_at=?,
           first_review_at=COALESCE(first_review_at, ?) WHERE id=?`,
      ).run(decision, `[Otomatis] ${v.summary}`, decision === "koreksi" ? v.correction : null, now, now, id);
      db.prepare("UPDATE findings SET status='closed' WHERE id=(SELECT finding_id FROM cases WHERE id=?)").run(id);
      appendAudit(db, {
        ts: now,
        actor: "otomatis",
        action: "keputusan_otomatis",
        entity: "case",
        entity_id: id,
        detail: { decision, correction: v.correction, keyakinan: v.confidence, perluTinjau: flag, reason: v.summary },
      });
      res.decided.push({ caseId: id, decision, confidence: v.confidence, review: !!flag });
    }
  })();
  res.ms = Date.now() - t0;
  return res;
}

/** Dipanggil setelah data berubah (konfirmasi peserta, impor). Hanya berjalan bila mode otomatis. */
export function autopilotAfterChange(db: Database.Database, opts: { participantId?: string; now?: string } = {}) {
  if (getMode(db) !== "otomatis") return null;
  return runAutopilot(db, opts);
}

/* ---------- Tinjauan manusia ---------- */

function mustAuto(db: Database.Database, caseId: string) {
  ensure(db);
  const a = db.prepare("SELECT * FROM auto_decisions WHERE case_id=?").get(caseId) as AutoRow | undefined;
  if (!a || a.state !== "diputus") throw new ActionError("Kasus ini tidak diputus otomatis.", 404);
  return a;
}
function mustReviewer(actor: Role) {
  if (actor !== "verifikator" && actor !== "auditor") throw new ActionError("Hanya verifikator atau auditor yang dapat meninjau keputusan otomatis.", 403);
}

/** Petugas menyetujui keputusan otomatis apa adanya. */
export function confirmAuto(db: Database.Database, caseId: string, actor: Role, note = "") {
  mustReviewer(actor);
  mustAuto(db, caseId);
  const now = nowIso();
  db.prepare("UPDATE auto_decisions SET review_status='dikonfirmasi', reviewed_by=?, reviewed_at=?, review_note=? WHERE case_id=?").run(actor, now, note.trim() || null, caseId);
  appendAudit(db, { actor, action: "keputusan_otomatis_dikonfirmasi", entity: "case", entity_id: caseId, detail: { catatan: note.trim() } });
}

/** Petugas mengganti keputusan otomatis dengan keputusannya sendiri. */
export function overrideAuto(db: Database.Database, caseId: string, p: { decision: string; reason: string; correction?: number | null }, actor: Role) {
  mustReviewer(actor);
  const a = mustAuto(db, caseId);
  if (!(DECISIONS as readonly string[]).includes(p.decision)) throw new ActionError("Keputusan tidak valid.");
  const reason = p.reason.trim();
  if (reason.length < 10) throw new ActionError("Alasan perubahan wajib diisi (minimal 10 karakter).");
  const correction = p.decision === "koreksi" ? Math.max(0, Math.round(p.correction ?? 0)) : null;
  const now = nowIso();
  db.transaction(() => {
    db.prepare("UPDATE cases SET decision=?, decision_reason=?, correction_amount=?, decided_at=? WHERE id=?").run(p.decision, reason, correction, now, caseId);
    db.prepare("UPDATE auto_decisions SET review_status='diubah', reviewed_by=?, reviewed_at=?, review_note=? WHERE case_id=?").run(actor, now, reason, caseId);
    appendAudit(db, { actor, action: "keputusan_otomatis_diubah", entity: "case", entity_id: caseId, detail: { dari: a.decision, menjadi: p.decision, correction, reason } });
  })();
}

/** Petugas membatalkan keputusan otomatis dan mengembalikan kasus ke antrean manual. */
export function reopenAuto(db: Database.Database, caseId: string, actor: Role, note = "") {
  mustReviewer(actor);
  mustAuto(db, caseId);
  const now = nowIso();
  db.transaction(() => {
    db.prepare("UPDATE cases SET status='open', decision=NULL, decision_reason=NULL, correction_amount=NULL, decided_at=NULL WHERE id=?").run(caseId);
    db.prepare("UPDATE findings SET status='open' WHERE id=(SELECT finding_id FROM cases WHERE id=?)").run(caseId);
    db.prepare("UPDATE auto_decisions SET review_status='dibuka_kembali', reviewed_by=?, reviewed_at=?, review_note=? WHERE case_id=?").run(actor, now, note.trim() || null, caseId);
    appendAudit(db, { actor, action: "keputusan_otomatis_dibatalkan", entity: "case", entity_id: caseId, detail: { catatan: note.trim() } });
  })();
}

/* ---------- Bacaan untuk UI ---------- */

export function getAuto(db: Database.Database, caseId: string): (AutoRow & { basisList: string[] }) | null {
  ensure(db);
  const a = db.prepare("SELECT * FROM auto_decisions WHERE case_id=?").get(caseId) as AutoRow | undefined;
  if (!a) return null;
  let basisList: string[] = [];
  try {
    basisList = JSON.parse(a.basis) as string[];
  } catch {}
  return { ...a, basisList };
}

export interface AutoListRow extends AutoRow {
  patient: string;
  claim_no: string;
  claim_amount: number;
  modus: Modus;
  score: number;
  case_status: string;
}

export function listAuto(db: Database.Database): AutoListRow[] {
  ensure(db);
  return db
    .prepare(
      `SELECT a.*, p.name patient, cl.claim_no, cl.amount claim_amount, f.modus, f.score, c.status case_status
       FROM auto_decisions a JOIN cases c ON c.id=a.case_id JOIN findings f ON f.id=c.finding_id
       JOIN claims cl ON cl.id=f.claim_id JOIN episodes e ON e.id=f.episode_id JOIN participants p ON p.id=e.participant_id
       ORDER BY a.at DESC, a.case_id`,
    )
    .all() as AutoListRow[];
}

export interface AutoStats {
  mode: AutoMode;
  pending: number;
  decided: number;
  waiting: number;
  needsReview: number;
  reviewed: number;
  changed: number;
  avgConfidence: number | null;
  correctedAmount: number;
}

export function getAutoStats(db: Database.Database): AutoStats {
  ensure(db);
  const q = <T,>(sql: string) => db.prepare(sql).get() as T;
  const decided = q<{ n: number; avg: number | null; corr: number | null }>(
    "SELECT COUNT(*) n, AVG(confidence) avg, SUM(CASE WHEN decision='koreksi' THEN correction ELSE 0 END) corr FROM auto_decisions WHERE state='diputus' AND review_status!='dibuka_kembali'",
  );
  return {
    mode: getMode(db),
    pending: q<{ n: number }>("SELECT COUNT(*) n FROM cases WHERE status!='decided'").n,
    decided: decided.n,
    waiting: q<{ n: number }>("SELECT COUNT(*) n FROM auto_decisions a JOIN cases c ON c.id=a.case_id WHERE a.state='menunggu_peserta' AND c.status!='decided'").n,
    needsReview: q<{ n: number }>("SELECT COUNT(*) n FROM auto_decisions WHERE state='diputus' AND review_flag IS NOT NULL AND review_status='belum'").n,
    reviewed: q<{ n: number }>("SELECT COUNT(*) n FROM auto_decisions WHERE review_status IN ('dikonfirmasi','diubah','dibuka_kembali')").n,
    changed: q<{ n: number }>("SELECT COUNT(*) n FROM auto_decisions WHERE review_status IN ('diubah','dibuka_kembali')").n,
    avgConfidence: decided.avg === null ? null : Math.round(decided.avg),
    correctedAmount: decided.corr ?? 0,
  };
}
