import { beforeAll, describe, expect, it } from "vitest";
import { verifyChain } from "../src/lib/audit";
import { AuthError, type Principal, type Role } from "../src/lib/auth/principal";
import { SYSTEM_ACTOR } from "../src/lib/cases/core";
import { openDb } from "../src/lib/db";
import { MAX_UPLOAD_BYTES, safeName, sniff, validateUpload } from "../src/lib/evidence/validate";
import { makeScanLikePdf, makeScanPng, makeTextPdf } from "../src/lib/evidence/fixtures";
import { ENGINE_LABEL, getDocument, listDocuments, processDocument, readDocumentBytes, reprocessDocument, reviewExtraction, transcribeDocument, uploadDocument, type DocStatus } from "../src/lib/evidence/service";
import type { OcrAdapter } from "../src/lib/evidence/ocr";
import { DomainError } from "../src/lib/idem";
import { parseCsv, toCsv } from "../src/lib/import/csv";
import { IMPORT_KINDS, KIND_DEFS, templateFor } from "../src/lib/import/formats";
import { applyImport, getJob, listJobs, previewImport } from "../src/lib/import/service";
import { OUTCOME_LABEL, evaluateClaim, listRuns, precheckCandidates, savePrecheckRun } from "../src/lib/precheck/evaluate";
import { seedAll } from "../src/lib/seed";
import { DEMO_USERS } from "../src/lib/seed/base";
import { RESUME_LINES } from "../src/lib/seed/keuangan";

const who = (id: string): Principal => {
  const u = DEMO_USERS.find((x) => x.id === id)!;
  return { id: `${u.role}:${u.id}`, name: u.name, role: u.role as Role, facilityId: u.facility_id, participantId: u.participant_id, companionId: null };
};
const ver = who("U-VER-1");
const rev = who("U-REV-1");
const adm = who("U-ADM-1");
const fskRSNM = who("U-FSK-2");
const fskRSHB = who("U-FSK-1");

const db = openDb(":memory:");
beforeAll(() => { seedAll(db); });
const count = (t: string) => (db.prepare(`SELECT COUNT(*) c FROM ${t}`).get() as { c: number }).c;

/* ---------- CSV ---------- */
describe("CSV", () => {
  it("mengenali pemisah titik koma, kutipan, baris baru dalam sel, dan BOM", () => {
    const r = parseCsv("\uFEFFa;b;c\r\n1;\"x;y\";\"baris\nbaru\"\r\n");
    expect(r.delimiter).toBe(";");
    expect(r.header).toEqual(["a", "b", "c"]);
    expect(r.rows[0].cells).toEqual(["1", "x;y", "baris\nbaru"]);
  });
  it("penulis CSV menetralkan sel berawalan rumus", () => {
    expect(toCsv([["=SUM(A1)", "+1+1", "-5", "@x", "ok"]])).toBe("'=SUM(A1),'+1+1,-5,'@x,ok\r\n");
  });
  it("templat setiap jenis dapat dipratinjau tanpa galat format (kecuali konflik data yang sudah ada)", () => {
    for (const k of IMPORT_KINDS) expect(templateFor(k).length).toBeGreaterThan(20);
    expect(KIND_DEFS.episode_klaim.columns.some((c) => c.name === "claim_no")).toBe(true);
  });
});

/* ---------- Impor ---------- */
const CLAIM_CSV = [
  "claim_no,facility_code,participant_pseudonym,kind,admit_at,discharge_at,dx_code,dx_text,group_code,amount,status,submitted_at,paid_at",
  "KLM-IMP-0001,RSHB,PSN-IMP001,RITL,2026-09-01T10:00,2026-09-04T11:00,J18.9,Pneumonia,SIM-RESP-2,5200000,submitted,2026-09-08T10:00,",
  "KLM-IMP-0002,RSNM,PSN-IMP002,RJTL,2026-09-02T09:00,2026-09-02T11:00,J45,Asma,SIM-RESP-1,650000,draft,,",
].join("\n");

describe("impor data", () => {
  it("hanya admin yang boleh mengimpor", () => {
    expect(() => previewImport(db, ver, { kind: "episode_klaim", text: CLAIM_CSV })).toThrow(AuthError);
    expect(() => previewImport(db, fskRSNM, { kind: "episode_klaim", text: CLAIM_CSV })).toThrow(AuthError);
  });

  it("pratinjau tidak menulis data domain", () => {
    const before = [count("claims"), count("episodes"), count("participants")];
    const { jobId } = previewImport(db, adm, { kind: "episode_klaim", fileName: "uji.csv", text: CLAIM_CSV });
    expect([count("claims"), count("episodes"), count("participants")]).toEqual(before);
    const job = getJob(db, jobId)!;
    expect(job.status).toBe("previewed");
    expect(job.summary.fresh).toBe(2);
    expect(job.error_rows).toBe(0);
  });

  it("pratinjau yang sama dua kali tidak menumpuk pekerjaan", () => {
    const n = listJobs(db).length;
    previewImport(db, adm, { kind: "episode_klaim", text: CLAIM_CSV });
    expect(listJobs(db).length).toBe(n);
  });

  it("penerapan membuat klaim, idempoten, dan tidak menerapkan dua kali", () => {
    const { jobId } = previewImport(db, adm, { kind: "episode_klaim", text: CLAIM_CSV });
    const before = count("claims");
    const r1 = applyImport(db, adm, jobId);
    expect(count("claims")).toBe(before + 2);
    expect(r1.replayed).toBe(false);
    const r2 = applyImport(db, adm, jobId);
    expect(r2.replayed).toBe(true);
    expect(count("claims")).toBe(before + 2);
    expect(getJob(db, jobId)!.status).toBe("applied");
    // isi sama dipratinjau ulang: semua duplikat, tidak ada yang dapat diterapkan
    const again = previewImport(db, adm, { kind: "episode_klaim", text: CLAIM_CSV });
    expect(again.appliedBefore).toBe(jobId);
    expect(getJob(db, again.jobId)!.summary.duplicate).toBe(2);
    expect(() => applyImport(db, adm, again.jobId)).toThrow(DomainError);
    expect(verifyChain(db).ok).toBe(true);
  });

  it("baris bergalat menahan penerapan kecuali ada konfirmasi parsial; baris valid tetap masuk", () => {
    const bad = CLAIM_CSV.replace("KLM-IMP-0002", "KLM-IMP-0003").replace("2026-09-02T11:00", "2026-09-01T08:00").replace("RSNM", "XXXX") + "\nKLM-IMP-0004,RSHB,PSN-IMP004,RJTL,2026-09-03T09:00,2026-09-03T10:00,J45,Asma,SIM-RESP-1,650000,draft,,";
    const { jobId } = previewImport(db, adm, { kind: "episode_klaim", text: bad });
    const job = getJob(db, jobId)!;
    expect(job.error_rows).toBe(1);
    expect(() => applyImport(db, adm, jobId)).toThrow(/bergalat/);
    const before = count("claims");
    const res = applyImport(db, adm, jobId, { allowPartial: true });
    expect(res.partial).toBe(true);
    expect(count("claims")).toBe(before + 1); // hanya KLM-IMP-0004 (0001 sudah ada, 0003 bergalat)
  });

  it("nomor klaim sama dengan isi berbeda ditolak sebagai konflik, data lama tidak berubah", () => {
    const changed = CLAIM_CSV.replace("5200000", "9900000");
    const { jobId } = previewImport(db, adm, { kind: "episode_klaim", text: changed });
    expect(getJob(db, jobId)!.error_rows).toBeGreaterThan(0);
    expect((db.prepare("SELECT amount FROM claims WHERE claim_no = 'KLM-IMP-0001'").get() as { amount: number }).amount).toBe(5200000);
  });

  it("berkas kosong, terlalu besar, atau berisi byte kosong ditolak; kolom wajib hilang dilaporkan", () => {
    expect(() => previewImport(db, adm, { kind: "episode_klaim", text: "" })).toThrow(DomainError);
    expect(() => previewImport(db, adm, { kind: "episode_klaim", text: "a".repeat(1_000_001) })).toThrow(/terlalu besar/);
    expect(() => previewImport(db, adm, { kind: "episode_klaim", text: "a,b\u0000" })).toThrow(DomainError);
    const { jobId } = previewImport(db, adm, { kind: "episode_klaim", text: "claim_no,amount\nX,1" });
    expect(getJob(db, jobId)!.summary.fileErrors.length).toBeGreaterThan(0);
  });

  it("status bayar mengikuti peristiwa sumber dan memicu pemilahan pending untuk klaim yang di-pending", () => {
    const csv = ["claim_no,event_type,event_at,amount,reason", "KLM-IMP-0001,complete,2026-09-10T09:00,,", "KLM-IMP-0001,pending,2026-09-12T09:00,,BERKAS_KURANG"].join("\n");
    const { jobId } = previewImport(db, adm, { kind: "status_bayar", text: csv });
    applyImport(db, adm, jobId);
    const c = db.prepare("SELECT status FROM claims WHERE claim_no = 'KLM-IMP-0001'").get() as { status: string };
    expect(c.status).toBe("pending");
    const t = db.prepare("SELECT t.category, t.reason_code FROM pending_triage t JOIN claims c ON c.id = t.claim_id WHERE c.claim_no = 'KLM-IMP-0001'").get() as { category: string; reason_code: string };
    expect(t).toEqual({ category: "doc_completeness", reason_code: "BERKAS_KURANG" });
    const ev = db.prepare("SELECT source FROM payment_events e JOIN claims c ON c.id = e.claim_id WHERE c.claim_no = 'KLM-IMP-0001'").all() as { source: string }[];
    expect(ev.every((e) => e.source === "import")).toBe(true);
  });
});

/* ---------- Pra-pengajuan ---------- */
describe("pra-pengajuan", () => {
  it("klaim draft tanpa rincian layanan → data belum cukup, bukan 'siap'", () => {
    const c = db.prepare("SELECT id FROM claims WHERE claim_no = 'KLM-IMP-0004'").get() as { id: string };
    const r = evaluateClaim(db, adm, c.id);
    expect(r.outcome).toBe("insufficient_data");
    expect(r.checks.some((x) => x.code === "RINCIAN")).toBe(true);
    expect(r.disclaimer).toMatch(/bukan blokir/i);
  });

  it("faskes hanya memeriksa klaim miliknya; hasil tersimpan sebagai riwayat dan audit, tanpa mengubah klaim", () => {
    const mine = precheckCandidates(db, fskRSNM);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((c) => c.facility_id === fskRSNM.facilityId)).toBe(true);
    const foreign = precheckCandidates(db, adm).find((c) => c.facility_id !== fskRSNM.facilityId)!;
    expect(() => evaluateClaim(db, fskRSNM, foreign.id)).toThrow();
    const snap = JSON.stringify(db.prepare("SELECT * FROM claims ORDER BY id").all());
    const { id, result } = savePrecheckRun(db, fskRSNM, mine[0].id);
    expect(listRuns(db, fskRSNM, mine[0].id).some((r) => r.id === id && r.outcome === result.outcome)).toBe(true);
    expect(JSON.stringify(db.prepare("SELECT * FROM claims ORDER BY id").all())).toBe(snap);
    expect(db.prepare("SELECT 1 FROM audit_log WHERE action = 'pra_pengajuan_dijalankan' AND entity_id = ?").get(mine[0].id)).toBeTruthy();
  });

  it("peserta tidak dapat memakai pra-pengajuan; label 'Tahan' tetap berupa rekomendasi", () => {
    expect(() => precheckCandidates(db, who("U-PSR-1"))).toThrow(AuthError);
    expect(OUTCOME_LABEL.hold.hint).toMatch(/Bukan blokir/);
    expect(OUTCOME_LABEL.hold.label).toMatch(/rekomendasi/i);
  });

  it("hasil pra-pengajuan tidak memuat istilah terlarang", () => {
    for (const c of precheckCandidates(db, adm)) for (const k of c.result.checks) expect(`${k.title} ${k.detail}`).not.toMatch(/\bfraud\b|penipuan|curang|terbukti salah/i);
  });
});

/* ---------- Bukti ---------- */
describe("validasi unggahan", () => {
  const pdf = makeTextPdf([["Halo dunia sintetis, ini contoh teks PDF."]]);
  it("menilai isi berkas, bukan ekstensi atau tipe klaim klien", () => {
    expect(sniff(pdf)).toBe("pdf");
    expect(sniff(makeScanPng())).toBe("png");
    expect(validateUpload({ name: "a.pdf", mime: "application/pdf", bytes: pdf }).ok).toBe(true);
    expect(validateUpload({ name: "a.png", mime: "image/png", bytes: pdf }).ok).toBe(false);
    expect(validateUpload({ name: "a.pdf", mime: "image/png", bytes: pdf }).ok).toBe(false);
    expect(validateUpload({ name: "a.pdf", mime: "application/pdf", bytes: Buffer.from("MZ bukan pdf") }).ok).toBe(false);
    expect(validateUpload({ name: "a.pdf", mime: "application/pdf", bytes: new Uint8Array() }).ok).toBe(false);
  });
  it("menolak berkas terlalu besar dan PDF dengan skrip/aksi otomatis", () => {
    const big = Buffer.concat([pdf, Buffer.alloc(MAX_UPLOAD_BYTES)]);
    expect(validateUpload({ name: "a.pdf", mime: "application/pdf", bytes: big }).ok).toBe(false);
    const active = Buffer.concat([pdf, Buffer.from("\n/OpenAction << /S /JavaScript /JS (app.alert(1)) >>")]);
    const r = validateUpload({ name: "a.pdf", mime: "application/pdf", bytes: active });
    expect(r.ok).toBe(false);
  });
  it("nama berkas dibersihkan dari jalur dan karakter kontrol", () => {
    expect(safeName("../../etc/passwd")).toBe("passwd");
    expect(safeName("C:\\x\\<a>.pdf")).toBe("a.pdf");
    expect(safeName("\u0000\u0001")).toBe("dokumen");
  });
});

const NO_OCR: OcrAdapter = { name: "tidak-ada", available: () => false, reason: () => "Mesin OCR (tesseract) tidak terpasang di lingkungan ini.", recognize: async () => { throw new Error("tidak boleh dipanggil"); } };
const fakeOcr = (text: string): OcrAdapter => ({ name: "tiruan-uji", available: () => true, reason: () => "", recognize: async () => ({ engine: "tiruan-uji", pages: [{ page: 1, text }] }) });
const episodeOf = (facilityId: string) => (db.prepare("SELECT id FROM episodes WHERE facility_id = ? ORDER BY id LIMIT 1").get(facilityId) as { id: string }).id;

describe("ekstraksi dan peninjauan dokumen", () => {
  it("PDF berlapis teks dibaca sungguhan dan hasilnya sama dengan teks seed", async () => {
    const lines = RESUME_LINES;
    const { id } = uploadDocument(db, fskRSNM, { name: "resume-uji.pdf", mime: "application/pdf", bytes: makeTextPdf(lines), episodeId: episodeOf("FAC-RSNM") });
    const status = await processDocument(db, SYSTEM_ACTOR, id, NO_OCR);
    expect(status).toBe("text_extracted");
    const { extractions, document } = getDocument(db, fskRSNM, id);
    expect(document.kind).toBe("pdf_text");
    expect(document.page_count).toBe(2);
    expect(extractions.every((e) => e.engine === "pdf_text" && e.status === "proposed")).toBe(true);
    // teks seed (ditangkap dari pembaca yang sama) harus identik dengan hasil pembacaan langsung
    const seeded = db.prepare("SELECT d.id FROM documents d WHERE d.name LIKE 'resume-medis%'").get() as { id: string };
    const seededText = getDocument(db, adm, seeded.id).extractions.map((e) => e.text);
    expect(extractions.map((e) => e.text)).toEqual(seededText);
    expect(extractions[0].text).toContain("RESUME MEDIS");
  });

  it("unggahan identik tidak menggandakan dokumen; pemrosesan ulang tidak menggandakan usulan", async () => {
    const bytes = makeTextPdf([["Dokumen unik uji idempotensi, cukup panjang."]]);
    const a = uploadDocument(db, fskRSNM, { name: "idem.pdf", mime: "application/pdf", bytes, episodeId: episodeOf("FAC-RSNM") });
    const b = uploadDocument(db, fskRSNM, { name: "idem.pdf", mime: "application/pdf", bytes, episodeId: episodeOf("FAC-RSNM") });
    expect(b).toEqual({ id: a.id, created: false });
    await Promise.all([processDocument(db, SYSTEM_ACTOR, a.id, NO_OCR), processDocument(db, SYSTEM_ACTOR, a.id, NO_OCR)]);
    expect(getDocument(db, adm, a.id).extractions.length).toBe(1);
  });

  it("PDF pindaian tanpa OCR → 'OCR tidak tersedia' dan tidak ada teks palsu", async () => {
    const { id } = uploadDocument(db, fskRSNM, { name: "pindai.pdf", mime: "application/pdf", bytes: makeScanLikePdf(2), episodeId: episodeOf("FAC-RSNM") });
    expect(await processDocument(db, SYSTEM_ACTOR, id, NO_OCR)).toBe("ocr_unavailable");
    expect(getDocument(db, adm, id).extractions.length).toBe(0);
  });

  it("dokumen 'OCR belum tersedia' dapat diproses ulang setelah mesin tersedia, tanpa menggandakan usulan", async () => {
    const { id } = uploadDocument(db, fskRSNM, { name: "pindai-ulang.pdf", mime: "application/pdf", bytes: makeScanLikePdf(3), episodeId: episodeOf("FAC-RSNM") });
    expect(await processDocument(db, SYSTEM_ACTOR, id, NO_OCR)).toBe("ocr_unavailable");
    expect(await reprocessDocument(db, SYSTEM_ACTOR, id, NO_OCR)).toBe("ocr_unavailable");
    expect(await reprocessDocument(db, SYSTEM_ACTOR, id, fakeOcr("Teks hasil OCR tiruan halaman satu"))).toBe("text_extracted");
    expect(getDocument(db, adm, id).extractions.length).toBe(1);
    await expect(reprocessDocument(db, SYSTEM_ACTOR, id, NO_OCR)).rejects.toThrow(DomainError);
  });

  it("gambar dengan mesin OCR tiruan → usulan berlabel mesin OCR; tanpa mesin → perlu transkripsi manual", async () => {
    const a = uploadDocument(db, fskRSNM, { name: "gambar-1.png", mime: "image/png", bytes: makeScanPng(), episodeId: episodeOf("FAC-RSNM") });
    expect(await processDocument(db, SYSTEM_ACTOR, a.id, fakeOcr("Teks hasil OCR tiruan"))).toBe("text_extracted");
    expect(getDocument(db, adm, a.id).extractions[0].engine).toBe("ocr");
    const b = uploadDocument(db, fskRSNM, { name: "gambar-2.png", mime: "image/png", bytes: makeScanPng(250, 330), episodeId: episodeOf("FAC-RSNM") });
    expect(await processDocument(db, SYSTEM_ACTOR, b.id, NO_OCR)).toBe("ocr_unavailable");
  });

  it("transkripsi manual menjadi usulan dan tidak boleh dikonfirmasi pengetiknya (empat mata)", async () => {
    const { id } = uploadDocument(db, fskRSNM, { name: "pindai-manual.pdf", mime: "application/pdf", bytes: makeScanLikePdf(1), episodeId: episodeOf("FAC-RSNM") });
    await processDocument(db, SYSTEM_ACTOR, id, NO_OCR);
    const [exId] = transcribeDocument(db, ver, id, [{ page: 1, text: "Surat eligibilitas, peserta aktif." }]);
    expect(getDocument(db, adm, id).document.processing_status).toBe<DocStatus>("text_extracted");
    expect(() => reviewExtraction(db, ver, exId, { action: "confirm" })).toThrow(/orang lain/);
    expect(() => transcribeDocument(db, ver, id, [{ page: 1, text: "kedua kali" }])).toThrow(DomainError);
    expect(() => reviewExtraction(db, fskRSNM, exId, { action: "confirm" })).toThrow(AuthError);
    const r = reviewExtraction(db, rev, exId, { action: "correct", correctedText: "Surat eligibilitas, peserta aktif per 1 Oktober." });
    expect(r.status).toBe("corrected");
    expect(r.documentStatus).toBe("reviewed");
    expect(() => reviewExtraction(db, rev, exId, { action: "confirm" })).toThrow(/sudah diputuskan/);
  });

  it("koreksi identik dengan usulan ditolak; usulan tetap utuh setelah dikoreksi", async () => {
    const { id } = uploadDocument(db, fskRSNM, { name: "teks-koreksi.pdf", mime: "application/pdf", bytes: makeTextPdf([["Resume sintetis untuk uji koreksi usulan."]]), episodeId: episodeOf("FAC-RSNM") });
    await processDocument(db, SYSTEM_ACTOR, id, NO_OCR);
    const ex = getDocument(db, adm, id).extractions[0];
    expect(() => reviewExtraction(db, ver, ex.id, { action: "correct", correctedText: ex.text })).toThrow(DomainError);
    reviewExtraction(db, ver, ex.id, { action: "correct", correctedText: "Resume sintetis, sudah dikoreksi petugas." });
    const after = getDocument(db, adm, id).extractions[0];
    expect(after.text).toBe(ex.text);
    expect(after.corrected_text).toContain("dikoreksi petugas");
  });

  it("fixture demo berlabel SIMULASI dan terpisah dari hasil baca dokumen", () => {
    const rows = db.prepare("SELECT engine, simulated FROM extractions WHERE engine = 'demo_fixture'").all() as { engine: string; simulated: number }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.simulated === 1)).toBe(true);
    expect(ENGINE_LABEL.demo_fixture).toMatch(/SIMULASI/);
  });

  it("akses dokumen dibatasi menurut faskes; peserta tidak punya akses; pengunduhan tercatat", () => {
    const docRSHB = uploadDocument(db, fskRSHB, { name: "milik-rshb.png", mime: "image/png", bytes: makeScanPng(200, 300), episodeId: episodeOf("FAC-RSHB") });
    expect(() => getDocument(db, fskRSNM, docRSHB.id)).toThrow();
    expect(() => readDocumentBytes(db, fskRSNM, docRSHB.id)).toThrow();
    expect(() => listDocuments(db, who("U-PSR-1"))).toThrow(AuthError);
    expect(listDocuments(db, fskRSNM).every((d) => d.facility_id === fskRSNM.facilityId)).toBe(true);
    const got = readDocumentBytes(db, fskRSHB, docRSHB.id);
    expect(sniff(got.bytes)).toBe("png");
    expect(db.prepare("SELECT 1 FROM audit_log WHERE action = 'dokumen_dibuka' AND entity_id = ?").get(docRSHB.id)).toBeTruthy();
  });

  it("peserta atau faskes lain tidak dapat mengunggah ke episode faskes lain", () => {
    expect(() => uploadDocument(db, fskRSNM, { name: "x.png", mime: "image/png", bytes: makeScanPng(210, 310), episodeId: episodeOf("FAC-RSHB") })).toThrow();
    expect(() => uploadDocument(db, who("U-PSR-1"), { name: "x.png", mime: "image/png", bytes: makeScanPng(), episodeId: episodeOf("FAC-RSHB") })).toThrow(AuthError);
  });

  it("rantai audit tetap sah setelah seluruh skenario", () => {
    expect(verifyChain(db).ok).toBe(true);
  });
});
