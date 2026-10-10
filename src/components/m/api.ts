/* Pembantu panggilan API untuk aplikasi peserta. Setiap aksi menulis memakai kunci idempotensi: kirim ulang (mis. jaringan putus) tidak membuat jawaban ganda. */
export class ApiError extends Error {
  constructor(message: string, public code: string | undefined, public status: number) {
    super(message);
  }
}

export const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`);

export async function api<T>(url: string, method: "GET" | "POST" = "GET", body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  } catch {
    throw new ApiError("Tidak ada sambungan. Jawaban Anda belum terkirim; coba lagi.", "network", 0);
  }
  let j: { ok: boolean; data?: T; error?: string; code?: string } | null = null;
  try {
    j = await r.json();
  } catch {
    /* tubuh bukan JSON */
  }
  if (!j || !j.ok) throw new ApiError(j?.error ?? "Terjadi kesalahan. Coba lagi.", j?.code, r.status);
  return j.data as T;
}
