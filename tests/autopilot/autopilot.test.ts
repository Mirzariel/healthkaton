import { describe, expect, it } from "vitest";
import { confirmService } from "../../src/lib/actions";
import { verifyChain } from "../../src/lib/audit";
import { confirmAuto, getAuto, getAutoStats, getMode, overrideAuto, reopenAuto, runAutopilot, setMode } from "../../src/lib/autopilot";
import { openDb, seedDatabase } from "../../src/lib/db";
import { getHero } from "../../src/lib/queries";

function fresh() {
  const db = openDb(":memory:");
  seedDatabase(db);
  return db;
}
const caseOf = (db: ReturnType<typeof fresh>, claimId: string, modus: string) =>
  (db.prepare("SELECT c.id FROM cases c JOIN findings f ON f.id=c.finding_id WHERE f.claim_id=? AND f.modus=?").get(claimId, modus) as { id: string }).id;

describe("autopilot keputusan", () => {
  it("mode awal manual; hanya verifikator/auditor yang boleh mengubah", () => {
    const db = fresh();
    expect(getMode(db)).toBe("manual");
    expect(() => setMode(db, "otomatis", "casemix")).toThrow();
    setMode(db, "otomatis", "verifikator");
    expect(getMode(db)).toBe("otomatis");
  });

  it("memutus antrean; phantom tanpa jawaban peserta menunggu konfirmasi", () => {
    const db = fresh();
    const h = getHero(db);
    const r = runAutopilot(db);
    expect(r.decided.length).toBeGreaterThan(0);
    const dup = caseOf(db, h.claims.dup.id, "repeat_billing");
    expect(getAuto(db, dup)?.decision).toBe("tolak");
    const phantom = caseOf(db, h.claims.paid.id, "phantom");
    expect(getAuto(db, phantom)?.state).toBe("menunggu_peserta");
    expect(verifyChain(db).ok).toBe(true);
  });

  it("jawaban 'tidak pernah' dari peserta → koreksi otomatis senilai layanan bermasalah", () => {
    const db = fresh();
    const h = getHero(db);
    setMode(db, "otomatis", "verifikator");
    runAutopilot(db);
    confirmService(db, h.ids.bronko_service, h.ids.participant_id, "tidak_sesuai", "");
    runAutopilot(db, { participantId: h.ids.participant_id });
    const a = getAuto(db, caseOf(db, h.claims.paid.id, "phantom"))!;
    expect(a.state).toBe("diputus");
    expect(a.decision).toBe("koreksi");
    expect(a.correction).toBeGreaterThan(0);
  });

  it("petugas bisa konfirmasi, ubah, atau membuka kembali; semua tercatat", () => {
    const db = fresh();
    const r = runAutopilot(db);
    const [a, b, c] = r.decided.map((d) => d.caseId);
    confirmAuto(db, a, "verifikator");
    overrideAuto(db, b, { decision: "eskalasi", reason: "Perlu audit lanjutan oleh tim.", correction: null }, "auditor");
    reopenAuto(db, c, "verifikator");
    expect(getAuto(db, a)?.review_status).toBe("dikonfirmasi");
    expect(getAuto(db, b)?.review_status).toBe("diubah");
    expect((db.prepare("SELECT status FROM cases WHERE id=?").get(c) as { status: string }).status).toBe("open");
    expect(() => confirmAuto(db, a, "casemix")).toThrow();
    expect(getAutoStats(db).changed).toBe(2);
    expect(verifyChain(db).ok).toBe(true);
  });
});
