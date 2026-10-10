"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { SessionView } from "@/lib/survey/service";
import { AI_MODE_LABEL } from "@/lib/labels";
import { ApiError, api, newKey } from "./api";
import { IconArrowLeft, IconCheck, IconInfo, IconList, IconSpeaker, IconStop } from "./icons";

const EASE = [0.22, 1, 0.36, 1] as const;

const AI_NAME: Record<string, string> = { live: "AI langsung", simulated: "Simulasi (bukan AI)", fallback: "Cadangan aturan" };
const ORIGIN_NOTE: Record<string, string> = { rules: "Dibaca oleh penafsir aturan (simulasi, bukan model AI)", ai: "Dibaca oleh AI" };

/** Percakapan survei: satu pertanyaan sekali tampil, jawaban dengan tombol atau kalimat sendiri, ringkasan pemahaman yang harus dikonfirmasi. */
export function Chat({ initial, onExit, onHelp, onChanged }: { initial: SessionView; onExit: () => void; onHelp: (sessionId: string) => void; onChanged: () => void }) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [fixing, setFixing] = useState<string | null>(null);
  const [showFacts, setShowFacts] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const keyRef = useRef<string | null>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const turnId = v.open?.turn_id;

  useEffect(() => {
    headRef.current?.focus({ preventScroll: true });
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
    setText("");
  }, [turnId, v.review.length, v.session.status]);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  async function run(fn: () => Promise<SessionView>) {
    setBusy(true);
    setErr(null);
    try {
      const next = await fn();
      keyRef.current = null;
      setV(next);
      onChanged();
    } catch (e) {
      if (e instanceof ApiError && e.code === "stale_revision") {
        try {
          const fresh = await api<SessionView>(`/api/survey/sessions/${v.session.id}`);
          keyRef.current = null;
          setV({ ...fresh, notice: "Tampilan diperbarui karena sesi berubah di tempat lain. Silakan lanjutkan." });
        } catch {
          setErr(e.message);
        }
      } else setErr(e instanceof Error ? e.message : "Terjadi kesalahan.");
    } finally {
      setBusy(false);
    }
  }
  const key = () => (keyRef.current ??= newKey());

  const answer = (body: { choice?: string; text?: string }) =>
    run(() => api<SessionView>(`/api/survey/sessions/${v.session.id}/answer`, "POST", { turn_id: v.open!.turn_id, revision: v.session.revision, idem_key: key(), ...body }));
  const resolve = (proposal_id: string, action: "confirm" | "correct" | "dismiss", value?: string) =>
    run(() => api<SessionView>(`/api/survey/sessions/${v.session.id}/proposals/${proposal_id}`, "POST", { action, value, revision: v.session.revision, idem_key: key() })).then(() => setFixing(null));
  const correct = (fact_id: string, value: string) => run(() => api<SessionView>(`/api/survey/sessions/${v.session.id}/facts/${fact_id}`, "POST", { value, revision: v.session.revision, idem_key: key() }));
  const stop = () => {
    if (!confirm("Berhenti sekarang? Jawaban yang sudah Anda konfirmasi tetap tersimpan, sisanya tidak ditanyakan lagi.")) return;
    run(() => api<SessionView>(`/api/survey/sessions/${v.session.id}/stop`, "POST", { revision: v.session.revision, idem_key: key() }));
  };

  function listen(t: string) {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(t);
    u.lang = "id-ID";
    u.onend = () => setSpeaking(false);
    setSpeaking(true);
    synth.speak(u);
  }

  const s = v.session;
  const open = v.open;
  const active = s.status === "active";
  const aiLabel = s.ai_mode_last ? AI_NAME[s.ai_mode_last] ?? s.ai_mode_last : null;
  const bubble = "rounded-2xl px-4 py-3 leading-snug";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-line bg-card px-3 py-2">
        <button type="button" onClick={onExit} className="grid min-h-11 min-w-11 place-items-center rounded-xl text-ink hover:bg-paper" aria-label="Kembali ke beranda. Jawaban tersimpan otomatis.">
          <IconArrowLeft size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{s.mode === "directed" ? "Satu pertanyaan singkat" : s.stage_label}</p>
          <p className="truncate text-xs text-muted">{s.facility_name?.replace(/\s*\(simulasi\)\s*$/i, "")} · {s.episode_kind}</p>
        </div>
        {v.facts.length > 0 && (
          <button type="button" onClick={() => setShowFacts((x) => !x)} aria-expanded={showFacts} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-semibold hover:bg-paper">
            <IconList size={18} /> Jawaban saya
          </button>
        )}
      </div>

      <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4" aria-live="polite">
        {s.respondent_role === "companion" && (
          <p className="rounded-xl border border-line bg-brand-soft/60 px-3 py-2 text-sm text-ink-soft">Anda menjawab sebagai pendamping. Jawaban dicatat sebagai jawaban pendamping, bukan pengalaman langsung peserta.</p>
        )}
        {s.uses_draft && (
          <p className="flex gap-2 rounded-xl border border-dashed border-ink/25 px-3 py-2 text-xs text-ink-soft">
            <IconInfo size={16} className="mt-0.5 shrink-0" /> Pertanyaan pada sesi ini masih draf menunggu validasi pemilik proses. Jawaban Anda tidak dipakai sebagai dasar penilaian resmi.
          </p>
        )}
        {s.mode === "directed" && s.subject && (
          <div className={`${bubble} bg-brand-soft text-ink`}>
            <p className="font-semibold">Kami ingin memastikan satu hal</p>
            <p className="mt-1 text-sm text-ink-soft">Tentang {s.subject.service_lay}, {s.subject.when}. Bila Anda tidak ingat atau tidak yakin, itu jawaban yang wajar dan tidak dianggap masalah.</p>
          </div>
        )}
        {s.mode !== "directed" && v.history.length === 0 && (
          <div className={`${bubble} bg-brand-soft text-ink`}>
            <p className="font-semibold">Tidak ada jawaban yang salah.</p>
            <p className="mt-1 text-sm text-ink-soft">Jawab sesuai yang Anda alami. “Lupa / tidak yakin” dan “tidak paham” boleh dipilih dan tidak dihitung sebagai masalah. Anda bisa berhenti kapan saja.</p>
          </div>
        )}

        {v.history.map((h) => (
          <div key={h.turn_id} className="space-y-1.5">
            <p className={`${bubble} max-w-[92%] border border-line bg-card text-[15px] text-ink-soft`}>{h.question}</p>
            <p className={`${bubble} ml-auto max-w-[85%] bg-ink text-[15px] text-white`}>{h.answer}</p>
          </div>
        ))}

        {v.notice && (
          <p role="status" className="rounded-xl border border-line bg-card px-3 py-2 text-sm text-ink-soft">{v.notice}</p>
        )}

        <AnimatePresence mode="wait" initial={false}>
          {active && v.review.length > 0 && (
            <motion.section key="review" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: EASE }} aria-labelledby="rv-h" className="space-y-3 rounded-2xl border-2 border-brand/30 bg-card p-4">
              <h2 id="rv-h" ref={headRef} tabIndex={-1} className="text-lg font-semibold leading-snug">Ini yang saya tangkap dari jawaban Anda. Sudah benar?</h2>
              <p className="text-sm text-ink-soft">Tidak ada yang tersimpan sebagai jawaban sebelum Anda mengonfirmasi.</p>
              <ul className="space-y-3">
                {v.review.map((r) => (
                  <li key={r.id} className="rounded-xl border border-line p-3">
                    <p className="text-sm text-muted">{r.slot_label}</p>
                    <p className="text-lg font-semibold">{r.value_label}</p>
                    {r.quote && <p className="mt-1 text-sm text-ink-soft">dari kalimat Anda: “{r.quote}”</p>}
                    <p className="mt-0.5 text-xs text-muted">{ORIGIN_NOTE[r.origin]}</p>
                    {fixing === r.id ? (
                      <div className="mt-3 grid gap-2">
                        {r.allowed.filter((a) => a.value !== r.value).map((a) => (
                          <button key={a.value} type="button" disabled={busy} onClick={() => resolve(r.id, "correct", a.value)} className="min-h-12 rounded-xl border-2 border-line bg-card px-4 text-left font-semibold hover:border-ink/40 disabled:opacity-50">{a.label}</button>
                        ))}
                        <button type="button" onClick={() => setFixing(null)} className="min-h-11 text-sm font-semibold text-ink-soft underline">Batal</button>
                      </div>
                    ) : (
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <button type="button" disabled={busy} onClick={() => resolve(r.id, "confirm")} className="min-h-12 rounded-xl bg-brand px-2 font-semibold text-white disabled:opacity-50">Benar</button>
                        <button type="button" disabled={busy} onClick={() => setFixing(r.id)} className="min-h-12 rounded-xl border-2 border-line bg-card px-2 font-semibold disabled:opacity-50">Ubah</button>
                        <button type="button" disabled={busy} onClick={() => resolve(r.id, "dismiss")} className="min-h-12 rounded-xl border-2 border-line bg-card px-2 font-semibold disabled:opacity-50">Bukan itu</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </motion.section>
          )}

          {active && v.review.length === 0 && open && (
            <motion.section key={open.turn_id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: EASE }} aria-labelledby="q-h" className="space-y-3">
              <div className="rounded-2xl border border-line bg-card p-4">
                {open.kind !== "core" && <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Pertanyaan lanjutan</p>}
                <h2 id="q-h" ref={headRef} tabIndex={-1} className="text-xl font-semibold leading-snug">{open.text}</h2>
                {open.helper && <p className="mt-1.5 text-sm text-ink-soft">{open.helper}</p>}
                {open.glossary.map((g) => (
                  <p key={g.term} className="mt-1.5 text-sm text-ink-soft"><span className="font-semibold">{g.term}:</span> {g.plain}</p>
                ))}
                {open.needs_rephrase && <p className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">Silakan pilih salah satu jawaban di bawah, atau tulis dengan kalimat lain.</p>}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
                  <button type="button" onClick={() => listen(open.text)} className="inline-flex min-h-9 items-center gap-1.5 font-semibold text-ink-soft underline-offset-4 hover:underline">
                    {speaking ? <IconStop size={16} /> : <IconSpeaker size={16} />} {speaking ? "Hentikan suara" : "Dengarkan"}
                  </button>
                  {open.text_source === "ai_phrase" && <span>Kalimat dibantu AI</span>}
                </div>
              </div>
              {open.options.length > 0 && (
                <div className="grid gap-2" role="group" aria-label="Pilihan jawaban">
                  {open.options.map((o) => (
                    <button key={o.value} type="button" disabled={busy} onClick={() => answer({ choice: o.value })} className={`flex min-h-14 w-full items-center rounded-2xl border-2 px-4 text-left text-lg font-semibold leading-tight transition active:scale-[0.99] disabled:opacity-50 ${o.value === "unknown" || o.value === "not_understood" ? "border-line bg-paper text-ink-soft" : "border-line bg-card text-ink hover:border-brand"}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
              {open.text_allowed && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (text.trim()) answer({ text });
                  }}
                  className="space-y-2"
                >
                  <label htmlFor="free" className="block text-sm font-medium text-ink-soft">{open.options.length ? "Atau tulis dengan kalimat Anda sendiri" : "Tulis jawaban Anda"}</label>
                  <textarea id="free" value={text} onChange={(e) => setText(e.target.value)} maxLength={600} rows={3} placeholder="Contoh: obatnya baru sebagian yang saya terima" className="w-full rounded-xl border-2 border-line bg-card p-3 text-base outline-offset-2 focus:border-brand" />
                  <button type="submit" disabled={busy || !text.trim()} className="min-h-12 w-full rounded-xl bg-ink px-4 font-semibold text-white disabled:opacity-40">{busy ? "Membaca jawaban…" : "Kirim jawaban"}</button>
                </form>
              )}
            </motion.section>
          )}

          {!active && v.outcome && (
            <motion.section key="done" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: EASE }} aria-labelledby="done-h" className="space-y-3 rounded-2xl border border-line bg-card p-4">
              <span className="grid size-12 place-items-center rounded-xl bg-ok-soft text-ok"><IconCheck size={26} /></span>
              <h2 id="done-h" ref={headRef} tabIndex={-1} className="text-xl font-semibold">{v.outcome.status === "completed" ? "Terima kasih, sudah selesai" : v.outcome.status === "cancelled" ? "Survei dibatalkan" : "Terima kasih. Jawaban Anda tersimpan"}</h2>
              {v.outcome.lines.map((l) => <p key={l} className="text-sm text-ink-soft">{l}</p>)}
              {v.outcome.reports_created > 0 && (
                <p className="rounded-xl bg-brand-soft px-3 py-2 text-sm text-ink-soft">Karena Anda menyebut kendala, laporannya diteruskan ke petugas sebagai informasi awal untuk diperiksa. Ini bukan tuduhan kepada siapa pun. Statusnya bisa Anda pantau di beranda, pada “Laporan saya”.</p>
              )}
              <button type="button" onClick={onExit} className="min-h-12 w-full rounded-xl bg-brand px-4 font-semibold text-white">Kembali ke beranda</button>
            </motion.section>
          )}
        </AnimatePresence>

        {v.help_open && (
          <p className="rounded-xl border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-warn">
            Pesan Anda kami teruskan ke petugas untuk ditindaklanjuti. Aplikasi ini tidak memberi saran medis. Bila keadaan Anda darurat, segera ke IGD terdekat atau hubungi layanan darurat setempat.
          </p>
        )}
        {err && <p role="alert" className="rounded-xl border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger">{err}</p>}

        {showFacts && (
          <FactsSheet v={v} busy={busy} editable={active && v.review.length === 0} onFix={correct} onClose={() => setShowFacts(false)} />
        )}
      </div>

      {active && (
        <div className="space-y-1.5 border-t border-line bg-card px-4 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => onHelp(s.id)} className="min-h-11 text-sm font-semibold text-ink underline underline-offset-4">Butuh bantuan petugas</button>
            <button type="button" onClick={stop} disabled={busy} className="min-h-11 text-sm font-semibold text-ink-soft underline underline-offset-4 disabled:opacity-50">Berhenti sekarang</button>
          </div>
          <p className="text-[11px] leading-snug text-muted">
            {aiLabel ? <>Pemahaman jawaban bebas: <strong className="font-semibold">{aiLabel}</strong>. </> : null}
            AI membantu memahami kalimat Anda; aturan menentukan pertanyaan. AI tidak memutuskan apa pun.
            {s.ai_mode_last && AI_MODE_LABEL[s.ai_mode_last as keyof typeof AI_MODE_LABEL] ? ` ${AI_MODE_LABEL[s.ai_mode_last as keyof typeof AI_MODE_LABEL].hint}` : ""}
          </p>
        </div>
      )}
    </div>
  );
}

function FactsSheet({ v, busy, editable, onFix, onClose }: { v: SessionView; busy: boolean; editable: boolean; onFix: (factId: string, value: string) => void; onClose: () => void }): ReactNode {
  return (
    <section aria-labelledby="fs-h" className="space-y-3 rounded-2xl border border-line bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="fs-h" className="text-lg font-semibold">Jawaban saya</h2>
        <button type="button" onClick={onClose} className="min-h-11 px-2 text-sm font-semibold underline">Tutup</button>
      </div>
      <p className="text-sm text-ink-soft">{editable ? "Salah memilih? Ubah di sini. Pertanyaan berikutnya akan menyesuaikan." : "Perubahan hanya dapat dilakukan saat sesi berjalan dan tidak ada usulan yang menunggu konfirmasi."}</p>
      <ul className="space-y-2">
        {v.facts.map((f) => (
          <li key={f.id} className="rounded-xl border border-line p-3">
            <p className="text-sm text-muted">{f.slot_label}{f.corrected ? " · sudah diubah" : ""}</p>
            {editable ? (
              <select value={f.value} disabled={busy} onChange={(e) => onFix(f.id, e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2 text-base font-semibold" aria-label={`Ubah jawaban: ${f.slot_label}`}>
                {f.editable.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <p className="font-semibold">{f.value_label}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
