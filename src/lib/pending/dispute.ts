import type Database from "better-sqlite3";
import { appendAudit } from "../audit";
import { assertCan, assertFacility, type Principal } from "../auth/principal";
import { nowPrecise } from "../clock";
import { nextId } from "../db";
import { DomainError } from "../idem";
import { findForbiddenTerms } from "../labels";
import { PENDING_CATEGORIES, applyCategory, type PendingCategory } from "./triage";

/* Bantahan faskes atas (a) kategori pemilahan pending dan (b) kartu pembinaan. Jenis 'finding' dikelola modul kasus.
   Bantahan yang diterima tidak mengubah apa pun secara otomatis kecuali kategori pending yang disebut eksplisit oleh peninjau;
   untuk kartu, "diterima" berarti perhitungan ditandai untuk ditinjau ulang dan faskes diberi tahu. */

export type DisputeKind = "pending_category" | "card";
export type DisputeOutcome = "accepted" | "rejected" | "noted";

export interface DisputeRow {
  id: string; facility_id: string; kind: DisputeKind | "finding"; ref_id: string; text: string;
  status: "open" | "accepted" | "rejected" | "noted"; response: string | null; created_by: string | null; created_at: string; resolved_by: string | null; resolved_at: string | null;
}

const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim();

export function fileDispute(db: Database.Database, p: Principal, input: { kind: DisputeKind; refId: string; text: string }) {
  assertCan(p, "dispute.create");
  const text = clean(input.text);
  if (text.length < 15) throw new DomainError("Uraikan bantahan (minimal 15 karakter) dan sebutkan data yang menurut faskes berbeda.", 422);
  if (text.length > 3000) throw new DomainError("Bantahan terlalu panjang (maks. 3000 karakter).", 422);
  return db.transaction(() => {
    let facilityId: string;
    if (input.kind === "pending_category") {
      const t = db.prepare("SELECT facility_id FROM pending_triage WHERE id = ?").get(input.refId) as { facility_id: string } | undefined;
      if (!t) throw new DomainError("Baris pemilahan pending tidak ditemukan.", 404);
      facilityId = t.facility_id;
    } else if (input.kind === "card") {
      const c = db.prepare("SELECT facility_id FROM facility_cards WHERE id = ?").get(Number(input.refId)) as { facility_id: string } | undefined;
      if (!c) throw new DomainError("Kartu tidak ditemukan.", 404);
      facilityId = c.facility_id;
    } else throw new DomainError("Jenis bantahan tidak dikenal.", 422);
    assertFacility(p, facilityId);
    const dup = db.prepare("SELECT 1 FROM disputes WHERE kind = ? AND ref_id = ? AND status = 'open'").get(input.kind, input.refId);
    if (dup) throw new DomainError("Sudah ada bantahan yang masih terbuka untuk objek ini.", 409);
    const id = nextId(db, "BN");
    db.prepare("INSERT INTO disputes (id, facility_id, kind, ref_id, text, status, created_by, created_at) VALUES (?,?,?,?,?,'open',?,?)").run(id, facilityId, input.kind, input.refId, text, p.id, nowPrecise());
    appendAudit(db, { actor: p.id, actor_role: p.role, action: "bantahan_diajukan", entity: "dispute", entity_id: id, detail: { jenis: input.kind, objek: input.refId, faskes: facilityId } });
    return id;
  })();
}

/** Peninjau menjawab bantahan. 'accepted' pada kategori pending wajib menyebut kategori baru; hasilnya dicatat sebagai pengubahan kategori beralasan. */
export function resolveDispute(db: Database.Database, p: Principal, id: string, input: { outcome: DisputeOutcome; response: string; newCategory?: PendingCategory }) {
  assertCan(p, "dispute.resolve");
  const response = clean(input.response);
  if (response.length < 10) throw new DomainError("Jawaban atas bantahan wajib diisi (minimal 10 karakter).", 422);
  const bad = findForbiddenTerms(response);
  if (bad.length) throw new DomainError(`Gunakan bahasa netral. Kata tidak diizinkan: ${bad.join(", ")}.`, 422);
  if (!["accepted", "rejected", "noted"].includes(input.outcome)) throw new DomainError("Hasil tidak dikenal.", 422);
  return db.transaction(() => {
    const d = db.prepare("SELECT * FROM disputes WHERE id = ? AND kind IN ('pending_category','card')").get(id) as DisputeRow | undefined;
    if (!d) throw new DomainError("Bantahan tidak ditemukan.", 404);
    if (d.status !== "open") throw new DomainError("Bantahan sudah dijawab.", 409);
    if (d.kind === "pending_category" && input.outcome === "accepted") {
      assertCan(p, "pending.manage"); // mengubah kategori butuh wewenang pemilah juga
      if (!input.newCategory || !PENDING_CATEGORIES.includes(input.newCategory)) throw new DomainError("Bantahan diterima: sebutkan kategori baru.", 422);
      applyCategory(db, p, d.ref_id, input.newCategory, `Bantahan ${d.id} diterima: ${response}`);
    }
    db.prepare("UPDATE disputes SET status = ?, response = ?, resolved_by = ?, resolved_at = ? WHERE id = ?").run(input.outcome, response, p.id, nowPrecise(), id);
    appendAudit(db, { actor: p.id, actor_role: p.role, action: "bantahan_dijawab", entity: "dispute", entity_id: id, detail: { hasil: input.outcome, jenis: d.kind, objek: d.ref_id } });
  })();
}

export function listDisputes(db: Database.Database, filter: { kind?: DisputeKind; refId?: string; facilityId?: string; status?: string } = {}): DisputeRow[] {
  const where = ["kind IN ('pending_category','card')"];
  const args: unknown[] = [];
  if (filter.kind) { where.push("kind = ?"); args.push(filter.kind); }
  if (filter.refId) { where.push("ref_id = ?"); args.push(filter.refId); }
  if (filter.facilityId) { where.push("facility_id = ?"); args.push(filter.facilityId); }
  if (filter.status) { where.push("status = ?"); args.push(filter.status); }
  return db.prepare(`SELECT * FROM disputes WHERE ${where.join(" AND ")} ORDER BY created_at DESC, id DESC`).all(...args) as DisputeRow[];
}
