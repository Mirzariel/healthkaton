import Link from "next/link";
import { More } from "@/components/analytics/blocks";
import { InfoDot } from "@/components/explain";
import { rowLink } from "@/components/console/Parts";
import { EmptyState, Forbidden, PageHeader, Pill, SectionTitle, SimNotice, Stat, StatGrid, TableCard } from "@/components/ui";
import { can } from "@/lib/auth/principal";
import { getDb } from "@/lib/db";
import { rupiah } from "@/lib/dates";
import { TONE_CLASS } from "@/lib/labels";
import { OUTCOME_LABEL, precheckCandidates } from "@/lib/precheck/evaluate";
import { getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function PrecheckPage() {
  const me = await getPrincipal("konsol");
  if (!can(me, "precheck.use")) return <Forbidden need="precheck.use" />;
  const rows = precheckCandidates(getDb(), me);
  const count = (o: keyof typeof OUTCOME_LABEL) => rows.filter((r) => r.result.outcome === o).length;
  return (
    <>
      <PageHeader title="Pra-pengajuan" eyebrow="Kerja" purpose="Cek kelengkapan klaim sebelum diajukan." />
      <SimNotice>Membantu kelengkapan, tidak menjamin klaim dibayar.</SimNotice>
      <More className="mt-2 pl-1">“Tahan” hanya rekomendasi peninjauan dalam demo, bukan blokir ke BPJS. Hasil survei peserta tidak dipakai di sini.</More>
      <section className="mt-6" aria-label="Ringkasan hasil"><StatGrid>
        {(Object.keys(OUTCOME_LABEL) as (keyof typeof OUTCOME_LABEL)[]).map((o) => (
          <Stat key={o} label={OUTCOME_LABEL[o].label} value={count(o)} hint={`dari ${rows.length} klaim`} tone={count(o) === 0 ? "default" : o === "ready" ? "ok" : o === "hold" ? "danger" : o === "review" ? "warn" : "default"} />
        ))}
      </StatGrid></section>
      <section className="mt-10 space-y-3">
        <SectionTitle title="Klaim yang dapat diperiksa" hint="Draft atau dikembalikan." />
        <TableCard label="Klaim yang dapat diperiksa">
          {rows.length === 0 ? <EmptyState title="Tidak ada klaim draft atau dikembalikan" /> : (
            <table className="table-stack w-full text-left md:min-w-[30rem] text-body-sm">
              <caption className="sr-only">Klaim draft atau dikembalikan beserta hasil pemeriksaan</caption>
              <thead><tr><th className="px-4 py-2.5"><span className="inline-flex items-center gap-1">Klaim <InfoDot k="klaim" /></span></th><th className="hidden px-4 py-2.5 md:table-cell">Faskes</th><th className="hidden px-4 py-2.5 sm:table-cell">Status</th><th className="px-4 py-2.5">Hasil</th><th className="hidden px-4 py-2.5 text-right lg:table-cell">Temuan</th><th className="px-4 py-2.5 text-right">Nilai</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const o = OUTCOME_LABEL[r.result.outcome];
                  const n = r.result.checks.filter((c) => c.severity === "review" || c.severity === "hold").length;
                  return (
                    <tr key={r.id}>
                      <td className="px-4 py-3"><Link className={`${rowLink} font-mono text-code`} href={`/console/precheck/${r.id}`}>{r.claim_no}</Link></td>
                      <td data-label="Faskes" className="hidden px-4 py-3 text-ink-soft md:table-cell">{r.facility_name}</td>
                      <td data-label="Status" className="hidden px-4 py-3 text-ink-soft sm:table-cell">{r.status === "draft" ? "Draft" : "Dikembalikan"}</td>
                      <td data-label="Hasil" className="px-4 py-3"><Pill className={TONE_CLASS[o.tone]} title={o.hint}>{o.label}</Pill></td>
                      <td data-label="Temuan" className="hidden px-4 py-3 text-right tabular-nums text-ink-soft lg:table-cell">{n} hal untuk ditinjau</td>
                      <td data-label="Nilai" className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{rupiah(r.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </TableCard>
      </section>
    </>
  );
}
