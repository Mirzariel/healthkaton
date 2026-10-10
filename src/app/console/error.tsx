"use client";

export default function ConsoleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="rounded-xl border border-line bg-card p-8 text-center">
      <p className="text-lg font-semibold">Halaman ini gagal dimuat</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">Terjadi kesalahan saat memuat data. Data Anda tidak berubah.{error.digest ? ` Kode: ${error.digest}.` : ""}</p>
      <button type="button" onClick={reset} className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">Coba lagi</button>
    </div>
  );
}
