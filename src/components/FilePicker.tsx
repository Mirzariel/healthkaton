"use client";

import { useEffect, useRef, useState } from "react";
import { IconUpload } from "@/components/icons";

/** Pemilih berkas berbahasa Indonesia. Input file asli tetap ada (nama, id, accept sama) sehingga FormData dan
 *  validasi tidak berubah; hanya tampilannya yang diganti tombol + nama berkas terpilih. Ikut kosong saat form di-reset. */
export function FilePicker({ id, name, accept, onChange }: { id: string; name?: string; accept?: string; onChange?: (f: File | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [fname, setFname] = useState<string | null>(null);
  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const reset = () => setFname(null);
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, []);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
      <label className="btn btn-secondary btn-sm shrink-0 cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand">
        <IconUpload size={15} className="text-muted" />
        Pilih berkas
        <input
          ref={ref}
          id={id}
          name={name}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFname(f?.name ?? null);
            onChange?.(f);
          }}
        />
      </label>
      <span className={`min-w-0 truncate text-caption ${fname ? "font-medium text-ink" : "text-muted"}`}>{fname ?? "Belum ada berkas dipilih"}</span>
    </div>
  );
}
