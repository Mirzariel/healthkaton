import Link from "next/link";
import { Disclosure } from "@/components/analytics/blocks";
import { PolicyEditor, RecomputeButton } from "@/components/pkbi/CardForms";
import { Card, EmptyState, Forbidden, PageHeader, Section, SectionTitle, SimNotice, SourceBadge, StatusPill, TableCard } from "@/components/ui";
import { can } from "@/lib/auth/principal";
import { getActiveCardPolicy, listCardPolicies, listCards, parseParams, periodLabel } from "@/lib/cards/compute";
import { getDb } from "@/lib/db";
import { getPrincipal } from "@/lib/server";
import { LevelPill } from "./CardBits";

export const dynamic = "force-dynamic";

export default async function CardsPage() {
  const me = await getPrincipal("konsol");
  if (!can(me, "cards.view")) return <Forbidden need="cards.view" />;
  const db = getDb();
  const policy = getActiveCardPolicy(db);
  const params = parseParams(policy.params_json);
  const cards = listCards(db);
  const periods = [...new Set(cards.map((c) => c.period))].sort();
  const facilities = [...new Map(cards.map((c) => [c.facility_id, c.facility_name])).entries()];
  const cell = new Map(cards.map((c) => [`${c.facility_id}|${c.period}`, c]));
  const open = cards.reduce((n, c) => n + c.disputes.filter((d) => d.status === "open").length, 0);
  return (
    <>
      <PageHeader title="Kartu pembinaan faskes" eyebrow="Mutu dan keuangan" purpose="Bahan pembinaan, dibandingkan dengan faskes sejawat.">
        {can(me, "cards.configure") && <RecomputeButton />}
      </PageHeader>
      <SimNotice>Bukan vonis, peringkat, sanksi, atau pernyataan fraud. Parameter {policy.id} berstatus <strong>{policy.status === "validated" ? "tervalidasi" : "DRAFT"}</strong>.</SimNotice>

      <Section className="mt-8">
        <SectionTitle title="Kartu per faskes dan periode" hint={`Per ${params.period === "quarter" ? "kuartal" : "bulan"}.${open ? ` ${open} bantahan menunggu jawaban.` : ""}`}>
          <SourceBadge source="simulated" />
        </SectionTitle>
        <TableCard label="Kartu per faskes dan periode">
          {cards.length === 0 ? <EmptyState title="Belum ada kartu">Hitung ulang kartu bila data sudah tersedia.</EmptyState> : (
            <table className="table-stack w-full text-left text-body-sm">
              <thead><tr><th className="px-4 py-2.5">Faskes</th>{periods.map((p) => <th key={p} className="px-4 py-2.5">{periodLabel(p)}</th>)}</tr></thead>
              <tbody>
                {facilities.map(([id, name]) => (
                  <tr key={id}>
                    <td className="px-4 py-3"><Link className="font-semibold text-brand-ink underline decoration-brand/30 underline-offset-3 hover:decoration-current" href={`/console/cards/${id}`}>{name}</Link></td>
                    {periods.map((p) => { const c = cell.get(`${id}|${p}`); return <td key={p} data-label={periodLabel(p)} className="px-4 py-3">{c ? <Link href={`/console/cards/${id}?period=${p}`} className="inline-block rounded-md" aria-label={`${name}, ${periodLabel(p)}`}><LevelPill level={c.level} /></Link> : <span className="text-muted">-</span>}</td>; })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TableCard>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-caption text-ink-soft" aria-label="Keterangan level kartu">
          <span className="text-muted">Level:</span>
          <LevelPill level="none" /><LevelPill level="yellow" /><LevelPill level="red" /><LevelPill level="insufficient_data" />
        </div>
      </Section>

      <Section className="mt-10">
        <Disclosure title="Cara membaca kartu">
          <ul className="list-disc space-y-2 pl-5 text-body-sm leading-relaxed text-ink-soft">
            <li>Faskes dibandingkan hanya dengan faskes sejawat (kelompok yang sama) pada periode yang sama. Bila sejawat kurang dari {params.min_peers}, kartu menjadi “Data belum cukup”, bukan hijau.</li>
            <li>Kuning bila metrik melebihi {params.yellow_ratio}× pembanding dan lantai. Merah bila sedikitnya {params.min_metrics_for_red} metrik melebihi {params.red_ratio}× pembanding.</li>
            <li>{params.label}</li>
            <li>Kartu tidak pernah mengubah klaim, pembayaran, atau status kasus.</li>
          </ul>
        </Disclosure>
      </Section>

      {can(me, "cards.configure") && (
        <Section className="mt-10">
          <SectionTitle title="Parameter kartu" hint="Mengubah ambang membuat versi draft baru; tidak ada tombol “tervalidasi” di aplikasi ini." />
          <Card>
            <ul className="divide-y divide-line">
              {listCardPolicies(db).map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-body-sm">
                  <span className="font-mono text-code">{v.id}</span>
                  <StatusPill tone={v.status === "validated" ? "ok" : "muted"}>{v.status === "validated" ? "tervalidasi" : "draft"}</StatusPill>
                  {v.id === policy.id && <StatusPill tone="info" dot={false}>aktif</StatusPill>}
                </li>
              ))}
            </ul>
          </Card>
          <Disclosure title="Buat versi parameter baru"><PolicyEditor initial={params} /></Disclosure>
        </Section>
      )}
    </>
  );
}
