import { notFound } from "next/navigation";
import { DisputeResolveForm } from "@/components/pkbi/PendingForms";
import { Card, Forbidden, PageHeader, Pill, SectionTitle, SimNotice } from "@/components/ui";
import { can } from "@/lib/auth/principal";
import { CARD_LIMITS, METRIC_INFO, consecutiveFlagged, getActiveCardPolicy, listCards, periodLabel } from "@/lib/cards/compute";
import { getDb } from "@/lib/db";
import { fmtDateTime } from "@/lib/dates";
import { TONE_CLASS } from "@/lib/labels";
import { getPrincipal } from "@/lib/server";
import { LevelPill, STATE_LABEL } from "../CardBits";

export const dynamic = "force-dynamic";

const fmt = (key: keyof typeof METRIC_INFO, v: number | null) => (v === null ? "-" : METRIC_INFO[key].unit === "%" ? `${(v * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%` : `${v.toLocaleString("id-ID", { maximumFractionDigits: 2 })} per 100`);

export default async function CardDetail({ params, searchParams }: { params: Promise<{ facilityId: string }>; searchParams: Promise<{ period?: string }> }) {
  const me = await getPrincipal("konsol");
  if (!can(me, "cards.view")) return <Forbidden need="cards.view" />;
  const { facilityId } = await params;
  const { period } = await searchParams;
  const db = getDb();
  const all = listCards(db, { facilityId });
  if (all.length === 0) notFound();
  const cur = all.find((c) => c.period === period) ?? all[all.length - 1];
  const policy = getActiveCardPolicy(db);
  const streak = consecutiveFlagged(all);
  const b = cur.basis;
  return (
    <>
      <PageHeader title={cur.facility_name} eyebrow="Kartu pembinaan" crumbs={[{ label: "Kartu pembinaan", href: "/console/cards" }, { label: cur.facility_id }]} purpose={`Periode ${periodLabel(cur.period)} · dihitung ${fmtDateTime(cur.computed_at)} · ${cur.policy_version_id} (${policy.status === "validated" ? "tervalidasi" : "DRAFT"})`}>
        <LevelPill level={cur.level} />
      </PageHeader>
      <SimNotice>{CARD_LIMITS}</SimNotice>
      <nav className="mt-4 flex flex-wrap gap-2 text-sm" aria-label="Periode">
        {all.map((c) => <a key={c.id} href={`/console/cards/${cur.facility_id}?period=${c.period}`} aria-current={c.id === cur.id ? "page" : undefined} className={`rounded-lg border px-3 py-1 ${c.id === cur.id ? "border-ink bg-card font-semibold" : "border-line text-ink-soft"}`}>{periodLabel(c.period)}</a>)}
      </nav>

      <div className="mt-6 space-y-6">
        <section className="space-y-3">
          <SectionTitle title="Alasan level kartu" />
          <Card className="space-y-2 p-4 text-sm">
            {b.insufficient_reason && <p className="font-medium">{b.insufficient_reason}</p>}
            <ul className="list-disc space-y-1 pl-5 text-ink-soft">{b.reasons.filter((r) => r !== b.insufficient_reason).map((r, i) => <li key={i}>{r}</li>)}</ul>
            {b.partial && <p className="text-warn">Periode berjalan belum lengkap; angka dapat berubah.</p>}
            {b.history_note && <p className="text-ink-soft">{b.history_note}</p>}
            {streak >= 2 && <p className="text-ink-soft">Kuning atau merah pada {streak} periode berturut-turut sampai periode terakhir. Informasi tambahan untuk penjadwalan pembinaan, bukan penentu level.</p>}
            <p className="text-xs text-muted">Kelompok sejawat: {b.peer_group ?? "-"} · {b.peers.length ? `pembanding: ${b.peers.join(", ")}` : "tidak ada pembanding"}</p>
          </Card>
        </section>

        <section className="space-y-3">
          <SectionTitle title="Metrik, angka mentah, dan pembanding" />
          <Card className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted"><tr><th className="p-3">Metrik</th><th className="p-3">Pembilang / penyebut</th><th className="p-3">Nilai</th><th className="p-3">Median sejawat (n)</th><th className="p-3">Rasio</th><th className="p-3">Keadaan</th></tr></thead>
              <tbody className="divide-y divide-line">
                {b.metrics.map((m) => (
                  <tr key={m.key} className="align-top">
                    <td className="p-3"><p className="font-medium">{METRIC_INFO[m.key].label}</p><p className="text-xs text-muted">{METRIC_INFO[m.key].numerator} / {METRIC_INFO[m.key].denominator}</p><p className="text-xs text-muted">Sumber: {METRIC_INFO[m.key].source}</p></td>
                    <td className="p-3 tabular-nums">{m.num} / {m.den}{!m.available && <p className="text-xs text-muted">minimal {m.min_required}</p>}</td>
                    <td className="p-3 tabular-nums">{m.available ? fmt(m.key, m.value) : "-"}</td>
                    <td className="p-3 tabular-nums">{fmt(m.key, m.peer_median)} ({m.peer_count})</td>
                    <td className="p-3 tabular-nums">{m.ratio === null ? "-" : `${m.ratio.toLocaleString("id-ID", { maximumFractionDigits: 2 })}×`}</td>
                    <td className="p-3"><Pill className={TONE_CLASS[m.state === "high" ? "danger" : m.state === "elevated" ? "warn" : m.state === "normal" ? "ok" : "muted"]}>{STATE_LABEL[m.state]}</Pill><p className="mt-1 text-xs text-muted">{m.note}</p></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>

        {b.sample.length > 0 && (
          <section className="space-y-3">
            <SectionTitle title="Contoh klaim pending pada periode ini" hint="Contoh agar angka dapat ditelusuri; bukan seluruh klaim dan bukan dugaan pelanggaran." />
            <Card className="divide-y divide-line">{b.sample.map((s) => <p key={s.claim_no} className="flex justify-between p-3 text-sm"><span className="font-mono">{s.claim_no}</span><span className="text-ink-soft">{s.reason_code} · {s.status}</span></p>)}</Card>
          </section>
        )}

        <section className="space-y-3">
          <SectionTitle title="Bantahan faskes" hint="Faskes dapat membantah kartu miliknya. Bantahan yang diterima menandai kartu untuk ditinjau ulang; level tidak diubah tangan." />
          {cur.disputes.length === 0 ? <Card className="p-4 text-sm text-ink-soft">Tidak ada bantahan untuk kartu ini.</Card> : cur.disputes.map((d) => (
            <Card key={d.id} className="space-y-2 p-4">
              <p className="flex items-center gap-2 text-sm"><span className="font-mono text-xs">{d.id}</span><Pill className={TONE_CLASS[d.status === "open" ? "warn" : "ok"]}>{d.status === "open" ? "Menunggu jawaban" : "Dijawab"}</Pill><span className="text-muted">{fmtDateTime(d.created_at)}</span></p>
              <p className="text-sm">{d.text}</p>
              {d.response && <p className="rounded-md bg-brand-soft/60 px-3 py-2 text-sm text-ink-soft">Jawaban: {d.response}</p>}
              {d.status === "open" && can(me, "dispute.resolve") && <DisputeResolveForm id={d.id} kind="card" categories={[]} />}
            </Card>
          ))}
        </section>
      </div>
    </>
  );
}
