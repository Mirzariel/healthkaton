import { SVC, dxByCode, familyOfGroup } from "../catalog";
import { dayOf, ts } from "../dates";
import type { Claim, ServiceCheck, Stage } from "../types";
import type { Ctx } from "./context";

/** Tahap 1: kepesertaan (pendukung). */
export function stageMembership(ctx: Ctx, claim: Claim): Stage {
  const ep = ctx.ep.get(claim.episode_id)!;
  const p = ctx.part.get(ep.participant_id)!;
  const notes: string[] = [];
  let status: Stage["status"] = "ok";
  const admit = dayOf(ep.admit_at);
  if (admit < p.coverage_start) {
    status = "fail";
    notes.push(`Perawatan mulai ${admit}, sebelum penjaminan aktif (${p.coverage_start}).`);
  } else if (p.coverage_end && admit > p.coverage_end) {
    status = "fail";
    notes.push(`Perawatan mulai ${admit}, setelah penjaminan berakhir (${p.coverage_end}).`);
  } else if (p.coverage_end && dayOf(ep.discharge_at) > p.coverage_end) {
    status = "warn";
    notes.push(`Penjaminan berakhir ${p.coverage_end}, sebelum pasien pulang (${dayOf(ep.discharge_at)}).`);
  }
  if (status === "ok") notes.push("Penjaminan aktif pada seluruh periode perawatan.");
  return { key: "kepesertaan", label: "Kepesertaan", status, notes };
}

/** Pencocokan layanan dengan bukti pelaksanaan: tersedia / kurang / bertentangan. */
export function checkServices(ctx: Ctx, claim: Claim): ServiceCheck[] {
  const ep = ctx.ep.get(claim.episode_id)!;
  const services = ctx.servicesByEpisode.get(ep.id) ?? [];
  const evidence = ctx.evidenceByEpisode.get(ep.id) ?? [];
  const out: ServiceCheck[] = [];
  const lo = ts(ep.admit_at) - 2 * 3600000;
  const hi = ts(ep.discharge_at) + 6 * 3600000;
  for (const s of services) {
    const info = SVC[s.code];
    if (!info?.needsRecord) {
      out.push({ service_id: s.id, state: "tersedia", reasons: ["Tidak memerlukan lembar tindakan."] });
      continue;
    }
    const rec = evidence.filter((e) => e.type === "lembar_tindakan" && e.service_id === s.id);
    if (rec.length === 0) {
      out.push({ service_id: s.id, state: "kurang", reasons: ["Tidak ada lembar tindakan yang terkait dengan layanan ini."] });
      continue;
    }
    const reasons: string[] = [];
    for (const r of rec) {
      const t = ts(r.recorded_at);
      if (t < lo || t > hi) reasons.push(`Waktu pencatatan (${r.recorded_at.replace("T", " ")}) berada di luar rentang perawatan.`);
      if (r.performer !== s.performer) reasons.push(`Pelaksana pada catatan (${r.performer}) berbeda dari yang ditagihkan (${s.performer}).`);
    }
    out.push(
      reasons.length
        ? { service_id: s.id, state: "bertentangan", reasons }
        : { service_id: s.id, state: "tersedia", reasons: ["Lembar tindakan konsisten dengan tagihan."] },
    );
  }
  return out;
}

/** Tahap 2: dokumentasi pelayanan. */
export function stageDocumentation(checks: ServiceCheck[]): Stage {
  const kurang = checks.filter((c) => c.state === "kurang").length;
  const bert = checks.filter((c) => c.state === "bertentangan").length;
  const notes: string[] = [];
  let status: Stage["status"] = "ok";
  if (bert) {
    status = "fail";
    notes.push(`${bert} layanan memiliki bukti yang bertentangan dengan tagihan.`);
  }
  if (kurang) {
    if (status === "ok") status = "warn";
    notes.push(`${kurang} layanan belum memiliki bukti pelaksanaan (belum tentu tidak dilakukan).`);
  }
  if (status === "ok") notes.push("Seluruh layanan yang membutuhkan bukti sudah terdokumentasi.");
  return { key: "dokumentasi", label: "Dokumentasi", status, notes };
}

/** Tahap 3: koding (aturan sederhana pada katalog simulasi). */
export function stageCoding(ctx: Ctx, claim: Claim): Stage {
  const ep = ctx.ep.get(claim.episode_id)!;
  const dx = dxByCode(ep.dx_code);
  const notes: string[] = [];
  let status: Stage["status"] = "ok";
  if (!dx) {
    return { key: "koding", label: "Koding", status: "warn", notes: [`Kode diagnosis ${ep.dx_code} tidak ada pada katalog simulasi.`] };
  }
  if (familyOfGroup(claim.group_code) !== dx.family) {
    status = "fail";
    notes.push(`Grup tarif ${claim.group_code} tidak sesuai dengan diagnosis ${dx.code} (${dx.text}).`);
  }
  for (const s of ctx.servicesByEpisode.get(ep.id) ?? []) {
    const info = SVC[s.code];
    if (info && info.families !== "*" && !info.families.includes(dx.family)) {
      if (status === "ok") status = "warn";
      notes.push(`Layanan ${s.code} (${s.name}) tidak lazim untuk diagnosis ${dx.code}.`);
    }
  }
  if (status === "ok") notes.push("Kode, grup tarif, dan layanan konsisten dengan diagnosis.");
  return { key: "koding", label: "Koding", status, notes };
}
