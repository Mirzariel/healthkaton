import type Database from "better-sqlite3";
import type { Principal, Role } from "../auth/principal";
import { SYSTEM_ACTOR } from "../cases/core";
import { recomputeCards, listCards } from "../cards/compute";
import { setNow } from "../clock";
import { addDays } from "../dates";
import { commitProcessing, reviewExtraction, uploadDocument, addDemoFixtureExtraction } from "../evidence/service";
import { makeScanLikePdf, makeScanPng, makeTextPdf } from "../evidence/fixtures";
import { fileDispute, resolveDispute } from "../pending/dispute";
import { escalatePendingToCase, listPending, reclassifyPending, resolvePending, respondPending, syncPendingTriage } from "../pending/triage";
import { savePrecheckRun } from "../precheck/evaluate";
import { makeRng } from "../rng";
import { DEMO_USERS, SEED_NOW } from "./base";

/* Seed modul pending-kartu-bayar-impor. Semua data SINTETIS. Skenario yang dicakup (spec bagian 12):
   9  pending administratif diperbaiki melalui portal/pra-pengajuan
   10 kartu pembinaan dengan alasan, sampel, kelompok sejawat, dan bantahan
   11 dasbor pembayaran: contoh lengkap, data belum cukup, sumber tidak tersedia
   13 dokumen ekstraksi teks dengan peninjauan sumber; pindaian tanpa OCR menampilkan jalur transkripsi manual */

const persona = (id: string): Principal => {
  const u = DEMO_USERS.find((x) => x.id === id)!;
  return { id: `${u.role}:${u.id}`, name: u.name, role: u.role as Role, facilityId: u.facility_id, participantId: u.participant_id, companionId: null };
};

export const RESUME_LINES: string[][] = [
  ["RESUME MEDIS (CONTOH SINTETIS)", "Pasien: PSN-DEMO01 | Faskes: RS Nusa Medika (simulasi)", "Diagnosis: Gastroenteritis (A09)", "Dirawat 3 hari, dipulangkan dalam keadaan membaik."],
  ["LEMBAR TINDAKAN (CONTOH SINTETIS)", "Tindakan: pemasangan infus", "Pelaksana: dr. Contoh", "Dicatat sesaat setelah tindakan."],
];

function adjustPayments(db: Database.Database) {
  const r = makeRng(4242);
  // Sumber status bayar RSCM sengaja tidak tersedia: tidak ada satu pun peristiwa (skenario 11).
  db.prepare("DELETE FROM payment_events WHERE facility_id = 'FAC-RSCM'").run();
  // Sebagian klaim terbayar melewati tenggat demo, dengan peluang berbeda per faskes. Contoh sintetis, BUKAN temuan.
  const lateP: Record<string, number> = { "FAC-RSTS": 0.35, "FAC-RSNM": 0.12, "FAC-RSHB": 0.06, "FAC-RSBS": 0.04 };
  const paid = db.prepare(
    `SELECT c.id, c.facility_id, e.at AS complete_at FROM claims c
     JOIN payment_events e ON e.claim_id = c.id AND e.type = 'complete'
     WHERE c.status = 'paid' AND NOT EXISTS (SELECT 1 FROM findings f WHERE f.claim_id = c.id) ORDER BY c.id`,
  ).all() as { id: string; facility_id: string; complete_at: string }[];
  for (const c of paid) {
    const p = lateP[c.facility_id];
    if (!p || !r.chance(p)) continue;
    const at = addDays(c.complete_at, r.int(22, 45));
    if (at > SEED_NOW) continue;
    db.prepare("UPDATE claims SET paid_at = ? WHERE id = ?").run(at, c.id);
    db.prepare("UPDATE payment_events SET at = ? WHERE claim_id = ? AND type = 'paid'").run(at, c.id);
  }
}

/** RS Nusa Medika: tambahan klaim pending berkode BERKAS_KURANG pada kuartal 2 (skenario kartu kuning karena kelengkapan berkas, bukan fraud). */
function bumpPendingRsnm(db: Database.Database) {
  const r = makeRng(9191);
  const rows = db.prepare(
    `SELECT c.id, c.submitted_at FROM claims c
     WHERE c.facility_id = 'FAC-RSNM' AND c.status IN ('paid','submitted') AND c.submitted_at >= '2026-04-01' AND c.submitted_at < '2026-07-01'
       AND NOT EXISTS (SELECT 1 FROM findings f WHERE f.claim_id = c.id OR f.related_claim_id = c.id) ORDER BY c.id`,
  ).all() as { id: string; submitted_at: string }[];
  for (const c of r.shuffle(rows).slice(0, 10)) {
    db.prepare("UPDATE claims SET status = 'pending', paid_at = NULL WHERE id = ?").run(c.id);
    db.prepare("DELETE FROM payment_events WHERE claim_id = ? AND type IN ('paid','complete','pending','returned')").run(c.id);
    db.prepare("INSERT INTO payment_events (claim_id, facility_id, type, at, amount, reason, source, policy_version_id) VALUES (?, 'FAC-RSNM', 'pending', ?, NULL, 'BERKAS_KURANG', 'simulated', 'POL-PAY-1')").run(c.id, addDays(c.submitted_at, 5));
  }
}

export function seedKeuangan(db: Database.Database) {
  adjustPayments(db);
  bumpPendingRsnm(db);
  setNow("2026-10-01T09:00");
  syncPendingTriage(db, SYSTEM_ACTOR);

  const ver = persona("U-VER-1");
  const rev = persona("U-REV-1");
  const fsk = { RSHB: persona("U-FSK-1"), RSNM: persona("U-FSK-2"), RSTS: persona("U-FSK-3") };

  // ----- skenario 9 + 13: berkas dilengkapi lewat portal, jawaban faskes, diselesaikan petugas -----
  const rsnm = listPending(db, { facilityId: "FAC-RSNM", category: "doc_completeness" }, SEED_NOW);
  if (rsnm.length >= 4) {
    const ep = (db.prepare("SELECT episode_id FROM claims WHERE id = ?").get(rsnm[0].claim_id) as { episode_id: string }).episode_id;
    setNow("2026-10-06T10:15");
    const up = uploadDocument(db, fsk.RSNM, { name: "resume-medis-dan-lembar-tindakan-contoh.pdf", mime: "application/pdf", bytes: makeTextPdf(RESUME_LINES), episodeId: ep });
    commitProcessing(db, SYSTEM_ACTOR, up.id, {
      kind: "pdf_text", status: "text_extracted", pageCount: RESUME_LINES.length, note: "teks PDF (seed; sama dengan hasil pembacaan langsung, dijaga tes)",
      extractions: RESUME_LINES.map((l, i) => ({ page: i + 1, engine: "pdf_text" as const, text: l.join("\n") })),
    });
    setNow("2026-10-06T14:00");
    respondPending(db, fsk.RSNM, rsnm[0].id, "Resume medis dan lembar tindakan sudah dilengkapi dan diunggah (lihat dokumen terlampir). Klaim akan diajukan ulang setelah pemeriksaan pra-pengajuan.", up.id);
    const ex = db.prepare("SELECT id FROM extractions WHERE document_id = ? ORDER BY page").all(up.id) as { id: string }[];
    setNow("2026-10-07T09:30");
    reviewExtraction(db, rev, ex[0].id, { action: "confirm" });
    setNow("2026-10-07T11:00");
    resolvePending(db, ver, rsnm[0].id, "Berkas lengkap sesuai permintaan; klaim dapat diajukan ulang melalui pra-pengajuan.");
    setNow("2026-10-07T13:00");
    respondPending(db, fsk.RSNM, rsnm[1].id, "Surat eligibilitas peserta sedang dilengkapi; mohon waktu tiga hari kerja.");
    respondPending(db, fsk.RSNM, rsnm[2].id, "Lembar tindakan ditandatangani dokter penanggung jawab dan akan diunggah.");
  }

  // ----- pindaian tanpa OCR: jalur transkripsi manual (skenario 13) -----
  setNow("2026-10-08T08:30");
  const epScan = (db.prepare("SELECT e.id FROM episodes e WHERE e.facility_id = 'FAC-RSTS' ORDER BY e.id LIMIT 1").get() as { id: string }).id;
  const scan = uploadDocument(db, fsk.RSTS, { name: "surat-eligibilitas-pindaian-contoh.pdf", mime: "application/pdf", bytes: makeScanLikePdf(1), episodeId: epScan });
  commitProcessing(db, SYSTEM_ACTOR, scan.id, { kind: "pdf_scan", status: "ocr_unavailable", pageCount: 1, extractions: [], note: "OCR tidak tersedia pada seed; jalur transkripsi manual" });

  // ----- dokumen pindai bronkoskopi Bu Sari: fixture demo BERLABEL SIMULASI (bukan hasil baca dokumen) -----
  setNow("2026-10-08T09:10");
  const png = uploadDocument(db, fsk.RSHB, { name: "lembar-tindakan-bronkoskopi-pindaian-demo.png", mime: "image/png", bytes: makeScanPng(), episodeId: "E-0001" });
  commitProcessing(db, SYSTEM_ACTOR, png.id, { kind: "image", status: "ocr_unavailable", pageCount: 1, extractions: [], note: "OCR tidak tersedia pada seed" });
  addDemoFixtureExtraction(db, SYSTEM_ACTOR, png.id, 1, "LEMBAR TINDAKAN - BRONKOSKOPI (fixture demo)\nTanggal: 2026-03-05 09:40\nPelaksana: dr. Bagas, Sp.P\nCatatan ini fixture simulasi untuk demo, bukan hasil pembacaan dokumen.");

  // ----- pemilahan: kategori ulang, bantahan, pemindahan ke kasus -----
  setNow("2026-10-05T10:00");
  const mismatch = listPending(db, { category: "data_mismatch" }, SEED_NOW).find((x) => x.status === "open");
  if (mismatch) reclassifyPending(db, ver, mismatch.id, "doc_completeness", "Setelah dicek, selisih data disebabkan lampiran eligibilitas yang tidak ikut terkirim.");
  setNow("2026-10-08T15:00");
  const coding = listPending(db, { category: "coding" }, SEED_NOW).find((x) => ["FAC-RSHB", "FAC-RSNM", "FAC-RSTS"].includes(x.facility_id) && x.status === "open");
  if (coding) {
    const owner = coding.facility_id === "FAC-RSHB" ? fsk.RSHB : coding.facility_id === "FAC-RSNM" ? fsk.RSNM : fsk.RSTS;
    const id = fileDispute(db, owner, { kind: "pending_category", refId: coding.id, text: "Kode diagnosis sudah sesuai resume medis; kami meminta kategori 'koding' ditinjau ulang." });
    setNow("2026-10-09T09:00");
    resolveDispute(db, rev, id, { outcome: "noted", response: "Dicatat. Verifikator akan meminta resume medis untuk dibandingkan dengan kode." });
  }
  setNow("2026-10-09T10:00");
  const deep = listPending(db, { category: "needs_review" }, SEED_NOW).find((x) => x.status === "open");
  if (deep) escalatePendingToCase(db, rev, deep.id, "Kode alasan pembayar meminta pendalaman dan belum ada jawaban faskes; dipindahkan agar bukti dikumpulkan di ruang kasus.");

  // ----- kartu: hitung, lalu bantahan faskes -----
  setNow(SEED_NOW);
  recomputeCards(db, SYSTEM_ACTOR, SEED_NOW);
  const cards = listCards(db, { facilityId: "FAC-RSNM" });
  const flagged = cards.filter((c) => c.level === "yellow" || c.level === "red");
  if (flagged.length >= 2) {
    setNow("2026-10-05T11:00");
    const d1 = fileDispute(db, fsk.RSNM, { kind: "card", refId: String(flagged[0].id), text: "Sebagian klaim pending pada periode ini menunggu berkas dari pihak ketiga; mohon dipertimbangkan." });
    setNow("2026-10-07T16:00");
    resolveDispute(db, rev, d1, { outcome: "noted", response: "Dicatat sebagai konteks periode. Level tidak diubah karena perhitungan mengikuti parameter yang berlaku." });
    setNow("2026-10-09T11:30");
    fileDispute(db, fsk.RSNM, { kind: "card", refId: String(flagged[flagged.length - 1].id), text: "Kami meminta sampel klaim pending periode ini ditinjau bersama; sebagian sudah dilengkapi." });
  }

  // ----- riwayat pra-pengajuan -----
  setNow("2026-10-09T13:00");
  const drafts = db.prepare("SELECT id, facility_id FROM claims WHERE status = 'draft' ORDER BY id LIMIT 4").all() as { id: string; facility_id: string }[];
  for (const d of drafts) savePrecheckRun(db, d.facility_id === "FAC-RSHB" ? fsk.RSHB : ver, d.id);
  setNow(SEED_NOW);
}
