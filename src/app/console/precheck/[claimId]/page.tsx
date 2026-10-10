import Link from "next/link";
import { SaveRunButton } from "@/components/pkbi/PrecheckForms";
import { Card, Forbidden, PageHeader, Pill, SectionTitle, SimNotice } from "@/components/ui";
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
  return (
    <>
      <PageHeader title={`Pra-pengajuan ${result.claimNo}`} eyebrow="Pra-pengajuan" crumbs={[{ label: "Pra-pengajuan", href: "/console/precheck" }, { label: result.claimNo }]} purpose={o.hint}>
        <Pill className={TONE_CLASS[o.tone]}>{o.label}</Pill>
      </PageHeader>
      <SimNotice>{result.disclaimer}</SimNotice>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="space-y-3 lg:col-span-2">
          <SectionTitle title="Hasil pemeriksaan" hint="Dihitung saat halaman dibuka dari data terkini. Simpan bila perlu dicatat di riwayat." />
          <Card className="divide-y divide-line">
            {result.checks.map((c) => (
              <div key={c.code} className="space-y-1 p-4 text-sm">
                <p className="flex flex-wrap items-center gap-2"><Pill className={TONE_CLASS[SEV[c.severity].tone]}>{SEV[c.severity].label}</Pill><span className="text-xs text-muted">{c.area}</span><span className="font-semibold">{c.title}</span></p>
                <p className="text-ink-soft">{c.detail}</p>
                {c.fix && <p><Link className="text-xs font-semibold underline underline-offset-4" href={c.fix.href}>{c.fix.label}</Link></p>}
              </div>
            ))}
          </Card>
        </section>
        <aside className="space-y-4">
          <Card elevated className="space-y-2 p-4"><SaveRunButton claimId={result.claimId} /></Card>
          <section className="space-y-2">
            <SectionTitle title="Riwayat pemeriksaan" />
            <Card className="divide-y divide-line text-sm">
              {runs.length === 0 ? <p className="p-3 text-ink-soft">Belum ada riwayat tersimpan.</p> : runs.map((r) => (
                <div key={r.id} className="space-y-1 p-3"><p className="flex items-center justify-between"><Pill className={TONE_CLASS[OUTCOME_LABEL[r.outcome].tone]}>{OUTCOME_LABEL[r.outcome].label}</Pill><span className="text-xs text-muted">{fmtDateTime(r.ran_at)}</span></p><p className="font-mono text-[11px] text-muted">{r.id} · {r.ran_by}</p></div>
              ))}
            </Card>
          </section>
        </aside>
      </div>
    </>
  );
}
