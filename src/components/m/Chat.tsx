"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { SessionView } from "@/lib/survey/service";
import { AI_MODE_LABEL } from "@/lib/labels";
import { ApiError, api, newKey } from "./api";
import { IconAlert, IconArrowLeft, IconChat, IconCheck, IconEdit, IconHelp, IconInfo, IconList, IconPen, IconQuestion, IconSend, IconSpeaker, IconStop, IconX } from "./icons";
import { AutoPager, BTN, Callout, Done, EASE, Overlay, overflows, ProgressBar, Sheet, Spinner, Tag, useFitLevel } from "./kit";

const AI_NAME: Record<string, string> = { live: "AI langsung", simulated: "Simulasi (bukan AI)", fallback: "Cadangan aturan" };
const ORIGIN_NOTE: Record<string, string> = { rules: "Dibaca penafsir aturan (simulasi, bukan AI)", ai: "Dibaca oleh AI" };

type Fix = { factId: string; label: string; current: string; options: { value: string; label: string }[] };

/**
 * Survei satu pertanyaan per layar. Tidak ada log percakapan yang panjang: hanya pertanyaan saat ini dan jawaban
 * terakhir (bisa diubah). Usulan dari jawaban bebas diperiksa satu per satu. Percakapan lengkap ada di "Lihat percakapan".
 */
export function Chat({ initial, onExit, onHelp, onChanged }: { initial: SessionView; onExit: () => void; onHelp: (sessionId: string) => void; onChanged: () => void }) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const [fixingReview, setFixingReview] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [panel, setPanel] = useState<null | "facts" | "transcript" | "stop" | "info" | "explain">(null);
  const [fix, setFix] = useState<Fix | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const keyRef = useRef<string | null>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const reduce = useReducedMotion();
  const turnId = v.open?.turn_id;
  const body = useRef<HTMLDivElement>(null);
  /* Kepadatan adaptif: bila kartu pertanyaan menyita terlalu banyak ruang (huruf besar / layar pendek), ringkaskan. */
  const fit = useFitLevel(body, 2, (el) => {
    const q = el.querySelector<HTMLElement>("[data-qcard]");
    return overflows(el) || (!!q && q.offsetHeight > el.clientHeight * 0.42);
  }, [turnId, v.review.length, v.session.status, typing]);

  useEffect(() => {
    headRef.current?.focus({ preventScroll: true });
    setText("");
    setTyping(false);
    setFixingReview(null);
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
    return run(() => api<SessionView>(`/api/survey/sessions/${v.session.id}/proposals/${proposal_id}`, "POST", { action, value, revision: v.session.revision, idem_key: key() })).then(() => setFixingReview(null));
  };
  const correct = (fact_id: string, value: string) => run(() => api<SessionView>(`/api/survey/sessions/${v.session.id}/facts/${fact_id}`, "POST", { value, revision: v.session.revision, idem_key: key() }));
  const stop = () => {
    setPanel(null);
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
  const directed = s.mode === "directed";
  const reviewing = active && v.review.length > 0;
  const asking = active && v.review.length === 0 && !!open;
  const editable = active && v.review.length === 0;
  const facility = s.facility_name?.replace(/\s*\(simulasi\)\s*$/i, "");

  const last = v.history.length > 0 ? v.history[v.history.length - 1] : null;
  const lastFact = last ? v.facts.find((f) => f.turn_id === last.turn_id) : undefined;
  const openFix = (f: SessionView["facts"][number]) => setFix({ factId: f.id, label: f.slot_label, current: f.value, options: f.editable });

  const progressLabel = !active
    ? null
    : reviewing
      ? "Periksa jawaban"
      : directed
        ? "Satu pertanyaan"
        : p.required > 0
          ? `Pertanyaan ${Math.min(resolved + 1, p.required)} dari ${p.required}`
          : null;

  const stepKey = reviewing ? `rv-${v.review[0].id}-${fixingReview ?? ""}` : asking ? `q-${open!.turn_id}-${typing ? "t" : "o"}` : `end-${s.status}`;

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-paper">
      <header className="shrink-0 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="flex min-h-12 items-center justify-between gap-2">
          <button type="button" onClick={onExit} className="-ml-2 inline-flex min-h-12 items-center gap-1.5 rounded-xl px-2 font-semibold text-brand-ink hover:bg-brand-tint" aria-label="Kembali ke beranda. Jawaban tersimpan otomatis.">
            <IconArrowLeft size={22} /> Beranda
          </button>
          {progressLabel && <p className="text-right text-[0.95em] font-semibold tabular-nums text-ink">{progressLabel}</p>}
        </div>
        {active && !directed && !reviewing && p.required > 0 && (
          <div className="mt-1.5">
            <ProgressBar value={resolved} max={p.required} label="Kemajuan survei" />
          </div>
        )}
      </header>

      <div ref={body} className="relative flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 pb-3 no-scrollbar" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={stepKey}
            className="flex min-h-0 flex-1 flex-col gap-3"
            initial={{ opacity: 0, x: reduce ? 0 : 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: reduce ? 0 : -24 }}
            transition={{ duration: 0.22, ease: EASE }}
          >
            {(v.notice || err) && (
              <Callout tone={err ? "danger" : "neutral"} role={err ? "alert" : "status"} icon={err ? <IconAlert size={18} /> : <IconInfo size={18} />}>
                {err ?? v.notice}
              </Callout>
            )}

            {/* ---------- Pertanyaan ---------- */}
            {asking && open && (
              <>
                {last && last.answer && fit < 2 && (
                  <div className="flex shrink-0 items-center gap-2 rounded-2xl bg-card py-1.5 pl-3.5 pr-1.5 shadow-e1">
                    <p className="min-w-0 flex-1 truncate text-[0.92em] leading-snug text-ink-soft">
                      Jawaban tadi: <span className="font-semibold text-ink">{lastFact?.value_label ?? last.answer}</span>
                    </p>
                    {lastFact && lastFact.editable.length > 1 && (
                      <button type="button" onClick={() => openFix(lastFact)} disabled={busy} className="inline-flex min-h-12 shrink-0 items-center gap-1 rounded-xl px-3 font-semibold text-brand-ink hover:bg-brand-tint">
                        <IconEdit size={17} /> Ubah
                      </button>
                    )}
                  </div>
                )}

                <section data-qcard aria-labelledby="q-h" className={`shrink-0 rounded-[1.75rem] bg-card shadow-e2 ${fit ? "p-4" : "p-5"}`}>
                  {v.history.length === 0 && !typing && fit === 0 && (
                    <p className="text-[0.92em] font-semibold leading-snug text-brand-ink">
                      {directed ? "Lupa atau tidak yakin itu wajar." : "Tidak ada jawaban yang salah."}
                      {s.respondent_role === "companion" ? " Anda menjawab sebagai pendamping." : ""}
                    </p>
                  )}
                  <h2 id="q-h" ref={headRef} tabIndex={-1} className={`font-semibold leading-tight tracking-tight outline-none ${v.history.length === 0 && !typing && fit === 0 ? "mt-1.5" : ""} ${typing || fit >= 2 ? "text-[1.12em]" : fit === 1 ? "text-[1.2em]" : "text-[1.3em]"}`}>{open.text}</h2>
                  {open.needs_rephrase && <p className="mt-2 flex gap-2 rounded-xl bg-warn-soft px-3 py-2 text-[0.92em] leading-snug text-warn"><IconAlert size={18} className="mt-0.5 shrink-0" /> Maaf, belum jelas. Pilih jawaban, atau tulis dengan kalimat lain.</p>}
                  {!typing && (
                    <div className={`-ml-2 mt-1.5 flex flex-wrap gap-x-1 ${fit >= 2 ? "text-[0.92em]" : ""}`}>
                      <button type="button" onClick={() => listen(open.text)} aria-pressed={speaking} className="inline-flex min-h-12 items-center gap-2 rounded-xl px-2 font-semibold text-brand-ink hover:bg-brand-tint">
                        {speaking ? <IconStop size={20} /> : <IconSpeaker size={20} />} {speaking ? "Hentikan" : "Dengarkan"}
                      </button>
                      {(open.helper || open.glossary.length > 0 || s.uses_draft) && (
                        <button type="button" onClick={() => setPanel("explain")} aria-haspopup="dialog" className="inline-flex min-h-12 items-center gap-2 rounded-xl px-2 font-semibold text-brand-ink hover:bg-brand-tint">
                          <IconInfo size={20} /> Penjelasan
                        </button>
                      )}
                    </div>
                  )}
                </section>

                {!typing && open.options.length > 0 && (
                  <AutoPager
                    label="Halaman pilihan jawaban"
                    resetKey={open.turn_id}
                    items={[
                      ...open.options.map((o) => {
                        const soft = o.value === "unknown" || o.value === "not_understood";
                        const on = busy && picked === o.value;
                        return {
                          key: o.value,
                          node: (
                            <button
                              type="button"
                              disabled={busy}
                              aria-pressed={on}
                              onClick={() => answer({ choice: o.value })}
                              className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border px-4 py-2.5 text-left text-[1.05em] font-semibold leading-snug shadow-e1 transition-colors duration-150 active:scale-[0.99] disabled:cursor-not-allowed ${
                                on ? "border-brand bg-brand-soft text-brand-ink" : soft ? "border-line-strong bg-paper text-ink hover:bg-subtle disabled:opacity-50" : "border-line-strong bg-card text-ink hover:border-brand hover:bg-brand-tint disabled:opacity-50"
                              }`}
                            >
                              <span aria-hidden className={`grid size-7 shrink-0 place-items-center rounded-full ${on ? "bg-brand text-white" : soft ? "text-ink-soft" : "border-2 border-line-strong"}`}>
                                {on ? <Spinner size={15} /> : soft ? <IconQuestion size={22} /> : null}
                              </span>
                              {o.label}
                            </button>
                          ),
                        };
                      }),
                      ...(open.text_allowed
                        ? [{
                            key: "__write",
                            node: (
                              <button type="button" disabled={busy} onClick={() => setTyping(true)} className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left font-semibold leading-snug text-brand-ink transition-colors hover:bg-brand-tint">
                                <IconPen size={22} className="shrink-0" /> Tulis dengan kalimat sendiri
                              </button>
                            ),
                          }]
                        : []),
                    ]}
                  />
                )}

                {open.text_allowed && (typing || open.options.length === 0) && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (text.trim()) answer({ text });
                    }}
                    className="flex min-h-0 flex-1 flex-col gap-2.5"
                  >
                    <label htmlFor="free" className="shrink-0 font-semibold">Tulis jawaban Anda</label>
                    <textarea id="free" value={text} onChange={(e) => setText(e.target.value)} maxLength={600} placeholder="Contoh: obatnya baru sebagian yang saya terima" className="min-h-[4.5em] w-full flex-1 resize-none rounded-2xl border border-line-strong bg-card p-3.5 leading-snug shadow-e1" />
                    <button type="submit" disabled={busy || !text.trim()} className={`${BTN.primary} shrink-0`}>
                      {busy && picked === "__text" ? <Spinner /> : <IconSend size={20} />} {busy && picked === "__text" ? "Membaca jawaban…" : "Kirim jawaban"}
                    </button>
                    {typing && open.options.length > 0 && (
                      <button type="button" onClick={() => setTyping(false)} className={`${BTN.ghost} shrink-0`}>
                        <IconArrowLeft size={20} /> Pilih jawaban saja
                      </button>
                    )}
                  </form>
                )}
                {!(open.options.length > 0 && !typing) && !open.text_allowed && <div className="flex-1" />}
              </>
            )}

            {/* ---------- Periksa usulan (satu per layar) ---------- */}
            {reviewing && (() => {
              const r = v.review[0];
              return (
                <section aria-labelledby="rv-h" className="flex min-h-0 flex-1 flex-col gap-3">
                  <div className="flex shrink-0 items-center justify-between gap-2">
                    <Tag tone="warn"><IconEdit size={14} /> Belum tersimpan</Tag>
                    {v.review.length > 1 && <span className="text-[0.92em] font-semibold text-ink-soft">1 dari {v.review.length}</span>}
                  </div>
                  <h2 id="rv-h" ref={headRef} tabIndex={-1} className="shrink-0 text-[1.35em] font-semibold leading-tight tracking-tight outline-none">Ini yang saya tangkap. Sudah benar?</h2>
                  <div className="shrink-0 rounded-[1.75rem] bg-card p-5 shadow-e2 ring-2 ring-warn/25">
                    <p className="text-[0.92em] leading-snug text-ink-soft">{r.slot_label}</p>
                    <p className="mt-1 text-[1.35em] font-semibold leading-tight">{r.value_label}</p>
                    {r.quote && <p className="mt-3 line-clamp-3 border-l-[3px] border-line-strong pl-3 leading-snug text-ink-soft">“{r.quote}”</p>}
                    <p className="mt-2 text-[0.85em] leading-snug text-ink-soft">{ORIGIN_NOTE[r.origin]}</p>
                  </div>
                  {fixingReview === r.id ? (
                    <>
                      <p className="shrink-0 font-semibold">Pilih yang tepat:</p>
                      <AutoPager
                        label="Halaman pilihan pengganti"
                        items={[
                          ...r.allowed.filter((a) => a.value !== r.value).map((a) => ({
                            key: a.value,
                            node: (
                              <button type="button" disabled={busy} onClick={() => resolve(r.id, "correct", a.value)} className={`${BTN.secondary} justify-start text-left`}>
                                {busy && picked === `${r.id}:correct:${a.value}` && <Spinner />} {a.label}
                              </button>
                            ),
                          })),
                          { key: "__cancel", node: <button type="button" onClick={() => setFixingReview(null)} className={BTN.ghost}><IconX size={18} /> Batal</button> },
                        ]}
                      />
                    </>
                  ) : (
                    <div className="mt-auto grid shrink-0 gap-2">
                      <button type="button" disabled={busy} onClick={() => resolve(r.id, "confirm")} className={`${BTN.primary} min-h-16 text-[1.1em]`}>
                        {busy && picked === `${r.id}:confirm` ? <Spinner /> : <IconCheck size={22} />} Benar
                      </button>
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" disabled={busy} onClick={() => setFixingReview(r.id)} className={BTN.secondary}>Ubah</button>
                        <button type="button" disabled={busy} onClick={() => resolve(r.id, "dismiss")} className={BTN.secondary}>
                          {busy && picked === `${r.id}:dismiss` && <Spinner />} Bukan itu
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              );
            })()}

            {/* ---------- Selesai ---------- */}
            {!active && v.outcome && (
              <Done
                title={v.outcome.status === "completed" ? "Terima kasih, sudah selesai" : v.outcome.status === "cancelled" ? "Survei dibatalkan" : "Terima kasih, jawaban tersimpan"}
                action={
                  <div className="grid gap-2">
                    {v.facts.length > 0 && (
                      <button type="button" onClick={() => setPanel("facts")} className={BTN.secondary}>
                        <IconList size={20} /> Lihat jawaban saya ({v.facts.length})
                      </button>
                    )}
                    <button type="button" onClick={onExit} className={BTN.primary}>Kembali ke beranda</button>
                  </div>
                }
              >
                {v.outcome.lines.map((l) => <p key={l}>{l}</p>)}
                {v.outcome.reports_created > 0 && <p className="font-medium text-ink">Kendala yang Anda sebut sudah diteruskan ke petugas.</p>}
                {v.help_open && <p>Permintaan bantuan Anda diteruskan ke petugas.</p>}
              </Done>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {active && (
        <nav aria-label="Pilihan survei" className="shrink-0 border-t border-line bg-card px-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] pt-1.5">
          <div className="grid grid-cols-3 gap-1">
            {[
              { label: "Bantuan", Icon: IconHelp, act: () => onHelp(s.id), dot: v.help_open },
              { label: "Jawaban saya", Icon: IconList, act: () => setPanel("facts"), dot: false },
              { label: "Berhenti", Icon: IconStop, act: () => setPanel("stop"), dot: false },
            ].map(({ label, Icon, act, dot }) => (
              <button key={label} type="button" onClick={act} disabled={busy && label === "Berhenti"} className="relative flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1.5 text-[0.8em] font-semibold leading-none text-ink-soft transition-colors hover:bg-subtle hover:text-ink disabled:opacity-50">
                <span className="relative">
                  <Icon size={24} />
                  {dot && <span className="absolute -right-1 -top-0.5 size-2.5 rounded-full bg-accent ring-2 ring-card" aria-hidden />}
                </span>
                {label}
              </button>
            ))}
          </div>
        </nav>
      )}

      <AnimatePresence>
        {panel === "facts" && (
          <Overlay key="facts" title="Jawaban saya" onClose={() => setPanel(null)}>
            {v.facts.length === 0 ? (
              <p className="leading-snug text-ink-soft">Belum ada jawaban tersimpan.</p>
            ) : (
              <AutoPager
                label="Halaman jawaban"
                items={v.facts.map((f) => ({
                  key: f.id,
                  node: (
                    <div className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-e1">
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.92em] leading-snug text-ink-soft">{f.slot_label}</p>
                        <p className="mt-0.5 text-[1.05em] font-semibold leading-snug">{f.value_label}{f.corrected && <span className="font-normal text-ink-soft"> (diubah)</span>}</p>
                      </div>
                      {editable && f.editable.length > 1 && (
                        <button type="button" disabled={busy} onClick={() => openFix(f)} className="inline-flex min-h-12 shrink-0 items-center gap-1 rounded-xl px-2.5 font-semibold text-brand-ink hover:bg-brand-tint">
                          <IconEdit size={17} /> Ubah
                        </button>
                      )}
                    </div>
                  ),
                }))}
              />
            )}
            <div className="mt-3 grid shrink-0 grid-cols-2 gap-2">
              <button type="button" disabled={v.history.length === 0} onClick={() => setPanel("transcript")} className={`${BTN.secondary} px-2 text-[0.92em]`}>
                <IconChat size={20} className="shrink-0" /> Percakapan
              </button>
              <button type="button" onClick={() => setPanel("info")} className={`${BTN.secondary} px-2 text-[0.92em]`}>
                <IconInfo size={20} className="shrink-0" /> Cara dibaca
              </button>
            </div>
          </Overlay>
        )}
        {panel === "transcript" && (
          <Overlay key="tr" title="Lihat percakapan" onClose={() => setPanel("facts")}>
            <AutoPager
              label="Halaman percakapan"
              items={v.history.map((h) => ({
                key: h.turn_id,
                node: (
                  <div className="space-y-1.5">
                    <p className="rounded-2xl rounded-tl-md bg-card px-4 py-3 leading-snug text-ink shadow-e1">{h.question}</p>
                    {h.answer && <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-brand px-4 py-3 leading-snug text-white shadow-e1">{h.answer}</p>}
                  </div>
                ),
              }))}
            />
          </Overlay>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {panel === "stop" && (
          <Sheet key="stop" title="Berhenti sekarang?" titleId="stop-h" onClose={() => setPanel(null)}>
            <p className="leading-snug text-ink-soft">Jawaban yang sudah ada tetap tersimpan. Sisanya tidak ditanyakan lagi.</p>
            <div className="grid gap-2 pt-1">
              <button type="button" onClick={() => setPanel(null)} className={BTN.primary}>Lanjut menjawab</button>
              <button type="button" onClick={stop} className={BTN.secondary}>Ya, berhenti</button>
            </div>
          </Sheet>
        )}
        {panel === "explain" && open && (
          <Sheet key="explain" title="Penjelasan" titleId="ex-h" onClose={() => setPanel(null)}>
            {open.helper && <p className="leading-snug text-ink">{open.helper}</p>}
            {open.glossary.map((g) => (
              <p key={g.term} className="rounded-xl bg-subtle px-3 py-2 leading-snug text-ink-soft"><span className="font-semibold text-ink">{g.term}:</span> {g.plain}</p>
            ))}
            {s.uses_draft && <p className="leading-snug text-ink-soft">Pertanyaan ini masih draf menunggu validasi. Jawaban Anda bukan dasar penilaian resmi.</p>}
            <button type="button" onClick={() => setPanel(null)} className={BTN.primary}>Mengerti</button>
          </Sheet>
        )}
        {panel === "info" && (
          <Sheet key="info" title="Cara jawaban dibaca" titleId="info-h" onClose={() => setPanel("facts")}>
            {aiLabel && <p className="leading-snug">Pemahaman jawaban bebas: <strong className="font-semibold">{aiLabel}</strong></p>}
            <p className="leading-snug text-ink-soft">AI membantu memahami kalimat Anda; aturan menentukan pertanyaan. AI tidak memutuskan apa pun.{aiHint ? ` ${aiHint}` : ""}</p>
          </Sheet>
        )}
        {fix && (
          <Sheet key="fix" title="Ubah jawaban" titleId="fix-h" onClose={() => setFix(null)}>
            <p className="leading-snug text-ink-soft">{fix.label}</p>
            <div className="grid gap-2">
              {fix.options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (o.value !== fix.current) void correct(fix.factId, o.value);
                    setFix(null);
                  }}
                  aria-pressed={o.value === fix.current}
                  className={`${o.value === fix.current ? `${BTN.outline} bg-brand-soft` : BTN.secondary} justify-start text-left`}
                >
                  {o.value === fix.current && <IconCheck size={20} className="shrink-0" />} {o.label}
                </button>
              ))}
            </div>
          </Sheet>
        )}
      </AnimatePresence>
    </div>
  );
}
