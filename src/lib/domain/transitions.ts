import type { ActionStatus, CaseLifecycle, ProofStatus, SessionStatus } from "../labels";

/* Tabel transisi status: SATU sumber untuk kode domain, tampilan (tombol yang boleh muncul), dan tes.
   Basis data menegakkan tabel yang sama lewat trigger (lihat db/schema.ts, migrasi 002_guards); tes memastikan keduanya sama. */

export const PROOF_TRANSITIONS: Record<ProofStatus, ProofStatus[]> = {
  signal: ["under_review", "awaiting_clarification", "not_verified", "inconclusive"],
  under_review: ["awaiting_clarification", "verified", "not_verified", "inconclusive"],
  awaiting_clarification: ["under_review"],
  verified: ["under_review"],
  not_verified: ["under_review"],
  inconclusive: ["under_review"],
};
export const PROOF_FINAL: ProofStatus[] = ["verified", "not_verified", "inconclusive"];

export const ACTION_TRANSITIONS: Record<ActionStatus, ActionStatus[]> = {
  open: ["in_progress"],
  in_progress: ["resolved"],
  resolved: ["follow_up_pending", "closed"],
  follow_up_pending: ["closed", "in_progress"],
  closed: [],
};

export const LIFECYCLE_TRANSITIONS: Record<CaseLifecycle, CaseLifecycle[]> = {
  new: ["assigned", "in_progress", "closed"],
  assigned: ["in_progress", "closed"],
  in_progress: ["assigned", "closed"],
  closed: ["reopened"],
  reopened: ["assigned", "in_progress", "closed"],
};

export const SESSION_TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  scheduled: ["active", "expired", "cancelled"],
  active: ["completed", "partial", "expired", "cancelled"],
  completed: [],
  partial: [],
  expired: [],
  cancelled: [],
};

export type ClarificationStatus = "sent" | "answered" | "lapsed" | "withdrawn";
export const CLARIFICATION_TRANSITIONS: Record<ClarificationStatus, ClarificationStatus[]> = {
  sent: ["answered", "lapsed", "withdrawn"],
  // jawaban yang terlambat tetap diterima: hak jawab tidak hilang karena tenggat (keterlambatan dicatat terpisah)
  lapsed: ["answered"],
  answered: [],
  withdrawn: [],
};

export function canMove<S extends string>(table: Record<S, S[]>, from: S, to: S) {
  return from === to || table[from].includes(to);
}
export class TransitionError extends Error {
  constructor(what: string, from: string, to: string) {
    super(`Transisi ${what} dari "${from}" ke "${to}" tidak diizinkan.`);
  }
}
export function assertMove<S extends string>(what: string, table: Record<S, S[]>, from: S, to: S) {
  if (!canMove(table, from, to)) throw new TransitionError(what, from, to);
}
