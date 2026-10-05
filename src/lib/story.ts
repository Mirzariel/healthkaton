import type Database from "better-sqlite3";
import { verifyChain } from "./audit";
import { fmtDate, fmtDateTime, rupiah, rupiahShort } from "./dates";
import { buildCtx } from "./engine/context";
import { reviewClaim } from "./engine/pipeline";
import { checkServices } from "./engine/stages";
import { loadDataset } from "./db";
import { getHero, getStats } from "./queries";
import type { Modus, Stage } from "./types";

export interface StoryData {
  person: { name: string; first: string; age: number; hospital: string; dx: string; admit: string; discharge: string; days: number };
  events: { label: string; when: string; flagged: boolean }[];
  claims: { key: "paid" | "dup" | "split"; no: string; amount: string; status: string; note: string; modus: Modus }[];
  stages: Stage[];
  phantom: { before: number; after: number; item: string; date: string };
  rows: { name: string; meta: string; state: "tersedia" | "kurang" | "bertentangan"; reason: string }[];
  stats: { cases: number; decided: number; avgDays: string; atRisk: string; chainOk: boolean; chainTotal: number; claims: number; cleared: number };
}

export function getStoryData(db: Database.Database): StoryData {
  const h = getHero(db);
  const ds = loadDataset(db);
  const ctx = buildCtx(ds);
  const paid = h.claims.paid;
  const bronko = h.servicesA.find((s) => s.code === "BRONKO")!;
  // Skor "sebelum" dihitung tanpa jawaban peserta untuk bronkoskopi, agar cerita tidak bergantung pada kondisi demo.
  const noAnswer = ds.confirmations.filter((c) => c.service_id !== bronko.id);
  const base = reviewClaim(buildCtx({ ...ds, confirmations: noAnswer }), paid).findings.find((f) => f.modus === "phantom")?.score ?? 0;
  const ctx2 = buildCtx({
    ...ds,
    confirmations: [
      ...noAnswer,
      { id: "K-story", service_id: bronko.id, participant_id: h.participant.id, answer: "tidak_sesuai", note: "", at: "2026-10-05T10:00" },
    ],
  });
  const after = reviewClaim(ctx2, paid).findings.find((f) => f.modus === "phantom")?.score ?? base;
  const stats = getStats(db);
  const chain = verifyChain(db);
  const dup = reviewClaim(ctx, h.claims.dup, "open");
  const birth = new Date(h.participant.dob).getFullYear();
  const checks = new Map(checkServices(ctx, paid).map((c) => [c.service_id, c]));
  const procs = h.servicesA.filter((s) => s.code !== "KMR" && s.code !== "KON").sort((a, b) => a.performed_at.localeCompare(b.performed_at));
  const claimCount = (db.prepare("SELECT COUNT(*) n FROM claims").get() as { n: number }).n;
  return {
    person: {
      name: h.participant.name,
      first: h.participant.name.split(" ")[0],
      days: Math.max(1, Math.round((new Date(h.episodeA.discharge_at).getTime() - new Date(h.episodeA.admit_at).getTime()) / 86400000)),
      age: 2026 - birth,
      hospital: h.episodeA.hospital,
      dx: h.episodeA.dx_text,
      admit: fmtDate(h.episodeA.admit_at),
      discharge: fmtDate(h.episodeA.discharge_at),
    },
    events: [
      { label: "Masuk rawat inap", when: fmtDateTime(h.episodeA.admit_at), flagged: false },
      ...procs.map((s) => ({ label: s.name, when: fmtDateTime(s.performed_at), flagged: checks.get(s.id)!.state !== "tersedia" })),
      { label: "Pulang", when: fmtDateTime(h.episodeA.discharge_at), flagged: false },
    ],
    claims: [
      { key: "paid", no: h.claims.paid.claim_no, amount: rupiah(h.claims.paid.amount), status: `Dibayar ${fmtDate(h.claims.paid.paid_at)}`, note: "Memuat tindakan tanpa lembar bukti.", modus: "phantom" },
      { key: "dup", no: h.claims.dup.claim_no, amount: rupiah(h.claims.dup.amount), status: `Diajukan ${fmtDate(h.claims.dup.submitted_at)}`, note: "Perawatan sama, nilai sama persis.", modus: "repeat_billing" },
      { key: "split", no: h.claims.split.claim_no, amount: rupiah(h.claims.split.amount), status: `Diajukan ${fmtDate(h.claims.split.submitted_at)}`, note: `Lanjutan ${fmtDate(h.episodeB.admit_at)}, hari pasien pulang. Ditagih terpisah.`, modus: "fragmentation" },
    ],
    stages: dup.stages,
    phantom: { before: base, after, item: bronko.name, date: fmtDate(bronko.performed_at) },
    rows: h.servicesA
      .filter((s) => s.code !== "KMR")
      .slice(0, 5)
      .map((s) => {
        const c = checks.get(s.id)!;
        return { name: s.name, meta: rupiah(s.amount), state: c.state, reason: c.state === "tersedia" ? "Lembar tindakan konsisten." : c.reasons[0] };
      }),
    stats: {
      cases: stats.total,
      decided: stats.decided,
      avgDays: stats.avgDecisionH ? (stats.avgDecisionH / 24).toFixed(1) : "-",
      atRisk: rupiahShort(stats.amountAtRisk),
      chainOk: chain.ok,
      chainTotal: chain.total,
      claims: claimCount,
      cleared: stats.lookalikeCleared,
    },
  };
}
