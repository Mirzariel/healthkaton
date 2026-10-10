import Link from "next/link";
import { Card, EmptyState, Forbidden, PageHeader, Pill, SectionTitle, SimNotice } from "@/components/ui";
import { can } from "@/lib/auth/principal";
import { getDb } from "@/lib/db";
import { rupiah } from "@/lib/dates";
import { TONE_CLASS } from "@/lib/labels";
import { OUTCOME_LABEL, PRECHECK_DISCLAIMER, precheckCandidates } from "@/lib/precheck/evaluate";
import { getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function PrecheckPage() {
  const me = await getPrincipal("konsol");
  if (!can(me, "precheck.use")) return <Forbidden need="precheck.use" />;
  const rows = precheckCandidates(getDb(), me);
  const count = (o: keyof typeof OUTCOME_LABEL) => rows.filter((r) => r.result.outcome === o).length;
  return (
    <>
      <PageHeader title="Pra-pengajuan" eyebrow="Kerja" purpose="Periksa kelengkapan klaim yang masih draft atau dikembalikan sebelum diajukan. Hasilnya membantu melengkapi, bukan menjamin pembayaran." />
      <SimNotice>{PRECHECK_DISCLAIMER}</SimNotice>
      <section className="mt-6 grid gap-3 sm:grid-cols-4">
        {(Object.keys(OUTCOME_LABEL) as (keyof typeof OUTCOME_LABEL)[]).map((o) => (
          <div key={o} className="rounded-xl border border-line bg-card p-4"><p className="text-xs text-ink-soft">{OUTCOME_LABEL[o].label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{count(o)}</p><p className="mt-1 text-xs text-muted">dari {rows.length} klaim draft/dikembalikan</p></div>
        ))}
      </section>
      <section className="mt-8 space-y-3">
        <SectionTitle title="Klaim yang dapat diperiksa" hint="Hanya klaim berstatus draft atau dikembalikan." />
        <Card className="overflow-x-auto">
          {rows.length === 0 ? <EmptyState title="Tidak ada klaim draft atau dikembalikan" /> : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted"><tr><th className="p-3">Klaim</th><th className="p-3">Faskes</th><th className="p-3">Status</th><th className="p-3">Hasil</th><th className="p-3">Temuan</th><th className="p-3 text-right">Nilai</th></tr></thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => {
                  const o = OUTCOME_LABEL[r.result.outcome];
                  const n = r.result.checks.filter((c) => c.severity === "review" || c.severity === "hold").length;
                  return (
                    <tr key={r.id}>
                      <td className="p-3"><Link className="font-semibold underline-offset-4 hover:underline" href={`/console/precheck/${r.id}`}>{r.claim_no}</Link></td>
                      <td className="p-3 text-ink-soft">{r.facility_name}</td>
                      <td className="p-3">{r.status === "draft" ? "Draft" : "Dikembalikan"}</td>
                      <td className="p-3"><Pill className={TONE_CLASS[o.tone]} title={o.hint}>{o.label}</Pill></td>
                      <td className="p-3 tabular-nums">{n} hal untuk ditinjau</td>
                      <td className="p-3 text-right tabular-nums">{rupiah(r.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </section>
    </>
  );
}
