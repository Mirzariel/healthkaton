"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Notice } from "@/components/ui";

/** Formulir menjalankan evaluasi. Kunci idempoten dibuat per pengiriman agar klik ganda tidak membuat dua run. */
export function RunForm({ liveReady, liveNote }: { liveReady: boolean; liveNote: string }) {
  const router = useRouter();
  const [split, setSplit] = useState("dev");
  const [systems, setSystems] = useState<string[]>(["baseline_rules", "rules_plus_llm"]);
  const [provider, setProvider] = useState("simulated");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [key, setKey] = useState(() => `ui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);

  const toggle = (s: string) => setSystems((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!systems.length) return setMsg({ ok: false, text: "Pilih minimal satu sistem." });
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/evaluation/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ split, systems, provider, idempotency_key: key }) });
      const j = (await r.json()) as { ok: boolean; error?: string; data?: { replayed: boolean; runs: { id: string; status: string; note: string | null }[] } };
      if (!j.ok || !j.data) {
        setMsg({ ok: false, text: j.error ?? "Gagal menjalankan evaluasi." });
        setKey(`ui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
      } else {
        const failed = j.data.runs.filter((x) => x.status !== "completed");
        setMsg(failed.length ? { ok: false, text: `Run ${failed.map((x) => x.id).join(", ")} berhenti sebelum selesai${failed[0].note ? `: ${failed[0].note}` : ""}.` } : { ok: true, text: `Selesai: ${j.data.runs.map((x) => x.id).join(", ")}.` });
        setKey(`ui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
        router.refresh();
      }
    } catch {
      setMsg({ ok: false, text: "Tidak dapat menghubungi server." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 px-5 py-4" aria-describedby="runform-help">
      <div className="grid gap-x-5 gap-y-4 md:grid-cols-3">
        <div>
          <label htmlFor="ev-split" className="field-label">Bagian dataset</label>
          <select id="ev-split" value={split} onChange={(e) => setSplit(e.target.value)} className="field">
            <option value="dev">Dev (untuk memperbaiki sistem)</option>
            <option value="heldout">Heldout (jangan dipakai untuk menyetel)</option>
            <option value="all">Semua</option>
          </select>
        </div>
        <fieldset>
          <legend className="field-label">Sistem yang dibandingkan</legend>
          <label className="flex min-h-9 items-center gap-2.5 text-[14px] text-ink"><input type="checkbox" checked={systems.includes("baseline_rules")} onChange={() => toggle("baseline_rules")} /> Baseline aturan</label>
          <label className="flex min-h-9 items-center gap-2.5 text-[14px] text-ink"><input type="checkbox" checked={systems.includes("rules_plus_llm")} onChange={() => toggle("rules_plus_llm")} /> Aturan + penyedia AI</label>
        </fieldset>
        <div>
          <label htmlFor="ev-provider" className="field-label">Penyedia AI</label>
          <select id="ev-provider" value={provider} onChange={(e) => setProvider(e.target.value)} className="field" disabled={!systems.includes("rules_plus_llm")}>
            <option value="simulated">Simulator referensi (bukan model AI)</option>
            <option value="auto">Otomatis (langsung bila tersedia)</option>
            <option value="live" disabled={!liveReady}>Model langsung{liveReady ? "" : " (tidak tersedia)"}</option>
          </select>
        </div>
      </div>
      <p id="runform-help" className="max-w-3xl text-[13px] leading-relaxed text-ink-soft">{liveNote}</p>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={busy} className="btn btn-primary w-full sm:w-auto">{busy ? "Menjalankan…" : "Jalankan evaluasi"}</button>
      </div>
      {msg && <Notice tone={msg.ok ? "ok" : "danger"}><span role={msg.ok ? "status" : "alert"}>{msg.text}</span></Notice>}
    </form>
  );
}
