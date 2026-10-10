import type Database from "better-sqlite3";
import { nowPrecise } from "./clock";
import { json } from "./db";

/** Eksekusi sekali per (scope, key). Pengiriman ulang dengan kunci yang sama mengembalikan hasil pertama tanpa efek samping. */
export function idempotent<T>(db: Database.Database, scope: string, key: string | null | undefined, fn: () => T): { value: T; replayed: boolean } {
  if (!key) return { value: fn(), replayed: false };
  return db.transaction(() => {
    const row = db.prepare("SELECT result_json FROM idempotency_keys WHERE scope = ? AND key = ?").get(scope, key) as { result_json: string | null } | undefined;
    if (row) return { value: json<T>(row.result_json, null as T), replayed: true };
    const value = fn();
    db.prepare("INSERT INTO idempotency_keys (scope, key, result_json, created_at) VALUES (?,?,?,?)").run(scope, key, JSON.stringify(value ?? null), nowPrecise());
    return { value, replayed: false };
  })();
}

export class DomainError extends Error {
  constructor(message: string, public status: 400 | 403 | 404 | 409 | 422 = 400, public code?: string) {
    super(message);
  }
}
