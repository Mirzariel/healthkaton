import { SVC, familyOfGroup } from "../catalog";
import { dayDiff, dayOf, rupiah } from "../dates";
import type { Claim, FindingDraft, Modus, Signal } from "../types";
import type { Ctx } from "./context";
import { checkServices } from "./stages";

export const FINDING_THRESHOLD = 30;

export const LIMIT_TEXT: Record<Modus, string> = {
  repeat_billing:
    "Kemiripan klaim belum otomatis berarti duplikat. Petugas perlu memeriksa indikasi medis dan bukti pelaksanaan sebelum menyimpulkan.",
  fragmentation:
    "Pemecahan episode dapat sah bila ada indikasi medis dan sesuai ketentuan. Sistem hanya menandai kedekatan waktu dan kelompok diagnosis.",
  phantom:
    "Bukti yang hilang belum membuktikan layanan tidak dilakukan; dokumen mungkin belum terunggah. Konfirmasi peserta adalah sinyal, bukan bukti.",
};

export const MODUS_LABEL: Record<Modus, string> = {
  repeat_billing: "Repeat billing (klaim berulang)",
  fragmentation: "Pemecahan episode / unbundling",
  phantom: "Phantom billing (tindakan tidak dilakukan)",
};

function severityOf(score: number): FindingDraft["severity"] {
  return score >= 70 ? "high" : score >= 50 ? "medium" : "low";
}

function finish(
  claim: Claim,
  modus: Modus,
  signals: Signal[],
  summary: string,
  related: string | null,
): FindingDraft | null {
  const raw = signals.reduce((a, s) => a + s.weight, 0);
  const score = Math.max(0, Math.min(100, raw));
  if (score < FINDING_THRESHOLD) return null;
  return {
    claim_id: claim.id,
    episode_id: claim.episode_id,
    modus,
    score,
    severity: severityOf(score),
    signals,
    summary,
    limit: LIMIT_TEXT[modus],
    related_claim_id: related,
  };
}

function hasMedicalIndication(ctx: Ctx, episodeId: string) {
  return (ctx.evidenceByEpisode.get(episodeId) ?? []).some((e) => e.type === "indikasi_medis");
}

function patientDisputes(ctx: Ctx, episodeId: string) {
  return (ctx.servicesByEpisode.get(episodeId) ?? []).some((s) =>
    (ctx.confByService.get(s.id) ?? []).some((c) => c.answer === "tidak_sesuai"),
  );
}

/** Repeat billing: klaim baru mengulang kasus yang sudah ditagihkan dan dibayar. */
export function detectRepeat(ctx: Ctx, claim: Claim): FindingDraft | null {
  const ep = ctx.ep.get(claim.episode_id)!;
  const mine = ctx.servicesByEpisode.get(ep.id) ?? [];
  const cutoff = claim.submitted_at ?? "9999-12-31";
  const priors = (ctx.claimsByParticipant.get(ep.participant_id) ?? []).filter(
    (p) => p.id !== claim.id && p.status === "paid" && p.paid_at && p.paid_at <= cutoff,
  );
  let best: FindingDraft | null = null;
  for (const p of priors) {
    const pep = ctx.ep.get(p.episode_id)!;
    const theirs = ctx.servicesByEpisode.get(pep.id) ?? [];
    const signals: Signal[] = [];
    if (p.episode_id === claim.episode_id) {
      signals.push({ key: "same_episode", label: "Episode yang sama sudah ditagihkan dan dibayar", weight: 55 });
    }
    const overlap = mine.filter((s) => theirs.some((t) => t.code === s.code && dayOf(t.performed_at) === dayOf(s.performed_at)));
    if (mine.length && overlap.length / mine.length >= 0.5) {
      signals.push({ key: "same_service_same_day", label: `${overlap.length} dari ${mine.length} layanan sama persis (kode dan tanggal) dengan klaim ${p.claim_no}`, weight: 35 });
    }
    const gap = Math.abs(dayDiff(pep.admit_at, ep.admit_at));
    if (p.group_code === claim.group_code && gap <= 30) {
      signals.push({ key: "same_group_30d", label: `Grup tarif sama (${claim.group_code}) dalam ${gap} hari`, weight: 15 });
    }
    if (signals.length === 0) continue;
    if (patientDisputes(ctx, ep.id)) {
      signals.push({ key: "patient_disputes", label: "Peserta menyatakan ada layanan yang tidak sesuai", weight: 15 });
    }
    if (hasMedicalIndication(ctx, ep.id) && p.episode_id !== claim.episode_id) {
      signals.push({ key: "medical_indication", label: "Ada catatan indikasi medis untuk episode baru", weight: -35 });
    }
    const f = finish(
      claim,
      "repeat_billing",
      signals,
      `Klaim ${claim.claim_no} mirip dengan klaim ${p.claim_no} yang sudah dibayar (${rupiah(p.amount)}).`,
      p.id,
    );
    if (f && (!best || f.score > best.score)) best = f;
  }
  return best;
}

/** Pemecahan episode / unbundling: perawatan beruntun dengan kelompok diagnosis yang sama ditagih terpisah. */
export function detectFragmentation(ctx: Ctx, claim: Claim): FindingDraft | null {
  const ep = ctx.ep.get(claim.episode_id)!;
  const eps = ctx.episodesByParticipant.get(ep.participant_id) ?? [];
  const fam = familyOfGroup(claim.group_code);
  let best: FindingDraft | null = null;
  for (const prev of eps) {
    if (prev.id === ep.id || prev.hospital !== ep.hospital) continue;
    const gap = dayDiff(prev.discharge_at, ep.admit_at);
    if (gap < 0 || gap > 3) continue;
    const prevClaims = ctx.claimsByEpisode.get(prev.id) ?? [];
    if (prevClaims.length === 0) continue;
    const signals: Signal[] = [
      gap <= 1
        ? { key: "gap_le_1d", label: `Masuk kembali ${gap === 0 ? "di hari yang sama" : "1 hari"} setelah pulang`, weight: 40 }
        : { key: "gap_2_3d", label: `Masuk kembali ${gap} hari setelah pulang`, weight: 25 },
    ];
    if (familyOfGroup(prevClaims[0].group_code) === fam) {
      signals.push({ key: "same_family", label: `Kelompok diagnosis sama (${fam})`, weight: 30 });
    }
    if (prev.dx_code === ep.dx_code) {
      signals.push({ key: "same_dx", label: `Diagnosis utama sama (${ep.dx_code})`, weight: 10 });
    }
    if (hasMedicalIndication(ctx, ep.id)) {
      signals.push({ key: "medical_indication", label: "Ada catatan indikasi medis untuk episode ini", weight: -35 });
    } else {
      signals.push({ key: "no_indication", label: "Tidak ada catatan indikasi medis untuk perawatan terpisah", weight: 20 });
    }
    const f = finish(
      claim,
      "fragmentation",
      signals,
      `Episode ${ep.id} tampak lanjutan dari ${prev.id} (${prevClaims[0].claim_no}) dan ditagih terpisah.`,
      prevClaims[0].id,
    );
    if (f && (!best || f.score > best.score)) best = f;
  }
  return best;
}

/** Phantom billing: layanan ditagihkan tanpa bukti pelaksanaan yang konsisten. */
export function detectPhantom(ctx: Ctx, claim: Claim): FindingDraft | null {
  const checks = checkServices(ctx, claim);
  const services = ctx.servicesByEpisode.get(claim.episode_id) ?? [];
  const flagged = checks.filter((c) => c.state !== "tersedia");
  if (flagged.length === 0) return null;
  const byId = new Map(services.map((s) => [s.id, s]));
  const missing = flagged.filter((c) => c.state === "kurang");
  const contra = flagged.filter((c) => c.state === "bertentangan");
  const flaggedAmount = flagged.reduce((a, c) => a + (byId.get(c.service_id)?.amount ?? 0), 0);
  const total = services.reduce((a, s) => a + s.amount, 0) || 1;
  const signals: Signal[] = [];
  if (missing.length) {
    signals.push({ key: "no_execution_record", label: `${missing.length} layanan tanpa lembar tindakan`, weight: 40 });
  }
  if (contra.length) {
    signals.push({ key: "contradicting_record", label: `${contra.length} layanan dengan bukti yang bertentangan`, weight: 40 });
  }
  if (flaggedAmount / total >= 0.2) {
    signals.push({ key: "high_value_share", label: `Layanan bermasalah bernilai ${Math.round((flaggedAmount / total) * 100)}% dari tagihan`, weight: 15 });
  }
  let said: "tidak_sesuai" | "sesuai" | null = null;
  for (const c of flagged) {
    const answers = ctx.confByService.get(c.service_id) ?? [];
    if (answers.some((a) => a.answer === "tidak_sesuai")) said = "tidak_sesuai";
    else if (said === null && answers.some((a) => a.answer === "sesuai")) said = "sesuai";
  }
  if (said === "tidak_sesuai") {
    signals.push({ key: "patient_disputes", label: "Peserta menyatakan layanan tersebut tidak sesuai", weight: 20 });
  } else if (said === "sesuai") {
    signals.push({ key: "patient_confirms", label: "Peserta mengonfirmasi layanan tersebut diterima", weight: -25 });
  }
  const names = flagged.map((c) => byId.get(c.service_id)!.code).join(", ");
  return finish(
    claim,
    "phantom",
    signals,
    `${flagged.length} layanan (${rupiah(flaggedAmount)}) belum didukung bukti pelaksanaan yang konsisten: ${names}.`,
    null,
  );
}

export function neededRecordCodes() {
  return Object.values(SVC).filter((s) => s.needsRecord).map((s) => s.code);
}
