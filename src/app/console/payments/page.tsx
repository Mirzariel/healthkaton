import Link from "next/link";
import { FilterChips, More } from "@/components/analytics/blocks";
import { MeterBar } from "@/components/analytics/charts";
import { IconDownload } from "@/components/icons";
import { EmptyState, Forbidden, PageHeader, Section, SectionTitle, SimNotice, SourceBadge, Stat, StatusPill, TableCard } from "@/components/ui";
import { can } from "@/lib/auth/principal";
import { getDb } from "@/lib/db";
import { fmtDate, rupiah } from "@/lib/dates";
import { PAY_CLASS_LABEL, getPaymentPolicy, listClaimPayments, summarizeByFacility, type PayClass } from "@/lib/payments/analysis";
import { getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";
type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const pct = (v: number | null) => (v === null ? null : `${(v * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`);

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await getPrincipal("konsol");
  if (!can(me, "payments.view")) return <Forbidden need="payments.view" />;
  const sp = await searchParams;
  const db = getDb();
  const policy = getPaymentPolicy(db);
  const all = listClaimPayments(db);
  const sums = summarizeByFacility(db, all).filter((s) => s.submitted > 0);
  const klass = one(sp.class) as PayClass;
  const fac = one(sp.facility);
  const shown = all.filter((r) => (!PAY_CLASS_LABEL[klass] || r.klass === klass) && (!fac || r.facility_id === fac));
  const rows = shown.slice(0, 100);
  const total = (k: PayClass) => all.filter((r) => r.klass === k).length;
  const qs = (extra: Record<string, string>) => new URLSearchParams({ ...(fac ? { facility: fac } : {}), ...(PAY_CLASS_LABEL[klass] ? { class: klass } : {}), ...extra }).toString();
  const facName = fac ? sums.find((s) => s.facility_id === fac)?.facility_name ?? fac : null;
  return (
    <>
      <PageHeader title="Dasbor pembayaran" eyebrow="Mutu dan keuangan" purpose="Pending di sisi faskes, ketepatan bayar di sisi pembayar; tidak dicampur.">
        <a className="no-print btn btn-secondary" href={`/api/payments/export?${qs({})}`}><IconDownload size={15} /> Unduh CSV</a>
      </PageHeader>
      <SimNotice>
        Tenggat resmi belum ditetapkan{policy ? <>: keterlambatan memakai parameter <strong>{policy.status === "validated" ? "tervalidasi" : "DEMO (draft)"}</strong> {policy.id} ({policy.params.due_days_after_complete} hari setelah berkas lengkap)</> : "; tanpa parameter kebijakan, ketepatan bayar tidak dinilai"}. Tanpa tanggal lengkap = “data belum cukup”. Halaman ini tidak mengubah pembayaran.
      </SimNotice>

      <section className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Ringkasan">
        <Stat label="Klaim diajukan" value={all.length} hint="Semua FKRTL/FKTP pada data" />
        <Stat label="Dibayar sebelum tenggat" value={total("on_time")} tone="ok" hint={`dari ${all.length} klaim; menurut parameter demo`} href="/console/payments?class=on_time" />
        <Stat label="Melewati tenggat (tanpa pending)" value={total("late_no_pending") + total("overdue_unpaid")} tone="danger" hint="dibayar lewat tenggat + belum dibayar lewat tenggat" href="/console/payments?class=late_no_pending" />
        <Stat label="Data belum cukup / sumber tidak ada" value={total("insufficient") + total("source_unavailable")} hint="tidak dinilai, tidak dihitung sebagai tepat atau telat" href="/console/payments?class=source_unavailable" />
      </section>

      <Section className="mt-10">
        <SectionTitle title="Cermin dua arah per faskes" hint={`Rasio hanya dihitung bila ≥ ${sums[0]?.min_judged ?? 10} klaim dapat dinilai.`} />
        <TableCard label="Cermin dua arah per faskes">
          <table className="w-full min-w-[48rem] text-left text-[13.5px]">
            <thead><tr><th className="px-4 py-2.5">Faskes</th><th className="px-4 py-2.5 text-right">Diajukan</th><th className="px-4 py-2.5">Pending (sisi faskes)</th><th className="px-4 py-2.5 text-right">Dinilai</th><th className="px-4 py-2.5">Tepat waktu</th><th className="px-4 py-2.5">Lewat tenggat (pembayar)</th><th className="px-4 py-2.5 text-right">Tdk dinilai</th><th className="px-4 py-2.5">Sumber</th></tr></thead>
            <tbody className="align-top">
              {sums.map((s) => (
                <tr key={s.facility_id}>
                  <td className="min-w-44 px-4 py-3"><Link className="font-medium text-brand-ink underline decoration-brand/30 underline-offset-3 hover:decoration-current" href={`/console/payments?facility=${s.facility_id}`}>{s.facility_name}</Link></td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.submitted}</td>
                  <td className="px-4 py-3 tabular-nums">{s.byClass.pending_open + s.byClass.delayed_by_pending}{pct(s.pending_share) ? ` (${pct(s.pending_share)})` : <span className="text-muted"> (rasio butuh ≥ 20 klaim)</span>}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.judged}</td>
                  <td className="min-w-32 px-4 py-3 tabular-nums">{s.enough ? <><span className="font-medium">{pct(s.on_time_share)}</span> <span className="text-[12.5px] text-muted">({s.byClass.on_time}/{s.judged})</span><MeterBar className="mt-1.5" value={s.on_time_share} /></> : <StatusPill tone="muted">Data belum cukup</StatusPill>}</td>
                  <td className="min-w-32 px-4 py-3 tabular-nums">{s.enough ? <><span className="font-medium">{pct(s.late_share)}</span> <span className="text-[12.5px] text-muted">({s.byClass.late_no_pending + s.byClass.overdue_unpaid}/{s.judged})</span><MeterBar className="mt-1.5" value={s.late_share} tone="warn" /></> : <StatusPill tone="muted">Data belum cukup</StatusPill>}{s.amount_overdue > 0 && <p className="mt-1 text-[12px] text-muted">Belum dibayar lewat tenggat: {rupiah(s.amount_overdue)}</p>}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.byClass.insufficient + s.byClass.source_unavailable}</td>
                  <td className="px-4 py-3">{s.source === "mixed" ? <StatusPill tone="muted">Campuran</StatusPill> : <SourceBadge source={s.source} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
        <More label="Cara menghitung “dinilai”">Dinilai = tepat waktu + lewat tenggat tanpa pending + tertunda karena pending + belum dibayar lewat tenggat. Klaim “tertunda karena pending” dihitung sebagai penyebut tetapi bukan keterlambatan pembayar.</More>
      </Section>

      <Section id="klaim" className="scroll-mt-24">
        <SectionTitle title="Daftar klaim" hint={`${shown.length} klaim${facName ? ` di ${facName}` : ""}${shown.length > rows.length ? `; ${rows.length} pertama ditampilkan, CSV memuat semuanya` : ""}.`}>
          {fac && <Link href={PAY_CLASS_LABEL[klass] ? `/console/payments?class=${klass}` : "/console/payments"} className="btn btn-ghost btn-sm no-print">Semua faskes</Link>}
        </SectionTitle>
        <FilterChips label="Filter klasifikasi" items={[
          { href: fac ? `/console/payments?facility=${fac}` : "/console/payments", label: "Semua", active: !PAY_CLASS_LABEL[klass] },
          ...(Object.keys(PAY_CLASS_LABEL) as PayClass[]).map((k) => ({ href: `/console/payments?${new URLSearchParams({ ...(fac ? { facility: fac } : {}), class: k })}`, label: PAY_CLASS_LABEL[k].label, count: all.filter((r) => r.klass === k && (!fac || r.facility_id === fac)).length, active: klass === k })),
        ]} />
        <TableCard label="Daftar klaim">
          {rows.length === 0 ? <EmptyState title="Tidak ada klaim sesuai filter">Pilih klasifikasi lain atau hapus filter faskes.</EmptyState> : (
            <table className="w-full min-w-[48rem] text-left text-[13.5px]">
              <thead><tr><th className="px-4 py-2.5">Klaim</th><th className="px-4 py-2.5">Faskes</th><th className="px-4 py-2.5">Diajukan</th><th className="px-4 py-2.5">Tenggat</th><th className="px-4 py-2.5">Dibayar</th><th className="px-4 py-2.5">Klasifikasi</th><th className="px-4 py-2.5">Sumber</th></tr></thead>
              <tbody className="align-top">
                {rows.map((r) => (
                  <tr key={r.claim_id}>
                    <td className="px-4 py-3"><Link className="whitespace-nowrap font-mono text-[12.5px] font-semibold text-brand-ink underline decoration-brand/30 underline-offset-3 hover:decoration-current" href={`/console/payments/${r.claim_id}`}>{r.claim_no}</Link></td>
                    <td className="min-w-44 px-4 py-3 text-ink-soft">{r.facility_name}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{fmtDate(r.submitted_at)}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{r.due_at ? <>{fmtDate(r.due_at)}<span className="block text-[12px] text-muted">{r.due_basis === "sumber" ? "dari sumber" : "parameter demo"}</span></> : "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{r.paid_at ? fmtDate(r.paid_at) : "-"}</td>
                    <td className="px-4 py-3"><StatusPill tone={PAY_CLASS_LABEL[r.klass].tone} title={PAY_CLASS_LABEL[r.klass].hint}>{PAY_CLASS_LABEL[r.klass].label}</StatusPill></td>
                    <td className="px-4 py-3"><SourceBadge source={r.source} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TableCard>
      </Section>
    </>
  );
}
