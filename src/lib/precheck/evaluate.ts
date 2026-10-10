import type Database from "better-sqlite3";
import { appendAudit } from "../audit";
import { assertCan, assertFacility, isInternal, type Principal } from "../auth/principal";
import { checkServices, codingIssue, detectForClaim, loadSignalCtx, membershipIssue, SIGNAL_THRESHOLD, type SignalCtx } from "../cases/signals";
import { nowPrecise } from "../clock";
import { json, nextId } from "../db";
import { DomainError } from "../idem";

/* Pemeriksaan pra-pengajuan: membantu faskes memperbaiki hal administratif SEBELUM klaim diajukan (mencegah pending).
   "Tahan" di demo ini adalah REKOMENDASI PENINJAUAN di dalam SEHATI. Bukan blokir pengajuan, bukan keputusan BPJS, bukan sanksi.
   Skor atau jawaban survei TIDAK dipakai untuk menahan klaim (pemeriksaan ini tidak membaca data survei sama sekali). */

export type PrecheckOutcome = "ready" | "review" | "hold" | "insufficient_data";
export type Severity = "ok" | "info" | "review" | "hold";

export const OUTCOME_LABEL: Record<PrecheckOutcome, { label: string; tone: "ok" | "warn" | "danger" | "muted"; hint: string }> = {
  ready: { label: "Siap diajukan", tone: "ok", hint: "Tidak ditemukan hal yang perlu ditinjau pada pemeriksaan ini. Bukan jaminan klaim akan dibayar." },
  review: { label: "Periksa dulu", tone: "warn", hint: "Ada hal yang sebaiknya ditinjau atau dilengkapi sebelum diajukan." },
  hold: { label: "Tahan (rekomendasi peninjauan)", tone: "danger", hint: "Rekomendasi untuk meninjau sebelum diajukan. Bukan blokir pengajuan ke BPJS dan bukan keputusan; petugas faskes tetap memutuskan." },
  insufficient_data: { label: "Data belum cukup", tone: "muted", hint: "Data klaim tidak cukup untuk diperiksa. Lengkapi rincian layanan lebih dulu." },
};

export interface Check { code: string; area: string; severity: Severity; title: string; detail: string; fix?: { label: string; href: string } }
export interface PrecheckResult { claimId: string; claimNo: string; facilityId: string; outcome: PrecheckOutcome; checks: Check[]; disclaimer: string }

export const PRECHECK_DISCLAIMER =
  "Pemeriksaan ini membantu kelengkapan dan tidak menjamin klaim dibayar. 'Tahan' hanyalah rekomendasi peninjauan dalam demo SEHATI, bukan blokir ke BPJS. Hasil survei peserta tidak dipakai di sini.";

export function runChecks(ctx: SignalCtx, claimId: string): PrecheckResult {
  const claim = ctx.claim.get(claimId);
  if (!claim) throw new DomainError("Klaim tidak ditemukan.", 404);
  const ep = ctx.ep.get(claim.episode_id)!;
  const checks: Check[] = [];
  const docsHref = `/console/documents?episode=${encodeURIComponent(ep.id)}`;
  const items = ctx.claimServices.get(claim.id) ?? [];

  // 1. kelengkapan data klaim
  const missing: string[] = [];
  if (!claim.group_code) missing.push("grup tarif");
  if (!claim.amount || claim.amount <= 0) missing.push("nilai klaim");
  if (!ep.dx_code) missing.push("kode diagnosis");
  if (!ep.admit_at || !ep.discharge_at || ep.discharge_at < ep.admit_at) missing.push("tanggal masuk/pulang yang konsisten");
  if (missing.length) checks.push({ code: "DATA_KLAIM", area: "Kelengkapan data klaim", severity: "hold", title: "Data wajib klaim belum lengkap", detail: `Belum terisi atau tidak konsisten: ${missing.join(", ")}.`, fix: { label: "Lengkapi data klaim", href: "/console/import" } });
  else checks.push({ code: "DATA_KLAIM", area: "Kelengkapan data klaim", severity: "ok", title: "Data wajib klaim terisi", detail: "Grup tarif, nilai, diagnosis, dan tanggal perawatan terisi." });

  // 2. rincian layanan
  if (items.length === 0) {
    checks.push({ code: "RINCIAN", area: "Rincian layanan", severity: "review", title: "Belum ada rincian layanan pada klaim", detail: "Tanpa rincian, kecocokan dengan catatan pelaksanaan tidak dapat diperiksa.", fix: { label: "Impor rincian layanan", href: "/console/import" } });
  } else {
    const sum = items.reduce((a, s) => a + s.amount, 0);
    const diff = Math.abs(sum - claim.amount);
    if (claim.amount > 0 && diff / claim.amount > 0.25) checks.push({ code: "NILAI", area: "Rincian layanan", severity: "review", title: "Jumlah rincian jauh berbeda dari nilai klaim", detail: `Jumlah rincian Rp${sum.toLocaleString("id-ID")} berbeda dari nilai klaim Rp${claim.amount.toLocaleString("id-ID")}. Klaim paket dapat berbeda dari jumlah rincian; pastikan selisih memang sesuai ketentuan paket.` });
    else checks.push({ code: "NILAI", area: "Rincian layanan", severity: "ok", title: "Rincian layanan tersedia", detail: `${items.length} baris layanan tertaut pada klaim.` });
  }

  // 3. kepesertaan
  const mem = membershipIssue(ctx, claim);
  if (mem) checks.push({ code: "KEPESERTAAN", area: "Kepesertaan", severity: "hold", title: "Masa penjaminan tidak mencakup tanggal perawatan", detail: mem, fix: { label: "Periksa data kepesertaan", href: "/console/pending" } });
  else {
    const cov = ctx.partCoverage.get(ep.participant_id);
    checks.push(cov && (cov.start || cov.end) ? { code: "KEPESERTAAN", area: "Kepesertaan", severity: "ok", title: "Masa penjaminan mencakup tanggal perawatan", detail: "Sesuai data penjaminan yang tersedia (simulasi)." } : { code: "KEPESERTAAN", area: "Kepesertaan", severity: "info", title: "Data penjaminan belum tersedia", detail: "Masa penjaminan peserta tidak ada pada data, sehingga tidak dapat diperiksa." });
  }

  // 4. koding
  const cod = codingIssue(ctx, claim);
  if (cod) checks.push({ code: "KODING", area: "Koding", severity: "review", title: "Koding tampak tidak selaras", detail: `${cod} Periksa terhadap resume medis; bila benar, abaikan.`, fix: { label: "Lihat resume dan dokumen", href: docsHref } });
  else checks.push({ code: "KODING", area: "Koding", severity: "ok", title: "Koding selaras pada katalog simulasi", detail: "Grup tarif selaras dengan kelompok diagnosis." });

  // 5. dokumentasi pelaksanaan
  if (items.length) {
    const svc = checkServices(ctx, claim);
    const kurang = svc.filter((c) => c.state === "kurang");
    const bertentangan = svc.filter((c) => c.state === "bertentangan");
    const nameOf = (id: string) => items.find((s) => s.id === id)?.name ?? id;
    if (kurang.length) checks.push({ code: "DOK_PELAKSANAAN", area: "Dokumentasi pelaksanaan", severity: "review", title: `${kurang.length} layanan belum memiliki catatan pelaksanaan`, detail: `Layanan: ${kurang.map((c) => nameOf(c.service_id)).join(", ")}. Catatan mungkin belum terunggah atau belum tertaut. Ini belum berarti layanan tidak dikerjakan.`, fix: { label: "Unggah dokumen bukti", href: docsHref } });
    if (bertentangan.length) checks.push({ code: "DOK_KONSISTEN", area: "Dokumentasi pelaksanaan", severity: "review", title: `${bertentangan.length} layanan memiliki catatan yang tidak konsisten`, detail: `${bertentangan.flatMap((c) => c.reasons).slice(0, 3).join(" ")}`, fix: { label: "Periksa dokumen", href: docsHref } });
    if (!kurang.length && !bertentangan.length) checks.push({ code: "DOK_PELAKSANAAN", area: "Dokumentasi pelaksanaan", severity: "ok", title: "Catatan pelaksanaan konsisten dengan rincian", detail: "Seluruh layanan yang memerlukan lembar tindakan memilikinya." });
  }

  // 6. kemiripan dengan klaim lain
  const sig = detectForClaim(ctx, claim).filter((d) => d.score >= SIGNAL_THRESHOLD);
  if (sig.length) for (const d of sig) checks.push({ code: `MIRIP_${d.type}`, area: "Kemiripan klaim", severity: "review", title: d.title, detail: `Kekuatan sinyal ${d.score}/100. ${d.limit_text}`, fix: { label: "Siapkan penjelasan atau bukti pendukung", href: docsHref } });
  else checks.push({ code: "MIRIP", area: "Kemiripan klaim", severity: "ok", title: "Tidak ada kemiripan yang melewati ambang", detail: "Tidak ditemukan klaim lain yang mirip pada peserta yang sama." });

  const outcome: PrecheckOutcome = checks.some((c) => c.severity === "hold")
    ? "hold"
    : items.length === 0
      ? "insufficient_data"
      : checks.some((c) => c.severity === "review")
        ? "review"
        : "ready";
  return { claimId: claim.id, claimNo: claim.claim_no, facilityId: claim.facility_id, outcome, checks, disclaimer: PRECHECK_DISCLAIMER };
}

export function evaluateClaim(db: Database.Database, p: Principal, claimId: string): PrecheckResult {
  assertCan(p, "precheck.use");
  const c = db.prepare("SELECT facility_id FROM claims WHERE id = ?").get(claimId) as { facility_id: string } | undefined;
  if (!c) throw new DomainError("Klaim tidak ditemukan.", 404);
  if (!isInternal(p)) assertFacility(p, c.facility_id);
  return runChecks(loadSignalCtx(db), claimId);
}

/** Pemeriksaan hanya bermakna sebelum diajukan (draft) atau setelah dikembalikan. */
export function precheckCandidates(db: Database.Database, p: Principal) {
  assertCan(p, "precheck.use");
  const where = isInternal(p) ? "" : "AND c.facility_id = ?";
  const rows = db.prepare(`SELECT c.id, c.claim_no, c.facility_id, f.name AS facility_name, c.amount, c.status FROM claims c JOIN facilities f ON f.id = c.facility_id WHERE c.status IN ('draft','returned') ${where} ORDER BY c.status, c.id`).all(...(isInternal(p) ? [] : [p.facilityId])) as { id: string; claim_no: string; facility_id: string; facility_name: string; amount: number; status: string }[];
  const ctx = loadSignalCtx(db);
  return rows.map((r) => ({ ...r, result: runChecks(ctx, r.id) }));
}

export interface RunRow { id: string; claim_id: string; facility_id: string; outcome: PrecheckOutcome; checks: Check[]; ran_by: string; ran_at: string }

/** Simpan hasil pemeriksaan sebagai riwayat (dan audit). Tidak mengubah klaim. */
export function savePrecheckRun(db: Database.Database, p: Principal, claimId: string): { id: string; result: PrecheckResult } {
  const result = evaluateClaim(db, p, claimId);
  return db.transaction(() => {
    const id = nextId(db, "PC");
    db.prepare("INSERT INTO precheck_runs (id, claim_id, facility_id, outcome, checks_json, ran_by, ran_at) VALUES (?,?,?,?,?,?,?)").run(id, claimId, result.facilityId, result.outcome, JSON.stringify(result.checks), p.id, nowPrecise());
    appendAudit(db, { actor: p.id, actor_role: p.role, action: "pra_pengajuan_dijalankan", entity: "claim", entity_id: claimId, detail: { hasil: result.outcome, periksa: result.checks.filter((c) => c.severity === "review").length, tahan: result.checks.filter((c) => c.severity === "hold").length } });
    return { id, result };
  })();
}

export function listRuns(db: Database.Database, p: Principal, claimId: string): RunRow[] {
  assertCan(p, "precheck.use");
  const c = db.prepare("SELECT facility_id FROM claims WHERE id = ?").get(claimId) as { facility_id: string } | undefined;
  if (!c) throw new DomainError("Klaim tidak ditemukan.", 404);
  if (!isInternal(p)) assertFacility(p, c.facility_id);
  return (db.prepare("SELECT * FROM precheck_runs WHERE claim_id = ? ORDER BY ran_at DESC, rowid DESC LIMIT 20").all(claimId) as (Omit<RunRow, "checks"> & { checks_json: string })[]).map((r) => ({ ...r, checks: json<Check[]>(r.checks_json, []) }));
}
