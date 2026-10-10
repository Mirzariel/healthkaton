import type Database from "better-sqlite3";
import { appendAudit, sha256 } from "../audit";
import { assertCan, type Principal } from "../auth/principal";
import { SYSTEM_ACTOR, syncClaimSignals } from "../cases/core";
import { SVC } from "../catalog";
import { recomputeCards } from "../cards/compute";
import { nowPrecise } from "../clock";
import { json, nextId } from "../db";
import { DomainError, idempotent } from "../idem";
import { syncPendingTriage } from "../pending/triage";
import { RegistryError, applyStandardImport, validateStandardImport } from "../standards/registry";
import { parseCsv } from "./csv";
import { KIND_DEFS, IMPORT_KINDS, type ImportKind } from "./formats";

/* Impor terdokumentasi: pratinjau → validasi per baris → deduplikasi → terapkan (idempoten) → audit.
   Pratinjau tidak menulis data domain. Penerapan memvalidasi ULANG terhadap keadaan basis data saat itu. Tidak ada pembayaran, koreksi, atau sanksi dari impor. */

export const MAX_IMPORT_BYTES = 1_000_000;
export const MAX_IMPORT_ROWS = 5000;

export interface RowError { line: number; field: string | null; message: string }
export interface RowResult { line: number; outcome: "new" | "duplicate" | "error"; errors: RowError[]; label: string; note?: string }
export interface Analysis {
  kind: ImportKind;
  total: number;
  fresh: number;
  duplicate: number;
  errors: number;
  rows: RowResult[];
  fileErrors: RowError[];
  warnings: string[];
  /** Operasi tulis siap pakai (hanya baris berstatus new). */
  apply: (() => ApplyResult) | null;
}
export interface ApplyResult { inserted: Record<string, number>; notes: string[] }

function validDate(s: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return false;
  return m[4] === undefined || (Number(m[4]) <= 23 && Number(m[5]) <= 59);
}
const normDt = (s: string) => (s.length === 10 ? s + "T00:00" : s);
const clean = (s: string | undefined) => (s ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim();
const intOf = (s: string) => (/^\d+$/.test(s) ? Number(s) : NaN);

interface CsvCtx { kind: ImportKind; header: string[]; idx: (name: string) => number }

function checkHeader(kind: ImportKind, header: string[]): RowError[] {
  const errs: RowError[] = [];
  const need = KIND_DEFS[kind].columns.filter((c) => c.required === true).map((c) => c.name);
  const known = new Set(KIND_DEFS[kind].columns.map((c) => c.name));
  for (const n of need) if (!header.includes(n)) errs.push({ line: 1, field: n, message: `Kolom wajib "${n}" tidak ada pada baris judul.` });
  for (const h of header) if (h && !known.has(h)) errs.push({ line: 1, field: h, message: `Kolom "${h}" tidak dikenal. Gunakan templat resmi.` });
  const seen = new Set<string>();
  for (const h of header) { if (seen.has(h)) errs.push({ line: 1, field: h, message: `Kolom "${h}" muncul lebih dari sekali.` }); seen.add(h); }
  return errs;
}

type Cell = (name: string) => string;

/* ---------------- episode_klaim ---------------- */
function analyzeEpisodeKlaim(db: Database.Database, ctx: CsvCtx, lines: { line: number; cells: string[] }[]): Analysis {
  const facByCode = new Map((db.prepare("SELECT id, code, name FROM facilities").all() as { id: string; code: string; name: string }[]).map((f) => [f.code, f]));
  const existing = new Map((db.prepare("SELECT c.id, c.claim_no, c.facility_id, c.amount, c.status, c.submitted_at, c.paid_at, c.group_code, e.admit_at, e.discharge_at, e.dx_code, e.kind FROM claims c JOIN episodes e ON e.id = c.episode_id").all() as Record<string, unknown>[]).map((r) => [String(r.claim_no), r]));
  const seenInFile = new Map<string, number>();
  const rows: RowResult[] = [];
  type Ok = { line: number; v: Record<string, string> };
  const ok: Ok[] = [];
  for (const { line, cells } of lines) {
    const get: Cell = (n) => clean(cells[ctx.idx(n)]);
    const errs: RowError[] = [];
    const err = (field: string, message: string) => errs.push({ line, field, message });
    const v: Record<string, string> = Object.fromEntries(KIND_DEFS.episode_klaim.columns.map((c) => [c.name, get(c.name)]));
    if (!v.claim_no || v.claim_no.length > 40 || !/^[A-Za-z0-9._\-/]+$/.test(v.claim_no)) err("claim_no", "Nomor klaim wajib, hanya huruf/angka/. _ - /, maksimal 40 karakter.");
    const fac = facByCode.get(v.facility_code);
    if (!fac) err("facility_code", `Kode faskes "${v.facility_code}" tidak terdaftar.`);
    if (!/^[A-Z0-9][A-Z0-9-]{2,19}$/.test(v.participant_pseudonym)) err("participant_pseudonym", "Pseudonim harus 3–20 karakter huruf besar/angka/strip.");
    if (!["RJTL", "RITL"].includes(v.kind)) err("kind", "Isi RJTL atau RITL.");
    if (!validDate(v.admit_at)) err("admit_at", "Tanggal masuk tidak valid (YYYY-MM-DD atau YYYY-MM-DDTHH:MM).");
    if (!validDate(v.discharge_at)) err("discharge_at", "Tanggal pulang tidak valid.");
    else if (validDate(v.admit_at) && normDt(v.discharge_at) < normDt(v.admit_at)) err("discharge_at", "Tanggal pulang tidak boleh sebelum tanggal masuk.");
    if (!v.dx_code) err("dx_code", "Kode diagnosis wajib.");
    if (!v.group_code) err("group_code", "Grup tarif wajib.");
    const amount = intOf(v.amount);
    if (!Number.isFinite(amount) || amount <= 0) err("amount", "Nilai klaim harus bilangan bulat lebih dari 0.");
    if (!["draft", "submitted", "paid", "pending", "returned"].includes(v.status)) err("status", "Status harus draft, submitted, paid, pending, atau returned.");
    if (v.status !== "draft" && !validDate(v.submitted_at)) err("submitted_at", "Tanggal pengajuan wajib dan harus valid bila status bukan draft.");
    if (v.status === "draft" && v.submitted_at) err("submitted_at", "Klaim draft tidak boleh punya tanggal pengajuan.");
    if (v.status === "paid" && !validDate(v.paid_at)) err("paid_at", "Tanggal bayar wajib dan harus valid bila status paid.");
    if (v.status !== "paid" && v.paid_at) err("paid_at", "Tanggal bayar hanya untuk status paid.");
    if (v.paid_at && v.submitted_at && validDate(v.paid_at) && validDate(v.submitted_at) && normDt(v.paid_at) < normDt(v.submitted_at)) err("paid_at", "Tanggal bayar tidak boleh sebelum tanggal pengajuan.");
    if (v.dx_code && !v.dx_text && !/^[A-Z]\d{2}(\.\d+)?$/.test(v.dx_code)) err("dx_text", "Kode diagnosis tidak lazim; isi uraian diagnosis.");
    if (v.claim_no) {
      const prevLine = seenInFile.get(v.claim_no);
      if (prevLine) err("claim_no", `Nomor klaim sama dengan baris ${prevLine} pada berkas ini.`);
      else seenInFile.set(v.claim_no, line);
    }
    const label = v.claim_no || `baris ${line}`;
    if (errs.length) { rows.push({ line, outcome: "error", errors: errs, label }); continue; }
    const ex = existing.get(v.claim_no);
    if (ex) {
      const same = ex.facility_id === fac!.id && Number(ex.amount) === amount && ex.status === v.status && String(ex.submitted_at ?? "") === (v.submitted_at ? normDt(v.submitted_at) : "") && String(ex.paid_at ?? "") === (v.paid_at ? normDt(v.paid_at) : "") && ex.group_code === v.group_code && ex.dx_code === v.dx_code && ex.kind === v.kind && String(ex.admit_at) === normDt(v.admit_at) && String(ex.discharge_at) === normDt(v.discharge_at);
      if (same) rows.push({ line, outcome: "duplicate", errors: [], label, note: "Sudah ada dengan isi identik; dilewati." });
      else rows.push({ line, outcome: "error", errors: [{ line, field: "claim_no", message: "Nomor klaim sudah ada dengan data berbeda (konflik). Impor tidak menimpa klaim yang ada." }], label });
      continue;
    }
    rows.push({ line, outcome: "new", errors: [], label });
    ok.push({ line, v });
  }
  const apply = () => {
    const n = { klaim: 0, episode: 0, peserta: 0 };
    for (const { v } of ok) {
      const fac = facByCode.get(v.facility_code)!;
      let part = db.prepare("SELECT id FROM participants WHERE pseudonym = ?").get(v.participant_pseudonym) as { id: string } | undefined;
      if (!part) {
        const id = nextId(db, "PI");
        db.prepare("INSERT INTO participants (id, pseudonym, name, nik, dob, coverage_start, coverage_end, faskes1) VALUES (?,?,NULL,NULL,NULL,NULL,NULL,NULL)").run(id, v.participant_pseudonym);
        part = { id };
        n.peserta++;
      }
      const admit = normDt(v.admit_at);
      let ep = db.prepare("SELECT id FROM episodes WHERE participant_id = ? AND facility_id = ? AND admit_at = ?").get(part.id, fac.id, admit) as { id: string } | undefined;
      if (!ep) {
        const id = nextId(db, "EPI");
        const dx = v.dx_text || v.dx_code;
        db.prepare("INSERT INTO episodes (id, participant_id, facility_id, hospital, kind, care_type, phase, admit_at, discharge_at, dx_code, dx_text, group_code, context_json) VALUES (?,?,?,?,?,?, 'closed', ?,?,?,?,?, '{}')").run(
          id, part.id, fac.id, fac.name, v.kind, v.kind === "RITL" ? "inpatient" : "outpatient", admit, normDt(v.discharge_at), v.dx_code, dx, v.group_code,
        );
        ep = { id };
        n.episode++;
      }
      const cid = nextId(db, "CLI");
      db.prepare("INSERT INTO claims (id, claim_no, episode_id, facility_id, group_code, amount, status, submitted_at, paid_at, hospital) VALUES (?,?,?,?,?,?,?,?,?,?)").run(
        cid, v.claim_no, ep.id, fac.id, v.group_code, Number(v.amount), v.status, v.submitted_at ? normDt(v.submitted_at) : null, v.paid_at ? normDt(v.paid_at) : null, fac.name,
      );
      n.klaim++;
    }
    return { inserted: n, notes: [] };
  };
  const total = lines.length;
  const fresh = rows.filter((r) => r.outcome === "new").length;
  return { kind: "episode_klaim", total, fresh, duplicate: rows.filter((r) => r.outcome === "duplicate").length, errors: rows.filter((r) => r.outcome === "error").length, rows, fileErrors: [], warnings: [], apply: fresh ? apply : null };
}

/* ---------------- layanan ---------------- */
function analyzeLayanan(db: Database.Database, ctx: CsvCtx, lines: { line: number; cells: string[] }[]): Analysis {
  const claims = new Map((db.prepare("SELECT id, claim_no, episode_id FROM claims").all() as { id: string; claim_no: string; episode_id: string }[]).map((c) => [c.claim_no, c]));
  const existing = new Set((db.prepare("SELECT ci.claim_id || '|' || s.code || '|' || s.performed_at AS k FROM claim_items ci JOIN services s ON s.id = ci.service_id").all() as { k: string }[]).map((r) => r.k));
  const seen = new Map<string, number>();
  const rows: RowResult[] = [];
  const ok: { claimId: string; episodeId: string; code: string; name: string; at: string; performer: string; qty: number; amount: number }[] = [];
  for (const { line, cells } of lines) {
    const get: Cell = (n) => clean(cells[ctx.idx(n)]);
    const errs: RowError[] = [];
    const err = (field: string, message: string) => errs.push({ line, field, message });
    const claimNo = get("claim_no");
    const code = get("service_code");
    const claim = claims.get(claimNo);
    if (!claim) err("claim_no", `Klaim "${claimNo}" belum ada. Impor episode dan klaim lebih dulu.`);
    if (!code || code.length > 20) err("service_code", "Kode layanan wajib (maks. 20 karakter).");
    const known = SVC[code];
    let name = get("service_name");
    if (!name && known) name = known.name;
    if (!name) err("service_name", "Kode tidak ada di katalog; nama layanan wajib.");
    const at = get("performed_at");
    if (!validDate(at)) err("performed_at", "Waktu pelaksanaan tidak valid.");
    const performer = get("performer");
    if (!performer) err("performer", "Pelaksana wajib.");
    const qtyRaw = get("qty") || "1";
    const qty = intOf(qtyRaw);
    if (!Number.isFinite(qty) || qty < 1 || qty > 999) err("qty", "Jumlah harus bilangan bulat 1–999.");
    const amount = intOf(get("amount"));
    if (!Number.isFinite(amount)) err("amount", "Nilai harus bilangan bulat ≥ 0.");
    const label = `${claimNo || "?"} · ${code || "?"}`;
    if (errs.length) { rows.push({ line, outcome: "error", errors: errs, label }); continue; }
    const key = `${claim!.id}|${code}|${normDt(at)}`;
    if (seen.has(key)) { rows.push({ line, outcome: "error", errors: [{ line, field: "service_code", message: `Duplikat dengan baris ${seen.get(key)} pada berkas ini.` }], label }); continue; }
    seen.set(key, line);
    if (existing.has(key)) { rows.push({ line, outcome: "duplicate", errors: [], label, note: "Layanan sudah tercatat pada klaim ini; dilewati." }); continue; }
    rows.push({ line, outcome: "new", errors: [], label });
    ok.push({ claimId: claim!.id, episodeId: claim!.episode_id, code, name, at: normDt(at), performer, qty, amount });
  }
  const apply = () => {
    let n = 0;
    for (const o of ok) {
      const sid = nextId(db, "SVI", 5);
      db.prepare("INSERT INTO services (id, episode_id, code, name, performed_at, performer, qty, amount) VALUES (?,?,?,?,?,?,?,?)").run(sid, o.episodeId, o.code, o.name, o.at, o.performer, o.qty, o.amount);
      db.prepare("INSERT INTO claim_items (id, claim_id, service_id, amount) VALUES (?,?,?,?)").run(nextId(db, "CII", 6), o.claimId, sid, o.amount);
      n++;
    }
    return { inserted: { layanan: n }, notes: [] };
  };
  const fresh = rows.filter((r) => r.outcome === "new").length;
  return { kind: "layanan", total: lines.length, fresh, duplicate: rows.filter((r) => r.outcome === "duplicate").length, errors: rows.filter((r) => r.outcome === "error").length, rows, fileErrors: [], warnings: [], apply: fresh ? apply : null };
}

/* ---------------- status_bayar ---------------- */
const EVENT_TYPES = ["submitted", "complete", "due", "paid", "pending", "returned"] as const;
const KNOWN_REASONS = ["BERKAS_KURANG", "KODING_TIDAK_SELARAS", "DATA_KEPESERTAAN", "DATA_TIDAK_SELARAS", "PERLU_PENDALAMAN"];
function analyzeStatusBayar(db: Database.Database, ctx: CsvCtx, lines: { line: number; cells: string[] }[]): Analysis {
  const claims = new Map((db.prepare("SELECT id, claim_no, facility_id FROM claims").all() as { id: string; claim_no: string; facility_id: string }[]).map((c) => [c.claim_no, c]));
  const existing = new Set((db.prepare("SELECT claim_id || '|' || type || '|' || at AS k FROM payment_events").all() as { k: string }[]).map((r) => r.k));
  const seen = new Map<string, number>();
  const rows: RowResult[] = [];
  const warnings: string[] = [];
  const ok: { claim: { id: string; facility_id: string }; type: (typeof EVENT_TYPES)[number]; at: string; amount: number | null; reason: string | null }[] = [];
  for (const { line, cells } of lines) {
    const get: Cell = (n) => clean(cells[ctx.idx(n)]);
    const errs: RowError[] = [];
    const err = (field: string, message: string) => errs.push({ line, field, message });
    const claimNo = get("claim_no");
    const claim = claims.get(claimNo);
    if (!claim) err("claim_no", `Klaim "${claimNo}" belum ada.`);
    const type = get("event_type") as (typeof EVENT_TYPES)[number];
    if (!EVENT_TYPES.includes(type)) err("event_type", `Jenis peristiwa harus salah satu dari: ${EVENT_TYPES.join(", ")}.`);
    const at = get("event_at");
    if (!validDate(at)) err("event_at", "Waktu peristiwa tidak valid.");
    const amountRaw = get("amount");
    const amount = amountRaw ? intOf(amountRaw) : null;
    if (amountRaw && !Number.isFinite(amount)) err("amount", "Nilai harus bilangan bulat.");
    const reason = get("reason") || null;
    if (reason && type !== "pending" && type !== "returned") err("reason", "Kode alasan hanya untuk pending atau returned.");
    if ((type === "pending" || type === "returned") && !reason) warnings.push(`Baris ${line}: ${type} tanpa kode alasan; akan dipilah ke "Perlu pendalaman".`);
    if (reason && !KNOWN_REASONS.includes(reason)) warnings.push(`Baris ${line}: kode alasan "${reason}" tidak ada pada pemetaan; akan dipilah ke "Perlu pendalaman".`);
    const label = `${claimNo || "?"} · ${type || "?"}`;
    if (errs.length) { rows.push({ line, outcome: "error", errors: errs, label }); continue; }
    const key = `${claim!.id}|${type}|${normDt(at)}`;
    if (seen.has(key)) { rows.push({ line, outcome: "error", errors: [{ line, field: "event_at", message: `Duplikat dengan baris ${seen.get(key)} pada berkas ini.` }], label }); continue; }
    seen.set(key, line);
    if (existing.has(key)) { rows.push({ line, outcome: "duplicate", errors: [], label, note: "Peristiwa sama sudah tercatat; dilewati." }); continue; }
    rows.push({ line, outcome: "new", errors: [], label });
    ok.push({ claim: claim!, type, at: normDt(at), amount, reason });
  }
  const apply = () => {
    let n = 0;
    let statusUpdates = 0;
    const policy = (db.prepare("SELECT id FROM policy_versions WHERE domain = 'payment' ORDER BY created_at DESC, rowid DESC LIMIT 1").get() as { id: string } | undefined)?.id ?? null;
    const sorted = [...ok].sort((a, b) => a.at.localeCompare(b.at));
    for (const o of sorted) {
      const info = db.prepare("INSERT INTO payment_events (claim_id, facility_id, type, at, amount, reason, source, policy_version_id) VALUES (?,?,?,?,?,?, 'import', ?)").run(o.claim.id, o.claim.facility_id, o.type, o.at, o.amount, o.reason, policy);
      n++;
      // Status klaim mengikuti peristiwa dari sumber, hanya bila peristiwa ini tidak lebih lama dari peristiwa penentu status sebelumnya.
      if (o.type === "paid" || o.type === "pending" || o.type === "returned" || o.type === "submitted") {
        const last = db.prepare("SELECT MAX(at) AS at FROM payment_events WHERE claim_id = ? AND type IN ('paid','pending','returned','submitted') AND id <> ?").get(o.claim.id, Number(info.lastInsertRowid)) as { at: string | null };
        if (!last.at || o.at >= last.at) {
          if (o.type === "paid") db.prepare("UPDATE claims SET status = 'paid', paid_at = ? WHERE id = ?").run(o.at, o.claim.id);
          else if (o.type === "pending" || o.type === "returned") db.prepare("UPDATE claims SET status = ? WHERE id = ?").run(o.type, o.claim.id);
          else db.prepare("UPDATE claims SET status = CASE WHEN status = 'draft' THEN 'submitted' ELSE status END, submitted_at = COALESCE(submitted_at, ?) WHERE id = ?").run(o.at, o.claim.id);
          statusUpdates++;
        }
      }
    }
    return { inserted: { peristiwa: n }, notes: [`${statusUpdates} status klaim mengikuti peristiwa terbaru dari sumber impor (bukan keputusan SEHATI).`] };
  };
  const fresh = rows.filter((r) => r.outcome === "new").length;
  return { kind: "status_bayar", total: lines.length, fresh, duplicate: rows.filter((r) => r.outcome === "duplicate").length, errors: rows.filter((r) => r.outcome === "error").length, rows, fileErrors: [], warnings: warnings.slice(0, 50), apply: fresh ? apply : null };
}

/* ---------------- standar (JSON) ---------------- */
function analyzeStandar(db: Database.Database, p: Principal, text: string): Analysis {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { kind: "standar", total: 1, fresh: 0, duplicate: 0, errors: 1, rows: [{ line: 1, outcome: "error", errors: [{ line: 1, field: null, message: "Isi bukan JSON yang valid." }], label: "berkas" }], fileErrors: [], warnings: [], apply: null }; }
  const v = validateStandardImport(db, raw);
  const warnings = v.issues.filter((i) => i.level === "warning").map((i) => `${i.where}: ${i.message}`);
  const errors = v.issues.filter((i) => i.level === "error").map((i, k) => ({ line: k + 1, field: i.where, message: i.message }));
  if (!v.ok || !v.data) return { kind: "standar", total: 1, fresh: 0, duplicate: 0, errors: Math.max(1, errors.length), rows: [{ line: 1, outcome: "error", errors, label: "standar" }], fileErrors: [], warnings, apply: null };
  const data = v.data;
  const id = `${data.standard_id}@${data.version}`;
  const existing = db.prepare("SELECT 1 FROM standard_versions WHERE id = ?").get(id);
  const same = existing && (db.prepare("SELECT value FROM meta WHERE key = ?").get(`stdimport:${id}`) as { value: string } | undefined)?.value === sha256(JSON.stringify(data));
  if (existing && same) return { kind: "standar", total: 1, fresh: 0, duplicate: 1, errors: 0, rows: [{ line: 1, outcome: "duplicate", errors: [], label: id, note: "Isi identik sudah ada; dilewati." }], fileErrors: [], warnings, apply: null };
  if (existing) return { kind: "standar", total: 1, fresh: 0, duplicate: 0, errors: 1, rows: [{ line: 1, outcome: "error", errors: [{ line: 1, field: "version", message: `Versi ${id} sudah ada dengan isi berbeda. Gunakan nomor versi baru.` }], label: id }], fileErrors: [], warnings, apply: null };
  return {
    kind: "standar", total: 1, fresh: 1, duplicate: 0, errors: 0, rows: [{ line: 1, outcome: "new", errors: [], label: `${id} (${data.indicators.length} indikator)` }], fileErrors: [], warnings,
    apply: () => {
      const r = applyStandardImport(db, p, data);
      return { inserted: { versi_standar: r.created ? 1 : 0, indikator: r.created ? data.indicators.length : 0 }, notes: [r.note] };
    },
  };
}

/* ---------------- orkestrasi ---------------- */
export function analyze(db: Database.Database, p: Principal, kind: ImportKind, text: string): Analysis {
  if (!IMPORT_KINDS.includes(kind)) throw new DomainError("Jenis impor tidak dikenal.", 422);
  if (KIND_DEFS[kind].format === "json") return analyzeStandar(db, p, text);
  const parsed = parseCsv(text);
  const fileErrors = checkHeader(kind, parsed.header);
  const empty = (): Analysis => ({ kind, total: parsed.rows.length, fresh: 0, duplicate: 0, errors: Math.max(1, fileErrors.length), rows: [], fileErrors, warnings: [], apply: null });
  if (fileErrors.length) return empty();
  if (parsed.rows.length === 0) return { ...empty(), fileErrors: [{ line: 1, field: null, message: "Berkas tidak memiliki baris data." }] };
  if (parsed.rows.length > MAX_IMPORT_ROWS) return { ...empty(), fileErrors: [{ line: 1, field: null, message: `Terlalu banyak baris (${parsed.rows.length}); maksimal ${MAX_IMPORT_ROWS} per berkas.` }] };
  const ctx: CsvCtx = { kind, header: parsed.header, idx: (n) => parsed.header.indexOf(n) };
  const colErr = parsed.rows.filter((r) => r.cells.length !== parsed.header.length);
  const goodLines = parsed.rows.filter((r) => r.cells.length === parsed.header.length);
  let a: Analysis;
  if (kind === "episode_klaim") a = analyzeEpisodeKlaim(db, ctx, goodLines);
  else if (kind === "layanan") a = analyzeLayanan(db, ctx, goodLines);
  else a = analyzeStatusBayar(db, ctx, goodLines);
  for (const r of colErr) {
    a.rows.push({ line: r.line, outcome: "error", errors: [{ line: r.line, field: null, message: `Jumlah kolom ${r.cells.length}, seharusnya ${parsed.header.length}.` }], label: `baris ${r.line}` });
    a.errors++;
    a.total++;
  }
  a.rows.sort((x, y) => x.line - y.line);
  return a;
}

export interface ImportJobRow {
  id: string; kind: ImportKind; file_name: string | null; content_hash: string; status: "previewed" | "applied" | "failed";
  total_rows: number; valid_rows: number; error_rows: number; errors: RowError[]; summary: JobSummary; created_by: string | null; created_at: string; applied_at: string | null;
}
export interface JobSummary {
  fresh: number; duplicate: number; rows: RowResult[]; fileErrors: RowError[]; warnings: string[]; content: string;
  result?: ApplyResult & { partial: boolean; skippedErrors: number; derived?: Record<string, number> };
  duplicate_of?: string | null;
}

const JOB_COLS = "id, kind, file_name, content_hash, status, total_rows, valid_rows, error_rows, errors_json, summary_json, created_by, created_at, applied_at";
function rowToJob(r: Record<string, unknown>): ImportJobRow {
  return { ...(r as unknown as ImportJobRow), errors: json<RowError[]>(r.errors_json as string, []), summary: json<JobSummary>(r.summary_json as string, {} as JobSummary) };
}
export function listJobs(db: Database.Database, limit = 30): ImportJobRow[] {
  return (db.prepare(`SELECT ${JOB_COLS} FROM import_jobs ORDER BY created_at DESC, rowid DESC LIMIT ?`).all(limit) as Record<string, unknown>[]).map(rowToJob);
}
export function getJob(db: Database.Database, id: string): ImportJobRow | null {
  const r = db.prepare(`SELECT ${JOB_COLS} FROM import_jobs WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  return r ? rowToJob(r) : null;
}

/** Pratinjau: validasi tanpa menulis data domain. Isi yang sama (hash + jenis) yang sudah dipratinjau mengembalikan pekerjaan yang sama (tidak ada duplikat pekerjaan). */
export function previewImport(db: Database.Database, p: Principal, input: { kind: ImportKind; fileName?: string | null; text: string }) {
  assertCan(p, "import.run");
  const bytes = Buffer.byteLength(input.text, "utf8");
  if (bytes === 0) throw new DomainError("Berkas kosong.", 422);
  if (bytes > MAX_IMPORT_BYTES) throw new DomainError(`Berkas terlalu besar (${Math.round(bytes / 1000)} KB); maksimal ${MAX_IMPORT_BYTES / 1000} KB.`, 422);
  if (input.text.includes("\u0000")) throw new DomainError("Berkas bukan teks (mengandung byte kosong).", 422);
  const hash = sha256(`${input.kind}\n${input.text}`);
  const prior = db.prepare("SELECT id, status FROM import_jobs WHERE content_hash = ? AND kind = ? ORDER BY CASE status WHEN 'applied' THEN 0 ELSE 1 END, created_at DESC LIMIT 1").get(hash, input.kind) as { id: string; status: string } | undefined;
  const a = analyze(db, p, input.kind, input.text);
  return db.transaction(() => {
    if (prior?.status === "previewed") {
      db.prepare("DELETE FROM import_jobs WHERE id = ? AND status = 'previewed'").run(prior.id); // segarkan pratinjau terhadap keadaan data terkini
    }
    const id = nextId(db, "IMP");
    const errorsFlat = [...a.fileErrors, ...a.rows.flatMap((r) => r.errors)].slice(0, 300);
    const summary: JobSummary = {
      fresh: a.fresh, duplicate: a.duplicate, rows: a.rows.slice(0, 500), fileErrors: a.fileErrors, warnings: a.warnings, content: input.text,
      duplicate_of: prior?.status === "applied" ? prior.id : null,
    };
    db.prepare("INSERT INTO import_jobs (id, kind, file_name, content_hash, status, total_rows, valid_rows, error_rows, errors_json, summary_json, created_by, created_at) VALUES (?,?,?,?,'previewed',?,?,?,?,?,?,?)").run(
      id, input.kind, (input.fileName ?? "").slice(0, 120) || null, hash, a.total, a.fresh, a.errors, JSON.stringify(errorsFlat), JSON.stringify(summary), p.id, nowPrecise(),
    );
    appendAudit(db, { actor: p.id, actor_role: p.role, action: "impor_dipratinjau", entity: "import_job", entity_id: id, detail: { jenis: input.kind, baris: a.total, baru: a.fresh, duplikat: a.duplicate, galat: a.errors, hash: hash.slice(0, 16) } });
    return { jobId: id, appliedBefore: prior?.status === "applied" ? prior.id : null };
  })();
}

/** Terapkan. Idempoten menurut pekerjaan: pengulangan mengembalikan hasil pertama tanpa efek ganda. Memvalidasi ulang terhadap data terkini. */
export function applyImport(db: Database.Database, p: Principal, jobId: string, opts: { allowPartial?: boolean } = {}) {
  assertCan(p, "import.run");
  const run = idempotent(db, "import:apply", jobId, () =>
    db.transaction(() => {
      const job = getJob(db, jobId);
      if (!job) throw new DomainError("Pekerjaan impor tidak ditemukan.", 404);
      if (job.status === "applied") throw new DomainError("Pekerjaan ini sudah diterapkan.", 409);
      const a = analyze(db, p, job.kind, job.summary.content);
      if (a.errors > 0 && !opts.allowPartial) throw new DomainError(`Masih ada ${a.errors} baris bergalat. Perbaiki berkas, atau terapkan hanya baris valid dengan konfirmasi eksplisit.`, 422);
      if (!a.apply) {
        const msg = a.duplicate > 0 && a.errors === 0 ? "Semua baris sudah ada (duplikat); tidak ada yang diterapkan." : "Tidak ada baris valid untuk diterapkan.";
        throw new DomainError(msg, 422);
      }
      const res = a.apply();
      const derived: Record<string, number> = {};
      if (job.kind === "episode_klaim" || job.kind === "layanan" || job.kind === "status_bayar") {
        const sig = syncClaimSignals(db, SYSTEM_ACTOR);
        derived.sinyal_baru = sig.created;
        const tri = syncPendingTriage(db, SYSTEM_ACTOR);
        derived.pending_dipilah = tri.created;
        derived.pending_ditutup = tri.closed;
        const cards = recomputeCards(db, SYSTEM_ACTOR);
        derived.kartu_berubah = cards.changed;
      }
      const result = { ...res, partial: a.errors > 0, skippedErrors: a.errors, derived };
      const summary: JobSummary = { ...job.summary, result };
      db.prepare("UPDATE import_jobs SET status = 'applied', applied_at = ?, summary_json = ?, valid_rows = ?, error_rows = ? WHERE id = ?").run(nowPrecise(), JSON.stringify(summary), a.fresh, a.errors, jobId);
      appendAudit(db, { actor: p.id, actor_role: p.role, action: "impor_diterapkan", entity: "import_job", entity_id: jobId, detail: { jenis: job.kind, ...res.inserted, dilewati_duplikat: a.duplicate, galat_dilewati: a.errors, parsial: a.errors > 0 } });
      return result;
    })(),
  );
  return { ...run.value, replayed: run.replayed };
}

/** Pekerjaan yang gagal dicatat agar terlihat (mis. galat tak terduga saat menerapkan). */
export function markJobFailed(db: Database.Database, p: Principal, jobId: string, message: string) {
  db.prepare("UPDATE import_jobs SET status = 'failed' WHERE id = ? AND status = 'previewed'").run(jobId);
  appendAudit(db, { actor: p.id, actor_role: p.role, action: "impor_gagal", entity: "import_job", entity_id: jobId, detail: { pesan: message.slice(0, 120) } });
}

export { RegistryError };
