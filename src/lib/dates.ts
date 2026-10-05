const DAY = 86400000;

export function ts(iso: string) {
  return new Date(iso.length === 10 ? iso + "T00:00" : iso).getTime();
}
export function dayOf(iso: string) {
  return iso.slice(0, 10);
}
/** Selisih hari kalender (b - a), mengabaikan jam. */
export function dayDiff(a: string, b: string) {
  return Math.round((ts(dayOf(b)) - ts(dayOf(a))) / DAY);
}
export function addDays(iso: string, n: number) {
  const d = new Date(ts(iso) + n * DAY);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function addHours(iso: string, n: number) {
  const d = new Date(ts(iso) + n * 3600000);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const rupiah = (n: number) =>
  "Rp" + Math.round(n).toLocaleString("id-ID");
export function fmtDate(iso: string | null | undefined) {
  if (!iso) return "-";
  const d = new Date(ts(iso));
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}
export function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "-";
  const d = new Date(ts(iso));
  return d.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Format ringkas: Rp344,2 jt / Rp1,2 M. */
export function rupiahShort(n: number) {
  if (n >= 1e9) return "Rp" + (n / 1e9).toFixed(1).replace(".", ",") + " M";
  if (n >= 1e6) return "Rp" + (n / 1e6).toFixed(1).replace(".", ",") + " jt";
  return rupiah(n);
}
