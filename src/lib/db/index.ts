import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { seedAll } from "../seed";
import { MIGRATIONS } from "./schema";

type G = typeof globalThis & { __sehatiDb?: Database.Database; __sehatiSeeding?: boolean };

export function migrate(db: Database.Database) {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  const done = new Set((db.prepare("SELECT id FROM schema_migrations").all() as { id: string }[]).map((r) => r.id));
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(m.id, new Date().toISOString());
    })();
  }
}

export function openDb(file: string): Database.Database {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  if (file !== ":memory:") db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = OFF"); // seed melompati urutan; integritas dijaga CHECK + kode domain
  migrate(db);
  return db;
}

export function dbFile() {
  // Di Vercel (serverless) hanya /tmp yang bisa ditulisi: data TIDAK persisten antar-instans. Lihat docs/DEPLOY-PERSISTENSI.md.
  return process.env.SEHATI_DB ?? (process.env.VERCEL ? path.join("/tmp", "sehati-v2.db") : path.join(process.cwd(), "data", "sehati-v2.db"));
}

/** Koneksi tunggal; basis data dibuat dan diisi (seed) otomatis pada pemakaian pertama. */
export const PRESEEDED_DB = path.join(process.cwd(), "seed", "sehati-seed.db");

/** Di serverless, salin basis data yang sudah terisi (dibuat saat build) ke jalur tulis agar cold start tidak menjalankan seed ~9 detik. */
function restorePreseeded(file: string) {
  if (file === ":memory:" || process.env.SEHATI_NO_PRESEED === "1" || fs.existsSync(file) || !fs.existsSync(PRESEEDED_DB)) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.copyFileSync(PRESEEDED_DB, file);
  } catch {
    // gagal menyalin: lanjut dengan seed biasa
  }
}

export function getDb(): Database.Database {
  const g = globalThis as G;
  if (!g.__sehatiDb) {
    restorePreseeded(dbFile());
    const db = openDb(dbFile());
    g.__sehatiDb = db;
    ensureSeeded(db);
  }
  return g.__sehatiDb;
}

function ensureSeeded(db: Database.Database) {
  const n = (db.prepare("SELECT COUNT(*) n FROM facilities").get() as { n: number }).n;
  if (n === 0) {
    seedAll(db);
  }
}

const TABLE_ORDER_DROP = /^(sqlite_|schema_migrations$)/;

/** Hapus seluruh isi (termasuk trigger audit) lalu migrasi + seed ulang. Hanya untuk data demo sintetis. */
export function resetDb(db: Database.Database = getDb()) {
  const objects = db.prepare("SELECT type, name FROM sqlite_master WHERE type IN ('trigger','table')").all() as { type: string; name: string }[];
  for (const o of objects.filter((x) => x.type === "trigger")) db.exec(`DROP TRIGGER IF EXISTS "${o.name}"`);
  for (const o of objects.filter((x) => x.type === "table" && !TABLE_ORDER_DROP.test(x.name))) db.exec(`DROP TABLE IF EXISTS "${o.name}"`);
  db.exec("DELETE FROM schema_migrations");
  migrate(db);
  ensureSeeded(db);
}

export function setTestDb(db: Database.Database | null) {
  (globalThis as G).__sehatiDb = db ?? undefined;
}

/** Penomoran berurutan yang deterministik: TD-0001, KS-0002, dst. */
export function nextId(db: Database.Database, prefix: string, width = 4): string {
  const key = `seq:${prefix}`;
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
  const n = (row ? Number(row.value) : 0) + 1;
  db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, String(n));
  return `${prefix}-${String(n).padStart(width, "0")}`;
}

export function getMeta(db: Database.Database, key: string): string | null {
  const r = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
  return r?.value ?? null;
}
export function setMeta(db: Database.Database, key: string, value: string) {
  db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

export const json = <T,>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};
