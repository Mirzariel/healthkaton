import type Database from "better-sqlite3";
import { SYSTEM_ACTOR, syncClaimSignals } from "../cases/core";
import { addDays } from "../dates";
import { makeRng } from "../rng";
import type { SeedRefs } from "./base";

/** Riwayat status bayar simulasi turunan dari tabel klaim (sumber 'simulated'). Dasbor pembayaran penuh dibangun modul pending/pembayaran. */
function seedPaymentEvents(db: Database.Database, refs: SeedRefs) {
  const r = makeRng(77);
  const truth = new Map(refs.truth.map((t) => [t.claim_id, t.label]));
  const claims = db.prepare("SELECT id, facility_id, amount, status, submitted_at, paid_at FROM claims ORDER BY id").all() as { id: string; facility_id: string; amount: number; status: string; submitted_at: string | null; paid_at: string | null }[];
  const ins = db.prepare("INSERT INTO payment_events (claim_id, facility_id, type, at, amount, reason, source, policy_version_id) VALUES (?,?,?,?,?,?,?,?)");
  const reasonFor = (id: string) => {
    const t = truth.get(id);
    if (t === "coding") return "KODING_TIDAK_SELARAS";
    if (t === "membership") return "DATA_KEPESERTAAN";
    return r.pick(["BERKAS_KURANG", "BERKAS_KURANG", "PERLU_PENDALAMAN", "DATA_TIDAK_SELARAS"]);
  };
  for (const c of claims) {
    if (!c.submitted_at) continue;
    ins.run(c.id, c.facility_id, "submitted", c.submitted_at, c.amount, null, "simulated", "POL-PAY-1");
    if (c.status === "pending" || c.status === "returned") {
      ins.run(c.id, c.facility_id, c.status, addDays(c.submitted_at, r.int(3, 9)), c.amount, reasonFor(c.id), "simulated", "POL-PAY-1");
      continue;
    }
    // sebagian kecil sengaja tanpa tanggal "berkas lengkap": menguji status "data belum cukup" pada dasbor pembayaran
    if (r.chance(0.9)) ins.run(c.id, c.facility_id, "complete", addDays(c.submitted_at, 2), null, null, "simulated", "POL-PAY-1");
    if (c.paid_at) ins.run(c.id, c.facility_id, "paid", c.paid_at, c.amount, null, "simulated", "POL-PAY-1");
  }
}

/** Menyiapkan data turunan: status bayar simulasi dan sinyal → temuan → kasus (ditugaskan otomatis). Modul lain menambah skenario di atasnya. */
export function seedDomain(db: Database.Database, refs: SeedRefs) {
  seedPaymentEvents(db, refs);
  syncClaimSignals(db, SYSTEM_ACTOR);
}
