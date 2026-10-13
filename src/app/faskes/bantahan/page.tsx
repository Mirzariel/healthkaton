import Link from "next/link";
import { Quote } from "@/components/casework/parts";
import { IconScale } from "@/components/icons";
import { Card, EmptyState, Forbidden, PageHeader, ProofBadge, Section, SectionTitle, StatusPill } from "@/components/ui";
import { can } from "@/lib/auth/principal";
import { DISPUTE_LABEL } from "@/lib/casework/labels";
import { facilityDisputes } from "@/lib/casework/queries";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";

const FIRST = 5;

export default async function FaskesDisputes() {
  const me = await getPrincipal("faskes");
  if (!can(me, "dispute.create")) return <Forbidden need="dispute.create" />;
  const d = facilityDisputes(getDb(), me);
  type F = (typeof d.disputable)[number];
  const row = (f: F) => (
    <Link key={f.id} href={`/faskes/temuan/${f.id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-4 py-3 transition-colors hover:bg-card/60">
      <div className="min-w-0">
        <p className="text-body-sm font-medium leading-snug text-ink">{f.title}</p>
        <p className="mt-0.5 text-caption text-muted">Perawatan {fmtDate(f.admit_date)} <span className="ml-2" title="Nomor temuan">Temuan <span className="font-mono">{f.id}</span></span></p>
      </div>
      <ProofBadge status={f.proof_status} />
    </Link>
  );
  return (
    <>
      <PageHeader title="Bantahan" purpose="Bantahan yang Anda ajukan dan tanggapan reviewer." />

      <Section>
        <SectionTitle title="Sudah diajukan" hint={d.rows.length ? `${d.rows.length} bantahan` : undefined} />
        {d.rows.length === 0 ? (
          <div className="panel-inset">
            <EmptyState title="Belum ada bantahan" icon={<IconScale size={18} />}>
              Ajukan dari halaman temuan.
            </EmptyState>
          </div>
        ) : (
          d.rows.map((r, idx) => (
            <Card key={r.id} elevated={idx === 0} className="space-y-3 px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 text-body-sm font-semibold leading-snug text-ink">
                  <Link className="underline-offset-4 hover:underline" href={`/faskes/temuan/${r.ref_id}`}>{r.finding_title}</Link>
                </p>
                <StatusPill tone={DISPUTE_LABEL[r.status].tone}>{DISPUTE_LABEL[r.status].label}</StatusPill>
              </div>
              <p className="-mt-1.5 text-caption text-muted">
                Diajukan {fmtDateTime(r.created_at)} <span className="ml-2" title="Nomor bantahan">No. <span className="font-mono">{r.id}</span></span>
              </p>
              <Quote by="Bantahan Anda">{r.text}</Quote>
              {r.response ? (
                <div className="rounded-control bg-subtle px-3.5 py-2.5 text-body-sm leading-relaxed text-ink-soft">
                  <p className="text-caption font-medium text-ink">Tanggapan reviewer, {fmtDateTime(r.resolved_at)}</p>
                  {r.response}
                </div>
              ) : (
                <p className="text-caption text-muted">Menunggu tanggapan reviewer.</p>
              )}
            </Card>
          ))
        )}
      </Section>

      {d.disputable.length > 0 && (
        <Section>
          <SectionTitle title="Ajukan bantahan baru" info="hakJawab" hint="Pilih temuan yang ingin dibantah." />
          <div className="panel-inset divide-y divide-line overflow-hidden">
            {d.disputable.slice(0, FIRST).map(row)}
            {d.disputable.length > FIRST && (
              <details className="group">
                <summary className="cursor-pointer select-none px-4 py-3 text-body-sm font-medium text-brand-ink hover:bg-subtle/70">
                  <span className="group-open:hidden">Tampilkan {d.disputable.length - FIRST} lainnya</span>
                  <span className="hidden group-open:inline">Sembunyikan</span>
                </summary>
                <div className="divide-y divide-line border-t border-line">{d.disputable.slice(FIRST).map(row)}</div>
              </details>
            )}
          </div>
          <p className="text-caption text-muted">Temuan yang bantahannya belum ditanggapi tidak dapat dibantah lagi.</p>
        </Section>
      )}
    </>
  );
}
