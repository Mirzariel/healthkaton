import { createHash, createHmac } from "node:crypto";
import type Database from "better-sqlite3";
import { nowPrecise } from "./clock";

/* Jejak audit berantai hash.
   Batas yang jujur: rantai hash membuat perubahan TERDETEKSI, bukan mustahil. Orang dengan akses penuh ke berkas basis data
   dapat menulis ulang seluruh rantai. Karena itu (1) UPDATE/DELETE ditolak oleh trigger basis data, (2) hash kepala rantai
   dijangkarkan pada tabel terpisah dan dapat diekspor ke penyimpanan lain, dan (3) bila SEHATI_ANCHOR_SECRET diset, jangkar
   diberi MAC sehingga penulisan ulang tanpa rahasia itu terdeteksi. Jangkar yang tersimpan di basis data yang sama BUKAN
   trust anchor independen. */

export interface AuditRow {
  id: number;
  ts: string;
  actor: string;
  actor_role: string | null;
  action: string;
  entity: string;
  entity_id: string;
  detail: string;
  payload_hash: string;
  prev_hash: string;
  hash: string;
}

export const GENESIS = "0".repeat(64);

/** JSON kanonik: kunci diurutkan, tanpa spasi. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return "[" + v.map(canonicalJson).join(",") + "]";
  const o = v as Record<string, unknown>;
  return "{" + Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => JSON.stringify(k) + ":" + canonicalJson(o[k])).join(",") + "}";
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
export const sha256 = sha;

type Hashable = Pick<AuditRow, "id" | "ts" | "actor" | "actor_role" | "action" | "entity" | "entity_id" | "payload_hash">;
export function computeHash(prev: string, r: Hashable) {
  return sha(
    prev +
      canonicalJson({ seq: r.id, ts: r.ts, actor: r.actor, actor_role: r.actor_role ?? null, action: r.action, object_type: r.entity, object_id: r.entity_id, payload_hash: r.payload_hash }),
  );
}

export interface AuditInput {
  ts?: string;
  actor: string;
  actor_role?: string | null;
  action: string;
  entity: string;
  entity_id: string;
  /** Hanya ID, enum, dan nilai pendek. Jangan memasukkan teks bebas peserta atau dokumen kesehatan. */
  detail?: Record<string, unknown>;
}

/** Tambah entri audit. Aman dipanggil di dalam transaksi pemanggil (SAVEPOINT bersarang). */
export function appendAudit(db: Database.Database, e: AuditInput): number {
  const run = db.transaction(() => {
    const last = db.prepare("SELECT id, hash FROM audit_log ORDER BY id DESC LIMIT 1").get() as { id: number; hash: string } | undefined;
    const id = (last?.id ?? 0) + 1;
    const prev = last?.hash ?? GENESIS;
    const detail = canonicalJson(e.detail ?? {});
    const row: Hashable = {
      id,
      ts: e.ts ?? nowPrecise(),
      actor: e.actor,
      actor_role: e.actor_role ?? null,
      action: e.action,
      entity: e.entity,
      entity_id: e.entity_id,
      payload_hash: sha(detail),
    };
    const hash = computeHash(prev, row);
    db.prepare(
      "INSERT INTO audit_log (id, ts, actor, actor_role, action, entity, entity_id, detail, payload_hash, prev_hash, hash) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    ).run(id, row.ts, row.actor, row.actor_role, row.action, row.entity, row.entity_id, detail, row.payload_hash, prev, hash);
    return id;
  });
  return run();
}

function anchorMac(id: number, hash: string): string | null {
  const secret = process.env.SEHATI_ANCHOR_SECRET;
  return secret ? createHmac("sha256", secret).update(`${id}|${hash}`).digest("hex") : null;
}

/** Tulis jangkar hash kepala rantai. Bila SEHATI_ANCHOR_SECRET ada, jangkar diberi MAC. */
export function anchorAudit(db: Database.Database, note = "manual") {
  const last = db.prepare("SELECT id, hash FROM audit_log ORDER BY id DESC LIMIT 1").get() as { id: number; hash: string } | undefined;
  if (!last) return null;
  const mac = anchorMac(last.id, last.hash);
  const at = nowPrecise();
  db.prepare("INSERT INTO audit_anchors (at, head_id, head_hash, mac, note) VALUES (?,?,?,?,?)").run(at, last.id, last.hash, mac, note);
  return { at, head_id: last.id, head_hash: last.hash, mac, signed: mac !== null };
}

export interface ChainCheck {
  ok: boolean;
  total: number;
  brokenAt: number | null;
  anchorsChecked: number;
  anchorOk: boolean;
  signedAnchors: number;
  message: string;
}

/** Hitung ulang seluruh rantai dari GENESIS, lalu cocokkan dengan jangkar. */
export function verifyChain(db: Database.Database, actor?: string): ChainCheck {
  const rows = db.prepare("SELECT * FROM audit_log ORDER BY id").all() as AuditRow[];
  let prev = GENESIS;
  let brokenAt: number | null = null;
  const hashAt = new Map<number, string>();
  for (const r of rows) {
    if (r.prev_hash !== prev || computeHash(prev, r) !== r.hash || sha(r.detail) !== r.payload_hash) {
      brokenAt = r.id;
      break;
    }
    hashAt.set(r.id, r.hash);
    prev = r.hash;
  }
  const anchors = db.prepare("SELECT * FROM audit_anchors ORDER BY id").all() as { id: number; head_id: number; head_hash: string; mac: string | null }[];
  let anchorOk = true;
  let signed = 0;
  for (const a of anchors) {
    const h = hashAt.get(a.head_id);
    if (brokenAt === null && h !== a.head_hash) anchorOk = false;
    if (a.mac) {
      signed++;
      const expected = anchorMac(a.head_id, a.head_hash);
      if (expected !== null && expected !== a.mac) anchorOk = false;
    }
  }
  const ok = brokenAt === null && anchorOk;
  const message =
    brokenAt !== null
      ? `Rantai tidak cocok mulai entri #${brokenAt}. Ada perubahan setelah entri ditulis.`
      : !anchorOk
        ? "Rantai internal konsisten, tetapi tidak cocok dengan jangkar yang tersimpan. Riwayat mungkin ditulis ulang."
        : anchors.length === 0
          ? "Rantai konsisten. Belum ada jangkar, sehingga penulisan ulang total belum dapat dideteksi."
          : "Rantai konsisten dan cocok dengan seluruh jangkar.";
  const res: ChainCheck = { ok, total: rows.length, brokenAt, anchorsChecked: anchors.length, anchorOk, signedAnchors: signed, message };
  db.prepare("INSERT INTO audit_verifications (at, actor, ok, total, broken_at, anchors_checked, anchor_ok, message) VALUES (?,?,?,?,?,?,?,?)").run(
    nowPrecise(), actor ?? "sistem", ok ? 1 : 0, res.total, brokenAt, anchors.length, anchorOk ? 1 : 0, message,
  );
  return res;
}

export function lastVerification(db: Database.Database) {
  return db.prepare("SELECT * FROM audit_verifications ORDER BY id DESC LIMIT 1").get() as
    | { at: string; actor: string; ok: number; total: number; broken_at: number | null; message: string }
    | undefined;
}
