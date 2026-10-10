import Link from "next/link";
import { UploadForm } from "@/components/pkbi/EvidenceForms";
import { Card, EmptyState, Forbidden, PageHeader, Pill, SectionTitle, SimNotice } from "@/components/ui";
import { can } from "@/lib/auth/principal";
import { getDb } from "@/lib/db";
import { fmtDateTime } from "@/lib/dates";
import { STATUS_LABEL, listDocuments, type DocStatus } from "@/lib/evidence/service";
import { MAX_UPLOAD_BYTES } from "@/lib/evidence/validate";
import { TONE_CLASS } from "@/lib/labels";
import { getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";
type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await getPrincipal("konsol");
  if (!can(me, "evidence.upload") && !can(me, "evidence.review")) return <Forbidden need="evidence.upload" />;
  const sp = await searchParams;
  const db = getDb();
  const status = one(sp.status) as DocStatus;
  const episode = one(sp.episode);
  const docs = listDocuments(db, me, { episodeId: episode || undefined, status: status in STATUS_LABEL ? status : undefined, q: one(sp.q).slice(0, 40) || undefined });
  const episodes = (db.prepare("SELECT e.id, f.name FROM episodes e JOIN facilities f ON f.id = e.facility_id ORDER BY e.id LIMIT 300").all() as { id: string; name: string }[]).map((e) => ({ value: e.id, label: `${e.id} · ${e.name}` }));
  const waiting = docs.filter((d) => d.proposed > 0).length;
  return (
    <>
      <PageHeader title="Dokumen bukti" eyebrow="Kerja" purpose="Unggah dokumen pendukung klaim. PDF yang berlapis teks dibaca sungguhan; dokumen pindaian atau gambar membutuhkan transkripsi manual kecuali mesin OCR terpasang." />
      <SimNotice>Teks hasil ekstraksi atau ketikan selalu berstatus <strong>usulan</strong> sampai dikonfirmasi peninjau. SEHATI tidak membuat hasil OCR palsu: bila mesin OCR tidak ada, dokumen ditandai “perlu transkripsi manual”. Berkas yang diterima: PDF, PNG, JPEG, maks. {MAX_UPLOAD_BYTES / 1048576} MB; isi berkas diperiksa, bukan hanya ekstensinya.</SimNotice>
      {can(me, "evidence.upload") && (
        <section className="mt-6 space-y-3">
          <SectionTitle title="Unggah dokumen" />
          <Card elevated className="p-4"><UploadForm episodes={episodes} fixedEpisode={episode && episodes.some((e) => e.value === episode) ? episode : undefined} /></Card>
        </section>
      )}
      <section className="mt-8 space-y-3">
        <SectionTitle title="Daftar dokumen" hint={`${docs.length} dokumen${waiting ? ` · ${waiting} menunggu tinjauan` : ""}${episode ? ` · episode ${episode}` : ""}`} />
        <form method="get" className="no-print flex flex-wrap gap-2" aria-label="Filter dokumen">
          {episode && <input type="hidden" name="episode" value={episode} />}
          <select name="status" defaultValue={status} aria-label="Status" className="rounded-lg border border-line bg-card px-2 py-2 text-sm"><option value="">Semua status</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
          <input name="q" defaultValue={one(sp.q)} placeholder="Nama berkas" aria-label="Nama berkas" className="rounded-lg border border-line bg-card px-2 py-2 text-sm" />
          <button className="rounded-lg bg-brand px-3 text-sm font-semibold text-white">Cari</button>
        </form>
        <Card className="overflow-x-auto">
          {docs.length === 0 ? <EmptyState title="Belum ada dokumen" /> : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted"><tr><th className="p-3">Dokumen</th><th className="p-3">Episode</th><th className="p-3">Status</th><th className="p-3">Usulan</th><th className="p-3">Diunggah</th></tr></thead>
              <tbody className="divide-y divide-line">
                {docs.map((d) => (
                  <tr key={d.id} className="align-top">
                    <td className="p-3"><Link className="font-semibold underline-offset-4 hover:underline" href={`/console/documents/${d.id}`}>{d.name}</Link><p className="font-mono text-[11px] text-muted">{d.id} · {(d.size / 1024).toFixed(0)} KB · {d.mime}</p></td>
                    <td className="p-3 font-mono text-xs">{d.episode_id ?? "-"}</td>
                    <td className="p-3"><Pill className={TONE_CLASS[STATUS_LABEL[d.processing_status].tone]} title={STATUS_LABEL[d.processing_status].hint}>{STATUS_LABEL[d.processing_status].label}</Pill></td>
                    <td className="p-3 tabular-nums">{d.proposed}</td>
                    <td className="p-3 text-ink-soft">{fmtDateTime(d.created_at)}</td>
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
