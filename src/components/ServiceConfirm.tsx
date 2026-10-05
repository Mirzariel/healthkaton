"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconArrowLeft, IconCheck, IconClock, IconHospital, IconQuestion, IconRetry, IconSpeaker, IconStop, IconX } from "@/components/m/icons";
import { ANSWERS, ANSWER_LABEL, cap, phraseFor, type Answer } from "@/components/m/phrases";

export type ExistingAnswer = { answer: Answer; note: string; at: string };
export interface MItem {
  id: string;
  code: string;
  name: string;
  hospital: string;
  /** Tanggal dalam kata, mis. "5 Maret 2026". */
  dateLong: string;
  existing: ExistingAnswer | null;
}

const ICON: Record<Answer, typeof IconCheck> = { sesuai: IconCheck, tidak_sesuai: IconX, tidak_ingat: IconQuestion };
const BADGE: Record<Answer, string> = {
  sesuai: "bg-[#e3f5ea] text-ok",
  tidak_sesuai: "bg-[#fde9df] text-[#9c2f00]",
  tidak_ingat: "bg-[#e5effa] text-[#164b86]",
};
const CONFIRM_CARD: Record<Answer, string> = {
  sesuai: "border-ok bg-ok-soft/60 text-ink",
  tidak_sesuai: "border-danger bg-danger-soft/60 text-ink",
  tidak_ingat: "border-ink-soft bg-card text-ink",
};
const ICON_BG: Record<Answer, string> = { sesuai: "bg-ok text-white", tidak_sesuai: "bg-danger text-white", tidak_ingat: "bg-ink-soft text-white" };
const EASE = [0.22, 1, 0.36, 1] as const;

export function AnswerBadge({ answer }: { answer: Answer }) {
  const Icon = ICON[answer];
  return (
    <span className={`inline-flex min-h-9 items-center gap-2 rounded-full px-3.5 text-[1em] font-bold ${BADGE[answer]}`}>
      <Icon size={20} />
      {ANSWER_LABEL[answer]}
    </span>
  );
}

/** Tombol "Dengarkan": membacakan teks dengan suara bawaan perangkat. Disembunyikan bila tidak didukung. */
export function Listen({ text, label = "Dengarkan pertanyaan" }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    setOk(true);
    return () => window.speechSynthesis.cancel();
  }, []);

  if (!ok) return null;
  function toggle() {
    const s = window.speechSynthesis;
    if (speaking) {
      s.cancel();
      setSpeaking(false);
      return;
    }
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "id-ID";
    u.rate = 0.9;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    s.speak(u);
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={speaking}
      className="flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl border-2 border-brand bg-card px-4 text-[1.05em] font-semibold text-brand transition-transform active:scale-[0.98]"
    >
      <span className="grid size-9 place-items-center rounded-full bg-brand text-white">{speaking ? <IconStop size={20} /> : <IconSpeaker size={20} />}</span>
      {speaking ? "Berhenti" : label}
    </button>
  );
}

function DrawnCheck() {
  return (
    <motion.span
      initial={{ scale: 0.7, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.22, ease: EASE }}
      className="grid size-20 shrink-0 place-items-center rounded-full bg-ok text-white"
    >
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.22, delay: 0.08, ease: "easeOut" }} />
      </svg>
    </motion.span>
  );
}

const BTN = "flex min-h-[4.5rem] w-full items-center justify-center gap-3 rounded-2xl px-4 text-[1.1em] font-semibold leading-tight transition-transform active:scale-[0.98] disabled:opacity-60";
const BTN_ANSWER = "border-2 border-line bg-card text-ink hover:border-ink/40";
const BUBBLE = "grid size-11 shrink-0 place-items-center rounded-full";
const BTN_PRIMARY = "bg-brand text-white";

type Phase = "ask" | "confirm" | "sent";

export function ServiceConfirm({
  item,
  participantId,
  first,
  last,
  focusOnMount,
  onSaved,
  onNext,
}: {
  item: MItem;
  participantId: string;
  first: boolean;
  last: boolean;
  focusOnMount: boolean;
  onSaved: (id: string, a: { answer: Answer; note: string }) => void;
  onNext: () => void;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("ask");
  const [sel, setSel] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storyOpen, setStoryOpen] = useState(false);
  const [story, setStory] = useState("");
  const [storySent, setStorySent] = useState(false);
  const [announce, setAnnounce] = useState("");
  const lock = useRef(false);
  const skipFocus = useRef(!focusOnMount);

  // Judul layar baru menerima fokus saat muncul (setelah animasi keluar selesai).
  const head = useCallback((el: HTMLHeadingElement | null) => {
    if (!el) return;
    if (skipFocus.current) skipFocus.current = false;
    else el.focus();
  }, []);

  const p = phraseFor(item.code, item.name);
  const question = `Apakah Bapak/Ibu pernah menjalani ${p.title} di ${item.hospital} pada ${item.dateLong}?`;

  async function post(answer: Answer, note: string) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/patient/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_id: item.id, participant_id: participantId, answer, note }),
      });
      const j = (await r.json()) as { ok: boolean };
      if (!j.ok) throw new Error("gagal");
      return true;
    } catch {
      setError("Belum terkirim. Pastikan ada sinyal, lalu tekan Coba lagi.");
      setAnnounce("Belum terkirim. Pastikan ada sinyal, lalu tekan Coba lagi.");
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function send() {
    if (!sel) return;
    if (await post(sel, "")) {
      onSaved(item.id, { answer: sel, note: "" });
      setAnnounce("Jawaban sudah terkirim.");
      setPhase("sent");
      router.refresh();
    }
  }

  async function sendStory() {
    if (!sel || !story.trim()) return;
    if (await post(sel, story.trim())) {
      onSaved(item.id, { answer: sel, note: story.trim() });
      setStorySent(true);
      setStoryOpen(false);
      setAnnounce("Cerita sudah terkirim.");
      router.refresh();
    }
  }

  const h = "text-[1.4em] font-semibold leading-snug outline-none";
  const Sel = sel ? ICON[sel] : null;

  return (
    <div className="flex flex-1 flex-col">
      <p role="status" className="sr-only">{announce}</p>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={phase}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.1 } }}
          transition={{ duration: 0.2, ease: EASE }}
          className="flex flex-1 flex-col gap-5"
        >
          {phase === "ask" && (
            <>
              <div className="rounded-2xl border border-line bg-card p-4">
                <div className="mb-3 flex items-center gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                    <IconHospital size={24} />
                  </span>
                  <div className="min-w-0 text-[0.8em] leading-snug">
                    <p className="font-semibold">{item.hospital}</p>
                    <p className="flex items-center gap-1.5 text-ink-soft"><IconClock size={16} className="shrink-0" />{item.dateLong}</p>
                  </div>
                </div>
                <h2 ref={head} tabIndex={-1} className={h}>{question}</h2>
                {p.desc && (
                  <p className="mt-3 rounded-xl bg-paper p-3 text-[0.9em] leading-relaxed text-ink-soft">
                    <strong className="font-semibold text-ink">{cap(p.title)}:</strong> {p.desc}
                  </p>
                )}
              </div>
              <Listen text={`${question} ${p.desc}`} />
              {first && (
                <p className="text-center text-[0.8em] font-medium leading-snug text-ink-soft">
                  Tidak ada jawaban yang salah. Jawab sesuai ingatan Bapak/Ibu.
                </p>
              )}
              <div role="group" aria-label="Pilih jawaban" className="grid gap-3">
                <button type="button" onClick={() => { setSel("sesuai"); setPhase("confirm"); }} className={`${BTN} ${BTN_ANSWER}`}>
                  <span className={`${BUBBLE} ${ICON_BG.sesuai}`}><IconCheck size={28} /></span>
                  <span className="flex-1 text-left">{ANSWERS[0].label}</span>
                </button>
                <button type="button" onClick={() => { setSel("tidak_sesuai"); setPhase("confirm"); }} className={`${BTN} ${BTN_ANSWER}`}>
                  <span className={`${BUBBLE} ${ICON_BG.tidak_sesuai}`}><IconX size={28} /></span>
                  <span className="flex-1 text-left">{ANSWERS[1].label}</span>
                </button>
                <button type="button" onClick={() => { setSel("tidak_ingat"); setPhase("confirm"); }} className={`${BTN} ${BTN_ANSWER}`}>
                  <span className={`${BUBBLE} ${ICON_BG.tidak_ingat}`}><IconQuestion size={26} /></span>
                  <span className="flex-1 text-left">{ANSWERS[2].label}</span>
                </button>
              </div>
            </>
          )}

          {phase === "confirm" && sel && Sel && (
            <>
              <h2 ref={head} tabIndex={-1} className={h}>
                Jawaban Bapak/Ibu:
              </h2>
              <p className={`flex items-center gap-3 rounded-2xl border-2 p-4 text-[1.2em] font-semibold leading-snug ${CONFIRM_CARD[sel]}`}>
                <Sel size={34} className="shrink-0" />
                {ANSWER_LABEL[sel]}
              </p>
              <p className="text-[1.15em] font-bold">Sudah benar?</p>
              {error && (
                <p role="alert" className="rounded-2xl bg-[#fde9df] p-4 text-[1em] font-bold leading-snug text-[#7a2400]">{error}</p>
              )}
              <div className="grid gap-3">
                <button
                  type="button"
                  onClick={send}
                  disabled={busy}
                  aria-busy={busy}
                  className={`${BTN} ${BTN_PRIMARY}`}
                >
                  {error && !busy ? <IconRetry size={28} /> : <IconCheck size={28} />}
                  {busy ? "Mengirim…" : error ? "Coba lagi" : "Ya, kirim"}
                </button>
                <button
                  type="button"
                  onClick={() => { setError(null); setPhase("ask"); }}
                  disabled={busy}
                  className={`${BTN} border-2 border-line bg-card text-ink`}
                >
                  <IconArrowLeft size={26} /> Ubah jawaban
                </button>
              </div>
            </>
          )}

          {phase === "sent" && sel && (
            <>
              <div className="flex items-center gap-4">
                <DrawnCheck />
                <h2 ref={head} tabIndex={-1} className={h}>Jawaban terkirim</h2>
              </div>
              <AnswerBadge answer={sel} />

              {storySent ? (
                <p className="text-[1em] font-bold text-ok">Cerita Bapak/Ibu sudah terkirim.</p>
              ) : storyOpen ? (
                <div className="space-y-3">
                  <label htmlFor={`story-${item.id}`} className="block text-[1em] font-bold">Silakan tulis cerita Bapak/Ibu</label>
                  <textarea
                    id={`story-${item.id}`}
                    rows={3}
                    maxLength={500}
                    value={story}
                    disabled={busy}
                    onChange={(e) => setStory(e.target.value)}
                    className="w-full rounded-2xl border border-line bg-card p-4 text-[1em]"
                  />
                  {error && <p role="alert" className="rounded-2xl bg-[#fde9df] p-4 font-bold text-[#7a2400]">{error}</p>}
                  <button type="button" onClick={sendStory} disabled={busy || !story.trim()} className={`${BTN} border-2 border-brand bg-card text-brand`}>
                    {busy ? "Mengirim…" : error ? "Coba lagi" : "Kirim cerita"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setStoryOpen(true)}
                  className="min-h-14 self-start text-left text-[1em] font-bold text-brand-deep underline underline-offset-4"
                >
                  Mau menambahkan cerita? (boleh dilewati)
                </button>
              )}

              <button type="button" onClick={onNext} disabled={busy} className={`${BTN} ${BTN_PRIMARY} mt-auto`}>
                {last ? "Lanjut" : "Berikutnya"}
              </button>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
