import type Database from "better-sqlite3";
import { appendAudit } from "../audit";
import { AuthError, type Principal } from "../auth/principal";
import {
  SYSTEM_ACTOR, closeCase, completeFollowUp, createAction, createFinding, decideProof, lapseOverdueClarifications, proposeProof, requestFollowUp, resolveAction, respondClarification,
  sendClarification, setCauses, startAction, startReview, TransitionError, type ProofOutcome,
} from "../cases/core";
import { setNow } from "../clock";
import { addDays, addHours } from "../dates";
import { json, setMeta } from "../db";
import { DomainError } from "../idem";
import { FINDING_LABEL } from "../labels";
import { makeRng, type Rng } from "../rng";
import { SATISFACTION_SLOT, seedMetricDefinitions } from "../quality/definitions";
import { loadBank } from "../standards/registry";
import type { IndicatorVersionRow } from "../standards/types";
import { computeAgenda, deriveSignalHits, scopeMatches } from "../survey/engine";
import { SEED_NOW, type SeedRefs } from "./base";

/* Seed SINTETIS modul dasbor mutu. Semua angka di bawah dibangkitkan dari generator berbenih tetap, BUKAN data peserta atau faskes nyata.
   Dua pola sengaja ditanam agar dasbor dapat memperlihatkan sebelum/sesudah intervensi:
     - RS Nusa Medika: kekurangan obat pulang tinggi sampai tindakan perbaikan selesai (8 Apr 2026), lalu turun.
     - RS Harapan Bunda: kendala yang belum selesai tinggi sampai tindakan perbaikan selesai (8 Apr 2026), lalu turun.
   Selebihnya acak dengan tingkat dasar per indikator. Alur kasus dijalankan lewat fungsi domain sungguhan (audit sah), dengan jam diatur ke tanggal historis. */

const HOSPITAL_SCOPE = ["hospital"];

type Facts = Record<string, string>;
interface Ep { id: string; participant_id: string; facility_id: string; care_type: "outpatient" | "inpatient"; admit_at: string; discharge_at: string; context_json: string; peer_group: string | null }

/** Peluang jawaban NEGATIF per slot (layanan standar belum terpenuhi). Tingkat dasar sintetis; faskes tertentu menyimpang agar perbandingan bermakna. */
function pNegative(slot: string, facility: string, at: string): number {
  const base: Record<string, number> = {
    membership_checked: 0.06, flow_explained: 0.2, fee_requested: 0.05, doctor_visit: 0.08, lab_result_explained: 0.3, prescription_explained: 0.18,
    medication_receipt: 0.12, medication_instructions_explained: 0.15, followup_info_given: 0.2, discharge_fee_requested: 0.05, open_issue: 0.1,
  };
  let p = base[slot] ?? 0.1;
  if (facility === "FAC-RSNM" && slot === "medication_receipt") p = at < "2026-04-08" ? 0.42 : 0.14;
  if (facility === "FAC-RSHB" && slot === "open_issue") p = at < "2026-04-08" ? 0.38 : 0.09;
  if (facility === "FAC-RSBS") p = slot === "lab_result_explained" ? 0.55 : slot === "doctor_visit" ? 0.2 : slot === "flow_explained" ? 0.35 : p;
  if (facility === "FAC-RSTS") p = slot === "medication_receipt" ? 0.22 : slot === "fee_requested" ? 0.12 : p;
  if (facility === "FAC-RSCM" && slot === "followup_info_given") p = 0.4;
  return p;
}

const NEGATIVE_VALUE: Record<string, (r: Rng) => string> = {
  medication_receipt: (r) => (r.chance(0.6) ? "partial" : "none"),
  fee_requested: () => "yes", discharge_fee_requested: () => "yes", open_issue: () => "yes",
};
const POSITIVE_VALUE: Record<string, string> = { medication_receipt: "full", fee_requested: "no", discharge_fee_requested: "no", open_issue: "no" };

function draw(r: Rng, slot: string, facility: string, at: string, ctx: Facts, forceNegative = false): string {
  const probes = ["discharge_prescription_expected", "prescription_expected", "lab_performed"];
  if (probes.includes(slot)) return r.chance(0.14) ? "unknown" : r.chance(0.62) ? "yes" : "no";
  if (forceNegative && slot === "open_issue") return "yes";
  const x = r.next();
  if (x < 0.05) return "unknown";
  if (x < 0.065) return "not_understood";
  const GAP_SLOTS = new Set(Object.keys({
    membership_checked: 1, flow_explained: 1, fee_requested: 1, doctor_visit: 1, lab_result_explained: 1, prescription_explained: 1, medication_receipt: 1,
    medication_instructions_explained: 1, followup_info_given: 1, discharge_fee_requested: 1, open_issue: 1,
  }));
  if (GAP_SLOTS.has(slot)) {
    if (r.chance(pNegative(slot, facility, at))) return (NEGATIVE_VALUE[slot] ?? (() => "no"))(r);
    if (slot === "followup_info_given" && r.chance(0.05)) return "not_applicable";
    return POSITIVE_VALUE[slot] ?? "yes";
  }
  switch (slot) {
    case "lab_done": return ctx.lab_performed === "no" ? "no" : r.chance(0.93) ? "yes" : "no";
    case "doctor_introduced": return r.chance(0.75) ? "yes" : "no";
    case "condition_plan_explained": return r.chance(0.8) ? "yes" : "no";
    case "reported_reason": return r.pick(["stock_out", "stock_out", "stock_out", "not_covered", "no_reason_given", "other"]);
    case "replacement_arranged": return r.chance(0.35) ? "yes" : "no";
    case "outside_purchase": return r.chance(0.55) ? "yes" : "no";
    case "out_of_pocket_paid": return r.chance(0.5) ? "yes" : "no";
    case "fee_paid": case "discharge_fee_paid": return r.chance(0.55) ? "yes" : "no";
    default: return r.chance(0.8) ? "yes" : "no";
  }
}

interface Built {
  sessionId: string; episode: Ep; stage: "pre" | "intra" | "post"; status: string; facts: Facts; startedAt: string | null; endedAt: string | null; late: number;
}

interface Ev { t: string; seq: number; run: () => void }

export function seedQuality(db: Database.Database, refs: SeedRefs) {
  seedMetricDefinitions(db);
  const r = makeRng(4242);
  const bank = loadBank(db, { allowDraft: true });
  const indById = new Map(bank.indicators.map((i) => [i.id, i]));
  const hero = new Set([refs.hero.episode_a, refs.hero.episode_b]);
  const eps = (db.prepare(
    "SELECT e.id, e.participant_id, e.facility_id, e.care_type, e.admit_at, e.discharge_at, e.context_json, fa.peer_group FROM episodes e JOIN facilities fa ON fa.id = e.facility_id " +
      "WHERE fa.kind = 'fkrtl' AND e.id NOT IN (SELECT episode_id FROM cases) ORDER BY e.discharge_at, e.id",
  ).all() as Ep[]).filter((e) => !hero.has(e.id) && e.discharge_at < "2026-10-04");

  const counters = { ses: 0, inv: 0, fact: 0, turn: 0 };
  const pad = (n: number, w: number) => String(n).padStart(w, "0");
  const insInv = db.prepare("INSERT INTO invitations (id, episode_id, participant_id, stage, mode, status, scheduled_for, sent_at, expires_at, subject_json, session_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,NULL,?,?)");
  const insSes = db.prepare(
    "INSERT INTO survey_sessions (id, invitation_id, episode_id, participant_id, facility_id, stage, mode, respondent_role, companion_id, status, revision, indicator_versions_json, subject_json, budget_core, budget_clarif, core_asked, clarif_asked, uses_draft, bank_mode, ai_mode_last, pending_next_json, started_at, last_activity_at, ended_at, end_reason, deadline_at, is_sandbox) VALUES (?,?,?,?,?,?, 'routine', ?, NULL, ?, ?, ?, NULL, 5, 3, ?, ?, 1, 'fixed', NULL, NULL, ?, ?, ?, ?, ?, 0)",
  );
  const insTurn = db.prepare(
    "INSERT INTO survey_turns (id, session_id, seq, question_id, question_text, question_kind, text_source, selected_by, selection_reason, invocation_id, asked_at, answer_text, answer_choice, answered_at, idem_key, attempts, needs_rephrase, status) VALUES (?,?,?,?,?,?, 'bank', 'rules', ?, NULL, ?, NULL, ?, ?, NULL, 1, 0, 'answered')",
  );
  const insFact = db.prepare(
    "INSERT INTO participant_facts (id, session_id, slot, subject, value, indicator_id, source_turn_id, source_quote, origin, proposal_id, status, supersedes_id, revision, created_at) VALUES (?,?,?,NULL,?,?,?,NULL,'choice',NULL,'active',NULL,0,?)",
  );

  const built: Built[] = [];
  const stagesFor = (e: Ep): ("pre" | "intra" | "post")[] => {
    const s: ("pre" | "intra" | "post")[] = ["post"];
    if (e.care_type === "inpatient" && r.chance(0.35)) s.push("intra");
    if (r.chance(0.2)) s.unshift("pre");
    return s;
  };

  db.transaction(() => {
    let activeLeft = 6;
    const lastEps = new Set(eps.slice(-11, -5).map((e) => e.id));
    const lateEps = eps.slice(-5).map((e) => e.id);
    for (const e of eps) {
      const lateIdx = lateEps.indexOf(e.id);
      if (lateIdx < 0 && !r.chance(0.95)) continue;
      for (const stage of lateIdx >= 0 ? (['post'] as const) : stagesFor(e)) {
        const sentAt = lateIdx >= 0 ? `2026-10-0${6 + Math.min(lateIdx, 2)}T1${lateIdx}:00` : stage === "post" ? addHours(addDays(e.discharge_at, 1), 1) : stage === "intra" ? addHours(addDays(e.admit_at, 1), 2) : addHours(addDays(e.admit_at, -1), 3);
        if (sentAt > SEED_NOW) continue;
        const sid = `SSQ-${pad(++counters.ses, 4)}`;
        const iid = `INVQ-${pad(++counters.inv, 4)}`;
        const tags = [...HOSPITAL_SCOPE, ...(e.care_type === "inpatient" && stage === "post" ? ["inpatient_discharge"] : [])];
        const stageInds = bank.indicators.filter((i) => i.stage === stage && i.indicator_id !== "CTX_PROBES" && scopeMatches(i.scope, tags));
        const ctx0 = json<Record<string, string | number | boolean | null>>(e.context_json, {});
        const expiresAt = addDays(sentAt, 7);
        const isActive = lastEps.has(e.id) && stage === "post" && activeLeft > 0;
        const draw0 = r.next();
        const expired = !isActive && lateIdx < 0 && draw0 < 0.17;
        const companion = r.chance(0.12) ? "companion" : "self";
        if (expired) {
          insInv.run(iid, e.id, e.participant_id, stage, "routine", "expired", sentAt, sentAt, expiresAt, sid, sentAt);
          insSes.run(sid, iid, e.id, e.participant_id, e.facility_id, stage, companion, "expired", 0, JSON.stringify(stageInds.map((i) => i.id)), 0, 0, null, null, null, "no_response", expiresAt);
          built.push({ sessionId: sid, episode: e, stage, status: "expired", facts: {}, startedAt: null, endedAt: null, late: -1 });
          continue;
        }
        // jawaban dibangkitkan lewat mesin agenda produksi (cabang, penerapan, anggaran) agar konsisten dengan sesi sungguhan
        const startedAt = addHours(sentAt, r.int(3, lateIdx >= 0 ? 8 : 40));
        const facts: Facts = {};
        const asked: string[] = [];
        let coreAsked = 0, clarifAsked = 0, seq = 0;
        let clock = startedAt;
        const stopAt = isActive ? 2 : lateIdx < 0 && draw0 < 0.26 ? r.int(1, 3) : 99;
        const turns: { id: string; qid: string; text: string; kind: string; reason: string; value: string; at: string; slot: string; ind: IndicatorVersionRow }[] = [];
        let endStatus: "completed" | "partial" | null = null;
        for (let guard = 0; guard < 24; guard++) {
          const ag = computeAgenda({ stage, indicators: bank.indicators, questions: bank.questions, scopeTags: tags, context: ctx0, facts, asked, coreAsked, clarifAsked, budgetCore: 5, budgetClarif: 3 });
          if (ag.finished) { endStatus = ag.endStatus; break; }
          if (seq >= stopAt) break;
          const c = ag.eligible[0];
          const value = draw(r, c.question.target_slot, e.facility_id, clock, facts, lateIdx >= 0);
          clock = addHours(clock, 0.02);
          facts[c.question.target_slot] = value;
          asked.push(c.question.id);
          if (c.kind === "core") coreAsked++; else clarifAsked++;
          seq++;
          turns.push({ id: `TQ-${pad(++counters.turn, 5)}`, qid: c.question.id, text: c.question.text, kind: c.kind, reason: c.reason, value, at: clock, slot: c.question.target_slot, ind: c.indicator });
        }
        const status = isActive ? "active" : endStatus === "completed" ? "completed" : "partial";
        if (isActive) activeLeft--;
        const endedAt = status === "active" ? null : addHours(clock, 0.05);
        insInv.run(iid, e.id, e.participant_id, stage, "routine", status === "active" ? "opened" : "answered", sentAt, sentAt, expiresAt, sid, sentAt);
        insSes.run(sid, iid, e.id, e.participant_id, e.facility_id, stage, companion, status, turns.length, JSON.stringify(stageInds.map((i) => i.id)), coreAsked, clarifAsked, startedAt, endedAt ?? clock, endedAt, status === "partial" ? (endStatus === "partial" ? "unresolved_items" : "participant_stopped") : status === "completed" ? "coverage_complete" : null, expiresAt);
        turns.forEach((t, i) => {
          insTurn.run(t.id, sid, i + 1, t.qid, t.text, t.kind, t.reason, t.at, t.value, t.at);
          insFact.run(`PFQ-${pad(++counters.fact, 5)}`, sid, t.slot, t.value, t.ind.indicator_id, t.id, t.at);
        });
        // skor kepuasan opsional (instrumen internal terpisah; tidak pernah dibaca oleh gap)
        if (status === "completed" && stage === "post" && r.chance(0.55)) {
          const sat = Math.max(0, Math.min(10, Math.round(7.4 + (r.next() - 0.5) * 5 - (facts.medication_receipt && facts.medication_receipt !== "full" && facts.medication_receipt !== "unknown" ? 1.5 : 0))));
          insFact.run(`PFQ-${pad(++counters.fact, 5)}`, sid, SATISFACTION_SLOT, String(sat), null, null, endedAt ?? clock);
        }
        built.push({ sessionId: sid, episode: e, stage, status, facts, startedAt, endedAt, late: lateIdx });
      }
    }
  })();

  /* ---------- Temuan dari jawaban, lalu alur kasus lewat fungsi domain, dijalankan menurut urutan waktu ---------- */
  const fromUser = (id: string): Principal => {
    const u = db.prepare("SELECT id, name, role, facility_id, participant_id FROM users WHERE id = ?").get(id) as { id: string; name: string; role: Principal["role"]; facility_id: string | null; participant_id: string | null };
    return { id: `${u.role}:${u.id}`, name: u.name, role: u.role, facilityId: u.facility_id, participantId: u.participant_id, companionId: null };
  };
  const verifiers = [fromUser("U-VER-1"), fromUser("U-VER-2")];
  const reviewer = fromUser("U-REV-1");
  const faskesOf = (facilityId: string): Principal => {
    const u = db.prepare("SELECT id FROM users WHERE role = 'faskes' AND facility_id = ?").get(facilityId) as { id: string } | undefined;
    return u ? fromUser(u.id) : { id: `faskes:SEED-${facilityId}`, name: "Petugas faskes (seed)", role: "faskes", facilityId, participantId: null, companionId: null };
  };
  const participantOf = (pid: string): Principal => ({ id: `peserta:SEED-${pid}`, name: "Peserta (seed)", role: "peserta", facilityId: null, participantId: pid, companionId: null });

  const queue: Ev[] = [];
  let seq = 0;
  const at = (t: string, run: () => void) => { if (t <= SEED_NOW) queue.push({ t, seq: seq++, run }); };
  const srIns = db.prepare("INSERT INTO service_requests (id, participant_id, episode_id, facility_id, category, text, status, case_id, finding_id, respondent_role, created_at, idem_key) VALUES (?,?,?,?,?,?, 'received', ?, ?, ?, ?, NULL)");
  const srSet = (fid: string, st: string) => db.prepare("UPDATE service_requests SET status = ? WHERE finding_id = ?").run(st, fid);
  let srN = 0;

  const CATEGORY_TEXT: Record<string, string> = {
    obat: "Peserta melaporkan obat untuk dibawa pulang belum diterima seluruhnya.",
    biaya: "Peserta melaporkan membayar biaya yang menurutnya seharusnya ditanggung.",
    kendala_belum_selesai: "Peserta menyatakan masih ada kendala dari layanan yang belum selesai.",
    visit_dokter: "Peserta melaporkan dokter tidak datang memeriksa.",
  };

  // dua tindakan perbaikan yang ditanam: dipilih dari temuan terawal yang memenuhi syarat
  type Plant = { facility: string; indicator: string; latestFinding: string; actionAt: string; startAt: string; resolveAt: string; description: string; owner: string; target: string };
  const plants: Plant[] = [
    { facility: "FAC-RSNM", indicator: "MED_FULFILLMENT", latestFinding: "2026-02-26", actionAt: "2026-03-05T10:00", startAt: "2026-03-08T09:00", resolveAt: "2026-04-08T15:00", owner: "Kepala Instalasi Farmasi (simulasi)", target: "2026-04-30",
      description: "Menyusun daftar obat pulang dengan stok penyangga dan prosedur obat pengganti bila stok kosong, sebelum pasien dipulangkan." },
    { facility: "FAC-RSHB", indicator: "POST_OPEN_ISSUE", latestFinding: "2026-02-26", actionAt: "2026-03-03T10:00", startAt: "2026-03-06T09:00", resolveAt: "2026-04-08T15:00", owner: "Koordinator Layanan Pasien (simulasi)", target: "2026-04-20",
      description: "Menetapkan petugas penghubung untuk menutup kendala pasien setelah pulang dan memantau sampai selesai." },
  ];
  const plantedFindingKeys = new Map<string, Plant>();

  interface Pending { b: Built; indicator: IndicatorVersionRow; category: string; t0: string; slot: string }
  const pendings: Pending[] = [];
  for (const b of built) {
    if (b.status === "expired" || b.status === "scheduled") continue;
    const hits = deriveSignalHits(bank.indicators.filter((i) => i.stage === b.stage), b.facts);
    for (const h of hits) {
      const ind = indById.get(h.indicator_version_id);
      if (!ind) continue;
      pendings.push({ b, indicator: ind, category: h.category, t0: b.endedAt ?? b.startedAt ?? SEED_NOW, slot: h.slot });
    }
  }
  pendings.sort((a, b) => a.t0.localeCompare(b.t0));
  for (const pl of plants) {
    const cand = [...pendings].reverse().find((p) => p.b.episode.facility_id === pl.facility && p.indicator.indicator_id === pl.indicator && p.t0.slice(0, 10) <= pl.latestFinding && p.t0 >= "2026-02-01");
    if (cand) plantedFindingKeys.set(`${cand.b.sessionId}:${cand.indicator.indicator_id}`, pl);
  }

  for (const p of pendings) {
    const e = p.b.episode;
    const key = `${p.b.sessionId}:${p.indicator.indicator_id}`;
    const plant = plantedFindingKeys.get(key) ?? null;
    const ver = verifiers[Math.floor(r.next() * verifiers.length)];
    const age = (new Date(SEED_NOW).getTime() - new Date(p.t0).getTime()) / 86400000;
    // semua keputusan acak diambil di sini (urutan tetap) agar seed deterministik
    const goClarif = plant ? true : r.chance(0.68);
    const answered = plant ? true : r.chance(0.76);
    const outcome: ProofOutcome = plant ? "verified" : goClarif ? (r.chance(0.55) ? "verified" : r.chance(0.6) ? "not_verified" : "inconclusive") : r.chance(0.7) ? "not_verified" : "inconclusive";
    const causes = r.pick([["service_process"], ["administrative"], ["administrative", "service_process"]] as const);
    const wantsAction = plant ? true : outcome === "verified" && r.chance(0.3) && !plants.some((pl) => pl.facility === e.facility_id && pl.indicator === p.indicator.indicator_id);
    const stillIssueFirst = !plant && r.chance(0.2);
    const stall = !plant && age > 6 && r.chance(0.15); // sebagian berhenti di 'sedang ditinjau'
    const gap = (lo: number, hi: number) => r.next() * (hi - lo) + lo;
    const quick = plant || p.b.late >= 0;
    const dFinding = quick ? 0.1 : gap(0.5, 1.5), dClarif = quick ? 0.1 : gap(0.5, 2), dAns = plant ? 1.5 : gap(1, 6), dPropose = plant ? 1 : gap(0.5, 3), dDecide = plant ? 0.5 : gap(0.3, 2), dCause = 0.5;
    const dAction = gap(0.5, 3), dStart = gap(2, 6), dResolve = gap(14, 40), dFu = gap(0.3, 2), dConfirm = gap(2, 10), dRemeasure = gap(10, 20);
    const planted = plant;

    at(p.t0, () => {
      const hit = deriveSignalHits([p.indicator], p.b.facts)[0];
      const res = createFinding(db, SYSTEM_ACTOR, {
        type: "T4", source: "survey_routine", episode_id: e.id, facility_id: e.facility_id, indicator_id: p.indicator.indicator_id,
        title: `${FINDING_LABEL.T4.short}: ${p.indicator.title}`, summary: hit?.note ?? FINDING_LABEL.T4.hint, limit_text: FINDING_LABEL.T4.hint,
        signals: [{ key: `${p.slot}`, label: hit?.note ?? "Jawaban peserta pada survei rutin", weight: 40 }], score: 40, dedupe_key: `T4:${p.b.sessionId}:${p.indicator.indicator_id}`, category: p.category,
      });
      if (!res.created) return;
      srIns.run(`SRQ-${pad(++srN, 4)}`, e.participant_id, e.id, e.facility_id, p.category, CATEGORY_TEXT[p.category] ?? hit?.note ?? "Laporan peserta pada survei rutin.", res.caseId, res.findingId, "self", p.t0);
      const fid = res.findingId;
      const state: { fid: string; caseId: string; clarifId: string | null; proposalId: number | null } = { fid, caseId: res.caseId, clarifId: null, proposalId: null };
      const tStart = addHours(p.t0, dFinding * 24);
      if (p.b.late === 0) return; // tetap 'Sinyal': baru masuk
      at(tStart, () => { startReview(db, ver, fid); srSet(fid, "in_review"); });
      if (stall || p.b.late === 1) return;
      const tClarif = addHours(tStart, dClarif * 24);
      let tAfter = tClarif;
      if (goClarif || p.b.late === 2) {
        const due = addDays(tClarif, 7);
        at(tClarif, () => {
          state.clarifId = sendClarification(db, ver, {
            findingId: fid, issue: `Mohon penjelasan faskes mengenai: ${p.indicator.title.toLowerCase()}, terkait laporan peserta pada episode ini.`, requestedDocs: ["catatan pelayanan terkait", "prosedur yang berlaku"], minimalRef: "Cukup rujukan pada catatan yang relevan.", dueAt: due.slice(0, 16),
          });
          srSet(fid, "clarification");
        });
        if (p.b.late === 2) return; // klarifikasi terkirim, tenggat belum lewat: 'Menunggu klarifikasi'
        if (answered) {
          tAfter = addHours(tClarif, dAns * 24);
          at(tAfter, () => { if (state.clarifId) respondClarification(db, faskesOf(e.facility_id), state.clarifId, "Faskes telah memeriksa catatan terkait dan memberikan penjelasan beserta rujukan dokumen."); });
        } else {
          tAfter = addHours(addDays(due, 1), 1);
          at(tAfter, () => { lapseOverdueClarifications(db); });
        }
      }
      const tPropose = addHours(tAfter, dPropose * 24);
      const tDecide = addHours(tPropose, dDecide * 24);
      at(tPropose, () => {
        if (outcome === "verified") {
          db.prepare("INSERT INTO evidence_links (id, finding_id, case_id, evidence_id, document_id, extraction_id, direction, quote, page, note, linked_by, linked_at) VALUES (?,?,?,NULL,NULL,NULL,'supports',?,NULL,?,?,?)").run(
            `EL-Q-${fid}`, fid, state.caseId, "Catatan serah obat/layanan (sintetis) memperlihatkan layanan belum terpenuhi sepenuhnya.", "Bukti sintetis untuk demo; bukan dokumen asli.", ver.id, tPropose,
          );
          appendAudit(db, { actor: ver.id, actor_role: ver.role, action: "bukti_ditautkan", entity: "finding", entity_id: fid, detail: { arah: "mendukung" } });
        }
        state.proposalId = proposeProof(db, ver, fid, outcome, outcome === "verified" ? "Bukti pelaksanaan mendukung laporan peserta; hak jawab faskes terpenuhi." : outcome === "not_verified" ? "Pencarian bukti tidak menunjukkan masalah; indikasi gugur." : "Pencarian bukti sudah dilakukan dan tidak cukup untuk menyimpulkan.");
      });
      at(tDecide, () => {
        if (state.proposalId === null) return;
        decideProof(db, reviewer, state.proposalId, true, "Disetujui berdasarkan bukti yang ditautkan.");
        srSet(fid, outcome === "verified" ? "in_review" : "closed");
      });
      if (outcome !== "verified") {
        at(addHours(tDecide, 24), () => { try { closeCase(db, reviewer, state.caseId, "Seluruh temuan pada kasus ini berstatus akhir; tidak ada tindakan lanjutan."); } catch (err) { if (!(err instanceof DomainError)) throw err; } });
        return;
      }
      const tCause = addHours(tDecide, dCause * 24);
      at(tCause, () => { setCauses(db, reviewer, fid, [...causes], "Analisis penyebab berdasarkan bukti yang tertaut dan jawaban klarifikasi faskes."); });
      if (!wantsAction) return;
      const tAct = planted ? planted.actionAt : addHours(tCause, dAction * 24);
      let actionId: string | null = null;
      const fas = faskesOf(e.facility_id);
      at(tAct, () => {
        actionId = createAction(db, fas, {
          findingId: fid, indicatorId: p.indicator.indicator_id,
          description: planted?.description ?? `Perbaikan proses pada ${p.indicator.title.toLowerCase()} agar layanan standar diterima sebelum pasien pulang.`,
          owner: planted?.owner ?? "Penanggung jawab unit terkait (simulasi)", targetDate: planted?.target ?? addDays(tAct, 45).slice(0, 10),
          remeasurePlan: "Ukur ulang lewat survei rutin pada indikator yang sama selama 90 hari.",
        });
        srSet(fid, "action");
      });
      const tStartA = planted ? planted.startAt : addHours(tAct, dStart * 24);
      at(tStartA, () => { if (actionId) startAction(db, fas, actionId); });
      const tRes = planted ? planted.resolveAt : addHours(tStartA, dResolve * 24);
      const round = (tResolved: string, attempt: number) => {
        at(tResolved, () => { if (actionId) resolveAction(db, fas, actionId, attempt === 0 ? "Perbaikan diterapkan sesuai rencana dan mulai berjalan." : "Perbaikan tambahan diterapkan setelah kendala dilaporkan masih ada."); });
        const tFu = addHours(tResolved, dFu * 24);
        let fuIds: string[] = [];
        at(tFu, () => { if (actionId) fuIds = requestFollowUp(db, ver, actionId, e.participant_id, addDays(tFu, 14).slice(0, 16)); });
        const tConf = addHours(tFu, dConfirm * 24);
        const still = attempt === 0 && stillIssueFirst;
        at(tConf, () => { if (fuIds[0]) completeFollowUp(db, participantOf(e.participant_id), fuIds[0], still ? "still_issue" : "resolved", still ? "Kendala masih ada." : "Kendala sudah selesai."); });
        if (still) { round(addHours(tConf, 21 * 24), 1); return; }
        at(addHours(tFu, dRemeasure * 24), () => {
          if (fuIds[1]) completeFollowUp(db, ver, fuIds[1], "resolved", "Pengukuran ulang dijadwalkan dan dicatat.");
          srSet(fid, "resolved");
        });
        at(addHours(tFu, dRemeasure * 24 + 24), () => { try { closeCase(db, reviewer, state.caseId, "Temuan terbukti, tindakan perbaikan selesai dan dikonfirmasi peserta."); } catch (err) { if (!(err instanceof DomainError)) throw err; } });
      };
      round(tRes, 0);
    });
  }

  const skipped: string[] = [];
  // jalankan menurut waktu; peristiwa baru yang dijadwalkan di dalam peristiwa disisipkan ke antrean
  while (queue.length) {
    queue.sort((a, b) => a.t.localeCompare(b.t) || a.seq - b.seq);
    const ev = queue.shift() as Ev;
    setNow(ev.t);
    try {
      ev.run();
    } catch (err) {
      // langkah yang ditolak aturan domain tidak boleh menggagalkan seed; alur turunannya tidak akan terjadi. Jumlahnya dicatat agar tes dapat menjaga agar tetap kecil.
      if (!(err instanceof DomainError) && !(err instanceof AuthError) && !(err instanceof TransitionError)) throw err;
      skipped.push(`${ev.t} ${err.message}`);
    }
  }
  setNow(SEED_NOW);
  setMeta(db, "seed:quality:skipped", String(skipped.length));
  if (process.env.SEHATI_SEED_DEBUG) console.warn(skipped);

  /* ---------- Permintaan bantuan peserta (tidak melalui temuan) ---------- */
  const helpIns = db.prepare("INSERT INTO help_requests (id, session_id, participant_id, episode_id, reason, status, channel, created_at, handled_by, handled_at) VALUES (?,?,?,?,?,?,?,?,?,?)");
  const helpers = built.filter((b) => b.status === "completed" || b.status === "partial").slice(0, 200);
  for (let i = 0; i < 9; i++) {
    const b = helpers[Math.floor(r.next() * helpers.length)];
    const created = b.endedAt ?? b.startedAt ?? SEED_NOW;
    const handled = i < 7 && addHours(created, r.int(2, 40)) <= SEED_NOW ? addHours(created, r.int(2, 40)) : null;
    helpIns.run(`HLPQ-${pad(i + 1, 3)}`, b.sessionId, b.episode.participant_id, b.episode.id, "Peserta meminta dihubungi petugas terkait kendala setelah pulang.", handled ? "handled" : "open", "app", created, handled ? "verifikator:U-VER-1" : null, handled);
  }
}
