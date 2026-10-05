import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { appendAudit } from "./audit";
import { addDays, addHours } from "./dates";
import { buildCtx } from "./engine/context";
import { reviewClaim } from "./engine/pipeline";
import { makeRng } from "./rng";
import { SEED_NOW, generate, type Seeded } from "./seed/generate";
import type { Dataset, FindingDraft } from "./types";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS participants (id TEXT PRIMARY KEY, name TEXT, nik TEXT, dob TEXT, coverage_start TEXT, coverage_end TEXT, faskes1 TEXT);
CREATE TABLE IF NOT EXISTS episodes (id TEXT PRIMARY KEY, participant_id TEXT, hospital TEXT, kind TEXT, admit_at TEXT, discharge_at TEXT, dx_code TEXT, dx_text TEXT, group_code TEXT);
CREATE TABLE IF NOT EXISTS services (id TEXT PRIMARY KEY, episode_id TEXT, code TEXT, name TEXT, performed_at TEXT, performer TEXT, qty INTEGER, amount INTEGER);
CREATE TABLE IF NOT EXISTS evidence (id TEXT PRIMARY KEY, episode_id TEXT, service_id TEXT, type TEXT, recorded_at TEXT, performer TEXT, summary TEXT);
CREATE TABLE IF NOT EXISTS claims (id TEXT PRIMARY KEY, claim_no TEXT, episode_id TEXT, group_code TEXT, amount INTEGER, status TEXT, submitted_at TEXT, paid_at TEXT, hospital TEXT);
CREATE TABLE IF NOT EXISTS confirmations (id TEXT PRIMARY KEY, service_id TEXT, participant_id TEXT, answer TEXT, note TEXT, at TEXT);
CREATE TABLE IF NOT EXISTS findings (id TEXT PRIMARY KEY, claim_id TEXT, episode_id TEXT, modus TEXT, score INTEGER, severity TEXT, signals TEXT, summary TEXT, limit_text TEXT, related_claim_id TEXT, status TEXT, created_at TEXT, UNIQUE(claim_id, modus));
CREATE TABLE IF NOT EXISTS cases (id TEXT PRIMARY KEY, finding_id TEXT UNIQUE, status TEXT, assignee_role TEXT, assignee_note TEXT, due_at TEXT, opened_at TEXT, first_review_at TEXT, decided_at TEXT, decision TEXT, decision_reason TEXT, correction_amount INTEGER);
CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT, role TEXT, text TEXT, at TEXT);
CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, actor TEXT, action TEXT, entity TEXT, entity_id TEXT, detail TEXT, prev_hash TEXT, hash TEXT);
CREATE TABLE IF NOT EXISTS ground_truth (claim_id TEXT PRIMARY KEY, label TEXT, mimics TEXT);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS auto_decisions (case_id TEXT PRIMARY KEY, state TEXT, decision TEXT, correction INTEGER, confidence INTEGER, summary TEXT, basis TEXT, engine TEXT, at TEXT, review_flag TEXT, review_status TEXT DEFAULT 'belum', reviewed_by TEXT, reviewed_at TEXT, review_note TEXT);
CREATE INDEX IF NOT EXISTS idx_ep_part ON episodes(participant_id);
CREATE INDEX IF NOT EXISTS idx_svc_ep ON services(episode_id);
CREATE INDEX IF NOT EXISTS idx_ev_ep ON evidence(episode_id);
CREATE INDEX IF NOT EXISTS idx_claim_ep ON claims(episode_id);
`;

type G = typeof globalThis & { __sehatiDb?: Database.Database };

export function openDb(file: string): Database.Database {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  return db;
}

/** Koneksi tunggal; basis data dibuat dan diisi otomatis pada pemakaian pertama. */
export function getDb(): Database.Database {
  const g = globalThis as G;
  if (!g.__sehatiDb) {
    // Di Vercel (serverless) hanya /tmp yang bisa ditulisi; data demo dibuat ulang otomatis bila kosong.
    const file = process.env.SEHATI_DB ?? (process.env.VERCEL ? path.join("/tmp", "sehati.db") : path.join(process.cwd(), "data", "sehati.db"));
    const db = openDb(file);
    const n = (db.prepare("SELECT COUNT(*) n FROM participants").get() as { n: number }).n;
    if (n === 0) seedDatabase(db);
    g.__sehatiDb = db;
  }
  return g.__sehatiDb;
}

export function resetDb() {
  const g = globalThis as G;
  const db = getDb();
  db.exec(SCHEMA); // tabel yang ditambahkan setelah koneksi dibuka (mis. auto_decisions) ikut dibuat
  for (const t of ["participants", "episodes", "services", "evidence", "claims", "confirmations", "findings", "cases", "messages", "audit_log", "ground_truth", "meta", "auto_decisions"]) {
    db.exec(`DELETE FROM ${t}`);
  }
  db.exec("DELETE FROM sqlite_sequence");
  seedDatabase(db);
  g.__sehatiDb = db;
}

export function loadDataset(db: Database.Database): Dataset {
  const all = <T,>(t: string) => db.prepare(`SELECT * FROM ${t}`).all() as T[];
  return {
    participants: all("participants"),
    episodes: all("episodes"),
    services: all("services"),
    evidence: all("evidence"),
    claims: all("claims"),
    confirmations: all("confirmations"),
  };
}

function insertDataset(db: Database.Database, ds: Dataset) {
  const ins = (table: string, rows: object[]) => {
    if (!rows.length) return;
    const cols = Object.keys(rows[0]);
    const stmt = db.prepare(`INSERT OR REPLACE INTO ${table} (${cols.join(",")}) VALUES (${cols.map((c) => "@" + c).join(",")})`);
    for (const r of rows) stmt.run(r);
  };
  ins("participants", ds.participants);
  ins("episodes", ds.episodes);
  ins("services", ds.services);
  ins("evidence", ds.evidence);
  ins("claims", ds.claims);
  ins("confirmations", ds.confirmations);
}

// Nomor diturunkan dari isi tabel (bukan variabel modul) agar reset data menghasilkan ID yang sama setiap kali.
function nextFindingId(db: Database.Database) {
  const r = db.prepare("SELECT MAX(CAST(SUBSTR(id,3) AS INTEGER)) m FROM findings").get() as { m: number | null };
  return `F-${String((r.m ?? 0) + 1).padStart(4, "0")}`;
}
function nextCaseId(db: Database.Database) {
  const r = db.prepare("SELECT MAX(CAST(SUBSTR(id,4) AS INTEGER)) m FROM cases").get() as { m: number | null };
  return `KS-${String((r.m ?? 0) + 1).padStart(4, "0")}`;
}

export function createFindingAndCase(db: Database.Database, f: FindingDraft, createdAt: string, actor = "sistem") {
  const fid = nextFindingId(db);
  db.prepare(
    "INSERT INTO findings (id, claim_id, episode_id, modus, score, severity, signals, summary, limit_text, related_claim_id, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run(fid, f.claim_id, f.episode_id, f.modus, f.score, f.severity, JSON.stringify(f.signals), f.summary, f.limit, f.related_claim_id, "open", createdAt);
  const cid = nextCaseId(db);
  db.prepare(
    "INSERT INTO cases (id, finding_id, status, assignee_role, assignee_note, due_at, opened_at) VALUES (?,?,?,?,?,?,?)",
  ).run(cid, fid, "open", null, null, addDays(createdAt, 14), createdAt);
  appendAudit(db, { ts: createdAt, actor, action: "kasus_dibuka", entity: "case", entity_id: cid, detail: { finding: fid, modus: f.modus, score: f.score, claim: f.claim_id } });
  return { findingId: fid, caseId: cid };
}

/**
 * Hitung ulang temuan untuk klaim milik satu peserta (dipanggil setelah data berubah).
 * Temuan baru dibuat bersama kasusnya; skor temuan lama diperbarui; temuan yang tidak lagi
 * terdeteksi dan belum diputuskan ditutup otomatis, dan jejaknya dicatat.
 */
export function recomputeParticipant(db: Database.Database, participantId: string, actor = "sistem", now = new Date().toISOString().slice(0, 16)) {
  const ds = loadDataset(db);
  const ctx = buildCtx(ds);
  const claims = ctx.claimsByParticipant.get(participantId) ?? [];
  const changes: string[] = [];
  for (const claim of claims) {
    const drafts = reviewClaim(ctx, claim).findings;
    const existing = db.prepare("SELECT * FROM findings WHERE claim_id = ?").all(claim.id) as { id: string; modus: string; score: number; status: string }[];
    for (const d of drafts) {
      const cur = existing.find((e) => e.modus === d.modus);
      if (!cur) {
        const { caseId } = createFindingAndCase(db, d, now, actor);
        changes.push(`${caseId} dibuka`);
      } else if (cur.status === "open" && cur.score !== d.score) {
        db.prepare("UPDATE findings SET score=?, severity=?, signals=?, summary=? WHERE id=?").run(d.score, d.severity, JSON.stringify(d.signals), d.summary, cur.id);
        appendAudit(db, { ts: now, actor, action: "skor_diperbarui", entity: "finding", entity_id: cur.id, detail: { dari: cur.score, menjadi: d.score } });
        changes.push(`${cur.id}: skor ${cur.score} → ${d.score}`);
      }
    }
    for (const e of existing) {
      if (e.status === "open" && !drafts.some((d) => d.modus === e.modus)) {
        db.prepare("UPDATE findings SET status='superseded' WHERE id=?").run(e.id);
        const c = db.prepare("SELECT id, status FROM cases WHERE finding_id=?").get(e.id) as { id: string; status: string } | undefined;
        if (c && c.status !== "decided") {
          db.prepare("UPDATE cases SET status='decided', decision='dicabut_otomatis', decision_reason='Indikasi tidak lagi terdeteksi setelah data diperbarui.', decided_at=? WHERE id=?").run(now, c.id);
          appendAudit(db, { ts: now, actor, action: "kasus_ditutup_otomatis", entity: "case", entity_id: c.id, detail: { finding: e.id } });
          changes.push(`${c.id} ditutup otomatis`);
        }
      }
    }
  }
  return changes;
}

/** Isi basis data dengan data simulasi, jalankan mesin, dan buat kasus berikut sejarah keputusan contoh. */
export function seedDatabase(db: Database.Database, seeded: Seeded = generate()) {
  db.transaction(() => {
    insertDataset(db, seeded.ds);
    const gt = db.prepare("INSERT OR REPLACE INTO ground_truth (claim_id, label, mimics) VALUES (?,?,?)");
    for (const t of seeded.truth) gt.run(t.claim_id, t.label, t.mimics ?? null);
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('hero', ?)").run(JSON.stringify(seeded.hero));
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('seed_now', ?)").run(SEED_NOW);

    const ctx = buildCtx(seeded.ds);
    const rng = makeRng(77);
    const heroClaims = new Set([seeded.hero.claim_paid, seeded.hero.claim_dup, seeded.hero.claim_split]);
    const truthBy = new Map(seeded.truth.map((t) => [t.claim_id, t]));
    const created: { caseId: string; claimId: string; modus: string; at: string }[] = [];
    for (const claim of seeded.ds.claims) {
      const review = reviewClaim(ctx, claim);
      for (const f of review.findings) {
        const daysAgo = heroClaims.has(claim.id) ? 1 : rng.int(1, 18);
        const createdAt = addHours(`${SEED_NOW.slice(0, 10)}T08:00`, -daysAgo * 24 + rng.int(0, 6));
        const { caseId } = createFindingAndCase(db, f, createdAt);
        created.push({ caseId, claimId: claim.id, modus: f.modus, at: createdAt });
      }
    }
    // Sejarah keputusan contoh: sekitar sepertiga kasus non-demo sudah selesai.
    const roles = ["verifikator", "auditor"] as const;
    for (const c of created) {
      if (heroClaims.has(c.claimId)) continue;
      const roll = rng.next();
      if (roll > 0.34) {
        if (roll > 0.34 && roll < 0.5) {
          const first = addHours(c.at, rng.int(5, 30));
          db.prepare("UPDATE cases SET status='clarification', assignee_role='verifikator', first_review_at=? WHERE id=?").run(first, c.caseId);
          db.prepare("INSERT INTO messages (case_id, role, text, at) VALUES (?,?,?,?)").run(c.caseId, "verifikator", "Mohon lampirkan bukti pelaksanaan dan catatan indikasi medis untuk layanan yang ditandai.", first);
          appendAudit(db, { ts: first, actor: "verifikator", action: "klarifikasi_diminta", entity: "case", entity_id: c.caseId, detail: {} });
        }
        continue;
      }
      const t = truthBy.get(c.claimId);
      const legit = t?.label === "legit_lookalike";
      const first = addHours(c.at, rng.int(4, 30));
      const decided = addHours(c.at, rng.int(30, 96));
      const decision = legit ? "loloskan" : rng.pick(["koreksi", "koreksi", "tolak", "eskalasi"]);
      const reason = legit
        ? "Setelah klarifikasi, ada indikasi medis atau bukti pelaksanaan yang sah. Klaim diteruskan."
        : "Klarifikasi tidak melengkapi bukti. Klaim dikoreksi/ditolak sesuai ketentuan.";
      const actor = rng.pick(roles);
      db.prepare("UPDATE cases SET status='decided', assignee_role='verifikator', first_review_at=?, decided_at=?, decision=?, decision_reason=?, correction_amount=? WHERE id=?")
        .run(first, decided, decision, reason, decision === "koreksi" ? rng.int(2, 18) * 100000 : null, c.caseId);
      db.prepare("INSERT INTO messages (case_id, role, text, at) VALUES (?,?,?,?)").run(c.caseId, "verifikator", "Mohon klarifikasi dan bukti pendukung untuk temuan ini.", first);
      db.prepare("INSERT INTO messages (case_id, role, text, at) VALUES (?,?,?,?)").run(c.caseId, "casemix", legit ? "Terlampir catatan dokter mengenai indikasi medis dan lembar tindakan." : "Dokumen sedang dicari; belum dapat dilampirkan.", addHours(first, 20));
      appendAudit(db, { ts: decided, actor, action: "keputusan", entity: "case", entity_id: c.caseId, detail: { decision, reason } });
      db.prepare("UPDATE findings SET status='closed' WHERE id=(SELECT finding_id FROM cases WHERE id=?)").run(c.caseId);
    }
  })();
}
