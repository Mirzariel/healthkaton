"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import SehatiLogo from "@/components/SehatiLogo";
import type { SessionView } from "@/lib/survey/service";
import { AI_MODE_LABEL } from "@/lib/labels";
import { ApiError, api, newKey } from "./api";
import { IconAlert, IconArrowLeft, IconCheck, IconEdit, IconHelp, IconInfo, IconList, IconQuestion, IconSend, IconSpeaker, IconStop } from "./icons";
import { BTN, Callout, ProgressBar, Sheet, Spinner, Tag } from "./kit";

const EASE = [0.22, 1, 0.36, 1] as const;

const AI_NAME: Record<string, string> = { live: "AI langsung", simulated: "Simulasi (bukan AI)", fallback: "Cadangan aturan" };
const ORIGIN_NOTE: Record<string, string> = { rules: "Dibaca penafsir aturan (simulasi, bukan AI)", ai: "Dibaca oleh AI" };

/** Avatar kecil penanda pesan dari sistem. */
function SystemMark() {
  return (
    <span aria-hidden className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-card ring-1 ring-line">
      <SehatiLogo size={16} showWordmark={false} />
    </span>
  );
}

/** Percakapan survei: satu pertanyaan sekali tampil, jawaban dengan tombol atau kalimat sendiri, ringkasan pemahaman yang harus dikonfirmasi. */
export function Chat({ initial, onExit, onHelp, onChanged }: { initial: SessionView; onExit: () => void; onHelp: (sessionId: string) => void; onChanged: () => void }) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [fixing, setFixing] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [showFacts, setShowFacts] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const keyRef = useRef<string | null>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const turnId = v.open?.turn_id;

  const active0 = v.session.status === "active";
  useEffect(() => {
    headRef.current?.focus({ preventScroll: true });
    setText("");
    // Gulirkan ke awal bagian yang sedang aktif agar pertanyaan terbaca dari atas.
    const sc = scroller.current;
    const cur = currentRef.current;
    if (!sc) return;
    const behavior = reduce ? "auto" : "smooth";
    if (!cur) {
      sc.scrollTo({ top: sc.scrollHeight, behavior });
      return;
    }
    if (v.history.length === 0 && v.review.length === 0 && active0) {
      sc.scrollTo({ top: 0, behavior: "auto" });
      return;
    }
    const top = cur.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 12;
    sc.scrollTo({ top: Math.max(0, top), behavior });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setPicked(null);
    }
  }
  const key = () => (keyRef.current ??= newKey());

  const answer = (body: { choice?: string; text?: string }) => {
    setPicked(body.choice ?? "__text");
    return run(() => api<SessionView>(`/api/survey/sessions/${v.session.id}/answer`, "POST", { turn_id: v.open!.turn_id, revision: v.session.revision, idem_key: key(), ...body }));
  };
  const resolve = (proposal_id: string, action: "confirm" | "correct" | "dismiss", value?: string) => {
    setPicked(`${proposal_id}:${action}${value ? `:${value}` : ""}`);
    return run(() => api<SessionView>(`/api/survey/sessions/${v.session.id}/proposals/${proposal_id}`, "POST", { action, value, revision: v.session.revision, idem_key: key() })).then(() => setFixing(null));
  };
  const correct = (fact_id: string, value: string) => run(() => api<SessionView>(`/api/survey/sessions/${v.session.id}/facts/${fact_id}`, "POST", { value, revision: v.session.revision, idem_key: key() }));
  const stop = () => {
    setConfirmStop(false);
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
  const aiHint = s.ai_mode_last && AI_MODE_LABEL[s.ai_mode_last as keyof typeof AI_MODE_LABEL] ? AI_MODE_LABEL[s.ai_mode_last as keyof typeof AI_MODE_LABEL].hint : "";
  const p = v.progress;
  const resolved = p.answered + p.unknown;
  const showProgress = active && s.mode !== "directed" && p.required > 0;
  const reviewing = active && v.review.length > 0;
  const asking = active && v.review.length === 0 && !!open;
  const sysBubble = "rounded-2xl rounded-tl-md border border-line bg-card px-4 py-3 leading-snug text-ink-soft";
  const mine = "ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-brand px-4 py-3 leading-snug text-white";

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-paper">
      <div className="shrink-0 border-b border-line bg-card">
        <div className="flex items-center gap-1 px-2 py-2">
          <button type="button" onClick={onExit} className="grid min-h-11 min-w-11 place-items-center rounded-xl text-ink hover:bg-subtle" aria-label="Kembali ke beranda. Jawaban tersimpan otomatis.">
            <IconArrowLeft size={22} />
          </button>
          <div className="min-w-0 flex-1 pr-2">
            <p className="line-clamp-2 text-[1em] font-semibold leading-tight">{s.mode === "directed" ? "Satu pertanyaan singkat" : s.stage_label}</p>
            <p className="mt-0.5 truncate text-[0.78em] text-muted">
              {s.facility_name?.replace(/\s*\(simulasi\)\s*$/i, "")} · {s.episode_kind}
              {s.respondent_role === "companion" ? " · sebagai pendamping" : ""}
            </p>
          </div>
        </div>
        {(showProgress || (active && v.facts.length > 0)) && (
          <div className="px-4 pb-2.5">
            {showProgress && <ProgressBar value={resolved} max={p.required} label="Kemajuan survei" />}
            <div className="mt-1.5 flex items-center justify-between gap-3">
              <p className="text-[0.78em] leading-tight text-ink-soft">
                {showProgress ? (
                  <>
                    <span className="font-semibold text-ink tabular-nums">{resolved} dari {p.required}</span> hal terjawab{p.may_grow ? ", bisa bertambah" : ""}
                  </>
                ) : (
                  <span aria-hidden> </span>
                )}
              </p>
              {v.facts.length > 0 && (
                <button type="button" onClick={() => setShowFacts(true)} aria-haspopup="dialog" className="-mr-2 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-2 text-[0.82em] font-semibold text-brand-ink hover:bg-brand-tint">
                  <IconList size={17} /> Jawaban saya
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4" aria-live="polite">
        {s.respondent_role === "companion" && (
          <Callout tone="brand" icon={<IconInfo size={18} className="text-brand" />}>
            Anda menjawab sebagai pendamping. Jawaban dicatat terpisah dari pengalaman langsung peserta.
          </Callout>
        )}
        {s.uses_draft && (
          <Callout tone="neutral" icon={<IconInfo size={18} />}>
            Pertanyaan ini masih draf menunggu validasi. Jawaban Anda bukan dasar penilaian resmi.
          </Callout>
        )}
        {s.mode === "directed" && s.subject && (
          <div className="flex items-start gap-2">
            <SystemMark />
            <div className="rounded-2xl rounded-tl-md bg-brand-soft px-4 py-3 leading-snug text-ink">
              <p className="font-semibold">Kami ingin memastikan satu hal</p>
              <p className="mt-1 text-[0.9em] text-ink-soft">Tentang {s.subject.service_lay}, {s.subject.when}. Lupa atau tidak yakin itu wajar, bukan masalah.</p>
            </div>
          </div>
        )}
        {s.mode !== "directed" && v.history.length === 0 && (
          <div className="flex items-start gap-2">
            <SystemMark />
            <div className="rounded-2xl rounded-tl-md bg-brand-soft px-4 py-3 leading-snug text-ink">
              <p className="font-semibold">Tidak ada jawaban yang salah.</p>
              <p className="mt-1 text-[0.9em] text-ink-soft">Jawab sesuai pengalaman Anda. “Lupa / tidak yakin” boleh dipilih, bukan masalah. Berhenti kapan saja.</p>
            </div>
          </div>
        )}

        {v.history.map((h) => (
          <div key={h.turn_id} className="space-y-2">
            <div className="flex items-start gap-2">
              <SystemMark />
              <p className={`${sysBubble} max-w-[88%] text-[0.95em]`}>{h.question}</p>
            </div>
            <p className={`${mine} text-[0.95em]`}>{h.answer}</p>
          </div>
        ))}

        {v.notice && (
          <Callout tone="neutral" role="status" icon={<IconInfo size={18} />}>
            {v.notice}
          </Callout>
        )}

        <AnimatePresence mode="wait" initial={false}>
          {reviewing && (
            <motion.div key="review" ref={currentRef} initial={{ opacity: 0, y: reduce ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: EASE }}>
              <section aria-labelledby="rv-h" className="rounded-2xl border-2 border-dashed border-warn/50 bg-warn-soft/45 p-4">
                <Tag tone="warn"><IconEdit size={13} /> Usulan, belum tersimpan</Tag>
                <h2 id="rv-h" ref={headRef} tabIndex={-1} className="mt-2 text-[1.15em] font-semibold leading-snug outline-none">Ini yang saya tangkap dari jawaban Anda. Sudah benar?</h2>
                <ul className="mt-3 space-y-3">
                  {v.review.map((r) => (
                    <li key={r.id} className="rounded-xl border border-line bg-card p-3.5">
                      <p className="text-[0.82em] text-muted">{r.slot_label}</p>
                      <p className="mt-0.5 text-[1.15em] font-semibold leading-snug">{r.value_label}</p>
                      {r.quote && <p className="mt-2 border-l-2 border-line-strong pl-3 text-[0.88em] italic leading-snug text-ink-soft">dari kalimat Anda: “{r.quote}”</p>}
                      <p className="mt-1.5 text-[0.75em] leading-snug text-muted">{ORIGIN_NOTE[r.origin]}</p>
                      {fixing === r.id ? (
                        <div className="mt-3 grid gap-2">
                          <p className="text-[0.85em] font-medium text-ink">Pilih jawaban yang tepat:</p>
                          {r.allowed.filter((a) => a.value !== r.value).map((a) => (
                            <button key={a.value} type="button" disabled={busy} onClick={() => resolve(r.id, "correct", a.value)} className={`${BTN.secondary} justify-start text-left`}>
                              {busy && picked === `${r.id}:correct:${a.value}` && <Spinner />} {a.label}
                            </button>
                          ))}
                          <button type="button" onClick={() => setFixing(null)} className={BTN.ghost}>Batal</button>
                        </div>
                      ) : (
                        <div className="mt-3 space-y-2">
                          <button type="button" disabled={busy} onClick={() => resolve(r.id, "confirm")} className={BTN.primary}>
                            {busy && picked === `${r.id}:confirm` ? <Spinner /> : <IconCheck size={18} />} Benar
                          </button>
                          <div className="grid grid-cols-2 gap-2">
                            <button type="button" disabled={busy} onClick={() => setFixing(r.id)} className={BTN.secondary}>Ubah</button>
                            <button type="button" disabled={busy} onClick={() => resolve(r.id, "dismiss")} className={BTN.secondary}>
                              {busy && picked === `${r.id}:dismiss` && <Spinner />} Bukan itu
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            </motion.div>
          )}

          {asking && open && (
            <motion.div key={open.turn_id} ref={currentRef} initial={{ opacity: 0, y: reduce ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: EASE }}>
              <section aria-labelledby="q-h" className="space-y-3">
                <div className="flex items-start gap-2">
                  <SystemMark />
                  <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-line bg-card p-4 shadow-depth-1">
                    {open.kind !== "core" && <p className="mb-1.5"><Tag tone="muted">Pertanyaan lanjutan</Tag></p>}
                    <h2 id="q-h" ref={headRef} tabIndex={-1} className="text-[1.1em] font-semibold leading-snug outline-none">{open.text}</h2>
                    {open.helper && <p className="mt-1.5 text-[0.88em] leading-snug text-ink-soft">{open.helper}</p>}
                    {open.glossary.map((g) => (
                      <p key={g.term} className="mt-2 rounded-lg bg-subtle px-3 py-2 text-[0.85em] leading-snug text-ink-soft"><span className="font-semibold text-ink">{g.term}:</span> {g.plain}</p>
                    ))}
                    {open.needs_rephrase && <p className="mt-2 flex gap-2 rounded-lg bg-warn-soft px-3 py-2 text-[0.85em] leading-snug text-warn"><IconAlert size={17} className="mt-0.5 shrink-0" /> Silakan pilih salah satu jawaban di bawah, atau tulis dengan kalimat lain.</p>}
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <button type="button" onClick={() => listen(open.text)} aria-pressed={speaking} className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-[0.85em] font-semibold text-ink-soft hover:bg-subtle hover:text-ink">
                        {speaking ? <IconStop size={17} /> : <IconSpeaker size={17} />} {speaking ? "Hentikan suara" : "Dengarkan"}
                      </button>
                      {open.text_source === "ai_phrase" && <span className="text-[0.78em] text-muted">Kalimat dibantu AI</span>}
                    </div>
                  </div>
                </div>
                {open.options.length > 0 && (
                  <div className="grid gap-2" role="group" aria-label="Pilihan jawaban">
                    {open.options.map((o) => {
                      const soft = o.value === "unknown" || o.value === "not_understood";
                      const on = busy && picked === o.value;
                      return (
                        <button
                          key={o.value}
                          type="button"
                          disabled={busy}
                          aria-pressed={on}
                          onClick={() => answer({ choice: o.value })}
                          className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border px-4 py-2.5 text-left text-[1.05em] font-semibold leading-snug transition-colors duration-150 active:scale-[0.99] disabled:cursor-not-allowed ${
                            on
                              ? "border-brand bg-brand-soft text-brand-ink"
                              : soft
                                ? "border-dashed border-line-strong bg-paper text-ink-soft hover:bg-subtle disabled:opacity-50"
                                : "border-line-strong bg-card text-ink hover:border-brand hover:bg-brand-tint disabled:opacity-50"
                          }`}
                        >
                          <span aria-hidden className={`grid size-6 shrink-0 place-items-center rounded-full ${on ? "bg-brand text-white" : soft ? "text-muted" : "border-2 border-line-strong"}`}>
                            {on ? <Spinner size={14} /> : soft ? <IconQuestion size={20} /> : null}
                          </span>
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                )}
                {open.text_allowed && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (text.trim()) answer({ text });
                    }}
                    className="space-y-2 rounded-2xl border border-line bg-card p-3.5"
                  >
                    <label htmlFor="free" className="block text-[0.88em] font-semibold text-ink">{open.options.length ? "Atau tulis dengan kalimat Anda sendiri" : "Tulis jawaban Anda"}</label>
                    <textarea id="free" value={text} onChange={(e) => setText(e.target.value)} maxLength={600} rows={3} placeholder="Contoh: obatnya baru sebagian yang saya terima" className="w-full rounded-xl border border-line-strong bg-paper p-3 leading-snug" />
                    <button type="submit" disabled={busy || !text.trim()} className={open.options.length ? BTN.secondary : BTN.primary}>
                      {busy && picked === "__text" ? <Spinner /> : <IconSend size={18} />} {busy && picked === "__text" ? "Membaca jawaban…" : "Kirim jawaban"}
                    </button>
                  </form>
                )}
              </section>
            </motion.div>
          )}

          {!active && v.outcome && (
            <motion.div key="done" ref={currentRef} initial={{ opacity: 0, y: reduce ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: EASE }}>
              <section aria-labelledby="done-h" className="space-y-3 rounded-2xl border border-line bg-card p-5">
                <span className="grid size-14 place-items-center rounded-full bg-ok-soft text-ok" aria-hidden><IconCheck size={28} /></span>
                <h2 id="done-h" ref={headRef} tabIndex={-1} className="text-[1.3em] font-semibold leading-snug outline-none">{v.outcome.status === "completed" ? "Terima kasih, sudah selesai" : v.outcome.status === "cancelled" ? "Survei dibatalkan" : "Terima kasih. Jawaban Anda tersimpan"}</h2>
                {v.outcome.lines.map((l) => <p key={l} className="text-[0.92em] leading-snug text-ink-soft">{l}</p>)}
                {v.facts.length > 0 && (
                  <div className="rounded-xl border border-line bg-paper p-3.5">
                    <p className="flex items-center gap-1.5 text-[0.85em] font-semibold text-ok"><IconCheck size={16} /> Jawaban yang tersimpan</p>
                    <ul className="mt-2 divide-y divide-line">
                      {v.facts.map((f) => (
                        <li key={f.id} className="py-2 text-[0.9em] leading-snug first:pt-0 last:pb-0">
                          <span className="block text-[0.88em] text-muted">{f.slot_label}</span>
                          <span className="font-semibold">{f.value_label}</span>
                          {f.corrected && <span className="text-muted"> (sudah Anda ubah)</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {v.outcome.reports_created > 0 && (
                  <Callout tone="brand" icon={<IconInfo size={18} className="text-brand" />}>
                    Kendala yang Anda sebut diteruskan ke petugas sebagai informasi awal, bukan tuduhan. Pantau di beranda, pada “Laporan saya”.
                  </Callout>
                )}
                <button type="button" onClick={onExit} className={BTN.primary}>Kembali ke beranda</button>
              </section>
            </motion.div>
          )}
        </AnimatePresence>

        {v.help_open && (
          <Callout tone="warn" icon={<IconAlert size={18} className="text-warn" />}>
            Pesan Anda diteruskan ke petugas. Ini bukan saran medis; bila darurat, segera ke IGD terdekat.
          </Callout>
        )}
        {err && (
          <Callout tone="danger" role="alert" icon={<IconAlert size={18} />}>
            {err}
          </Callout>
        )}
      </div>

      {active && (
        <div className="shrink-0 border-t border-line bg-card px-3 pb-2 pt-2">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => onHelp(s.id)} className={`${BTN.ghost} border border-line py-1.5 text-[14px] text-ink`}>
              <IconHelp size={16} className="shrink-0" /> Butuh bantuan petugas
            </button>
            <button type="button" onClick={() => setConfirmStop(true)} disabled={busy} aria-haspopup="dialog" className={`${BTN.ghost} border border-line py-1.5 text-[14px]`}>
              Berhenti sekarang
            </button>
          </div>
          <details className="group mt-1">
            <summary className="flex min-h-9 cursor-pointer items-center justify-between gap-2 px-1 text-[0.75em] leading-snug text-muted">
              <span>{aiLabel ? <>Pemahaman jawaban bebas: <strong className="font-semibold text-ink-soft">{aiLabel}</strong></> : "Cara jawaban Anda dibaca"}</span>
              <span className="shrink-0 font-semibold text-ink-soft underline underline-offset-2 group-open:hidden">Selengkapnya</span>
            </summary>
            <p className="px-1 pb-1 text-[0.75em] leading-snug text-muted">
              AI membantu memahami kalimat Anda; aturan menentukan pertanyaan. AI tidak memutuskan apa pun.
              {aiHint ? ` ${aiHint}` : ""}
            </p>
          </details>
        </div>
      )}

      <AnimatePresence>
        {showFacts && (
          <Sheet key="facts" title="Jawaban saya" titleId="fs-h" onClose={() => setShowFacts(false)}>
            <FactsList v={v} busy={busy} editable={active && v.review.length === 0} onFix={correct} />
          </Sheet>
        )}
        {confirmStop && (
          <Sheet key="stop" title="Berhenti sekarang?" titleId="stop-h" onClose={() => setConfirmStop(false)}>
            <p className="text-[0.92em] leading-snug text-ink-soft">Jawaban yang sudah Anda konfirmasi tetap tersimpan, sisanya tidak ditanyakan lagi.</p>
            <div className="grid gap-2 pt-1">
              <button type="button" onClick={() => setConfirmStop(false)} className={BTN.primary}>Lanjut menjawab</button>
              <button type="button" onClick={stop} className={BTN.secondary}>Ya, berhenti</button>
            </div>
          </Sheet>
        )}
      </AnimatePresence>
    </div>
  );
}

function FactsList({ v, busy, editable, onFix }: { v: SessionView; busy: boolean; editable: boolean; onFix: (factId: string, value: string) => void }): ReactNode {
  return (
    <>
      <p className="text-[0.88em] leading-snug text-ink-soft">{editable ? "Salah memilih? Ubah di sini. Pertanyaan berikutnya menyesuaikan." : "Dapat diubah saat sesi berjalan dan tanpa usulan yang menunggu."}</p>
      <ul className="space-y-2">
        {v.facts.map((f) => (
          <li key={f.id} className="rounded-xl border border-line bg-card p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[0.82em] text-muted">{f.slot_label}</p>
              <Tag tone={f.corrected ? "info" : "ok"}><IconCheck size={12} /> {f.corrected ? "Sudah diubah" : "Tersimpan"}</Tag>
            </div>
            {editable ? (
              <select value={f.value} disabled={busy} onChange={(e) => onFix(f.id, e.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-line-strong bg-card px-3 font-semibold" aria-label={`Ubah jawaban: ${f.slot_label}`}>
                {f.editable.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <p className="mt-1 font-semibold leading-snug">{f.value_label}</p>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
