import Link from "next/link";
import { Disclosure } from "@/components/analytics/blocks";
import { RecordId, rowLink } from "@/components/console/Parts";
import { ApplyBox, ImportUpload } from "@/components/pkbi/ImportForms";
import { IconDownload } from "@/components/icons";
import { Card, CardHeader, EmptyState, Forbidden, Notice, PageHeader, Pill, SectionTitle, SimNotice, Stat, StatGrid, TableCard } from "@/components/ui";
import { can } from "@/lib/auth/principal";
import { getDb } from "@/lib/db";
import { fmtDateTime } from "@/lib/dates";
import { IMPORT_KINDS, KIND_DEFS } from "@/lib/import/formats";
import { MAX_IMPORT_ROWS, getJob, listJobs } from "@/lib/import/service";
import { TONE_CLASS } from "@/lib/labels";
import { getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";
const STATUS = { previewed: { label: "Pratinjau (belum diterapkan)", tone: "warn" }, applied: { label: "Diterapkan", tone: "ok" }, failed: { label: "Gagal", tone: "danger" } } as const;
const OUT = { new: { label: "Baru", tone: "ok" }, duplicate: { label: "Duplikat (dilewati)", tone: "muted" }, error: { label: "Galat", tone: "danger" } } as const;

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ job?: string }> }) {
  const me = await getPrincipal("konsol");
  if (!can(me, "import.run")) return <Forbidden need="import.run" />;
  const { job: jobId } = await searchParams;
  const db = getDb();
  const job = jobId ? getJob(db, jobId) : null;
  const jobs = job ? [] : listJobs(db);
  return (
    <>
      <PageHeader title="Impor data" eyebrow="Kerja" purpose="Pratinjau dulu. Tidak ada yang berubah sebelum diterapkan.">
        {job && <Link href="/console/import" className="btn btn-secondary btn-sm">Impor baru</Link>}
      </PageHeader>
      <SimNotice>Data impor tidak menimpa data lama. Maks. 1 MB dan {MAX_IMPORT_ROWS} baris. <details className="mt-1"><summary className="cursor-pointer font-medium text-ink">Selengkapnya</summary><p className="mt-1">Data impor berlabel “Impor tervalidasi”. Nomor klaim sama dengan isi identik dilewati; yang berbeda ditolak. Peserta ditulis sebagai pseudonim, bukan nama atau NIK.</p></details></SimNotice>

      {job ? (
        <section className="mt-8 space-y-4" aria-label={`Pekerjaan ${job.id}`}>
          <SectionTitle title={<>Pekerjaan <RecordId className="text-body-sm text-ink">{job.id}</RecordId></>} hint={`${KIND_DEFS[job.kind].label} · ${job.file_name ?? "teks tempel"} · ${fmtDateTime(job.created_at)}`}>
            <Pill className={TONE_CLASS[STATUS[job.status].tone]}>{STATUS[job.status].label}</Pill>
          </SectionTitle>
          <StatGrid>
            <Stat label="Total baris" value={job.total_rows} />
            <Stat label="Baru" value={job.summary.fresh} tone={job.summary.fresh ? "ok" : "default"} />
            <Stat label="Duplikat" value={job.summary.duplicate} />
            <Stat label="Bergalat" value={job.error_rows} tone={job.error_rows ? "danger" : "default"} />
          </StatGrid>
          {job.summary.duplicate_of && <Notice tone="warn">Isi yang sama persis sudah pernah diterapkan pada pekerjaan <Link className="link" href={`/console/import?job=${job.summary.duplicate_of}`}>{job.summary.duplicate_of}</Link>. Menerapkan lagi tidak menambah data.</Notice>}
          {job.summary.fileErrors.length > 0 && <Notice tone="danger" title="Galat pada berkas"><ul className="mt-1 list-disc pl-4">{job.summary.fileErrors.map((e, i) => <li key={i}>{e.message}</li>)}</ul></Notice>}
          {job.summary.warnings.length > 0 && <Notice tone="warn" title="Peringatan"><ul className="mt-1 list-disc pl-4">{job.summary.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></Notice>}
          {job.status === "previewed" && <Card elevated><CardHeader title="Terapkan pratinjau" /><div className="p-5"><ApplyBox jobId={job.id} errors={job.error_rows} fresh={job.summary.fresh} /></div></Card>}
          {job.status === "applied" && job.summary.result && (
            <Card>
              <CardHeader title={`Hasil penerapan${job.summary.result.partial ? ` (parsial: ${job.summary.result.skippedErrors} baris bergalat dilewati)` : ""}`} />
              <div className="space-y-2 px-5 py-4 text-body-sm">
                <ul className="list-disc pl-5 text-ink-soft">{Object.entries(job.summary.result.inserted).map(([k, v]) => <li key={k}>{k}: <span className="tabular-nums">{v}</span></li>)}{job.summary.result.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
                {job.summary.result.derived && <p className="text-caption text-muted">Turunan otomatis: {Object.entries(job.summary.result.derived).map(([k, v]) => `${k.replaceAll("_", " ")} ${v}`).join(" · ")}</p>}
              </div>
            </Card>
          )}
          <TableCard label="Baris pratinjau">
            <table className="table-stack w-full text-left md:min-w-[32rem] text-body-sm">
              <caption className="sr-only">Baris pada berkas impor dan hasil pemeriksaannya</caption>
              <thead><tr><th className="px-4 py-2.5 text-right">Baris</th><th className="px-4 py-2.5">Isi</th><th className="px-4 py-2.5">Hasil</th><th className="px-4 py-2.5">Catatan</th></tr></thead>
              <tbody>
                {job.summary.rows.map((r) => (
                  <tr key={r.line} className="align-top">
                    <td className="px-4 py-3 text-right tabular-nums text-muted"><span className="md:hidden">Baris </span>{r.line}</td>
                    <td data-label="Isi" className="px-4 py-3 font-mono text-code">{r.label}</td>
                    <td data-label="Hasil" className="px-4 py-3"><Pill className={TONE_CLASS[OUT[r.outcome].tone]}>{OUT[r.outcome].label}</Pill></td>
                    <td data-label="Catatan" className="px-4 py-3 text-ink-soft">{r.errors.map((e, i) => <p key={i} className="text-danger">{e.field ? `${e.field}: ` : ""}{e.message}</p>)}{r.note && <p>{r.note}</p>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {job.total_rows > job.summary.rows.length && <p className="border-t border-line p-3 text-caption text-muted">Menampilkan {job.summary.rows.length} dari {job.total_rows} baris.</p>}
          </TableCard>
        </section>
      ) : (
        <>
          {jobId && <div className="mt-4"><Notice tone="danger">Pekerjaan {jobId} tidak ditemukan.</Notice></div>}
          <section className="mt-8 space-y-3">
            <SectionTitle title="Pratinjau impor baru" />
            <Card elevated className="p-5"><ImportUpload kinds={IMPORT_KINDS.map((k) => ({ value: k, label: KIND_DEFS[k].label, format: KIND_DEFS[k].format }))} /></Card>
          </section>
          <section className="mt-10 space-y-3">
            <SectionTitle title="Riwayat impor" />
            <TableCard label="Riwayat impor">
              {jobs.length === 0 ? <EmptyState title="Belum ada impor">Pratinjau pertama akan muncul di sini.</EmptyState> : (
                <table className="table-stack w-full text-left md:min-w-[30rem] text-body-sm">
                  <caption className="sr-only">Riwayat pekerjaan impor</caption>
                  <thead><tr><th className="px-4 py-2.5">Pekerjaan</th><th className="px-4 py-2.5">Jenis</th><th className="px-4 py-2.5 text-right">Baris</th><th className="px-4 py-2.5">Status</th><th className="hidden px-4 py-2.5 md:table-cell">Dibuat</th></tr></thead>
                  <tbody>
                    {jobs.map((j) => (
                      <tr key={j.id} className="align-top">
                        <td className="px-4 py-3"><Link className={`${rowLink} font-mono text-code`} href={`/console/import?job=${j.id}`}>{j.id}</Link><p className="mt-0.5 text-caption text-muted">{j.file_name ?? "teks tempel"}</p></td>
                        <td data-label="Jenis" className="px-4 py-3">{KIND_DEFS[j.kind].label}</td>
                        <td data-label="Baris" className="px-4 py-3 text-right tabular-nums">{j.total_rows}<p className="text-caption text-muted">{j.valid_rows} valid, {j.error_rows} galat</p></td>
                        <td data-label="Status" className="px-4 py-3"><Pill className={TONE_CLASS[STATUS[j.status].tone]}>{STATUS[j.status].label}</Pill></td>
                        <td data-label="Dibuat" className="hidden px-4 py-3 text-ink-soft md:table-cell">{fmtDateTime(j.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </TableCard>
          </section>
          <section className="mt-10">
            <Disclosure title="Format dan templat" meta={`${IMPORT_KINDS.length} jenis`}>
            <p className="mb-4 text-caption text-muted">Urutan disarankan: episode dan klaim, layanan, status bayar.</p>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {IMPORT_KINDS.map((k) => {
                const d = KIND_DEFS[k];
                return (
                  <Card key={k} className="flex flex-col">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-3.5">
                      <h3 className="text-body-sm font-semibold">{d.label}</h3>
                      <a className="btn btn-secondary btn-sm shrink-0" href={`/api/import/template/${k}`}><IconDownload size={14} />Unduh templat</a>
                    </div>
                    <div className="space-y-2 px-5 py-4 text-body-sm">
                      <p className="text-ink-soft">{d.description}</p>
                      <p className="text-caption text-muted">Duplikat: {d.dedupe}</p>
                      <details className="group/d pt-1">
                        <summary className="inline-flex cursor-pointer items-center gap-1.5 text-caption font-medium text-ink-soft underline decoration-line-strong underline-offset-4 hover:text-ink">Kolom ({d.columns.length})</summary>
                        <ul className="mt-2 space-y-1 text-caption text-ink-soft">{d.columns.map((c) => <li key={c.name}><span className="font-mono">{c.name}</span>{c.required === true ? " *" : c.required === "kondisional" ? " (kondisional)" : ""}: {c.help}</li>)}</ul>
                        {d.notes.length > 0 && <ul className="mt-2 list-disc pl-4 text-caption text-muted">{d.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
                      </details>
                    </div>
                  </Card>
                );
              })}
            </div>
            </Disclosure>
          </section>
        </>
      )}
    </>
  );
}
