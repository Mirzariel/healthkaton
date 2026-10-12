import { Breakdown, StackedBar } from "@/components/analytics/charts";
import { AiModeBadge, Card, EmptyState, Forbidden, PageHeader, Section, SectionTitle, SimNotice, Stat, StatusPill } from "@/components/ui";
import { modelStats } from "@/lib/ai/admin";
import { can } from "@/lib/auth/principal";
import { getDb } from "@/lib/db";
import { SESSION_LABEL, type SessionStatus } from "@/lib/labels";
import { getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";

const pct = (x: number | null) => (x === null ? "—" : `${(x * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`);
/** Kode alasan teknis (snake_case) menjadi teks biasa; kode aslinya tetap muncul sebagai title. */
const REASON_LABEL: Record<string, string> = { timeout: "Waktu habis", invalid_output: "Keluaran tidak valid", unavailable: "Penyedia tidak tersedia", error: "Galat penyedia" };
const humanize = (k: string) => REASON_LABEL[k] ?? (k.charAt(0).toUpperCase() + k.replace(/_/g, " ").slice(1));
const MODE_LABEL: Record<string, string> = { live: "AI langsung", simulated: "Simulasi", fallback: "Fallback" };
const MODE_FILL: Record<string, string> = { live: "bg-ok", simulated: "bg-muted/50", fallback: "bg-accent" };
const STATUS_LABEL: Record<string, string> = { ok: "Berhasil", invalid: "Ditolak validator", timeout: "Waktu habis", error: "Galat", unavailable: "Tidak tersedia" };

export default async function AiOpsPage() {
  const me = await getPrincipal("konsol");
  if (!can(me, "ai.view")) return <Forbidden need="ai.view" />;
  const s = modelStats(getDb(), me);
  const p = s.proposals;
  const rejectRows = Object.entries(s.validator.rejects).sort((a, b) => b[1] - a[1]);
  const modeRows = (["live", "simulated", "fallback"] as const).map((k) => ({ k, n: s.by_mode[k] ?? 0 }));
  const otherModes = Object.entries(s.by_mode).filter(([k]) => !(k in MODE_LABEL));
  const validatorTotal = s.validator.accepted + s.validator.rejected;
  return (
    <>
      <PageHeader eyebrow="Standar dan AI" title="Dasbor AI" purpose="AI hanya menyarankan; tidak memutuskan kepatuhan, fraud, pembayaran, atau sanksi." />
      <SimNotice>
        {s.live_available ? "Kunci penyedia AI terdeteksi; pemanggilan langsung dipakai sesuai konfigurasi." : "Tanpa kunci penyedia AI: semua pemanggilan berupa SIMULASI (penafsir aturan), bukan model. Angka ini bukan kualitas model."}
      </SimNotice>

      <Section className="mt-8">
        <SectionTitle title="Pemanggilan giliran wawancara" hint="Tanpa sandbox dan evaluasi. Penyebut = giliran diproses." />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Giliran diproses" value={s.total_calls} hint={Object.entries(s.by_mode).map(([k, v]) => `${MODE_LABEL[k] ?? k}: ${v}`).join("; ") || "Belum ada"} />
          <Stat label="Tingkat fallback" value={pct(s.fallback_rate)} tone={s.fallback_rate && s.fallback_rate > 0.2 ? "warn" : "default"} hint={`${s.by_mode.fallback ?? 0} dari ${s.total_calls} giliran`} />
          <Stat label="Latensi AI langsung (p50 / p95)" value={s.latency_live.n ? `${s.latency_live.p50} / ${s.latency_live.p95} ms` : "—"} hint={s.latency_live.n ? `${s.latency_live.n} panggilan langsung` : "Belum ada panggilan langsung"} />
          <Stat label="Estimasi biaya" value={s.tokens.cost_usd === null ? "—" : `US$ ${s.tokens.cost_usd.toFixed(4)}`} hint={s.tokens.calls_with_usage ? `${s.tokens.tokens_in} token masuk, ${s.tokens.tokens_out} keluar (${s.tokens.calls_with_usage} panggilan)` : "Tidak tersedia; simulasi tidak memakai token"} />
        </div>
        <Card elevated className="px-5 py-4">
          <p className="text-[13px] font-medium text-ink-soft">Komposisi mode pemanggilan</p>
          <StackedBar className="mt-2.5" segments={modeRows.map((m) => ({ key: m.k, n: m.n, cls: MODE_FILL[m.k], label: MODE_LABEL[m.k] }))} total={s.total_calls} />
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2" aria-label="Rincian mode">
            {modeRows.map((m) => (
              <li key={m.k} className="flex items-center gap-2 text-[13px] text-ink-soft">
                <AiModeBadge mode={m.k} />
                <span className="tabular-nums font-medium text-ink">{m.n}</span>
                <span className="text-muted">dari {s.total_calls}</span>
              </li>
            ))}
            {otherModes.map(([k, v]) => <li key={k} className="text-[13px] text-ink-soft">{k}: <span className="tabular-nums font-medium text-ink">{v}</span></li>)}
          </ul>
        </Card>
        <p className="text-[12.5px] text-muted">{s.price_table.note} Tabel harga per {s.price_table.date}.</p>
      </Section>

      <Section className="mt-10">
        <div className="grid gap-x-6 gap-y-10 lg:grid-cols-2">
          <div className="min-w-0 space-y-4">
            <SectionTitle title="Validator keluaran" />
            <Card>
              <div className="px-5 py-4">
                <p className="text-[14px] text-ink-soft"><strong className="text-[1.25rem] font-semibold tabular-nums text-ink">{s.validator.accepted}</strong> saran fakta lolos, <strong className="text-[1.25rem] font-semibold tabular-nums text-ink">{s.validator.rejected}</strong> ditolak.</p>
                <StackedBar className="mt-3" segments={[{ key: "ok", n: s.validator.accepted, cls: "bg-ok", label: "Lolos" }, { key: "no", n: s.validator.rejected, cls: "bg-danger", label: "Ditolak" }]} total={validatorTotal} />
                <p className="mt-2 text-[12.5px] text-muted">Denominator = {validatorTotal} saran yang diperiksa validator.</p>
              </div>
              {rejectRows.length === 0 ? <p className="border-t border-line px-5 py-3.5 text-[13.5px] text-ink-soft">Belum ada penolakan.</p> : (
                <div className="border-t border-line">
                  <p className="px-5 pt-3 text-[12.5px] font-medium text-muted">Alasan penolakan</p>
                  <Breakdown rows={rejectRows.map(([k, v]) => ({ key: k, label: <span title={k}>{humanize(k)}</span>, n: v, cls: "bg-danger/60" }))} total={s.validator.rejected} />
                </div>
              )}
            </Card>
          </div>

          <div className="min-w-0 space-y-4">
            <SectionTitle title="Alasan fallback" hint="Aturan menggantikan AI; sesi tetap berjalan." />
            <Card>
              {Object.keys(s.fallback_reasons).length === 0 ? <p className="px-5 py-4 text-[13.5px] text-ink-soft">Tidak ada fallback.</p> : (
                <Breakdown rows={Object.entries(s.fallback_reasons).map(([k, v]) => ({ key: k, label: <span title={k}>{humanize(k)}</span>, n: v, cls: "bg-accent" }))} total={s.by_mode.fallback ?? undefined} />
              )}
            </Card>
          </div>

          <div className="min-w-0 space-y-4">
            <SectionTitle title="Nasib saran fakta" hint="Proposal sampai peserta mengonfirmasi." />
            <Card className="px-5 py-4">
              <ul className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                {([["Diusulkan", p.proposed], ["Dikonfirmasi", p.confirmed], ["Diubah peserta", p.corrected], ["Ditolak peserta", p.dismissed]] as const).map(([l, v]) => (
                  <li key={l}><span className="block text-[12.5px] text-muted">{l}</span><strong className="text-[1.375rem] font-semibold tabular-nums">{v}</strong></li>
                ))}
              </ul>
              <StackedBar className="mt-4" total={p.proposed} segments={[
                { key: "c", n: p.confirmed, cls: "bg-ok", label: "Dikonfirmasi" },
                { key: "k", n: p.corrected, cls: "bg-info", label: "Diubah peserta" },
                { key: "d", n: p.dismissed, cls: "bg-muted/50", label: "Ditolak peserta" },
                { key: "p", n: p.pending, cls: "bg-accent", label: "Menunggu" },
              ]} />
              <p className="mt-2 text-[12.5px] text-muted">{p.pending} masih menunggu konfirmasi. Denominator = saran yang lolos validator ({p.proposed}).</p>
            </Card>
          </div>

          <div className="min-w-0 space-y-4">
            <SectionTitle title="Status pemanggilan dan versi prompt" />
            <Card>
              <div className="flex flex-wrap gap-1.5 px-5 py-4">
                {Object.entries(s.by_status).map(([k, v]) => <StatusPill key={k} tone={k === "ok" ? "ok" : "warn"}>{STATUS_LABEL[k] ?? k}: {v}</StatusPill>)}
                {Object.keys(s.by_status).length === 0 && <span className="text-[13.5px] text-ink-soft">Belum ada.</span>}
              </div>
              {s.versions.length > 0 && (
                <div className="scroll-x border-t border-line">
                  <table className="w-full text-left text-[13.5px]">
                    <thead><tr><th className="px-5 py-2.5">Versi prompt</th><th className="px-3 py-2.5 text-right">Panggilan</th><th className="px-3 py-2.5 text-right">Langsung</th><th className="px-5 py-2.5 text-right">Fallback</th></tr></thead>
                    <tbody>{s.versions.map((v) => <tr key={v.prompt_version}><td className="px-5 py-2.5 font-mono text-[12.5px]">{v.prompt_version}</td><td className="px-3 py-2.5 text-right tabular-nums">{v.calls}</td><td className="px-3 py-2.5 text-right tabular-nums">{v.live}</td><td className="px-5 py-2.5 text-right tabular-nums">{v.fallback}</td></tr>)}</tbody>
                  </table>
                </div>
              )}
              {Object.keys(s.other_operations).length > 0 && <p className="border-t border-line px-5 py-3 text-[12.5px] text-muted">Operasi lain: {Object.entries(s.other_operations).map(([k, v]) => `${k} ${v}`).join(", ")}.</p>}
            </Card>
          </div>
        </div>
      </Section>

      <Section className="mt-10">
        <SectionTitle title="Sesi survei" hint="Seluruh sesi, tanpa sandbox." />
        {Object.keys(s.sessions).length === 0 ? <Card><EmptyState title="Belum ada sesi" /></Card> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries(s.sessions).map(([k, v]) => (
              <div key={k} className="rounded-xl border border-line bg-card px-4 py-3">
                <p className="text-[13px] text-ink-soft">{SESSION_LABEL[k as SessionStatus] ?? k}</p>
                <p className="mt-1.5 text-[1.375rem] font-semibold leading-none tabular-nums">{v}</p>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
