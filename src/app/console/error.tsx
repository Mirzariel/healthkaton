"use client";

import { IconAlert } from "@/components/icons";

export default function ConsoleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-line bg-card px-6 py-12 text-center">
      <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-danger-soft text-danger ring-1 ring-danger/15" aria-hidden>
        <IconAlert size={18} />
      </span>
      <p className="mt-3 text-[15px] font-semibold">Halaman ini gagal dimuat</p>
      <p className="mx-auto mt-1 max-w-md text-[13.5px] text-ink-soft">Terjadi kesalahan saat memuat data. Data Anda tidak berubah.{error.digest ? ` Kode: ${error.digest}.` : ""}</p>
      <button type="button" onClick={reset} className="btn btn-primary mt-5">Coba lagi</button>
    </div>
  );
}
