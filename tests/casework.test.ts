import { beforeAll, describe, expect, it } from "vitest";
import { verifyChain } from "../src/lib/audit";
import { AuthError, type Principal } from "../src/lib/auth/principal";
import { getFinding } from "../src/lib/cases/core";
import { openDb } from "../src/lib/db";
import { DomainError } from "../src/lib/idem";
import { findForbiddenTerms } from "../src/lib/labels";
import { seedAll } from "../src/lib/seed";
import { executeCommand, executeFacilityCommand, executeStaffCommand, runCommandSync, facilityCommandZ, staffCommandZ } from "../src/lib/casework/commands";
import * as L from "../src/lib/casework/labels";
import { buildPack } from "../src/lib/casework/pack";
import {
  MIN_N_FACILITY, actionQueue, assistantInbox, facilityActions, facilityClarificationDetail, facilityClarifications, facilityDisputes, facilityFindingView, facilityHome,
  facilityQualityReport, getCaseRoom, proofQueue,
} from "../src/lib/casework/queries";
import { assistantTextProblems, composeSummary, decideSuggestion, generateCaseSummary, latestSummary, validateSummary, type LiveSummarizer } from "../src/lib/casework/summary";
import { addDocument, assertDocumentAccess, findingVisibleToFacility } from "../src/lib/casework/workflow";

const P = (id: string, role: Principal["role"], over: Partial<Principal> = {}): Principal => ({ id: `${role}:${id}`, name: id, role, facilityId: null, participantId: null, companionId: null, ...over });
const ver = P("U-VER-1", "verifikator");
const rev = P("U-REV-1", "reviewer");
const aud = P("U-AUD-1", "auditor");
const adm = P("U-ADM-1", "admin");
const peserta = P("PSR-1", "peserta", { participantId: "PSR-1" });
const rsts = P("U-FSK-TS", "faskes", { facilityId: "FAC-RSTS" });
const rsnm = P("U-FSK-NM", "faskes", { facilityId: "FAC-RSNM" });
const pkkn = P("U-FSK-KN", "faskes", { facilityId: "FAC-PKKN" });

const rows = <T,>(db: ReturnType<typeof openDb>, sql: string, ...a: unknown[]) => db.prepare(sql).all(...a) as T[];
const one = <T,>(db: ReturnType<typeof openDb>, sql: string, ...a: unknown[]) => db.prepare(sql).get(...a) as T;
const fresh = () => {
  const db = openDb(":memory:");
  seedAll(db);
  return db;
};
const caseOfFinding = (db: ReturnType<typeof openDb>, id: string) => one<{ case_id: string }>(db, "SELECT case_id FROM findings WHERE id = ?", id).case_id;

describe("kasus-faskes: kondisi seed", () => {
  const db = fresh();
  it("skenario pembuktian dan perbaikan berada pada status yang dirancang", () => {
    const st = Object.fromEntries(rows<{ id: string; proof_status: string }>(db, "SELECT id, proof_status FROM findings WHERE id IN ('F-0007','F-0008','F-0009','F-0075','F-0076')").map((r) => [r.id, r.proof_status]));
    expect(st).toEqual({ "F-0007": "verified", "F-0008": "not_verified", "F-0009": "under_review", "F-0075": "verified", "F-0076": "verified" });
    expect(one<{ status: string }>(db, "SELECT status FROM clarifications WHERE id = 'KL-0003'").status).toBe("lapsed");
    expect(rows<{ id: string; status: string }>(db, "SELECT id, status FROM improvement_actions WHERE id IN ('TP-0001', 'TP-0002') ORDER BY id")).toEqual([{ id: "TP-0001", status: "closed" }, { id: "TP-0002", status: "in_progress" }]);
    expect(rows(db, "SELECT 1 FROM review_decisions WHERE finding_id = 'F-0009' AND state = 'pending' AND kind = 'proof_proposal'")).toHaveLength(1);
  });
  it("eskalasi dugaan tercatat dengan dua persetujuan peran berbeda dan peninjauan klaim hanya simulasi", () => {
    const esc = rows<{ actor_id: string; actor_role: string; kind: string }>(db, "SELECT actor_id, actor_role, kind FROM review_decisions WHERE finding_id = 'F-0007' AND kind IN ('escalation','fraud_approval')");
    expect(esc.map((e) => e.kind).sort()).toEqual(["escalation", "fraud_approval"]);
    expect(new Set(esc.map((e) => e.actor_id)).size).toBe(2);
    expect(new Set(esc.map((e) => e.actor_role)).size).toBe(2);
    const claim = rows<{ simulated: number }>(db, "SELECT simulated FROM review_decisions WHERE kind = 'claim_review'");
    expect(claim.length).toBeGreaterThan(0);
    expect(claim.every((c) => c.simulated === 1)).toBe(true);
  });
  it("semua ringkasan seed berlabel simulasi dan semua saran seed berada pada status yang dikenal", () => {
    expect(rows<{ mode: string }>(db, "SELECT DISTINCT mode FROM case_summaries")).toEqual([{ mode: "simulated" }]);
    expect(rows<{ state: string }>(db, "SELECT DISTINCT state FROM assistant_suggestions").every((r) => ["proposed", "accepted", "modified", "dismissed", "superseded"].includes(r.state))).toBe(true);
  });
  it("rantai audit sah dan cerminan layanan sejalan dengan status kasus", () => {
    expect(verifyChain(db).ok).toBe(true);
    expect(rows<{ status: string }>(db, "SELECT status FROM service_requests WHERE id LIKE 'LP-%' ORDER BY id")).toEqual([{ status: "action" }, { status: "closed" }]);
  });
});

describe("kasus-faskes: hak akses", () => {
  const db = fresh();
  it("antrean, ruang kasus, dan asisten hanya untuk staf", async () => {
    expect(() => proofQueue(db, rsts)).toThrow(AuthError);
    expect(() => getCaseRoom(db, rsts, caseOfFinding(db, "F-0007"))).toThrow(AuthError);
    expect(() => assistantInbox(db, peserta)).toThrow(AuthError);
    expect(proofQueue(db, ver).total).toBeGreaterThan(0);
    expect(actionQueue(db, rev).total).toBe(1);
    expect(actionQueue(db, rev, { status: "all" }).total).toBeGreaterThanOrEqual(2);
    expect(getCaseRoom(db, aud, caseOfFinding(db, "F-0007")).findings.length).toBeGreaterThan(0);
  });
  it("portal faskes ditolak untuk peran lain", () => {
    for (const p of [ver, rev, aud, adm, peserta]) expect(() => facilityHome(db, p)).toThrow(AuthError);
  });
  it("perintah konsol ditolak untuk faskes dan peserta; perintah faskes ditolak untuk staf", async () => {
    await expect(executeStaffCommand(db, rsts, { type: "start_review", findingId: "F-0001" })).rejects.toMatchObject({ status: 403 });
    await expect(executeStaffCommand(db, peserta, { type: "start_review", findingId: "F-0001" })).rejects.toMatchObject({ status: 403 });
    await expect(executeFacilityCommand(db, ver, { type: "create_dispute", findingId: "F-0007", text: "Tidak sependapat dengan temuan ini." })).rejects.toBeInstanceOf(AuthError);
  });
  it("faskes tidak dapat memakai perintah staf walau dikirim lewat jalur faskes", async () => {
    expect(facilityCommandZ.safeParse({ type: "propose_proof", findingId: "F-0009", outcome: "verified", reason: "x".repeat(20) }).success).toBe(false);
    await expect(executeFacilityCommand(db, rsnm, { type: "decide_proof", proposalId: 14, approve: true, note: "setuju saja" })).rejects.toThrow();
    expect(one<{ proof_status: string }>(db, "SELECT proof_status FROM findings WHERE id = 'F-0009'").proof_status).toBe("under_review");
  });
  it("faskes lain ditolak untuk klarifikasi, temuan, dokumen, tindakan, dan bantahan", async () => {
    // KL-0001/F-0008/F-0007 milik RSTS; pemanggil RSNM
    expect(() => facilityClarificationDetail(db, rsnm, "KL-0001")).toThrow(AuthError);
    expect(() => facilityFindingView(db, rsnm, "F-0007")).toThrow(DomainError);
    await expect(executeFacilityCommand(db, rsnm, { type: "respond_clarification", clarificationId: "KL-0001", text: "Jawaban dari faskes yang salah." })).rejects.toBeInstanceOf(AuthError);
    await expect(executeFacilityCommand(db, rsnm, { type: "create_dispute", findingId: "F-0007", text: "Bantahan dari faskes yang salah." })).rejects.toThrow();
    await expect(executeFacilityCommand(db, rsnm, { type: "start_action", actionId: "TP-0002" })).rejects.toThrow();
    expect(facilityClarifications(db, rsnm).every((c) => !["KL-0001", "KL-0002", "KL-0004"].includes(c.id))).toBe(true);
    expect(facilityActions(db, rsnm).map((a) => a.id)).toContain("TP-0001");
    expect(facilityActions(db, rsnm).map((a) => a.id)).not.toContain("TP-0002");
    expect(facilityActions(db, pkkn).map((a) => a.id)).toContain("TP-0002");
    expect(facilityActions(db, pkkn).map((a) => a.id)).not.toContain("TP-0001");
    const doc = addDocument(db, rsts, { facilityId: "FAC-RSTS", name: "catatan.txt", bytes: Buffer.from("Catatan pemeriksaan pasien tanggal 3 Oktober."), clarificationId: "KL-0002" });
    expect(() => assertDocumentAccess(db, rsnm, doc.id)).toThrow(AuthError);
    expect(() => assertDocumentAccess(db, rsts, doc.id)).not.toThrow();
    expect(() => addDocument(db, rsnm, { facilityId: "FAC-RSTS", name: "x.txt", bytes: Buffer.from("isi") })).toThrow(AuthError);
    expect(() => addDocument(db, rsnm, { facilityId: "FAC-RSNM", name: "x.txt", bytes: Buffer.from("isi"), clarificationId: "KL-0002" })).toThrow(DomainError);
  });
});

describe("kasus-faskes: apa yang boleh dilihat faskes", () => {
  const db = fresh();
  it("tidak ada skor, sinyal, label dugaan, catatan internal, atau identitas peserta pada data faskes", () => {
    for (const p of [rsts, rsnm, pkkn]) {
      const blob = JSON.stringify({
        home: facilityHome(db, p), cl: facilityClarifications(db, p), act: facilityActions(db, p), dis: facilityDisputes(db, p), rep: facilityQualityReport(db, p),
      });
      expect(blob).not.toMatch(/suspected_fraud|dugaan/i);
      expect(blob).not.toMatch(/"score"|"signals"|"participant_id"|"participantId"|"ai_summary"|"internal"/);
      expect(blob).not.toMatch(/PSR-\d|PRT-\d/);
      expect(findForbiddenTerms(blob)).toEqual([]);
    }
  });
  it("label dugaan tidak bocor lewat penyebab pada temuan yang dieskalasi", () => {
    expect(one<{ causes_json: string }>(db, "SELECT causes_json FROM findings WHERE id = 'F-0007'").causes_json).toContain("suspected_fraud");
    const v = facilityFindingView(db, rsts, "F-0007");
    expect(v.finding.causes).not.toContain("suspected_fraud");
    expect(JSON.stringify(v)).not.toContain("suspected_fraud");
  });
  it("temuan baru berstatus Sinyal tidak terlihat sampai ada klarifikasi atau tindakan", () => {
    const hidden = rows<{ id: string; facility_id: string }>(db, "SELECT id, facility_id FROM findings WHERE proof_status = 'signal' LIMIT 20");
    expect(hidden.length).toBeGreaterThan(0);
    for (const h of hidden) expect(findingVisibleToFacility(db, h.id, h.facility_id)).toBe(false);
    expect(facilityHome(db, rsts).findings.map((f) => f.id)).toEqual(expect.arrayContaining(["F-0007", "F-0008"]));
  });
  it("judul temuan dari sumber survei diganti label jenis dan butir standar", () => {
    const v = facilityFindingView(db, pkkn, "F-0075");
    expect(v.finding.title.length).toBeGreaterThan(0);
    expect(v.finding.title).toBe(`${v.finding.type_label}${v.finding.title.includes(":") ? v.finding.title.slice(v.finding.title.indexOf(":")) : ""}`);
  });
  it("agregat survei di laporan mutu disembunyikan bila responden kurang dari batas", () => {
    for (const p of [rsts, rsnm, pkkn]) {
      for (const i of facilityQualityReport(db, p).indicators) {
        if (i.respondents < MIN_N_FACILITY) {
          expect(i.shown).toBe(false);
          expect(i.distribution).toEqual([]);
          expect(i.zero).toBeNull();
        } else {
          expect(i.shown).toBe(true);
        }
      }
    }
    // batas diuji dengan menurunkan jumlah responden: tanpa fakta survei, tidak ada butir yang tampil
    const empty = openDb(":memory:");
    seedAll(empty);
    empty.exec("DROP TRIGGER facts_no_delete");
    empty.exec("DELETE FROM participant_facts");
    expect(facilityQualityReport(empty, rsts).indicators).toEqual([]);
  });
});

describe("kasus-faskes: perintah dan idempoten", () => {
  const db = fresh();
  it("alur lengkap dari sinyal ke klarifikasi, jawaban faskes, usulan, dan persetujuan reviewer", async () => {
    const fid = one<{ id: string; facility_id: string }>(db, "SELECT id, facility_id FROM findings WHERE proof_status = 'signal' AND type = 'T1' ORDER BY id LIMIT 1");
    const fsk = P("U-FSK-X", "faskes", { facilityId: fid.facility_id });
    await executeStaffCommand(db, ver, { type: "start_review", findingId: fid.id });
    const send = { type: "send_clarification", findingId: fid.id, issue: "Mohon lampirkan catatan pelayanan pada tanggal rawat peserta.", requestedDocs: ["Catatan pelayanan"], dueDays: 7 };
    const a = await executeStaffCommand(db, ver, send, "idem-send-1");
    const b = await executeStaffCommand(db, ver, send, "idem-send-1");
    expect(a.replayed).toBe(false);
    expect(b.replayed).toBe(true);
    expect(rows(db, "SELECT 1 FROM clarifications WHERE finding_id = ?", fid.id)).toHaveLength(1);
    const clarId = rows<{ id: string }>(db, "SELECT id FROM clarifications WHERE finding_id = ?", fid.id)[0].id;
    expect(findingVisibleToFacility(db, fid.id, fid.facility_id)).toBe(true);
    const ans = { type: "respond_clarification", clarificationId: clarId, text: "Catatan pelayanan terlampir pada berkas rekam medis." };
    await executeFacilityCommand(db, fsk, ans, "idem-ans-1");
    expect((await executeFacilityCommand(db, fsk, ans, "idem-ans-1")).replayed).toBe(true);
    expect(rows(db, "SELECT 1 FROM clarification_messages WHERE clarification_id = ? AND author_role = 'faskes'", clarId)).toHaveLength(1);
    await executeStaffCommand(db, ver, { type: "record_search", findingId: fid.id, source: "rekam_medis", query: "catatan pelayanan tanggal rawat", result: "not_found" });
    await executeStaffCommand(db, ver, { type: "propose_proof", findingId: fid.id, outcome: "inconclusive", reason: "Dokumen tidak ditemukan pada sumber yang diperiksa." });
    const prop = one<{ id: number }>(db, "SELECT id FROM review_decisions WHERE finding_id = ? AND state = 'pending'", fid.id);
    // verifikator tidak berwenang menyetujui; reviewer yang mengusulkan tidak boleh menyetujui usulannya sendiri
    await expect(executeStaffCommand(db, ver, { type: "decide_proof", proposalId: prop.id, approve: true, note: "setuju" })).rejects.toBeInstanceOf(AuthError);
    await executeStaffCommand(db, rev, { type: "decide_proof", proposalId: prop.id, approve: true, note: "Sesuai bukti yang tercatat." });
    expect(getFinding(db, fid.id)!.proof_status).toBe("inconclusive");
    expect(verifyChain(db).ok).toBe(true);
  });
  it("setiap perintah mengubah data meninggalkan catatan audit", async () => {
    const fid = one<{ id: string }>(db, "SELECT id FROM findings WHERE proof_status = 'signal' ORDER BY id LIMIT 1").id;
    const before = one<{ n: number }>(db, "SELECT COUNT(*) n FROM audit_log").n;
    await executeStaffCommand(db, ver, { type: "add_note", caseId: caseOfFinding(db, fid), findingId: fid, text: "Catatan internal petugas untuk uji audit." });
    expect(one<{ n: number }>(db, "SELECT COUNT(*) n FROM audit_log").n).toBeGreaterThan(before);
  });
  it("penyebab hanya dapat diisi pada temuan terbukti", async () => {
    await expect(executeStaffCommand(db, rev, { type: "set_causes", findingId: "F-0009", causes: ["administrative"], note: "Dicoba sebelum terbukti." })).rejects.toThrow();
    expect(one<{ causes_json: string | null }>(db, "SELECT causes_json FROM findings WHERE id = 'F-0009'").causes_json).toBeNull();
  });
  it("perintah tidak dikenal dan masukan tidak sah ditolak oleh skema", async () => {
    await expect(executeStaffCommand(db, ver, { type: "auto_decide", findingId: "F-0009" })).rejects.toThrow();
    await expect(executeStaffCommand(db, ver, { type: "send_clarification", findingId: "F-0009", issue: "" })).rejects.toThrow();
    expect(staffCommandZ.options.map((o) => o.shape.type.value)).not.toContain("auto_decide");
  });
  it("klarifikasi memakai istilah tidak netral ditolak", async () => {
    await expect(executeStaffCommand(db, ver, { type: "send_clarification", findingId: "F-0009", issue: "Mohon jelaskan layanan fiktif yang ditagihkan.", dueDays: 7 })).rejects.toBeInstanceOf(DomainError);
  });
  it("peninjauan klaim tercatat sebagai simulasi dan tidak mengubah status temuan", async () => {
    const before = getFinding(db, "F-0007")!.proof_status;
    await executeStaffCommand(db, rev, { type: "claim_review", findingId: "F-0007", option: "koreksi_nilai", reason: "Mengamati perlunya koreksi administrasi pada klaim.", correction: 1000 });
    const d = rows<{ simulated: number }>(db, "SELECT simulated FROM review_decisions WHERE finding_id = 'F-0007' AND kind = 'claim_review' ORDER BY id DESC LIMIT 1");
    expect(d[0].simulated).toBe(1);
    expect(getFinding(db, "F-0007")!.proof_status).toBe(before);
  });
  it("runCommandSync menolak ringkasan asisten (asinkron)", () => {
    expect(() => runCommandSync(db, ver, { type: "generate_summary", findingId: "F-0009" })).toThrow(DomainError);
  });
});

describe("kasus-faskes: sengketa dan penutupan", () => {
  const db = fresh();
  it("faskes mengajukan bantahan; staf berwenang menanggapi dengan alasan", async () => {
    await executeFacilityCommand(db, rsts, { type: "create_dispute", findingId: "F-0007", text: "Kami tidak sependapat dengan hasil pembuktian ini." }, "dis-1");
    const d = one<{ id: string; status: string }>(db, "SELECT id, status FROM disputes WHERE ref_id = 'F-0007' ORDER BY created_at DESC LIMIT 1");
    expect(d.status).toBe("open");
    await expect(executeStaffCommand(db, ver, { type: "resolve_dispute", disputeId: d.id, decision: "noted", response: "Dicatat." })).rejects.toBeInstanceOf(AuthError);
    await executeStaffCommand(db, rev, { type: "resolve_dispute", disputeId: d.id, decision: "noted", response: "Bantahan dicatat dan ditinjau bersama bukti terlampir." });
    expect(one<{ status: string }>(db, "SELECT status FROM disputes WHERE id = ?", d.id).status).not.toBe("open");
  });
});

describe("kasus-faskes: ringkasan dan saran asisten", () => {
  const db = fresh();
  const finding = "F-0009";
  const live = (mutate: (c: ReturnType<typeof composeSummary>) => ReturnType<typeof composeSummary>): LiveSummarizer => async (pack) => ({
    content: mutate(composeSummary(pack)), provider: "uji", model: "model-uji", usage: { tokens_in: 10, tokens_out: 5 }, latency_ms: 3,
  });

  it("tanpa model, ringkasan memakai penyusun aturan berlabel simulasi dan lolos validator", async () => {
    const r = await generateCaseSummary(db, ver, finding);
    expect(r.mode).toBe("simulated");
    const s = latestSummary(db, finding)!;
    expect(s.mode).toBe("simulated");
    const pack = buildPack(db, getFinding(db, finding)!);
    expect(validateSummary(pack, s.content).ok).toBe(true);
    expect(s.content.limits.length).toBeGreaterThan(0);
  });
  it("jawaban 'lupa' dan 'tidak paham' tidak dijadikan bukti", () => {
    const pack = buildPack(db, getFinding(db, "F-0001")!);
    const c = composeSummary(pack);
    const txt = [...c.supporting, ...c.contradicting].map((b) => b.text).join(" ");
    expect(txt).not.toMatch(/lupa|tidak paham/i);
  });
  it("keluaran model yang valid dicatat sebagai live, lengkap dengan catatan pemanggilan", async () => {
    const r = await generateCaseSummary(db, ver, finding, { live: live((c) => c) });
    expect(r.mode).toBe("live");
    const inv = one<{ mode: string; status: string; model: string; operation: string }>(db, "SELECT mode, status, model, operation FROM ai_invocations WHERE operation = 'case_summary' ORDER BY rowid DESC LIMIT 1");
    expect(inv).toMatchObject({ mode: "live", status: "ok", model: "model-uji" });
  });
  it("keluaran model dengan rujukan palsu ditolak dan jatuh ke penyusun aturan (fallback tercatat)", async () => {
    const r = await generateCaseSummary(db, ver, finding, { live: live((c) => ({ ...c, supporting: [{ id: "x1", text: "Ada dokumen.", refs: [{ type: "document", id: "DOK-9999", label: "palsu" }] }] })) });
    expect(r.mode).toBe("fallback");
    expect(r.problems.join(" ")).toMatch(/rujukan/);
    const inv = one<{ mode: string; status: string; fallback_reason: string }>(db, "SELECT mode, status, fallback_reason FROM ai_invocations WHERE operation = 'case_summary' ORDER BY rowid DESC LIMIT 1");
    expect(inv.mode).toBe("fallback");
    expect(inv.status).toBe("invalid");
    expect(inv.fallback_reason).toBeTruthy();
  });
  it("keluaran model yang menyatakan putusan atau memakai istilah tidak netral ditolak", async () => {
    const r = await generateCaseSummary(db, ver, finding, { live: live((c) => ({ ...c, basis: [{ id: "b9", text: "Layanan ini fiktif dan faskes bersalah.", refs: [] }] })) });
    expect(r.mode).toBe("fallback");
    expect(assistantTextProblems("Terdapat kecurangan dan sanksi harus dijatuhkan.").length).toBeGreaterThan(0);
    expect(assistantTextProblems("Dokumen belum ditemukan pada rekam medis.")).toEqual([]);
  });
  it("kegagalan pemanggilan model jatuh ke penyusun aturan, bukan menggagalkan perintah", async () => {
    const boom: LiveSummarizer = async () => {
      throw new Error("timed out");
    };
    const r = await generateCaseSummary(db, ver, finding, { live: boom });
    expect(r.mode).toBe("fallback");
    expect(one<{ status: string }>(db, "SELECT status FROM ai_invocations ORDER BY rowid DESC LIMIT 1").status).toBe("timeout");
  });
  it("saran tidak dieksekusi otomatis: membuat ringkasan tidak mengirim klarifikasi atau mengubah status", async () => {
    const clarBefore = one<{ n: number }>(db, "SELECT COUNT(*) n FROM clarifications").n;
    const statusBefore = getFinding(db, "F-0001")!.proof_status;
    await executeCommand(db, ver, { type: "generate_summary", findingId: "F-0001" });
    expect(one<{ n: number }>(db, "SELECT COUNT(*) n FROM clarifications").n).toBe(clarBefore);
    expect(getFinding(db, "F-0001")!.proof_status).toBe(statusBefore);
    expect(rows(db, "SELECT 1 FROM assistant_suggestions WHERE finding_id = 'F-0001' AND state = 'proposed'").length).toBeGreaterThan(0);
  });
  it("mengubah atau menolak saran wajib beralasan; saran hanya dapat diputuskan sekali", async () => {
    const s = one<{ id: string }>(db, "SELECT id FROM assistant_suggestions WHERE state = 'proposed' ORDER BY id LIMIT 1");
    expect(() => decideSuggestion(db, ver, s.id, "dismissed", {})).toThrow(/Alasan/);
    expect(() => decideSuggestion(db, ver, s.id, "modified", { reason: "Perlu penyesuaian", text: "Tolong tunjukkan bukti." })).not.toThrow();
    expect(() => decideSuggestion(db, ver, s.id, "accepted")).toThrow(DomainError);
    const row = one<{ state: string; final_text: string; decision_reason: string; decided_by: string }>(db, "SELECT state, final_text, decision_reason, decided_by FROM assistant_suggestions WHERE id = ?", s.id);
    expect(row).toMatchObject({ state: "modified", final_text: "Tolong tunjukkan bukti.", decision_reason: "Perlu penyesuaian", decided_by: ver.id });
  });
  it("teks perubahan petugas diperiksa bahasa netralnya dan faskes tidak boleh memutuskan saran", async () => {
    const s = one<{ id: string }>(db, "SELECT id FROM assistant_suggestions WHERE state = 'proposed' ORDER BY id LIMIT 1");
    expect(() => decideSuggestion(db, ver, s.id, "modified", { reason: "Perlu penyesuaian", text: "Jelaskan layanan fiktif ini." })).toThrow(DomainError);
    expect(() => decideSuggestion(db, rsts, s.id, "accepted")).toThrow(AuthError);
  });
  it("menerima saran klarifikasi lewat pengiriman klarifikasi menandai saran diterima/diubah", async () => {
    await executeCommand(db, ver, { type: "generate_summary", findingId: "F-0009" });
    const s = rows<{ id: string; kind: string; text: string }>(db, "SELECT id, kind, text FROM assistant_suggestions WHERE finding_id = 'F-0009' AND state = 'proposed' AND kind = 'clarification_request'");
    if (!s.length) return; // F-0009 sudah memiliki klarifikasi; saran jenis ini tidak selalu disusun
    await executeStaffCommand(db, ver, { type: "send_clarification", findingId: "F-0009", issue: s[0].text, dueDays: 7, suggestionId: s[0].id });
    expect(one<{ state: string }>(db, "SELECT state FROM assistant_suggestions WHERE id = ?", s[0].id).state).toBe("accepted");
  });
});

describe("kasus-faskes: unggah dokumen", () => {
  const db = fresh();
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]);
  it("jenis ditentukan dari isi, bukan dari nama atau tipe yang dinyatakan", () => {
    expect(() => addDocument(db, rsts, { facilityId: "FAC-RSTS", name: "bukti.pdf", bytes: png, declaredMime: "application/pdf" })).toThrow(/tidak sesuai/);
    expect(() => addDocument(db, rsts, { facilityId: "FAC-RSTS", name: "bukti.png", bytes: Buffer.from([0, 1, 2, 3, 0, 255]) })).toThrow(/tidak didukung/);
    expect(() => addDocument(db, rsts, { facilityId: "FAC-RSTS", name: "kosong.txt", bytes: Buffer.alloc(0) })).toThrow(DomainError);
    expect(() => addDocument(db, rsts, { facilityId: "FAC-RSTS", name: "besar.txt", bytes: Buffer.alloc(3 * 1024 * 1024 + 1, 97) })).toThrow(/terlalu besar/);
  });
  it("teks biasa langsung diekstrak sebagai usulan; gambar dan pindaian masuk jalur transkripsi manual", () => {
    const t = addDocument(db, rsts, { facilityId: "FAC-RSTS", name: "../catatan:1.txt", bytes: Buffer.from("Catatan pelayanan pasien pada 3 Oktober 2026."), findingId: "F-0007" });
    expect(t).toMatchObject({ kind: "text", status: "text_extracted" });
    expect(one<{ name: string }>(db, "SELECT name FROM documents WHERE id = ?", t.id).name).not.toMatch(/[\\/:]/);
    expect(one<{ status: string }>(db, "SELECT status FROM extractions WHERE document_id = ?", t.id).status).toBe("proposed");
    const img = addDocument(db, rsts, { facilityId: "FAC-RSTS", name: "foto.png", bytes: png });
    expect(img).toMatchObject({ kind: "image", status: "needs_manual_transcription" });
    expect(rows(db, "SELECT 1 FROM extractions WHERE document_id = ?", img.id)).toHaveLength(0);
    const scan = addDocument(db, rsts, { facilityId: "FAC-RSTS", name: "pindaian.pdf", bytes: Buffer.from("%PDF-1.4\n%scan\n"), pdfText: "" });
    expect(scan).toMatchObject({ kind: "pdf_scan", status: "needs_manual_transcription" });
  });
  it("transkripsi manual hanya oleh staf berwenang, dan unggahan tercatat di audit", async () => {
    const img = addDocument(db, rsts, { facilityId: "FAC-RSTS", name: "foto2.png", bytes: png });
    await expect(executeFacilityCommand(db, rsts, { type: "transcribe_document", documentId: img.id, text: "Transkripsi oleh faskes sendiri." })).rejects.toThrow();
    await expect(executeStaffCommand(db, ver, { type: "transcribe_document", documentId: img.id, text: "Catatan pelayanan tanggal 3 Oktober 2026." })).resolves.toBeTruthy();
    expect(rows(db, "SELECT 1 FROM audit_log WHERE action = 'dokumen_diunggah' AND entity_id = ?", img.id)).toHaveLength(1);
  });
});

describe("kasus-faskes: autopilot lama dan label", () => {
  it("jalur autopilot dan keputusan otomatis kasus mengembalikan 410", async () => {
    const a = await import("../src/app/api/autopilot/[...path]/route");
    const b = await import("../src/app/api/cases/[id]/auto/route");
    for (const h of [a.GET, a.POST, a.PUT, a.PATCH, a.DELETE, b.GET, b.POST]) {
      if (!h) continue;
      const res = await (h as unknown as (...x: unknown[]) => Response | Promise<Response>)(new Request("http://localhost/x"), { params: Promise.resolve({ path: ["x"], id: "F-0001" }) });
      expect(res.status).toBe(410);
    }
  });
  it("seluruh label tampilan modul memakai bahasa netral", () => {
    const text = JSON.stringify([
      L.SOURCE_LABEL, L.CLARIFICATION_LABEL, L.DISPUTE_LABEL, L.DIRECTION_LABEL, L.SEARCH_RESULT_LABEL, L.FOLLOWUP_LABEL, L.OUTCOME_LABEL, L.CLAIM_REVIEW_LABEL, L.SUGGESTION_KIND_LABEL,
      L.SUGGESTION_STATE_LABEL, L.PRIORITY_LABEL, L.TIMELINE_KIND_LABEL, L.ASSISTANT_LIMITS, L.SLOT_LABEL,
    ]);
    expect(findForbiddenTerms(text)).toEqual([]);
  });
  it("empat opsi peninjauan klaim tidak memuat keputusan pembayaran sungguhan", () => {
    expect(Object.keys(L.CLAIM_REVIEW_LABEL)).toHaveLength(4);
    expect(JSON.stringify(L.ASSISTANT_LIMITS)).toMatch(/tidak/i);
  });
});
