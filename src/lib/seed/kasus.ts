import type Database from "better-sqlite3";
import type { Principal } from "../auth/principal";
import { SYSTEM_ACTOR, createFinding, lapseOverdueClarifications, completeFollowUp, syncClaimSignals, type FindingRow } from "../cases/core";
import { runCommandSync } from "../casework/commands";
import { createSimulatedSummary } from "../casework/summary";
import { addDocument, syncServiceRequests } from "../casework/workflow";
import { nowPrecise, setNow } from "../clock";
import { nextId } from "../db";
import { SEED_NOW } from "./base";

/* Skenario demo modul kasus-faskes (master prompt §12, nomor 3, 6, 7, 8, 14), dimainkan lewat fungsi domain yang sama dengan aplikasi:
   tidak ada penulisan status langsung, sehingga jejak audit, hak jawab, dan transisi sah. Langkah diurutkan menurut waktu agar audit kronologis.
   Temuan pahlawan (Bu Sari, F-0001 s.d. F-0004) tidak disentuh. Semua isi dokumen dan laporan bersifat sintetis. */

export const KASUS_START = "2026-09-29T08:00";

const P = (id: string, role: Principal["role"], over: Partial<Principal> = {}): Principal => ({ id: `${role}:${id}`, name: id, role, facilityId: null, participantId: null, companionId: null, ...over });
const ver1 = P("U-VER-1", "verifikator");
const ver2 = P("U-VER-2", "verifikator");
const rev = P("U-REV-1", "reviewer");
const aud = P("U-AUD-1", "auditor");
const rsts = P("U-FSK-3", "faskes", { facilityId: "FAC-RSTS" });
const rsnm = P("U-FSK-2", "faskes", { facilityId: "FAC-RSNM" });
const pkkn = P("U-FSK-4", "faskes", { facilityId: "FAC-PKKN" });

const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

interface Step { at: string; fn: () => void }

export function seedKasus(db: Database.Database) {
  const steps: Step[] = [];
  const at = (iso: string, fn: () => void) => steps.push({ at: iso, fn });
  const cmd = (p: Principal, input: Record<string, unknown>) => runCommandSync(db, p, input).result as Record<string, string | number>;
  const byClaim = (claim: string) => db.prepare("SELECT * FROM findings WHERE claim_id = ? AND type IN ('T1','T2','T3') ORDER BY CASE type WHEN 'T1' THEN 0 ELSE 1 END LIMIT 1").get(claim) as FindingRow;
  const suggestion = (findingId: string, kind: string) => (db.prepare("SELECT id FROM assistant_suggestions WHERE finding_id = ? AND kind = ? AND state = 'proposed' ORDER BY id DESC LIMIT 1").get(findingId, kind) as { id: string } | undefined)?.id;
  const clarFor = (findingId: string) => (db.prepare("SELECT id FROM clarifications WHERE finding_id = ? ORDER BY sent_at DESC, id DESC LIMIT 1").get(findingId) as { id: string }).id;
  const upload = (p: Principal, clarificationId: string, name: string, text: string) => addDocument(db, p, { facilityId: p.facilityId!, name, bytes: Buffer.from(text, "utf-8"), declaredMime: "text/plain", clarificationId }).id;
  const clarIssue = (findingId: string) => {
    const sg = db.prepare("SELECT payload_json FROM assistant_suggestions WHERE finding_id = ? AND kind = 'clarification_request' AND state = 'proposed' ORDER BY id DESC LIMIT 1").get(findingId) as { payload_json: string } | undefined;
    return sg ? (JSON.parse(sg.payload_json) as { issue: string; requestedDocs: string[]; minimalRef: string }) : null;
  };
  const sendFromSuggestion = (p: Principal, findingId: string, dueDays: number, fallback: string) => {
    const sg = clarIssue(findingId);
    return cmd(p, { type: "send_clarification", findingId, issue: sg?.issue ?? fallback, requestedDocs: sg?.requestedDocs ?? [], minimalRef: sg?.minimalRef, dueDays, suggestionId: suggestion(findingId, "clarification_request") }).clarificationId as string;
  };
  const participantReport = (participantId: string, episodeId: string, facilityId: string, text: string, indicator: string, title: string, summary: string) => {
    const lp = nextId(db, "LP");
    db.prepare("INSERT INTO service_requests (id, participant_id, episode_id, facility_id, category, text, status, respondent_role, created_at) VALUES (?,?,?,?,?,?,'received','self',?)").run(lp, participantId, episodeId, facilityId, "obat", text, nowPrecise());
    const r = createFinding(db, SYSTEM_ACTOR, {
      type: "T4", source: "participant_report", episode_id: episodeId, facility_id: facilityId, indicator_id: indicator, title, summary,
      limit_text: "Laporan satu peserta adalah sumber informasi, bukan putusan. Belum ada pembuktian.", signals: [{ key: "participant_report", label: "Peserta melaporkan kendala pemenuhan obat untuk dibawa pulang", weight: 60 }],
      score: 60, dedupe_key: `T4:${lp}`, category: "obat",
    });
    db.prepare("UPDATE service_requests SET case_id = ?, finding_id = ? WHERE id = ?").run(r.caseId, r.findingId, lp);
    syncServiceRequests(db, r.caseId);
    return r;
  };
  const f6 = byClaim("C-0101"); // RSTS, endoskopi: dokumen awal tidak tertaut, kemudian ditemukan (skenario 6)
  const f7 = byClaim("C-0093"); // RSTS, hemodialisis: ketidaksesuaian terverifikasi, penyebab ditinjau manusia, eskalasi tercatat (skenario 7)
  const f8 = byClaim("C-0154"); // RSNM, bronkoskopi: faskes terlambat menjawab (skenario 8)
  const ids: { f3?: string; f14?: string; k6?: string; k7?: string; k8?: string; k3?: string; k14?: string; a3?: string; a14?: string } = {};

  /* ---------- Skenario 6 ---------- */
  at("2026-09-29T09:20", () => createSimulatedSummary(db, ver1, f6.id));
  at("2026-09-29T09:40", () => { ids.k6 = sendFromSuggestion(ver1, f6.id, 7, "Mohon bantuan penjelasan dan dokumen pelaksanaan endoskopi pada perawatan yang dirujuk."); });
  at("2026-10-02T10:15", () => {
    const k = ids.k6!;
    const doc = upload(rsts, k, "lembar-tindakan-endoskopi.txt", "LEMBAR TINDAKAN ENDOSKOPI SALURAN CERNA (salinan arsip)\nTindakan dilakukan pada hari perawatan dengan operator dokter spesialis penyakit dalam.\nPersetujuan tindakan, sedasi, dan temuan endoskopi tercatat. Lembar ini semula diarsipkan pada berkas rawat inap sehingga tidak tertaut pada pesanan layanan.");
    cmd(rsts, { type: "respond_clarification", clarificationId: k, text: "Lembar tindakan endoskopi ada pada arsip berkas rawat inap dan belum tertaut ke pesanan layanan di SIMRS. Salinannya kami lampirkan.", documentId: doc });
  });
  at("2026-10-03T08:50", () => createSimulatedSummary(db, ver1, f6.id));
  at("2026-10-03T09:10", () => {
    const k = ids.k6!;
    const svc = db.prepare("SELECT id, performed_at, performer FROM services WHERE id = ?").get(f6.service_id) as { id: string; performed_at: string; performer: string };
    db.prepare("INSERT INTO evidence (id, episode_id, service_id, type, recorded_at, performer, summary) VALUES (?,?,?,?,?,?,?)").run("V-KS0001", f6.episode_id, svc.id, "lembar_tindakan", svc.performed_at.slice(0, 10) + "T" + svc.performed_at.slice(11, 13) + ":45", svc.performer, "Lembar tindakan endoskopi ditautkan pada pesanan layanan setelah ditemukan di arsip berkas rawat inap.");
    const docId = (db.prepare("SELECT id FROM documents WHERE clarification_id = ? LIMIT 1").get(k) as { id: string }).id;
    cmd(ver1, { type: "link_evidence", findingId: f6.id, direction: "contradicts", evidenceId: "V-KS0001", note: "Catatan pelaksanaan kini tertaut pada layanan yang sama dengan rincian klaim." });
    cmd(ver1, { type: "link_evidence", findingId: f6.id, direction: "contradicts", documentId: docId, quote: "Persetujuan tindakan, sedasi, dan temuan endoskopi tercatat.", note: "Salinan arsip dari faskes memuat pelaksanaan tindakan." });
    const sg = suggestion(f6.id, "record_gap");
    if (sg) cmd(ver1, { type: "decide_suggestion", suggestionId: sg, decision: "accepted" });
    syncClaimSignals(db, SYSTEM_ACTOR); // sinyal gugur setelah data baru; sistem hanya mengusulkan, tidak mengubah status
  });
  at("2026-10-03T11:00", () => {
    const prop = db.prepare("SELECT id FROM review_decisions WHERE finding_id = ? AND kind = 'proof_proposal' AND state = 'pending' ORDER BY id DESC LIMIT 1").get(f6.id) as { id: number };
    cmd(rev, { type: "decide_proof", proposalId: prop.id, approve: true, note: "Dokumen pelaksanaan ditemukan dan tertaut; sinyal gugur. Faskes sudah diberi kesempatan menjawab." });
  });
  at("2026-10-03T11:30", () => { cmd(rev, { type: "close_case", caseId: f6.case_id, reason: "Pelaksanaan layanan terdokumentasi; temuan tidak terbukti. Perbaikan pencatatan dibahas pada pembinaan rutin." }); });

  /* ---------- Skenario 7 ---------- */
  at("2026-09-29T10:00", () => createSimulatedSummary(db, ver1, f7.id));
  at("2026-09-29T10:20", () => { ids.k7 = sendFromSuggestion(ver1, f7.id, 7, "Mohon bantuan penjelasan dan dokumen pelaksanaan hemodialisis pada perawatan yang dirujuk."); });
  at("2026-10-01T14:00", () => {
    const k = ids.k7!;
    const doc = upload(rsts, k, "rekap-sesi-hemodialisis.txt", "REKAP JADWAL SESI HEMODIALISIS\nSesi pada tanggal perawatan yang dirujuk dijadwalkan ulang ke dua hari berikutnya.\nLembar sesi untuk tanggal perawatan yang dirujuk tidak pernah dibuat; lembar sesi hanya tersedia untuk tanggal pelaksanaan setelah dijadwalkan ulang.");
    addDocument(db, rsts, { facilityId: "FAC-RSTS", name: "foto-lembar-sesi.png", bytes: PNG_1PX, declaredMime: "image/png", clarificationId: k });
    cmd(rsts, { type: "respond_clarification", clarificationId: k, text: "Sesi dijadwalkan ulang karena unit sedang dalam pemeliharaan. Lembar sesi pada tanggal semula memang tidak dibuat. Rekap jadwal dan foto lembar sesi kami lampirkan.", documentId: doc });
  });
  at("2026-10-02T09:00", () => createSimulatedSummary(db, ver1, f7.id));
  at("2026-10-02T09:30", () => {
    const doc = db.prepare("SELECT id FROM documents WHERE clarification_id = ? AND mime = 'text/plain' LIMIT 1").get(ids.k7!) as { id: string };
    cmd(ver1, { type: "link_evidence", findingId: f7.id, direction: "supports", documentId: doc.id, quote: "Lembar sesi untuk tanggal perawatan yang dirujuk tidak pernah dibuat", note: "Faskes sendiri menyatakan lembar sesi pada tanggal klaim tidak dibuat; sesi dilaksanakan pada tanggal lain." });
    cmd(ver1, { type: "propose_proof", findingId: f7.id, outcome: "verified", reason: "Layanan pada rincian tidak memiliki lembar pelaksanaan pada tanggal yang ditagih; faskes sudah menjawab dan mengonfirmasi pergeseran jadwal." });
  });
  at("2026-10-03T10:30", () => {
    const prop = db.prepare("SELECT id FROM review_decisions WHERE finding_id = ? AND kind = 'proof_proposal' AND state = 'pending' ORDER BY id DESC LIMIT 1").get(f7.id) as { id: number };
    cmd(rev, { type: "decide_proof", proposalId: prop.id, approve: true, note: "Bukti pendukung tertaut dan hak jawab terpenuhi." });
  });
  at("2026-10-03T10:45", () => { cmd(rev, { type: "set_causes", findingId: f7.id, causes: ["administrative", "service_process"], note: "Jadwal sesi bergeser tanpa pembaruan pesanan layanan (administratif) dan alur penjadwalan ulang belum memicu pembuatan lembar sesi (proses pelayanan)." }); });
  at("2026-10-06T09:00", () => { cmd(rev, { type: "request_escalation", findingId: f7.id, reason: "Penjelasan alternatif (administratif dan proses) sudah ditimbang. Tanggal sesi pada klaim tidak sama dengan tanggal pelaksanaan; diminta telaah lanjutan oleh auditor." }); });
  at("2026-10-07T11:00", () => {
    const req = db.prepare("SELECT id FROM review_decisions WHERE finding_id = ? AND kind = 'escalation' AND state = 'pending'").get(f7.id) as { id: number };
    cmd(aud, { type: "decide_escalation", requestId: req.id, approve: true, note: "Disetujui untuk telaah lanjutan. Ini label dugaan, bukan putusan." });
  });
  at("2026-10-07T11:30", () => { cmd(rev, { type: "claim_review", findingId: f7.id, option: "eskalasi_audit", reason: "Dicatat sebagai simulasi: klaim dirujuk ke pemeriksaan lanjutan. Tidak ada eksekusi ke sistem pembayaran." }); });

  /* ---------- Skenario 8 ---------- */
  at("2026-09-29T11:00", () => createSimulatedSummary(db, ver1, f8.id));
  at("2026-09-29T11:20", () => { ids.k8 = sendFromSuggestion(ver1, f8.id, 4, "Mohon bantuan penjelasan dan dokumen pelaksanaan bronkoskopi pada perawatan yang dirujuk."); });
  at("2026-10-04T08:00", () => { lapseOverdueClarifications(db, SYSTEM_ACTOR, "2026-10-04T08:00"); syncServiceRequests(db, f8.case_id); });
  at("2026-10-05T09:00", () => {
    cmd(ver1, { type: "add_note", caseId: f8.case_id, findingId: f8.id, text: "Faskes belum menjawab sampai tenggat. Hak jawab tetap terbuka; jawaban terlambat akan diterima. Tenggat lewat tidak dianggap bukti." });
    cmd(ver1, { type: "record_search", findingId: f8.id, source: "SIMRS/RME dan arsip rekam medis faskes (akses petugas)", query: "Lembar tindakan bronkoskopi pada tanggal perawatan yang dirujuk", result: "not_found" });
  });
  at("2026-10-06T10:00", () => { cmd(ver1, { type: "propose_proof", findingId: f8.id, outcome: "inconclusive", reason: "Faskes belum menjawab sampai tenggat dan pencarian di SIMRS tidak menemukan lembar tindakan. Tidak dapat dibuktikan, bukan berarti tindakan tidak dilakukan." }); });
  at("2026-10-06T10:10", () => createSimulatedSummary(db, ver1, f8.id));

  /* ---------- Skenario 3: laporan peserta, obat habis, klarifikasi, tindakan perbaikan ---------- */
  at("2026-09-30T08:30", () => {
    ids.f3 = participantReport("P-0152", "E-0296", "FAC-PKKN",
      "Obat asma yang diresepkan hanya sebagian yang saya terima karena kata petugas stok habis. Sisanya saya beli sendiri di apotek luar dengan biaya sendiri.",
      "MED_FULFILLMENT", "Laporan peserta: obat untuk dibawa pulang tidak diterima penuh", "Peserta melaporkan sebagian obat tidak tersedia di faskes dan dibeli sendiri di luar. Perlu klarifikasi faskes mengenai ketersediaan dan alur penyerahan.").findingId;
  });
  at("2026-09-30T09:15", () => createSimulatedSummary(db, ver2, ids.f3!));
  at("2026-09-30T09:30", () => { ids.k3 = sendFromSuggestion(ver2, ids.f3!, 7, "Mohon bantuan penjelasan kondisi penyerahan obat pada perawatan yang dirujuk dan lampirkan catatan stok bila ada."); });
  at("2026-10-02T10:00", () => {
    const k = ids.k3!;
    const doc = upload(pkkn, k, "kartu-stok-inhaler.txt", "KARTU STOK OBAT (salinan)\nInhaler pelega pada periode perawatan yang dirujuk: stok nol selama beberapa hari karena keterlambatan distribusi dari instalasi farmasi kabupaten.\nResep dilayani sebagian; sisa obat tidak dapat diserahkan pada hari itu.");
    cmd(pkkn, { type: "respond_clarification", clarificationId: k, text: "Stok inhaler kosong pada tanggal tersebut karena keterlambatan distribusi. Resep dilayani sebagian dan sisanya tidak dapat kami serahkan. Kartu stok kami lampirkan.", documentId: doc });
  });
  at("2026-10-03T10:00", () => {
    const doc = db.prepare("SELECT id FROM documents WHERE clarification_id = ? LIMIT 1").get(ids.k3!) as { id: string };
    cmd(ver2, { type: "link_evidence", findingId: ids.f3!, direction: "supports", documentId: doc.id, quote: "stok nol selama beberapa hari", note: "Kartu stok faskes sejalan dengan laporan peserta tentang obat yang tidak tersedia." });
    cmd(ver2, { type: "propose_proof", findingId: ids.f3!, outcome: "verified", reason: "Laporan peserta dan kartu stok faskes sama-sama menunjukkan obat tidak tersedia pada tanggal itu; faskes sudah menjawab." });
  });
  at("2026-10-04T09:00", () => {
    const prop = db.prepare("SELECT id FROM review_decisions WHERE finding_id = ? AND kind = 'proof_proposal' AND state = 'pending' ORDER BY id DESC LIMIT 1").get(ids.f3!) as { id: number };
    cmd(rev, { type: "decide_proof", proposalId: prop.id, approve: true, note: "Dua sumber selaras; hak jawab terpenuhi." });
    cmd(rev, { type: "set_causes", findingId: ids.f3!, causes: ["service_process"], note: "Rantai pasok obat terlambat dan belum ada stok penyangga untuk obat pelega; ini masalah proses, bukan kesalahan petugas." });
  });
  at("2026-10-05T13:00", () => {
    ids.a3 = cmd(pkkn, { type: "create_action", findingId: ids.f3!, description: "Menetapkan stok penyangga dua minggu untuk inhaler pelega dan prosedur pemberitahuan peserta bila obat tertunda.", owner: "Kepala Farmasi Puskesmas Kenanga", targetDate: "2026-11-20", remeasurePlan: "Konfirmasi peserta asma dan pengukuran ulang pemenuhan obat pada survei pascapelayanan bulan depan." }).actionId as string;
  });
  at("2026-10-06T08:30", () => { cmd(pkkn, { type: "start_action", actionId: ids.a3! }); });

  /* ---------- Skenario 14: perbaikan selesai, peserta mengonfirmasi, kasus ditutup ---------- */
  at("2026-09-30T10:00", () => {
    ids.f14 = participantReport("P-0104", "E-0202", "FAC-RSNM",
      "Obat untuk pulang hanya diberikan sebagian, sisanya katanya menyusul tetapi tidak ada yang menghubungi saya.",
      "MED_FULFILLMENT", "Laporan peserta: sebagian obat pulang belum diterima", "Peserta melaporkan sebagian obat pulang belum diserahkan dan tidak ada pemberitahuan lanjutan.").findingId;
  });
  at("2026-09-30T10:30", () => createSimulatedSummary(db, ver1, ids.f14!));
  at("2026-09-30T10:40", () => { ids.k14 = sendFromSuggestion(ver1, ids.f14!, 7, "Mohon bantuan penjelasan alur penyerahan obat pulang pada perawatan yang dirujuk."); });
  at("2026-10-01T15:00", () => {
    cmd(rsnm, { type: "respond_clarification", clarificationId: ids.k14!, text: "Penyerahan obat pulang dilakukan dua tahap karena sebagian obat harus diambil dari depo lain. Tahap kedua tidak memiliki petugas penanggung jawab sehingga tidak diserahkan dan peserta tidak diberi tahu." });
  });
  at("2026-10-02T10:00", () => {
    const doc = upload(rsnm, ids.k14!, "alur-penyerahan-obat-pulang.txt", "CATATAN ALUR PENYERAHAN OBAT PULANG\nPenyerahan obat pulang tahap kedua belum memiliki penanggung jawab dan tidak ada pemberitahuan kepada peserta.");
    cmd(ver1, { type: "link_evidence", findingId: ids.f14!, direction: "supports", documentId: doc, quote: "tahap kedua belum memiliki penanggung jawab", note: "Faskes mengonfirmasi tahap kedua penyerahan tidak berjalan." });
    cmd(ver1, { type: "propose_proof", findingId: ids.f14!, outcome: "verified", reason: "Laporan peserta selaras dengan penjelasan faskes: obat tahap kedua tidak diserahkan dan peserta tidak diberi tahu." });
  });
  at("2026-10-02T14:00", () => {
    const prop = db.prepare("SELECT id FROM review_decisions WHERE finding_id = ? AND kind = 'proof_proposal' AND state = 'pending' ORDER BY id DESC LIMIT 1").get(ids.f14!) as { id: number };
    cmd(rev, { type: "decide_proof", proposalId: prop.id, approve: true, note: "Dua sumber selaras; hak jawab terpenuhi." });
    cmd(rev, { type: "set_causes", findingId: ids.f14!, causes: ["service_process", "administrative"], note: "Tidak ada penanggung jawab penyerahan tahap kedua (proses) dan tidak ada pencatatan sisa obat yang harus diserahkan (administratif)." });
  });
  at("2026-10-03T09:00", () => {
    ids.a14 = cmd(rsnm, { type: "create_action", findingId: ids.f14!, description: "Menunjuk penanggung jawab penyerahan obat tahap kedua dan menambahkan daftar sisa obat pada berkas pulang.", owner: "Kepala Instalasi Farmasi RS Nusa Medika", targetDate: "2026-10-24", remeasurePlan: "Konfirmasi peserta dan pengukuran ulang pemenuhan obat pada survei pascapelayanan." }).actionId as string;
  });
  at("2026-10-03T09:30", () => { cmd(rsnm, { type: "start_action", actionId: ids.a14! }); });
  at("2026-10-07T16:00", () => { cmd(rsnm, { type: "resolve_action", actionId: ids.a14!, result: "Penanggung jawab ditetapkan, daftar sisa obat masuk berkas pulang, dan peserta dihubungi untuk mengambil sisa obat." }); });
  at("2026-10-07T16:30", () => { cmd(ver1, { type: "request_followup", actionId: ids.a14!, participantId: "P-0104", dueDays: 14 }); });
  at("2026-10-08T12:00", () => {
    const fu = db.prepare("SELECT id FROM follow_ups WHERE action_id = ? AND kind = 'participant_confirmation'").get(ids.a14!) as { id: string };
    const peserta = P("U-PSR-SEED", "peserta", { participantId: "P-0104" });
    completeFollowUp(db, peserta, fu.id, "resolved", "Sisa obat sudah saya terima dan petugas menghubungi saya.");
  });
  at("2026-10-09T10:00", () => {
    const fu = db.prepare("SELECT id FROM follow_ups WHERE action_id = ? AND kind = 'remeasure'").get(ids.a14!) as { id: string };
    cmd(ver1, { type: "complete_followup", followUpId: fu.id, outcome: "resolved", note: "Pengukuran ulang pada tiga peserta terbaru dengan obat tahap kedua: semuanya menerima obat lengkap." });
  });
  at("2026-10-09T10:30", () => { cmd(rev, { type: "close_case", caseId: byFindingCase(db, ids.f14!), reason: "Temuan terbukti, tindakan perbaikan selesai, peserta mengonfirmasi, dan pengukuran ulang baik." }); });

  steps.sort((a, b) => a.at.localeCompare(b.at));
  for (const s of steps) {
    setNow(s.at);
    s.fn();
  }
  setNow(SEED_NOW);
}

function byFindingCase(db: Database.Database, findingId: string) {
  return (db.prepare("SELECT case_id FROM findings WHERE id = ?").get(findingId) as { case_id: string }).case_id;
}
