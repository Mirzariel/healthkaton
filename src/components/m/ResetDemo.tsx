"use client";

import { useState } from "react";
import { IconRetry } from "./icons";

/** Mengembalikan data demo ke kondisi awal, lalu memuat ulang agar semua pertanyaan muncul lagi. */
export function ResetDemo({ dark, label = "Atur ulang data demo" }: { dark?: boolean; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          if (!confirm("Kembalikan seluruh data demo ke kondisi awal? Jawaban yang sudah Anda kirim akan hilang.")) return;
          setBusy(true);
          setError(false);
          try {
            const r = await fetch("/api/reset", { method: "POST" });
            if (!r.ok) throw new Error();
            window.location.reload();
          } catch {
            setError(true);
            setBusy(false);
          }
        }}
        className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-3.5 text-base font-medium transition active:scale-[0.98] disabled:opacity-60 ${
          dark ? "border border-white/25 text-white hover:border-white/60" : "border border-line bg-card text-ink hover:border-ink/40"
        }`}
      >
        <IconRetry size={18} className={busy ? "animate-spin" : ""} />
        {busy ? "Mengatur ulang…" : label}
      </button>
      <p role="status" className={`mt-1 text-sm font-semibold ${dark ? "text-[#ffb4a0]" : "text-danger"}`}>
        {error ? "Gagal mengatur ulang. Coba lagi." : ""}
      </p>
    </div>
  );
}
