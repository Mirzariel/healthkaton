import { describe, expect, it } from "vitest";
import { verifyChain } from "../../src/lib/audit";
import { openDb, seedDatabase } from "../../src/lib/db";
import { buildCtx } from "../../src/lib/engine/context";
import { reviewClaim, runAll } from "../../src/lib/engine/pipeline";
import { generate } from "../../src/lib/seed/generate";

const seeded = generate();
const reviews = runAll(seeded.ds);
const byClaim = new Map(reviews.map((r) => [r.claim.id, r]));
const truth = new Map(seeded.truth.map((t) => [t.claim_id, t]));

describe("generator", () => {
  it("deterministik dengan benih yang sama", () => {
    const a = generate();
    expect(a.ds.claims.length).toBe(seeded.ds.claims.length);
    expect(a.ds.claims[100]).toEqual(seeded.ds.claims[100]);
  });
  it("memuat semua modus dan padanan sah", () => {
    const labels = new Set(seeded.truth.map((t) => t.label));
    for (const l of ["repeat_billing", "fragmentation", "phantom", "legit_lookalike", "coding", "membership"]) {
      expect(labels.has(l as never)).toBe(true);
    }
  });
});

describe("mesin: tokoh demo Bu Sari", () => {
  it("menandai tiga tagihan pada satu perawatan", () => {
    const h = seeded.hero;
    expect(byClaim.get(h.claim_paid)!.findings.map((f) => f.modus)).toContain("phantom");
    expect(byClaim.get(h.claim_dup)!.findings.map((f) => f.modus)).toContain("repeat_billing");
    expect(byClaim.get(h.claim_split)!.findings.map((f) => f.modus)).toContain("fragmentation");
  });
  it("konfirmasi peserta mengubah skor phantom", () => {
    const h = seeded.hero;
    const before = byClaim.get(h.claim_paid)!.findings.find((f) => f.modus === "phantom")!.score;
    const ds2 = { ...seeded.ds, confirmations: [...seeded.ds.confirmations, { id: "K-X", service_id: h.bronko_service, participant_id: h.participant_id, answer: "tidak_sesuai" as const, note: "", at: "2026-10-05T10:00" }] };
    const after = reviewClaim(buildCtx(ds2), seeded.ds.claims.find((c) => c.id === h.claim_paid)!).findings.find((f) => f.modus === "phantom")!.score;
    expect(after).toBeGreaterThan(before);
    const ds3 = { ...seeded.ds, confirmations: [...seeded.ds.confirmations, { id: "K-Y", service_id: h.bronko_service, participant_id: h.participant_id, answer: "sesuai" as const, note: "", at: "2026-10-05T10:00" }] };
    const lower = reviewClaim(buildCtx(ds3), seeded.ds.claims.find((c) => c.id === h.claim_paid)!).findings.find((f) => f.modus === "phantom")?.score ?? 0;
    expect(lower).toBeLessThan(before);
  });
});

describe("mesin vs ground truth", () => {
  const modi = ["repeat_billing", "fragmentation", "phantom"] as const;
  for (const m of modi) {
    it(`recall ${m} >= 0.9; presisi severity sedang+ >= 0.9; presisi total >= 0.6`, () => {
      const positives = seeded.truth.filter((t) => t.label === m);
      const flaggedAll = reviews.filter((r) => r.findings.some((f) => f.modus === m));
      const flaggedMed = reviews.filter((r) => r.findings.some((f) => f.modus === m && f.severity !== "low"));
      const tp = positives.filter((t) => byClaim.get(t.claim_id)!.findings.some((f) => f.modus === m)).length;
      const tpMed = flaggedMed.filter((r) => truth.get(r.claim.id)?.label === m).length;
      expect(positives.length).toBeGreaterThan(10);
      expect(tp / positives.length).toBeGreaterThanOrEqual(0.9);
      expect(tpMed / flaggedMed.length).toBeGreaterThanOrEqual(0.9);
      expect(tp / flaggedAll.length).toBeGreaterThanOrEqual(0.6);
    });
  }
  it("padanan sah mirip repeat billing tidak ditandai", () => {
    const l = seeded.truth.filter((t) => t.label === "legit_lookalike" && t.mimics === "repeat_billing");
    expect(l.length).toBeGreaterThan(0);
    for (const t of l) expect(byClaim.get(t.claim_id)!.findings.filter((f) => f.modus === "repeat_billing")).toHaveLength(0);
  });
  it("kasus sah yang ditandai hanya berseverity low (bisa diloloskan setelah pemeriksaan)", () => {
    for (const t of seeded.truth.filter((x) => x.label === "legit_lookalike")) {
      for (const f of byClaim.get(t.claim_id)!.findings) expect(f.severity).toBe("low");
    }
  });
  it("populasi bersih hampir tanpa temuan", () => {
    const clean = reviews.filter((r) => !truth.has(r.claim.id));
    const flagged = clean.filter((r) => r.findings.length > 0);
    expect(flagged.length / clean.length).toBeLessThan(0.03);
  });
});

describe("tahap pendukung", () => {
  it("koding dan kepesertaan terdeteksi pada kasus injeksi", () => {
    for (const t of seeded.truth.filter((x) => x.label === "coding")) {
      expect(byClaim.get(t.claim_id)!.stages[2].status).toBe("fail");
    }
    for (const t of seeded.truth.filter((x) => x.label === "membership")) {
      expect(byClaim.get(t.claim_id)!.stages[0].status).toBe("fail");
    }
  });
});

describe("basis data", () => {
  it("seed membuat kasus dan rantai audit yang valid", () => {
    const db = openDb(":memory:");
    seedDatabase(db, seeded);
    const nCases = (db.prepare("SELECT COUNT(*) n FROM cases").get() as { n: number }).n;
    expect(nCases).toBeGreaterThan(50);
    expect(verifyChain(db).ok).toBe(true);
  });
  it("seed ulang menghasilkan ID kasus yang sama (demo deterministik)", () => {
    const ids = () => {
      const db = openDb(":memory:");
      seedDatabase(db, seeded);
      return (db.prepare("SELECT id FROM cases ORDER BY id").all() as { id: string }[]).map((r) => r.id);
    };
    const a = ids();
    const b = ids();
    expect(a[0]).toBe("KS-0001");
    expect(b).toEqual(a);
  });
  it("rantai audit terdeteksi rusak bila entri diubah", () => {
    const db = openDb(":memory:");
    seedDatabase(db, seeded);
    db.prepare("UPDATE audit_log SET detail='{\"x\":1}' WHERE id=5").run();
    const c = verifyChain(db);
    expect(c.ok).toBe(false);
    expect(c.brokenAt).toBe(5);
  });
});
