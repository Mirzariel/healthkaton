// Data dasar SIMULASI berbenih tetap. Seluruh nama, NIK, dan angka fiktif. Bukan data peserta JKN.
import type Database from "better-sqlite3";
import { sha256 } from "../audit";
import { DOCTORS, DX, HIGH_COST_BY_FAMILY, SVC, familyOfGroup, groupFor, type DxInfo, type Family } from "../catalog";
import { addDays, addHours, dayOf } from "../dates";
import { makeRng, type Rng } from "../rng";

export const SEED_NOW = "2026-10-10T09:00";

export interface FacilitySeed {
  id: string;
  code: string;
  name: string;
  kind: "fkrtl" | "fktp";
  class: string | null;
  peer_group: string;
  region: string;
}
export const FACILITIES: FacilitySeed[] = [
  { id: "FAC-RSHB", code: "RSHB", name: "RS Harapan Bunda (simulasi)", kind: "fkrtl", class: "B", peer_group: "fkrtl-kelas-b", region: "Wilayah A (simulasi)" },
  { id: "FAC-RSNM", code: "RSNM", name: "RS Nusa Medika (simulasi)", kind: "fkrtl", class: "B", peer_group: "fkrtl-kelas-b", region: "Wilayah A (simulasi)" },
  { id: "FAC-RSBS", code: "RSBS", name: "RS Bina Sejahtera (simulasi)", kind: "fkrtl", class: "B", peer_group: "fkrtl-kelas-b", region: "Wilayah B (simulasi)" },
  { id: "FAC-RSTS", code: "RSTS", name: "RSU Tirta Sehat (simulasi)", kind: "fkrtl", class: "C", peer_group: "fkrtl-kelas-c", region: "Wilayah B (simulasi)" },
  { id: "FAC-RSCM", code: "RSCM", name: "RSU Cahaya Mulia (simulasi)", kind: "fkrtl", class: "C", peer_group: "fkrtl-kelas-c", region: "Wilayah B (simulasi)" },
  { id: "FAC-PKKN", code: "PKKN", name: "Puskesmas Kenanga (simulasi)", kind: "fktp", class: null, peer_group: "fktp-umum", region: "Wilayah A (simulasi)" },
  { id: "FAC-PKML", code: "PKML", name: "Puskesmas Melati (simulasi)", kind: "fktp", class: null, peer_group: "fktp-umum", region: "Wilayah B (simulasi)" },
];
export const HOSPITAL_IDS = FACILITIES.filter((f) => f.kind === "fkrtl").map((f) => f.id);
export const facilityName = (id: string) => FACILITIES.find((f) => f.id === id)?.name ?? id;

export const DEMO_USERS = [
  { id: "U-PSR-1", name: "Sari Wulandari (peserta demo)", role: "peserta", facility_id: null, participant_id: "P-0001" },
  { id: "U-PND-1", name: "Rudi Wulandari (pendamping demo)", role: "pendamping", facility_id: null, participant_id: "P-0001" },
  { id: "U-FSK-1", name: "Wulan, casemix RS Harapan Bunda", role: "faskes", facility_id: "FAC-RSHB", participant_id: null },
  { id: "U-FSK-2", name: "Anton, casemix RS Nusa Medika", role: "faskes", facility_id: "FAC-RSNM", participant_id: null },
  { id: "U-FSK-3", name: "Maya, petugas RSU Tirta Sehat", role: "faskes", facility_id: "FAC-RSTS", participant_id: null },
  { id: "U-FSK-4", name: "Dewi, petugas Puskesmas Kenanga", role: "faskes", facility_id: "FAC-PKKN", participant_id: null },
  { id: "U-VER-1", name: "Hendra, verifikator", role: "verifikator", facility_id: null, participant_id: null },
  { id: "U-VER-2", name: "Lestari, verifikator", role: "verifikator", facility_id: null, participant_id: null },
  { id: "U-REV-1", name: "dr. Yuli, reviewer (peran demo)", role: "reviewer", facility_id: null, participant_id: null },
  { id: "U-AUD-1", name: "Bambang, auditor", role: "auditor", facility_id: null, participant_id: null },
  { id: "U-ADM-1", name: "Admin sistem SEHATI", role: "admin", facility_id: null, participant_id: null },
] as const;

const FIRST = ["Sari", "Budi", "Wati", "Joko", "Rina", "Agus", "Dewi", "Hadi", "Lestari", "Rudi", "Maya", "Eko", "Fitri", "Dedi", "Ayu", "Bayu", "Nia", "Imam", "Putri", "Yusuf", "Citra", "Andi", "Siti", "Fajar", "Mega", "Rahmat", "Tika", "Wahyu", "Indah", "Gilang"];
const LAST = ["Wulandari", "Santoso", "Pratama", "Hidayat", "Lestari", "Saputra", "Nugroho", "Kusuma", "Rahayu", "Wibowo", "Permata", "Setiawan", "Maharani", "Firmansyah", "Anggraini", "Susanto", "Utami", "Hakim", "Cahyani", "Purnomo"];

export type TruthLabel = "t2_repeat" | "t3_continuation" | "t1_missing_doc" | "legit_lookalike" | "coding" | "membership";
export interface Truth {
  claim_id: string;
  label: TruthLabel;
  mimics?: "t1" | "t2" | "t3";
}

export interface SeedRefs {
  hero: { participant_id: string; episode_a: string; episode_b: string; claim_paid: string; claim_dup: string; claim_split: string; bronko_service: string; facility_id: string };
  truth: Truth[];
}

interface Ctx {
  db: Database.Database;
  r: Rng;
  n: { p: number; e: number; s: number; v: number; c: number; i: number };
  truth: Truth[];
}
const pad = (n: number, w: number) => String(n).padStart(w, "0");
const at = (date: string, h: number, m = 0) => `${dayOf(date)}T${pad(h, 2)}:${pad(m, 2)}`;

interface PartRow { id: string; coverage_start: string; coverage_end: string | null }
interface EpRow { id: string; participant_id: string; facility_id: string; kind: "RJTL" | "RITL"; admit_at: string; discharge_at: string; dx: DxInfo; doctor: string; group_code: string }
interface SvcRow { id: string; code: string; performed_at: string; performer: string; amount: number }

function newParticipant(cx: Ctx, name?: string): PartRow & { name: string } {
  const { r, db } = cx;
  const id = `P-${pad(++cx.n.p, 4)}`;
  const y = r.int(2018, 2025);
  const nm = name ?? `${r.pick(FIRST)} ${r.pick(LAST)}`;
  const p = {
    id,
    pseudonym: "PSN-" + sha256("sehati-psn|" + id).slice(0, 6).toUpperCase(),
    name: nm,
    nik: `3174••••••${pad(r.int(0, 9999), 4)}`,
    dob: `${r.int(1950, 2014)}-${pad(r.int(1, 12), 2)}-${pad(r.int(1, 28), 2)}`,
    coverage_start: `${y}-${pad(r.int(1, 12), 2)}-01`,
    coverage_end: null as string | null,
    faskes1: r.pick(["Puskesmas Kenanga (simulasi)", "Puskesmas Melati (simulasi)"]),
  };
  db.prepare("INSERT INTO participants (id,pseudonym,name,nik,dob,coverage_start,coverage_end,faskes1) VALUES (@id,@pseudonym,@name,@nik,@dob,@coverage_start,@coverage_end,@faskes1)").run(p);
  return p;
}

interface EpOpts {
  participant: PartRow;
  dx: DxInfo;
  facility: string;
  admitDate: string;
  los?: number;
  doctor?: string;
  extra?: string[];
  noEvidenceFor?: string[];
  hour?: number;
  context?: Record<string, boolean | string | null>;
  phase?: "pre" | "intra" | "post" | "closed";
}

function newEpisode(cx: Ctx, o: EpOpts) {
  const { r, db } = cx;
  const los = o.dx.kind === "RITL" ? (o.los ?? r.int(o.dx.los[0], o.dx.los[1])) : 0;
  const doctor = o.doctor ?? r.pick(DOCTORS);
  const hour = o.hour ?? r.int(8, 17);
  const admit = at(o.admitDate, hour, r.pick([0, 15, 30, 45]));
  const discharge = o.dx.kind === "RITL" ? at(addDays(admit, los), 11, 0) : addHours(admit, 2);
  const group = groupFor(o.dx.family, r.pick([1, 2, 3] as const));
  const id = `E-${pad(++cx.n.e, 4)}`;
  const fac = FACILITIES.find((f) => f.id === o.facility)!;
  const services: SvcRow[] = [];
  const codes = [...o.dx.procs, ...(o.extra ?? [])];
  // konteks penerapan: sebagian sengaja tidak diketahui agar klarifikasi dapat diuji
  const hasLab = codes.some((c) => c.startsWith("LAB"));
  const ctx: Record<string, boolean | string | null> = o.context ?? {};
  if (!o.context) {
    if (hasLab) ctx.lab_performed = true;
    else if (r.chance(0.7)) ctx.lab_performed = false;
    const rx = r.next();
    if (rx < 0.7) ctx.prescription_expected = true;
    else if (rx < 0.9) ctx.prescription_expected = false;
    if (o.dx.kind === "RITL") {
      const dr = r.next();
      if (dr < 0.72) ctx.discharge_prescription_expected = true;
      else if (dr < 0.9) ctx.discharge_prescription_expected = false;
    }
  }
  db.prepare("INSERT INTO episodes (id,participant_id,facility_id,hospital,kind,care_type,phase,admit_at,discharge_at,dx_code,dx_text,group_code,context_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
    id, o.participant.id, o.facility, fac.name, o.dx.kind, o.dx.kind === "RITL" ? "inpatient" : "outpatient", o.phase ?? "closed", admit, discharge, o.dx.code, o.dx.text, group, JSON.stringify(ctx),
  );
  const addService = (code: string, qty: number, when: string) => {
    const info = SVC[code];
    const s: SvcRow = { id: `S-${pad(++cx.n.s, 5)}`, code, performed_at: when, performer: doctor, amount: info.price * qty };
    db.prepare("INSERT INTO services (id,episode_id,code,name,performed_at,performer,qty,amount) VALUES (?,?,?,?,?,?,?,?)").run(s.id, id, code, info.name, when, doctor, qty, s.amount);
    services.push(s);
    if (info.needsRecord && !(o.noEvidenceFor ?? []).includes(code)) addRecord(s, info.name);
    return s;
  };
  const addRecord = (s: SvcRow, name: string, over: Partial<{ recorded_at: string; performer: string; summary: string; type: string }> = {}) => {
    db.prepare("INSERT INTO evidence (id,episode_id,service_id,type,recorded_at,performer,summary) VALUES (?,?,?,?,?,?,?)").run(
      `V-${pad(++cx.n.v, 5)}`, id, s.id, over.type ?? "lembar_tindakan", over.recorded_at ?? addHours(s.performed_at, 0.25), over.performer ?? s.performer,
      over.summary ?? `Lembar tindakan ${name}, ditandatangani ${s.performer}.`,
    );
  };
  if (o.dx.kind === "RITL") addService("KMR", Math.max(los, 1), admit);
  addService("KON", 1, addHours(admit, 1));
  for (const code of codes) {
    const span = Math.max(los * 24 - 12, 1);
    const when = o.dx.kind === "RITL" ? addHours(admit, 1 + Math.floor(r.next() * span)) : addHours(admit, 0.5);
    addService(code, 1, when);
  }
  db.prepare("INSERT INTO evidence (id,episode_id,service_id,type,recorded_at,performer,summary) VALUES (?,?,?,?,?,?,?)").run(
    `V-${pad(++cx.n.v, 5)}`, id, null, "resume_medis", discharge, doctor, `Resume medis: ${o.dx.text} (${o.dx.code}), pasien dipulangkan.`,
  );
  const ep: EpRow = { id, participant_id: o.participant.id, facility_id: o.facility, kind: o.dx.kind, admit_at: admit, discharge_at: discharge, dx: o.dx, doctor, group_code: group };
  return { ep, services, addService, addRecord };
}

type ClaimStatus = "draft" | "submitted" | "paid" | "pending" | "returned";
function newClaim(cx: Ctx, ep: EpRow, o: { status: ClaimStatus; amount?: number; group?: string; submittedAt?: string; paidAt?: string; services?: SvcRow[]; claimNo?: string }) {
  const { db } = cx;
  const submitted = o.status === "draft" ? null : (o.submittedAt ?? at(addDays(ep.discharge_at, 3), 10));
  let paid: string | null = null;
  if (o.status === "paid") paid = o.paidAt ?? at(addDays(submitted!, 14), 10);
  const idn = ++cx.n.c;
  const id = `C-${pad(idn, 4)}`;
  const amount = o.amount ?? Math.round((ep.dx.baseAmount * (0.9 + cx.r.next() * 0.2)) / 1000) * 1000;
  const fac = FACILITIES.find((f) => f.id === ep.facility_id)!;
  db.prepare("INSERT INTO claims (id,claim_no,episode_id,facility_id,group_code,amount,status,submitted_at,paid_at,hospital) VALUES (?,?,?,?,?,?,?,?,?,?)").run(
    id, o.claimNo ?? `KLM-2026-${pad(1000 + idn, 6)}`, ep.id, ep.facility_id, o.group ?? ep.group_code, amount, o.status, submitted, paid, fac.name,
  );
  const items = o.services ?? (db.prepare("SELECT id, amount FROM services WHERE episode_id = ?").all(ep.id) as SvcRow[]);
  for (const s of items) db.prepare("INSERT OR IGNORE INTO claim_items (id,claim_id,service_id,amount) VALUES (?,?,?,?)").run(`CI-${pad(++cx.n.i, 6)}`, id, s.id, s.amount);
  return { id, amount, group: o.group ?? ep.group_code };
}

function pickStatus(cx: Ctx, ep: EpRow): ClaimStatus {
  const submitted = at(addDays(ep.discharge_at, 3), 10);
  const paid = addDays(submitted, 14);
  if (paid > SEED_NOW) return dayOf(ep.discharge_at) > "2026-09-20" ? (cx.r.chance(0.5) ? "draft" : "submitted") : "submitted";
  const x = cx.r.next();
  return x < 0.84 ? "paid" : x < 0.93 ? "submitted" : x < 0.985 ? "pending" : "returned";
}

const daysBetween = (a: string, b: string) => Math.round((new Date(dayOf(b)).getTime() - new Date(dayOf(a)).getTime()) / 86400000);

export function seedBase(db: Database.Database, seed = 20261010, nParticipants = 360): SeedRefs {
  const cx: Ctx = { db, r: makeRng(seed), n: { p: 0, e: 0, s: 0, v: 0, c: 0, i: 0 }, truth: [] };
  const { r } = cx;
  db.transaction(() => {
    for (const f of FACILITIES) db.prepare("INSERT INTO facilities (id,code,name,kind,class,unit_cost_band,peer_group,region,is_demo) VALUES (?,?,?,?,?,?,?,?,1)").run(f.id, f.code, f.name, f.kind, f.class, null, f.peer_group, f.region);
    for (const u of DEMO_USERS) db.prepare("INSERT INTO users (id,name,role,facility_id,participant_id) VALUES (?,?,?,?,?)").run(u.id, u.name, u.role, u.facility_id, u.participant_id);

    // ---------- Tokoh demo: Bu Sari (satu perawatan, tiga tagihan) ----------
    const sari = newParticipant(cx, "Sari Wulandari");
    db.prepare("UPDATE participants SET coverage_start='2019-01-01', dob='1968-06-14', faskes1='Puskesmas Kenanga (simulasi)' WHERE id=?").run(sari.id);
    db.prepare("INSERT INTO companions (id,participant_id,name,relation,authorized,note) VALUES ('CP-0001',?,?,?,1,?)").run(sari.id, "Rudi Wulandari", "Anak", "Diotorisasi peserta untuk menjawab survei (simulasi).");
    db.prepare("INSERT INTO companions (id,participant_id,name,relation,authorized,note) VALUES ('CP-0002',?,?,?,0,?)").run(sari.id, "Tetangga (belum diotorisasi)", "Tetangga", "Belum diotorisasi: tidak dapat menjawab (uji hak akses).");
    const pneu = DX.find((d) => d.code === "J18.9")!;
    const hosp = "FAC-RSHB";
    const A = newEpisode(cx, {
      participant: sari, dx: pneu, facility: hosp, admitDate: "2026-03-03", los: 5, hour: 10, doctor: "dr. Bagas, Sp.P", extra: ["BRONKO"], noEvidenceFor: ["BRONKO"],
      context: { lab_performed: true, prescription_expected: true, discharge_prescription_expected: true },
    });
    db.prepare("UPDATE episodes SET group_code='SIM-RESP-2' WHERE id=?").run(A.ep.id);
    A.ep.group_code = "SIM-RESP-2";
    const bronko = A.services.find((s) => s.code === "BRONKO")!;
    const heroTimes: Record<string, string> = { "LAB-DL": "2026-03-03T11:00", RONTGEN: "2026-03-03T11:30", NEBU: "2026-03-03T14:00", BRONKO: "2026-03-05T09:40" };
    for (const s of A.services) {
      if (heroTimes[s.code]) {
        s.performed_at = heroTimes[s.code];
        db.prepare("UPDATE services SET performed_at=? WHERE id=?").run(s.performed_at, s.id);
        db.prepare("UPDATE evidence SET recorded_at=? WHERE service_id=? AND type='lembar_tindakan'").run(addHours(s.performed_at, 0.25), s.id);
      }
    }
    const claimPaid = newClaim(cx, A.ep, { status: "paid", amount: 8900000, submittedAt: "2026-03-11T10:00", paidAt: "2026-03-25T10:00" });
    const claimDup = newClaim(cx, A.ep, { status: "submitted", amount: 8900000, submittedAt: "2026-04-20T10:00", claimNo: "KLM-2026-001777" });
    const B = newEpisode(cx, {
      participant: sari, dx: pneu, facility: hosp, admitDate: "2026-03-08", los: 2, hour: 15, doctor: "dr. Bagas, Sp.P", extra: [],
      context: { lab_performed: true, prescription_expected: true, discharge_prescription_expected: true },
    });
    db.prepare("UPDATE episodes SET group_code='SIM-RESP-2' WHERE id=?").run(B.ep.id);
    B.ep.group_code = "SIM-RESP-2";
    const claimSplit = newClaim(cx, B.ep, { status: "submitted", amount: 3100000, submittedAt: "2026-03-14T10:00" });
    cx.truth.push(
      { claim_id: claimPaid.id, label: "t1_missing_doc" },
      { claim_id: claimDup.id, label: "t2_repeat" },
      { claim_id: claimSplit.id, label: "t3_continuation" },
    );

    // ---------- Populasi dasar yang bersih ----------
    type Base = { ep: EpRow; claim: { id: string; amount: number; group: string }; status: ClaimStatus; services: SvcRow[] };
    const base: Base[] = [];
    const hospitals = HOSPITAL_IDS;
    for (let i = 0; i < nParticipants - 1; i++) {
      const p = newParticipant(cx);
      const n = r.pick([1, 2, 2, 3]);
      let cursor = addDays("2026-01-05T00:00", r.int(0, 60));
      for (let k = 0; k < n; k++) {
        const dx = r.pick(DX.filter((d) => (r.chance(0.55) ? d.kind === "RJTL" : d.kind === "RITL")));
        // sebagian kunjungan ringan terjadi di puskesmas (kapitasi, tanpa klaim per-kejadian)
        if (dx.kind === "RJTL" && r.chance(0.22)) {
          newEpisode(cx, { participant: p, dx, facility: r.pick(["FAC-PKKN", "FAC-PKML"]), admitDate: cursor, extra: [] });
          cursor = addDays(cursor, r.int(25, 110));
          continue;
        }
        const h = newEpisode(cx, { participant: p, dx, facility: r.pick(hospitals), admitDate: cursor });
        if (dayOf(h.ep.discharge_at) > "2026-09-28") {
          cx.n.e--;
          db.prepare("DELETE FROM evidence WHERE episode_id = ?").run(h.ep.id);
          db.prepare("DELETE FROM services WHERE episode_id = ?").run(h.ep.id);
          db.prepare("DELETE FROM episodes WHERE id = ?").run(h.ep.id);
          break;
        }
        const status = pickStatus(cx, h.ep);
        const claim = newClaim(cx, h.ep, { status });
        base.push({ ep: h.ep, claim, status, services: h.services });
        cursor = addDays(h.ep.discharge_at, r.int(25, 110));
      }
    }

    // ---------- Injeksi pola (label sintetis untuk uji mesin sinyal; BUKAN kebenaran lapangan) ----------
    const used = new Set<string>();
    const take = (pred: (b: Base) => boolean) => {
      const pool = r.shuffle(base.filter((b) => !used.has(b.ep.participant_id) && pred(b)));
      const b = pool[0];
      if (b) used.add(b.ep.participant_id);
      return b;
    };
    const paidRitl = (b: Base) => b.status === "paid" && b.ep.kind === "RITL" && b.ep.discharge_at < "2026-08-01";
    const paidAt = (claimId: string) => (db.prepare("SELECT paid_at FROM claims WHERE id=?").get(claimId) as { paid_at: string }).paid_at;

    // T2: klaim berulang (10 episode sama + 8 salinan episode)
    for (let i = 0; i < 18; i++) {
      const b = take(paidRitl);
      if (!b) break;
      const status: ClaimStatus = r.chance(0.35) ? "draft" : "submitted";
      const submittedAt = status === "draft" ? undefined : at(addDays(paidAt(b.claim.id), r.int(8, 40)), 10);
      if (i < 10) {
        const c = newClaim(cx, b.ep, { status, amount: b.claim.amount, group: b.claim.group, submittedAt });
        cx.truth.push({ claim_id: c.id, label: "t2_repeat" });
      } else {
        const part = { id: b.ep.participant_id, coverage_start: "2019-01-01", coverage_end: null } as PartRow;
        const copy = newEpisode(cx, { participant: part, dx: b.ep.dx, facility: b.ep.facility_id, admitDate: b.ep.admit_at, los: daysBetween(b.ep.admit_at, b.ep.discharge_at), hour: Number(b.ep.admit_at.slice(11, 13)), doctor: b.ep.doctor });
        db.prepare("UPDATE episodes SET admit_at=?, discharge_at=?, group_code=? WHERE id=?").run(b.ep.admit_at, b.ep.discharge_at, b.ep.group_code, copy.ep.id);
        copy.ep.admit_at = b.ep.admit_at;
        copy.ep.discharge_at = b.ep.discharge_at;
        const orig = b.services;
        copy.services.forEach((s, idx) => {
          const o = orig.find((x) => x.code === s.code) ?? orig[idx];
          if (o) {
            s.performed_at = o.performed_at;
            db.prepare("UPDATE services SET performed_at=? WHERE id=?").run(o.performed_at, s.id);
          }
        });
        const c = newClaim(cx, copy.ep, { status, amount: b.claim.amount, group: b.claim.group, submittedAt });
        cx.truth.push({ claim_id: c.id, label: "t2_repeat" });
      }
    }

    // T3: perawatan lanjutan ditagih terpisah (16) dan padanan sah (8)
    const longStay = (b: Base) => b.ep.kind === "RITL" && daysBetween(b.ep.admit_at, b.ep.discharge_at) >= 4 && dayOf(b.ep.discharge_at) < "2026-09-01";
    for (let i = 0; i < 24; i++) {
      const b = take(longStay);
      if (!b) break;
      const legit = i >= 16;
      const part = { id: b.ep.participant_id, coverage_start: "2019-01-01", coverage_end: null } as PartRow;
      const gap = r.pick([0, 1, 1]);
      const los1 = Math.max(2, Math.floor(daysBetween(b.ep.admit_at, b.ep.discharge_at) / 2));
      const newDischarge = at(addDays(b.ep.admit_at, los1), 11, 0);
      db.prepare("UPDATE episodes SET discharge_at=? WHERE id=?").run(newDischarge, b.ep.id);
      b.ep.discharge_at = newDischarge;
      const kmr = b.services.find((s) => s.code === "KMR");
      if (kmr) {
        db.prepare("UPDATE services SET qty=?, amount=? WHERE id=?").run(los1, SVC.KMR.price * los1, kmr.id);
        db.prepare("UPDATE claim_items SET amount=? WHERE service_id=?").run(SVC.KMR.price * los1, kmr.id);
      }
      for (const s of b.services.filter((x) => x.code !== "KMR")) {
        if (s.performed_at > newDischarge) {
          const t = addHours(b.ep.admit_at, 3);
          db.prepare("UPDATE services SET performed_at=? WHERE id=?").run(t, s.id);
          db.prepare("UPDATE evidence SET recorded_at=? WHERE service_id=? AND type='lembar_tindakan'").run(addHours(t, 0.25), s.id);
          s.performed_at = t;
        }
      }
      db.prepare("UPDATE evidence SET recorded_at=? WHERE episode_id=? AND type='resume_medis'").run(newDischarge, b.ep.id);
      const sameFamily = DX.filter((d) => d.family === b.ep.dx.family && d.kind === "RITL");
      const dx2 = legit ? r.pick(sameFamily) : b.ep.dx;
      const second = newEpisode(cx, { participant: part, dx: dx2, facility: b.ep.facility_id, admitDate: addDays(newDischarge, gap), los: r.int(2, 3), hour: 16, doctor: b.ep.doctor });
      if (legit) {
        db.prepare("UPDATE episodes SET group_code=? WHERE id=?").run(groupFor(dx2.family, 2), second.ep.id);
        second.ep.group_code = groupFor(dx2.family, 2);
        db.prepare("INSERT INTO evidence (id,episode_id,service_id,type,recorded_at,performer,summary) VALUES (?,?,?,?,?,?,?)").run(
          `V-${pad(++cx.n.v, 5)}`, second.ep.id, null, "indikasi_medis", second.ep.admit_at, second.ep.doctor, "Catatan dokter: perburukan akut setelah pulang, membutuhkan perawatan ulang (indikasi medis).",
        );
      } else {
        db.prepare("UPDATE episodes SET group_code=? WHERE id=?").run(b.ep.group_code, second.ep.id);
        second.ep.group_code = b.ep.group_code;
      }
      const status: ClaimStatus = r.chance(0.4) ? "draft" : "submitted";
      const c = newClaim(cx, second.ep, {
        status, amount: Math.round((dx2.baseAmount * 0.55) / 1000) * 1000, submittedAt: status === "draft" ? undefined : at(addDays(second.ep.discharge_at, 3), 10),
      });
      const newAmt = Math.round((b.claim.amount * 0.6) / 1000) * 1000;
      db.prepare("UPDATE claims SET amount=? WHERE id=?").run(newAmt, b.claim.id);
      cx.truth.push(legit ? { claim_id: c.id, label: "legit_lookalike", mimics: "t3" } : { claim_id: c.id, label: "t3_continuation" });
    }

    // T1: dokumentasi pelaksanaan belum ditemukan (20) dan padanan yang kemudian terbukti ada (8)
    for (let i = 0; i < 28; i++) {
      const legit = i >= 20;
      const b = take((x) => {
        const code = HIGH_COST_BY_FAMILY[x.ep.dx.family];
        return !x.services.some((s) => s.code === code) && dayOf(x.ep.admit_at) < "2026-09-10";
      });
      if (!b) break;
      const code = HIGH_COST_BY_FAMILY[b.ep.dx.family];
      const info = SVC[code];
      const span = Math.max(daysBetween(b.ep.admit_at, b.ep.discharge_at) * 24 - 12, 1);
      const when = b.ep.kind === "RITL" ? addHours(b.ep.admit_at, 2 + Math.floor(r.next() * span)) : addHours(b.ep.admit_at, 0.5);
      const sid = `S-${pad(++cx.n.s, 5)}`;
      db.prepare("INSERT INTO services (id,episode_id,code,name,performed_at,performer,qty,amount) VALUES (?,?,?,?,?,?,?,?)").run(sid, b.ep.id, code, info.name, when, b.ep.doctor, 1, info.price);
      db.prepare("INSERT INTO claim_items (id,claim_id,service_id,amount) VALUES (?,?,?,?)").run(`CI-${pad(++cx.n.i, 6)}`, b.claim.id, sid, info.price);
      db.prepare("UPDATE claims SET amount = amount + ? WHERE id=?").run(info.price, b.claim.id);
      const kind = legit ? "missing" : r.pick(["missing", "missing", "missing", "time", "performer"] as const);
      if (kind === "time") {
        db.prepare("INSERT INTO evidence (id,episode_id,service_id,type,recorded_at,performer,summary) VALUES (?,?,?,?,?,?,?)").run(`V-${pad(++cx.n.v, 5)}`, b.ep.id, sid, "lembar_tindakan", addDays(b.ep.discharge_at, 3), b.ep.doctor, `Lembar tindakan ${info.name} (dicatat setelah pasien pulang).`);
      } else if (kind === "performer") {
        db.prepare("INSERT INTO evidence (id,episode_id,service_id,type,recorded_at,performer,summary) VALUES (?,?,?,?,?,?,?)").run(`V-${pad(++cx.n.v, 5)}`, b.ep.id, sid, "lembar_tindakan", addHours(when, 0.25), "dr. Gunawan, Sp.B", `Lembar tindakan ${info.name} oleh dokter yang berbeda.`);
      }
      cx.truth.push(legit ? { claim_id: b.claim.id, label: "legit_lookalike", mimics: "t1" } : { claim_id: b.claim.id, label: "t1_missing_doc" });
    }

    // Perawatan ulang sah yang mirip klaim berulang (6): harus lolos tanpa temuan
    for (let i = 0; i < 6; i++) {
      const b = take((x) => x.ep.kind === "RITL" && x.status === "paid" && dayOf(x.ep.discharge_at) < "2026-08-01");
      if (!b) break;
      const part = { id: b.ep.participant_id, coverage_start: "2019-01-01", coverage_end: null } as PartRow;
      const e2 = newEpisode(cx, { participant: part, dx: b.ep.dx, facility: b.ep.facility_id, admitDate: addDays(b.ep.discharge_at, r.int(10, 22)), doctor: b.ep.doctor });
      db.prepare("UPDATE episodes SET group_code=? WHERE id=?").run(b.ep.group_code, e2.ep.id);
      e2.ep.group_code = b.ep.group_code;
      db.prepare("INSERT INTO evidence (id,episode_id,service_id,type,recorded_at,performer,summary) VALUES (?,?,?,?,?,?,?)").run(
        `V-${pad(++cx.n.v, 5)}`, e2.ep.id, null, "indikasi_medis", e2.ep.admit_at, e2.ep.doctor, "Kontrol terjadwal dengan eksaserbasi, perawatan ulang sesuai indikasi medis.",
      );
      const c = newClaim(cx, e2.ep, { status: "submitted" });
      cx.truth.push({ claim_id: c.id, label: "legit_lookalike", mimics: "t2" });
    }

    // Koding tidak selaras (10) dan kepesertaan (8): masuk pemilahan pending
    const rest = (pred: (b: Base) => boolean) => r.shuffle(base.filter((b) => !used.has(b.ep.participant_id) && pred(b)));
    for (const b of rest((x) => x.status === "paid" || x.status === "submitted").slice(0, 10)) {
      used.add(b.ep.participant_id);
      const fam = familyOfGroup(b.claim.group);
      const other = r.pick((["RESP", "GI", "CARDIO", "URO", "ORTHO", "NEURO"] as Family[]).filter((f) => f !== fam));
      db.prepare("UPDATE claims SET group_code=?, status='pending' WHERE id=?").run(groupFor(other, 2), b.claim.id);
      cx.truth.push({ claim_id: b.claim.id, label: "coding" });
    }
    for (const b of rest((x) => x.status === "paid" || x.status === "submitted").slice(0, 8)) {
      used.add(b.ep.participant_id);
      db.prepare("UPDATE participants SET coverage_end=? WHERE id=?").run(addDays(b.ep.admit_at, -r.int(5, 60)).slice(0, 10), b.ep.participant_id);
      db.prepare("UPDATE claims SET status='pending' WHERE id=?").run(b.claim.id);
      cx.truth.push({ claim_id: b.claim.id, label: "membership" });
    }

    for (const t of cx.truth) db.prepare("INSERT OR REPLACE INTO ground_truth (claim_id,label,mimics) VALUES (?,?,?)").run(t.claim_id, t.label, t.mimics ?? null);
  })();

  return {
    truth: cx.truth,
    hero: {
      participant_id: "P-0001", episode_a: "E-0001", episode_b: "E-0002", claim_paid: "C-0001", claim_dup: "C-0002", claim_split: "C-0003",
      bronko_service: (db.prepare("SELECT id FROM services WHERE episode_id='E-0001' AND code='BRONKO'").get() as { id: string }).id,
      facility_id: "FAC-RSHB",
    },
  };
}
