/* Statistik kecil yang dipakai dasbor mutu dan evaluasi. Murni, tanpa I/O. */

export interface Interval {
  lo: number;
  hi: number;
}

/** Interval kepercayaan Wilson untuk proporsi k/n (z=1,96 → ±95%). Mengembalikan null bila n = 0. */
export function wilson(k: number, n: number, z = 1.96): Interval | null {
  if (n <= 0) return null;
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

export const ratio = (k: number, n: number): number | null => (n > 0 ? k / n : null);

export function percentile(xs: number[], p: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}
export const median = (xs: number[]) => percentile(xs, 0.5);

export const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Dua interval tumpang-tindih? Bila ya, selisih belum dapat dibedakan dari fluktuasi acak pada tingkat ini. */
export const intervalsOverlap = (a: Interval | null, b: Interval | null) => (a && b ? a.lo <= b.hi && b.lo <= a.hi : true);

export function pct(x: number | null | undefined, digits = 0): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "–";
  return `${(x * 100).toFixed(digits).replace(".", ",")}%`;
}
export function pctRange(i: Interval | null, digits = 0): string {
  return i ? `${pct(i.lo, digits)}–${pct(i.hi, digits)}` : "–";
}
export function num(x: number | null | undefined, digits = 1): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "–";
  return x.toFixed(digits).replace(".", ",");
}

/** Selisih waktu dalam hari (pecahan). */
export function daysBetween(a: string, b: string): number {
  const t = (s: string) => new Date(s.length === 10 ? s + "T00:00:00" : s).getTime();
  return (t(b) - t(a)) / 86400000;
}
