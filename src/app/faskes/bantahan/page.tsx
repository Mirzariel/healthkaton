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
        <p className="text-[14px] font-medium leading-snug text-ink">{f.title}</p>
        <p className="mt-0.5 text-[12.5px] text-muted"><span className="font-mono text-[12px]">{f.id}</span> &nbsp;Perawatan {fmtDate(f.admit_date)}</p>
      </div>
      <ProofBadge status={f.proof_status} />
    </Link>
  );
  return (
    <>
      <PageHeader title="Bantahan" purpose="Bantahan Anda dan tanggapan reviewer." />

      <Section>
        <SectionTitle title="Bantahan yang sudah diajukan" hint={d.rows.length ? `${d.rows.length} bantahan` : undefined} />
        {d.rows.length === 0 ? (
          <div className="panel-inset">
            <EmptyState title="Belum ada bantahan" icon={<IconScale size={18} />}>
              Ajukan dari halaman temuan.
            </EmptyState>
          </div>
        ) : (
          d.rows.map((r, idx) => (
            <Card key={r.id} elevated={idx === 0} className="space-y-3 px-5 py-4">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <span className="font-mono text-[12px] text-muted">{r.id}</span>
                <StatusPill tone={DISPUTE_LABEL[r.status].tone}>{DISPUTE_LABEL[r.status].label}</StatusPill>
                <span className="text-[12.5px] text-muted">{fmtDateTime(r.created_at)}</span>
              </div>
              <p className="text-[14px] font-semibold leading-snug text-ink">
                <Link className="underline-offset-4 hover:underline" href={`/faskes/temuan/${r.ref_id}`}>{r.finding_title}</Link>
              </p>
              <Quote by="Bantahan Anda">{r.text}</Quote>
              {r.response ? (
                <div className="rounded-lg border border-line bg-subtle/60 px-3.5 py-2.5 text-[14px] leading-relaxed text-ink-soft">
                  <p className="text-[12.5px] font-medium text-ink">Tanggapan reviewer, {fmtDateTime(r.resolved_at)}</p>
                  {r.response}
                </div>
              ) : (
                <p className="text-[13px] text-muted">Menunggu tanggapan reviewer.</p>
              )}
            </Card>
          ))
        )}
      </Section>

      {d.disputable.length > 0 && (
        <Section>
          <SectionTitle title="Ajukan bantahan baru" hint="Pilih temuan yang ingin dibantah." />
          <div className="panel-inset divide-y divide-line overflow-hidden">
            {d.disputable.slice(0, FIRST).map(row)}
            {d.disputable.length > FIRST && (
              <details className="group">
                <summary className="cursor-pointer select-none px-4 py-3 text-[13.5px] font-medium text-brand-ink hover:bg-subtle/70">
                  <span className="group-open:hidden">Tampilkan {d.disputable.length - FIRST} lainnya</span>
                  <span className="hidden group-open:inline">Sembunyikan</span>
                </summary>
                <div className="divide-y divide-line border-t border-line">{d.disputable.slice(FIRST).map(row)}</div>
              </details>
            )}
          </div>
          <p className="text-[12.5px] text-muted">Temuan yang bantahannya belum ditanggapi tidak dapat dibantah lagi.</p>
        </Section>
      )}
    </>
  );
}
