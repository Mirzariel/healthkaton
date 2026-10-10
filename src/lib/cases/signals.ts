import type Database from "better-sqlite3";
import { SVC, dxByCode, familyOfGroup } from "../catalog";
import { dayDiff, dayOf, rupiah, ts } from "../dates";
import { json } from "../db";
import type { FindingType } from "../labels";

/* Mesin sinyal klaim. Keluarannya SINYAL (kandidat), bukan temuan terbukti dan bukan putusan.
   Bahasa netral: "dokumentasi belum ditemukan", "kandidat tagihan berulang", "kandidat perawatan lanjutan". */

export const SIGNAL_THRESHOLD = 30;

export interface Sig {
  key: string;
  label: string;
  weight: number;
}
export interface SignalDraft {
  type: Extract<FindingType, "T1" | "T2" | "T3">;
  claim_id: string;
  related_claim_id: string | null;
  episode_id: string;
  facility_id: string;
  service_id: string | null;
  dedupe_key: string;
  title: string;
  summary: string;
  limit_text: string;
  signals: Sig[];
  score: number;
  flagged_services?: string[];
}

export const LIMIT_TEXT: Record<"T1" | "T2" | "T3", string> = {
  T1: "Dokumen yang belum ditemukan belum membuktikan layanan tidak dilakukan; dokumen mungkin belum terunggah atau belum tertaut. Jawaban peserta adalah sumber informasi, bukan putusan.",
  T2: "Kemiripan klaim belum otomatis berarti duplikasi. Petugas perlu memeriksa indikasi medis, kelengkapan paket, dan bukti pelaksanaan sebelum menyimpulkan.",
  T3: "Dua episode beruntun dapat sah bila ada indikasi medis dan sesuai ketentuan. Sistem hanya menandai kedekatan waktu dan kelompok diagnosis.",
};

export type EvidenceState = "tersedia" | "kurang" | "bertentangan";
export interface ServiceCheck {
  service_id: string;
  state: EvidenceState;
  reasons: string[];
}

interface ClaimRow { id: string; claim_no: string; episode_id: string; facility_id: string; group_code: string; amount: number; status: string; submitted_at: string | null; paid_at: string | null }
interface EpisodeRow { id: string; participant_id: string; facility_id: string; kind: string; admit_at: string; discharge_at: string; dx_code: string; group_code: string }
interface ServiceRow { id: string; episode_id: string; code: string; name: string; performed_at: string; performer: string; qty: number; amount: number }
interface EvidenceRow { id: string; episode_id: string; service_id: string | null; type: string; recorded_at: string; performer: string }
export interface DirectedFact { service_id: string; value: string; respondent_role: "self" | "companion" }

export interface SignalCtx {
  claims: ClaimRow[];
  claim: Map<string, ClaimRow>;
  ep: Map<string, EpisodeRow>;
  partCoverage: Map<string, { start: string | null; end: string | null }>;
  claimsByEpisode: Map<string, ClaimRow[]>;
  claimsByParticipant: Map<string, ClaimRow[]>;
  episodesByParticipant: Map<string, EpisodeRow[]>;
  servicesByEpisode: Map<string, ServiceRow[]>;
  claimServices: Map<string, ServiceRow[]>;
  evidenceByEpisode: Map<string, EvidenceRow[]>;
  directed: Map<string, DirectedFact[]>;
}

function group<T>(items: T[], key: (t: T) => string) {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const a = m.get(k);
    if (a) a.push(it);
    else m.set(k, [it]);
  }
  return m;
}

export function loadSignalCtx(db: Database.Database): SignalCtx {
  const claims = db.prepare("SELECT id, claim_no, episode_id, facility_id, group_code, amount, status, submitted_at, paid_at FROM claims").all() as ClaimRow[];
  const eps = db.prepare("SELECT id, participant_id, facility_id, kind, admit_at, discharge_at, dx_code, group_code FROM episodes").all() as EpisodeRow[];
  const services = db.prepare("SELECT id, episode_id, code, name, performed_at, performer, qty, amount FROM services").all() as ServiceRow[];
  const evidence = db.prepare("SELECT id, episode_id, service_id, type, recorded_at, performer FROM evidence").all() as EvidenceRow[];
  const cov = db.prepare("SELECT id, coverage_start, coverage_end FROM participants").all() as { id: string; coverage_start: string | null; coverage_end: string | null }[];
  const items = db.prepare("SELECT claim_id, service_id FROM claim_items").all() as { claim_id: string; service_id: string }[];
  const facts = db.prepare(
    "SELECT f.subject AS service_id, f.value, s.respondent_role FROM participant_facts f JOIN survey_sessions s ON s.id = f.session_id WHERE f.slot = 'service_performed' AND f.status = 'active' AND f.subject IS NOT NULL AND s.is_sandbox = 0",
  ).all() as { service_id: string; value: string; respondent_role: "self" | "companion" }[];
  const ep = new Map(eps.map((e) => [e.id, e]));
  const svcById = new Map(services.map((s) => [s.id, s]));
  const claimServices = new Map<string, ServiceRow[]>();
  for (const it of items) {
    const s = svcById.get(it.service_id);
    if (!s) continue;
    const a = claimServices.get(it.claim_id);
    if (a) a.push(s);
    else claimServices.set(it.claim_id, [s]);
  }
  return {
    claims,
    claim: new Map(claims.map((c) => [c.id, c])),
    ep,
    partCoverage: new Map(cov.map((c) => [c.id, { start: c.coverage_start, end: c.coverage_end }])),
    claimsByEpisode: group(claims, (c) => c.episode_id),
    claimsByParticipant: group(claims, (c) => ep.get(c.episode_id)?.participant_id ?? ""),
    episodesByParticipant: group(eps, (e) => e.participant_id),
    servicesByEpisode: group(services, (s) => s.episode_id),
    claimServices,
    evidenceByEpisode: group(evidence, (e) => e.episode_id),
    directed: group(facts, (f) => f.service_id),
  };
}

/** Pencocokan layanan yang ditagih dengan catatan pelaksanaan: tersedia / kurang / bertentangan. */
export function checkServices(ctx: SignalCtx, claim: ClaimRow): ServiceCheck[] {
  const ep = ctx.ep.get(claim.episode_id)!;
  const services = ctx.claimServices.get(claim.id) ?? ctx.servicesByEpisode.get(ep.id) ?? [];
  const evidence = ctx.evidenceByEpisode.get(ep.id) ?? [];
  const out: ServiceCheck[] = [];
  const lo = ts(ep.admit_at) - 2 * 3600000;
  const hi = ts(ep.discharge_at) + 6 * 3600000;
  for (const s of services) {
    const info = SVC[s.code];
    if (!info?.needsRecord) {
      out.push({ service_id: s.id, state: "tersedia", reasons: ["Tidak memerlukan lembar tindakan."] });
      continue;
    }
    const rec = evidence.filter((e) => e.type === "lembar_tindakan" && e.service_id === s.id);
    if (rec.length === 0) {
      out.push({ service_id: s.id, state: "kurang", reasons: ["Belum ada lembar tindakan yang tertaut dengan layanan ini."] });
      continue;
    }
    const reasons: string[] = [];
    for (const r of rec) {
      const t = ts(r.recorded_at);
      if (t < lo || t > hi) reasons.push(`Waktu pencatatan (${r.recorded_at.replace("T", " ")}) berada di luar rentang perawatan.`);
      if (r.performer !== s.performer) reasons.push(`Pelaksana pada catatan (${r.performer}) berbeda dari yang ditagihkan (${s.performer}).`);
    }
    out.push(reasons.length ? { service_id: s.id, state: "bertentangan", reasons } : { service_id: s.id, state: "tersedia", reasons: ["Lembar tindakan konsisten dengan tagihan."] });
  }
  return out;
}

const hasIndication = (ctx: SignalCtx, episodeId: string) => (ctx.evidenceByEpisode.get(episodeId) ?? []).some((e) => e.type === "indikasi_medis");
const finishScore = (sigs: Sig[]) => Math.max(0, Math.min(100, sigs.reduce((a, s) => a + s.weight, 0)));

/** T2: kandidat tagihan berulang. */
export function detectRepeat(ctx: SignalCtx, claim: ClaimRow): SignalDraft | null {
  const ep = ctx.ep.get(claim.episode_id)!;
  const mine = ctx.claimServices.get(claim.id) ?? ctx.servicesByEpisode.get(ep.id) ?? [];
  const cutoff = claim.submitted_at ?? "9999-12-31";
  const priors = (ctx.claimsByParticipant.get(ep.participant_id) ?? []).filter((p) => p.id !== claim.id && p.status === "paid" && p.paid_at && p.paid_at <= cutoff);
  let best: SignalDraft | null = null;
  for (const p of priors) {
    const pep = ctx.ep.get(p.episode_id)!;
    const theirs = ctx.claimServices.get(p.id) ?? ctx.servicesByEpisode.get(pep.id) ?? [];
    const sigs: Sig[] = [];
    if (p.episode_id === claim.episode_id) sigs.push({ key: "same_episode", label: "Episode yang sama sudah memiliki klaim yang dibayar", weight: 55 });
    const overlap = mine.filter((s) => theirs.some((t) => t.code === s.code && dayOf(t.performed_at) === dayOf(s.performed_at)));
    if (mine.length && overlap.length / mine.length >= 0.5) sigs.push({ key: "same_service_same_day", label: `${overlap.length} dari ${mine.length} layanan sama (kode dan tanggal) dengan klaim ${p.claim_no}`, weight: 35 });
    const gap = Math.abs(dayDiff(pep.admit_at, ep.admit_at));
    if (p.group_code === claim.group_code && gap <= 30) sigs.push({ key: "same_group_30d", label: `Kelompok tarif sama (${claim.group_code}) dalam ${gap} hari`, weight: 15 });
    if (sigs.length === 0) continue;
    if (hasIndication(ctx, ep.id) && p.episode_id !== claim.episode_id) sigs.push({ key: "medical_indication", label: "Ada catatan indikasi medis untuk episode baru", weight: -35 });
    const score = finishScore(sigs);
    if (score < SIGNAL_THRESHOLD) continue;
    const d: SignalDraft = {
      type: "T2", claim_id: claim.id, related_claim_id: p.id, episode_id: claim.episode_id, facility_id: claim.facility_id, service_id: null,
      dedupe_key: `T2:${claim.id}:${p.id}`, title: `Kandidat tagihan berulang: ${claim.claim_no}`,
      summary: `Klaim ${claim.claim_no} mirip dengan klaim ${p.claim_no} yang sudah dibayar (${rupiah(p.amount)}). Belum dibuktikan.`,
      limit_text: LIMIT_TEXT.T2, signals: sigs, score,
    };
    if (!best || d.score > best.score) best = d;
  }
  return best;
}

/** T3: kandidat perawatan lanjutan yang ditagih terpisah. */
export function detectContinuation(ctx: SignalCtx, claim: ClaimRow): SignalDraft | null {
  const ep = ctx.ep.get(claim.episode_id)!;
  const eps = ctx.episodesByParticipant.get(ep.participant_id) ?? [];
  const fam = familyOfGroup(claim.group_code);
  let best: SignalDraft | null = null;
  for (const prev of eps) {
    if (prev.id === ep.id || prev.facility_id !== ep.facility_id) continue;
    const gap = dayDiff(prev.discharge_at, ep.admit_at);
    if (gap < 0 || gap > 3) continue;
    const prevClaims = ctx.claimsByEpisode.get(prev.id) ?? [];
    if (prevClaims.length === 0) continue;
    const sigs: Sig[] = [
      gap <= 1
        ? { key: "gap_le_1d", label: `Masuk kembali ${gap === 0 ? "di hari yang sama" : "1 hari"} setelah pulang`, weight: 40 }
        : { key: "gap_2_3d", label: `Masuk kembali ${gap} hari setelah pulang`, weight: 25 },
    ];
    if (familyOfGroup(prevClaims[0].group_code) === fam) sigs.push({ key: "same_family", label: `Kelompok diagnosis sama (${fam})`, weight: 30 });
    if (prev.dx_code === ep.dx_code) sigs.push({ key: "same_dx", label: `Diagnosis utama sama (${ep.dx_code})`, weight: 10 });
    if (hasIndication(ctx, ep.id)) sigs.push({ key: "medical_indication", label: "Ada catatan indikasi medis untuk episode ini", weight: -35 });
    else sigs.push({ key: "no_indication", label: "Belum ada catatan indikasi medis untuk perawatan terpisah", weight: 20 });
    const score = finishScore(sigs);
    if (score < SIGNAL_THRESHOLD) continue;
    const d: SignalDraft = {
      type: "T3", claim_id: claim.id, related_claim_id: prevClaims[0].id, episode_id: claim.episode_id, facility_id: claim.facility_id, service_id: null,
      dedupe_key: `T3:${claim.id}:${prevClaims[0].id}`, title: `Kandidat perawatan lanjutan: ${ep.id} setelah ${prev.id}`,
      summary: `Episode ${ep.id} tampak lanjutan dari ${prev.id} (${prevClaims[0].claim_no}) dan ditagih terpisah. Belum dibuktikan.`,
      limit_text: LIMIT_TEXT.T3, signals: sigs, score,
    };
    if (!best || d.score > best.score) best = d;
  }
  return best;
}

/** T1: dokumentasi pelaksanaan belum ditemukan. Jawaban peserta menyesuaikan bobot; "tidak ingat" berbobot 0. */
export function detectDocumentation(ctx: SignalCtx, claim: ClaimRow): SignalDraft | null {
  const checks = checkServices(ctx, claim);
  const services = ctx.claimServices.get(claim.id) ?? ctx.servicesByEpisode.get(claim.episode_id) ?? [];
  const flagged = checks.filter((c) => c.state !== "tersedia");
  if (flagged.length === 0) return null;
  const byId = new Map(services.map((s) => [s.id, s]));
  const missing = flagged.filter((c) => c.state === "kurang");
  const contra = flagged.filter((c) => c.state === "bertentangan");
  const flaggedAmount = flagged.reduce((a, c) => a + (byId.get(c.service_id)?.amount ?? 0), 0);
  const total = services.reduce((a, s) => a + s.amount, 0) || 1;
  const sigs: Sig[] = [];
  if (missing.length) sigs.push({ key: "no_execution_record", label: `${missing.length} layanan belum memiliki catatan pelaksanaan yang tertaut`, weight: 40 });
  if (contra.length) sigs.push({ key: "inconsistent_record", label: `${contra.length} layanan dengan catatan yang tidak selaras dengan tagihan`, weight: 40 });
  if (flaggedAmount / total >= 0.2) sigs.push({ key: "high_value_share", label: `Layanan yang dokumentasinya belum ditemukan bernilai ${Math.round((flaggedAmount / total) * 100)}% dari rincian tagihan`, weight: 15 });
  // Jawaban peserta pada konfirmasi terarah. Pendamping bukan pengalaman langsung: bobot setengah. 'unknown' berbobot 0.
  let no = 0, yes = 0;
  for (const c of flagged) {
    for (const f of ctx.directed.get(c.service_id) ?? []) {
      const w = f.respondent_role === "self" ? 1 : 0.5;
      if (f.value === "no") no = Math.max(no, w);
      else if (f.value === "yes") yes = Math.max(yes, w);
    }
  }
  if (no > 0) sigs.push({ key: "participant_reports_not_received", label: `Peserta${no < 1 ? " (melalui pendamping)" : ""} melaporkan tidak menjalani layanan tersebut`, weight: Math.round(20 * no) });
  if (yes > 0) sigs.push({ key: "participant_confirms_received", label: `Peserta${yes < 1 ? " (melalui pendamping)" : ""} mengonfirmasi menjalani layanan tersebut`, weight: -Math.round(25 * yes) });
  const score = finishScore(sigs);
  if (score < SIGNAL_THRESHOLD) return null;
  const codes = flagged.map((c) => byId.get(c.service_id)?.code ?? "?");
  const first = flagged[0].service_id;
  return {
    type: "T1", claim_id: claim.id, related_claim_id: null, episode_id: claim.episode_id, facility_id: claim.facility_id, service_id: flagged.length === 1 ? first : null,
    dedupe_key: `T1:${claim.id}`, title: `Dokumentasi pelaksanaan belum ditemukan: ${codes.join(", ")}`,
    summary: `${flagged.length} layanan (${rupiah(flaggedAmount)} pada rincian) belum memiliki catatan pelaksanaan yang konsisten: ${codes.join(", ")}. Belum dibuktikan; dokumen mungkin belum tertaut.`,
    limit_text: LIMIT_TEXT.T1, signals: sigs, score, flagged_services: flagged.map((c) => c.service_id),
  };
}

export function detectForClaim(ctx: SignalCtx, claim: ClaimRow): SignalDraft[] {
  return [detectRepeat(ctx, claim), detectContinuation(ctx, claim), detectDocumentation(ctx, claim)].filter((d): d is SignalDraft => d !== null);
}

export function detectAll(db: Database.Database): { ctx: SignalCtx; drafts: SignalDraft[] } {
  const ctx = loadSignalCtx(db);
  const drafts: SignalDraft[] = [];
  for (const c of ctx.claims) drafts.push(...detectForClaim(ctx, c));
  return { ctx, drafts };
}

export const tierOf = (score: number) => (score >= 70 ? 3 : score >= 50 ? 2 : 1);

/** Pemeriksaan keanggotaan, dipakai pemilahan pending. */
export function membershipIssue(ctx: SignalCtx, claim: ClaimRow): string | null {
  const ep = ctx.ep.get(claim.episode_id)!;
  const cov = ctx.partCoverage.get(ep.participant_id);
  if (!cov) return null;
  const admit = dayOf(ep.admit_at);
  if (cov.start && admit < cov.start) return `Perawatan mulai ${admit}, sebelum penjaminan aktif (${cov.start}).`;
  if (cov.end && admit > cov.end) return `Perawatan mulai ${admit}, setelah penjaminan berakhir (${cov.end}).`;
  return null;
}

/** Pemeriksaan koding sederhana pada katalog simulasi. */
export function codingIssue(ctx: SignalCtx, claim: ClaimRow): string | null {
  const ep = ctx.ep.get(claim.episode_id)!;
  const dx = dxByCode(ep.dx_code);
  if (!dx) return `Kode diagnosis ${ep.dx_code} tidak ada pada katalog simulasi.`;
  if (familyOfGroup(claim.group_code) !== dx.family) return `Grup tarif ${claim.group_code} tampak tidak selaras dengan diagnosis ${dx.code} (${dx.text}).`;
  return null;
}

export function parseSignals(s: string | null | undefined) {
  return json<Sig[]>(s, []);
}
