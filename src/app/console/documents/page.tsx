import Link from "next/link";
import { UploadForm } from "@/components/pkbi/EvidenceForms";
import { FilterField, FilterForm, RecordId, rowLink } from "@/components/console/Parts";
import { Card, EmptyState, Forbidden, PageHeader, Pill, SectionTitle, SimNotice, TableCard } from "@/components/ui";
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
      <PageHeader title="Dokumen bukti" eyebrow="Kerja" purpose="Unggah dokumen pendukung dan telaah teksnya." />
      <SimNotice>Teks hasil ekstraksi tetap berstatus <strong>usulan</strong> sampai dikonfirmasi peninjau.</SimNotice>
      {can(me, "evidence.upload") && (
        <section className="mt-8 space-y-3">
          <SectionTitle title="Unggah dokumen" hint={`PDF, PNG, atau JPEG, maks. ${MAX_UPLOAD_BYTES / 1048576} MB. Pindaian tanpa OCR perlu diketik manual.`} />
          <Card elevated className="p-5"><UploadForm episodes={episodes} fixedEpisode={episode && episodes.some((e) => e.value === episode) ? episode : undefined} /></Card>
        </section>
      )}
      <section className="mt-10 space-y-3">
        <SectionTitle title="Daftar dokumen" hint={`${docs.length} dokumen${waiting ? ` · ${waiting} menunggu tinjauan` : ""}${episode ? ` · episode ${episode}` : ""}`} />
        <FilterForm label="Filter dokumen" submit="Cari" resetHref={status || one(sp.q) ? (episode ? `/console/documents?episode=${episode}` : "/console/documents") : undefined}>
          {episode && <input type="hidden" name="episode" value={episode} />}
          <FilterField label="Status"><select name="status" defaultValue={status} className="field"><option value="">Semua status</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></FilterField>
          <FilterField label="Nama berkas"><input name="q" defaultValue={one(sp.q)} placeholder="Nama berkas" className="field" /></FilterField>
        </FilterForm>
        <TableCard label="Daftar dokumen">
          {docs.length === 0 ? <EmptyState title="Belum ada dokumen">Unggah dokumen di atas, atau ubah filter bila daftar ini disaring.</EmptyState> : (
            <table className="table-stack w-full text-left md:min-w-[28rem] text-body-sm">
              <caption className="sr-only">Daftar dokumen bukti</caption>
              <thead><tr><th className="px-4 py-2.5">Dokumen</th><th className="hidden px-4 py-2.5 md:table-cell">Episode</th><th className="hidden px-4 py-2.5 sm:table-cell">Status</th><th className="hidden px-4 py-2.5 text-right sm:table-cell">Usulan</th><th className="hidden px-4 py-2.5 lg:table-cell">Diunggah</th></tr></thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id} className="align-top">
                    <td className="px-4 py-3"><Link className={`${rowLink} break-words`} href={`/console/documents/${d.id}`}>{d.name}</Link><p className="mt-1 flex flex-wrap items-center gap-x-2 text-caption text-muted"><RecordId>{d.id}</RecordId><span>{(d.size / 1024).toFixed(0)} KB</span><span>{d.mime}</span></p></td>
                    <td data-label="Episode" className="hidden px-4 py-3 md:table-cell"><RecordId className="text-ink-soft">{d.episode_id ?? "-"}</RecordId></td>
                    <td data-label="Status" className="hidden px-4 py-3 sm:table-cell"><Pill className={TONE_CLASS[STATUS_LABEL[d.processing_status].tone]} title={STATUS_LABEL[d.processing_status].hint}>{STATUS_LABEL[d.processing_status].label}</Pill></td>
                    <td data-label="Usulan" className="hidden px-4 py-3 text-right tabular-nums sm:table-cell">{d.proposed}</td>
                    <td data-label="Diunggah" className="hidden whitespace-nowrap px-4 py-3 text-ink-soft lg:table-cell">{fmtDateTime(d.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TableCard>
      </section>
    </>
  );
}
