import type { Claim, Dataset, FindingDraft, Stage } from "../types";
import { buildCtx, type Ctx } from "./context";
import { detectFragmentation, detectPhantom, detectRepeat } from "./detectors";
import { checkServices, stageCoding, stageDocumentation, stageMembership } from "./stages";

export type CaseState = "open" | "clarification" | "decided" | null;

export interface ClaimReview {
  claim: Claim;
  stages: Stage[];
  findings: FindingDraft[];
}

/** Satu episode, enam tahap: tiga tahap pertama dari data, dua terakhir dari status kasus. */
export function reviewClaim(ctx: Ctx, claim: Claim, caseState: CaseState = null): ClaimReview {
  const findings = [detectRepeat(ctx, claim), detectFragmentation(ctx, claim), detectPhantom(ctx, claim)].filter(
    (f): f is FindingDraft => f !== null,
  );
  const claimStage: Stage = findings.length
    ? {
        key: "klaim",
        label: "Penyusunan klaim",
        status: findings.some((f) => f.modus !== "phantom") ? (findings.some((f) => f.severity !== "low") ? "fail" : "warn") : "ok",
        notes: findings.filter((f) => f.modus !== "phantom").map((f) => f.summary),
      }
    : { key: "klaim", label: "Penyusunan klaim", status: "ok", notes: ["Tidak ada duplikat atau pemecahan episode yang terdeteksi."] };
  if (claimStage.status === "ok" && findings.length && claimStage.notes.length === 0) {
    claimStage.notes = ["Tidak ada duplikat atau pemecahan episode yang terdeteksi."];
  }
  const verifikasi: Stage =
    findings.length === 0
      ? { key: "verifikasi", label: "Verifikasi", status: "ok", notes: ["Tidak ada kasus yang perlu diverifikasi."] }
      : caseState === "decided"
        ? { key: "verifikasi", label: "Verifikasi", status: "ok", notes: ["Pemeriksaan dan klarifikasi selesai."] }
        : caseState
          ? { key: "verifikasi", label: "Verifikasi", status: "warn", notes: ["Kasus sedang diperiksa."] }
          : { key: "verifikasi", label: "Verifikasi", status: "pending", notes: ["Menunggu kasus dibuka dan ditugaskan."] };
  const audit: Stage =
    caseState === "decided"
      ? { key: "audit", label: "Audit / perbaikan", status: "ok", notes: ["Keputusan dan alasan tercatat pada jejak audit."] }
      : findings.length === 0
        ? { key: "audit", label: "Audit / perbaikan", status: "ok", notes: ["Tidak ada temuan untuk diaudit."] }
        : { key: "audit", label: "Audit / perbaikan", status: "pending", notes: ["Menunggu keputusan."] };
  return {
    claim,
    stages: [
      stageMembership(ctx, claim),
      stageDocumentation(checkServices(ctx, claim)),
      stageCoding(ctx, claim),
      claimStage,
      verifikasi,
      audit,
    ],
    findings,
  };
}

export function runAll(ds: Dataset): ClaimReview[] {
  const ctx = buildCtx(ds);
  return ds.claims.map((c) => reviewClaim(ctx, c));
}
