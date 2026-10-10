import type Database from "better-sqlite3";

/* Kontrak adapter SEHATI. Domain hanya bergantung pada antarmuka ini. Mengganti sumber (simulasi → impor → langsung)
   cukup mengganti implementasi di adapters/index.ts; tidak ada perubahan skema domain atau UI.
   Setiap hasil membawa `source` agar UI selalu dapat menampilkan Simulasi / Impor / Langsung / Tidak tersedia. */

export type DataSource = "simulated" | "import" | "live" | "unavailable";
export interface AdapterStatus {
  name: string;
  source: DataSource;
  detail: string;
}

export interface Sourced<T> {
  source: DataSource;
  data: T;
}

/* ClaimFeedAdapter: sumber episode/klaim. Produksi BPJS TIDAK terhubung; implementasi bawaan membaca basis data demo. */
export interface ClaimRecord {
  id: string;
  claim_no: string;
  episode_id: string;
  facility_id: string;
  group_code: string | null;
  amount: number | null;
  status: "draft" | "submitted" | "paid" | "pending" | "returned";
  submitted_at: string | null;
  paid_at: string | null;
}
export interface ClaimFeedAdapter {
  status(): AdapterStatus;
  listClaims(filter?: { facilityId?: string; status?: ClaimRecord["status"][]; episodeId?: string }): Sourced<ClaimRecord[]>;
  getClaim(id: string): Sourced<ClaimRecord | null>;
}

/* EvidenceAdapter: mencari catatan pelaksanaan di sistem faskes (SIMRS/RME). Bawaan: tabel evidence demo. */
export interface EvidenceHit {
  id: string;
  episode_id: string;
  service_id: string | null;
  type: string;
  recorded_at: string;
  performer: string;
  summary: string;
}
export interface EvidenceAdapter {
  status(): AdapterStatus;
  search(q: { facilityId: string; episodeId: string; serviceId?: string }): Sourced<EvidenceHit[]>;
}

/* IdentityAdapter: peserta pseudonim dan otorisasi pendamping. Bawaan: tabel participants/companions demo. */
export interface ParticipantRef {
  id: string;
  pseudonym: string;
  coverage_active: boolean;
}
export interface IdentityAdapter {
  status(): AdapterStatus;
  resolveParticipant(id: string): Sourced<ParticipantRef | null>;
  isCompanionAuthorized(participantId: string, companionId: string): Sourced<boolean>;
}

/* NotificationAdapter: pesan ke peserta/faskes/petugas. Bawaan: kotak keluar di basis data (tidak mengirim ke kanal nyata). */
export interface Notice {
  to_role: string;
  to_id?: string | null;
  topic: string;
  body: string;
  ref_type?: string;
  ref_id?: string;
}
export interface NotificationAdapter {
  status(): AdapterStatus;
  notify(n: Notice): { delivered: boolean; mode: "simulated" | "live" };
}

/* PaymentStatusAdapter: riwayat status bayar. Bawaan: tabel payment_events (sumber simulated/import/unavailable). */
export interface PaymentEventRecord {
  claim_id: string;
  type: "submitted" | "complete" | "due" | "paid" | "pending" | "returned";
  at: string;
  amount: number | null;
  reason: string | null;
  source: DataSource;
}
export interface PaymentStatusAdapter {
  status(): AdapterStatus;
  events(claimId: string): PaymentEventRecord[];
}

export interface Adapters {
  claimFeed: ClaimFeedAdapter;
  evidence: EvidenceAdapter;
  identity: IdentityAdapter;
  notification: NotificationAdapter;
  paymentStatus: PaymentStatusAdapter;
}
export type { Database };
