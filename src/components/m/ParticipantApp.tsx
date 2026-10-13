"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Brand } from "@/components/Brand";
import type { FollowUpView, HistoryView, HomeView, ReportView } from "@/lib/survey/participant";
import type { SessionView } from "@/lib/survey/service";
import { fmtDate } from "@/lib/dates";
import { Chat } from "./Chat";
import { ApiError, api, newKey } from "./api";
import { IconAlert, IconArrowRight, IconCheck, IconChevronRight, IconClipboard, IconClock, IconFlag, IconHelp, IconHistory, IconHome, IconHospital, IconInfo, IconList, IconShield } from "./icons";
import { AutoPager, BTN, Callout, Done, EASE, overflows, RowLink, ScreenTitle, Sheet, Spinner, Tag, TextSizeCtx, useFitLevel } from "./kit";

/* Aplikasi peserta. Rancangan untuk peserta lanjut usia: satu tugas per layar, huruf besar, tanpa gulir.
   Daftar yang tidak muat dipecah menjadi halaman ("Sebelumnya / Berikutnya"), bukan digulir. */

type Screen =
  | { name: "home" }
  | { name: "todo" }
  | { name: "episodes" }
  | { name: "chat"; view: SessionView }
  | { name: "report" }
  | { name: "reports" }
  | { name: "history" }
  | { name: "help"; session_id?: string };
type Tab = "home" | "report" | "history" | "help";
const TAB_OF: Record<Screen["name"], Tab | null> = { home: "home", todo: "home", episodes: "home", chat: null, report: "report", reports: "report", history: "history", help: "help" };

const SIZES = ["17px", "19px", "22px"] as const;
const STORE = "sehati-m-size";
const CATEGORIES = [
  { id: "obat", label: "Obat" },
  { id: "biaya", label: "Biaya" },
  { id: "dokter", label: "Pemeriksaan atau dokter" },
  { id: "informasi", label: "Penjelasan atau informasi" },
  { id: "administrasi", label: "Administrasi atau berkas" },
  { id: "lainnya", label: "Lainnya" },
];

const firstName = (n: string | null, fallback: string) => (n ?? fallback).split(" ")[0];
const clean = (s: string) => s.replace(/\s*\(simulasi\)\s*$/i, "");

type StartBody = { invitation_id?: string; episode_id?: string; stage?: string };
type Todo =
  | { kind: "followup"; key: string; f: FollowUpView }
  | { kind: "task"; key: string; tag: string; title: string; detail: string; meta?: string; cta: string; act: () => void };

export function ParticipantApp({ initial }: { initial: HomeView }) {
  const [home, setHome] = useState(initial);
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [size, setSize] = useState(1);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const reduce = useReducedMotion();
  const [zoom, setZoom] = useState(1);

  /* Desktop (>= lg): bingkai ponsel selalu 390x844 logis, diperkecil utuh agar pas tinggi layar (tanpa gulir di dalam). */
  useEffect(() => {
    const fit = () => setZoom(window.innerWidth >= 1024 ? Math.min(1, (window.innerHeight - 64) / (844 + 20)) : 1);
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORE);
      const v = Number(stored);
      if (stored !== null && (v === 0 || v === 1 || v === 2)) setSize(v);
    } catch {
      /* penyimpanan tidak tersedia: abaikan */
    }
  }, []);
  const pick = (n: number) => {
    setSize(n);
    try {
      localStorage.setItem(STORE, String(n));
    } catch {
      /* abaikan */
    }
  };

  const refresh = useCallback(async () => {
    try {
      setHome(await api<HomeView>("/api/survey/home"));
    } catch {
      /* beranda tetap menampilkan data terakhir */
    }
  }, []);

  async function start(body: StartBody, tag: string) {
    setErr(null);
    setBusy(tag);
    try {
      const view = await api<SessionView>("/api/survey/sessions", "POST", { ...body, idem_key: newKey() });
      setScreen({ name: "chat", view });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal memulai.");
      setScreen({ name: "home" });
      await refresh();
    } finally {
      setBusy(null);
    }
  }
  async function resume(id: string, tag: string) {
    setErr(null);
    setBusy(tag);
    try {
      setScreen({ name: "chat", view: await api<SessionView>(`/api/survey/sessions/${id}`) });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal membuka sesi.");
      setScreen({ name: "home" });
    } finally {
      setBusy(null);
    }
  }

  const exit = async () => {
    setScreen({ name: "home" });
    await refresh();
  };

  /* Daftar hal yang menunggu, urut dari yang paling mendesak. */
  const todos: Todo[] = [
    ...home.follow_ups.map((f): Todo => ({ kind: "followup", key: `fu-${f.id}`, f })),
    ...[...home.invitations]
      .sort((a, b) => (a.mode === b.mode ? 0 : a.mode === "directed" ? -1 : 1))
      .map((i): Todo => ({
        kind: "task", key: `inv-${i.id}`, tag: i.id, title: i.label, detail: i.detail,
        meta: `${clean(i.facility_name)}${i.expires_at ? ` · sampai ${fmtDate(i.expires_at)}` : ""}`,
        cta: i.session_id ? "Lanjutkan" : "Mulai",
        act: () => (i.session_id ? void resume(i.session_id, i.id) : void start({ invitation_id: i.id }, i.id)),
      })),
    ...home.episodes.flatMap((e) =>
      e.surveys
        .filter((s) => s.state === "active" && s.session_id && !home.invitations.some((i) => i.session_id === s.session_id))
        .map((s): Todo => ({ kind: "task", key: `ss-${s.session_id}`, tag: s.session_id!, title: `Lanjutkan survei`, detail: "Jawaban Anda sebelumnya sudah tersimpan. Tinggal beberapa pertanyaan.", meta: `${clean(e.facility_name)} · ${e.kind}`, cta: "Lanjutkan", act: () => void resume(s.session_id!, s.session_id!) })),
    ),
    ...home.episodes.flatMap((e) =>
      e.surveys
        .filter((s) => s.state === "available")
        .map((s): Todo => ({ kind: "task", key: `av-${e.id}-${s.stage}`, tag: `${e.id}-${s.stage}`, title: "Ceritakan pengalaman Anda", detail: `Beberapa pertanyaan singkat tentang ${e.kind.toLowerCase()} Anda.`, meta: `${clean(e.facility_name)} · ${fmtDate(e.admit_at)}`, cta: "Mulai", act: () => void start({ episode_id: e.id, stage: s.stage }, `${e.id}-${s.stage}`) })),
    ),
  ];

  const tab = TAB_OF[screen.name];
  const inChat = screen.name === "chat";
  const screenKey = screen.name === "chat" ? `chat-${screen.view.session.id}` : screen.name;
  const go = (t: Tab) => (t === "home" ? void exit() : setScreen(t === "help" ? { name: "help" } : t === "report" ? { name: "report" } : { name: "history" }));

  return (
    <main
      className="relative flex h-dvh w-full flex-col overflow-hidden bg-paper lg:col-start-2 lg:row-start-1 lg:box-content lg:h-[844px] lg:w-[390px] lg:self-center lg:justify-self-center lg:rounded-[3rem] lg:border-[10px] lg:border-ink lg:shadow-e4"
      style={{ fontSize: SIZES[size], zoom: zoom === 1 ? undefined : zoom }}
      aria-label="Aplikasi peserta SEHATI"
    >
      <TextSizeCtx.Provider value={size}>
      {!inChat && <AppHeader size={size} onPick={pick} />}
      <div className="relative min-h-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={screenKey}
            className={`absolute inset-0 flex flex-col ${inChat ? "" : "overflow-y-auto overscroll-contain px-4 pb-4 pt-1 no-scrollbar"}`}
            initial={{ opacity: 0, x: reduce ? 0 : 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: reduce ? 0 : -20 }}
            transition={{ duration: 0.2, ease: EASE }}
            data-screen={screen.name}
          >
            {screen.name === "home" && <Home home={home} todos={todos} err={err} busy={busy} onGo={setScreen} onChanged={refresh} />}
            {screen.name === "todo" && <TodoList todos={todos} busy={busy} onBack={() => setScreen({ name: "home" })} onChanged={refresh} />}
            {screen.name === "episodes" && <Episodes home={home} busy={busy} onBack={() => setScreen({ name: "home" })} onStart={start} onResume={resume} />}
            {screen.name === "chat" && (
              <Chat initial={screen.view} onExit={exit} onHelp={(id) => setScreen({ name: "help", session_id: id })} onChanged={() => void 0} />
            )}
            {screen.name === "report" && <ReportFlow home={home} onDone={exit} onReports={() => setScreen({ name: "reports" })} />}
            {screen.name === "reports" && <Reports reports={home.reports} onBack={() => setScreen({ name: "report" })} />}
            {screen.name === "history" && <History />}
            {screen.name === "help" && (
              <HelpForm
                sessionId={screen.session_id}
                openHelps={home.open_helps}
                onDone={() => (screen.session_id ? void resume(screen.session_id, screen.session_id) : void exit())}
                onBack={screen.session_id ? () => void resume(screen.session_id!, screen.session_id!) : undefined}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      {!inChat && tab && <TabBar active={tab} openHelps={home.open_helps} onSelect={go} />}
      </TextSizeCtx.Provider>
    </main>
  );
}

/* ---------- Kerangka ---------- */

function AppHeader({ size, onPick }: { size: number; onPick: (n: number) => void }) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-3 px-4 pb-1 pt-[max(0.625rem,env(safe-area-inset-top))]">
      <Brand size={20} />
      <div className="flex items-center gap-2">
        <span className="text-body-sm font-medium text-ink-soft" aria-hidden>Huruf</span>
        <div role="group" aria-label="Ukuran huruf" className="flex shrink-0 gap-0.5 rounded-2xl bg-card p-1 shadow-e1">
          {["A", "A+", "A++"].map((l, i) => (
            <button
              key={l}
              type="button"
              aria-label={["Huruf normal", "Huruf besar", "Huruf sangat besar"][i]}
              aria-pressed={size === i}
              onClick={() => onPick(i)}
              className={`grid h-11 min-w-11 place-items-center rounded-xl px-1.5 font-semibold transition-colors duration-150 ${size === i ? "bg-brand text-white" : "text-ink hover:bg-subtle"}`}
              style={{ fontSize: [14, 16, 19][i] }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

function TabBar({ active, openHelps, onSelect }: { active: Tab; openHelps: number; onSelect: (n: Tab) => void }) {
  const tabs = [
    { id: "home", label: "Beranda", Icon: IconHome },
    { id: "report", label: "Lapor", Icon: IconFlag },
    { id: "history", label: "Riwayat", Icon: IconHistory },
    { id: "help", label: "Bantuan", Icon: IconHelp },
  ] as const;
  return (
    <nav aria-label="Menu aplikasi" className="shrink-0 border-t border-line bg-card px-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] pt-1.5">
      <ul className="grid grid-cols-4 gap-1">
        {tabs.map(({ id, label, Icon }) => {
          const on = active === id;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onSelect(id)}
                aria-current={on ? "page" : undefined}
                className={`relative flex min-h-16 w-full flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1.5 text-[0.8em] font-semibold leading-none transition-colors duration-150 ${on ? "bg-brand-soft text-brand-ink" : "text-ink-soft hover:bg-subtle hover:text-ink"}`}
              >
                <span className="relative">
                  <Icon size={24} />
                  {id === "help" && openHelps > 0 && <span className="absolute -right-1 -top-0.5 size-2.5 rounded-full bg-accent ring-2 ring-card" aria-hidden />}
                </span>
                {label}
                {id === "help" && openHelps > 0 && <span className="sr-only">, {openHelps} permintaan menunggu</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ---------- Beranda ---------- */

function Home({ home, todos, err, busy, onGo, onChanged }: { home: HomeView; todos: Todo[]; err: string | null; busy: string | null; onGo: (s: Screen) => void; onChanged: () => void }) {
  const name = home.respondent_role === "companion" && home.companion_name ? firstName(home.companion_name, "") : firstName(home.participant.name, home.participant.pseudonym);
  const first = todos[0];
  const root = useRef<HTMLDivElement>(null);
  /* 0 lapang - 1 kartu ringkas - 2 tautan berdampingan - 3 rincian di balik "Detail" */
  const level = useFitLevel(root, 3, overflows, [todos.map((t) => t.key), err, home.episodes.length, home.reports.length]);
  const rows = [
    todos.length > 1 && { key: "todo", icon: <IconList size={22} />, label: "Hal lain menunggu", count: todos.length - 1, go: () => onGo({ name: "todo" }) },
    { key: "ep", icon: <IconHospital size={22} />, label: "Perawatan saya", count: home.episodes.length, go: () => onGo({ name: "episodes" }) },
    todos.length <= 1 && home.reports.length > 0 && { key: "rep", icon: <IconFlag size={22} />, label: "Laporan saya", count: home.reports.length, go: () => onGo({ name: "reports" }) },
  ].filter(Boolean) as { key: string; icon: ReactNode; label: string; count: number; go: () => void }[];
  return (
    <div ref={root} className={`flex min-h-0 flex-1 flex-col ${level >= 1 ? "gap-3" : "gap-4"}`}>
      <div className="shrink-0 pt-1">
        <h1 className={`truncate font-semibold leading-tight tracking-tight ${level >= 1 ? "text-[1.5em]" : "text-[1.75em]"}`}>Halo, {name}</h1>
        <p className="mt-0.5 flex flex-wrap items-center gap-2 leading-snug text-ink-soft">
          {todos.length === 0 ? "Tidak ada yang menunggu Anda." : todos.length === 1 ? "Ada satu hal untuk Anda." : `Ada ${todos.length} hal untuk Anda.`}
          {home.respondent_role === "companion" && <Tag tone="brand">Sebagai pendamping {home.participant.pseudonym}</Tag>}
        </p>
      </div>
      {err && (
        <Callout tone="danger" role="alert" icon={<IconAlert size={18} />}>
          {err}
        </Callout>
      )}
      {first ? (
        <TodoCard todo={first} busy={busy} onChanged={onChanged} hero level={level} />
      ) : (
        <article className="shrink-0 rounded-[1.75rem] bg-card p-5 text-center shadow-e2">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-ok-soft text-ok" aria-hidden><IconCheck size={28} /></span>
          <h2 className="mt-3 text-[1.3em] font-semibold leading-tight">Semua beres</h2>
          <p className="mt-1.5 leading-snug text-ink-soft">Pertanyaan baru akan muncul di sini.</p>
        </article>
      )}
      {level >= 2 && rows.length > 1 ? (
        <div className="mt-auto grid shrink-0 grid-cols-2 gap-2.5">
          {rows.map((r) => (
            <button key={r.key} type="button" onClick={r.go} className="flex min-h-16 flex-col items-start justify-center rounded-2xl bg-card px-3.5 py-2.5 text-left shadow-e1 transition-colors hover:bg-brand-tint">
              <span className="font-semibold leading-tight">{r.label}</span>
              <span className="mt-1 inline-flex items-center gap-1 text-[0.92em] font-semibold text-brand-ink">{r.count} <IconChevronRight size={18} /></span>
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-auto grid shrink-0 gap-2.5">
          {rows.map((r) => <RowLink key={r.key} icon={r.icon} label={r.label} count={r.count} onClick={r.go} />)}
        </div>
      )}
    </div>
  );
}

function TodoCard({ todo, busy, onChanged, hero = false, level = 0 }: { todo: Todo; busy: string | null; onChanged: () => void; hero?: boolean; level?: number }) {
  const [detail, setDetail] = useState(false);
  const roomy = hero && level === 0;
  const pad = roomy ? "rounded-[1.75rem] p-5 shadow-e2" : hero ? "rounded-[1.75rem] p-4 shadow-e2" : "rounded-3xl p-4 shadow-e1";
  if (todo.kind === "followup") return <FollowUpCard f={todo.f} onChanged={onChanged} className={pad} hero={hero} />;
  const on = busy === todo.tag;
  const hide = hero && level >= 3;
  return (
    <article className={`shrink-0 bg-card ring-1 ring-brand/15 ${pad}`}>
      <Tag tone="brand"><IconClipboard size={15} /> Menunggu Anda</Tag>
      <h2 className={`mt-2.5 font-semibold leading-tight tracking-tight ${roomy ? "text-[1.4em]" : hero ? "text-[1.25em]" : "text-[1.15em]"}`}>{todo.title}</h2>
      {hide ? (
        <button type="button" onClick={() => setDetail(true)} aria-haspopup="dialog" className="-ml-2 mt-1 inline-flex min-h-12 items-center gap-1.5 rounded-xl px-2 font-semibold text-brand-ink hover:bg-brand-tint">
          <IconInfo size={20} /> Detail
        </button>
      ) : (
        <p className="mt-1.5 leading-snug text-ink-soft">{todo.detail}</p>
      )}
      {todo.meta && !(hero && level >= 1) && (
        <p className="mt-2 flex items-start gap-1.5 text-[0.9em] leading-snug text-ink-soft">
          <IconClock size={17} className="mt-0.5 shrink-0" /> {todo.meta}
        </p>
      )}
      <button type="button" className={`${BTN.primary} ${roomy ? "mt-5 min-h-16 text-[1.1em]" : "mt-3.5"}`} disabled={busy !== null} onClick={todo.act}>
        {on ? <Spinner /> : null} {on ? "Membuka…" : todo.cta} {!on && <IconArrowRight size={20} />}
      </button>
      <AnimatePresence>
        {detail && (
          <Sheet key="d" title={todo.title} titleId={`d-${todo.key}`} onClose={() => setDetail(false)}>
            <p className="leading-snug text-ink">{todo.detail}</p>
            {todo.meta && <p className="flex items-start gap-1.5 leading-snug text-ink-soft"><IconClock size={18} className="mt-0.5 shrink-0" /> {todo.meta}</p>}
            <button type="button" onClick={() => { setDetail(false); todo.act(); }} className={BTN.primary}>{todo.cta} <IconArrowRight size={20} /></button>
          </Sheet>
        )}
      </AnimatePresence>
    </article>
  );
}

function FollowUpCard({ f, onChanged, className, hero }: { f: FollowUpView; onChanged: () => void; className: string; hero: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function confirm(outcome: "resolved" | "still_issue") {
    setErr(null);
    setBusy(outcome);
    try {
      await api(`/api/survey/followups/${f.id}`, "POST", { outcome });
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal mengirim.");
    } finally {
      setBusy(null);
    }
  }
  return (
    <article className={`shrink-0 bg-card ring-1 ring-brand/15 ${className}`}>
      <Tag tone="warn">Mohon dikonfirmasi</Tag>
      <h2 className={`mt-3 font-semibold leading-tight ${hero ? "text-[1.25em]" : "text-[1.1em]"}`}>{clean(f.facility_name)} sudah memperbaiki:</h2>
      <p className="mt-2 line-clamp-3 rounded-xl bg-subtle px-3 py-2 leading-snug text-ink">{f.description}</p>
      <p className="mt-3 font-semibold">Apakah kendala Anda sudah selesai?</p>
      <div className="mt-2.5 grid gap-2">
        <button type="button" className={BTN.primary} disabled={busy !== null} onClick={() => confirm("resolved")}>
          {busy === "resolved" ? <Spinner /> : <IconCheck size={20} />} Sudah selesai
        </button>
        <button type="button" className={BTN.secondary} disabled={busy !== null} onClick={() => confirm("still_issue")}>
          {busy === "still_issue" && <Spinner />} Belum selesai
        </button>
      </div>
      {err && <Callout tone="danger" role="alert" className="mt-2" icon={<IconAlert size={18} />}>{err}</Callout>}
    </article>
  );
}

function TodoList({ todos, busy, onBack, onChanged }: { todos: Todo[]; busy: string | null; onBack: () => void; onChanged: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <ScreenTitle title="Menunggu Anda" onBack={onBack} backLabel="Beranda" />
      {todos.length === 0 ? (
        <p className="leading-snug text-ink-soft">Tidak ada yang menunggu Anda.</p>
      ) : (
        <AutoPager label="Halaman daftar tugas" items={todos.map((t) => ({ key: t.key, node: <TodoCard todo={t} busy={busy} onChanged={onChanged} /> }))} />
      )}
    </div>
  );
}

function Episodes({ home, busy, onBack, onStart, onResume }: { home: HomeView; busy: string | null; onBack: () => void; onStart: (b: StartBody, tag: string) => void; onResume: (id: string, tag: string) => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <ScreenTitle title="Perawatan saya" onBack={onBack} backLabel="Beranda" />
      {home.episodes.length === 0 ? (
        <Empty icon={<IconHospital size={24} />} title="Belum ada perawatan" text="Perawatan Anda akan muncul di sini." />
      ) : (
        <AutoPager
          label="Halaman perawatan"
          items={home.episodes.map((e) => ({
            key: e.id,
            node: (
              <article className="rounded-3xl bg-card p-4 shadow-e1">
                <div className="flex items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-subtle text-ink-soft" aria-hidden><IconHospital size={22} /></span>
                  <div className="min-w-0">
                    <h2 className="font-semibold leading-snug">{clean(e.facility_name)}</h2>
                    <p className="text-[0.92em] leading-snug text-ink-soft">{e.kind} · {fmtDate(e.admit_at)}</p>
                  </div>
                </div>
                <div className="mt-3 grid gap-2">
                  {e.surveys.map((s) =>
                    s.state === "done" ? (
                      <p key={s.stage} className="flex min-h-12 items-center gap-2 rounded-2xl bg-ok-soft px-3.5 py-2 font-semibold leading-snug text-ok">
                        <IconCheck size={20} className="shrink-0" /> Survei sudah diisi
                      </p>
                    ) : s.state === "active" ? (
                      <button key={s.stage} type="button" className={BTN.outline} disabled={busy !== null} onClick={() => onResume(s.session_id!, s.session_id!)}>
                        {busy === s.session_id && <Spinner />} Lanjutkan survei
                      </button>
                    ) : (
                      <button key={s.stage} type="button" className={BTN.outline} disabled={busy !== null} onClick={() => onStart({ episode_id: e.id, stage: s.stage }, `${e.id}-${s.stage}`)}>
                        {busy === `${e.id}-${s.stage}` ? <Spinner /> : null} {busy === `${e.id}-${s.stage}` ? "Membuka…" : "Mulai survei"}
                      </button>
                    ),
                  )}
                </div>
              </article>
            ),
          }))}
        />
      )}
    </div>
  );
}

function Empty({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-card text-ink-soft shadow-e1" aria-hidden>{icon}</span>
      <p className="mt-1 text-[1.1em] font-semibold">{title}</p>
      <p className="leading-snug text-ink-soft">{text}</p>
    </div>
  );
}

/* ---------- Lapor ---------- */

function Choice({ label, sub, on, onClick }: { label: string; sub?: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`flex min-h-16 w-full items-center gap-3 rounded-2xl border px-4 py-2.5 text-left leading-snug transition-colors duration-150 active:scale-[0.99] ${on ? "border-brand bg-brand-soft text-brand-ink shadow-e1" : "border-line-strong bg-card text-ink shadow-e1 hover:border-brand hover:bg-brand-tint"}`}
    >
      <span aria-hidden className={`grid size-7 shrink-0 place-items-center rounded-full border-2 ${on ? "border-brand bg-brand text-white" : "border-line-strong"}`}>{on && <IconCheck size={16} />}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[1.05em] font-semibold">{label}</span>
        {sub && <span className="block text-[0.9em] text-ink-soft">{sub}</span>}
      </span>
      <IconChevronRight size={22} className="shrink-0 text-ink-soft" />
    </button>
  );
}

function ReportFlow({ home, onDone, onReports }: { home: HomeView; onDone: () => void; onReports: () => void }) {
  const [step, setStep] = useState<"start" | "episode" | "category" | "text" | "sent">("start");
  const [episode, setEpisode] = useState(home.episodes.length === 1 ? home.episodes[0].id : "");
  const [category, setCategory] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [key] = useState(newKey);
  const one = home.episodes.length === 1;
  const total = one ? 2 : 3;
  const n = (s: "episode" | "category" | "text") => (s === "episode" ? 1 : s === "category" ? (one ? 1 : 2) : total);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api("/api/survey/reports", "POST", { episode_id: episode, category, text, idem_key: key });
      setStep("sent");
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : "Gagal mengirim.");
    } finally {
      setBusy(false);
    }
  }
  const kicker = (s: "episode" | "category" | "text") => <span className="text-[0.95em] font-semibold text-ink-soft">Langkah {n(s)} dari {total}</span>;

  if (step === "sent")
    return (
      <Done title="Laporan terkirim" action={<button type="button" onClick={onDone} className={BTN.primary}>Kembali ke beranda</button>}>
        <p>Terima kasih. Petugas akan memeriksanya.</p>
        <p>Pantau statusnya di “Laporan saya”.</p>
      </Done>
    );

  if (step === "start")
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <ScreenTitle title="Lapor kendala" />
        <article className="shrink-0 rounded-[1.75rem] bg-card p-5 shadow-e2">
          <span className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand" aria-hidden><IconFlag size={28} /></span>
          <h2 className="mt-4 text-[1.3em] font-semibold leading-tight">Ada kendala dengan layanan?</h2>
          <p className="mt-2 leading-snug text-ink-soft">Ceritakan kepada kami. Petugas akan memeriksanya.</p>
          {home.episodes.length === 0 ? (
            <Callout tone="neutral" className="mt-4" icon={<IconInfo size={18} />}>Belum ada perawatan yang dapat dilaporkan.</Callout>
          ) : (
            <button type="button" className={`${BTN.primary} mt-5 min-h-16 text-[1.1em]`} onClick={() => setStep(one ? "category" : "episode")}>
              Mulai lapor <IconArrowRight size={20} />
            </button>
          )}
        </article>
        <div className="mt-auto shrink-0">
          <RowLink icon={<IconList size={22} />} label="Laporan saya" count={home.reports.length} onClick={onReports} />
        </div>
      </div>
    );

  if (step === "episode")
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <ScreenTitle title="Perawatan yang mana?" onBack={() => setStep("start")} aside={kicker("episode")} />
        <AutoPager
          label="Halaman pilihan perawatan"
          items={home.episodes.map((e) => ({
            key: e.id,
            node: <Choice label={clean(e.facility_name)} sub={`${e.kind} · ${fmtDate(e.admit_at)}`} on={episode === e.id} onClick={() => { setEpisode(e.id); setStep("category"); }} />,
          }))}
        />
      </div>
    );

  if (step === "category")
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <ScreenTitle title="Soal apa?" onBack={() => setStep(one ? "start" : "episode")} aside={kicker("category")} />
        <AutoPager
          label="Halaman pilihan kendala"
          items={CATEGORIES.map((c) => ({ key: c.id, node: <Choice label={c.label} on={category === c.id} onClick={() => { setCategory(c.id); setStep("text"); }} /> }))}
        />
      </div>
    );

  const ep = home.episodes.find((e) => e.id === episode);
  const cat = CATEGORIES.find((c) => c.id === category);
  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col gap-3">
      <ScreenTitle title="Ceritakan singkat" onBack={() => setStep("category")} aside={kicker("text")} />
      <p className="flex shrink-0 flex-wrap gap-1.5">
        {cat && <Tag tone="brand">{cat.label}</Tag>}
        {ep && <Tag>{clean(ep.facility_name)} · {fmtDate(ep.admit_at)}</Tag>}
      </p>
      <label htmlFor="rt" className="sr-only">Ceritakan singkat</label>
      <textarea id="rt" required minLength={8} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} className="min-h-[5.5em] w-full flex-1 resize-none rounded-2xl border border-line-strong bg-card p-3.5 leading-snug shadow-e1" placeholder="Apa yang terjadi dan kapan?" />
      <p className="flex shrink-0 justify-between gap-2 text-[0.88em] leading-snug text-ink-soft"><span>Jangan tulis nomor identitas atau kata sandi.</span><span className="tabular-nums">{text.length}/1000</span></p>
      {err && <Callout tone="danger" role="alert" icon={<IconAlert size={18} />}>{err}</Callout>}
      <button type="submit" disabled={busy || !episode || !category || text.trim().length < 8} className={`${BTN.primary} shrink-0`}>{busy && <Spinner />} {busy ? "Mengirim…" : "Kirim laporan"}</button>
    </form>
  );
}

function Reports({ reports, onBack }: { reports: ReportView[]; onBack: () => void }) {
  const [open, setOpen] = useState<ReportView | null>(null);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <ScreenTitle title="Laporan saya" onBack={onBack} backLabel="Lapor" />
      {reports.length === 0 ? (
        <Empty icon={<IconFlag size={24} />} title="Belum ada laporan" text="Anda dapat melapor kapan saja." />
      ) : (
        <AutoPager
          label="Halaman laporan"
          items={reports.map((r) => ({
            key: r.id,
            node: (
              <button type="button" onClick={() => setOpen(r)} className="w-full rounded-3xl bg-card p-4 text-left shadow-e1 transition-colors hover:bg-brand-tint">
                <span className="flex items-start justify-between gap-2">
                  <span className="font-semibold leading-snug">{r.category_label}</span>
                  <Tag tone="info">{r.status_label}</Tag>
                </span>
                <span className="mt-1 line-clamp-2 block leading-snug text-ink-soft">{r.text}</span>
                <span className="mt-2 inline-flex items-center gap-1 font-semibold text-brand-ink">Detail <IconChevronRight size={18} /></span>
              </button>
            ),
          }))}
        />
      )}
      <AnimatePresence>
        {open && (
          <Sheet key="rep" title={open.category_label} titleId="rep-h" onClose={() => setOpen(null)}>
            <Tag tone="info">{open.status_label}</Tag>
            <p className="leading-snug text-ink">{open.text}</p>
            <p className="text-[0.92em] leading-snug text-ink-soft">{clean(open.facility_name)} · {fmtDate(open.created_at)}</p>
            <Callout tone="brand" icon={<IconInfo size={18} className="text-brand" />}>{open.hint}</Callout>
          </Sheet>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------- Bantuan ---------- */

function HelpForm({ sessionId, openHelps, onDone, onBack }: { sessionId?: string; openHelps: number; onDone: () => void; onBack?: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [key] = useState(newKey);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api("/api/survey/help", "POST", { session_id: sessionId, reason, idem_key: key });
      setSent(true);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Gagal mengirim.");
    } finally {
      setBusy(false);
    }
  }
  if (sent)
    return (
      <Done title="Permintaan terkirim" action={<button type="button" onClick={onDone} className={BTN.primary}>{sessionId ? "Kembali ke survei" : "Kembali ke beranda"}</button>}>
        <p>Petugas akan menghubungi Anda.</p>
      </Done>
    );
  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col gap-3">
      <ScreenTitle title="Bantuan petugas" onBack={onBack} backLabel="Kembali ke survei" />
      <Callout tone="warn" icon={<IconAlert size={20} className="text-warn" />}>
        <strong className="font-semibold">Darurat?</strong> Segera ke IGD terdekat. Permintaan di sini tidak dijawab seketika.
      </Callout>
      {openHelps > 0 && (
        <Callout tone="brand" role="status" icon={<IconClock size={18} className="text-brand" />}>
          {openHelps} permintaan Anda sedang menunggu petugas.
        </Callout>
      )}
      <label htmlFor="hr" className="shrink-0 pt-1 text-[1.05em] font-semibold">Bantuan apa yang Anda perlukan?</label>
      <textarea id="hr" required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-[4.5em] w-full flex-1 resize-none rounded-2xl border border-line-strong bg-card p-3.5 leading-snug shadow-e1" placeholder="Contoh: saya bingung cara menjawab" />
      {err && <Callout tone="danger" role="alert" icon={<IconAlert size={18} />}>{err}</Callout>}
      <button type="submit" disabled={busy || reason.trim().length < 3} className={`${BTN.primary} shrink-0`}>{busy && <Spinner />} {busy ? "Mengirim…" : "Kirim permintaan"}</button>
      <p className="flex shrink-0 items-start gap-2 text-[0.85em] leading-snug text-ink-soft">
        <IconShield size={17} className="mt-0.5 shrink-0" /> Prototipe, data sintetis. Bukan aplikasi resmi BPJS Kesehatan.
      </p>
    </form>
  );
}

/* ---------- Riwayat ---------- */

function History() {
  const [h, setH] = useState<HistoryView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => {
    api<HistoryView>("/api/survey/history").then(setH).catch((e) => setErr(e instanceof Error ? e.message : "Gagal memuat."));
  }, []);
  const s = h?.sessions.find((x) => x.id === sel);
  if (s)
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <ScreenTitle title={s.stage_label} onBack={() => setSel(null)} backLabel="Riwayat" sub={`${clean(s.facility_name)} · ${s.status}${s.respondent_role === "companion" ? " · oleh pendamping" : ""}`} />
        {s.facts.length === 0 ? (
          <Empty icon={<IconHistory size={24} />} title="Belum ada jawaban" text="Belum ada jawaban tersimpan untuk survei ini." />
        ) : (
          <AutoPager
            label="Halaman jawaban"
            resetKey={s.id}
            items={s.facts.map((f, i) => ({
              key: `${i}`,
              node: (
                <div className="rounded-2xl bg-card px-4 py-3 shadow-e1">
                  <p className="text-[0.92em] leading-snug text-ink-soft">{f.slot_label}</p>
                  <p className="mt-0.5 text-[1.05em] font-semibold leading-snug">{f.value_label}{f.origin === "correction" && <span className="font-normal text-ink-soft"> (sudah Anda ubah)</span>}</p>
                </div>
              ),
            }))}
          />
        )}
      </div>
    );
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <ScreenTitle title="Riwayat jawaban" />
      {err && <Callout tone="danger" role="alert" icon={<IconAlert size={18} />}>{err}</Callout>}
      {!h && !err && (
        <div role="status" aria-label="Memuat" className="space-y-2.5">
          {[0, 1].map((i) => <div key={i} className="skeleton h-20 rounded-3xl" />)}
          <span className="sr-only">Memuat…</span>
        </div>
      )}
      {h && h.sessions.length === 0 && <Empty icon={<IconHistory size={24} />} title="Belum ada jawaban" text="Jawaban yang tersimpan muncul di sini." />}
      {h && h.sessions.length > 0 && (
        <AutoPager
          label="Halaman riwayat"
          items={h.sessions.map((x) => ({
            key: x.id,
            node: (
              <button type="button" onClick={() => setSel(x.id)} className="flex min-h-16 w-full items-center gap-3 rounded-3xl bg-card p-4 text-left shadow-e1 transition-colors hover:bg-brand-tint">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-ok-soft text-ok" aria-hidden><IconCheck size={22} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold leading-snug">{x.stage_label}</span>
                  <span className="block text-[0.92em] leading-snug text-ink-soft">
                    {x.started_at ? fmtDate(x.started_at) : clean(x.facility_name)} · {x.status}
                    {x.respondent_role === "companion" ? " · oleh pendamping" : ""}
                  </span>
                </span>
                <IconChevronRight size={22} className="shrink-0 text-ink-soft" />
              </button>
            ),
          }))}
        />
      )}
    </div>
  );
}
