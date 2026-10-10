import { beforeAll, describe, expect, it } from "vitest";
import { verifyChain } from "../src/lib/audit";
import { ROLES, type Principal } from "../src/lib/auth/principal";
import {
  approveFraudEscalation, closeCase, completeFollowUp, createAction, decideProof, lapseOverdueClarifications, proposeProof, recordClaimReview, reopenFinding, requestFollowUp,
  requestFraudEscalation, resolveAction, respondClarification, sendClarification, setCauses, startAction, startReview,
} from "../src/lib/cases/core";
import { openDb } from "../src/lib/db";
import { setNow } from "../src/lib/clock";
import { seedAll } from "../src/lib/seed";

const P = (id: string, role: Principal["role"], over: Partial<Principal> = {}): Principal => ({ id: `${role}:${id}`, name: id, role, facilityId: null, participantId: null, companionId: null, ...over });
const ver = P("U-VER-1", "verifikator");
const ver2 = P("U-VER-2", "verifikator");
const rev = P("U-REV-1", "reviewer");
const aud = P("U-AUD-1", "auditor");
const fsk = P("U-FSK-1", "faskes", { facilityId: "FAC-RSHB" });
const fskOther = P("U-FSK-2", "faskes", { facilityId: "FAC-RSNM" });

describe("sinyal → temuan → kasus (seed)", () => {
  const db = openDb(":memory:");
  beforeAll(() => seedAll(db));
  const q = <T,>(sql: string, ...a: unknown[]) => db.prepare(sql).all(...a) as T[];

  it("tiga tagihan Bu Sari menghasilkan temuan netral berstatus Sinyal", () => {
    const f = q<{ type: string; claim_id: string; proof_status: string; title: string; summary: string }>("SELECT type, claim_id, proof_status, title, summary FROM findings WHERE claim_id IN ('C-0001','C-0002','C-0003')");
    const has = (claim: string, type: string) => f.some((x) => x.claim_id === claim && x.type === type);
    expect(has("C-0001", "T1")).toBe(true);
    expect(has("C-0002", "T2")).toBe(true);
    expect(has("C-0003", "T3")).toBe(true);
    expect(f.every((x) => x.proof_status === "signal")).toBe(true);
    expect(f.map((x) => `${x.title} ${x.summary}`).join(" ")).not.toMatch(/fiktif|phantom|saksi|penipuan/i);
  });
  it("tidak ada penyebab terisi pada temuan yang belum terbukti (aturan I1, juga di basis data)", () => {
    expect(q("SELECT 1 FROM findings WHERE causes_json IS NOT NULL AND proof_status <> 'verified'")).toHaveLength(0);
    expect(() => db.prepare("UPDATE findings SET causes_json = '[\"administrative\"]' WHERE id = 'F-0001'").run()).toThrow();
  });
  it("kasus ditugaskan otomatis dengan alasan yang dicatat", () => {
    const a = q<{ reason: string; assignee_id: string }>("SELECT reason, assignee_id FROM assignments LIMIT 1");
    expect(a[0].assignee_id).toMatch(/^verifikator:/);
    expect(a[0].reason).toMatch(/Beban aktif/);
  });
  it("sinyal menangkap pola yang disuntikkan dan tidak menandai episode bersih", () => {
    const truth = q<{ claim_id: string; label: string; mimics: string | null }>("SELECT claim_id, label, mimics FROM ground_truth");
    const score = new Map(q<{ claim_id: string; s: number }>("SELECT claim_id, MAX(score) s FROM findings WHERE claim_id IS NOT NULL AND source <> 'pending' GROUP BY claim_id").map((x) => [x.claim_id, x.s]));
    const positives = truth.filter((t) => ["t1_missing_doc", "t2_repeat", "t3_continuation"].includes(t.label));
    expect(positives.filter((t) => score.has(t.claim_id)).length / positives.length).toBeGreaterThanOrEqual(0.95);
    // padanan sah yang menyerupai pola: skor rata-rata lebih rendah daripada pola sebenarnya (T3), dan T2 sah tidak ditandai
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
    const t3 = avg(truth.filter((t) => t.label === "t3_continuation").map((t) => score.get(t.claim_id) ?? 0));
    const t3Legit = avg(truth.filter((t) => t.label === "legit_lookalike" && t.mimics === "t3").map((t) => score.get(t.claim_id) ?? 0));
    expect(t3Legit).toBeLessThan(t3);
    expect(truth.filter((t) => t.label === "legit_lookalike" && t.mimics === "t2").every((t) => !score.has(t.claim_id))).toBe(true);
    // tidak ada temuan DETEKTOR di luar yang disuntikkan (episode bersih tidak ditandai). Temuan bersumber pending dibuat manusia, bukan detektor.
    const inScope = new Set(truth.map((t) => t.claim_id));
    expect([...score.keys()].filter((c) => !inScope.has(c))).toHaveLength(0);
  });
  it("rantai audit sah setelah seed", () => {
    expect(verifyChain(db).ok).toBe(true);
  });
});

describe("mesin status pembuktian", () => {
  const db = openDb(":memory:");
  let fid = "";
  let caseId = "";
  beforeAll(() => {
    seedAll(db);
    setNow("2026-10-10T10:00");
    const f = db.prepare("SELECT id, case_id FROM findings WHERE claim_id = 'C-0001'").get() as { id: string; case_id: string };
    fid = f.id;
    caseId = f.case_id;
  });

  it("peran tanpa wewenang ditolak server", () => {
    expect(() => startReview(db, fsk, fid)).toThrow(/tidak berwenang/);
    expect(() => decideProof(db, ver, 1, true, "x")).toThrow(/tidak berwenang/);
  });
  it("'Terbukti' ditolak tanpa bukti tertaut dan tanpa hak jawab faskes", () => {
    startReview(db, ver, fid);
    expect(() => proposeProof(db, ver, fid, "verified", "Dokumen tidak ditemukan di tiga sumber.")).toThrow(/bukti yang tertaut/);
  });
  it("klarifikasi memindahkan status; tenggat lewat TIDAK memverifikasi", () => {
    const klar = sendClarification(db, ver, { findingId: fid, issue: "Mohon dokumen pelaksanaan bronkoskopi tanggal 5 Maret 2026.", dueAt: "2026-10-12T10:00", minimalRef: "E-0001" });
    expect((db.prepare("SELECT proof_status s FROM findings WHERE id = ?").get(fid) as { s: string }).s).toBe("awaiting_clarification");
    setNow("2026-10-13T10:00");
    expect(lapseOverdueClarifications(db)).toBe(1);
    const f = db.prepare("SELECT proof_status s FROM findings WHERE id = ?").get(fid) as { s: string };
    expect(f.s).toBe("under_review");
    expect((db.prepare("SELECT status FROM clarifications WHERE id = ?").get(klar) as { status: string }).status).toBe("lapsed");
    // hak jawab terpenuhi, tetapi tanpa bukti pendukung tertaut tetap tidak boleh 'terbukti'
    expect(() => proposeProof(db, ver, fid, "verified", "Faskes tidak menjawab sampai tenggat.")).toThrow(/bukti yang tertaut/);
    // jawaban terlambat tetap diterima
    respondClarification(db, fsk, klar, "Dokumen sedang dicari di arsip rekam medis.");
    expect((db.prepare("SELECT status FROM clarifications WHERE id = ?").get(klar) as { status: string }).status).toBe("answered");
  });
  it("akses lintas faskes ditolak", () => {
    const k = db.prepare("SELECT id FROM clarifications LIMIT 1").get() as { id: string };
    expect(() => respondClarification(db, fskOther, k.id, "Jawaban dari faskes lain")).toThrow(/lintas faskes/);
  });
  it("usulan → persetujuan: pengusul tidak boleh menyetujui sendiri; penyebab hanya setelah terbukti", () => {
    db.prepare("INSERT INTO evidence_links (id, finding_id, case_id, direction, quote, linked_by, linked_at) VALUES ('EL-1', ?, ?, 'supports', 'tidak ada lembar tindakan bronkoskopi', 'verifikator:U-VER-1', '2026-10-13T10:00')").run(fid, caseId);
    expect(() => setCauses(db, rev, fid, ["administrative"], "Belum terbukti, seharusnya ditolak")).toThrow(/Terbukti/);
    const prop = proposeProof(db, ver, fid, "verified", "Lembar tindakan tidak ada; faskes sudah diberi kesempatan menjawab.");
    expect(() => decideProof(db, ver, prop, true, "setuju")).toThrow(/tidak berwenang|sendiri/);
    decideProof(db, rev, prop, true, "Bukti dan hak jawab terpenuhi.");
    expect((db.prepare("SELECT proof_status s FROM findings WHERE id = ?").get(fid) as { s: string }).s).toBe("verified");
    setCauses(db, rev, fid, ["administrative", "service_process"], "Pencatatan tidak lengkap dan alur dokumentasi tindakan belum berjalan.");
    const row = db.prepare("SELECT causes_json FROM findings WHERE id = ?").get(fid) as { causes_json: string };
    expect(JSON.parse(row.causes_json).sort()).toEqual(["administrative", "service_process"]);
  });
  it("dugaan fraud butuh dua pihak berbeda; tidak pernah otomatis", () => {
    expect(() => requestFraudEscalation(db, ver, fid, "Dasar eskalasi cukup panjang untuk uji.")).toThrow();
    const req = requestFraudEscalation(db, rev, fid, "Pola berulang pada tiga episode dan penjelasan alternatif sudah ditimbang.");
    expect(() => approveFraudEscalation(db, rev, req, true, "setuju sendiri")).toThrow();
    approveFraudEscalation(db, aud, req, true, "Disetujui untuk telaah lanjutan; ini dugaan, bukan putusan.");
    const row = db.prepare("SELECT causes_json FROM findings WHERE id = ?").get(fid) as { causes_json: string };
    expect(JSON.parse(row.causes_json)).toContain("suspected_fraud");
  });
  it("keputusan klaim dicatat sebagai simulasi dan terpisah dari status temuan", () => {
    expect(() => recordClaimReview(db, fsk, fid, "tolak", "faskes tidak boleh memutuskan")).toThrow(/tidak berwenang/);
    const id = recordClaimReview(db, ver2, fid, "koreksi_nilai", "Koreksi sesuai komponen yang tidak terdokumentasi.", 1200000);
    const d = db.prepare("SELECT simulated, kind FROM review_decisions WHERE id = ?").get(id) as { simulated: number; kind: string };
    expect(d).toEqual({ simulated: 1, kind: "claim_review" });
    expect((db.prepare("SELECT status FROM claims WHERE id = 'C-0001'").get() as { status: string }).status).toBe("paid"); // tidak ada eksekusi ke klaim
  });
  it("membuka ulang mengosongkan penyebab (basis data menolak penyebab tanpa 'terbukti')", () => {
    reopenFinding(db, rev, fid, "Dokumen baru ditemukan oleh faskes setelah penutupan.");
    const row = db.prepare("SELECT proof_status s, causes_json c FROM findings WHERE id = ?").get(fid) as { s: string; c: string | null };
    expect(row).toEqual({ s: "under_review", c: null });
  });
  it("transisi liar ditolak langsung oleh basis data", () => {
    expect(() => db.prepare("UPDATE findings SET proof_status = 'verified' WHERE proof_status = 'signal'").run()).toThrow(/transisi/);
    expect(() => db.prepare("UPDATE improvement_actions SET status = 'closed'").run()).not.toThrow(); // belum ada baris
  });
  it("tindakan perbaikan → tindak lanjut → konfirmasi peserta menutup tindakan", () => {
    const f2 = db.prepare("SELECT id FROM findings WHERE claim_id = 'C-0002'").get() as { id: string };
    const act = createAction(db, fsk, { findingId: fid, description: "Menautkan lembar tindakan ke pesanan layanan di SIMRS.", owner: "Kepala Rekam Medis", targetDate: "2026-11-30" });
    startAction(db, fsk, act);
    expect(() => requestFollowUp(db, ver, act, "P-0001", "2026-12-15")).toThrow(/tidak diizinkan/); // belum 'resolved'
    resolveAction(db, fsk, act, "Pesanan layanan kini otomatis menautkan lembar tindakan.");
    const [fu1, fu2] = requestFollowUp(db, ver, act, "P-0001", "2026-12-15");
    expect(() => closeCase(db, rev, caseId, "Tutup untuk uji")).toThrow();
    completeFollowUp(db, P("U-PSR-1", "peserta", { participantId: "P-0001" }), fu1, "resolved", "Kendala sudah selesai.");
    expect((db.prepare("SELECT status FROM improvement_actions WHERE id = ?").get(act) as { status: string }).status).toBe("follow_up_pending");
    completeFollowUp(db, ver, fu2, "resolved", "Pengukuran ulang baik.");
    expect((db.prepare("SELECT status FROM improvement_actions WHERE id = ?").get(act) as { status: string }).status).toBe("closed");
    void f2;
  });
  it("rantai audit tetap sah dan UPDATE/DELETE audit ditolak", () => {
    expect(verifyChain(db).ok).toBe(true);
    expect(() => db.prepare("UPDATE audit_log SET actor = 'x' WHERE id = 1").run()).toThrow(/append-only/);
    expect(() => db.prepare("DELETE FROM audit_log WHERE id = 1").run()).toThrow(/append-only/);
  });
  it("daftar peran lengkap", () => {
    expect(ROLES).toHaveLength(7);
  });
});
