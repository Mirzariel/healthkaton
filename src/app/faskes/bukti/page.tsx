import Link from "next/link";
import { UploadBox } from "@/components/casework/UploadBox";
import { ClarificationItem, DocStatus, kb } from "@/components/faskes/parts";
import { IconUpload } from "@/components/icons";
import { Card, CardHeader, EmptyState, Forbidden, PageHeader, Section, SectionTitle, TableCard } from "@/components/ui";
import { can } from "@/lib/auth/principal";
import { facilityClarifications, facilityDocuments } from "@/lib/casework/queries";
import { nowIso } from "@/lib/clock";
import { fmtDateTime } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function FaskesEvidence() {
  const me = await getPrincipal("faskes");
  if (!can(me, "evidence.upload")) return <Forbidden need="evidence.upload" />;
  const db = getDb();
  const now = nowIso();
  const docs = facilityDocuments(db, me);
  const clar = facilityClarifications(db, me).filter((c) => c.status === "sent" || c.status === "lapsed");
  return (
    <>
      <PageHeader title="Dokumen bukti" purpose="Dokumen yang Anda unggah untuk menjawab klarifikasi." />

      <Section>
        {clar.length > 0 ? (
          <>
            <SectionTitle title="Unggah untuk permintaan" hint="Pilih permintaan, lalu lampirkan di halamannya." />
            <Card elevated className="divide-y divide-line overflow-hidden">
              {clar.map((c) => <ClarificationItem key={c.id} c={c} now={now} compact />)}
            </Card>
          </>
        ) : (
          <Card elevated>
            <CardHeader title="Unggah dokumen" hint="Tidak terkait permintaan tertentu." />
            <div className="px-5 py-4">
              <UploadBox endpoint="/api/faskes/upload" label="Pilih dokumen" />
            </div>
          </Card>
        )}
        <details className="text-caption text-muted">
          <summary className="cursor-pointer select-none font-medium text-brand-ink hover:underline">Cara dokumen dibaca</summary>
          <p className="mt-1 max-w-2xl leading-relaxed">PDF berteks dibaca otomatis. Pindaian dan gambar tidak dibaca mesin (tanpa OCR); petugas mentranskripsinya manual.</p>
        </details>
      </Section>

      <Section>
        <SectionTitle title="Dokumen terunggah" hint={docs.length ? `${docs.length} dokumen` : undefined} />
        {docs.length === 0 ? (
          <div className="panel-inset">
            <EmptyState title="Belum ada dokumen" icon={<IconUpload size={18} />} />
          </div>
        ) : (
          <TableCard label="Daftar dokumen bukti">
            <table className="table-stack w-full text-left text-body-sm">
              <thead>
                <tr>
                  <th className="px-4 py-2.5 font-medium">Dokumen</th>
                  <th className="px-4 py-2.5 font-medium">Untuk</th>
                  <th className="px-4 py-2.5 font-medium">Diunggah</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td className="px-4 py-3">
                      <a href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer" className="link break-all font-medium">{d.name}</a>
                      <p className="mt-0.5 text-caption text-muted">{kb(d.size)} <span className="ml-2" title="Nomor dokumen">No. <span className="font-mono">{d.id}</span></span></p>
                    </td>
                    <td data-label="Untuk" className="px-4 py-3">
                      {d.clarification_id ? <Link href={`/faskes/klarifikasi/${d.clarification_id}`} className="link" title="Nomor permintaan klarifikasi">Klarifikasi <span className="font-mono">{d.clarification_id}</span></Link> : <span className="text-muted">Tanpa permintaan</span>}
                    </td>
                    <td data-label="Diunggah" className="whitespace-nowrap px-4 py-3 text-ink-soft">{fmtDateTime(d.created_at)}</td>
                    <td data-label="Status" className="px-4 py-3"><DocStatus status={d.processing_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        )}
      </Section>
    </>
  );
}
