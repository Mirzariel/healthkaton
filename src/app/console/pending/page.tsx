import Link from "next/link";
import { SyncPendingButton } from "@/components/pkbi/PendingForms";
import { Card, EmptyState, Forbidden, PageHeader, Pill, SectionTitle, SimNotice, SourceBadge, Stat } from "@/components/ui";
import { can } from "@/lib/auth/principal";
import { getDb } from "@/lib/db";
import { rupiah } from "@/lib/dates";
import { PENDING_LABEL, TONE_CLASS } from "@/lib/labels";
import { AGE_BUCKETS, OWNER_LABEL, PENDING_CATEGORIES, PENDING_NOTE, PENDING_STATUS_LABEL, listPending, pendingStats, type PendingCategory, type PendingFilter, type PendingStatus } from "@/lib/pending/triage";
import { getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function PendingPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await getPrincipal("konsol");
  if (!can(me, "case.view")) return <Forbidden need="case.view" />;
  const sp = await searchParams;
  const db = getDb();
  const filter: PendingFilter = {};
  const cat = one(sp.category) as PendingCategory;
  if (PENDING_CATEGORIES.includes(cat)) filter.category = cat;
  const st = one(sp.status) as PendingStatus;
  if (st in PENDING_STATUS_LABEL) filter.status = st;
  if (one(sp.facility)) filter.facilityId = one(sp.facility);
  if (one(sp.owner)) filter.owner = one(sp.owner);
  const age = Number(one(sp.age) || 0);
  if (age > 0) filter.minAgeDays = age;
  if (one(sp.q)) filter.q = one(sp.q).slice(0, 40);

  const rows = listPending(db, filter);
  const stats = pendingStats(db);
  const facilities = stats.byFacility.filter((f) => f.total > 0 || f.submitted > 0);
  const canManage = can(me, "pending.manage");

  return (
    <>
      <PageHeader title="Pemilahan pending" eyebrow="Kerja" purpose="Klaim yang ditunda pembayar dipilah menurut cara penanganannya: siapa yang perlu berbuat apa, dan sudah berapa lama menunggu.">
        {canManage && <SyncPendingButton />}
      </PageHeader>
      <SimNotice>{PENDING_NOTE} Kode alasan berasal dari data status pembayaran; data pada lingkungan ini sintetis.</SimNotice>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Baris pemilahan" value={stats.total} hint={`dari ${stats.byFacility.reduce((a, f) => a + f.submitted, 0)} klaim diajukan (semua FKRTL)`} />
        <Stat label="Menunggu faskes" value={stats.byStatus.open} tone={stats.byStatus.open ? "warn" : "default"} hint="belum ada jawaban" />
        <Stat label="Umur rata-rata (aktif)" value={stats.avgAgeDays === null ? "-" : `${stats.avgAgeDays} hari`} hint={stats.oldestDays === null ? "Tidak ada yang aktif" : `Terlama ${stats.oldestDays} hari · hanya baris open/dijawab`} />
        <Stat label="Sudah dijawab faskes" value={`${stats.responseRate.responded}/${stats.responseRate.total}`} hint="baris dengan jawaban / semua baris" />
      </section>

      <section className="mt-8 space-y-3">
        <SectionTitle title="Per kategori penanganan" hint="Kategori adalah cara menangani, bukan penyebab final." />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PENDING_CATEGORIES.map((c) => (
            <Link key={c} href={`/console/pending?category=${c}`} className="rounded-xl border border-line bg-card p-4 transition-colors hover:border-ink/30">
              <p className="text-xs font-medium text-ink-soft">{PENDING_LABEL[c]}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{stats.byCategory[c]}</p>
              <p className="mt-1 text-xs text-muted">Pelaksana awal: {c === "needs_review" ? "Verifikator" : "Faskes"}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8 space-y-3">
        <SectionTitle title="Per faskes" hint="Angka mentah dan penyebutnya. Rasio hanya ditampilkan bila faskes mengajukan sedikitnya 20 klaim. Pending tinggi bukan pernyataan fraud." />
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted"><tr><th className="p-3">Faskes</th><th className="p-3">Baris pending</th><th className="p-3">Menunggu faskes</th><th className="p-3">Klaim diajukan</th><th className="p-3">Rasio</th></tr></thead>
            <tbody className="divide-y divide-line">
              {facilities.map((f) => (
                <tr key={f.facility_id}>
                  <td className="p-3"><Link className="font-medium underline-offset-4 hover:underline" href={`/console/pending?facility=${f.facility_id}`}>{f.facility_name}</Link></td>
                  <td className="p-3 tabular-nums">{f.total}</td>
                  <td className="p-3 tabular-nums">{f.open}</td>
                  <td className="p-3 tabular-nums">{f.submitted}</td>
                  <td className="p-3 tabular-nums">{f.rate === null ? <Pill className={TONE_CLASS.muted} title="Klaim diajukan kurang dari 20">Data belum cukup</Pill> : `${(f.rate * 100).toFixed(1)}% (${f.total}/${f.submitted})`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="mt-8 space-y-3">
        <SectionTitle title="Daftar pending" hint={`${rows.length} baris sesuai filter`}>
          <SourceBadge source="simulated" />
        </SectionTitle>
        <form method="get" className="no-print grid gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="Filter pending">
          <select name="category" defaultValue={filter.category ?? ""} aria-label="Kategori" className="rounded-lg border border-line bg-card px-2 py-2 text-sm"><option value="">Semua kategori</option>{PENDING_CATEGORIES.map((c) => <option key={c} value={c}>{PENDING_LABEL[c]}</option>)}</select>
          <select name="status" defaultValue={filter.status ?? ""} aria-label="Status" className="rounded-lg border border-line bg-card px-2 py-2 text-sm"><option value="">Semua status</option>{Object.entries(PENDING_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
          <select name="facility" defaultValue={filter.facilityId ?? ""} aria-label="Faskes" className="rounded-lg border border-line bg-card px-2 py-2 text-sm"><option value="">Semua faskes</option>{stats.byFacility.map((f) => <option key={f.facility_id} value={f.facility_id}>{f.facility_name}</option>)}</select>
          <select name="owner" defaultValue={filter.owner ?? ""} aria-label="Pelaksana" className="rounded-lg border border-line bg-card px-2 py-2 text-sm"><option value="">Semua pelaksana</option>{Object.entries(OWNER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select name="age" defaultValue={String(age || 0)} aria-label="Umur" className="rounded-lg border border-line bg-card px-2 py-2 text-sm">{AGE_BUCKETS.map((b) => <option key={b.key} value={b.min}>{b.label}</option>)}</select>
          <div className="flex gap-2"><input name="q" defaultValue={filter.q ?? ""} placeholder="No. klaim" aria-label="Nomor klaim" className="min-w-0 flex-1 rounded-lg border border-line bg-card px-2 py-2 text-sm" /><button className="rounded-lg bg-brand px-3 text-sm font-semibold text-white">Cari</button></div>
        </form>
        <Card className="overflow-x-auto">
          {rows.length === 0 ? <EmptyState title="Tidak ada baris yang sesuai">Ubah filter, atau sinkronkan bila data status pembayaran baru masuk.</EmptyState> : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted"><tr><th className="p-3">Klaim</th><th className="p-3">Faskes</th><th className="p-3">Kategori</th><th className="p-3">Pelaksana</th><th className="p-3">Umur</th><th className="p-3">Status</th><th className="p-3 text-right">Nilai</th></tr></thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => {
                  const s = PENDING_STATUS_LABEL[r.status];
                  return (
                    <tr key={r.id} className="align-top">
                      <td className="p-3"><Link className="font-semibold underline-offset-4 hover:underline" href={`/console/pending/${r.id}`}>{r.claim_no}</Link><p className="font-mono text-[11px] text-muted">{r.id} · {r.reason_code}</p></td>
                      <td className="p-3 text-ink-soft">{r.facility_name}</td>
                      <td className="p-3">{PENDING_LABEL[r.category]}{r.open_disputes > 0 && <Pill className={`ml-1 ${TONE_CLASS.warn}`}>Bantahan</Pill>}</td>
                      <td className="p-3 text-ink-soft">{r.owner_role ? OWNER_LABEL[r.owner_role] ?? r.owner_role : "-"}</td>
                      <td className="p-3 tabular-nums">{r.age_days} hari</td>
                      <td className="p-3"><Pill className={TONE_CLASS[s.tone]}>{s.label}</Pill></td>
                      <td className="p-3 text-right tabular-nums">{r.amount === null ? "-" : rupiah(r.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </section>
    </>
  );
}
