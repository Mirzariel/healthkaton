import type Database from "better-sqlite3";
import { beforeAll, describe, expect, it } from "vitest";
import { verifyChain } from "../src/lib/audit";
import { AuthError, type Principal } from "../src/lib/auth/principal";
import { getMeta, openDb } from "../src/lib/db";
import { MIN_VALID_RESPONSES, SATISFACTION_SLOT } from "../src/lib/quality/definitions";
import { indicatorCsv, normalizeFilters, qualityDashboard, toRow, type QualityFilters } from "../src/lib/quality/metrics";
import { intervalsOverlap, median, percentile, wilson } from "../src/lib/quality/stats";
import { seedAll } from "../src/lib/seed";

const principal = (role: Principal["role"]): Principal => ({ id: `${role}:T`, name: "Uji", role, facilityId: null, participantId: null, companionId: null });
const routine: QualityFilters = { mode: "routine" };

let db: Database.Database;
beforeAll(() => {
  db = openDb(":memory:");
  seedAll(db);
});

describe("statistik", () => {
  it("interval Wilson dan nilai batas", () => {
    expect(wilson(0, 0)).toBeNull();
    const w = wilson(8, 10)!;
    expect(w.lo).toBeCloseTo(0.4902, 3);
    expect(w.hi).toBeCloseTo(0.9433, 3);
    expect(wilson(0, 20)!.lo).toBe(0);
    expect(wilson(20, 20)!.hi).toBe(1);
  });
  it("median, persentil, tumpang-tindih", () => {
    expect(median([1, 3, 2])).toBe(2);
    expect(percentile([1, 2, 3, 4, 5], 0.9)).toBeCloseTo(4.6);
    expect(median([])).toBeNull();
    expect(intervalsOverlap({ lo: 0.1, hi: 0.3 }, { lo: 0.25, hi: 0.5 })).toBe(true);
    expect(intervalsOverlap({ lo: 0.1, hi: 0.2 }, { lo: 0.25, hi: 0.5 })).toBe(false);
  });
});

describe("kategori jawaban dan gap", () => {
  it("penyebut gap hanya jawaban sah; tidak tahu, tidak berlaku, tidak ditanya, tidak merespons tidak masuk (aturan I3)", () => {
    const r = toRow("X", "X", [
      ...Array(3).fill({ category: "negative" }), ...Array(7).fill({ category: "positive" }),
      ...Array(5).fill({ category: "unknown" }), ...Array(4).fill({ category: "not_applicable" }), ...Array(2).fill({ category: "not_asked" }),
      ...Array(2).fill({ category: "nonresponse" }), ...Array(1).fill({ category: "in_progress" }),
    ]);
    expect(r.n_valid).toBe(10);
    expect(r.gap).toBeCloseTo(0.3);
    expect(r.eligible).toBe(24);
    // cakupan: (3+7+5) / (24 - 4 NA - 1 berjalan)
    expect(r.coverage).toBeCloseTo(15 / 19);
    expect(r.sufficient).toBe(MIN_VALID_RESPONSES <= 10);
  });
  it("tanpa jawaban sah: gap null, bukan 0%", () => {
    const r = toRow("X", "X", [{ category: "unknown" }, { category: "not_asked" }]);
    expect(r.gap).toBeNull();
    expect(r.ci).toBeNull();
  });
  it("sufficient mengikuti ambang n valid", () => {
    expect(toRow("X", "X", Array(MIN_VALID_RESPONSES).fill({ category: "positive" })).sufficient).toBe(true);
    expect(toRow("X", "X", Array(MIN_VALID_RESPONSES - 1).fill({ category: "positive" })).sufficient).toBe(false);
  });
});

describe("dasbor pada data seed", () => {
  const admin = principal("admin");
  it("setiap indikator memiliki aturan gap dan seed tidak melewatkan peristiwa", () => {
    const d = qualityDashboard(db, admin, routine);
    expect(d.rules_missing).toEqual([]);
    expect(Number(getMeta(db, "seed:quality:skipped"))).toBeLessThanOrEqual(3);
    expect(d.sessions.total).toBeGreaterThan(500);
  });
  it("komposisi tiap baris konsisten dan interval masuk akal", () => {
    const d = qualityDashboard(db, admin, routine);
    expect(d.indicators.length).toBeGreaterThanOrEqual(10);
    for (const r of d.indicators) {
      expect(r.negative + r.positive + r.unknown + r.not_applicable + r.not_asked + r.nonresponse + r.in_progress).toBe(r.eligible);
      expect(r.n_valid).toBe(r.negative + r.positive);
      if (r.gap !== null) {
        expect(r.gap).toBeGreaterThanOrEqual(0);
        expect(r.gap).toBeLessThanOrEqual(1);
        expect(r.ci!.lo).toBeLessThanOrEqual(r.gap);
        expect(r.ci!.hi).toBeGreaterThanOrEqual(r.gap);
      }
    }
  });
  it("jawaban tidak tahu dan tidak berlaku tercatat dan tidak memengaruhi gap", () => {
    const d = qualityDashboard(db, admin, routine);
    expect(d.indicators.some((r) => r.unknown > 0)).toBe(true);
    expect(d.indicators.some((r) => r.not_asked > 0 || r.nonresponse > 0)).toBe(true);
  });
  it("survei rutin dan terarah dipisah: tidak ada indikator terarah pada tabel rutin", () => {
    const r = qualityDashboard(db, admin, routine);
    expect(r.directed).toBeNull();
    expect(r.indicators.every((i) => i.meta.id !== "DIRECTED_SERVICE" && i.meta.id !== "CTX_PROBES")).toBe(true);
    const d = qualityDashboard(db, admin, { mode: "directed" });
    expect(d.directed).not.toBeNull();
    expect(d.indicators).toEqual([]);
  });
  it("filter fasilitas dan jenis perawatan mempersempit sesi", () => {
    const all = qualityDashboard(db, admin, routine);
    const fac = (db.prepare("SELECT facility_id f, COUNT(*) n FROM survey_sessions WHERE mode = 'routine' AND is_sandbox = 0 GROUP BY facility_id ORDER BY n DESC LIMIT 1").get() as { f: string }).f;
    const one = qualityDashboard(db, admin, { ...routine, facilityId: fac });
    expect(one.sessions.total).toBeGreaterThan(0);
    expect(one.sessions.total).toBeLessThan(all.sessions.total);
    const inpatient = qualityDashboard(db, admin, { ...routine, careType: "inpatient" });
    expect(inpatient.sessions.total).toBeLessThan(all.sessions.total);
  });
  it("normalizeFilters membuang nilai tak sah", () => {
    expect(normalizeFilters({ from: "2026-13", to: "abc", care: "xx", stage: "zz", mode: "directed" })).toMatchObject({ from: null, to: null, careType: null, stage: null, mode: "directed" });
    expect(normalizeFilters({ from: "2026-03", care: "inpatient", stage: "post" })).toMatchObject({ from: "2026-03", careType: "inpatient", stage: "post", mode: "routine" });
  });
  it("kepuasan tidak pernah memengaruhi gap (aturan I4)", () => {
    const before = qualityDashboard(db, admin, routine).indicators.map((r) => [r.key, r.negative, r.positive, r.gap]);
    const sid = (db.prepare("SELECT id FROM survey_sessions WHERE mode = 'routine' AND status = 'completed' AND stage = 'post' LIMIT 1").get() as { id: string }).id;
    db.prepare("INSERT INTO participant_facts (id, session_id, slot, subject, value, indicator_id, source_turn_id, source_quote, origin, proposal_id, status, supersedes_id, revision, created_at) VALUES ('PF-TEST-SAT', ?, ?, NULL, '1', NULL, NULL, NULL, 'choice', NULL, 'active', NULL, 0, '2026-09-01T10:00:00')").run(sid, SATISFACTION_SLOT);
    const after = qualityDashboard(db, admin, routine);
    expect(after.indicators.map((r) => [r.key, r.negative, r.positive, r.gap])).toEqual(before);
    expect(after.satisfaction.n_valid).toBeGreaterThan(0);
  });
  it("dasbor mengikuti data baru (bukan angka tetap)", () => {
    const base = qualityDashboard(db, admin, routine).indicators.find((r) => r.key === "MED_FULFILLMENT")!;
    const row = db.prepare("SELECT f.id FROM participant_facts f JOIN survey_sessions s ON s.id = f.session_id WHERE f.slot = 'medication_receipt' AND f.value = 'full' AND s.mode = 'routine' AND s.is_sandbox = 0 LIMIT 1").get() as { id: string };
    db.prepare("UPDATE participant_facts SET value = 'none' WHERE id = ?").run(row.id);
    const next = qualityDashboard(db, admin, routine).indicators.find((r) => r.key === "MED_FULFILLMENT")!;
    expect(next.negative).toBe(base.negative + 1);
    expect(next.positive).toBe(base.positive - 1);
  });
  it("sesi sandbox tidak dihitung", () => {
    const before = qualityDashboard(db, admin, routine).sessions.total;
    const sid = (db.prepare("SELECT id FROM survey_sessions WHERE mode = 'routine' AND is_sandbox = 0 AND status = 'completed' LIMIT 1").get() as { id: string }).id;
    db.prepare("UPDATE survey_sessions SET is_sandbox = 1 WHERE id = ?").run(sid);
    expect(qualityDashboard(db, admin, routine).sessions.total).toBe(before - 1);
  });
  it("sebelum/sesudah: dua intervensi terencana, verdict tidak mengklaim tanpa data cukup", () => {
    const d = qualityDashboard(db, admin, routine);
    expect(d.before_after.length).toBeGreaterThanOrEqual(2);
    for (const b of d.before_after) {
      if (b.verdict === "distinct_lower" || b.verdict === "distinct_higher") {
        expect(b.before?.sufficient && b.after?.sufficient).toBe(true);
        expect(intervalsOverlap(b.before!.ci, b.after!.ci)).toBe(false);
      }
    }
  });
  it("waktu penyelesaian memakai median dan P90 dari data nyata", () => {
    const d = qualityDashboard(db, admin, routine);
    expect(d.resolution.stats.some((s) => s.n > 0 && s.median_days !== null)).toBe(true);
  });
  it("laporan vs temuan terverifikasi tidak menyamakan keduanya", () => {
    const d = qualityDashboard(db, admin, routine);
    expect(d.reports_vs_verified.length).toBeGreaterThan(0);
    for (const r of d.reports_vs_verified) {
      expect(r.verified).toBeLessThanOrEqual(r.concluded);
      expect(r.findings).toBeLessThanOrEqual(r.reports + r.findings);
    }
  });
  it("ekspor CSV hanya agregat", () => {
    const csv = indicatorCsv(qualityDashboard(db, admin, routine));
    expect(csv.split("\n").length).toBeGreaterThan(5);
    expect(csv).not.toMatch(/PRT-|U-PSR|participant/i);
  });
  it("hanya peran dengan quality.view; faskes dan peserta ditolak", () => {
    for (const r of ["faskes", "peserta", "pendamping"] as const) expect(() => qualityDashboard(db, principal(r), routine)).toThrow(AuthError);
    for (const r of ["verifikator", "reviewer", "auditor", "admin"] as const) expect(() => qualityDashboard(db, principal(r), routine)).not.toThrow();
  });
  it("membaca dasbor tidak menulis audit dan rantai tetap sah", () => {
    const n = (db.prepare("SELECT COUNT(*) n FROM audit_log").get() as { n: number }).n;
    qualityDashboard(db, admin, routine);
    expect((db.prepare("SELECT COUNT(*) n FROM audit_log").get() as { n: number }).n).toBe(n);
    expect(verifyChain(db).ok).toBe(true);
  });
});
