import Link from "next/link";
import { SaveRunButton } from "@/components/pkbi/PrecheckForms";
import { Inset, RecordId } from "@/components/console/Parts";
import { Card, CardHeader, Forbidden, PageHeader, Pill, SimNotice, StatusPill } from "@/components/ui";
import { DomainError } from "@/lib/idem";
import { can } from "@/lib/auth/principal";
import { getDb } from "@/lib/db";
import { fmtDateTime } from "@/lib/dates";
import { TONE_CLASS } from "@/lib/labels";
import { OUTCOME_LABEL, evaluateClaim, listRuns, type Severity } from "@/lib/precheck/evaluate";
import { notFound } from "next/navigation";
import { getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";
const SEV: Record<Severity, { label: string; tone: keyof typeof TONE_CLASS }> = { ok: { label: "Sesuai", tone: "ok" }, info: { label: "Catatan", tone: "info" }, review: { label: "Periksa", tone: "warn" }, hold: { label: "Tahan (rekomendasi)", tone: "danger" } };

export default async function PrecheckDetail({ params }: { params: Promise<{ claimId: string }> }) {
  const me = await getPrincipal("konsol");
  if (!can(me, "precheck.use")) return <Forbidden need="precheck.use" />;
  const { claimId } = await params;
  const db = getDb();
  let result;
  try { result = evaluateClaim(db, me, decodeURIComponent(claimId)); } catch (e) { if (e instanceof DomainError && e.status === 404) notFound(); throw e; }
  const runs = listRuns(db, me, result.claimId);
  const o = OUTCOME_LABEL[result.outcome];
  const order: Severity[] = ["hold", "review", "info", "ok"];
  const checks = [...result.checks].sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
  const toReview = checks.filter((c) => c.severity === "review" || c.severity === "hold").length;
  return (
    <>
      <PageHeader title={`Pra-pengajuan ${result.claimNo}`} eyebrow="Pra-pengajuan" crumbs={[{ label: "Pra-pengajuan", href: "/console/precheck" }, { label: result.claimNo }]} purpose={o.hint}>
        <Pill className={TONE_CLASS[o.tone]}>{o.label}</Pill>
      </PageHeader>
      <SimNotice>{result.disclaimer}</SimNotice>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="hasil">
          <Card elevated>
            <CardHeader title={<span id="hasil">Hasil pemeriksaan</span>} hint={`${toReview} dari ${checks.length} perlu ditinjau. Dihitung dari data terkini.`} />
            <ul className="divide-y divide-line">
              {checks.map((c) => (
                <li key={c.code} className="grid grid-cols-1 gap-x-4 gap-y-1.5 px-5 py-4 text-[14px] sm:grid-cols-[9.5rem_minmax(0,1fr)]">
                  <div className="flex items-start sm:flex-col sm:gap-1.5">
                    <StatusPill tone={SEV[c.severity].tone}>{SEV[c.severity].label}</StatusPill>
                    <span className="ml-2 text-[12.5px] text-muted sm:ml-0">{c.area}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{c.title}</p>
                    <p className="mt-1 leading-relaxed text-ink-soft">{c.detail}</p>
                    {c.fix && <p className="mt-2"><Link className="btn btn-secondary btn-sm" href={c.fix.href}>{c.fix.label}</Link></p>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </section>
        <aside className="space-y-4" aria-label="Simpan dan riwayat">
          <Card elevated className="p-5"><SaveRunButton claimId={result.claimId} /></Card>
          <Inset title="Riwayat pemeriksaan" flush>
            {runs.length === 0 ? <p className="px-5 pb-4 pt-1 text-[13.5px] text-ink-soft">Belum ada riwayat tersimpan.</p> : (
              <ul className="divide-y divide-line/70 pb-1">
                {runs.map((r) => (
                  <li key={r.id} className="space-y-1.5 px-5 py-3"><p className="flex items-center justify-between gap-2"><Pill className={TONE_CLASS[OUTCOME_LABEL[r.outcome].tone]}>{OUTCOME_LABEL[r.outcome].label}</Pill><span className="text-[12px] tabular-nums text-muted">{fmtDateTime(r.ran_at)}</span></p><p className="text-[12px] text-muted"><RecordId>{r.id}</RecordId> · {r.ran_by}</p></li>
                ))}
              </ul>
            )}
          </Inset>
        </aside>
      </div>
    </>
  );
}
