import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { verifyChain } from "../src/lib/audit";
import { AuthError, type Principal, type Role } from "../src/lib/auth/principal";
import { evaluatePeriod, getActiveCardPolicy, listCards, parseParams, recomputeCards, saveCardPolicy, DEFAULT_CARD_PARAMS, METRIC_KEYS, type FacilityPeriodInput, type RawMetric } from "../src/lib/cards/compute";
import type { PaymentEventRecord } from "../src/lib/adapters";
import { nowIso, setNow } from "../src/lib/clock";
import { openDb } from "../src/lib/db";
import { DomainError } from "../src/lib/idem";
import { PAY_CLASS_LABEL, classifyClaim, getPaymentPolicy, listClaimPayments, summarizeByFacility } from "../src/lib/payments/analysis";
import { fileDispute, listDisputes, resolveDispute } from "../src/lib/pending/dispute";
import { escalatePendingToCase, listPending, pendingStats, reclassifyPending, resolvePending, respondPending, syncPendingTriage } from "../src/lib/pending/triage";
import { seedAll, SEED_NOW } from "../src/lib/seed";
import { DEMO_USERS } from "../src/lib/seed/base";
import { SYSTEM_ACTOR } from "../src/lib/cases/core";

const who = (id: string): Principal => {
  const u = DEMO_USERS.find((x) => x.id === id)!;
  return { id: `${u.role}:${u.id}`, name: u.name, role: u.role as Role, facilityId: u.facility_id, participantId: u.participant_id, companionId: null };
};
const ver = who("U-VER-1");
const rev = who("U-REV-1");
const adm = who("U-ADM-1");

const db = openDb(":memory:");
beforeAll(() => { seedAll(db); });

const claimsSnapshot = () => JSON.stringify(db.prepare("SELECT * FROM claims ORDER BY id").all());

describe("pemilahan pending", () => {
  it("setiap klaim pending/dikembalikan punya satu baris pemilahan, dan sinkron ulang tidak menggandakan", () => {
    const n = (db.prepare("SELECT COUNT(*) c FROM pending_triage").get() as { c: number }).c;
    expect(n).toBeGreaterThan(20);
    const again = syncPendingTriage(db, SYSTEM_ACTOR);
    expect(again.created).toBe(0);
    expect((db.prepare("SELECT COUNT(*) c FROM pending_triage").get() as { c: number }).c).toBe(n);
  });

  it("kode alasan dipetakan ke kategori penanganan; kode tak dikenal masuk 'perlu pendalaman'", () => {
    const rows = listPending(db);
    for (const r of rows) {
      if (r.reason_code === "BERKAS_KURANG") expect(r.category === "doc_completeness" || r.status !== "open").toBe(true);
      if (r.reason_code === "KODING_TIDAK_SELARAS") expect(r.category === "coding" || r.status !== "open").toBe(true);
    }
    const known = new Set(["BERKAS_KURANG", "KODING_TIDAK_SELARAS", "DATA_KEPESERTAAN", "DATA_TIDAK_SELARAS", "PERLU_PENDALAMAN"]);
    const unknown = rows.filter((r) => !known.has(r.reason_code));
    expect(unknown.length).toBeGreaterThan(0);
    for (const r of unknown) expect(["needs_review", "doc_completeness", "coding", "data_mismatch"]).toContain(r.category);
  });

  it("modul tidak membaca tabel ground_truth", () => {
    const dirs = ["pending", "cards", "payments", "precheck", "import"].map((d) => path.join(__dirname, "../src/lib", d));
    for (const d of dirs) for (const f of readdirSync(d)) {
      const p = path.join(d, f);
      if (statSync(p).isFile()) expect(readFileSync(p, "utf8"), p).not.toMatch(/(FROM|JOIN|INTO|UPDATE)\s+ground_truth/i);
    }
  });

  it("aksi pemilahan butuh wewenang dan alasan, dan tidak pernah mengubah tabel klaim", () => {
    const before = claimsSnapshot();
    const row = listPending(db, { status: "open", category: "doc_completeness" })[0];
    expect(() => reclassifyPending(db, who("U-FSK-1"), row.id, "coding", "alasan cukup panjang")).toThrow(AuthError);
    expect(() => reclassifyPending(db, ver, row.id, "coding", "pendek")).toThrow(DomainError);
    expect(() => reclassifyPending(db, ver, row.id, "coding", "ini jelas fraud dan penipuan")).toThrow(/netral/i);
    reclassifyPending(db, ver, row.id, "coding", "Setelah dibaca, perlu dicek koder faskes");
    expect(listPending(db, {}).find((r) => r.id === row.id)!.category).toBe("coding");
    expect(() => escalatePendingToCase(db, ver, row.id, "Alasan pemindahan yang cukup panjang")).toThrow(/Perlu pendalaman/);
    resolvePending(db, ver, row.id, "Sudah diperbaiki oleh faskes");
    expect(() => resolvePending(db, ver, row.id, "Sudah diperbaiki oleh faskes")).toThrow(DomainError);
    expect(claimsSnapshot()).toBe(before);
  });

  it("faskes hanya menjawab pending miliknya; jawaban ditambahkan, tidak menimpa", () => {
    const fsk = who("U-FSK-2");
    const mine = listPending(db, { facilityId: fsk.facilityId!, status: "open" })[0];
    const theirs = listPending(db, { status: "open" }).find((r) => r.facility_id !== fsk.facilityId)!;
    expect(() => respondPending(db, fsk, theirs.id, "Kami lengkapi berkasnya")).toThrow();
    respondPending(db, fsk, mine.id, "Berkas kami lengkapi hari ini");
    respondPending(db, fsk, mine.id, "Tambahan: resume sudah diunggah");
    const after = listPending(db, { facilityId: fsk.facilityId! }).find((r) => r.id === mine.id)!;
    expect(after.status).toBe("responded");
    expect(after.facility_response).toContain("Berkas kami lengkapi hari ini");
    expect(after.facility_response).toContain("Tambahan: resume sudah diunggah");
  });

  it("'perlu pendalaman' dapat dipindah ke kasus sebagai sinyal tipe T5 (sekali saja)", () => {
    const row = listPending(db, { status: "open", category: "needs_review" })[0];
    const res = escalatePendingToCase(db, rev, row.id, "Perlu ditinjau lebih dalam oleh reviewer");
    const f = db.prepare("SELECT type, source, proof_status FROM findings WHERE id = ?").get(res.findingId) as { type: string; source: string; proof_status: string };
    expect(f.type).toBe("T5");
    expect(f.source).toBe("pending");
    expect(f.proof_status).not.toBe("verified");
    expect(() => escalatePendingToCase(db, rev, row.id, "Perlu ditinjau lebih dalam oleh reviewer")).toThrow(DomainError);
  });

  it("statistik menyertakan penyebut dan menahan rasio faskes kecil", () => {
    const s = pendingStats(db);
    expect(s.total).toBe(listPending(db).length);
    for (const f of s.byFacility) expect(f.rate === null ? f.submitted < 20 : f.submitted >= 20).toBe(true);
  });
});

describe("bantahan", () => {
  it("faskes membantah kategori miliknya sekali; peninjau menjawab; penerimaan mengubah kategori lewat jalur resmi", () => {
    const fsk = who("U-FSK-1");
    const row = listPending(db, { facilityId: fsk.facilityId!, status: "open" }).find((r) => r.category !== "needs_review")!;
    const id = fileDispute(db, fsk, { kind: "pending_category", refId: row.id, text: "Kami tidak setuju, ini bukan soal berkas." });
    expect(() => fileDispute(db, fsk, { kind: "pending_category", refId: row.id, text: "Bantahan kedua untuk objek sama" })).toThrow(DomainError);
    expect(() => fileDispute(db, ver, { kind: "pending_category", refId: row.id, text: "Petugas tidak boleh membantah" })).toThrow();
    expect(() => resolveDispute(db, ver, id, { outcome: "accepted", response: "Diterima, kategori diubah.", newCategory: "needs_review" })).toThrow(); // verifikator tidak punya dispute.resolve
    resolveDispute(db, rev, id, { outcome: "accepted", response: "Diterima, kategori diubah.", newCategory: "needs_review" });
    expect(listPending(db).find((r) => r.id === row.id)!.category).toBe("needs_review");
    expect(listDisputes(db, { refId: row.id })[0].status).toBe("accepted");
  });
});

/* ---------- Kartu ---------- */
const raw = (num: number, den: number, responses?: number): RawMetric => ({ num, den, responses });
const fac = (id: string, group: string | null, m: Partial<Record<(typeof METRIC_KEYS)[number], RawMetric>>): FacilityPeriodInput => ({
  facilityId: id, peerGroup: group, kind: "fkrtl",
  metrics: { pending_rate: raw(0, 100), verified_per_100: raw(0, 100), gap_rate: raw(0, 0, 0), lapsed_share: raw(0, 0), ...m },
});
const P = parseParams(JSON.stringify(DEFAULT_CARD_PARAMS));

describe("kartu (inti murni)", () => {
  it("faskes yang jauh di atas sejawat pada dua metrik menjadi merah, dengan alasan", () => {
    const rows = [
      fac("A", "g", { pending_rate: raw(40, 100), verified_per_100: raw(6, 100) }),
      fac("B", "g", { pending_rate: raw(5, 100), verified_per_100: raw(1, 100) }),
      fac("C", "g", { pending_rate: raw(6, 100), verified_per_100: raw(1, 100) }),
      fac("D", "g", { pending_rate: raw(4, 100), verified_per_100: raw(1, 100) }),
    ];
    const a = evaluatePeriod("2026-K1", rows, P).find((c) => c.facilityId === "A")!;
    expect(a.level).toBe("red");
    expect(a.basis.reasons.length).toBeGreaterThan(0);
    expect(evaluatePeriod("2026-K1", rows, P).filter((c) => c.facilityId !== "A").every((c) => c.level === "none")).toBe(true);
  });

  it("satu metrik tinggi saja menghasilkan kuning, bukan merah", () => {
    const rows = [fac("A", "g", { pending_rate: raw(30, 100) }), fac("B", "g", { pending_rate: raw(10, 100) }), fac("C", "g", { pending_rate: raw(10, 100) }), fac("D", "g", { pending_rate: raw(10, 100) })];
    const a = evaluatePeriod("2026-K1", rows, P).find((c) => c.facilityId === "A")!;
    expect(["yellow", "none"]).toContain(a.level);
    expect(a.level).not.toBe("red");
  });

  it("data tidak cukup tidak pernah hijau: penyebut kecil atau sejawat kurang → insufficient_data", () => {
    const small = evaluatePeriod("2026-K1", [fac("A", "g", { pending_rate: raw(0, 5) }), fac("B", "g", {})], P);
    expect(small.every((c) => c.level === "insufficient_data")).toBe(true);
    const alone = evaluatePeriod("2026-K1", [fac("A", "g", {})], P);
    expect(alone[0].level).toBe("insufficient_data");
    const noGroup = evaluatePeriod("2026-K1", [fac("A", null, {}), fac("B", null, {}), fac("C", null, {})], P);
    expect(noGroup.every((c) => c.level === "insufficient_data")).toBe(true);
  });

  it("dasar kartu memuat pembilang, penyebut, pembanding, dan batas penggunaan", () => {
    const rows = [fac("A", "g", { pending_rate: raw(30, 100) }), fac("B", "g", {}), fac("C", "g", {})];
    const a = evaluatePeriod("2026-K1", rows, P)[0];
    const m = a.basis.metrics.find((x) => x.key === "pending_rate")!;
    expect(m.num).toBe(30);
    expect(m.den).toBe(100);
    expect(m.peer_count).toBe(2);
    expect(a.basis.limits).toMatch(/bukan.*fraud/i);
  });
});

describe("kartu (basis data)", () => {
  it("kartu hasil seed memakai kebijakan draft, terdapat level selain 'none', dan kartu kecil/kelas C data belum cukup", () => {
    const pol = getActiveCardPolicy(db);
    expect(pol.status).toBe("draft");
    const cards = listCards(db);
    expect(cards.length).toBeGreaterThan(10);
    const levels = new Set(cards.map((c) => c.level));
    expect(levels.has("insufficient_data")).toBe(true);
    expect(cards.some((c) => c.level === "yellow" || c.level === "red")).toBe(true);
    // puskesmas (FKTP) tidak punya pembanding cukup
    expect(cards.filter((c) => c.facility_id.startsWith("FAC-PK")).every((c) => c.level === "insufficient_data" || c.basis.peers.length >= P.min_peers)).toBe(true);
  });

  it("hitung ulang mempertahankan id kartu (acuan bantahan) dan audit rantai tetap sah", () => {
    const ids = listCards(db).map((c) => c.id);
    recomputeCards(db, SYSTEM_ACTOR);
    expect(listCards(db).map((c) => c.id)).toEqual(ids);
    expect(verifyChain(db).ok).toBe(true);
  });

  it("mengubah ambang membuat versi baru berstatus draft; hanya yang berwenang; alasan wajib; nilai tak masuk akal ditolak", () => {
    const p = { ...DEFAULT_CARD_PARAMS, yellow_ratio: 2, red_ratio: 3 };
    expect(() => saveCardPolicy(db, ver, p, "alasan perubahan yang jelas")).toThrow(AuthError);
    expect(() => saveCardPolicy(db, adm, p, "pendek")).toThrow(DomainError);
    expect(() => saveCardPolicy(db, adm, { ...p, yellow_ratio: 3, red_ratio: 2 }, "alasan perubahan yang jelas")).toThrow(DomainError);
    const before = getActiveCardPolicy(db).id;
    const res = saveCardPolicy(db, adm, p, "Uji sensitivitas ambang yang lebih ketat");
    expect(res.policyId).not.toBe(before);
    const now = getActiveCardPolicy(db);
    expect(now.status).toBe("draft");
    expect(JSON.parse(db.prepare("SELECT params_json FROM policy_versions WHERE id = ?").get(before)!["params_json" as never] as string).yellow_ratio).toBe(DEFAULT_CARD_PARAMS.yellow_ratio);
  });

  it("faskes hanya membantah kartu miliknya", () => {
    const fsk = who("U-FSK-1");
    const mine = listCards(db, { facilityId: fsk.facilityId! })[0];
    const other = listCards(db).find((c) => c.facility_id !== fsk.facilityId)!;
    expect(() => fileDispute(db, fsk, { kind: "card", refId: String(other.id), text: "Ini bukan kartu kami tapi kami bantah" })).toThrow();
    fileDispute(db, fsk, { kind: "card", refId: String(mine.id), text: "Angka pending kami mencakup klaim yang sudah diperbaiki" });
    expect(listCards(db, { facilityId: fsk.facilityId! }).find((c) => c.id === mine.id)!.disputes.length).toBeGreaterThan(0);
  });
});

/* ---------- Pembayaran ---------- */
describe("dasbor pembayaran", () => {
  const policy = () => getPaymentPolicy(db)!;
  it("kebijakan pembayaran berstatus draft dan berlabel demo", () => {
    expect(policy().status).toBe("draft");
    expect(policy().params.label).toMatch(/DEMO/i);
  });

  it("tanpa tanggal berkas lengkap, keterlambatan tidak disimpulkan dari tanggal pengajuan", () => {
    const c = classifyClaim({ claim_status: "submitted", submitted_at: "2026-01-02" }, [{ claim_id: "x", type: "paid", at: "2026-06-30", amount: 1, reason: null, source: "simulated" }], policy(), "2026-10-10");
    expect(c.klass).toBe("insufficient");
    expect(c.days_overdue).toBeNull();
  });

  it("tanpa peristiwa sama sekali → sumber tidak tersedia (bukan terlambat, bukan tepat waktu)", () => {
    const c = classifyClaim({ claim_status: "submitted", submitted_at: "2026-01-02" }, [], policy(), "2026-10-10");
    expect(c.klass).toBe("source_unavailable");
  });

  it("lengkap lalu dibayar melewati tenggat parameter → melewati tenggat; pending di antaranya → tertunda karena pending", () => {
    const ev = (type: PaymentEventRecord["type"], at: string, reason: string | null = null): PaymentEventRecord => ({ claim_id: "x", type, at, amount: null, reason, source: "simulated" });
    const late = classifyClaim({ claim_status: "paid", submitted_at: "2026-01-02" }, [ev("complete", "2026-01-05"), ev("paid", "2026-03-01")], policy(), "2026-10-10");
    expect(late.klass).toBe("late_no_pending");
    expect(late.due_basis).toBe("kebijakan");
    const held = classifyClaim({ claim_status: "paid", submitted_at: "2026-01-02" }, [ev("complete", "2026-01-05"), ev("pending", "2026-01-20", "BERKAS_KURANG"), ev("paid", "2026-03-01")], policy(), "2026-10-10");
    expect(held.klass).toBe("delayed_by_pending");
    const ok = classifyClaim({ claim_status: "paid", submitted_at: "2026-01-02" }, [ev("complete", "2026-01-05"), ev("paid", "2026-01-12")], policy(), "2026-10-10");
    expect(ok.klass).toBe("on_time");
  });

  it("RSCM tidak punya sumber status bayar; ringkasan per faskes menahan rasio bila klaim dinilai < 10", () => {
    const sums = summarizeByFacility(db, listClaimPayments(db));
    const rscm = sums.find((s) => s.facility_id === "FAC-RSCM")!;
    expect(rscm.byClass.source_unavailable).toBe(rscm.submitted);
    expect(rscm.on_time_share).toBeNull();
    for (const s of sums) expect(s.enough ? s.on_time_share !== null : s.on_time_share === null).toBe(true);
    expect(sums.some((s) => s.enough)).toBe(true);
    expect(Object.keys(PAY_CLASS_LABEL).length).toBe(8);
  });

  it("memanggil seluruh analisis tidak mengubah klaim dan tidak mengubah jam", () => {
    const before = claimsSnapshot();
    const t = nowIso();
    listClaimPayments(db);
    expect(claimsSnapshot()).toBe(before);
    expect(nowIso()).toBe(t);
    expect(t.slice(0, 10)).toBe(SEED_NOW.slice(0, 10));
    setNow(SEED_NOW);
  });
});
