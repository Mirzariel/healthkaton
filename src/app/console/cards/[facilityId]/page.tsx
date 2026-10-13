import { notFound } from "next/navigation";
import { FilterChips } from "@/components/analytics/blocks";
import { DisputeResolveForm } from "@/components/pkbi/PendingForms";
import { Card, Forbidden, Notice, PageHeader, Section, SectionTitle, SimNotice, StatusPill, TableCard } from "@/components/ui";
import { can } from "@/lib/auth/principal";
import { METRIC_INFO, consecutiveFlagged, getActiveCardPolicy, listCards, periodLabel } from "@/lib/cards/compute";
import { getDb } from "@/lib/db";
import { fmtDateTime } from "@/lib/dates";
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
  const otherReasons = b.reasons.filter((r) => r !== b.insufficient_reason);
  return (
    <>
      <PageHeader title={cur.facility_name} eyebrow="Kartu pembinaan" crumbs={[{ label: "Kartu pembinaan", href: "/console/cards" }, { label: cur.facility_id }]} purpose={`Periode ${periodLabel(cur.period)}, dihitung ${fmtDateTime(cur.computed_at)}, parameter ${cur.policy_version_id} (${policy.status === "validated" ? "tervalidasi" : "DRAFT"}).`}>
        <LevelPill level={cur.level} />
      </PageHeader>
      <SimNotice>Bahan pembinaan, bukan vonis, peringkat, sanksi, atau pernyataan fraud.</SimNotice>
      <div className="mt-5">
        <FilterChips label="Periode" items={all.map((c) => ({ href: `/console/cards/${cur.facility_id}?period=${c.period}`, label: periodLabel(c.period), active: c.id === cur.id }))} />
      </div>

      <Section className="mt-8">
        <SectionTitle title="Alasan level kartu" />
        <Card elevated className="space-y-2.5 px-5 py-4 text-body-sm leading-relaxed">
          {b.insufficient_reason && <p className="font-medium text-ink">{b.insufficient_reason}</p>}
          {otherReasons.length > 0 && <ul className="list-disc space-y-1 pl-5 text-ink-soft">{otherReasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
          {b.partial && <p className="text-warn">Periode berjalan belum lengkap; angka dapat berubah.</p>}
          {b.history_note && <p className="text-ink-soft">{b.history_note}</p>}
          {streak >= 2 && <p className="text-ink-soft">Kuning atau merah pada {streak} periode berturut-turut sampai periode terakhir. Informasi tambahan untuk penjadwalan pembinaan, bukan penentu level.</p>}
          <p className="border-t border-line pt-2.5 text-caption text-muted">Kelompok sejawat: {b.peer_group ?? "-"} · {b.peers.length ? `pembanding: ${b.peers.join(", ")}` : "tidak ada pembanding"}</p>
        </Card>
      </Section>

      <Section className="mt-10">
        <SectionTitle title="Metrik, angka mentah, dan pembanding" hint="Pembanding = median faskes sejawat pada periode yang sama." />
        <TableCard label="Metrik kartu">
          <table className="w-full min-w-[52rem] text-left text-body-sm">
            <thead><tr><th className="px-4 py-2.5">Metrik</th><th className="px-4 py-2.5 text-right">Nilai</th><th className="px-4 py-2.5 text-right">Pembilang / penyebut</th><th className="px-4 py-2.5 text-right">Median sejawat (n)</th><th className="px-4 py-2.5 text-right">Rasio</th><th className="px-4 py-2.5">Keadaan</th></tr></thead>
            <tbody className="align-top">
              {b.metrics.map((m) => (
                <tr key={m.key}>
                  <td className="min-w-44 px-4 py-3"><p className="font-medium text-ink">{METRIC_INFO[m.key].label}</p><p className="text-caption text-muted">{METRIC_INFO[m.key].numerator} / {METRIC_INFO[m.key].denominator}</p><p className="text-caption text-muted">Sumber: {METRIC_INFO[m.key].source}</p></td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{m.available ? fmt(m.key, m.value) : "-"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{m.num} / {m.den}{!m.available && <p className="text-caption text-muted">minimal {m.min_required}</p>}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(m.key, m.peer_median)} ({m.peer_count})</td>
                  <td className="px-4 py-3 text-right tabular-nums">{m.ratio === null ? "-" : `${m.ratio.toLocaleString("id-ID", { maximumFractionDigits: 2 })}×`}</td>
                  <td className="px-4 py-3"><StatusPill tone={m.state === "high" ? "danger" : m.state === "elevated" ? "warn" : m.state === "normal" ? "ok" : "muted"}>{STATE_LABEL[m.state]}</StatusPill><p className="mt-1 max-w-56 text-caption leading-snug text-muted">{m.note}</p></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      </Section>

      {b.sample.length > 0 && (
        <Section className="mt-10">
          <SectionTitle title="Contoh klaim pending pada periode ini" hint="Contoh penelusuran; bukan seluruh klaim dan bukan dugaan pelanggaran." />
          <Card className="divide-y divide-line">{b.sample.map((s) => <p key={s.claim_no} className="flex flex-wrap justify-between gap-x-4 gap-y-1 px-5 py-2.5 text-body-sm"><span className="font-mono text-code">{s.claim_no}</span><span className="text-ink-soft">{s.reason_code} · {s.status}</span></p>)}</Card>
        </Section>
      )}

      <Section className="mt-10">
        <SectionTitle title="Bantahan faskes" hint="Bantahan yang diterima menandai kartu untuk ditinjau ulang; level tidak diubah tangan." />
        {cur.disputes.length === 0 ? <Notice tone="neutral">Tidak ada bantahan untuk kartu ini.</Notice> : cur.disputes.map((d) => (
          <Card key={d.id} className="space-y-2.5 px-5 py-4">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-body-sm"><span className="font-mono text-code">{d.id}</span><StatusPill tone={d.status === "open" ? "warn" : "ok"}>{d.status === "open" ? "Menunggu jawaban" : "Dijawab"}</StatusPill><span className="text-caption text-muted">{fmtDateTime(d.created_at)}</span></p>
            <p className="text-body-sm leading-relaxed text-ink">{d.text}</p>
            {d.response && <p className="rounded-lg border-l-2 border-brand/40 bg-brand-tint px-3.5 py-2.5 text-body-sm leading-relaxed text-ink-soft">Jawaban: {d.response}</p>}
            {d.status === "open" && can(me, "dispute.resolve") && <DisputeResolveForm id={d.id} kind="card" categories={[]} />}
          </Card>
        ))}
      </Section>
    </>
  );
}
