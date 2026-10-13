"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

/* Perkakas kecil untuk formulir modul pending-kartu-bayar-impor. Semua aksi memanggil API server; server yang menegakkan hak akses. */

export const btn = "btn btn-secondary btn-sm";
export const primary = "btn btn-primary btn-sm";
export const input = "field";

export interface Result<T = Record<string, unknown>> { ok: boolean; error?: string; data?: T; issues?: string[] }

export async function api<T = Record<string, unknown>>(url: string, method: string, body?: unknown): Promise<Result<T>> {
  try {
    const r = await fetch(url, body instanceof FormData ? { method, body } : { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    return (await r.json()) as Result<T>;
  } catch {
    return { ok: false, error: "Tidak dapat menghubungi server. Periksa koneksi lalu coba lagi." };
  }
}

export function useAct() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  async function act<T>(fn: () => Promise<Result<T>>, o: { success?: string; refresh?: boolean; done?: (d: T | undefined) => void } = {}) {
    setBusy(true);
    setMsg(null);
    setOk(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) {
      setMsg([r.error ?? "Gagal.", ...(r.issues ?? [])].join(" "));
      return false;
    }
    if (o.success) setOk(o.success);
    o.done?.(r.data);
    if (o.refresh !== false) router.refresh();
    return true;
  }
  return { busy, msg, ok, act, router };
}

export function Msg({ msg, ok }: { msg: string | null; ok?: string | null }) {
  return (
    <>
      {msg && <p role="alert" className="mt-2 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-caption text-danger">{msg}</p>}
      {ok && <p role="status" className="mt-2 text-caption font-medium text-ok">{ok}</p>}
    </>
  );
}

export function Field({ label, id, hint, children }: { label: string; id: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="field-label">{label}</label>
      <div>{children}</div>
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}
