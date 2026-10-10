"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Brand } from "@/components/Brand";
import type { HistoryView, HomeView } from "@/lib/survey/participant";
import type { SessionView } from "@/lib/survey/service";
import { fmtDate } from "@/lib/dates";
import { Chat } from "./Chat";
import { ApiError, api, newKey } from "./api";
import { IconArrowLeft, IconChevron, IconClipboard, IconClock, IconHospital, IconInfo, IconShield } from "./icons";

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
      const v = Number(localStorage.getItem(STORE));
      if (v === 0 || v === 2) setSize(v);
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

  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-paper md:h-[min(820px,calc(100dvh-3rem))] md:w-[400px] md:shrink-0 md:rounded-[2.5rem] md:border-[9px] md:border-[#111] md:shadow-[0_40px_80px_-30px_rgb(0_0_0/0.45)]" style={{ fontSize: SIZES[size] }}>
      {screen.name === "home" && (
        <header className="shrink-0 border-b border-line bg-card px-4 pb-3 pt-3">
          <div className="flex items-center gap-2.5">
            <div className="min-w-0 flex-1">
              <Brand size={22} />
              <p className="mt-1 truncate text-[1.25em] font-semibold leading-tight tracking-tight">Halo, {firstName(home.participant.name, home.participant.pseudonym)}</p>
            </div>
            <div role="group" aria-label="Ukuran huruf" className="flex shrink-0 gap-0.5 rounded-xl bg-paper p-1 ring-1 ring-line">
              {["A", "A+", "A++"].map((l, i) => (
                <button key={l} type="button" aria-label={["Huruf normal", "Huruf besar", "Huruf sangat besar"][i]} aria-pressed={size === i} onClick={() => pick(i)} className={`grid h-11 min-w-10 place-items-center rounded-lg px-1.5 font-semibold ${size === i ? "bg-ink text-white" : "text-ink-soft hover:bg-line/60"}`} style={{ fontSize: [14, 16, 19][i] }}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </header>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {screen.name === "home" && <Home home={home} err={err} busy={busy} onStart={start} onResume={resume} onGo={setScreen} onChanged={refresh} />}
        {screen.name === "chat" && <Chat initial={screen.view} onExit={exit} onHelp={(id) => setScreen({ name: "help", session_id: id })} onChanged={() => void 0} />}
        {screen.name === "report" && <ReportForm home={home} onDone={exit} onBack={exit} />}
        {screen.name === "history" && <History onBack={exit} />}
        {screen.name === "help" && <HelpForm sessionId={screen.session_id} onDone={exit} onBack={exit} />}
      </div>
    </div>
  );
}

function SectionHead({ children }: { children: ReactNode }) {
  return <h2 className="px-1 text-[0.8em] font-semibold uppercase tracking-wider text-muted">{children}</h2>;
}

function Home({ home, err, busy, onStart, onResume, onGo, onChanged }: { home: HomeView; err: string | null; busy: string | null; onStart: (b: { invitation_id?: string; episode_id?: string; stage?: string }, tag: string) => void; onResume: (id: string, tag: string) => void; onGo: (s: Screen) => void; onChanged: () => void }) {
  const btn = "min-h-12 w-full rounded-xl px-4 text-[1em] font-semibold disabled:opacity-50";
  const [fuErr, setFuErr] = useState<string | null>(null);
  async function confirmFu(id: string, outcome: "resolved" | "still_issue") {
    setFuErr(null);
    try {
      await api(`/api/survey/followups/${id}`, "POST", { outcome });
      onChanged();
    } catch (e) {
      setFuErr(e instanceof Error ? e.message : "Gagal mengirim.");
    }
  }
  const activeSessions = home.episodes.flatMap((e) => e.surveys.filter((s) => s.state === "active" && s.session_id).map((s) => ({ e, s })));
  return (
    <div className="space-y-5 p-4">
      {home.respondent_role === "companion" && (
        <p className="rounded-xl border border-line bg-brand-soft/60 px-3 py-2 text-[0.85em] text-ink-soft">Anda masuk sebagai pendamping{home.companion_name ? ` (${home.companion_name})` : ""} untuk peserta {home.participant.pseudonym}. Jawaban Anda dicatat sebagai jawaban pendamping.</p>
      )}
      <p className="flex gap-2 rounded-xl border border-dashed border-ink/25 px-3 py-2 text-[0.8em] text-ink-soft">
        <IconShield size={18} className="mt-0.5 shrink-0" /> SEHATI adalah prototipe mandiri dengan data sintetis. Ini bukan aplikasi resmi BPJS Kesehatan dan tidak terhubung ke sistem mereka.
      </p>
      {err && <p role="alert" className="rounded-xl border border-danger/40 bg-danger-soft px-3 py-2 text-[0.85em] text-danger">{err}</p>}

      {(home.invitations.length > 0 || activeSessions.length > 0) && (
        <section className="space-y-2" aria-label="Perlu dijawab">
          <SectionHead>Perlu perhatian Anda</SectionHead>
          {activeSessions.map(({ e, s }) => (
            <div key={s.session_id} className="rounded-2xl border-2 border-brand/30 bg-card p-4">
              <p className="font-semibold">Lanjutkan {s.label.toLowerCase()}</p>
              <p className="mt-0.5 text-[0.85em] text-ink-soft">{clean(e.facility_name)} · {e.kind}. Jawaban yang sudah ada tersimpan.</p>
              <button type="button" className={`${btn} mt-3 bg-brand text-white`} disabled={busy !== null} onClick={() => onResume(s.session_id!, s.session_id!)}>Lanjutkan</button>
            </div>
          ))}
          {home.invitations.map((i) => (
            <div key={i.id} className="rounded-2xl border-2 border-brand/30 bg-card p-4">
              <p className="font-semibold">{i.label}</p>
              <p className="mt-0.5 text-[0.85em] text-ink-soft">{clean(i.facility_name)}. {i.detail}</p>
              {i.expires_at && <p className="mt-1 flex items-center gap-1 text-[0.75em] text-muted"><IconClock size={14} /> Berlaku sampai {fmtDate(i.expires_at)}</p>}
              <button type="button" className={`${btn} mt-3 bg-brand text-white`} disabled={busy !== null} onClick={() => (i.session_id ? onResume(i.session_id, i.id) : onStart({ invitation_id: i.id }, i.id))}>{busy === i.id ? "Membuka…" : i.session_id ? "Lanjutkan" : "Mulai"}</button>
            </div>
          ))}
        </section>
      )}

      {home.follow_ups.length > 0 && (
        <section className="space-y-2" aria-label="Tindak lanjut">
          <SectionHead>Mohon dikonfirmasi</SectionHead>
          {home.follow_ups.map((f) => (
            <div key={f.id} className="rounded-2xl border border-line bg-card p-4">
              <p className="font-semibold">{clean(f.facility_name)} menyatakan sudah memperbaiki:</p>
              <p className="mt-1 text-[0.9em] text-ink-soft">{f.description}</p>
              <p className="mt-2 font-medium">Apakah kendala Anda sudah selesai?</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" className={`${btn} bg-brand text-white`} onClick={() => confirmFu(f.id, "resolved")}>Sudah selesai</button>
                <button type="button" className={`${btn} border-2 border-line bg-card`} onClick={() => confirmFu(f.id, "still_issue")}>Belum selesai</button>
              </div>
            </div>
          ))}
          {fuErr && <p role="alert" className="text-[0.85em] text-danger">{fuErr}</p>}
        </section>
      )}

      <section className="space-y-2" aria-label="Perawatan saya">
        <SectionHead>Perawatan saya</SectionHead>
        {home.episodes.length === 0 && <p className="rounded-xl border border-line bg-card p-4 text-[0.9em] text-ink-soft">Belum ada riwayat perawatan.</p>}
        {home.episodes.map((e) => (
          <div key={e.id} className="rounded-2xl border border-line bg-card p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"><IconHospital size={22} /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{clean(e.facility_name)}</p>
                <p className="text-[0.8em] text-ink-soft">{e.kind} · {fmtDate(e.admit_at)}{e.kind === "Rawat inap" ? ` – ${fmtDate(e.discharge_at)}` : ""}</p>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {e.surveys.map((s) => (
                s.state === "done" ? (
                  <p key={s.stage} className="rounded-xl bg-ok-soft px-3 py-2 text-[0.85em] font-medium text-ok">{s.label}: sudah diisi{s.status ? ` (${s.status.toLowerCase()})` : ""}</p>
                ) : s.state === "active" ? (
                  <button key={s.stage} type="button" className={`${btn} border-2 border-brand/40 bg-card`} disabled={busy !== null} onClick={() => onResume(s.session_id!, s.session_id!)}>Lanjutkan {s.label.toLowerCase()}</button>
                ) : (
                  <button key={s.stage} type="button" className={`${btn} bg-ink text-white`} disabled={busy !== null} onClick={() => onStart({ episode_id: e.id, stage: s.stage }, `${e.id}-${s.stage}`)}>{busy === `${e.id}-${s.stage}` ? "Membuka…" : `Mulai survei: ${s.label.toLowerCase()}`}</button>
                )
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-2" aria-label="Laporan saya">
        <SectionHead>Laporan saya</SectionHead>
        {home.reports.length === 0 ? (
          <p className="rounded-xl border border-line bg-card p-4 text-[0.9em] text-ink-soft">Belum ada laporan. Anda dapat melaporkan kendala kapan saja, tanpa menunggu survei.</p>
        ) : (
          <ul className="space-y-2">
            {home.reports.map((r) => (
              <li key={r.id} className="rounded-2xl border border-line bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{r.category_label}</p>
                  <span className="rounded-md bg-info-soft px-2 py-0.5 text-[0.7em] font-semibold text-info">{r.status_label}</span>
                </div>
                <p className="mt-1 text-[0.85em] text-ink-soft">{r.text}</p>
                <p className="mt-1.5 text-[0.75em] text-muted">{r.hint}</p>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className={`${btn} border-2 border-line bg-card`} onClick={() => onGo({ name: "report" })}>Lapor kendala</button>
      </section>

      <section className="grid gap-2" aria-label="Lainnya">
        <button type="button" onClick={() => onGo({ name: "history" })} className="flex min-h-12 items-center justify-between rounded-xl border border-line bg-card px-4 font-semibold"><span className="flex items-center gap-2"><IconClipboard size={20} /> Riwayat jawaban</span><IconChevron size={18} /></button>
        <button type="button" onClick={() => onGo({ name: "help" })} className="flex min-h-12 items-center justify-between rounded-xl border border-line bg-card px-4 font-semibold"><span className="flex items-center gap-2"><IconInfo size={20} /> Minta bantuan petugas</span><IconChevron size={18} /></button>
        {home.open_helps > 0 && <p className="px-1 text-[0.8em] text-muted">Ada {home.open_helps} permintaan bantuan Anda yang menunggu ditangani petugas.</p>}
      </section>
    </div>
  );
}

function Frame({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-card px-3 py-2">
        <button type="button" onClick={onBack} aria-label="Kembali ke beranda" className="grid min-h-11 min-w-11 place-items-center rounded-xl hover:bg-paper"><IconArrowLeft size={22} /></button>
        <h1 className="text-[1.1em] font-semibold">{title}</h1>
      </div>
      <div className="space-y-4 p-4">{children}</div>
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
        <p className="text-[0.95em] text-ink-soft">Terima kasih. Laporan Anda diteruskan ke petugas untuk diperiksa. Ini informasi awal, bukan tuduhan. Statusnya dapat dipantau di beranda pada “Laporan saya”.</p>
        <button type="button" onClick={onDone} className="min-h-12 w-full rounded-xl bg-brand px-4 font-semibold text-white">Kembali ke beranda</button>
      </Frame>
    );
  return (
    <Frame title="Lapor kendala" onBack={onBack}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="ep" className="block text-[0.9em] font-medium">Perawatan yang mana?</label>
          <select id="ep" required value={episode} onChange={(e) => setEpisode(e.target.value)} className="mt-1 min-h-12 w-full rounded-xl border-2 border-line bg-card px-3">
            {home.episodes.map((e) => <option key={e.id} value={e.id}>{clean(e.facility_name)} · {fmtDate(e.admit_at)}</option>)}
          </select>
        </div>
        <fieldset>
          <legend className="text-[0.9em] font-medium">Soal apa?</legend>
          <div className="mt-1 grid gap-2">
            {CATEGORIES.map((c) => (
              <label key={c.id} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 px-3 ${category === c.id ? "border-brand bg-brand-soft" : "border-line bg-card"}`}>
                <input type="radio" name="cat" required value={c.id} checked={category === c.id} onChange={() => setCategory(c.id)} className="size-5" /> {c.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="rt" className="block text-[0.9em] font-medium">Ceritakan singkat</label>
          <textarea id="rt" required minLength={8} maxLength={1000} rows={5} value={text} onChange={(e) => setText(e.target.value)} className="mt-1 w-full rounded-xl border-2 border-line bg-card p-3" placeholder="Apa yang terjadi dan kapan?" />
          <p className="mt-1 text-[0.75em] text-muted">Jangan menuliskan nomor identitas atau kata sandi.</p>
        </div>
        {err && <p role="alert" className="text-[0.85em] text-danger">{err}</p>}
        <button type="submit" disabled={busy || !episode || !category} className="min-h-12 w-full rounded-xl bg-brand px-4 font-semibold text-white disabled:opacity-50">{busy ? "Mengirim…" : "Kirim laporan"}</button>
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
      <p className="rounded-xl border border-warn/40 bg-warn-soft px-3 py-2 text-[0.85em] text-warn">Bila keadaan Anda darurat, segera ke IGD terdekat atau hubungi layanan darurat setempat. Permintaan di sini tidak dijawab seketika dan aplikasi ini tidak memberi saran medis.</p>
      {sent ? (
        <>
          <p className="text-ink-soft">Permintaan Anda sudah diteruskan ke petugas.</p>
          <button type="button" onClick={onDone} className="min-h-12 w-full rounded-xl bg-brand px-4 font-semibold text-white">Kembali ke beranda</button>
        </>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <label htmlFor="hr" className="block text-[0.9em] font-medium">Bantuan apa yang Anda perlukan?</label>
          <textarea id="hr" required minLength={3} maxLength={500} rows={4} value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-xl border-2 border-line bg-card p-3" />
          {err && <p role="alert" className="text-[0.85em] text-danger">{err}</p>}
          <button type="submit" disabled={busy} className="min-h-12 w-full rounded-xl bg-brand px-4 font-semibold text-white disabled:opacity-50">{busy ? "Mengirim…" : "Kirim permintaan"}</button>
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
      {err && <p role="alert" className="text-danger">{err}</p>}
      {!h && !err && <p className="text-ink-soft">Memuat…</p>}
      {h && h.sessions.length === 0 && <p className="text-ink-soft">Belum ada jawaban.</p>}
      {h?.sessions.map((s) => (
        <details key={s.id} className="rounded-2xl border border-line bg-card p-4">
          <summary className="cursor-pointer list-none">
            <p className="font-semibold">{s.stage_label}</p>
            <p className="text-[0.8em] text-ink-soft">{clean(s.facility_name)} · {s.status}{s.respondent_role === "companion" ? " · dijawab pendamping" : ""}</p>
          </summary>
          <ul className="mt-3 space-y-2">
            {s.facts.length === 0 && <li className="text-[0.85em] text-muted">Belum ada jawaban tersimpan.</li>}
            {s.facts.map((f, i) => (
              <li key={i} className="text-[0.9em]"><span className="text-muted">{f.slot_label}:</span> <span className="font-semibold">{f.value_label}</span>{f.origin === "correction" ? <span className="text-muted"> (sudah Anda ubah)</span> : null}</li>
            ))}
          </ul>
        </details>
      ))}
    </Frame>
  );
}
