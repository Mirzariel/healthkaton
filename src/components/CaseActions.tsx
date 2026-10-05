"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { InfoDot } from "@/components/explain";
import { IconSend } from "@/components/console/icons";
import { AnimatePresence, CheckMark, Spinner, motion } from "@/components/motion";

async function post(url: string, body: unknown) {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Tidak dapat terhubung ke server. Coba lagi.");
  }
  const j = (await res.json().catch(() => ({ ok: false, error: "Respons server tidak valid." }))) as { ok: boolean; error?: string };
  if (!j.ok) throw new Error(j.error ?? "Gagal.");
}

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(null), 2600);
    return () => clearTimeout(t);
  }, [done]);
  async function run(fn: () => Promise<void>, ok: string) {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await fn();
      setDone(ok);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal.");
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, done, run };
}

/** Umpan balik: galat tetap tampil sampai aksi berikutnya; sukses memudar sendiri. */
function Feedback({ error, done }: { error: string | null; done: string | null }) {
  return (
    <div aria-live="polite" role="status" className="min-h-5 text-sm">
      <AnimatePresence mode="wait">
        {error ? (
          <motion.p key="e" role="alert" className="font-semibold text-danger" initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            {error}
          </motion.p>
        ) : done ? (
          <motion.p key="d" className="font-semibold text-ok" initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            {done}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

const field = "border border-line bg-paper w-full rounded-lg px-3 py-2 text-sm transition-shadow focus-visible:border-brand disabled:cursor-not-allowed disabled:opacity-60";
const label = "block text-xs font-semibold text-ink-soft";
const btnBase = "btn-depth inline-flex min-w-[8.5rem] items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:pointer-events-none disabled:opacity-50";

/** Tombol aksi: spinner saat proses, centang singkat saat berhasil. */
function ActionButton({ busy, done, idle, working, finished, disabled, type = "submit", onClick, tone = "primary" }: {
  busy: boolean;
  done: boolean;
  idle: ReactNode;
  working: string;
  finished: string;
  disabled?: boolean;
  type?: "submit" | "button";
  onClick?: () => void;
  tone?: "primary" | "ghost";
}) {
  const cls = tone === "primary" ? btnBase : "border border-line bg-card inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold text-ink-soft transition-colors hover:bg-brand-soft disabled:opacity-50";
  return (
    <button type={type} onClick={onClick} className={cls} disabled={disabled || busy || done} aria-busy={busy}>
      {busy ? (
        <>
          <Spinner /> {working}
        </>
      ) : done ? (
        <>
          <CheckMark /> {finished}
        </>
      ) : (
        idle
      )}
    </button>
  );
}

function Locked({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-warn/25 bg-warn-soft px-3 py-2.5 text-sm font-semibold text-warn">
      <span aria-hidden className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-warn/15 text-[10px] font-semibold">!</span>
      <span>{children}</span>
    </p>
  );
}

export function AssignForm({ caseId, current, options, disabled, disabledReason }: { caseId: string; current: string | null; options: { value: string; label: string }[]; disabled: boolean; disabledReason?: string }) {
  const a = useAction();
  const [role, setRole] = useState(current ?? "verifikator");
  const [note, setNote] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        a.run(() => post(`/api/cases/${caseId}/assign`, { role, note }), "Penugasan disimpan.");
      }}
      className="space-y-2"
    >
      {disabled && disabledReason && <Locked>{disabledReason}</Locked>}
      <label className={label} htmlFor="as-role">Tugaskan kepada</label>
      <select id="as-role" className={field} value={role} onChange={(e) => setRole(e.target.value)} disabled={disabled}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <label className={label} htmlFor="as-note">Catatan (opsional)</label>
      <input id="as-note" className={field} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} disabled={disabled} />
      <ActionButton busy={a.busy} done={!!a.done} idle="Simpan" working="Menyimpan…" finished="Tersimpan" disabled={disabled} />
      <Feedback error={a.error} done={a.done} />
    </form>
  );
}

export interface ThreadMessage {
  id: number;
  who: string;
  at: string;
  text: string;
  mine: boolean;
}

/** Warna avatar per peran, supaya pembicara mudah dibedakan sekilas. */
const AVATAR: Record<string, string> = {
  "Casemix RS": "bg-info",
  Verifikator: "bg-brand",
  Auditor: "bg-ink",
  "Dokter DPJP": "bg-warn",
};

/** Percakapan gaya obrolan: milik Anda di kanan (hijau), milik pihak lain di kiri. Pesan baru masuk dari bawah dan daftar menggulir ke pesan terakhir. */
export function MessageThread({ messages }: { messages: ThreadMessage[] }) {
  const box = useRef<HTMLDivElement>(null);
  const initial = useRef(new Set(messages.map((m) => m.id)));
  const count = useRef(messages.length);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fresh = messages.length > count.current;
    count.current = messages.length;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: fresh && !reduce ? "smooth" : "auto" });
  }, [messages.length]);
  return (
    <div ref={box} role="log" aria-live="polite" aria-label="Percakapan klarifikasi" className="border border-line bg-paper max-h-80 space-y-3 overflow-y-auto overscroll-contain rounded-xl p-3">
      {messages.length === 0 && (
        <div className="py-5 text-center">
          <p className="text-sm font-semibold text-ink-soft">Belum ada pesan</p>
          <p className="mt-0.5 text-xs text-muted">Mulai dengan menulis pertanyaan atau permintaan dokumen untuk rumah sakit.</p>
        </div>
      )}
      {messages.map((m) => (
        <motion.div
          key={m.id}
          initial={initial.current.has(m.id) ? false : { opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          className={`flex items-end gap-2 ${m.mine ? "flex-row-reverse" : ""}`}
        >
          <span
            aria-hidden
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white ${AVATAR[m.who] ?? "bg-muted"}`}
          >
            {m.who.charAt(0)}
          </span>
          <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.mine ? "rounded-br-sm bg-ink text-white" : "rounded-bl-sm border border-line bg-card"}`}>
            <p className={`text-xs font-semibold ${m.mine ? "text-white/70" : "text-ink-soft"}`}>
              {m.mine ? "Anda" : m.who} <span className={`font-normal ${m.mine ? "text-white/70" : "text-muted"}`}>· {m.at}</span>
            </p>
            <p className="mt-0.5 whitespace-pre-wrap break-words">{m.text}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

export function MessageForm({ caseId, disabled, roleLabel, disabledReason }: { caseId: string; disabled: boolean; roleLabel?: string; disabledReason?: string }) {
  const a = useAction();
  const [text, setText] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        a.run(async () => {
          await post(`/api/cases/${caseId}/message`, { text });
          setText("");
        }, "Pesan terkirim.");
      }}
      className="space-y-2"
    >
      {disabled && disabledReason && <Locked>{disabledReason}</Locked>}
      <label className="sr-only" htmlFor="msg">Pesan klarifikasi</label>
      <textarea
        id="msg"
        rows={3}
        maxLength={2000}
        className={field}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled}
        placeholder="Tulis pesan, mis. mohon lampirkan lembar tindakan."
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && text.trim() && !a.busy) e.currentTarget.form?.requestSubmit();
        }}
      />
      <ActionButton busy={a.busy} done={!!a.done} idle={<><IconSend width={15} height={15} /> {roleLabel ? `Kirim sebagai ${roleLabel}` : "Kirim"}</>} working="Mengirim…" finished="Terkirim" disabled={disabled || !text.trim()} />
      <Feedback error={a.error} done={a.done} />
    </form>
  );
}

const DECISION_OPTIONS = [
  { value: "loloskan", title: "Loloskan", desc: "Klaim sah. Bukti atau alasan medisnya cukup, bayar sesuai tagihan.", dot: "bg-ok", ring: "has-[:checked]:border-ink has-[:checked]:bg-paper has-[:checked]:shadow-[inset_0_0_0_1px_var(--ink)]" },
  { value: "koreksi", title: "Koreksi nilai", desc: "Sebagian tagihan tidak sesuai. Kurangi nilai yang tidak layak dibayar.", dot: "bg-accent", ring: "has-[:checked]:border-ink has-[:checked]:bg-paper has-[:checked]:shadow-[inset_0_0_0_1px_var(--ink)]" },
  { value: "tolak", title: "Tolak", desc: "Klaim tidak layak dibayar karena tidak ada dasar yang cukup.", dot: "bg-danger", ring: "has-[:checked]:border-ink has-[:checked]:bg-paper has-[:checked]:shadow-[inset_0_0_0_1px_var(--ink)]" },
  { value: "eskalasi", title: "Eskalasi", desc: "Belum bisa diputuskan di sini. Teruskan ke auditor untuk pemeriksaan lanjutan.", dot: "bg-info", ring: "has-[:checked]:border-ink has-[:checked]:bg-paper has-[:checked]:shadow-[inset_0_0_0_1px_var(--ink)]" },
] as const;

export function DecisionForm({ caseId, disabled, disabledReason, roleLabel, claimAmount }: { caseId: string; disabled: boolean; disabledReason?: string; roleLabel?: string; claimAmount?: number }) {
  const a = useAction();
  const [decision, setDecision] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [correction, setCorrection] = useState("");
  const [confirming, setConfirming] = useState(false);
  const opt = DECISION_OPTIONS.find((o) => o.value === decision);
  const corr = Number(correction) || 0;
  const rp = (n: number) => "Rp" + n.toLocaleString("id-ID");
  const corrError =
    decision === "koreksi" && correction !== "" && claimAmount !== undefined && corr > claimAmount ? `Maksimal ${rp(claimAmount)} (nilai klaim).` : null;
  const reasonOk = reason.trim().length >= 10;
  const corrOk = decision !== "koreksi" || (corr > 0 && !corrError);
  const missing = !decision ? "Pilih keputusan." : decision === "koreksi" && !corrOk ? "Isi nilai koreksi." : !reasonOk ? "Alasan minimal 10 karakter." : null;
  const submitting = a.busy || !!a.done;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!confirming) {
          if (!missing) setConfirming(true);
          return;
        }
        a.run(() => post(`/api/cases/${caseId}/decide`, { decision, reason, correction: decision === "koreksi" ? corr : 0 }), "Keputusan dicatat pada jejak audit.");
      }}
      className="space-y-3"
    >
      {disabled && disabledReason && <Locked>{disabledReason}</Locked>}

      {!confirming ? (
        <fieldset disabled={disabled} className="min-w-0 space-y-2 disabled:opacity-60">
          <legend className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-ink-soft">
            1. Pilih satu keputusan <InfoDot k="keputusan" />
          </legend>
          {DECISION_OPTIONS.map((o) => (
            <label
              key={o.value}
              className={`border border-line bg-card flex cursor-pointer items-start gap-3 rounded-xl p-3 text-sm transition-all duration-150 has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${o.ring}`}
            >
              <input type="radio" name="decision" value={o.value} checked={decision === o.value} onChange={() => setDecision(o.value)} className="mt-1 accent-[var(--brand)] focus-visible:outline-none" />
              <span>
                <span className="flex items-center gap-2 font-semibold">
                  <span className={`h-2.5 w-2.5 rounded-full ${o.dot}`} aria-hidden />
                  {o.title}
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-ink-soft">{o.desc}</span>
              </span>
            </label>
          ))}
          {decision === "koreksi" && (
            <div>
              <label className={label} htmlFor="corr">Nilai yang dikoreksi (Rp)</label>
              <input id="corr" inputMode="numeric" className={field} value={correction} aria-invalid={!!corrError} aria-describedby={corrError ? "corr-err" : undefined} onChange={(e) => setCorrection(e.target.value.replace(/\D/g, "").slice(0, 12))} />
              {corrError && <p id="corr-err" className="mt-1 text-xs font-semibold text-danger">{corrError}</p>}
            </div>
          )}
          <div>
            <label className={label} htmlFor="reason">2. Tulis alasan <span className="font-normal text-muted">(min. 10 karakter, akan tercatat di jejak audit)</span></label>
            <textarea id="reason" rows={3} maxLength={1000} className={field} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className={btnBase} disabled={!!missing}>Tinjau keputusan</button>
            {!disabled && missing && <span className="text-xs text-muted">{missing}</span>}
          </div>
        </fieldset>
      ) : (
        <div className="border border-line bg-paper space-y-2 rounded-xl p-3 text-sm">
          <p className="text-xs font-semibold text-ink-soft">Periksa sebelum mencatat</p>
          <dl className="space-y-1.5">
            <div><dt className="text-xs text-muted">Keputusan</dt><dd className="font-semibold">{opt?.title}{decision === "koreksi" ? ` · ${rp(corr)}` : ""}</dd></div>
            <div><dt className="text-xs text-muted">Alasan</dt><dd className="whitespace-pre-wrap break-words">{reason.trim()}</dd></div>
            <div><dt className="text-xs text-muted">Atas nama</dt><dd className="font-semibold">{roleLabel ?? "Anda"}</dd></div>
          </dl>
          <p className="text-xs font-semibold text-warn">Keputusan masuk jejak audit dan tidak dapat diubah.</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <ActionButton busy={a.busy} done={!!a.done} idle="Catat keputusan" working="Mencatat…" finished="Tercatat" />
            <ActionButton type="button" tone="ghost" busy={false} done={false} idle="Kembali" working="" finished="" disabled={submitting} onClick={() => setConfirming(false)} />
          </div>
        </div>
      )}
      <Feedback error={a.error} done={a.done} />
    </form>
  );
}
