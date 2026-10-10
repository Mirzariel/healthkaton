import Link from "next/link";
import { PolicyEditor, RecomputeButton } from "@/components/pkbi/CardForms";
import { Card, EmptyState, Forbidden, PageHeader, SectionTitle, SimNotice, SourceBadge } from "@/components/ui";
import { can } from "@/lib/auth/principal";
import { CARD_LIMITS, getActiveCardPolicy, listCardPolicies, listCards, parseParams, periodLabel } from "@/lib/cards/compute";
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
      <PageHeader title="Kartu pembinaan faskes" eyebrow="Mutu dan keuangan" purpose="Alat visibilitas untuk pembinaan dan review terjadwal. Setiap kartu menyertakan angka mentah, penyebut, pembanding sejawat, dan alasannya.">
        {can(me, "cards.configure") && <RecomputeButton />}
      </PageHeader>
      <SimNotice>{CARD_LIMITS} Versi parameter {policy.id} berstatus <strong>{policy.status === "validated" ? "tervalidasi" : "DRAFT"}</strong>: {params.label}</SimNotice>

      <section className="mt-6 space-y-3">
        <SectionTitle title="Kartu per faskes dan periode" hint={`Periode: ${params.period === "quarter" ? "kuartal" : "bulan"}. Kartu kuning/merah adalah dasar pembinaan, bukan indikasi fraud. ${open ? `${open} bantahan menunggu jawaban.` : ""}`}>
          <SourceBadge source="simulated" />
        </SectionTitle>
        <Card className="overflow-x-auto">
          {cards.length === 0 ? <EmptyState title="Belum ada kartu">Hitung ulang kartu bila data sudah tersedia.</EmptyState> : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted"><tr><th className="p-3">Faskes</th>{periods.map((p) => <th key={p} className="p-3">{periodLabel(p)}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {facilities.map(([id, name]) => (
                  <tr key={id}>
                    <td className="p-3"><Link className="font-semibold underline-offset-4 hover:underline" href={`/console/cards/${id}`}>{name}</Link></td>
                    {periods.map((p) => { const c = cell.get(`${id}|${p}`); return <td key={p} className="p-3">{c ? <Link href={`/console/cards/${id}?period=${p}`}><LevelPill level={c.level} /></Link> : <span className="text-muted">-</span>}</td>; })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>

      {can(me, "cards.configure") && (
        <section className="mt-8 space-y-3">
          <SectionTitle title="Parameter kartu" hint="Mengubah ambang membuat versi draft baru; versi lama tidak diubah dan tidak ada tombol 'tervalidasi' di aplikasi ini." />
          <Card className="p-4">
            <ul className="mb-4 space-y-1 text-sm text-ink-soft">{listCardPolicies(db).map((v) => <li key={v.id}><span className="font-mono text-xs">{v.id}</span> · {v.status === "validated" ? "tervalidasi" : "draft"}{v.id === policy.id ? " · aktif" : ""}</li>)}</ul>
            <details><summary className="cursor-pointer text-sm font-semibold">Buat versi parameter baru</summary><div className="mt-3"><PolicyEditor initial={params} /></div></details>
          </Card>
        </section>
      )}

      <section className="mt-8 space-y-2 text-sm text-ink-soft">
        <SectionTitle title="Cara membaca" />
        <ul className="list-disc space-y-1 pl-5">
          <li>Faskes dibandingkan hanya dengan faskes sejawat (kelompok yang sama) pada periode yang sama. Bila sejawat kurang dari {params.min_peers}, kartu menjadi “Data belum cukup”, bukan hijau.</li>
          <li>Kuning bila metrik melebihi {params.yellow_ratio}× pembanding dan lantai. Merah bila sedikitnya {params.min_metrics_for_red} metrik melebihi {params.red_ratio}× pembanding.</li>
          <li>Kartu tidak pernah mengubah klaim, pembayaran, atau status kasus.</li>
        </ul>
      </section>
    </>
  );
}
