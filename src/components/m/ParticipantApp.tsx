"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Brand } from "@/components/Brand";
import type { HistoryView, HomeView } from "@/lib/survey/participant";
import type { SessionView } from "@/lib/survey/service";
import { fmtDate } from "@/lib/dates";
import { Chat } from "./Chat";
import { ApiError, api, newKey } from "./api";
import { IconAlert, IconArrowLeft, IconCheck, IconChevron, IconClipboard, IconClock, IconFlag, IconHelp, IconHistory, IconHome, IconHospital, IconInfo, IconShield } from "./icons";
import { BTN, Callout, Spinner, Tag } from "./kit";

type Screen = { name: "home" } | { name: "chat"; view: SessionView } | { name: "report" } | { name: "history" } | { name: "help"; session_id?: string };

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

export function ParticipantApp({ initial }: { initial: HomeView }) {
  const [home, setHome] = useState(initial);
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [size, setSize] = useState(1);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

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

  async function start(body: { invitation_id?: string; episode_id?: string; stage?: string }, tag: string) {
    setErr(null);
    setBusy(tag);
    try {
      const view = await api<SessionView>("/api/survey/sessions", "POST", { ...body, idem_key: newKey() });
      setScreen({ name: "chat", view });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal memulai.");
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
    } finally {
      setBusy(null);
    }
  }

  const exit = async () => {
    setScreen({ name: "home" });
    await refresh();
  };

  const inChat = screen.name === "chat";

  return (
    <main className="relative flex h-dvh w-full flex-col overflow-hidden bg-paper md:col-start-2 md:row-span-2 md:row-start-1 md:h-[min(820px,calc(100dvh-3rem))] md:w-[400px] md:shrink-0 md:self-start md:sticky md:top-6 lg:static lg:row-span-1 lg:self-center md:rounded-[2.5rem] md:border-[9px] md:border-ink md:shadow-depth-3" style={{ fontSize: SIZES[size] }} aria-label="Aplikasi peserta SEHATI">
      {screen.name === "home" && (
        <header className="shrink-0 border-b border-line bg-card px-4 pb-3 pt-2.5">
          <div className="flex items-center justify-between gap-3">
            <Brand size={20} />
            <div role="group" aria-label="Ukuran huruf" className="flex shrink-0 gap-0.5 rounded-xl bg-subtle p-0.5 ring-1 ring-line">
              {["A", "A+", "A++"].map((l, i) => (
                <button
                  key={l}
                  type="button"
                  aria-label={["Huruf normal", "Huruf besar", "Huruf sangat besar"][i]}
                  aria-pressed={size === i}
                  onClick={() => pick(i)}
                  className={`grid h-11 min-w-11 place-items-center rounded-[10px] px-1.5 font-semibold transition-colors ${size === i ? "bg-card text-brand-ink shadow-depth-1 ring-1 ring-line" : "text-ink-soft hover:bg-card/70"}`}
                  style={{ fontSize: [14, 16, 19][i] }}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <h1 className="mt-2.5 truncate text-[1.45em] font-semibold leading-tight tracking-tight">Halo, {home.respondent_role === "companion" && home.companion_name ? firstName(home.companion_name, "") : firstName(home.participant.name, home.participant.pseudonym)}</h1>
          {home.respondent_role === "companion" && (
            <p className="mt-1.5"><Tag tone="brand">Masuk sebagai pendamping</Tag></p>
          )}
        </header>
      )}
      <div key={screen.name} className={`min-h-0 flex-1 animate-fade-in ${inChat ? "overflow-hidden" : "overflow-y-auto overscroll-contain"}`}>
        {screen.name === "home" && <Home home={home} err={err} busy={busy} onStart={start} onResume={resume} onChanged={refresh} onGo={setScreen} />}
        {screen.name === "chat" && <Chat initial={screen.view} onExit={exit} onHelp={(id) => setScreen({ name: "help", session_id: id })} onChanged={() => void 0} />}
        {screen.name === "report" && <ReportForm home={home} onDone={exit} onBack={exit} />}
        {screen.name === "history" && <History onBack={exit} />}
        {screen.name === "help" && <HelpForm sessionId={screen.session_id} onDone={exit} onBack={exit} />}
      </div>
      {!inChat && <TabBar active={screen.name} openHelps={home.open_helps} onSelect={(n) => (n === "home" ? void exit() : setScreen(n === "report" ? { name: "report" } : n === "history" ? { name: "history" } : { name: "help" }))} />}
    </main>
  );
}

function TabBar({ active, openHelps, onSelect }: { active: Screen["name"]; openHelps: number; onSelect: (n: "home" | "report" | "history" | "help") => void }) {
  const tabs = [
    { id: "home", label: "Beranda", Icon: IconHome },
    { id: "report", label: "Lapor", Icon: IconFlag },
    { id: "history", label: "Riwayat", Icon: IconHistory },
    { id: "help", label: "Bantuan", Icon: IconHelp },
  ] as const;
  return (
    <nav aria-label="Menu aplikasi" className="shrink-0 border-t border-line bg-card pb-[env(safe-area-inset-bottom)]">
      <ul className="grid grid-cols-4">
        {tabs.map(({ id, label, Icon }) => {
          const on = active === id;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onSelect(id)}
                aria-current={on ? "page" : undefined}
                className={`relative flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[0.72em] font-semibold transition-colors ${on ? "text-brand-ink" : "text-muted hover:text-ink"}`}
              >
                <span className={`relative grid h-7 w-12 place-items-center rounded-full transition-colors ${on ? "bg-brand-soft" : ""}`}>
                  <Icon size={21} />
                  {id === "help" && openHelps > 0 && <span className="absolute right-2 top-0.5 size-2 rounded-full bg-accent ring-2 ring-card" aria-hidden />}
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

function SectionHead({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="px-1">
      <h2 className="text-[0.95em] font-semibold text-ink">{children}</h2>
      {hint && <p className="text-[0.8em] text-muted">{hint}</p>}
    </div>
  );
}

function Home({ home, err, busy, onStart, onResume, onGo, onChanged }: { home: HomeView; err: string | null; busy: string | null; onStart: (b: { invitation_id?: string; episode_id?: string; stage?: string }, tag: string) => void; onResume: (id: string, tag: string) => void; onGo: (s: Screen) => void; onChanged: () => void }) {
  const [fuErr, setFuErr] = useState<string | null>(null);
  const [fuBusy, setFuBusy] = useState<string | null>(null);
  async function confirmFu(id: string, outcome: "resolved" | "still_issue") {
    setFuErr(null);
    setFuBusy(`${id}:${outcome}`);
    try {
      await api(`/api/survey/followups/${id}`, "POST", { outcome });
      onChanged();
    } catch (e) {
      setFuErr(e instanceof Error ? e.message : "Gagal mengirim.");
    } finally {
      setFuBusy(null);
    }
  }
  const activeSessions = home.episodes.flatMap((e) => e.surveys.filter((s) => s.state === "active" && s.session_id).map((s) => ({ e, s })));
  const hasAvailable = home.episodes.some((e) => e.surveys.some((s) => s.state === "available"));
  const allClear = home.invitations.length === 0 && activeSessions.length === 0 && home.follow_ups.length === 0 && !hasAvailable;
  return (
    <div className="space-y-6 px-4 pb-6 pt-4">
      <div className="space-y-2.5">
        {home.respondent_role === "companion" && (
          <Callout tone="brand" icon={<IconInfo size={18} className="text-brand" />}>
            Untuk peserta {home.participant.pseudonym}. Jawaban Anda dicatat sebagai jawaban pendamping.
          </Callout>
        )}
        {err && (
          <Callout tone="danger" role="alert" icon={<IconAlert size={18} />}>
            {err}
          </Callout>
        )}
      </div>

      {(home.invitations.length > 0 || activeSessions.length > 0) && (
        <section className="space-y-2.5" aria-label="Perlu dijawab">
          <SectionHead>Menunggu Anda</SectionHead>
          {activeSessions.map(({ e, s }) => (
            <article key={s.session_id} className="rounded-2xl border border-brand/35 bg-card p-4 shadow-depth-1">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand" aria-hidden><IconClipboard size={22} /></span>
                <div className="min-w-0">
                  <h3 className="font-semibold leading-snug">Lanjutkan {s.label.toLowerCase()}</h3>
                  <p className="mt-0.5 text-[0.85em] leading-snug text-ink-soft">{clean(e.facility_name)}, {e.kind}. Jawaban tersimpan.</p>
                </div>
              </div>
              <button type="button" className={`${BTN.primary} mt-3.5`} disabled={busy !== null} onClick={() => onResume(s.session_id!, s.session_id!)}>
                {busy === s.session_id && <Spinner />} Lanjutkan
              </button>
            </article>
          ))}
          {home.invitations.map((i) => (
            <article key={i.id} className="rounded-2xl border border-brand/35 bg-card p-4 shadow-depth-1">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand" aria-hidden><IconClipboard size={22} /></span>
                <div className="min-w-0">
                  <h3 className="font-semibold leading-snug">{i.label}</h3>
                  <p className="mt-0.5 text-[0.85em] leading-snug text-ink-soft">{clean(i.facility_name)}. {i.detail}</p>
                  {i.expires_at && <p className="mt-1.5 flex items-center gap-1.5 text-[0.78em] text-muted"><IconClock size={14} /> Berlaku sampai {fmtDate(i.expires_at)}</p>}
                </div>
              </div>
              <button type="button" className={`${BTN.primary} mt-3.5`} disabled={busy !== null} onClick={() => (i.session_id ? onResume(i.session_id, i.id) : onStart({ invitation_id: i.id }, i.id))}>
                {busy === i.id && <Spinner />} {busy === i.id ? "Membuka…" : i.session_id ? "Lanjutkan" : "Mulai"}
              </button>
            </article>
          ))}
        </section>
      )}

      {home.follow_ups.length > 0 && (
        <section className="space-y-2.5" aria-label="Tindak lanjut">
          <SectionHead>Mohon dikonfirmasi</SectionHead>
          {home.follow_ups.map((f) => (
            <article key={f.id} className="rounded-2xl border border-line bg-card p-4">
              <h3 className="font-semibold leading-snug">{clean(f.facility_name)} menyatakan sudah memperbaiki:</h3>
              <p className="mt-1.5 rounded-lg bg-subtle px-3 py-2 text-[0.9em] leading-snug text-ink-soft">{f.description}</p>
              <p className="mt-3 font-medium">Apakah kendala Anda sudah selesai?</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" className={BTN.primary} disabled={fuBusy !== null} onClick={() => confirmFu(f.id, "resolved")}>
                  {fuBusy === `${f.id}:resolved` ? <Spinner /> : <IconCheck size={18} />} Sudah selesai
                </button>
                <button type="button" className={BTN.secondary} disabled={fuBusy !== null} onClick={() => confirmFu(f.id, "still_issue")}>
                  {fuBusy === `${f.id}:still_issue` && <Spinner />} Belum selesai
                </button>
              </div>
            </article>
          ))}
          {fuErr && <Callout tone="danger" role="alert" icon={<IconAlert size={18} />}>{fuErr}</Callout>}
        </section>
      )}

      {allClear && (
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-card p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ok-soft text-ok" aria-hidden><IconCheck size={20} /></span>
          <p className="text-[0.9em] leading-snug text-ink-soft"><span className="font-semibold text-ink">Tidak ada yang menunggu Anda.</span> Pertanyaan baru akan muncul di sini.</p>
        </div>
      )}

      <section className="space-y-2.5" aria-label="Perawatan saya">
        <SectionHead>Perawatan saya</SectionHead>
        {home.episodes.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line-strong bg-card px-4 py-6 text-center">
            <span className="mx-auto grid size-10 place-items-center rounded-full bg-subtle text-muted" aria-hidden><IconHospital size={20} /></span>
            <p className="mt-2 font-semibold">Belum ada riwayat perawatan</p>
            <p className="mt-0.5 text-[0.85em] text-ink-soft">Perawatan Anda akan muncul di sini.</p>
          </div>
        )}
        {home.episodes.map((e) => (
          <article key={e.id} className="rounded-2xl border border-line bg-card p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-subtle text-ink-soft" aria-hidden><IconHospital size={22} /></span>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold leading-snug">{clean(e.facility_name)}</h3>
                <p className="mt-0.5 flex flex-wrap gap-x-2 text-[0.82em] leading-snug text-ink-soft"><span>{e.kind}</span><span className="min-w-0">{fmtDate(e.admit_at)}{e.kind === "Rawat inap" ? ` – ${fmtDate(e.discharge_at)}` : ""}</span></p>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {e.surveys.map((s) =>
                s.state === "done" ? (
                  <p key={s.stage} className="flex items-start gap-2 rounded-xl bg-ok-soft px-3 py-2.5 text-[0.88em] font-medium leading-snug text-ok">
                    <IconCheck size={17} className="mt-0.5 shrink-0" />
                    <span>{s.label}: sudah diisi{s.status && <span className="block text-[0.9em] font-normal text-ok/90">Status: {s.status.toLowerCase()}</span>}</span>
                  </p>
                ) : s.state === "active" ? (
                  <button key={s.stage} type="button" className={BTN.outline} disabled={busy !== null} onClick={() => onResume(s.session_id!, s.session_id!)}>
                    {busy === s.session_id && <Spinner />} Lanjutkan {s.label.toLowerCase()}
                  </button>
                ) : (
                  <button key={s.stage} type="button" className={BTN.outline} disabled={busy !== null} onClick={() => onStart({ episode_id: e.id, stage: s.stage }, `${e.id}-${s.stage}`)}>
                    {busy === `${e.id}-${s.stage}` && <Spinner />} {busy === `${e.id}-${s.stage}` ? "Membuka…" : `Mulai survei: ${s.label.toLowerCase()}`}
                  </button>
                ),
              )}
            </div>
          </article>
        ))}
      </section>

      <section className="space-y-2.5" aria-label="Laporan saya">
        <SectionHead>Laporan saya</SectionHead>
        {home.reports.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line-strong bg-card px-4 py-5 text-[0.9em] leading-snug text-ink-soft">
            Belum ada laporan. Anda dapat melapor kapan saja.
          </div>
        ) : (
          <ul className="space-y-2.5">
            {home.reports.map((r) => (
              <li key={r.id} className="rounded-2xl border border-line bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold leading-snug">{r.category_label}</h3>
                  <Tag tone="info">{r.status_label}</Tag>
                </div>
                <p className="mt-1 text-[0.88em] leading-snug text-ink-soft">{r.text}</p>
                <p className="mt-2 border-t border-line pt-2 text-[0.78em] leading-snug text-muted">{r.hint}</p>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className={BTN.secondary} onClick={() => onGo({ name: "report" })}>
          <IconFlag size={18} /> Lapor kendala
        </button>
      </section>

      {home.open_helps > 0 && (
        <Callout tone="warn" icon={<IconInfo size={18} className="text-warn" />}>
          {home.open_helps} permintaan bantuan Anda menunggu petugas.
        </Callout>
      )}

      <p className="flex gap-2 px-1 text-[0.78em] leading-snug text-muted">
        <IconShield size={17} className="mt-px shrink-0" />
        <span>Prototipe dengan data sintetis. Bukan aplikasi resmi BPJS Kesehatan dan tidak terhubung ke sistem mereka.</span>
      </p>
    </div>
  );
}

function Frame({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center gap-1 border-b border-line bg-card px-2 py-2">
        <button type="button" onClick={onBack} aria-label="Kembali ke beranda" className="grid min-h-11 min-w-11 place-items-center rounded-xl text-ink hover:bg-subtle">
          <IconArrowLeft size={22} />
        </button>
        <h1 className="text-[1.1em] font-semibold">{title}</h1>
      </div>
      <div className="space-y-4 px-4 pb-6 pt-4">{children}</div>
    </div>
  );
}

function SuccessBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-card p-5 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-ok-soft text-ok" aria-hidden><IconCheck size={28} /></span>
      <h2 className="text-[1.25em] font-semibold leading-snug">{title}</h2>
      <div className="space-y-2 text-left text-[0.92em] leading-relaxed text-ink-soft">{children}</div>
    </div>
  );
}

function ReportForm({ home, onDone, onBack }: { home: HomeView; onDone: () => void; onBack: () => void }) {
  const [episode, setEpisode] = useState(home.episodes[0]?.id ?? "");
  const [category, setCategory] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [key] = useState(newKey);
  const [sent, setSent] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api("/api/survey/reports", "POST", { episode_id: episode, category, text, idem_key: key });
      setSent(true);
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : "Gagal mengirim.");
    } finally {
      setBusy(false);
    }
  }
  if (sent)
    return (
      <Frame title="Laporan terkirim" onBack={onDone}>
        <SuccessBlock title="Terima kasih, laporan Anda sudah masuk">
          <p>Laporan diteruskan ke petugas untuk diperiksa. Ini informasi awal, bukan tuduhan.</p>
          <p>Pantau statusnya di beranda, pada “Laporan saya”.</p>
        </SuccessBlock>
        <button type="button" onClick={onDone} className={BTN.primary}>Kembali ke beranda</button>
      </Frame>
    );
  return (
    <Frame title="Lapor kendala" onBack={onBack}>
      <p className="text-[0.9em] leading-snug text-ink-soft">Ceritakan kendala Anda. Petugas akan memeriksanya, tak perlu menunggu survei.</p>
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label htmlFor="ep" className="block text-[0.92em] font-semibold">Perawatan yang mana?</label>
          <select id="ep" required value={episode} onChange={(e) => setEpisode(e.target.value)} className="mt-1.5 min-h-12 w-full rounded-xl border border-line-strong bg-card px-3">
            {home.episodes.map((e) => <option key={e.id} value={e.id}>{clean(e.facility_name)} · {fmtDate(e.admit_at)}</option>)}
          </select>
        </div>
        <fieldset>
          <legend className="text-[0.92em] font-semibold">Soal apa?</legend>
          <div className="mt-1.5 grid gap-2">
            {CATEGORIES.map((c) => (
              <label key={c.id} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2 leading-snug transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand ${category === c.id ? "border-brand bg-brand-soft font-semibold text-brand-ink" : "border-line-strong bg-card hover:bg-subtle"}`}>
                <input type="radio" name="cat" required value={c.id} checked={category === c.id} onChange={() => setCategory(c.id)} className="peer sr-only" />
                <span aria-hidden className={`grid size-5 shrink-0 place-items-center rounded-full border-2 ${category === c.id ? "border-brand bg-brand text-white" : "border-line-strong"}`}>
                  {category === c.id && <IconCheck size={12} />}
                </span>
                {c.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="rt" className="block text-[0.92em] font-semibold">Ceritakan singkat</label>
          <textarea id="rt" required minLength={8} maxLength={1000} rows={5} value={text} onChange={(e) => setText(e.target.value)} className="mt-1.5 w-full rounded-xl border border-line-strong bg-card p-3 leading-snug" placeholder="Apa yang terjadi dan kapan?" />
          <p className="mt-1 flex justify-between gap-2 text-[0.78em] text-muted"><span>Jangan menuliskan nomor identitas atau kata sandi.</span><span className="tabular-nums">{text.length}/1000</span></p>
        </div>
        {err && <Callout tone="danger" role="alert" icon={<IconAlert size={18} />}>{err}</Callout>}
        <button type="submit" disabled={busy || !episode || !category} className={BTN.primary}>{busy && <Spinner />} {busy ? "Mengirim…" : "Kirim laporan"}</button>
      </form>
    </Frame>
  );
}

function HelpForm({ sessionId, onDone, onBack }: { sessionId?: string; onDone: () => void; onBack: () => void }) {
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
  return (
    <Frame title="Bantuan petugas" onBack={onBack}>
      <Callout tone="warn" icon={<IconAlert size={18} className="text-warn" />}>
        Bila darurat, segera ke IGD terdekat. Permintaan di sini tidak dijawab seketika dan bukan saran medis.
      </Callout>
      {sent ? (
        <>
          <SuccessBlock title="Permintaan terkirim">
            <p>Sudah diteruskan ke petugas.</p>
          </SuccessBlock>
          <button type="button" onClick={onDone} className={BTN.primary}>Kembali ke beranda</button>
        </>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <label htmlFor="hr" className="block text-[0.92em] font-semibold">Bantuan apa yang Anda perlukan?</label>
          <textarea id="hr" required minLength={3} maxLength={500} rows={4} value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-xl border border-line-strong bg-card p-3 leading-snug" />
          {err && <Callout tone="danger" role="alert" icon={<IconAlert size={18} />}>{err}</Callout>}
          <button type="submit" disabled={busy} className={BTN.primary}>{busy && <Spinner />} {busy ? "Mengirim…" : "Kirim permintaan"}</button>
        </form>
      )}
    </Frame>
  );
}

function History({ onBack }: { onBack: () => void }) {
  const [h, setH] = useState<HistoryView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<HistoryView>("/api/survey/history").then(setH).catch((e) => setErr(e instanceof Error ? e.message : "Gagal memuat."));
  }, []);
  return (
    <Frame title="Riwayat jawaban" onBack={onBack}>
      {err && <Callout tone="danger" role="alert" icon={<IconAlert size={18} />}>{err}</Callout>}
      {!h && !err && (
        <div role="status" aria-label="Memuat" className="space-y-2.5">
          {[0, 1].map((i) => <div key={i} className="skeleton h-[4.5rem] rounded-2xl" />)}
          <span className="sr-only">Memuat…</span>
        </div>
      )}
      {h && h.sessions.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line-strong bg-card px-4 py-8 text-center">
          <span className="mx-auto grid size-10 place-items-center rounded-full bg-subtle text-muted" aria-hidden><IconHistory size={20} /></span>
          <p className="mt-2 font-semibold">Belum ada jawaban</p>
          <p className="mt-0.5 text-[0.85em] text-ink-soft">Jawaban yang tersimpan muncul di sini.</p>
        </div>
      )}
      {h?.sessions.map((s) => (
        <details key={s.id} className="group rounded-2xl border border-line bg-card open:shadow-depth-1">
          <summary className="flex min-h-14 cursor-pointer items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-snug">{s.stage_label}</p>
              <p className="mt-0.5 text-[0.8em] leading-snug text-ink-soft">{clean(s.facility_name)} · {s.status}{s.respondent_role === "companion" ? " · dijawab pendamping" : ""}</p>
            </div>
            <IconChevron size={18} className="shrink-0 text-muted transition-transform group-open:rotate-180" />
          </summary>
          <ul className="space-y-2 border-t border-line px-4 pb-4 pt-3">
            {s.facts.length === 0 && <li className="text-[0.85em] text-muted">Belum ada jawaban tersimpan.</li>}
            {s.facts.map((f, i) => (
              <li key={i} className="text-[0.9em] leading-snug"><span className="text-muted">{f.slot_label}:</span> <span className="font-semibold">{f.value_label}</span>{f.origin === "correction" ? <span className="text-muted"> (sudah Anda ubah)</span> : null}</li>
            ))}
          </ul>
        </details>
      ))}
    </Frame>
  );
}
