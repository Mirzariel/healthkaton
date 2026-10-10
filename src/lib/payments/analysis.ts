import type Database from "better-sqlite3";
import { getAdapters } from "../adapters";
import type { DataSource, PaymentEventRecord } from "../adapters";
import { nowIso } from "../clock";
import { addDays, dayDiff } from "../dates";
import { json } from "../db";

/* Dasbor pembayaran dua arah: sisi faskes (klaim pending/lengkap) dan sisi pembayar (ketepatan bayar).
   Aturan kejujuran (spec 6.7):
   - Keterlambatan hanya dinilai bila ada tanggal berkas dinyatakan lengkap/diterima (dari sumber) DAN tenggat dari kebijakan.
   - Tenggat resmi BELUM ditetapkan: kebijakan 'payment' berstatus DRAFT/DEMO. Setiap angka keterlambatan berlabel "menurut parameter demo".
   - Tidak pernah menyimpulkan "BPJS terlambat" hanya dari tanggal pengajuan.
   - Penundaan yang tumpang tindih dengan status pending/dikembalikan dicatat terpisah (bukan keterlambatan pembayar).
   - Klaim tanpa satu pun peristiwa dari sumber berstatus "sumber tidak tersedia". */

export type PayClass =
  | "on_time"
  | "late_no_pending"
  | "delayed_by_pending"
  | "overdue_unpaid"
  | "not_yet_due"
  | "pending_open"
  | "insufficient"
  | "source_unavailable";

export const PAY_CLASS_LABEL: Record<PayClass, { label: string; tone: "ok" | "warn" | "danger" | "muted" | "info"; hint: string }> = {
  on_time: { label: "Dibayar sebelum tenggat", tone: "ok", hint: "Tanggal bayar tidak melewati tenggat menurut parameter demo." },
  late_no_pending: { label: "Dibayar melewati tenggat", tone: "danger", hint: "Melewati tenggat parameter demo tanpa catatan pending di antaranya. Dapat diatribusikan ke sisi pembayaran, belum menyatakan penyebab." },
  delayed_by_pending: { label: "Tertunda karena pending", tone: "warn", hint: "Ada status pending/dikembalikan pada klaim ini. Penundaan tidak dihitung sebagai keterlambatan pembayar." },
  overdue_unpaid: { label: "Lewat tenggat, belum dibayar", tone: "danger", hint: "Berkas dinyatakan lengkap, tenggat parameter demo sudah lewat, belum ada tanggal bayar." },
  not_yet_due: { label: "Belum jatuh tempo", tone: "info", hint: "Belum dibayar tetapi tenggat belum tiba." },
  pending_open: { label: "Pending / dikembalikan", tone: "warn", hint: "Sedang dalam pemilahan pending; lihat halaman pemilahan." },
  insufficient: { label: "Data belum cukup", tone: "muted", hint: "Tanggal berkas lengkap tidak tersedia, sehingga ketepatan bayar tidak dapat dinilai." },
  source_unavailable: { label: "Sumber tidak tersedia", tone: "muted", hint: "Tidak ada satu pun peristiwa status bayar dari sumber untuk klaim ini." },
};

export interface PaymentParams { label: string; due_days_after_complete: number; complete_after_submit_days: number }
export interface PaymentPolicy { id: string; version: string; status: "draft" | "validated"; params: PaymentParams; note: string | null }

export function getPaymentPolicy(db: Database.Database): PaymentPolicy | null {
  const r = db.prepare("SELECT id, version, status, params_json, note FROM policy_versions WHERE domain = 'payment' ORDER BY created_at DESC, rowid DESC LIMIT 1").get() as { id: string; version: string; status: "draft" | "validated"; params_json: string; note: string | null } | undefined;
  if (!r) return null;
  return { id: r.id, version: r.version, status: r.status, note: r.note, params: json<PaymentParams>(r.params_json, { label: "", due_days_after_complete: 15, complete_after_submit_days: 2 }) };
}

export interface ClaimPayment {
  claim_id: string; claim_no: string; facility_id: string; facility_name: string; amount: number | null; claim_status: string;
  submitted_at: string | null; complete_at: string | null; due_at: string | null; due_basis: "sumber" | "kebijakan" | null; paid_at: string | null;
  pending_at: string | null; pending_reason: string | null; days_to_pay: number | null; days_overdue: number | null;
  klass: PayClass; sources: DataSource[]; source: DataSource; events: PaymentEventRecord[];
}

const rank: Record<DataSource, number> = { live: 3, import: 2, simulated: 1, unavailable: 0 };

export function classifyClaim(
  c: { claim_status: string; submitted_at: string | null },
  events: PaymentEventRecord[],
  policy: PaymentPolicy | null,
  now: string,
): Pick<ClaimPayment, "complete_at" | "due_at" | "due_basis" | "paid_at" | "pending_at" | "pending_reason" | "days_to_pay" | "days_overdue" | "klass" | "sources" | "source"> {
  const first = (t: PaymentEventRecord["type"]) => events.find((e) => e.type === t);
  const last = (t: PaymentEventRecord["type"]) => [...events].reverse().find((e) => e.type === t);
  const complete = first("complete");
  const paid = last("paid");
  const pend = last("pending") ?? last("returned");
  const dueEv = last("due");
  const sources = [...new Set(events.map((e) => e.source))];
  const source: DataSource = sources.length ? sources.reduce((a, b) => (rank[b] > rank[a] ? b : a)) : "unavailable";
  let due_at: string | null = null;
  let due_basis: "sumber" | "kebijakan" | null = null;
  if (dueEv) { due_at = dueEv.at; due_basis = "sumber"; }
  else if (complete && policy) { due_at = addDays(complete.at, policy.params.due_days_after_complete); due_basis = "kebijakan"; }
  const base = {
    complete_at: complete?.at ?? null, due_at, due_basis, paid_at: paid?.at ?? null, pending_at: pend?.at ?? null, pending_reason: pend?.reason ?? null,
    days_to_pay: paid && complete ? dayDiff(complete.at, paid.at) : null, days_overdue: null as number | null, sources, source,
  };
  if (!events.length) return { ...base, klass: "source_unavailable" };
  if (c.claim_status === "pending" || c.claim_status === "returned") return { ...base, klass: "pending_open" };
  const hadPending = events.some((e) => e.type === "pending" || e.type === "returned");
  if (paid) {
    if (!due_at) return { ...base, klass: "insufficient" };
    const late = dayDiff(due_at, paid.at);
    if (late <= 0) return { ...base, klass: "on_time", days_overdue: late };
    return { ...base, klass: hadPending ? "delayed_by_pending" : "late_no_pending", days_overdue: late };
  }
  if (c.claim_status === "paid" || !c.submitted_at) return { ...base, klass: "insufficient" }; // status 'paid' tanpa tanggal bayar dari sumber
  if (!due_at) return { ...base, klass: "insufficient" };
  const over = dayDiff(due_at, now);
  return over > 0 ? { ...base, klass: "overdue_unpaid", days_overdue: over } : { ...base, klass: "not_yet_due", days_overdue: over };
}

export interface PaymentFilter { facilityId?: string; klass?: PayClass; source?: DataSource; period?: string; q?: string }

export function listClaimPayments(db: Database.Database, filter: PaymentFilter = {}, now: string = nowIso()): ClaimPayment[] {
  const adapters = getAdapters(db);
  const policy = getPaymentPolicy(db);
  const claims = adapters.claimFeed.listClaims({ facilityId: filter.facilityId }).data.filter((c) => c.status !== "draft" && c.submitted_at);
  const names = new Map((db.prepare("SELECT id, name FROM facilities").all() as { id: string; name: string }[]).map((f) => [f.id, f.name]));
  const all = db.prepare("SELECT claim_id, type, at, amount, reason, source FROM payment_events ORDER BY at, id").all() as PaymentEventRecord[];
  const byClaim = new Map<string, PaymentEventRecord[]>();
  for (const e of all) {
    const a = byClaim.get(e.claim_id);
    if (a) a.push(e);
    else byClaim.set(e.claim_id, [e]);
  }
  const out: ClaimPayment[] = [];
  for (const c of claims) {
    if (filter.period && !c.submitted_at!.startsWith(filter.period)) continue;
    if (filter.q && !c.claim_no.toLowerCase().includes(filter.q.toLowerCase())) continue;
    const events = byClaim.get(c.id) ?? [];
    const cl = classifyClaim({ claim_status: c.status, submitted_at: c.submitted_at }, events, policy, now);
    if (filter.klass && cl.klass !== filter.klass) continue;
    if (filter.source && cl.source !== filter.source) continue;
    out.push({ claim_id: c.id, claim_no: c.claim_no, facility_id: c.facility_id, facility_name: names.get(c.facility_id) ?? c.facility_id, amount: c.amount, claim_status: c.status, submitted_at: c.submitted_at, events, ...cl });
  }
  return out;
}

export interface FacilityPaymentSummary {
  facility_id: string; facility_name: string; kind: string; submitted: number; paid: number;
  byClass: Record<PayClass, number>;
  judged: number; on_time_share: number | null; late_share: number | null; pending_share: number | null;
  median_days_to_pay: number | null; insufficient_share: number | null; amount_overdue: number; source: DataSource | "mixed"; min_judged: number; enough: boolean;
}

const MIN_JUDGED = 10;

export function summarizeByFacility(db: Database.Database, rows: ClaimPayment[]): FacilityPaymentSummary[] {
  const facs = db.prepare("SELECT id, name, kind FROM facilities ORDER BY id").all() as { id: string; name: string; kind: string }[];
  return facs.map((f) => {
    const mine = rows.filter((r) => r.facility_id === f.id);
    const byClass = Object.fromEntries(Object.keys(PAY_CLASS_LABEL).map((k) => [k, 0])) as Record<PayClass, number>;
    for (const r of mine) byClass[r.klass]++;
    // dinilai = klaim yang ketepatannya dapat ditentukan (punya tenggat dan bukan pending/tidak tersedia)
    const judged = byClass.on_time + byClass.late_no_pending + byClass.delayed_by_pending + byClass.overdue_unpaid;
    const enough = judged >= MIN_JUDGED;
    const days = mine.filter((r) => r.days_to_pay !== null).map((r) => r.days_to_pay!).sort((a, b) => a - b);
    const srcs = new Set(mine.map((r) => r.source));
    return {
      facility_id: f.id, facility_name: f.name, kind: f.kind, submitted: mine.length, paid: mine.filter((r) => r.paid_at).length, byClass, judged,
      on_time_share: enough ? byClass.on_time / judged : null,
      late_share: enough ? (byClass.late_no_pending + byClass.overdue_unpaid) / judged : null,
      pending_share: mine.length >= 20 ? byClass.pending_open / mine.length : null,
      median_days_to_pay: days.length >= MIN_JUDGED ? days[Math.floor(days.length / 2)] : null,
      insufficient_share: mine.length ? byClass.insufficient / mine.length : null,
      amount_overdue: mine.filter((r) => r.klass === "overdue_unpaid").reduce((a, r) => a + (r.amount ?? 0), 0),
      source: srcs.size === 0 ? "unavailable" : srcs.size === 1 ? [...srcs][0] : "mixed",
      min_judged: MIN_JUDGED, enough,
    };
  });
}

export function monthsPresent(rows: ClaimPayment[]) {
  return [...new Set(rows.map((r) => r.submitted_at!.slice(0, 7)))].sort();
}

/** Ringkasan satu faskes untuk kolom "cermin dua arah" pada kartu. */
export function mirrorFor(db: Database.Database, facilityId: string, now: string = nowIso()) {
  const rows = listClaimPayments(db, { facilityId }, now);
  const s = summarizeByFacility(db, rows).find((x) => x.facility_id === facilityId)!;
  return s;
}
