import type Database from "better-sqlite3";
import { appendAudit } from "./audit";
import { DX, SVC, dxByCode, groupFor } from "./catalog";
import { addHours, ts } from "./dates";
import { recomputeParticipant } from "./db";

export const CSV_COLUMNS = [
  "participant_id", "participant_name", "coverage_start", "coverage_end",
  "episode_id", "hospital", "kind", "admit_at", "discharge_at", "dx_code",
  "claim_no", "claim_amount", "claim_status",
  "service_code", "performed_at", "performer", "qty", "has_record",
] as const;

export const CSV_TEMPLATE =
  CSV_COLUMNS.join(",") + "\n" +
  [
    "IMP-P1,Contoh Peserta Satu,2022-01-01,,IMP-E1,RS Contoh (simulasi),RITL,2026-09-01T10:00,2026-09-04T11:00,J18.9,KLM-IMP-0001,5200000,draft,KMR,2026-09-01T10:00,dr. Contoh,3,tidak",
    "IMP-P1,Contoh Peserta Satu,2022-01-01,,IMP-E1,RS Contoh (simulasi),RITL,2026-09-01T10:00,2026-09-04T11:00,J18.9,KLM-IMP-0001,5200000,draft,RONTGEN,2026-09-01T12:00,dr. Contoh,1,ya",
    "IMP-P1,Contoh Peserta Satu,2022-01-01,,IMP-E1,RS Contoh (simulasi),RITL,2026-09-01T10:00,2026-09-04T11:00,J18.9,KLM-IMP-0001,5200000,draft,BRONKO,2026-09-02T09:00,dr. Contoh,1,tidak",
  ].join("\n") + "\n";

/** Pemecah CSV sederhana yang mendukung tanda kutip ganda. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(cur);
      cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

export interface ImportResult {
  ok: boolean;
  errors: { line: number; message: string }[];
  imported: { participants: number; episodes: number; services: number; claims: number };
  changes: string[];
}

const ISO = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;
const MAX_ROWS = 5000;

export function importCsv(db: Database.Database, text: string): ImportResult {
  const empty = { participants: 0, episodes: 0, services: 0, claims: 0 };
  const fail = (errors: ImportResult["errors"]): ImportResult => ({ ok: false, errors, imported: empty, changes: [] });
  const rows = parseCsv(text);
  if (rows.length === 0) return fail([{ line: 1, message: "Berkas kosong." }]);
  const header = rows[0].map((h) => h.trim());
  const missing = CSV_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) return fail([{ line: 1, message: `Kolom wajib tidak ditemukan: ${missing.join(", ")}.` }]);
  if (rows.length - 1 > MAX_ROWS) return fail([{ line: 1, message: `Maksimal ${MAX_ROWS} baris data.` }]);
  const idx = Object.fromEntries(CSV_COLUMNS.map((c) => [c, header.indexOf(c)]));
  const errors: ImportResult["errors"] = [];
  type Rec = Record<(typeof CSV_COLUMNS)[number], string>;
  const recs: { line: number; r: Rec }[] = [];
  rows.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const r = Object.fromEntries(CSV_COLUMNS.map((c) => [c, (cells[idx[c]] ?? "").trim()])) as Rec;
    const err = (m: string) => errors.push({ line, message: m });
    for (const c of ["participant_id", "participant_name", "coverage_start", "episode_id", "hospital", "kind", "admit_at", "discharge_at", "dx_code", "claim_no", "claim_amount", "claim_status", "service_code", "performed_at", "performer", "qty", "has_record"] as const) {
      if (!r[c]) err(`Kolom ${c} kosong.`);
    }
    if (r.kind && !["RJTL", "RITL"].includes(r.kind)) err(`kind harus RJTL atau RITL (ditemukan "${r.kind}").`);
    for (const c of ["coverage_start", "admit_at", "discharge_at", "performed_at"] as const) {
      if (r[c] && (!ISO.test(r[c]) || Number.isNaN(ts(r[c])))) err(`${c} bukan tanggal valid (format YYYY-MM-DD atau YYYY-MM-DDTHH:MM).`);
    }
    if (r.coverage_end && (!ISO.test(r.coverage_end) || Number.isNaN(ts(r.coverage_end)))) err("coverage_end bukan tanggal valid.");
    if (r.dx_code && !dxByCode(r.dx_code)) err(`dx_code ${r.dx_code} tidak ada pada katalog simulasi (${DX.map((d) => d.code).join(", ")}).`);
    if (r.service_code && !SVC[r.service_code]) err(`service_code ${r.service_code} tidak ada pada katalog simulasi.`);
    if (r.claim_status && !["draft", "submitted", "paid"].includes(r.claim_status)) err("claim_status harus draft, submitted, atau paid.");
    if (r.claim_amount && !(Number(r.claim_amount) > 0)) err("claim_amount harus angka positif.");
    if (r.qty && !(Number.isInteger(Number(r.qty)) && Number(r.qty) > 0)) err("qty harus bilangan bulat positif.");
    if (r.has_record && !["ya", "tidak"].includes(r.has_record)) err('has_record harus "ya" atau "tidak".');
    if (r.admit_at && r.discharge_at && ts(r.discharge_at) < ts(r.admit_at)) err("discharge_at lebih awal dari admit_at.");
    recs.push({ line, r });
  });
  if (errors.length) return fail(errors.slice(0, 50));

  const existingE = new Set((db.prepare("SELECT id FROM episodes").all() as { id: string }[]).map((x) => x.id));
  for (const { line, r } of recs) {
    if (existingE.has(r.episode_id)) errors.push({ line, message: `episode_id ${r.episode_id} sudah ada di basis data.` });
  }
  if (errors.length) return fail(errors.slice(0, 50));

  const parts = new Set<string>();
  const eps = new Set<string>();
  const claims = new Set<string>();
  let services = 0;
  db.transaction(() => {
    const nS = (db.prepare("SELECT COUNT(*) n FROM services").get() as { n: number }).n;
    const nV = (db.prepare("SELECT COUNT(*) n FROM evidence").get() as { n: number }).n;
    const nC = (db.prepare("SELECT COUNT(*) n FROM claims").get() as { n: number }).n;
    let si = nS, vi = nV, ci = nC;
    for (const { r } of recs) {
      const dx = dxByCode(r.dx_code)!;
      if (!parts.has(r.participant_id)) {
        db.prepare("INSERT OR IGNORE INTO participants (id,name,nik,dob,coverage_start,coverage_end,faskes1) VALUES (?,?,?,?,?,?,?)").run(
          r.participant_id, r.participant_name, "impor-simulasi", "1980-01-01", r.coverage_start.slice(0, 10), r.coverage_end ? r.coverage_end.slice(0, 10) : null, "-",
        );
        parts.add(r.participant_id);
      }
      if (!eps.has(r.episode_id)) {
        db.prepare("INSERT INTO episodes (id,participant_id,hospital,kind,admit_at,discharge_at,dx_code,dx_text,group_code) VALUES (?,?,?,?,?,?,?,?,?)").run(
          r.episode_id, r.participant_id, r.hospital, r.kind, r.admit_at.length === 10 ? r.admit_at + "T08:00" : r.admit_at, r.discharge_at.length === 10 ? r.discharge_at + "T12:00" : r.discharge_at, dx.code, dx.text, groupFor(dx.family, 2),
        );
        eps.add(r.episode_id);
      }
      if (!claims.has(r.claim_no)) {
        db.prepare("INSERT INTO claims (id,claim_no,episode_id,group_code,amount,status,submitted_at,paid_at,hospital) VALUES (?,?,?,?,?,?,?,?,?)").run(
          `C-IMP-${++ci}`, r.claim_no, r.episode_id, groupFor(dx.family, 2), Number(r.claim_amount), r.claim_status,
          r.claim_status === "draft" ? null : r.discharge_at.slice(0, 10) + "T10:00", r.claim_status === "paid" ? r.discharge_at.slice(0, 10) + "T10:00" : null, r.hospital,
        );
        claims.add(r.claim_no);
      }
      const info = SVC[r.service_code];
      const sid = `S-IMP-${++si}`;
      const when = r.performed_at.length === 10 ? r.performed_at + "T09:00" : r.performed_at;
      db.prepare("INSERT INTO services (id,episode_id,code,name,performed_at,performer,qty,amount) VALUES (?,?,?,?,?,?,?,?)").run(
        sid, r.episode_id, r.service_code, info.name, when, r.performer, Number(r.qty), info.price * Number(r.qty),
      );
      services++;
      if (r.has_record === "ya") {
        db.prepare("INSERT INTO evidence (id,episode_id,service_id,type,recorded_at,performer,summary) VALUES (?,?,?,?,?,?,?)").run(
          `V-IMP-${++vi}`, r.episode_id, sid, "lembar_tindakan", addHours(when, 0.25), r.performer, `Lembar tindakan ${info.name} (impor).`,
        );
      }
    }
    appendAudit(db, { actor: "sistem", action: "impor_csv", entity: "import", entity_id: `IMP-${Date.now() % 1000000}`, detail: { episode: eps.size, klaim: claims.size, layanan: services } });
  })();
  const changes: string[] = [];
  for (const p of parts) changes.push(...recomputeParticipant(db, p));
  return { ok: true, errors: [], imported: { participants: parts.size, episodes: eps.size, services, claims: claims.size }, changes };
}
