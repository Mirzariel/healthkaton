import Link from "next/link";
import { notFound } from "next/navigation";
import { PAY_EVENT_LABEL } from "@/components/console/Parts";
import { Card, EmptyState, Forbidden, PageHeader, Section, SectionTitle, SimNotice, SourceBadge, StatusPill } from "@/components/ui";
import { can } from "@/lib/auth/principal";
import { getDb } from "@/lib/db";
import { fmtDate, fmtDateTime, rupiah } from "@/lib/dates";
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
  const dates: [string, string | null][] = [["Diajukan", c.submitted_at], ["Berkas dinyatakan lengkap", c.complete_at], ["Tenggat", c.due_at], ["Dibayar", c.paid_at], ["Pending / dikembalikan", c.pending_at]];
  return (
    <>
      <PageHeader title={`Pembayaran ${c.claim_no}`} eyebrow="Dasbor pembayaran" crumbs={[{ label: "Dasbor pembayaran", href: "/console/payments" }, { label: c.claim_no }]} purpose={`${c.facility_name}${c.amount === null ? "" : `, nilai ${rupiah(c.amount)}`}`}>
        <StatusPill tone={k.tone}>{k.label}</StatusPill>
        <SourceBadge source={c.source} />
      </PageHeader>
      <SimNotice>{k.hint} {c.due_basis === "kebijakan" && policy ? `Tenggat dihitung dari parameter ${policy.status === "validated" ? "" : "DEMO (draft) "}${policy.id}, bukan ketentuan resmi.` : ""}</SimNotice>
      <div className="mt-8 grid gap-x-6 gap-y-10 lg:grid-cols-2">
        <Section className="mt-0">
          <SectionTitle title="Tanggal penting" />
          <Card>
            <dl className="divide-y divide-line text-body-sm">
              {dates.map(([l, v]) => (
                <div key={l} className="flex items-baseline justify-between gap-4 px-5 py-3"><dt className="text-ink-soft">{l}</dt><dd className="tabular-nums text-ink">{v ? fmtDate(v) : <span className="text-muted">tidak tercatat</span>}</dd></div>
              ))}
              {c.days_to_pay !== null && <div className="flex items-baseline justify-between gap-4 px-5 py-3"><dt className="text-ink-soft">Hari dari lengkap ke bayar</dt><dd className="tabular-nums text-ink">{c.days_to_pay}</dd></div>}
              {c.days_overdue !== null && c.days_overdue > 0 && <div className="flex items-baseline justify-between gap-4 px-5 py-3"><dt className="text-ink-soft">Hari lewat tenggat (menurut parameter)</dt><dd className="font-semibold tabular-nums text-ink">{c.days_overdue}</dd></div>}
            </dl>
          </Card>
          {pending && <p className="text-body-sm"><Link className="link" href={`/console/pending/${pending.id}`}>Lihat pemilahan pending</Link></p>}
        </Section>
        <Section className="mt-0">
          <SectionTitle title="Garis waktu status" hint="Urutan peristiwa dari sumber data, apa adanya." />
          {c.events.length === 0 ? <Card><EmptyState title="Tidak ada peristiwa dari sumber">Ketepatan bayar tidak dapat dinilai.</EmptyState></Card> : (
            <Card className="px-5 py-4">
              <ol className="relative space-y-4 border-l border-line-strong pl-5">
                {c.events.map((e, i) => (
                  <li key={i} className="relative">
                    <span aria-hidden className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-ink/60 ring-4 ring-card" />
                    <p className="text-body-sm text-ink"><span className="font-medium">{PAY_EVENT_LABEL[e.type] ?? e.type}</span>{e.reason ? <span className="text-ink-soft">, {e.reason}</span> : null}{e.amount ? <span className="tabular-nums text-ink-soft">, {rupiah(e.amount)}</span> : null}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-caption text-muted"><span className="tabular-nums">{fmtDateTime(e.at)}</span><SourceBadge source={e.source} /></p>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </Section>
      </div>
    </>
  );
}
