/** Jam aplikasi. Semua kode domain memakai ini (bukan Date.now) agar tes dan seed dapat dibuat deterministik. */
let override: string | null = null;

const pad = (n: number) => String(n).padStart(2, "0");

export function formatLocal(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Waktu sekarang dalam format `YYYY-MM-DDTHH:MM` (sama dengan data seed). */
export function nowIso(): string {
  return override ?? formatLocal(new Date());
}

/** Dipakai tes dan seed. Kirim null untuk kembali ke jam nyata. */
export function setNow(iso: string | null) {
  override = iso;
}

/** Detik-presisi untuk jejak yang butuh urutan (turn, audit). */
export function nowPrecise(): string {
  if (override) return override + ":00";
  const d = new Date();
  return `${formatLocal(d)}:${pad(d.getSeconds())}`;
}
