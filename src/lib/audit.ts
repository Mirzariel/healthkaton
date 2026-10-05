import { createHash } from "node:crypto";
import type Database from "better-sqlite3";

export interface AuditRow {
  id: number;
  ts: string;
  actor: string;
  action: string;
  entity: string;
  entity_id: string;
  detail: string;
  prev_hash: string;
  hash: string;
}

const GENESIS = "0".repeat(64);

export function computeHash(prev: string, r: Pick<AuditRow, "ts" | "actor" | "action" | "entity" | "entity_id" | "detail">) {
  return createHash("sha256")
    .update([prev, r.ts, r.actor, r.action, r.entity, r.entity_id, r.detail].join("|"))
    .digest("hex");
}

/** Tambah entri jejak audit berantai (append-only). */
export function appendAudit(
  db: Database.Database,
  e: { ts?: string; actor: string; action: string; entity: string; entity_id: string; detail?: unknown },
) {
  const last = db.prepare("SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1").get() as { hash: string } | undefined;
  const prev = last?.hash ?? GENESIS;
  const row = {
    ts: e.ts ?? new Date().toISOString().slice(0, 16),
    actor: e.actor,
    action: e.action,
    entity: e.entity,
    entity_id: e.entity_id,
    detail: JSON.stringify(e.detail ?? {}),
  };
  const hash = computeHash(prev, row);
  db.prepare(
    "INSERT INTO audit_log (ts, actor, action, entity, entity_id, detail, prev_hash, hash) VALUES (?,?,?,?,?,?,?,?)",
  ).run(row.ts, row.actor, row.action, row.entity, row.entity_id, row.detail, prev, hash);
}

export interface ChainCheck {
  ok: boolean;
  total: number;
  brokenAt: number | null;
}

/** Verifikasi seluruh rantai hash. */
export function verifyChain(db: Database.Database): ChainCheck {
  const rows = db.prepare("SELECT * FROM audit_log ORDER BY id").all() as AuditRow[];
  let prev = GENESIS;
  for (const r of rows) {
    if (r.prev_hash !== prev || computeHash(prev, r) !== r.hash) {
      return { ok: false, total: rows.length, brokenAt: r.id };
    }
    prev = r.hash;
  }
  return { ok: true, total: rows.length, brokenAt: null };
}
