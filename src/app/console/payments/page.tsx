import Link from "next/link";
import { Card, EmptyState, Forbidden, PageHeader, Pill, SectionTitle, SimNotice, SourceBadge, Stat } from "@/components/ui";
import { can } from "@/lib/auth/principal";
import { getDb } from "@/lib/db";
import { fmtDate, rupiah } from "@/lib/dates";
import { TONE_CLASS } from "@/lib/labels";
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
  return (
    <>
      <PageHeader title="Dasbor pembayaran" eyebrow="Mutu dan keuangan" purpose="Dua sisi dalam satu layar: berkas dan pending di sisi faskes, ketepatan bayar di sisi pembayar. Keduanya tidak dicampur.">
        <a className="no-print rounded-lg border border-line bg-card px-3 py-1.5 text-sm font-semibold hover:border-ink/40" href={`/api/payments/export?${qs({})}`}>Unduh CSV</a>
      </PageHeader>
      <SimNotice>
        Tenggat bayar resmi belum ditetapkan{policy ? <>: angka keterlambatan memakai parameter <strong>{policy.status === "validated" ? "tervalidasi" : "DEMO (draft)"}</strong> {policy.id}: tenggat {policy.params.due_days_after_complete} hari setelah berkas dinyatakan lengkap</> : ", dan tidak ada parameter kebijakan sehingga ketepatan bayar tidak dinilai"}. Keterlambatan pembayar tidak pernah disimpulkan dari tanggal pengajuan; klaim tanpa tanggal berkas lengkap tercatat “data belum cukup”. Tidak ada tindakan di halaman ini yang mengubah pembayaran.
      </SimNotice>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Klaim diajukan" value={all.length} hint="Semua FKRTL/FKTP pada data" />
        <Stat label="Dibayar sebelum tenggat" value={total("on_time")} tone="ok" hint={`dari ${all.length} klaim · menurut parameter demo`} href="/console/payments?class=on_time" />
        <Stat label="Melewati tenggat (tanpa pending)" value={total("late_no_pending") + total("overdue_unpaid")} tone="danger" hint="dibayar lewat tenggat + belum dibayar lewat tenggat" href="/console/payments?class=late_no_pending" />
        <Stat label="Data belum cukup / sumber tidak ada" value={total("insufficient") + total("source_unavailable")} hint="tidak dinilai, tidak dihitung sebagai tepat atau telat" href="/console/payments?class=source_unavailable" />
      </section>

      <section className="mt-8 space-y-3">
        <SectionTitle title="Cermin dua arah per faskes" hint={`Sisi faskes: pending. Sisi pembayar: ketepatan bayar. Rasio hanya dihitung bila ≥ ${sums[0]?.min_judged ?? 10} klaim dapat dinilai.`} />
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted"><tr><th className="p-3">Faskes</th><th className="p-3">Diajukan</th><th className="p-3">Pending / dikembalikan (sisi faskes)</th><th className="p-3">Dinilai</th><th className="p-3">Tepat waktu</th><th className="p-3">Lewat tenggat (sisi pembayar)</th><th className="p-3">Tdk dinilai</th><th className="p-3">Sumber</th></tr></thead>
            <tbody className="divide-y divide-line">
              {sums.map((s) => (
                <tr key={s.facility_id} className="align-top">
                  <td className="p-3"><Link className="font-medium underline-offset-4 hover:underline" href={`/console/payments?facility=${s.facility_id}`}>{s.facility_name}</Link></td>
                  <td className="p-3 tabular-nums">{s.submitted}</td>
                  <td className="p-3 tabular-nums">{s.byClass.pending_open + s.byClass.delayed_by_pending}{pct(s.pending_share) ? ` (${pct(s.pending_share)})` : <span className="text-muted"> (rasio butuh ≥ 20 klaim)</span>}</td>
                  <td className="p-3 tabular-nums">{s.judged}</td>
                  <td className="p-3 tabular-nums">{s.enough ? `${pct(s.on_time_share)} (${s.byClass.on_time}/${s.judged})` : <Pill className={TONE_CLASS.muted}>Data belum cukup</Pill>}</td>
                  <td className="p-3 tabular-nums">{s.enough ? `${pct(s.late_share)} (${s.byClass.late_no_pending + s.byClass.overdue_unpaid}/${s.judged})` : <Pill className={TONE_CLASS.muted}>Data belum cukup</Pill>}{s.amount_overdue > 0 && <p className="text-xs text-muted">Belum dibayar lewat tenggat: {rupiah(s.amount_overdue)}</p>}</td>
                  <td className="p-3 tabular-nums">{s.byClass.insufficient + s.byClass.source_unavailable}</td>
                  <td className="p-3">{s.source === "mixed" ? <Pill className={TONE_CLASS.muted}>Campuran</Pill> : <SourceBadge source={s.source} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <p className="text-xs text-muted">Dinilai = tepat waktu + lewat tenggat tanpa pending + tertunda karena pending + belum dibayar lewat tenggat. Klaim “tertunda karena pending” dihitung sebagai penyebut tetapi bukan keterlambatan pembayar.</p>
      </section>

      <section className="mt-8 space-y-3">
        <SectionTitle title="Daftar klaim" hint={`${shown.length} klaim${shown.length > rows.length ? `, ${rows.length} pertama ditampilkan. Gunakan Unduh CSV untuk semuanya` : ""}.`} />
        <nav className="no-print flex flex-wrap gap-2 text-sm" aria-label="Filter klasifikasi">
          <Link className={`rounded-lg border px-3 py-1 ${!PAY_CLASS_LABEL[klass] ? "border-ink font-semibold" : "border-line text-ink-soft"}`} href={fac ? `/console/payments?facility=${fac}` : "/console/payments"}>Semua</Link>
          {(Object.keys(PAY_CLASS_LABEL) as PayClass[]).map((k) => <Link key={k} className={`rounded-lg border px-3 py-1 ${klass === k ? "border-ink font-semibold" : "border-line text-ink-soft"}`} href={`/console/payments?${new URLSearchParams({ ...(fac ? { facility: fac } : {}), class: k })}`}>{PAY_CLASS_LABEL[k].label} ({all.filter((r) => r.klass === k && (!fac || r.facility_id === fac)).length})</Link>)}
        </nav>
        <Card className="overflow-x-auto">
          {rows.length === 0 ? <EmptyState title="Tidak ada klaim sesuai filter" /> : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted"><tr><th className="p-3">Klaim</th><th className="p-3">Faskes</th><th className="p-3">Diajukan</th><th className="p-3">Tenggat</th><th className="p-3">Dibayar</th><th className="p-3">Klasifikasi</th><th className="p-3">Sumber</th></tr></thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.claim_id}>
                    <td className="p-3"><Link className="font-semibold underline-offset-4 hover:underline" href={`/console/payments/${r.claim_id}`}>{r.claim_no}</Link></td>
                    <td className="p-3 text-ink-soft">{r.facility_name}</td>
                    <td className="p-3 tabular-nums">{fmtDate(r.submitted_at)}</td>
                    <td className="p-3 tabular-nums">{r.due_at ? <>{fmtDate(r.due_at)}<span className="block text-xs text-muted">{r.due_basis === "sumber" ? "dari sumber" : "parameter demo"}</span></> : "-"}</td>
                    <td className="p-3 tabular-nums">{r.paid_at ? fmtDate(r.paid_at) : "-"}</td>
                    <td className="p-3"><Pill className={TONE_CLASS[PAY_CLASS_LABEL[r.klass].tone]} title={PAY_CLASS_LABEL[r.klass].hint}>{PAY_CLASS_LABEL[r.klass].label}</Pill></td>
                    <td className="p-3"><SourceBadge source={r.source} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>
    </>
  );
}
