// Generator data SIMULASI berbenih tetap. Seluruh nama, NIK, dan angka fiktif.
import {
  DOCTORS, DX, HIGH_COST_BY_FAMILY, HOSPITALS, SVC, familyOfGroup, groupFor, type DxInfo, type Family,
} from "../catalog";
import { addDays, addHours, dayOf } from "../dates";
import { makeRng, type Rng } from "../rng";
import type {
  Claim, ClaimStatus, Confirmation, Dataset, Episode, Evidence, Modus, Participant, Service,
} from "../types";

export const SEED_NOW = "2026-10-05T09:00";

export type TruthLabel = Modus | "legit_lookalike" | "coding" | "membership";
export interface Truth {
  claim_id: string;
  label: TruthLabel;
  /** untuk legit_lookalike: modus yang kasusnya menyerupai */
  mimics?: Modus;
}
export interface Seeded {
  ds: Dataset;
  truth: Truth[];
  hero: { participant_id: string; episode_a: string; episode_b: string; claim_paid: string; claim_dup: string; claim_split: string; bronko_service: string };
}

const FIRST = ["Sari", "Budi", "Wati", "Joko", "Rina", "Agus", "Dewi", "Hadi", "Lestari", "Rudi", "Maya", "Eko", "Fitri", "Dedi", "Ayu", "Bayu", "Nia", "Imam", "Putri", "Yusuf", "Citra", "Andi", "Siti", "Fajar", "Mega", "Rahmat", "Tika", "Wahyu", "Indah", "Gilang"];
const LAST = ["Wulandari", "Santoso", "Pratama", "Hidayat", "Lestari", "Saputra", "Nugroho", "Kusuma", "Rahayu", "Wibowo", "Permata", "Setiawan", "Maharani", "Firmansyah", "Anggraini", "Susanto", "Utami", "Hakim", "Cahyani", "Purnomo"];

interface State {
  r: Rng;
  ds: Dataset;
  truth: Truth[];
  n: { p: number; e: number; s: number; v: number; c: number; k: number };
}
const pad = (n: number, w: number) => String(n).padStart(w, "0");

function at(date: string, h: number, m = 0) {
  return `${dayOf(date)}T${pad(h, 2)}:${pad(m, 2)}`;
}

function newParticipant(st: State, name?: string): Participant {
  const { r } = st;
  const id = `P-${pad(++st.n.p, 4)}`;
  const y = r.int(2018, 2025);
  const p: Participant = {
    id,
    name: name ?? `${r.pick(FIRST)} ${r.pick(LAST)}`,
    nik: `3174••••••${pad(r.int(0, 9999), 4)}`,
    dob: `${r.int(1950, 2014)}-${pad(r.int(1, 12), 2)}-${pad(r.int(1, 28), 2)}`,
    coverage_start: `${y}-${pad(r.int(1, 12), 2)}-01`,
    coverage_end: null,
    faskes1: `Puskesmas ${r.pick(["Kenanga", "Melati", "Mawar", "Anggrek", "Cempaka"])} (simulasi)`,
  };
  st.ds.participants.push(p);
  return p;
}

interface EpOpts {
  participant: Participant;
  dx: DxInfo;
  hospital: string;
  admitDate: string;
  los?: number;
  doctor?: string;
  extra?: string[]; // kode layanan tambahan
  noEvidenceFor?: string[]; // kode layanan tanpa lembar tindakan
  hour?: number;
}

function newEpisode(st: State, o: EpOpts) {
  const { r, ds } = st;
  const los = o.dx.kind === "RITL" ? (o.los ?? r.int(o.dx.los[0], o.dx.los[1])) : 0;
  const doctor = o.doctor ?? r.pick(DOCTORS);
  const hour = o.hour ?? r.int(8, 17);
  const admit = at(o.admitDate, hour, r.pick([0, 15, 30, 45]));
  const discharge = o.dx.kind === "RITL" ? at(addDays(admit, los), 11, 0) : addHours(admit, 2);
  const family = o.dx.family;
  const ep: Episode = {
    id: `E-${pad(++st.n.e, 4)}`,
    participant_id: o.participant.id,
    hospital: o.hospital,
    kind: o.dx.kind,
    admit_at: admit,
    discharge_at: discharge,
    dx_code: o.dx.code,
    dx_text: o.dx.text,
    group_code: groupFor(family, r.pick([1, 2, 3] as const)),
  };
  ds.episodes.push(ep);
  const services: Service[] = [];
  const addService = (code: string, qty: number, when: string) => {
    const info = SVC[code];
    const s: Service = {
      id: `S-${pad(++st.n.s, 5)}`,
      episode_id: ep.id,
      code,
      name: info.name,
      performed_at: when,
      performer: doctor,
      qty,
      amount: info.price * qty,
    };
    ds.services.push(s);
    services.push(s);
    if (info.needsRecord && !(o.noEvidenceFor ?? []).includes(code)) addRecord(s);
    return s;
  };
  const addRecord = (s: Service, overrides: Partial<Evidence> = {}) => {
    ds.evidence.push({
      id: `V-${pad(++st.n.v, 5)}`,
      episode_id: ep.id,
      service_id: s.id,
      type: "lembar_tindakan",
      recorded_at: addHours(s.performed_at, 0.25),
      performer: s.performer,
      summary: `Lembar tindakan ${s.name}, ditandatangani ${s.performer}.`,
      ...overrides,
    });
  };
  if (o.dx.kind === "RITL") addService("KMR", Math.max(los, 1), admit);
  addService("KON", 1, addHours(admit, 1));
  const codes = [...o.dx.procs, ...(o.extra ?? [])];
  for (const code of codes) {
    const span = Math.max(los * 24 - 12, 1);
    const when = o.dx.kind === "RITL" ? addHours(admit, 1 + Math.floor(r.next() * span)) : addHours(admit, 0.5);
    addService(code, 1, when);
  }
  ds.evidence.push({
    id: `V-${pad(++st.n.v, 5)}`,
    episode_id: ep.id,
    service_id: null,
    type: "resume_medis",
    recorded_at: discharge,
    performer: doctor,
    summary: `Resume medis: ${o.dx.text} (${o.dx.code}), pasien dipulangkan.`,
  });
  return { ep, services, doctor, addService, addRecord };
}

function newClaim(
  st: State,
  ep: Episode,
  o: { status: ClaimStatus; amount?: number; group?: string; submittedAt?: string; paidAt?: string },
) {
  const dx = DX.find((d) => d.code === ep.dx_code)!;
  const submitted = o.status === "draft" ? null : (o.submittedAt ?? at(addDays(ep.discharge_at, 3), 10));
  let paid: string | null = null;
  if (o.status === "paid") paid = o.paidAt ?? at(addDays(submitted!, 14), 10);
  const c: Claim = {
    id: `C-${pad(++st.n.c, 4)}`,
    claim_no: `KLM-2026-${pad(1000 + st.n.c, 6)}`,
    episode_id: ep.id,
    group_code: o.group ?? ep.group_code,
    amount: o.amount ?? Math.round((dx.baseAmount * (0.9 + st.r.next() * 0.2)) / 1000) * 1000,
    status: o.status,
    submitted_at: submitted,
    paid_at: paid,
    hospital: ep.hospital,
  };
  st.ds.claims.push(c);
  return c;
}

function confirm(st: State, serviceId: string, participantId: string, answer: Confirmation["answer"], note: string, when: string) {
  st.ds.confirmations.push({ id: `K-${pad(++st.n.k, 4)}`, service_id: serviceId, participant_id: participantId, answer, note, at: when });
}

function pickStatus(st: State, ep: Episode): ClaimStatus {
  const submitted = at(addDays(ep.discharge_at, 3), 10);
  const paid = addDays(submitted, 14);
  if (paid > SEED_NOW) return dayOf(ep.discharge_at) > "2026-09-20" ? (st.r.chance(0.5) ? "draft" : "submitted") : "submitted";
  return st.r.chance(0.88) ? "paid" : "submitted";
}

export function generate(seed = 20261005, nParticipants = 300): Seeded {
  const st: State = {
    r: makeRng(seed),
    ds: { participants: [], episodes: [], services: [], evidence: [], claims: [], confirmations: [] },
    truth: [],
    n: { p: 0, e: 0, s: 0, v: 0, c: 0, k: 0 },
  };
  const { r, ds } = st;

  // ---------- Tokoh demo: Bu Sari (1 perawatan, tiga tagihan) ----------
  const sari = newParticipant(st, "Sari Wulandari");
  sari.coverage_start = "2019-01-01";
  sari.dob = "1968-06-14";
  sari.faskes1 = "Puskesmas Kenanga (simulasi)";
  const pneu = DX.find((d) => d.code === "J18.9")!;
  const hospital = HOSPITALS[0];
  const A = newEpisode(st, {
    participant: sari, dx: pneu, hospital, admitDate: "2026-03-03", los: 5, hour: 10,
    doctor: "dr. Bagas, Sp.P", extra: ["BRONKO"], noEvidenceFor: ["BRONKO"],
  });
  A.ep.group_code = "SIM-RESP-2";
  const bronko = A.services.find((s) => s.code === "BRONKO")!;
  const heroTimes: Record<string, string> = {
    "LAB-DL": "2026-03-03T11:00", RONTGEN: "2026-03-03T11:30", NEBU: "2026-03-03T14:00", BRONKO: "2026-03-05T09:40",
  };
  for (const s of A.services) {
    if (heroTimes[s.code]) s.performed_at = heroTimes[s.code];
    const rec = ds.evidence.find((e) => e.service_id === s.id);
    if (rec) rec.recorded_at = addHours(s.performed_at, 0.25);
  }
  const claimPaid = newClaim(st, A.ep, { status: "paid", amount: 8900000, submittedAt: "2026-03-11T10:00", paidAt: "2026-03-25T10:00" });
  const claimDup = newClaim(st, A.ep, { status: "submitted", amount: 8900000, submittedAt: "2026-04-20T10:00" });
  claimDup.claim_no = "KLM-2026-001777";
  const B = newEpisode(st, {
    participant: sari, dx: pneu, hospital, admitDate: "2026-03-08", los: 2, hour: 15, doctor: "dr. Bagas, Sp.P", extra: [],
  });
  B.ep.group_code = "SIM-RESP-2";
  const claimSplit = newClaim(st, B.ep, { status: "submitted", amount: 3100000, submittedAt: "2026-03-14T10:00" });
  const rontgen = A.services.find((s) => s.code === "RONTGEN")!;
  confirm(st, rontgen.id, sari.id, "sesuai", "Benar, saya dirontgen saat masuk.", "2026-03-20T19:00");
  st.truth.push(
    { claim_id: claimPaid.id, label: "phantom" },
    { claim_id: claimDup.id, label: "repeat_billing" },
    { claim_id: claimSplit.id, label: "fragmentation" },
  );
  // Selama ini, Bu Sari belum menjawab konfirmasi bronkoskopi: dipakai pada demo mobile.

  // ---------- Populasi dasar yang bersih ----------
  const base: { ep: Episode; claim: Claim; services: Service[] }[] = [];
  for (let i = 0; i < nParticipants - 1; i++) {
    const p = newParticipant(st);
    const n = r.pick([1, 2, 2, 3]);
    let cursor = addDays("2026-01-05T00:00", r.int(0, 60));
    for (let k = 0; k < n; k++) {
      const dx = r.pick(DX.filter((d) => (r.chance(0.55) ? d.kind === "RJTL" : d.kind === "RITL")));
      const h = newEpisode(st, { participant: p, dx, hospital: r.pick(HOSPITALS), admitDate: cursor });
      if (dayOf(h.ep.discharge_at) > "2026-09-28") {
        // terlalu dekat dengan hari ini: hapus episode terakhir
        st.n.e--;
        ds.episodes.pop();
        const sIds = new Set(h.services.map((s) => s.id));
        ds.services = ds.services.filter((s) => !sIds.has(s.id));
        ds.evidence = ds.evidence.filter((e) => e.episode_id !== h.ep.id);
        st.n.s -= h.services.length;
        break;
      }
      const claim = newClaim(st, h.ep, { status: pickStatus(st, h.ep) });
      base.push({ ep: h.ep, claim, services: h.services });
      if (r.chance(0.3)) {
        const needs = h.services.filter((s) => SVC[s.code].needsRecord);
        if (needs.length) {
          const s = r.pick(needs);
          confirm(st, s.id, p.id, r.chance(0.85) ? "sesuai" : "tidak_ingat", "", addDays(h.ep.discharge_at, 5));
        }
      }
      cursor = addDays(h.ep.discharge_at, r.int(25, 110));
    }
  }

  // ---------- Injeksi ----------
  const used = new Set<string>();
  const take = (pred: (b: (typeof base)[number]) => boolean) => {
    const pool = r.shuffle(base.filter((b) => !used.has(b.ep.participant_id) && pred(b)));
    const b = pool[0];
    if (b) used.add(b.ep.participant_id);
    return b;
  };
  const paidRitl = (b: (typeof base)[number]) => b.claim.status === "paid" && b.ep.kind === "RITL" && dayOf(b.claim.paid_at!) < "2026-08-20";

  // A) Repeat billing (18): 10 episode sama + 8 salinan episode
  for (let i = 0; i < 18; i++) {
    const b = take(paidRitl);
    if (!b) break;
    const status: ClaimStatus = r.chance(0.35) ? "draft" : "submitted";
    const submittedAt = status === "draft" ? undefined : at(addDays(b.claim.paid_at!, r.int(8, 40)), 10);
    if (i < 10) {
      const c = newClaim(st, b.ep, { status, amount: b.claim.amount, group: b.claim.group_code, submittedAt });
      st.truth.push({ claim_id: c.id, label: "repeat_billing" });
    } else {
      // salinan episode dengan tanggal dan layanan yang sama (tanpa bukti ganda)
      const dx = DX.find((d) => d.code === b.ep.dx_code)!;
      const part = ds.participants.find((p) => p.id === b.ep.participant_id)!;
      const copy = newEpisode(st, { participant: part, dx, hospital: b.ep.hospital, admitDate: b.ep.admit_at, los: dayDiff2(b.ep), hour: Number(b.ep.admit_at.slice(11, 13)) });
      copy.ep.admit_at = b.ep.admit_at;
      copy.ep.discharge_at = b.ep.discharge_at;
      copy.ep.group_code = b.ep.group_code;
      // samakan jam layanan dengan episode asli agar mirip salinan
      const orig = ds.services.filter((s) => s.episode_id === b.ep.id);
      copy.services.forEach((s, idx) => {
        const o = orig.find((x) => x.code === s.code) ?? orig[idx];
        if (o) s.performed_at = o.performed_at;
      });
      const c = newClaim(st, copy.ep, { status, amount: b.claim.amount, group: b.claim.group_code, submittedAt });
      st.truth.push({ claim_id: c.id, label: "repeat_billing" });
    }
  }

  // B) Pemecahan episode (16) dan C) padanan sah (8)
  const longStay = (b: (typeof base)[number]) => b.ep.kind === "RITL" && dayDiff2(b.ep) >= 4 && dayOf(b.ep.discharge_at) < "2026-09-01";
  for (let i = 0; i < 24; i++) {
    const b = take(longStay);
    if (!b) break;
    const legit = i >= 16;
    const part = ds.participants.find((p) => p.id === b.ep.participant_id)!;
    const dx = DX.find((d) => d.code === b.ep.dx_code)!;
    const gap = r.pick([0, 1, 1]);
    const los1 = Math.max(2, Math.floor(dayDiff2(b.ep) / 2));
    const oldDischarge = b.ep.discharge_at;
    b.ep.discharge_at = at(addDays(b.ep.admit_at, los1), 11, 0);
    const kmr = ds.services.find((s) => s.episode_id === b.ep.id && s.code === "KMR")!;
    kmr.qty = los1;
    kmr.amount = SVC.KMR.price * los1;
    // pulihkan tanggal layanan agar tetap dalam rentang episode pertama
    for (const s of ds.services.filter((x) => x.episode_id === b.ep.id && x.code !== "KMR")) {
      if (s.performed_at > b.ep.discharge_at) s.performed_at = addHours(b.ep.admit_at, 3);
    }
    for (const e of ds.evidence.filter((x) => x.episode_id === b.ep.id)) {
      if (e.type === "resume_medis") e.recorded_at = b.ep.discharge_at;
      else if (e.recorded_at > addHours(b.ep.discharge_at, 5)) {
        const s = ds.services.find((x) => x.id === e.service_id);
        if (s) e.recorded_at = addHours(s.performed_at, 0.25);
      }
    }
    void oldDischarge;
    const sameFamilyDx = DX.filter((d) => d.family === dx.family && d.kind === "RITL");
    const dx2 = legit ? r.pick(sameFamilyDx) : dx;
    const second = newEpisode(st, {
      participant: part, dx: dx2, hospital: b.ep.hospital, admitDate: addDays(b.ep.discharge_at, gap), los: r.int(2, 3), hour: 16,
      doctor: b.services[0]?.performer,
    });
    second.ep.group_code = legit ? groupFor(dx2.family, 2) : b.ep.group_code;
    if (legit) {
      ds.evidence.push({
        id: `V-${pad(++st.n.v, 5)}`, episode_id: second.ep.id, service_id: null, type: "indikasi_medis",
        recorded_at: second.ep.admit_at, performer: second.doctor,
        summary: "Catatan dokter: perburukan akut setelah pulang, membutuhkan perawatan ulang (indikasi medis).",
      });
    }
    const status: ClaimStatus = r.chance(0.4) ? "draft" : "submitted";
    const c = newClaim(st, second.ep, {
      status, amount: Math.round((dx2.baseAmount * 0.55) / 1000) * 1000,
      submittedAt: status === "draft" ? undefined : at(addDays(second.ep.discharge_at, 3), 10),
    });
    b.claim.amount = Math.round((b.claim.amount * 0.6) / 1000) * 1000;
    st.truth.push(legit ? { claim_id: c.id, label: "legit_lookalike", mimics: "fragmentation" } : { claim_id: c.id, label: "fragmentation" });
  }

  // D) Phantom billing (20) dan padanan sah (8)
  for (let i = 0; i < 28; i++) {
    const legit = i >= 20;
    const b = take((x) => {
      const fam = DX.find((d) => d.code === x.ep.dx_code)!.family;
      const code = HIGH_COST_BY_FAMILY[fam];
      return !x.services.some((s) => s.code === code) && dayOf(x.ep.admit_at) < "2026-09-10";
    });
    if (!b) break;
    const dx = DX.find((d) => d.code === b.ep.dx_code)!;
    const code = HIGH_COST_BY_FAMILY[dx.family];
    const info = SVC[code];
    const doctor = b.services[0]?.performer ?? DOCTORS[0];
    const span = Math.max(dayDiff2(b.ep) * 24 - 12, 1);
    const when = b.ep.kind === "RITL" ? addHours(b.ep.admit_at, 2 + Math.floor(r.next() * span)) : addHours(b.ep.admit_at, 0.5);
    const svc: Service = { id: `S-${pad(++st.n.s, 5)}`, episode_id: b.ep.id, code, name: info.name, performed_at: when, performer: doctor, qty: 1, amount: info.price };
    ds.services.push(svc);
    b.services.push(svc);
    b.claim.amount += info.price;
    const kind = legit ? "missing" : r.pick(["missing", "missing", "missing", "time", "performer"] as const);
    if (kind === "time") {
      ds.evidence.push({ id: `V-${pad(++st.n.v, 5)}`, episode_id: b.ep.id, service_id: svc.id, type: "lembar_tindakan", recorded_at: addDays(b.ep.discharge_at, 3), performer: doctor, summary: `Lembar tindakan ${info.name} (dicatat setelah pasien pulang).` });
    } else if (kind === "performer") {
      ds.evidence.push({ id: `V-${pad(++st.n.v, 5)}`, episode_id: b.ep.id, service_id: svc.id, type: "lembar_tindakan", recorded_at: addHours(when, 0.25), performer: "dr. Gunawan, Sp.B", summary: `Lembar tindakan ${info.name} oleh dokter yang berbeda.` });
    }
    if (legit) {
      confirm(st, svc.id, b.ep.participant_id, "sesuai", "Betul, saya menjalani tindakan ini.", addDays(b.ep.discharge_at, 6));
    } else if (r.chance(0.45)) {
      confirm(st, svc.id, b.ep.participant_id, r.chance(0.75) ? "tidak_sesuai" : "tidak_ingat", "", addDays(b.ep.discharge_at, 6));
    }
    st.truth.push(legit ? { claim_id: b.claim.id, label: "legit_lookalike", mimics: "phantom" } : { claim_id: b.claim.id, label: "phantom" });
  }

  // E) Readmisi sah yang mirip repeat billing (6): perlu lolos tanpa temuan
  for (let i = 0; i < 6; i++) {
    const b = take((x) => x.ep.kind === "RITL" && x.claim.status === "paid" && dayOf(x.ep.discharge_at) < "2026-08-01");
    if (!b) break;
    const part = ds.participants.find((p) => p.id === b.ep.participant_id)!;
    const dx = DX.find((d) => d.code === b.ep.dx_code)!;
    const e2 = newEpisode(st, { participant: part, dx, hospital: b.ep.hospital, admitDate: addDays(b.ep.discharge_at, r.int(10, 22)), doctor: b.services[0]?.performer });
    e2.ep.group_code = b.ep.group_code;
    ds.evidence.push({ id: `V-${pad(++st.n.v, 5)}`, episode_id: e2.ep.id, service_id: null, type: "indikasi_medis", recorded_at: e2.ep.admit_at, performer: e2.doctor, summary: "Kontrol terjadwal dengan eksaserbasi, perawatan ulang sesuai indikasi medis." });
    const c = newClaim(st, e2.ep, { status: "submitted" });
    st.truth.push({ claim_id: c.id, label: "legit_lookalike", mimics: "repeat_billing" });
  }

  // F) Ketidaksesuaian koding (10) dan kepesertaan (8): pendukung
  const rest = (pred: (b: (typeof base)[number]) => boolean) => r.shuffle(base.filter((b) => !used.has(b.ep.participant_id) && pred(b)));
  for (const b of rest(() => true).slice(0, 10)) {
    used.add(b.ep.participant_id);
    const fam = familyOfGroup(b.claim.group_code);
    const other = r.pick((["RESP", "GI", "CARDIO", "URO", "ORTHO", "NEURO"] as Family[]).filter((f) => f !== fam));
    b.claim.group_code = groupFor(other, 2);
    st.truth.push({ claim_id: b.claim.id, label: "coding" });
  }
  for (const b of rest(() => true).slice(0, 8)) {
    used.add(b.ep.participant_id);
    const p = ds.participants.find((x) => x.id === b.ep.participant_id)!;
    p.coverage_end = addDays(b.ep.admit_at, -r.int(5, 60)).slice(0, 10);
    st.truth.push({ claim_id: b.claim.id, label: "membership" });
  }

  return {
    ds,
    truth: st.truth,
    hero: {
      participant_id: sari.id,
      episode_a: A.ep.id,
      episode_b: B.ep.id,
      claim_paid: claimPaid.id,
      claim_dup: claimDup.id,
      claim_split: claimSplit.id,
      bronko_service: bronko.id,
    },
  };
}

function dayDiff2(ep: Episode) {
  return Math.round((new Date(ep.discharge_at.slice(0, 10)).getTime() - new Date(ep.admit_at.slice(0, 10)).getTime()) / 86400000);
}
