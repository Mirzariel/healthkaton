import Link from "next/link";
import { FilterField, FilterForm, RecordId, reasonLabel, rowLink } from "@/components/console/Parts";
import { SyncPendingButton } from "@/components/pkbi/PendingForms";
import { EmptyState, Forbidden, PageHeader, Pill, SectionTitle, SimNotice, SourceBadge, Stat, TableCard } from "@/components/ui";
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
  const filtered = !!(filter.category || filter.status || filter.facilityId || filter.owner || filter.minAgeDays || filter.q);

  return (
    <>
      <PageHeader title="Pemilahan pending" eyebrow="Kerja" purpose="Klaim ditunda pembayar, dipilah menurut siapa yang perlu bertindak.">
        {canManage && <SyncPendingButton />}
      </PageHeader>
      <SimNotice>{PENDING_NOTE} Kode alasan dari data status pembayaran sintetis.</SimNotice>

      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Ringkasan">
        <Stat label="Baris pemilahan" value={stats.total} hint={`dari ${stats.byFacility.reduce((a, f) => a + f.submitted, 0)} klaim diajukan`} />
        <Stat label="Menunggu faskes" value={stats.byStatus.open} tone={stats.byStatus.open ? "warn" : "default"} hint="belum ada jawaban" href="/console/pending?status=open#daftar" />
        <Stat label="Umur rata-rata (aktif)" value={stats.avgAgeDays === null ? "-" : `${stats.avgAgeDays.toLocaleString("id-ID")} hari`} hint={stats.oldestDays === null ? "Tidak ada yang aktif" : `Terlama ${stats.oldestDays} hari; hanya baris aktif`} />
        <Stat label="Sudah dijawab faskes" value={`${stats.responseRate.responded}/${stats.responseRate.total}`} hint="baris dengan jawaban / semua baris" />
      </section>

      <section className="mt-10 space-y-3">
        <SectionTitle title="Per kategori penanganan" hint="Cara menangani, bukan penyebab final." />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {PENDING_CATEGORIES.map((c) => (
            <Stat key={c} label={PENDING_LABEL[c]} value={stats.byCategory[c]} hint={`Pelaksana awal: ${c === "needs_review" ? "Verifikator" : "Faskes"}`} href={`/console/pending?category=${c}#daftar`} />
          ))}
        </div>
      </section>

      <section className="mt-10 space-y-3">
        <SectionTitle title="Per faskes" hint="Rasio hanya tampil bila ≥20 klaim diajukan. Pending tinggi bukan pernyataan fraud." />
        <TableCard label="Pending per faskes">
          <table className="w-full min-w-[32rem] text-left text-[13.5px]">
            <caption className="sr-only">Baris pending, klaim diajukan, dan rasio per faskes</caption>
            <thead><tr><th className="px-4 py-2.5">Faskes</th><th className="px-4 py-2.5 text-right">Baris pending</th><th className="px-4 py-2.5 text-right">Menunggu faskes</th><th className="px-4 py-2.5 text-right">Klaim diajukan</th><th className="px-4 py-2.5 text-right">Rasio</th></tr></thead>
            <tbody>
              {facilities.map((f) => (
                <tr key={f.facility_id}>
                  <td className="px-4 py-3"><Link className={rowLink} href={`/console/pending?facility=${f.facility_id}#daftar`}>{f.facility_name}</Link></td>
                  <td className="px-4 py-3 text-right tabular-nums">{f.total}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{f.open}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{f.submitted}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{f.rate === null ? <Pill className={TONE_CLASS.muted} title="Klaim diajukan kurang dari 20">Data belum cukup</Pill> : `${(f.rate * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}% (${f.total}/${f.submitted})`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      </section>

      <section id="daftar" className="mt-10 scroll-mt-20 space-y-3">
        <SectionTitle title="Daftar pending" hint={`${rows.length} baris sesuai filter`}>
          <SourceBadge source="simulated" />
        </SectionTitle>
        <FilterForm label="Filter pending" submit="Cari" resetHref={filtered ? "/console/pending#daftar" : undefined}>
          <FilterField label="Kategori"><select name="category" defaultValue={filter.category ?? ""} className="field"><option value="">Semua kategori</option>{PENDING_CATEGORIES.map((c) => <option key={c} value={c}>{PENDING_LABEL[c]}</option>)}</select></FilterField>
          <FilterField label="Status"><select name="status" defaultValue={filter.status ?? ""} className="field"><option value="">Semua status</option>{Object.entries(PENDING_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></FilterField>
          <FilterField label="Faskes"><select name="facility" defaultValue={filter.facilityId ?? ""} className="field"><option value="">Semua faskes</option>{stats.byFacility.map((f) => <option key={f.facility_id} value={f.facility_id}>{f.facility_name}</option>)}</select></FilterField>
          <FilterField label="Pelaksana"><select name="owner" defaultValue={filter.owner ?? ""} className="field"><option value="">Semua pelaksana</option>{Object.entries(OWNER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></FilterField>
          <FilterField label="Umur"><select name="age" defaultValue={String(age || 0)} className="field">{AGE_BUCKETS.map((b) => <option key={b.key} value={b.min}>{b.label}</option>)}</select></FilterField>
          <FilterField label="Nomor klaim" span="col-span-2"><input name="q" defaultValue={filter.q ?? ""} placeholder="No. klaim" className="field" /></FilterField>
        </FilterForm>
        <TableCard label="Daftar pending">
          {rows.length === 0 ? <EmptyState title="Tidak ada baris yang sesuai">Ubah filter, atau sinkronkan bila data status pembayaran baru masuk.</EmptyState> : (
            <table className="w-full min-w-[34rem] text-left text-[13.5px]">
              <caption className="sr-only">Daftar klaim pending</caption>
              <thead><tr><th className="px-4 py-2.5">Klaim</th><th className="hidden px-4 py-2.5 md:table-cell">Faskes</th><th className="px-4 py-2.5">Kategori</th><th className="hidden px-4 py-2.5 lg:table-cell">Pelaksana</th><th className="px-4 py-2.5 text-right">Umur</th><th className="px-4 py-2.5">Status</th><th className="hidden px-4 py-2.5 text-right md:table-cell">Nilai</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const s = PENDING_STATUS_LABEL[r.status];
                  return (
                    <tr key={r.id} className="align-top">
                      <td className="px-4 py-3"><Link className={`${rowLink} font-mono text-[12.5px]`} href={`/console/pending/${r.id}`}>{r.claim_no}</Link><p className="mt-0.5 text-[12px] text-muted"><RecordId>{r.id}</RecordId> · <span title={r.reason_code}>{reasonLabel(r.reason_code)}</span></p><p className="mt-0.5 text-[12px] text-muted md:hidden">{r.facility_name}</p></td>
                      <td className="hidden px-4 py-3 text-ink-soft md:table-cell">{r.facility_name}</td>
                      <td className="px-4 py-3">{PENDING_LABEL[r.category]}{r.open_disputes > 0 && <Pill className={`ml-1.5 ${TONE_CLASS.warn}`}>Bantahan</Pill>}</td>
                      <td className="hidden px-4 py-3 text-ink-soft lg:table-cell">{r.owner_role ? OWNER_LABEL[r.owner_role] ?? r.owner_role : "-"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{r.age_days} hari</td>
                      <td className="px-4 py-3"><Pill className={TONE_CLASS[s.tone]}>{s.label}</Pill></td>
                      <td className="hidden whitespace-nowrap px-4 py-3 text-right tabular-nums md:table-cell">{r.amount === null ? "-" : rupiah(r.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </TableCard>
      </section>
    </>
  );
}
