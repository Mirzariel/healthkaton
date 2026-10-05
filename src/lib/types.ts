export type Modus = "repeat_billing" | "fragmentation" | "phantom";
export type Role = "casemix" | "verifikator" | "auditor" | "dokter";
export type ClaimStatus = "draft" | "submitted" | "paid";
export type EvidenceType =
  | "resume_medis"
  | "lembar_tindakan"
  | "hasil_lab"
  | "e_resep"
  | "indikasi_medis";
export type ConfirmAnswer = "sesuai" | "tidak_sesuai" | "tidak_ingat";

export interface Participant {
  id: string;
  name: string;
  nik: string; // sintetis, bermasker
  dob: string;
  coverage_start: string;
  coverage_end: string | null;
  faskes1: string;
}
export interface Episode {
  id: string;
  participant_id: string;
  hospital: string;
  kind: "RJTL" | "RITL";
  admit_at: string; // ISO
  discharge_at: string;
  dx_code: string;
  dx_text: string;
  group_code: string;
}
export interface Service {
  id: string;
  episode_id: string;
  code: string;
  name: string;
  performed_at: string;
  performer: string;
  qty: number;
  amount: number;
}
export interface Evidence {
  id: string;
  episode_id: string;
  service_id: string | null;
  type: EvidenceType;
  recorded_at: string;
  performer: string;
  summary: string;
}
export interface Claim {
  id: string;
  claim_no: string;
  episode_id: string;
  group_code: string;
  amount: number;
  status: ClaimStatus;
  submitted_at: string | null;
  paid_at: string | null;
  hospital: string;
}
export interface Confirmation {
  id: string;
  service_id: string;
  participant_id: string;
  answer: ConfirmAnswer;
  note: string;
  at: string;
}
export interface Dataset {
  participants: Participant[];
  episodes: Episode[];
  services: Service[];
  evidence: Evidence[];
  claims: Claim[];
  confirmations: Confirmation[];
}

export type StageKey =
  | "kepesertaan"
  | "dokumentasi"
  | "koding"
  | "klaim"
  | "verifikasi"
  | "audit";
export type StageStatus = "ok" | "warn" | "fail" | "pending";
export interface Stage {
  key: StageKey;
  label: string;
  status: StageStatus;
  notes: string[];
}
export interface Signal {
  key: string;
  label: string;
  weight: number;
}
export interface FindingDraft {
  claim_id: string;
  episode_id: string;
  modus: Modus;
  score: number;
  severity: "low" | "medium" | "high";
  signals: Signal[];
  summary: string;
  limit: string; // batas kesimpulan
  related_claim_id: string | null;
}
export type EvidenceState = "tersedia" | "kurang" | "bertentangan";
export interface ServiceCheck {
  service_id: string;
  state: EvidenceState;
  reasons: string[];
}
