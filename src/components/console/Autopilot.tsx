"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { InfoDot } from "@/components/explain";
import { AnimatePresence, Spinner, motion } from "@/components/motion";

/* Tampilan Autopilot keputusan: sakelar mode, kartu keputusan otomatis, saran untuk mode manual.
   Logika ada di src/lib/autopilot.ts; komponen ini hanya memanggil API. */

const DECISION_TEXT: Record<string, string> = {
  loloskan: "Diloloskan",
  koreksi: "Dikoreksi",
  tolak: "Ditolak",
  eskalasi: "Dieskalasi",
};
const DECISION_TONE: Record<string, string> = {
  loloskan: "text-ok",
  koreksi: "text-warn",
  tolak: "text-danger",
  eskalasi: "text-info",
};
const rp = (n: number) => "Rp" + Math.round(n).toLocaleString("id-ID");

type ApiResult<T> = { ok: boolean; error?: string; data?: T };
async function post<T = unknown>(url: string, body: unknown): Promise<T | undefined> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Tidak dapat terhubung ke server. Coba lagi.");
  }
  const j = (await res.json().catch(() => ({ ok: false, error: "Respons server tidak valid." }))) as ApiResult<T>;
  if (!j.ok) throw new Error(j.error ?? "Gagal.");
  return j.data;
}

type RunResult = { decided: { caseId: string; review: boolean }[]; waiting: string[]; ms: number } | null;

function summarize(r: RunResult) {
  if (!r) return null;
  const review = r.decided.filter((d) => d.review).length;
  const secs = (r.ms / 1000).toLocaleString("id-ID", { maximumFractionDigits: 2 });
  if (r.decided.length === 0 && r.waiting.length === 0) return "Tidak ada kasus baru untuk diproses.";
  return `${r.decided.length} kasus diputus dalam ${secs} detik · ${r.waiting.length} menunggu jawaban peserta · ${review} ditandai untuk ditinjau.`;
}

export interface AutopilotStatsView {
  mode: "manual" | "otomatis";
  pending: number;
  decided: number;
  waiting: number;
  needsReview: number;
  reviewed: number;
  changed: number;
  avgConfidence: number | null;
}

/** Panel kendali di atas antrean: mode Manual/Otomatis + angka ringkas. */
export function AutopilotControl({ stats, canControl, compact = false }: { stats: AutopilotStatsView; canControl: boolean; compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "mode" | "run">(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const auto = stats.mode === "otomatis";
  const runnable = stats.pending - stats.waiting;

  async function act(kind: "mode" | "run", fn: () => Promise<RunResult | undefined>) {
    setBusy(kind);
    setError(null);
    setResult(null);
    try {
      const r = await fn();
      setResult(summarize(r ?? null));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal.");
    } finally {
      setBusy(null);
    }
  }
  const setMode = (mode: "manual" | "otomatis") => act("mode", () => post<RunResult>("/api/autopilot/mode", { mode }));
  const runNow = () => act("run", () => post<RunResult>("/api/autopilot/run", {}));

  return (
    <section aria-label="Autopilot keputusan" className={`mb-6 overflow-hidden rounded-xl border ${auto ? "border-ink bg-ink text-white" : "border-line bg-card"}`}>
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4 p-5 md:p-6">
        <div className="min-w-0 flex-1 basis-80">
          <p className={`eyebrow flex items-center gap-2 ${auto ? "text-white/60" : "text-muted"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${auto ? "bg-mint" : "bg-muted"}`} aria-hidden />
            Autopilot keputusan <InfoDot k="autopilot" />
          </p>
          <p className="mt-1.5 text-xl font-semibold tracking-tight">
            {auto ? "Aktif: kasus diputus otomatis" : "Mati: petugas memutus setiap kasus"}
          </p>
          <p className={`mt-1 max-w-2xl text-sm leading-relaxed ${auto ? "text-white/70" : "text-ink-soft"}`}>
            {auto
              ? "Kasus baru, jawaban peserta, dan data impor langsung diproses. Petugas cukup meninjau keputusan yang ditandai, dan bisa membatalkan kapan saja."
              : "Nyalakan untuk memutus seluruh antrean secara otomatis. Setiap keputusan tetap tercatat di jejak audit dan bisa ditinjau ulang."}
          </p>
        </div>

        <div className="flex flex-col items-start gap-2">
          <div role="radiogroup" aria-label="Mode keputusan" className={`inline-flex rounded-lg p-1 ${auto ? "bg-white/10" : "bg-paper ring-1 ring-line"}`}>
            {(["manual", "otomatis"] as const).map((m) => {
              const on = stats.mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={!canControl || busy !== null || on}
                  onClick={() => setMode(m)}
                  className={`inline-flex min-w-28 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-default ${
                    on ? (auto ? "bg-white text-ink" : "bg-ink text-white") : auto ? "text-white/70 hover:text-white" : "text-ink-soft hover:text-ink"
                  } ${!canControl && !on ? "opacity-50" : ""}`}
                >
                  {busy === "mode" && !on ? <Spinner /> : null}
                  {m === "manual" ? "Manual" : "Otomatis"}
                </button>
              );
            })}
          </div>
          {!canControl && <p className={`text-xs ${auto ? "text-white/60" : "text-muted"}`}>Hanya Verifikator atau Auditor yang dapat mengubah mode.</p>}
        </div>
      </div>

      {!compact && (
        <div className={`grid grid-cols-2 border-t md:grid-cols-4 ${auto ? "border-white/10" : "border-line"}`}>
          {[
            { label: "Diputus otomatis", value: stats.decided, href: "/console/autopilot?f=semua" },
            { label: "Perlu ditinjau", value: stats.needsReview, href: "/console/autopilot", strong: stats.needsReview > 0 },
            { label: "Menunggu jawaban peserta", value: stats.waiting, href: "/console/autopilot?f=menunggu" },
            { label: "Rata-rata keyakinan", value: stats.avgConfidence === null ? "–" : `${stats.avgConfidence}%`, info: true },
          ].map((s, i) => {
            const body = (
              <>
                <p className={`text-xs ${auto ? "text-white/60" : "text-muted"}`}>
                  {s.label} {s.info && <InfoDot k="keyakinan" />}
                </p>
                <p className={`mt-0.5 text-2xl font-semibold tabular-nums ${s.strong ? (auto ? "text-accent" : "text-warn") : ""}`}>{s.value}</p>
              </>
            );
            const cls = `px-5 py-4 md:px-6 ${i > 0 ? (auto ? "md:border-l md:border-white/10" : "md:border-l md:border-line") : ""} ${i % 2 ? (auto ? "border-l border-white/10 md:border-l" : "border-l border-line") : ""}`;
            return s.href ? (
              <Link key={s.label} href={s.href} className={`${cls} transition-colors ${auto ? "hover:bg-white/[0.04]" : "hover:bg-paper"}`}>
                {body}
              </Link>
            ) : (
              <div key={s.label} className={cls}>
                {body}
              </div>
            );
          })}
        </div>
      )}

      {(auto && runnable > 0) || result || error ? (
        <div className={`flex flex-wrap items-center gap-x-5 gap-y-2 border-t px-5 py-3 md:px-6 ${auto ? "border-white/10" : "border-line"}`}>
          {auto && runnable > 0 && canControl && (
            <button type="button" onClick={runNow} disabled={busy !== null} className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60">
              {busy === "run" && <Spinner />} Proses {runnable} kasus sekarang
            </button>
          )}
          <AnimatePresence mode="wait">
            {error ? (
              <motion.p key="e" role="alert" className="text-sm font-semibold text-danger" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {error}
              </motion.p>
            ) : result ? (
              <motion.p key="r" role="status" className={`text-sm font-medium ${auto ? "text-mint" : "text-ok"}`} initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {result}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>
      ) : null}
    </section>
  );
}

/** Meter keyakinan 0–100 dengan kata. */
export function ConfidenceMeter({ value }: { value: number }) {
  const word = value >= 85 ? "Sangat yakin" : value >= 70 ? "Yakin" : "Kurang yakin";
  const bar = value >= 70 ? "bg-ink" : "bg-accent";
  return (
    <div role="img" aria-label={`Keyakinan ${value} dari 100, ${word.toLowerCase()}`}>
      <p className="flex items-baseline gap-2 text-sm">
        <span className="font-semibold tabular-nums">{value}%</span>
        <span className="text-ink-soft">{word}</span>
        <InfoDot k="keyakinan" />
      </p>
      <div className="mt-1.5 h-1.5 w-full max-w-[12rem] overflow-hidden rounded-full bg-line" aria-hidden>
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export interface AutoView {
  state: "diputus" | "menunggu_peserta";
  decision: string | null;
  correction: number | null;
  confidence: number;
  summary: string;
  basisList: string[];
  engine: string;
  at: string;
  review_flag: "keyakinan_rendah" | "sampel_acak" | null;
  review_status: "belum" | "dikonfirmasi" | "diubah" | "dibuka_kembali";
  reviewedByLabel: string | null;
  reviewedAtLabel: string | null;
  review_note: string | null;
}

const REVIEW_TEXT: Record<AutoView["review_status"], string> = {
  belum: "Belum ditinjau petugas",
  dikonfirmasi: "Disetujui petugas",
  diubah: "Diubah petugas",
  dibuka_kembali: "Dikembalikan ke antrean manual",
};

function Basis({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <details className="group mt-3 text-sm">
      <summary className="inline-flex cursor-pointer select-none list-none items-center gap-1 text-xs font-medium text-ink-soft hover:text-ink [&::-webkit-details-marker]:hidden">
        <span className="transition-transform duration-150 group-open:rotate-90" aria-hidden>›</span> Dasar keputusan ({items.length})
      </summary>
      <ul className="mt-2 space-y-1.5 text-[13px] text-ink-soft">
        {items.map((b, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted" aria-hidden />
            {b}
          </li>
        ))}
      </ul>
    </details>
  );
}

const DECISIONS = [
  { value: "loloskan", label: "Loloskan", desc: "Klaim sah, dibayar penuh." },
  { value: "koreksi", label: "Koreksi nilai", desc: "Potong bagian yang tidak layak." },
  { value: "tolak", label: "Tolak", desc: "Klaim tidak dibayar." },
  { value: "eskalasi", label: "Eskalasi", desc: "Teruskan ke audit lanjutan." },
] as const;

/** Kartu keputusan otomatis di halaman kasus, lengkap dengan aksi tinjauan petugas. */
export function AutoDecisionCard({ caseId, auto, canReview, claimAmount, roleLabel }: { caseId: string; auto: AutoView; canReview: boolean; claimAmount: number; roleLabel: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "ubah">("idle");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<string>(auto.decision ?? "eskalasi");
  const [correction, setCorrection] = useState("");
  const [reason, setReason] = useState("");

  async function act(kind: string, body: Record<string, unknown>) {
    setBusy(kind);
    setError(null);
    try {
      await post(`/api/cases/${caseId}/auto`, body);
      setMode("idle");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal.");
    } finally {
      setBusy(null);
    }
  }

  const reviewed = auto.review_status !== "belum";
  const corrNum = Number(correction) || 0;
  const corrErr = decision === "koreksi" && (corrNum <= 0 || corrNum > claimAmount) ? `Isi nilai potongan, maksimal ${rp(claimAmount)}.` : null;
  const reasonOk = reason.trim().length >= 10;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-ink px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
          <span className="h-1.5 w-1.5 rounded-full bg-mint" aria-hidden /> Diputus otomatis
        </span>
        {auto.review_flag && !reviewed && (
          <span className="rounded-md bg-warn-soft px-2 py-0.5 text-[11px] font-semibold text-warn">
            {auto.review_flag === "keyakinan_rendah" ? "Perlu ditinjau: keyakinan rendah" : "Perlu ditinjau: sampel acak"}
          </span>
        )}
      </div>

      <p className={`mt-3 text-2xl font-semibold tracking-tight ${DECISION_TONE[auto.decision ?? ""] ?? ""}`}>
        {DECISION_TEXT[auto.decision ?? ""] ?? auto.decision}
        {auto.decision === "koreksi" && auto.correction ? <span className="ml-2 text-base font-medium text-ink-soft">−{rp(auto.correction)}</span> : null}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{auto.summary}</p>
      <div className="mt-4">
        <ConfidenceMeter value={auto.confidence} />
      </div>
      <Basis items={auto.basisList} />

      <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
        {auto.engine} · {auto.at.replace("T", " ")}
      </p>

      <div className={`mt-3 rounded-lg px-3 py-2.5 text-sm ${reviewed ? "bg-paper ring-1 ring-line" : "bg-warn-soft/60"}`}>
        <p className="font-semibold">{REVIEW_TEXT[auto.review_status]}</p>
        {reviewed && (
          <p className="mt-0.5 text-xs text-ink-soft">
            {auto.reviewedByLabel} · {auto.reviewedAtLabel}
            {auto.review_note ? ` · “${auto.review_note}”` : ""}
          </p>
        )}
        {!reviewed && <p className="mt-0.5 text-xs text-ink-soft">Keputusan sudah berlaku. Petugas dapat menyetujui, mengubah, atau mengembalikannya ke antrean.</p>}
      </div>

      {canReview && auto.review_status !== "dibuka_kembali" && (
        <div className="mt-4">
          {mode === "idle" ? (
            <div className="flex flex-wrap gap-2">
              {auto.review_status !== "dikonfirmasi" && (
                <button type="button" disabled={busy !== null} onClick={() => act("ok", { action: "confirm" })} className="btn-gold inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60">
                  {busy === "ok" && <Spinner />} Setujui
                </button>
              )}
              <button type="button" disabled={busy !== null} onClick={() => setMode("ubah")} className="rounded-lg border border-line bg-card px-4 py-2 text-sm font-semibold text-ink hover:border-ink/40">
                Ubah keputusan
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => {
                  if (confirm("Batalkan keputusan otomatis dan kembalikan kasus ke antrean manual?")) act("reopen", { action: "reopen" });
                }}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline"
              >
                {busy === "reopen" && <Spinner />} Kembalikan ke antrean
              </button>
            </div>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (corrErr || !reasonOk) return;
                act("ubah", { action: "override", decision, reason, correction: decision === "koreksi" ? corrNum : 0 });
              }}
            >
              <fieldset>
                <legend className="text-xs font-semibold text-ink-soft">Keputusan baru</legend>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  {DECISIONS.map((o) => (
                    <label key={o.value} className={`cursor-pointer rounded-lg border p-2.5 text-sm ${decision === o.value ? "border-ink bg-paper" : "border-line"}`}>
                      <input type="radio" name="d" value={o.value} checked={decision === o.value} onChange={() => setDecision(o.value)} className="sr-only" />
                      <span className="block font-semibold">{o.label}</span>
                      <span className="block text-xs text-muted">{o.desc}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {decision === "koreksi" && (
                <div>
                  <label htmlFor="ap-corr" className="text-xs font-semibold text-ink-soft">Nilai yang dipotong (Rp)</label>
                  <input id="ap-corr" inputMode="numeric" value={correction} onChange={(e) => setCorrection(e.target.value.replace(/\D/g, "").slice(0, 12))} className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
                  {correction && corrErr && <p className="mt-1 text-xs text-danger">{corrErr}</p>}
                </div>
              )}
              <div>
                <label htmlFor="ap-reason" className="text-xs font-semibold text-ink-soft">Alasan perubahan (min. 10 karakter)</label>
                <textarea id="ap-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="submit" disabled={busy !== null || !!corrErr || !reasonOk} className="btn-gold inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
                  {busy === "ubah" && <Spinner />} Simpan sebagai {roleLabel}
                </button>
                <button type="button" onClick={() => setMode("idle")} className="px-3 py-2 text-sm font-medium text-ink-soft hover:text-ink">
                  Batal
                </button>
              </div>
            </form>
          )}
        </div>
      )}
      {!canReview && <p className="mt-3 text-xs text-muted">Hanya Verifikator atau Auditor yang dapat meninjau keputusan otomatis.</p>}
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Kartu saat autopilot menunggu jawaban peserta. */
export function AutoWaitingCard({ summary, at }: { summary: string; at: string }) {
  return (
    <div className="rounded-lg bg-info-soft/60 p-3.5 text-sm ring-1 ring-info/15">
      <p className="eyebrow text-info">Autopilot menunggu</p>
      <p className="mt-1 font-semibold">Menunggu konfirmasi peserta</p>
      <p className="mt-1 leading-relaxed text-ink-soft">{summary}</p>
      <p className="mt-2 text-xs text-muted">
        Pertanyaan dikirim ke aplikasi peserta {at.replace("T", " ")}. Begitu peserta menjawab, kasus ini diputus otomatis.{" "}
        <Link href="/m" className="font-semibold text-ink underline underline-offset-4">
          Buka aplikasi peserta
        </Link>
      </p>
    </div>
  );
}

/** Saran otomatis saat mode manual: satu klik untuk menerapkan. */
export function AutoSuggestion({ caseId, verdict, canDecide }: { caseId: string; verdict: { kind: "putus" | "tanya_peserta"; decision: string | null; correction: number | null; confidence: number; summary: string; basis: string[] }; canDecide: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  let body: ReactNode;
  if (verdict.kind === "tanya_peserta") {
    body = (
      <>
        <p className="mt-1 font-semibold">Tanyakan dulu ke peserta</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">{verdict.summary}</p>
      </>
    );
  } else {
    body = (
      <>
        <p className={`mt-1 text-lg font-semibold ${DECISION_TONE[verdict.decision ?? ""] ?? ""}`}>
          {DECISION_TEXT[verdict.decision ?? ""]}
          {verdict.decision === "koreksi" && verdict.correction ? <span className="ml-2 text-sm font-medium text-ink-soft">−{rp(verdict.correction)}</span> : null}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">{verdict.summary}</p>
        <div className="mt-3">
          <ConfidenceMeter value={verdict.confidence} />
        </div>
      </>
    );
  }
  return (
    <div className="rounded-lg border border-dashed border-ink/25 bg-paper p-3.5">
      <p className="eyebrow flex items-center gap-1.5 text-muted">
        Saran autopilot <InfoDot k="autopilot" />
      </p>
      {body}
      <Basis items={verdict.basis} />
      {verdict.kind === "putus" && canDecide && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await post(`/api/cases/${caseId}/decide`, { decision: verdict.decision, reason: `Saran autopilot diterapkan: ${verdict.summary}`, correction: verdict.correction ?? 0 });
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Gagal.");
            } finally {
              setBusy(false);
            }
          }}
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-ink bg-card px-4 py-2 text-sm font-semibold text-ink hover:bg-ink hover:text-white disabled:opacity-60"
        >
          {busy && <Spinner />} Terapkan saran ini
        </button>
      )}
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-danger">{error}</p>}
    </div>
  );
}
