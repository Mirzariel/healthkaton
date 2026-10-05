"use client";

import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnswerBadge, Listen, ServiceConfirm, type ExistingAnswer, type MItem } from "@/components/ServiceConfirm";
import { IconArrowLeft, IconArrowRight, IconCheck, IconChevron, IconClipboard, IconHospital, IconList, IconLock, IconShield } from "./icons";
import { ResetDemo } from "./ResetDemo";
import { cap, phraseFor, type Answer } from "./phrases";

export type { MItem };

const EASE = [0.22, 1, 0.36, 1] as const;
const SIZES = ["19px", "22px", "25px"] as const;
const SIZE_LABELS = ["Huruf normal", "Huruf besar", "Huruf sangat besar"] as const;
const STORE = "sehati-m-size";

type Screen = "intro" | "q" | "finish" | "home" | "list";

/** Kartu petunjuk khusus demo: dipisahkan jelas dari isi aplikasi peserta. */
function DemoHint({ children }: { children: ReactNode }) {
  return (
    <aside className="rounded-2xl border border-dashed border-ink/30 bg-card p-4 leading-snug" style={{ fontSize: 14 }}>
      <p className="eyebrow text-muted">Hanya untuk demo</p>
      <div className="mt-1.5 space-y-2.5 text-ink-soft">{children}</div>
    </aside>
  );
}

export function MobileApp({
  firstName,
  participantId,
  items,
  demo,
  consoleHref = "/console",
  isHero = false,
}: {
  firstName: string;
  participantId: string;
  items: MItem[];
  demo: ReactNode;
  consoleHref?: string;
  isHero?: boolean;
}) {
  // Antrean pertanyaan dibekukan saat dibuka agar urutan tidak berubah di tengah jalan.
  const [queue] = useState<MItem[]>(() => items.filter((i) => !i.existing));
  const [idx, setIdx] = useState(0);
  const [screen, setScreen] = useState<Screen>(queue.length ? "intro" : "home");
  const [started, setStarted] = useState(false);
  const [from, setFrom] = useState<Screen>("home");
  const [local, setLocal] = useState<Record<string, ExistingAnswer>>({});
  const [size, setSize] = useState(0);
  const [announce, setAnnounce] = useState("");
  const first = useRef(true);
  const head = useCallback((el: HTMLHeadingElement | null) => {
    if (!el) return;
    if (first.current) first.current = false;
    else el.focus();
  }, []);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(STORE));
      if (v === 1 || v === 2) setSize(v);
    } catch {}
  }, []);
  function pick(n: number) {
    setSize(n);
    try {
      localStorage.setItem(STORE, String(n));
    } catch {}
  }

  const n = queue.length;
  const cur = queue[idx];

  function go(s: Screen) {
    window.speechSynthesis?.cancel();
    setScreen(s);
    scroller.current?.scrollTo({ top: 0 });
  }
  function begin() {
    setStarted(true);
    go("q");
  }
  function next() {
    if (idx + 1 < n) {
      setIdx(idx + 1);
      setAnnounce(`Pertanyaan ${idx + 2} dari ${n}`);
      scroller.current?.scrollTo({ top: 0 });
    } else go("finish");
  }
  function openList() {
    setFrom(screen);
    go("list");
  }

  const answered: { item: MItem; a: ExistingAnswer }[] = items
    .map((item) => ({ item, a: local[item.id] ?? item.existing }))
    .filter((x): x is { item: MItem; a: ExistingAnswer } => !!x.a);

  const nowLabel = () => new Date().toLocaleString("id-ID", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  function saved(id: string, a: { answer: Answer; note: string }) {
    setLocal((l) => ({ ...l, [id]: { ...a, at: nowLabel() } }));
  }

  const hTitle = "text-[1.5em] font-semibold leading-snug tracking-tight outline-none";
  const big = "flex min-h-[4.25rem] w-full items-center justify-center gap-3 rounded-2xl px-5 text-[1.1em] font-semibold leading-tight transition-transform active:scale-[0.98]";
  const primary = `${big} bg-brand text-white`;
  const ghost = `${big} border-2 border-line bg-card text-ink`;

  const introSpoken = `Halo, Bu atau Pak ${firstName}. Kami ingin memastikan perawatan Bapak atau Ibu tercatat dengan benar. Rumah sakit mengirim tagihan perawatan ke BPJS Kesehatan. Kami ingin memastikan perawatan itu memang Bapak atau Ibu terima. Bapak atau Ibu cukup menjawab: Ya, Tidak, atau Lupa. Tidak ada jawaban yang salah.`;
  const introSteps = [
    { Icon: IconHospital, text: "Rumah sakit mengirim tagihan perawatan Bapak/Ibu ke BPJS Kesehatan." },
    { Icon: IconClipboard, text: "Kami ingin memastikan perawatan itu memang Bapak/Ibu terima." },
    { Icon: IconCheck, text: "Bapak/Ibu cukup menjawab: Ya, Tidak, atau Lupa." },
  ];

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-paper md:h-[min(780px,calc(100dvh-4rem))] md:w-[390px] md:shrink-0 md:rounded-[3rem] md:border-[10px] md:border-[#111] md:shadow-[0_40px_80px_-30px_rgb(0_0_0/0.45),0_0_0_1px_rgb(0_0_0/0.25)]">
        <header className="relative z-20 shrink-0 border-b border-line bg-card px-4 pb-3 pt-3 md:pt-2">
          {/* bilah status ponsel (hanya hiasan di desktop) */}
          <div aria-hidden="true" className="relative mb-2 hidden h-6 items-center justify-between px-3 text-[11px] font-semibold md:flex">
            <span>09.41</span>
            <span className="absolute left-1/2 top-0.5 h-5 w-24 -translate-x-1/2 rounded-full bg-black" />
            <span className="relative h-2.5 w-5 rounded-[3px] border border-ink/70">
              <span className="absolute inset-[1.5px] right-[4px] rounded-[1px] bg-ink/80" />
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-medium uppercase tracking-[0.12em] text-muted">JKN Mobile</p>
              <p className="truncate text-2xl font-semibold leading-tight tracking-tight">Halo, {firstName}</p>
            </div>
            <div role="group" aria-label="Ukuran huruf" className="flex shrink-0 gap-0.5 rounded-xl bg-paper p-1 ring-1 ring-line">
              {SIZE_LABELS.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  aria-label={label}
                  aria-pressed={size === i}
                  onClick={() => pick(i)}
                  className={`grid h-11 min-w-10 place-items-center rounded-lg px-1.5 font-semibold transition ${size === i ? "bg-ink text-white" : "text-ink-soft hover:bg-line/60"}`}
                  style={{ fontSize: [15, 18, 21][i] }}
                >
                  {["A", "A+", "A++"][i]}
                </button>
              ))}
            </div>
          </div>
          {screen === "q" && n > 0 && (
            <div className="mt-3">
              <p className="text-base font-medium">{n === 1 ? "Hanya 1 pertanyaan" : `Pertanyaan ${idx + 1} dari ${n}`}</p>
              <div
                role="progressbar"
                aria-label="Kemajuan"
                aria-valuemin={0}
                aria-valuemax={n}
                aria-valuenow={idx}
                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line"
              >
                <motion.div className="h-full rounded-full bg-brand" initial={false} animate={{ width: `${(idx / n) * 100}%` }} transition={{ duration: 0.25, ease: EASE }} />
              </div>
            </div>
          )}
        </header>

        <p role="status" className="sr-only">{announce}</p>
        <h1 className="sr-only md:hidden">Konfirmasi perawatan, aplikasi peserta</h1>

        <div ref={scroller} className="flex-1 overflow-y-auto overscroll-contain bg-paper">
          <div className="flex min-h-full flex-col gap-5 p-5" style={{ fontSize: SIZES[size] }}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={screen === "q" ? `q-${cur?.id}` : screen}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                transition={{ duration: 0.2, ease: EASE }}
                className="flex flex-1 flex-col gap-5"
              >
                {screen === "intro" && (
                  <>
                    <div className="flex items-center gap-4">
                      <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-brand text-white">
                        <IconShield size={36} />
                      </span>
                      <p className="text-[0.8em] font-medium uppercase leading-tight tracking-wider text-muted">Pertanyaan singkat dari BPJS Kesehatan</p>
                    </div>
                    <h2 ref={head} tabIndex={-1} className={hTitle}>
                      Bu/Pak {firstName}, kami ingin memastikan perawatan Bapak/Ibu tercatat dengan benar
                    </h2>
                    <ol className="space-y-3" aria-label="Mengapa Bapak/Ibu ditanya">
                      {introSteps.map(({ Icon, text }, i) => (
                        <li key={i} className="flex items-start gap-3 rounded-2xl border border-line bg-card p-3.5">
                          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"><Icon size={26} /></span>
                          <p className="pt-0.5 text-[0.95em] font-medium leading-snug">{text}</p>
                        </li>
                      ))}
                    </ol>
                    <p className="flex items-start gap-3 rounded-2xl bg-brand-soft p-3.5 text-[0.9em] font-medium leading-snug text-brand">
                      <IconLock size={22} className="mt-0.5 shrink-0" />
                      Tidak ada jawaban yang salah. Pelayanan kesehatan Bapak/Ibu tidak terpengaruh.
                    </p>
                    <Listen text={introSpoken} label="Dengarkan penjelasan" />
                    <div className="sticky bottom-0 -mx-5 -mb-1 mt-auto border-t border-line bg-paper/95 px-5 pb-3 pt-3">
                      <p className="mb-2 text-center text-[0.8em] font-medium text-ink-soft">
                        {n === 1 ? "Hanya 1 pertanyaan" : `${n} pertanyaan`} · kurang dari 1 menit
                      </p>
                      <button type="button" onClick={begin} className={primary}>
                        Mulai
                        <IconArrowRight size={26} />
                      </button>
                    </div>
                  </>
                )}

                {screen === "q" && cur && (
                  <ServiceConfirm
                    item={cur}
                    participantId={participantId}
                    first={idx === 0}
                    last={idx + 1 === n}
                    focusOnMount={started || idx > 0}
                    onSaved={saved}
                    onNext={next}
                  />
                )}

                {screen === "finish" && (
                  <>
                    <div className="grid place-items-center pt-2">
                      <span className="grid size-24 place-items-center rounded-full bg-ok text-white">
                        <IconCheck size={56} />
                      </span>
                    </div>
                    <h2 ref={head} tabIndex={-1} className={`${hTitle} text-center`}>Terima kasih, Bu/Pak {firstName}</h2>
                    <p className="text-center leading-relaxed text-ink-soft">Jawaban Bapak/Ibu sudah kami terima dan akan membantu petugas memeriksa biaya perawatan.</p>
                    <ol className="space-y-2.5 rounded-2xl border border-line bg-card p-4 text-[0.85em] font-medium" aria-label="Apa yang terjadi selanjutnya">
                      <li className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-full bg-ok text-white"><IconCheck size={18} /></span>Jawaban Bapak/Ibu terkirim</li>
                      <li className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-full bg-paper font-semibold text-ink-soft ring-1 ring-line">2</span>Petugas BPJS membaca jawaban</li>
                      <li className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-full bg-paper font-semibold text-ink-soft ring-1 ring-line">3</span>Tagihan rumah sakit diperiksa</li>
                    </ol>
                    <div className="mt-auto grid gap-3">
                      <button type="button" onClick={() => go("home")} className={primary}>
                        Selesai
                      </button>
                      <button type="button" onClick={openList} className={ghost}>
                        <IconList size={26} /> Lihat jawaban saya
                      </button>
                    </div>
                    <DemoHint>
                      <p>
                        Jawaban tadi sudah masuk ke konsol petugas.{isHero ? " Buka kasus Bu Sari untuk melihat skornya berubah." : " Buka konsol untuk melihat kasus peserta ini."}
                      </p>
                      <Link href={consoleHref} className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-brand underline underline-offset-4">
                        Buka konsol petugas <IconArrowRight size={16} />
                      </Link>
                    </DemoHint>
                  </>
                )}

                {screen === "home" && (
                  <>
                    <div className="grid place-items-center pt-2">
                      <span className="grid size-24 place-items-center rounded-full bg-brand-soft text-brand">
                        <IconCheck size={54} />
                      </span>
                    </div>
                    <h2 ref={head} tabIndex={-1} className={`${hTitle} text-center`}>
                      {answered.length > 0 ? "Semua jawaban sudah kami terima" : "Belum ada pertanyaan untuk Bapak/Ibu"}
                    </h2>
                    <p className="text-center leading-relaxed text-ink-soft">
                      {answered.length > 0
                        ? `Terima kasih, Bu/Pak ${firstName}. Saat ini tidak ada pertanyaan baru. Jawaban Bapak/Ibu dipakai petugas BPJS untuk memeriksa tagihan rumah sakit.`
                        : `Pertanyaan baru akan muncul di sini bila rumah sakit menagihkan tindakan yang perlu dipastikan. Saat ini tidak ada yang perlu Bapak/Ibu lakukan.`}
                    </p>
                    {answered.length > 0 && (
                      <button type="button" onClick={openList} className={primary}>
                        <IconList size={26} /> Lihat jawaban saya ({answered.length})
                      </button>
                    )}
                    <DemoHint>
                      <p>
                        {answered.length > 0
                          ? "Layar ini muncul karena semua pertanyaan peserta ini sudah dijawab."
                          : "Peserta ini tidak punya tindakan yang perlu dikonfirmasi."}{" "}
                        Untuk mencoba alurnya:
                      </p>
                      <ul className="list-disc space-y-1 pl-5">
                        <li>
                          <span className="hidden md:inline">Pilih peserta lain di panel samping</span>
                          <span className="md:hidden">Pilih peserta lain di bawah</span> (Bu Sari adalah tokoh cerita).
                        </li>
                        <li>Atau atur ulang data demo agar semua pertanyaan muncul lagi.</li>
                      </ul>
                      <div className="md:hidden">{demo}</div>
                      <div className="hidden md:block"><ResetDemo /></div>
                    </DemoHint>
                  </>
                )}

                {screen === "list" && (
                  <>
                    <h2 ref={head} tabIndex={-1} className={hTitle}>Jawaban saya</h2>
                    {answered.length === 0 && <p className="leading-relaxed text-ink-soft">Belum ada jawaban.</p>}
                    <ul className="space-y-3">
                      {answered.map(({ item, a }) => (
                        <li key={item.id} className="rounded-2xl border border-line bg-card p-4">
                          <p className="font-semibold leading-snug">{cap(phraseFor(item.code, item.name).title)}</p>
                          <p className="text-[0.9em] text-ink-soft">{item.hospital} · {item.dateLong}</p>
                          <div className="mt-2"><AnswerBadge answer={a.answer} /></div>
                          {a.note && <p className="mt-2 rounded-xl bg-paper p-3 text-[0.95em] text-ink-soft">“{a.note}”</p>}
                        </li>
                      ))}
                    </ul>
                    <button type="button" onClick={() => go(from === "list" ? "home" : from)} className={`${ghost} mt-auto`}>
                      <IconArrowLeft size={26} /> Kembali
                    </button>
                  </>
                )}
              </motion.div>
            </AnimatePresence>

            {screen !== "list" && screen !== "home" && screen !== "finish" && answered.length > 0 && (
              <button
                type="button"
                onClick={openList}
                className="min-h-12 self-start text-[0.95em] font-semibold text-brand underline underline-offset-4"
              >
                Lihat jawaban saya
              </button>
            )}

            {screen !== "home" && (
              <details className="group rounded-2xl border border-line bg-card md:hidden" style={{ fontSize: 14 }}>
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-sm font-medium text-ink-soft [&::-webkit-details-marker]:hidden">
                  Mode demo
                  <IconChevron size={18} className="transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-line p-4">{demo}</div>
              </details>
            )}
          </div>
        </div>
      </div>
    </MotionConfig>
  );
}
