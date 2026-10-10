import Link from "next/link";
import { Quote, Tag } from "@/components/casework/parts";
import { Card, EmptyState, Forbidden, PageHeader, SectionTitle } from "@/components/ui";
import { can } from "@/lib/auth/principal";
import { DISPUTE_LABEL } from "@/lib/casework/labels";
import { facilityDisputes } from "@/lib/casework/queries";
import { fmtDateTime } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function FaskesDisputes() {
  const me = await getPrincipal("faskes");
  if (!can(me, "dispute.create")) return <Forbidden need="dispute.create" />;
  const d = facilityDisputes(getDb(), me);
  return (
    <>
      <PageHeader title="Bantahan" eyebrow="Portal faskes" purpose="Bantahan Anda atas temuan, dan tanggapan reviewer. Bantahan baru diajukan dari halaman temuan." />
      <div className="space-y-3">
        {d.rows.length === 0 && <Card><EmptyState title="Belum ada bantahan" /></Card>}
        {d.rows.map((r) => (
          <Card key={r.id} className="p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{r.id}</span><Tag t={DISPUTE_LABEL[r.status].tone}>{DISPUTE_LABEL[r.status].label}</Tag><span className="text-xs text-muted">{fmtDateTime(r.created_at)}</span></div>
            <p className="text-xs text-muted"><Link className="underline underline-offset-4" href={`/faskes/temuan/${r.ref_id}`}>{r.finding_title}</Link></p>
            <Quote by="Bantahan Anda">{r.text}</Quote>
            {r.response ? <p className="mt-2 text-ink-soft">Tanggapan ({fmtDateTime(r.resolved_at)}): {r.response}</p> : <p className="mt-2 text-xs text-muted">Menunggu tanggapan reviewer.</p>}
          </Card>
        ))}
      </div>
      {d.disputable.length > 0 && (
        <section className="mt-8 space-y-3">
          <SectionTitle title="Ajukan bantahan baru" hint="Pilih temuan." />
          <Card className="divide-y divide-line">{d.disputable.map((f) => <Link key={f.id} href={`/faskes/temuan/${f.id}`} className="block px-4 py-3 text-sm font-medium hover:bg-brand-soft/40">{f.title}</Link>)}</Card>
        </section>
      )}
    </>
  );
}
