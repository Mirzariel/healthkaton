import { Card, EmptyState, Forbidden, PageHeader, Pill, SectionTitle, SimNotice, Stat } from "@/components/ui";
import { modelStats } from "@/lib/ai/admin";
import { can } from "@/lib/auth/principal";
import { getDb } from "@/lib/db";
import { TONE_CLASS } from "@/lib/labels";
import { getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";

const pct = (x: number | null) => (x === null ? "—" : `${(x * 100).toFixed(1)}%`);
const MODE_LABEL: Record<string, string> = { live: "AI langsung", simulated: "Simulasi", fallback: "Fallback" };
const STATUS_LABEL: Record<string, string> = { ok: "Berhasil", invalid: "Ditolak validator", timeout: "Waktu habis", error: "Galat", unavailable: "Tidak tersedia" };

export default async function AiOpsPage() {
  const me = await getPrincipal("konsol");
  if (!can(me, "ai.view")) return <Forbidden need="ai.view" />;
  const s = modelStats(getDb(), me);
  const p = s.proposals;
  const rejectRows = Object.entries(s.validator.rejects).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <PageHeader eyebrow="Standar dan AI" title="Dasbor AI" purpose="AI hanya membantu membaca jawaban bebas dan menyarankan pertanyaan berikutnya dari daftar kandidat yang ditentukan aturan. AI tidak memutuskan kepatuhan, fraud, pembayaran, atau sanksi." />
      <SimNotice>
        {s.live_available ? "Kunci penyedia AI terdeteksi di server; pemanggilan langsung dipakai sesuai konfigurasi aktif." : "Kunci penyedia AI tidak ada di server, jadi seluruh pemanggilan berjalan sebagai SIMULASI (penafsir aturan deterministik), bukan inferensi model. Angka di bawah menggambarkan perilaku simulasi dan jalur fallback, bukan kualitas model."}
      </SimNotice>
      <section className="mt-6 space-y-3">
        <SectionTitle title="Pemanggilan giliran wawancara" hint="Tidak termasuk sandbox dan evaluasi. Denominator = jumlah giliran yang diproses." />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Giliran diproses" value={s.total_calls} hint={Object.entries(s.by_mode).map(([k, v]) => `${MODE_LABEL[k] ?? k}: ${v}`).join(" · ") || "Belum ada"} />
          <Stat label="Tingkat fallback" value={pct(s.fallback_rate)} tone={s.fallback_rate && s.fallback_rate > 0.2 ? "warn" : "default"} hint={`${s.by_mode.fallback ?? 0} dari ${s.total_calls} giliran`} />
          <Stat label="Latensi AI langsung (p50 / p95)" value={s.latency_live.n ? `${s.latency_live.p50} / ${s.latency_live.p95} ms` : "—"} hint={s.latency_live.n ? `${s.latency_live.n} panggilan langsung` : "Belum ada panggilan langsung"} />
          <Stat label="Estimasi biaya" value={s.tokens.cost_usd === null ? "Tidak tersedia" : `US$ ${s.tokens.cost_usd.toFixed(4)}`} hint={s.tokens.calls_with_usage ? `${s.tokens.tokens_in} token masuk, ${s.tokens.tokens_out} keluar (${s.tokens.calls_with_usage} panggilan)` : "Simulasi tidak memakai token"} />
        </div>
        <p className="text-xs text-muted">{s.price_table.note} Tabel harga per {s.price_table.date}.</p>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <SectionTitle title="Validator keluaran" hint="Setiap saran AI diperiksa sebelum disimpan." />
          <Card className="p-4 text-sm">
            <p><strong className="tabular-nums">{s.validator.accepted}</strong> saran fakta lolos, <strong className="tabular-nums">{s.validator.rejected}</strong> ditolak.</p>
            {rejectRows.length === 0 ? <p className="mt-2 text-ink-soft">Belum ada penolakan.</p> : (
              <ul className="mt-2 divide-y divide-line">
                {rejectRows.map(([k, v]) => <li key={k} className="flex justify-between gap-3 py-1.5"><span className="text-ink-soft">{k}</span><span className="tabular-nums">{v}</span></li>)}
              </ul>
            )}
          </Card>
          <SectionTitle title="Nasib saran fakta" hint="Fakta baru berstatus proposal sampai peserta mengonfirmasi." />
          <Card className="p-4 text-sm">
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <li><span className="block text-xs text-muted">Diusulkan</span><strong className="text-xl tabular-nums">{p.proposed}</strong></li>
              <li><span className="block text-xs text-muted">Dikonfirmasi</span><strong className="text-xl tabular-nums">{p.confirmed}</strong></li>
              <li><span className="block text-xs text-muted">Diubah peserta</span><strong className="text-xl tabular-nums">{p.corrected}</strong></li>
              <li><span className="block text-xs text-muted">Ditolak peserta</span><strong className="text-xl tabular-nums">{p.dismissed}</strong></li>
            </ul>
            <p className="mt-2 text-xs text-muted">{p.pending} masih menunggu konfirmasi. Denominator = saran yang lolos validator ({p.proposed}).</p>
          </Card>
        </div>
        <div className="space-y-3">
          <SectionTitle title="Alasan fallback" hint="Fallback = aturan deterministik; sesi tetap berjalan." />
          <Card className="p-4 text-sm">
            {Object.keys(s.fallback_reasons).length === 0 ? <p className="text-ink-soft">Tidak ada fallback.</p> : (
              <ul className="divide-y divide-line">
                {Object.entries(s.fallback_reasons).map(([k, v]) => <li key={k} className="flex justify-between gap-3 py-1.5"><span className="text-ink-soft">{k}</span><span className="tabular-nums">{v}</span></li>)}
              </ul>
            )}
          </Card>
          <SectionTitle title="Status pemanggilan dan versi prompt" />
          <Card className="p-4 text-sm">
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(s.by_status).map(([k, v]) => <Pill key={k} className={k === "ok" ? TONE_CLASS.ok : TONE_CLASS.warn}>{STATUS_LABEL[k] ?? k}: {v}</Pill>)}
              {Object.keys(s.by_status).length === 0 && <span className="text-ink-soft">Belum ada.</span>}
            </div>
            {s.versions.length > 0 && (
              <table className="mt-3 w-full text-left text-xs">
                <thead className="text-muted"><tr><th className="py-1">Versi prompt</th><th>Panggilan</th><th>Langsung</th><th>Fallback</th></tr></thead>
                <tbody className="divide-y divide-line">{s.versions.map((v) => <tr key={v.prompt_version}><td className="py-1 font-mono">{v.prompt_version}</td><td className="tabular-nums">{v.calls}</td><td className="tabular-nums">{v.live}</td><td className="tabular-nums">{v.fallback}</td></tr>)}</tbody>
              </table>
            )}
            {Object.keys(s.other_operations).length > 0 && <p className="mt-3 text-xs text-muted">Operasi lain: {Object.entries(s.other_operations).map(([k, v]) => `${k} ${v}`).join(", ")}.</p>}
          </Card>
        </div>
      </section>

      <section className="mt-8 space-y-3">
        <SectionTitle title="Sesi survei" hint="Status seluruh sesi (tanpa sandbox)." />
        <Card>
          {Object.keys(s.sessions).length === 0 ? <EmptyState title="Belum ada sesi" /> : (
            <ul className="flex flex-wrap gap-4 p-4 text-sm">{Object.entries(s.sessions).map(([k, v]) => <li key={k}><span className="block text-xs text-muted">{k}</span><strong className="text-xl tabular-nums">{v}</strong></li>)}</ul>
          )}
        </Card>
      </section>
    </>
  );
}
