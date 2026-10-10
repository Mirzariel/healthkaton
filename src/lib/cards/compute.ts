import type Database from "better-sqlite3";
import { appendAudit } from "../audit";
import { assertCan, type Principal } from "../auth/principal";
import { SYSTEM_ACTOR, type Actor } from "../cases/core";
import { nowIso, nowPrecise } from "../clock";
import { json, nextId } from "../db";
import { DomainError } from "../idem";
import { listDisputes, type DisputeRow } from "../pending/dispute";

/* Kartu pembinaan faskes (kuning/merah). Bahasa: kebutuhan pembinaan/review, bukan vonis, bukan peringkat publik, bukan sanksi otomatis.
   Pending tinggi atau kartu merah TIDAK menyatakan fraud. Semua ambang berasal dari policy_versions (domain 'card') dan berstatus DRAFT
   sampai divalidasi pemilik proses. Data tidak cukup => 'insufficient_data', tidak pernah 'none' (hijau).

   Perhitungan per metrik, per faskes, per periode:
     nilai       = pembilang / penyebut (verified_per_100 dikali 100)
     tersedia    = penyebut/respons >= minimum (min_claims, min_responses, min_clarifications)
     pembanding  = max(median nilai sejawat yang tersedia, lantai metrik)          // lantai mencegah rasio meledak saat median 0
     rasio       = nilai / pembanding
     meningkat   = nilai >= lantai DAN rasio >= yellow_ratio (dan bertahan min. `consecutive` periode bila diset)
     tinggi      = nilai >= lantai DAN rasio >= red_ratio
   Level: insufficient_data bila metrik utama (pending_rate) tidak tersedia atau sejawat < min_peers; red bila jumlah metrik 'tinggi' >= min_metrics_for_red;
          yellow bila ada metrik 'meningkat'; selain itu none. */

export type MetricKey = "pending_rate" | "verified_per_100" | "gap_rate" | "lapsed_share";
export const METRIC_KEYS: MetricKey[] = ["pending_rate", "verified_per_100", "gap_rate", "lapsed_share"];
export type CardLevel = "insufficient_data" | "none" | "yellow" | "red";

export const METRIC_INFO: Record<MetricKey, { label: string; unit: "%" | "per100"; numerator: string; denominator: string; source: string }> = {
  pending_rate: { label: "Tingkat klaim pending", unit: "%", numerator: "klaim pending/dikembalikan", denominator: "klaim diajukan pada periode", source: "klaim dan status bayar (simulasi/impor)" },
  verified_per_100: { label: "Temuan terbukti per 100 klaim", unit: "per100", numerator: "temuan berstatus terbukti (disetujui reviewer)", denominator: "klaim diajukan pada periode", source: "ruang kasus" },
  gap_rate: { label: "Gap laporan peserta", unit: "%", numerator: "jawaban negatif pada butir keberadaan layanan", denominator: "jawaban ya/tidak yang valid (tidak ingat dan tidak paham dikeluarkan)", source: "survei peserta" },
  lapsed_share: { label: "Klarifikasi lewat tenggat", unit: "%", numerator: "klarifikasi lewat tenggat tanpa jawaban", denominator: "klarifikasi yang dikirim pada periode", source: "ruang kasus" },
};

export interface CardParams {
  label: string;
  min_claims: number;
  min_responses: number;
  min_peers: number;
  yellow_ratio: number;
  red_ratio: number;
  min_metrics_for_red: number;
  floor: Record<MetricKey, number>;
  /** 'quarter' (bawaan) atau 'month'. */
  period?: "quarter" | "month";
  /** Metrik harus meningkat pada sekian periode berturut-turut agar dihitung (bawaan 1). */
  consecutive?: number;
  min_clarifications?: number;
}

export const DEFAULT_CARD_PARAMS: Required<Omit<CardParams, "label">> & { label: string } = {
  label: "PARAMETER DEMO. Bukan ketentuan BPJS Kesehatan. Wajib divalidasi sebelum dipakai di luar demo.",
  min_claims: 20, min_responses: 15, min_peers: 2, yellow_ratio: 1.5, red_ratio: 2.5, min_metrics_for_red: 2,
  floor: { pending_rate: 0.05, verified_per_100: 1, gap_rate: 0.1, lapsed_share: 0.1 },
  period: "quarter", consecutive: 1, min_clarifications: 5,
};

export function parseParams(raw: string | null | undefined): Required<CardParams> {
  const v = json<Partial<CardParams>>(raw, {});
  return { ...DEFAULT_CARD_PARAMS, ...v, floor: { ...DEFAULT_CARD_PARAMS.floor, ...(v.floor ?? {}) } } as Required<CardParams>;
}

export function validateParams(p: unknown): Required<CardParams> {
  const o = (p ?? {}) as Record<string, unknown>;
  const n = (k: string, min: number, max: number) => {
    const v = Number(o[k]);
    if (!Number.isFinite(v) || v < min || v > max) throw new DomainError(`Parameter ${k} harus berupa angka antara ${min} dan ${max}.`, 422);
    return v;
  };
  const fl = (o.floor ?? {}) as Record<string, unknown>;
  const floor = {} as Record<MetricKey, number>;
  for (const k of METRIC_KEYS) {
    const v = Number(fl[k]);
    if (!Number.isFinite(v) || v < 0 || v > (k === "verified_per_100" ? 100 : 1)) throw new DomainError(`Lantai ${k} tidak valid.`, 422);
    floor[k] = v;
  }
  const out: Required<CardParams> = {
    label: DEFAULT_CARD_PARAMS.label,
    min_claims: Math.round(n("min_claims", 1, 10000)), min_responses: Math.round(n("min_responses", 1, 10000)), min_peers: Math.round(n("min_peers", 1, 50)),
    yellow_ratio: n("yellow_ratio", 1, 20), red_ratio: n("red_ratio", 1, 50), min_metrics_for_red: Math.round(n("min_metrics_for_red", 1, 4)),
    floor, period: o.period === "month" ? "month" : "quarter", consecutive: Math.round(n("consecutive", 1, 6)), min_clarifications: Math.round(n("min_clarifications", 1, 1000)),
  };
  if (out.red_ratio < out.yellow_ratio) throw new DomainError("Rasio merah tidak boleh lebih kecil dari rasio kuning.", 422);
  return out;
}

/* ---------- Periode ---------- */
export function periodOf(date: string, kind: "quarter" | "month"): string {
  const y = date.slice(0, 4);
  const m = Number(date.slice(5, 7));
  return kind === "month" ? `${y}-${String(m).padStart(2, "0")}` : `${y}-K${Math.floor((m - 1) / 3) + 1}`;
}
export function periodLabel(period: string): string {
  const q = /^(\d{4})-K([1-4])$/.exec(period);
  if (q) return `Kuartal ${q[2]} ${q[1]} (${["Jan–Mar", "Apr–Jun", "Jul–Sep", "Okt–Des"][Number(q[2]) - 1]})`;
  return period;
}
export function periodsBetween(first: string, last: string, kind: "quarter" | "month"): string[] {
  const out: string[] = [];
  let y = Number(first.slice(0, 4));
  let m = Number(first.slice(5, 7));
  const end = periodOf(last, kind);
  for (let guard = 0; guard < 120; guard++) {
    const key = periodOf(`${y}-${String(m).padStart(2, "0")}-01`, kind);
    if (!out.includes(key)) out.push(key);
    if (key >= end) break;
    m += kind === "month" ? 1 : 3;
    while (m > 12) { m -= 12; y++; }
  }
  return out;
}

/* ---------- Inti perhitungan (murni, tanpa basis data) ---------- */
export interface RawMetric { num: number; den: number; responses?: number }
export interface FacilityPeriodInput {
  facilityId: string;
  peerGroup: string | null;
  kind: "fkrtl" | "fktp";
  metrics: Record<MetricKey, RawMetric>;
  sample?: { claim_no: string; reason_code: string; status: string }[];
}

export type MetricState = "unavailable" | "no_peers" | "normal" | "elevated" | "high";
export interface MetricBasis {
  key: MetricKey;
  num: number;
  den: number;
  value: number | null;
  state: MetricState;
  available: boolean;
  min_required: number;
  peer_median: number | null;
  peer_count: number;
  comparator: number | null;
  ratio: number | null;
  floor: number;
  raw_elevated: boolean;
  note: string;
}
export interface CardBasis {
  metrics: MetricBasis[];
  reasons: string[];
  insufficient_reason: string | null;
  params: { yellow_ratio: number; red_ratio: number; min_metrics_for_red: number; min_peers: number; min_claims: number; min_responses: number; consecutive: number; period: string };
  peer_group: string | null;
  peers: string[];
  sample: { claim_no: string; reason_code: string; status: string }[];
  partial: boolean;
  limits: string;
  history_note: string | null;
}
export interface CardResult { facilityId: string; period: string; level: CardLevel; basis: CardBasis }

export const CARD_LIMITS =
  "Kartu adalah alat visibilitas untuk pembinaan atau review terjadwal. Bukan vonis, bukan peringkat publik, bukan sanksi, dan bukan pernyataan fraud. Pembandingnya hanya faskes sejawat pada periode yang sama dengan parameter DEMO berstatus draft.";

const median = (xs: number[]) => {
  const a = [...xs].sort((x, y) => x - y);
  const n = a.length;
  return n === 0 ? null : n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
};

function metricAvailable(key: MetricKey, m: RawMetric, params: Required<CardParams>) {
  if (key === "gap_rate") return (m.responses ?? 0) >= params.min_responses && m.den > 0;
  if (key === "lapsed_share") return m.den >= params.min_clarifications;
  return m.den >= params.min_claims;
}
const minRequired = (key: MetricKey, params: Required<CardParams>) => (key === "gap_rate" ? params.min_responses : key === "lapsed_share" ? params.min_clarifications : params.min_claims);
const valueOf = (key: MetricKey, m: RawMetric) => (m.den > 0 ? (key === "verified_per_100" ? (m.num / m.den) * 100 : m.num / m.den) : null);

const pct = (v: number) => (v * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + "%";
const fmtVal = (key: MetricKey, v: number) => (METRIC_INFO[key].unit === "%" ? pct(v) : v.toLocaleString("id-ID", { maximumFractionDigits: 2 }) + " per 100");

/** Hitung kartu seluruh faskes untuk satu periode. `previous` = hasil periode-periode sebelumnya (urut naik) untuk aturan berturut-turut. */
export function evaluatePeriod(period: string, rows: FacilityPeriodInput[], params: Required<CardParams>, previous: Map<string, MetricBasis[]>[] = [], partial = false): CardResult[] {
  const avail = new Map<string, Record<MetricKey, boolean>>();
  for (const r of rows) {
    const a = {} as Record<MetricKey, boolean>;
    for (const k of METRIC_KEYS) a[k] = metricAvailable(k, r.metrics[k], params);
    avail.set(r.facilityId, a);
  }
  return rows.map((r) => {
    const peers = rows.filter((o) => o.facilityId !== r.facilityId && o.peerGroup && o.peerGroup === r.peerGroup && o.kind === r.kind);
    const basisMetrics: MetricBasis[] = METRIC_KEYS.map((k) => {
      const m = r.metrics[k];
      const available = avail.get(r.facilityId)![k];
      const value = valueOf(k, m);
      const floor = params.floor[k];
      const peerVals = peers.filter((o) => avail.get(o.facilityId)![k]).map((o) => valueOf(k, o.metrics[k])!).filter((v) => v !== null);
      const base: MetricBasis = {
        key: k, num: m.num, den: m.den, value: available ? value : value, state: "unavailable", available, min_required: minRequired(k, params),
        peer_median: null, peer_count: peerVals.length, comparator: null, ratio: null, floor, raw_elevated: false, note: "",
      };
      if (!available) {
        base.note = k === "gap_rate"
          ? `Belum cukup: ${m.responses ?? 0} responden (minimum ${params.min_responses}). Tidak dihitung.`
          : `Belum cukup: n = ${m.den} (minimum ${base.min_required}). Tidak dihitung.`;
        return base;
      }
      if (peerVals.length < params.min_peers) {
        base.state = "no_peers";
        base.note = `Sejawat yang datanya cukup hanya ${peerVals.length} (minimum ${params.min_peers}). Tidak dibandingkan.`;
        return base;
      }
      const med = median(peerVals)!;
      const comparator = Math.max(med, floor);
      const ratio = value! / comparator;
      base.peer_median = med;
      base.comparator = comparator;
      base.ratio = ratio;
      const over = value! >= floor;
      base.raw_elevated = over && ratio >= params.yellow_ratio;
      base.state = over && ratio >= params.red_ratio ? "high" : base.raw_elevated ? "elevated" : "normal";
      base.note = `${fmtVal(k, value!)} (${m.num}/${m.den}) dibanding pembanding sejawat ${fmtVal(k, comparator)}${med < floor ? " (lantai metrik)" : ""}: ${ratio.toLocaleString("id-ID", { maximumFractionDigits: 2 })}×.`;
      return base;
    });
    // aturan berturut-turut: metrik hanya dihitung bila juga meningkat pada (consecutive-1) periode sebelumnya
    let historyNote: string | null = null;
    if (params.consecutive > 1) {
      for (const mb of basisMetrics) {
        if (!mb.raw_elevated) continue;
        const need = params.consecutive - 1;
        const prev = previous.slice(-need);
        const ok = prev.length === need && prev.every((m) => m.get(r.facilityId)?.find((x) => x.key === mb.key)?.raw_elevated);
        if (!ok) {
          mb.state = "normal";
          mb.note += ` Belum bertahan ${params.consecutive} periode berturut-turut, sehingga belum dihitung.`;
          historyNote = `Syarat ${params.consecutive} periode berturut-turut belum terpenuhi untuk sebagian metrik.`;
        }
      }
    }
    const primary = basisMetrics.find((m) => m.key === "pending_rate")!;
    let level: CardLevel;
    let insufficient: string | null = null;
    if (r.kind === "fktp") {
      level = "insufficient_data";
      insufficient = "Fasilitas tingkat pertama dibayar kapitasi; tidak ada klaim per kejadian untuk dibandingkan.";
    } else if (primary.state === "unavailable" || primary.state === "no_peers") {
      level = "insufficient_data";
      insufficient = primary.note;
    } else {
      const highs = basisMetrics.filter((m) => m.state === "high").length;
      const ups = basisMetrics.filter((m) => m.state === "elevated" || m.state === "high").length;
      level = highs >= params.min_metrics_for_red ? "red" : ups >= 1 ? "yellow" : "none";
    }
    const reasons: string[] = [];
    if (level === "insufficient_data") reasons.push(insufficient ?? "Data belum cukup.");
    else {
      for (const m of basisMetrics) {
        if (m.state === "elevated" || m.state === "high") reasons.push(`${METRIC_INFO[m.key].label}: ${m.note}`);
      }
      if (level === "none") reasons.push("Tidak ada metrik yang melewati ambang terhadap sejawat pada periode ini.");
      if (level === "yellow") reasons.push("Level kuning: sedikitnya satu metrik melewati ambang rasio kuning. Tindak lanjut: pembinaan administrasi dan pengecekan sampel.");
      if (level === "red") reasons.push(`Level merah: ${basisMetrics.filter((m) => m.state === "high").length} metrik melewati ambang rasio merah (minimum ${params.min_metrics_for_red}). Tindak lanjut: review terjadwal bersama faskes.`);
    }
    const skipped = basisMetrics.filter((m) => !m.available && m.key !== "pending_rate");
    if (level !== "insufficient_data" && skipped.length) reasons.push(`Metrik yang tidak dihitung karena data belum cukup: ${skipped.map((m) => METRIC_INFO[m.key].label).join("; ")}.`);
    return {
      facilityId: r.facilityId, period, level,
      basis: {
        metrics: basisMetrics, reasons, insufficient_reason: insufficient,
        params: { yellow_ratio: params.yellow_ratio, red_ratio: params.red_ratio, min_metrics_for_red: params.min_metrics_for_red, min_peers: params.min_peers, min_claims: params.min_claims, min_responses: params.min_responses, consecutive: params.consecutive, period: params.period },
        peer_group: r.peerGroup, peers: peers.map((o) => o.facilityId), sample: r.sample ?? [], partial, limits: CARD_LIMITS, history_note: historyNote,
      },
    };
  });
}

/* ---------- Pemuatan data dari basis data ---------- */
function existenceSlots(db: Database.Database): Set<string> {
  const rows = db.prepare("SELECT slots_json FROM indicator_versions WHERE kind = 'existence'").all() as { slots_json: string }[];
  const set = new Set<string>(["service_performed"]);
  for (const r of rows) for (const s of json<{ id: string }[]>(r.slots_json, [])) set.add(s.id);
  return set;
}
const NEGATIVE = new Set(["no", "none", "partial"]);
const POSITIVE = new Set(["yes", "full"]);

export function loadPeriodInputs(db: Database.Database, params: Required<CardParams>, now: string = nowIso()) {
  const kind = params.period;
  const claimRows = db.prepare(
    `SELECT c.id, c.claim_no, c.facility_id, c.submitted_at, c.status,
       (SELECT e.reason FROM payment_events e WHERE e.claim_id = c.id AND e.type IN ('pending','returned') ORDER BY e.at DESC, e.id DESC LIMIT 1) AS reason,
       (SELECT COUNT(*) FROM payment_events e WHERE e.claim_id = c.id AND e.type IN ('pending','returned')) AS pend_events
     FROM claims c WHERE c.submitted_at IS NOT NULL`,
  ).all() as { id: string; claim_no: string; facility_id: string; submitted_at: string; status: string; reason: string | null; pend_events: number }[];
  const facilities = db.prepare("SELECT id, kind, peer_group FROM facilities ORDER BY id").all() as { id: string; kind: "fkrtl" | "fktp"; peer_group: string | null }[];
  const dates = claimRows.map((c) => c.submitted_at.slice(0, 10)).sort();
  if (!dates.length) return { periods: [] as string[], byPeriod: new Map<string, FacilityPeriodInput[]>(), partialPeriod: periodOf(now, kind) };
  const periods = periodsBetween(dates[0], dates[dates.length - 1], kind);
  const mk = (): Record<MetricKey, RawMetric> => ({ pending_rate: { num: 0, den: 0 }, verified_per_100: { num: 0, den: 0 }, gap_rate: { num: 0, den: 0, responses: 0 }, lapsed_share: { num: 0, den: 0 } });
  const table = new Map<string, FacilityPeriodInput>();
  const key = (f: string, p: string) => `${f}|${p}`;
  const get = (f: (typeof facilities)[number], p: string) => {
    const k = key(f.id, p);
    if (!table.has(k)) table.set(k, { facilityId: f.id, peerGroup: f.peer_group, kind: f.kind, metrics: mk(), sample: [] });
    return table.get(k)!;
  };
  const facById = new Map(facilities.map((f) => [f.id, f]));
  for (const f of facilities) for (const p of periods) get(f, p);
  for (const c of claimRows) {
    const f = facById.get(c.facility_id);
    if (!f) continue;
    const row = get(f, periodOf(c.submitted_at, kind));
    row.metrics.pending_rate.den++;
    row.metrics.verified_per_100.den++;
    if (c.status === "pending" || c.status === "returned" || c.pend_events > 0) {
      row.metrics.pending_rate.num++;
      if (row.sample!.length < 8) row.sample!.push({ claim_no: c.claim_no, reason_code: c.reason ?? "TANPA_KODE", status: c.status });
    }
  }
  const ver = db.prepare(
    "SELECT f.facility_id, r.at FROM review_decisions r JOIN findings f ON f.id = r.finding_id WHERE r.kind = 'proof_approval' AND r.decision = 'verified' AND r.state = 'recorded' AND f.proof_status = 'verified'",
  ).all() as { facility_id: string; at: string }[];
  for (const v of ver) {
    const f = facById.get(v.facility_id);
    if (f) get(f, periodOf(v.at, kind)).metrics.verified_per_100.num++;
  }
  const slots = existenceSlots(db);
  const facts = db.prepare(
    `SELECT s.facility_id, s.id AS session_id, COALESCE(s.started_at, s.last_activity_at) AS at, pf.slot, pf.value
     FROM participant_facts pf JOIN survey_sessions s ON s.id = pf.session_id
     WHERE pf.status = 'active' AND s.is_sandbox = 0`,
  ).all() as { facility_id: string; session_id: string; at: string | null; slot: string; value: string }[];
  const sessionsSeen = new Map<string, Set<string>>();
  for (const x of facts) {
    if (!x.at || !slots.has(x.slot)) continue;
    const f = facById.get(x.facility_id);
    if (!f) continue;
    const valid = NEGATIVE.has(x.value) || POSITIVE.has(x.value);
    if (!valid) continue; // tidak ingat, tidak paham, tidak berlaku: tidak masuk penyebut (aturan I3)
    const p = periodOf(x.at, kind);
    const row = get(f, p);
    row.metrics.gap_rate.den++;
    if (NEGATIVE.has(x.value)) row.metrics.gap_rate.num++;
    const k = key(f.id, p);
    if (!sessionsSeen.has(k)) sessionsSeen.set(k, new Set());
    sessionsSeen.get(k)!.add(x.session_id);
  }
  for (const [k, set] of sessionsSeen) table.get(k)!.metrics.gap_rate.responses = set.size;
  const clars = db.prepare("SELECT facility_id, status, sent_at FROM clarifications").all() as { facility_id: string; status: string; sent_at: string }[];
  for (const c of clars) {
    const f = facById.get(c.facility_id);
    if (!f) continue;
    const row = get(f, periodOf(c.sent_at, kind));
    row.metrics.lapsed_share.den++;
    if (c.status === "lapsed") row.metrics.lapsed_share.num++;
  }
  const byPeriod = new Map<string, FacilityPeriodInput[]>();
  for (const p of periods) byPeriod.set(p, facilities.map((f) => table.get(key(f.id, p))!));
  return { periods, byPeriod, partialPeriod: periodOf(now, kind) };
}

/* ---------- Kebijakan ---------- */
export interface PolicyRow { id: string; domain: string; version: string; params_json: string; status: "draft" | "validated"; note: string | null; effective_from: string | null; created_by: string | null; created_at: string | null }

export function getActiveCardPolicy(db: Database.Database): PolicyRow {
  const r = db.prepare("SELECT * FROM policy_versions WHERE domain = 'card' ORDER BY created_at DESC, rowid DESC LIMIT 1").get() as PolicyRow | undefined;
  if (!r) throw new DomainError("Belum ada kebijakan kartu.", 404);
  return r;
}
export const listCardPolicies = (db: Database.Database) => db.prepare("SELECT * FROM policy_versions WHERE domain = 'card' ORDER BY created_at DESC, rowid DESC").all() as PolicyRow[];

/** Membuat versi parameter BARU berstatus draft (versi lama tidak diubah) lalu menghitung ulang kartu. Status 'validated' tidak dapat dipasang dari aplikasi ini. */
export function saveCardPolicy(db: Database.Database, p: Principal, raw: unknown, note: string) {
  assertCan(p, "cards.configure");
  const params = validateParams(raw);
  const why = note.trim();
  if (why.length < 10) throw new DomainError("Alasan perubahan ambang wajib diisi (minimal 10 karakter).", 422);
  return db.transaction(() => {
    const n = (db.prepare("SELECT COUNT(*) c FROM policy_versions WHERE domain = 'card'").get() as { c: number }).c + 1;
    const id = `POL-CARD-${n}`;
    db.prepare("INSERT INTO policy_versions (id, domain, version, params_json, status, note, effective_from, created_by, created_at) VALUES (?,?,?,?,'draft',?,?,?,?)").run(
      id, "card", `demo-${n}`, JSON.stringify(params), `${params.label} Alasan perubahan: ${why}`, nowIso().slice(0, 10), p.id, nowPrecise(),
    );
    appendAudit(db, { actor: p.id, actor_role: p.role, action: "kebijakan_kartu_dibuat", entity: "policy_version", entity_id: id, detail: { periode: params.period, rasio_kuning: params.yellow_ratio, rasio_merah: params.red_ratio, minimum_klaim: params.min_claims, status: "draft" } });
    const res = recomputeCards(db, p);
    return { ...res, policyId: id };
  })();
}

/* ---------- Penyimpanan ---------- */
export interface CardView {
  id: number; facility_id: string; facility_name: string; peer_group: string | null; period: string; level: CardLevel;
  basis: CardBasis; policy_version_id: string; computed_at: string; disputes: DisputeRow[];
}

/** Hitung ulang SEMUA kartu untuk kebijakan aktif. Memakai UPSERT agar id kartu (acuan bantahan) tetap. Perubahan level dicatat di audit. */
export function recomputeCards(db: Database.Database, by: Actor = SYSTEM_ACTOR, now: string = nowIso()) {
  const policy = getActiveCardPolicy(db);
  const params = parseParams(policy.params_json);
  const { periods, byPeriod, partialPeriod } = loadPeriodInputs(db, params, now);
  const results: CardResult[] = [];
  const history: Map<string, MetricBasis[]>[] = [];
  for (const p of periods) {
    const res = evaluatePeriod(p, byPeriod.get(p)!, params, history, p === partialPeriod);
    results.push(...res);
    history.push(new Map(res.map((r) => [r.facilityId, r.basis.metrics])));
  }
  let changed = 0;
  let written = 0;
  db.transaction(() => {
    const at = nowPrecise();
    for (const r of results) {
      const prev = db.prepare("SELECT level FROM facility_cards WHERE facility_id = ? AND period = ? AND policy_version_id = ?").get(r.facilityId, r.period, policy.id) as { level: CardLevel } | undefined;
      db.prepare(
        `INSERT INTO facility_cards (facility_id, period, level, basis_json, peer_group, policy_version_id, computed_at) VALUES (?,?,?,?,?,?,?)
         ON CONFLICT(facility_id, period, policy_version_id) DO UPDATE SET level = excluded.level, basis_json = excluded.basis_json, peer_group = excluded.peer_group, computed_at = excluded.computed_at`,
      ).run(r.facilityId, r.period, r.level, JSON.stringify(r.basis), r.basis.peer_group, policy.id, at);
      written++;
      if (!prev || prev.level !== r.level) {
        changed++;
        appendAudit(db, { actor: by.id, actor_role: by.role, action: "kartu_dihitung", entity: "facility_card", entity_id: `${r.facilityId}|${r.period}`, detail: { dari: prev?.level ?? null, ke: r.level, kebijakan: policy.id } });
      }
    }
  })();
  return { policyId: policy.id, cards: written, changed, periods };
}

const CARD_SQL = `SELECT c.id, c.facility_id, f.name AS facility_name, c.peer_group, c.period, c.level, c.basis_json, c.policy_version_id, c.computed_at
                  FROM facility_cards c JOIN facilities f ON f.id = c.facility_id`;
type CardRaw = { id: number; facility_id: string; facility_name: string; peer_group: string | null; period: string; level: CardLevel; basis_json: string; policy_version_id: string; computed_at: string };
const view = (db: Database.Database, r: CardRaw): CardView => ({ ...r, basis: json<CardBasis>(r.basis_json, {} as CardBasis), disputes: listDisputes(db, { kind: "card", refId: String(r.id) }) });

export function listCards(db: Database.Database, opts: { policyId?: string; facilityId?: string; period?: string } = {}): CardView[] {
  const policyId = opts.policyId ?? getActiveCardPolicy(db).id;
  const where = ["c.policy_version_id = ?"];
  const args: unknown[] = [policyId];
  if (opts.facilityId) { where.push("c.facility_id = ?"); args.push(opts.facilityId); }
  if (opts.period) { where.push("c.period = ?"); args.push(opts.period); }
  return (db.prepare(`${CARD_SQL} WHERE ${where.join(" AND ")} ORDER BY c.period, c.facility_id`).all(...args) as CardRaw[]).map((r) => view(db, r));
}
export function getCard(db: Database.Database, id: number): CardView | null {
  const r = db.prepare(`${CARD_SQL} WHERE c.id = ?`).get(id) as CardRaw | undefined;
  return r ? view(db, r) : null;
}

/** Jumlah periode berturut-turut (berakhir di periode terakhir) berlevel kuning/merah. Informasi tambahan, tidak menentukan level. */
export function consecutiveFlagged(cards: CardView[]): number {
  let n = 0;
  for (const c of [...cards].sort((a, b) => b.period.localeCompare(a.period))) {
    if (c.level === "yellow" || c.level === "red") n++;
    else break;
  }
  return n;
}
