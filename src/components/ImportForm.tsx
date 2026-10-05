"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { StepCard } from "@/components/audit/Step";
import { AnimatePresence, CheckMark, Spinner, motion } from "@/components/motion";

interface Result {
  ok: boolean;
  errors: { line: number; message: string }[];
  imported: { participants: number; episodes: number; services: number; claims: number };
  changes: string[];
}

const EMPTY = { participants: 0, episodes: 0, services: 0, claims: 0 };
const fail = (message: string): Result => ({ ok: false, errors: [{ line: 0, message }], imported: EMPTY, changes: [] });

export function ImportForm({ sample }: { sample: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const lines = text.trim() ? text.trim().split(/\r?\n/).length - 1 : 0;

  async function submit() {
    setBusy(true);
    setRes(null);
    try {
      const r = await fetch("/api/import", { method: "POST", body: text });
      const j = (await r.json()) as Partial<Result>;
      const result: Result = { ok: !!j.ok, errors: j.errors ?? [], imported: j.imported ?? EMPTY, changes: j.changes ?? [] };
      if (!result.ok && result.errors.length === 0) result.errors = [{ line: 0, message: "Impor gagal." }];
      setRes(result);
      if (result.ok) router.refresh();
    } catch {
      setRes(fail("Tidak dapat terhubung ke server. Coba lagi."));
    } finally {
      setBusy(false);
    }
  }

  async function load(f: File | undefined, input?: HTMLInputElement) {
    if (!f) return;
    if (f.size > 5_000_000) {
      setRes(fail("Berkas terlalu besar (maks. 5 MB)."));
      if (input) input.value = "";
      return;
    }
    try {
      const t = await f.text();
      setName(f.name);
      setText(t);
      setRes(null);
    } catch {
      setRes(fail("Berkas tidak dapat dibaca."));
    }
  }

  function clear() {
    setText("");
    setName("");
    setRes(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  const tiles = res?.ok
    ? [
        ["Peserta", res.imported.participants],
        ["Episode perawatan", res.imported.episodes],
        ["Klaim", res.imported.claims],
        ["Tindakan", res.imported.services],
      ]
    : [];

  return (
    <>
      <StepCard
        n={3}
        title="Unggah atau tempel"
        lead="Pilih berkas CSV Anda, atau tempel isinya di kotak bawah. Sistem memeriksa seluruh baris dulu; bila ada yang salah, tidak ada data yang masuk."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim() && !busy) submit();
          }}
          className="space-y-4"
        >
          <div>
            <input
              ref={fileRef}
              id="csvfile"
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              onChange={(e) => load(e.target.files?.[0], e.target)}
              className="peer sr-only"
            />
            <label
              htmlFor="csvfile"
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                if (!busy) load(e.dataTransfer.files?.[0]);
              }}
              className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center transition peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${
                drag ? "border-brand bg-brand-soft" : name ? "border-ok bg-ok-soft/60" : "border-ink/30 bg-paper hover:border-ink/60"
              }`}
            >
              <span className={`grid size-10 place-items-center rounded-full ${name ? "bg-ok text-white" : "bg-ink text-white"}`} aria-hidden>
                {name ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.500l4.500 4.500L19 7.500" /></svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V5m0 0L8 9m4-4l4 4M5 19.500h14" /></svg>
                )}
              </span>
              {name ? (
                <>
                  <span className="max-w-full truncate text-sm font-bold" title={name}>{name}</span>
                  <span className="text-xs text-ink-soft">{lines} baris data terbaca. Klik untuk mengganti berkas.</span>
                </>
              ) : (
                <>
                  <span className="text-sm font-bold">Klik untuk memilih berkas CSV</span>
                  <span className="text-xs text-ink-soft">atau seret berkasnya ke sini (maks. 5 MB)</span>
                </>
              )}
            </label>
          </div>

          <div>
            <label htmlFor="csvtext" className="mb-1 flex items-center justify-between gap-2 text-sm font-semibold">
              <span>Atau tempel isi CSV</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setText(sample);
                  setName("");
                  setRes(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                className="rounded-lg px-2 py-1 text-xs font-bold text-brand underline-offset-4 hover:underline disabled:opacity-50"
              >
                Coba dengan data contoh
              </button>
            </label>
            <textarea
              id="csvtext"
              rows={6}
              value={text}
              disabled={busy}
              onChange={(e) => {
                setText(e.target.value);
                if (name) setName("");
              }}
              placeholder="participant_id,participant_name,coverage_start,..."
              spellCheck={false}
              className="w-full rounded-lg border border-line bg-paper p-3 font-mono text-xs transition-shadow focus-visible:border-brand disabled:opacity-60"
            />
            <p className="mt-1 text-xs text-muted">Data contoh membuat satu peserta fiktif (IMP-P1). Bisa dikembalikan lewat Reset data demo.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={busy || !text.trim()} aria-busy={busy} className="btn-depth inline-flex min-w-[11rem] items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white disabled:pointer-events-none disabled:opacity-50">
              {busy ? (<><Spinner /> Memproses…</>) : res?.ok ? (<><CheckMark /> Selesai</>) : "Periksa dan impor"}
            </button>
            {text && !busy && (
              <button type="button" onClick={clear} className="text-sm font-semibold text-ink-soft underline-offset-4 hover:underline">
                Hapus isian
              </button>
            )}
          </div>
        </form>
      </StepCard>

      <StepCard n={4} last title="Lihat hasilnya" lead="Hasil pemeriksaan tampil di sini begitu Anda menekan Periksa dan impor.">
        <div aria-live="polite" role="status" className="min-h-16">
          <AnimatePresence mode="wait">
            {!res && !busy && (
              <motion.ul key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid gap-2 rounded-lg border border-dashed border-line p-4 text-sm text-ink-soft sm:grid-cols-3">
                <li><strong className="block text-ink">Jumlah data masuk</strong>peserta, perawatan, klaim, dan tindakan.</li>
                <li><strong className="block text-ink">Kasus baru</strong>bila SEHATI menemukan kejanggalan pada data Anda.</li>
                <li><strong className="block text-ink">Daftar kesalahan</strong>bila ada baris yang perlu diperbaiki, lengkap dengan nomor barisnya.</li>
              </motion.ul>
            )}
            {busy && (
              <motion.p key="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
                <Spinner /> Sedang memeriksa seluruh baris…
              </motion.p>
            )}
            {res && res.ok && (
              <motion.div key="ok" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="rounded-lg border border-ok/30 bg-ok-soft/50 p-4">
                <p className="flex items-center gap-2 text-lg font-semibold text-ok">
                  <span className="grid size-7 place-items-center rounded-full bg-ok text-white" aria-hidden>✓</span>
                  Impor berhasil
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {tiles.map(([label, n]) => (
                    <div key={label as string} className="rounded-lg border border-line bg-card p-3">
                      <dd className="text-2xl font-semibold tabular-nums">{n as number}</dd>
                      <dt className="text-xs text-muted">{label}</dt>
                    </div>
                  ))}
                </dl>
                {res.changes.length > 0 ? (
                  <div className="mt-3 text-sm">
                    <p className="font-semibold">SEHATI menemukan kejanggalan dan membuat perubahan ini:</p>
                    <ul className="mt-1 list-disc pl-5">{res.changes.map((c, i) => <li key={i}>{c}</li>)}</ul>
                    <Link href="/console" className="btn-depth mt-3 inline-block rounded-lg px-4 py-2 text-sm font-semibold text-white">Lihat antrean kasus →</Link>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-ink-soft">Tidak ada temuan baru: data Anda tampak wajar.</p>
                )}
              </motion.div>
            )}
            {res && !res.ok && (
              <motion.div key="err" role="alert" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="rounded-lg border border-danger/30 bg-danger-soft p-4">
                <p className="text-lg font-semibold text-danger">Impor dibatalkan. Tidak ada data yang masuk.</p>
                <p className="mt-0.5 text-sm text-ink-soft">Perbaiki baris berikut di berkas Anda, lalu ulangi dari langkah 3. Nomor baris dihitung dari judul kolom sebagai baris 1.</p>
                <ul className="mt-2 max-h-56 list-disc space-y-0.5 overflow-y-auto pl-5 text-sm">
                  {res.errors.map((e, i) => (
                    <li key={i}>{e.line > 0 ? <strong>Baris {e.line}: </strong> : null}{e.message}</li>
                  ))}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </StepCard>
    </>
  );
}
