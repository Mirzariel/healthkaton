import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Forbidden, PageHeader, Pill, SectionTitle, SimNotice, SourceBadge } from "@/components/ui";
import { can } from "@/lib/auth/principal";
import { getDb } from "@/lib/db";
import { fmtDate, fmtDateTime, rupiah } from "@/lib/dates";
import { TONE_CLASS } from "@/lib/labels";
import { PAY_CLASS_LABEL, getPaymentPolicy, listClaimPayments } from "@/lib/payments/analysis";
import { getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function PaymentDetail({ params }: { params: Promise<{ claimId: string }> }) {
  const me = await getPrincipal("konsol");
  if (!can(me, "payments.view")) return <Forbidden need="payments.view" />;
  const { claimId } = await params;
  const db = getDb();
  const c = listClaimPayments(db).find((r) => r.claim_id === decodeURIComponent(claimId));
  if (!c) notFound();
  const policy = getPaymentPolicy(db);
  const k = PAY_CLASS_LABEL[c.klass];
  const pending = db.prepare("SELECT id FROM pending_triage WHERE claim_id = ?").get(c.claim_id) as { id: string } | undefined;
  return (
    <>
      <PageHeader title={`Pembayaran ${c.claim_no}`} eyebrow="Dasbor pembayaran" crumbs={[{ label: "Dasbor pembayaran", href: "/console/payments" }, { label: c.claim_no }]} purpose={`${c.facility_name}${c.amount === null ? "" : ` · nilai ${rupiah(c.amount)}`}`}>
        <div className="flex gap-2"><Pill className={TONE_CLASS[k.tone]}>{k.label}</Pill><SourceBadge source={c.source} /></div>
      </PageHeader>
      <SimNotice>{k.hint} {c.due_basis === "kebijakan" && policy ? `Tenggat dihitung dari parameter ${policy.status === "validated" ? "" : "DEMO (draft) "}${policy.id}, bukan ketentuan resmi.` : ""}</SimNotice>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <SectionTitle title="Tanggal penting" />
          <Card className="divide-y divide-line text-sm">
            {([["Diajukan", c.submitted_at], ["Berkas dinyatakan lengkap", c.complete_at], ["Tenggat", c.due_at], ["Dibayar", c.paid_at], ["Pending / dikembalikan", c.pending_at]] as const).map(([l, v]) => (
              <p key={l} className="flex justify-between gap-3 p-3"><span className="text-ink-soft">{l}</span><span className="tabular-nums">{v ? fmtDate(v) : <span className="text-muted">tidak tercatat</span>}</span></p>
            ))}
            {c.days_to_pay !== null && <p className="flex justify-between p-3"><span className="text-ink-soft">Hari dari lengkap ke bayar</span><span className="tabular-nums">{c.days_to_pay}</span></p>}
            {c.days_overdue !== null && c.days_overdue > 0 && <p className="flex justify-between p-3"><span className="text-ink-soft">Hari lewat tenggat (menurut parameter)</span><span className="tabular-nums">{c.days_overdue}</span></p>}
          </Card>
          {pending && <p className="text-sm"><Link className="underline underline-offset-4" href={`/console/pending/${pending.id}`}>Lihat pemilahan pending</Link></p>}
        </section>
        <section className="space-y-3">
          <SectionTitle title="Garis waktu status" hint="Urutan peristiwa dari sumber data, apa adanya." />
          <Card className="divide-y divide-line text-sm">
            {c.events.length === 0 ? <p className="p-3 text-ink-soft">Tidak ada peristiwa dari sumber. Ketepatan bayar tidak dapat dinilai.</p> : c.events.map((e, i) => (
              <div key={i} className="flex items-center justify-between gap-3 p-3"><span><span className="font-medium">{e.type}</span>{e.reason ? <span className="text-ink-soft"> · {e.reason}</span> : null}{e.amount ? <span className="text-ink-soft"> · {rupiah(e.amount)}</span> : null}</span><span className="flex items-center gap-2 text-muted">{fmtDateTime(e.at)}<SourceBadge source={e.source} /></span></div>
            ))}
          </Card>
        </section>
      </div>
    </>
  );
}
