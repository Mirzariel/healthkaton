import type Database from "better-sqlite3";
import { nowPrecise } from "../clock";
import type { Adapters, ClaimRecord, DataSource, EvidenceHit, PaymentEventRecord } from "./types";

const SIM_NOTE = "Simulator kontrak: membaca basis data demo sintetis. Tidak ada koneksi produksi.";

export function simulatedAdapters(db: Database.Database): Adapters {
  return {
    claimFeed: {
      status: () => ({ name: "ClaimFeedAdapter", source: "simulated", detail: `${SIM_NOTE} Koneksi klaim BPJS belum ada.` }),
      listClaims(filter = {}) {
        const where: string[] = [];
        const args: unknown[] = [];
        if (filter.facilityId) { where.push("facility_id = ?"); args.push(filter.facilityId); }
        if (filter.episodeId) { where.push("episode_id = ?"); args.push(filter.episodeId); }
        if (filter.status?.length) { where.push(`status IN (${filter.status.map(() => "?").join(",")})`); args.push(...filter.status); }
        const rows = db.prepare(`SELECT id, claim_no, episode_id, facility_id, group_code, amount, status, submitted_at, paid_at FROM claims ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id`).all(...args) as ClaimRecord[];
        return { source: "simulated", data: rows };
      },
      getClaim(id) {
        const r = db.prepare("SELECT id, claim_no, episode_id, facility_id, group_code, amount, status, submitted_at, paid_at FROM claims WHERE id = ?").get(id) as ClaimRecord | undefined;
        return { source: "simulated", data: r ?? null };
      },
    },
    evidence: {
      status: () => ({ name: "EvidenceAdapter", source: "simulated", detail: `${SIM_NOTE} Koneksi SIMRS/RME faskes belum ada.` }),
      search(q) {
        const rows = db.prepare(
          "SELECT v.id, v.episode_id, v.service_id, v.type, v.recorded_at, v.performer, v.summary FROM evidence v JOIN episodes e ON e.id = v.episode_id WHERE e.facility_id = ? AND v.episode_id = ? AND (? IS NULL OR v.service_id = ?) ORDER BY v.recorded_at",
        ).all(q.facilityId, q.episodeId, q.serviceId ?? null, q.serviceId ?? null) as EvidenceHit[];
        return { source: "simulated", data: rows };
      },
    },
    identity: {
      status: () => ({ name: "IdentityAdapter", source: "simulated", detail: `${SIM_NOTE} Verifikasi identitas JKN Mobile/BPJS belum terhubung; peserta berupa pseudonim sintetis.` }),
      resolveParticipant(id) {
        const r = db.prepare("SELECT id, pseudonym, coverage_start, coverage_end FROM participants WHERE id = ?").get(id) as { id: string; pseudonym: string; coverage_start: string | null; coverage_end: string | null } | undefined;
        if (!r) return { source: "simulated", data: null };
        const today = nowPrecise().slice(0, 10);
        const active = (!r.coverage_start || r.coverage_start <= today) && (!r.coverage_end || r.coverage_end >= today);
        return { source: "simulated", data: { id: r.id, pseudonym: r.pseudonym, coverage_active: active } };
      },
      isCompanionAuthorized(participantId, companionId) {
        const r = db.prepare("SELECT authorized FROM companions WHERE id = ? AND participant_id = ?").get(companionId, participantId) as { authorized: number } | undefined;
        return { source: "simulated", data: !!r?.authorized };
      },
    },
    notification: {
      status: () => ({ name: "NotificationAdapter", source: "simulated", detail: "Kotak keluar di basis data; tidak ada pesan terkirim ke WhatsApp/SMS/Mobile JKN." }),
      notify(n) {
        db.prepare("INSERT INTO notifications (to_role, to_id, topic, body, ref_type, ref_id, mode, created_at) VALUES (?,?,?,?,?,?, 'simulated', ?)").run(n.to_role, n.to_id ?? null, n.topic, n.body, n.ref_type ?? null, n.ref_id ?? null, nowPrecise());
        return { delivered: false, mode: "simulated" };
      },
    },
    paymentStatus: {
      status: () => ({ name: "PaymentStatusAdapter", source: "simulated", detail: `${SIM_NOTE} Sumber status bayar resmi belum tersedia; baris bertanda sumber masing-masing.` }),
      events(claimId) {
        return db.prepare("SELECT claim_id, type, at, amount, reason, source FROM payment_events WHERE claim_id = ? ORDER BY at, id").all(claimId) as PaymentEventRecord[];
      },
    },
  };
}
export type { DataSource };
