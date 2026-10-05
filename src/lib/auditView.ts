import type Database from "better-sqlite3";
import { phraseFor, ANSWER_LABEL, cap, type Answer } from "@/components/m/phrases";
import { DECISION_LABEL, ROLE_LABEL } from "./actions";
import type { AuditRow } from "./audit";
import { rupiah, ts } from "./dates";
import { MODUS_LABEL } from "./engine/detectors";
import type { Modus, Role } from "./types";

/* Tampilan jejak audit untuk manusia (READ-ONLY).
   Mengubah baris mentah (JSON, id objek, hash) menjadi kalimat biasa, nama yang dikenali, dan lencana peran.
   Tidak menulis apa pun ke basis data dan tidak mengubah isi/hash jejak. */

export type ActorGroup = "petugas" | "peserta" | "sistem";

export interface ActorMeta {
  label: string;
  group: ActorGroup;
  /** Kelas warna lencana. */
  badge: string;
  /** Warna titik/ikon pada garis waktu. */
  dot: string;
  hint: string;
}

export const ACTOR_META: Record<string, ActorMeta> = {
  sistem: { label: "Sistem SEHATI", group: "sistem", badge: "bg-brand-soft text-brand", dot: "bg-brand", hint: "Dicatat otomatis oleh mesin pemeriksa." },
  otomatis: { label: "Mesin otomatis", group: "sistem", badge: "bg-ink text-white", dot: "bg-ink", hint: "Keputusan yang diambil mesin sendiri pada kasus yang sangat jelas." },
  peserta: { label: "Peserta", group: "peserta", badge: "bg-ok-soft text-ok", dot: "bg-ok", hint: "Jawaban peserta lewat aplikasi (konsep JKN Mobile)." },
  casemix: { label: ROLE_LABEL.casemix, group: "petugas", badge: "bg-info-soft text-info", dot: "bg-info", hint: "Petugas rumah sakit." },
  verifikator: { label: ROLE_LABEL.verifikator, group: "petugas", badge: "bg-warn-soft text-warn", dot: "bg-accent", hint: "Petugas BPJS yang memeriksa klaim." },
  auditor: { label: ROLE_LABEL.auditor, group: "petugas", badge: "bg-danger-soft text-danger", dot: "bg-danger", hint: "Petugas audit lanjutan." },
  dokter: { label: ROLE_LABEL.dokter, group: "petugas", badge: "bg-ok-soft text-ok", dot: "bg-ok", hint: "Memberi catatan medis." },
};

export function actorMeta(actor: string): ActorMeta {
  return ACTOR_META[actor] ?? { label: actor, group: "sistem", badge: "bg-line text-ink-soft", dot: "bg-muted", hint: "" };
}

export interface Part {
  t: string;
  /** Cetak tebal untuk nama/angka penting. */
  b?: boolean;
}

export interface AuditObject {
  /** Jenis objek dalam kata awam: "Kasus", "Layanan", "Impor". */
  kind: string;
  label: string;
  sub?: string;
  href?: string;
}

export interface AuditView {
  id: number;
  ts: string;
  actor: string;
  meta: ActorMeta;
  parts: Part[];
  /** Teks kalimat tanpa format (untuk atribut/teks cetak). */
  text: string;
  /** Catatan tambahan (alasan keputusan, catatan penugasan). */
  quote?: string;
  object: AuditObject | null;
  hash: string;
  prevHash: string;
}

const b = (t: string): Part => ({ t, b: true });
const p = (t: string): Part => ({ t });

type Json = Record<string, unknown>;
function parse(detail: string): Json {
  try {
    const v = JSON.parse(detail);
    return v && typeof v === "object" ? (v as Json) : {};
  } catch {
    return {};
  }
}
const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" ? v : Number(v));

interface CaseInfo {
  id: string;
  claim_no: string;
  participant_name: string;
  modus: Modus;
  hospital: string;
}
interface ServiceInfo {
  code: string;
  name: string;
  hospital: string;
  participant_name: string;
}

/** Ubah sekumpulan baris audit menjadi tampilan yang bisa dibaca. */
export function describeAudit(db: Database.Database, rows: AuditRow[]): AuditView[] {
  const caseQ = db.prepare(
    `SELECT cs.id, c.claim_no, p.name AS participant_name, f.modus, c.hospital
     FROM cases cs JOIN findings f ON f.id = cs.finding_id JOIN claims c ON c.id = f.claim_id
     JOIN episodes e ON e.id = c.episode_id JOIN participants p ON p.id = e.participant_id WHERE cs.id = ?`,
  );
  const caseByFindingQ = db.prepare("SELECT id FROM cases WHERE finding_id = ?");
  const svcQ = db.prepare(
    `SELECT s.code, s.name, e.hospital, p.name AS participant_name
     FROM services s JOIN episodes e ON e.id = s.episode_id JOIN participants p ON p.id = e.participant_id WHERE s.id = ?`,
  );
  const caseCache = new Map<string, CaseInfo | undefined>();
  const getCase = (id: string) => {
    if (!caseCache.has(id)) caseCache.set(id, caseQ.get(id) as CaseInfo | undefined);
    return caseCache.get(id);
  };

  return rows.map((r) => {
    const d = parse(r.detail);
    const meta = actorMeta(r.actor);
    const who = meta.label;
    let parts: Part[];
    let quote: string | undefined;
    let object: AuditObject | null = null;

    const caseObj = (id: string): AuditObject => {
      const c = getCase(id);
      return { kind: "Kasus", label: id, sub: c ? `${c.participant_name} · klaim ${c.claim_no}` : undefined, href: `/console/cases/${id}` };
    };

    if (r.entity === "case") {
      object = caseObj(r.entity_id);
    } else if (r.entity === "finding") {
      const cid = (caseByFindingQ.get(r.entity_id) as { id: string } | undefined)?.id;
      if (cid) object = caseObj(cid);
    }
    const caseId = object?.kind === "Kasus" ? object.label : r.entity_id;
    const c = getCase(caseId);
    const forWhom = c ? [p(" milik "), b(c.participant_name)] : [];

    switch (r.action) {
      case "kasus_dibuka": {
        const modus = c?.modus ?? (str(d.modus) as Modus);
        parts = [
          p("SEHATI membuka kasus "), b(caseId),
          ...(c ? [p(" untuk klaim "), b(c.claim_no), ...forWhom] : []),
          p(`: ada indikasi ${MODUS_LABEL[modus]?.split(" (")[0].toLowerCase() ?? "kejanggalan"}`),
          ...(Number.isFinite(num(d.score)) ? [p(" dengan skor "), b(String(num(d.score)))] : []),
          p("."),
        ];
        break;
      }
      case "skor_diperbarui":
        parts = [p("Skor kasus "), b(caseId), p(" berubah dari "), b(String(d.dari ?? "?")), p(" menjadi "), b(String(d.menjadi ?? "?")), p(" karena ada data baru.")];
        break;
      case "keputusan_otomatis": {
        const dec = str(d.decision) as keyof typeof DECISION_LABEL;
        const label = DECISION_LABEL[dec] ?? str(d.decision);
        const corr = num(d.correction);
        const k = num(d.keyakinan);
        const kPct = Number.isFinite(k) && k > 0 ? Math.round(k <= 1 ? k * 100 : k) : null;
        parts = [
          b(who), p(" memutuskan kasus "), b(caseId), ...forWhom, p(": "), b(label),
          ...(corr > 0 ? [p(", nilai dikoreksi "), b(rupiah(corr))] : []),
          ...(kPct !== null ? [p(`, tingkat keyakinan ${kPct}%`)] : []),
          p(d.perluTinjau ? ". Ditandai perlu ditinjau petugas." : "."),
        ];
        quote = str(d.reason) || undefined;
        break;
      }
      case "konfirmasi_peserta_diminta":
        parts = [b(who), p(" meminta peserta menjawab dulu sebelum kasus "), b(caseId), ...forWhom, p(" diputuskan.")];
        break;
      case "keputusan_otomatis_dikonfirmasi":
        parts = [b(who), p(" membenarkan keputusan otomatis pada kasus "), b(caseId), ...forWhom, p(". Keputusan berlaku.")];
        quote = str(d.reason) || undefined;
        break;
      case "keputusan_otomatis_diubah":
        parts = [b(who), p(" mengubah keputusan otomatis pada kasus "), b(caseId), ...forWhom, p(str(d.decision) ? ` menjadi ${DECISION_LABEL[str(d.decision) as keyof typeof DECISION_LABEL] ?? str(d.decision)}.` : ".")];
        quote = str(d.reason) || undefined;
        break;
      case "keputusan_otomatis_dibatalkan":
        parts = [b(who), p(" membatalkan keputusan otomatis pada kasus "), b(caseId), ...forWhom, p(". Kasus kembali ke antrean petugas.")];
        quote = str(d.reason) || undefined;
        break;
      case "mode_keputusan_diubah":
        parts = [b(who), p(" mengubah mode keputusan otomatis menjadi "), b(str(d.mode) || "(tidak diketahui)"), p(".")];
        object = { kind: "Pengaturan", label: "Keputusan otomatis" };
        break;
      case "kasus_ditutup_otomatis":
        parts = [p("Kasus "), b(caseId), p(" ditutup otomatis: setelah data diperbarui, kejanggalannya tidak lagi terdeteksi.")];
        break;
      case "klarifikasi_diminta":
        parts = [b(who), p(" meminta rumah sakit melengkapi bukti untuk kasus "), b(caseId), ...forWhom, p(".")];
        break;
      case "keputusan": {
        const dec = str(d.decision) as keyof typeof DECISION_LABEL;
        const label = DECISION_LABEL[dec] ?? str(d.decision);
        const corr = num(d.correction);
        parts = [b(who), p(" memutuskan kasus "), b(caseId), ...forWhom, p(": "), b(label), ...(corr > 0 ? [p(", nilai dikoreksi "), b(rupiah(corr))] : []), p(".")];
        quote = str(d.reason) || undefined;
        break;
      }
      case "kasus_ditugaskan": {
        const to = ROLE_LABEL[str(d.kepada) as Role] ?? str(d.kepada);
        parts = [b(who), p(" menugaskan kasus "), b(caseId), p(" kepada "), b(to), p(".")];
        quote = str(d.catatan) || undefined;
        break;
      }
      case "pesan_klarifikasi":
        parts = [b(who), p(" mengirim pesan klarifikasi pada kasus "), b(caseId), ...forWhom, p(".")];
        break;
      case "konfirmasi_layanan": {
        const s = svcQ.get(r.entity_id) as ServiceInfo | undefined;
        const answer = ANSWER_LABEL[str(d.answer) as Answer] ?? str(d.answer);
        const svc = s ? cap(phraseFor(s.code, s.name).title) : "layanan";
        parts = [
          p("Peserta "), b(s?.participant_name ?? "(tidak dikenal)"), p(" menjawab “"), b(answer), p("” untuk "), b(svc),
          ...(s ? [p(" di "), p(s.hospital.replace(/\s*\(simulasi\)\s*$/i, ""))] : []),
          p(d.adaCatatan ? ", disertai cerita singkat." : "."),
        ];
        object = { kind: "Layanan", label: svc, sub: s ? `${s.participant_name} · ${s.hospital.replace(/\s*\(simulasi\)\s*$/i, "")}` : undefined };
        break;
      }
      case "impor_csv":
        parts = [
          p("Berkas CSV diimpor: "), b(`${d.episode ?? 0} episode`), p(", "), b(`${d.klaim ?? 0} klaim`), p(", "), b(`${d.layanan ?? 0} layanan`), p(". Sistem langsung memeriksanya."),
        ];
        object = { kind: "Impor", label: "Impor data CSV" };
        break;
      default:
        parts = [b(who), p(` melakukan: ${r.action.replaceAll("_", " ")}.`)];
    }

    return {
      id: r.id,
      ts: r.ts,
      actor: r.actor,
      meta,
      parts,
      text: parts.map((x) => x.t).join(""),
      quote,
      object,
      hash: r.hash,
      prevHash: r.prev_hash,
    };
  });
}

/** Judul kelompok hari, mis. "Senin, 5 Oktober 2026". */
export function dayHeading(iso: string) {
  return new Date(ts(iso)).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/** Jam saja, mis. "13.33". */
export function clock(iso: string) {
  return new Date(ts(iso)).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

/** Hash ringkas untuk tampilan: 8 karakter pertama. */
export const shortHash = (h: string, n = 8) => h.slice(0, n);

export interface LookalikeStat {
  modus: Modus;
  total: number;
  /** Kasus sah mirip yang mendapat peringatan sedang/tinggi (dituduh terlalu kuat). */
  strong: number;
  /** Kasus sah mirip yang mendapat peringatan apa pun, termasuk lemah. */
  any: number;
}

/** Berapa kasus sah (yang sengaja dibuat mirip modus bermasalah) dituduh dengan peringatan kuat. READ-ONLY. */
export function getLookalikeStats(db: Database.Database): LookalikeStat[] {
  const rows = db
    .prepare(
      `SELECT g.mimics AS modus, g.claim_id,
              MAX(CASE WHEN f.id IS NOT NULL THEN 1 ELSE 0 END) AS flagged,
              MAX(CASE WHEN f.severity IN ('medium','high') THEN 1 ELSE 0 END) AS strong
       FROM ground_truth g LEFT JOIN findings f ON f.claim_id = g.claim_id
       WHERE g.label = 'legit_lookalike' GROUP BY g.claim_id`,
    )
    .all() as { modus: Modus; flagged: number; strong: number }[];
  return (["repeat_billing", "fragmentation", "phantom"] as Modus[]).map((m) => {
    const r = rows.filter((x) => x.modus === m);
    return { modus: m, total: r.length, strong: r.filter((x) => x.strong).length, any: r.filter((x) => x.flagged).length };
  });
}
