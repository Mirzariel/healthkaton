"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

/* Formulir generik untuk perintah ruang kasus dan portal faskes. Memanggil satu pintu perintah (POST JSON) dengan kunci idempoten
   per percobaan, menampilkan galat dari server apa adanya, dan menyegarkan halaman bila berhasil. Tidak menyimpan keputusan di browser. */

export type Opt = { value: string; label: string };
export type FieldDef =
  | { kind: "text" | "textarea" | "date" | "number"; name: string; label: string; required?: boolean; placeholder?: string; hint?: string; defaultValue?: string | number | null; rows?: number; min?: number; max?: number }
  | { kind: "select"; name: string; label: string; options: Opt[]; defaultValue?: string; hint?: string; required?: boolean }
  | { kind: "boolean"; name: string; label: string; yes: string; no: string; defaultValue?: boolean; hint?: string }
  | { kind: "lines"; name: string; label: string; placeholder?: string; hint?: string; defaultValue?: string[]; rows?: number }
  | { kind: "checks"; name: string; label: string; options: Opt[]; defaultValue?: string[]; hint?: string };

const input = "w-full rounded-lg border border-line bg-card px-3 py-2 text-sm";
export const btnPrimary = "rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
export const btnSecondary = "rounded-lg border border-line bg-card px-4 py-2 text-sm font-semibold hover:border-ink/40 disabled:opacity-50";
export const btnDanger = "rounded-lg border border-danger/40 bg-danger-soft px-4 py-2 text-sm font-semibold text-danger disabled:opacity-50";

export function CommandForm({
  command, endpoint = "/api/casework/commands", hidden = {}, fields = [], submit, tone = "primary", intro, confirm, compact = false, doneMessage, redirectTo,
}: {
  command: string;
  endpoint?: string;
  hidden?: Record<string, unknown>;
  fields?: FieldDef[];
  submit: string;
  tone?: "primary" | "secondary" | "danger";
  intro?: string;
  confirm?: string;
  compact?: boolean;
  doneMessage?: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const uid = useId();
  const key = useRef<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (confirm && !window.confirm(confirm)) return;
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = { type: command, ...hidden };
    for (const f of fields) {
      if (f.kind === "checks") body[f.name] = fd.getAll(f.name).map(String);
      else if (f.kind === "lines") body[f.name] = String(fd.get(f.name) ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
      else if (f.kind === "boolean") body[f.name] = fd.get(f.name) === "true";
      else if (f.kind === "number") { const v = String(fd.get(f.name) ?? "").trim(); if (v !== "") body[f.name] = Number(v); }
      else { const v = String(fd.get(f.name) ?? "").trim(); if (v !== "" || ("required" in f && f.required)) body[f.name] = v; }
    }
    setBusy(true);
    setErr(null);
    setOk(null);
    if (!key.current) key.current = crypto.randomUUID();
    try {
      const r = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": key.current }, body: JSON.stringify(body) });
      const j = (await r.json()) as { ok: boolean; error?: string; issues?: string[] };
      if (!j.ok) {
        setErr(j.issues?.length ? `${j.error} ${j.issues.slice(0, 3).join("; ")}` : (j.error ?? "Gagal."));
        return;
      }
      key.current = "";
      setOk(doneMessage ?? "Tersimpan.");
      setVersion((v) => v + 1);
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    } catch {
      setErr("Tidak dapat menghubungi server. Periksa koneksi lalu coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  const cls = tone === "danger" ? btnDanger : tone === "secondary" ? btnSecondary : btnPrimary;
  return (
    <form key={version} onSubmit={onSubmit} className={compact ? "flex flex-wrap items-end gap-2" : "space-y-3"}>
      {intro && <p className="text-sm text-ink-soft">{intro}</p>}
      {fields.map((f) => {
        const id = `${uid}-${f.name}`;
        const lab = <label htmlFor={id} className="block text-xs font-medium text-ink-soft">{f.label}{"required" in f && f.required ? <span aria-hidden className="text-danger"> *</span> : null}</label>;
        const hint = "hint" in f && f.hint ? <p className="mt-0.5 text-xs text-muted">{f.hint}</p> : null;
        if (f.kind === "textarea") return <div key={f.name} className={compact ? "min-w-48 flex-1" : ""}>{lab}<textarea id={id} name={f.name} rows={f.rows ?? 3} required={f.required} defaultValue={f.defaultValue == null ? "" : String(f.defaultValue)} placeholder={f.placeholder} className={input} />{hint}</div>;
        if (f.kind === "lines") return <div key={f.name}>{lab}<textarea id={id} name={f.name} rows={f.rows ?? 3} defaultValue={(f.defaultValue ?? []).join("\n")} placeholder={f.placeholder ?? "Satu butir per baris"} className={input} />{hint}</div>;
        if (f.kind === "select") return <div key={f.name} className={compact ? "min-w-40" : ""}>{lab}<select id={id} name={f.name} required={f.required} defaultValue={f.defaultValue} className={input}>{f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>{hint}</div>;
        if (f.kind === "boolean") return <div key={f.name}>{lab}<select id={id} name={f.name} defaultValue={String(f.defaultValue ?? true)} className={input}><option value="true">{f.yes}</option><option value="false">{f.no}</option></select>{hint}</div>;
        if (f.kind === "checks") return (
          <fieldset key={f.name}>
            <legend className="text-xs font-medium text-ink-soft">{f.label}</legend>
            <div className="mt-1 flex flex-wrap gap-3">{f.options.map((o) => <label key={o.value} className="flex items-center gap-1.5 text-sm"><input type="checkbox" name={f.name} value={o.value} defaultChecked={f.defaultValue?.includes(o.value)} />{o.label}</label>)}</div>
            {hint}
          </fieldset>
        );
        return <div key={f.name} className={compact ? "min-w-40" : ""}>{lab}<input id={id} name={f.name} type={f.kind === "number" ? "number" : f.kind === "date" ? "date" : "text"} required={f.required} defaultValue={f.defaultValue == null ? "" : String(f.defaultValue)} placeholder={f.placeholder} min={f.kind === "number" ? f.min : undefined} max={f.kind === "number" ? f.max : undefined} className={input} />{hint}</div>;
      })}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className={cls}>{busy ? "Memproses…" : submit}</button>
        {ok && <span role="status" className="text-sm text-ok">{ok}</span>}
      </div>
      {err && <p role="alert" className="basis-full text-sm text-danger">{err}</p>}
    </form>
  );
}
