import Link from "next/link";
import { ApplyBox, ImportUpload } from "@/components/pkbi/ImportForms";
import { Card, EmptyState, Forbidden, PageHeader, Pill, SectionTitle, SimNotice } from "@/components/ui";
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
  return (
    <>
      <PageHeader title="Impor data" eyebrow="Kerja" purpose="Masukkan data klaim, layanan, status bayar, atau standar dari berkas. Selalu dimulai dengan pratinjau; tidak ada data yang berubah sebelum Anda menerapkannya." />
      <SimNotice>Data impor diberi label “Impor tervalidasi” dan tidak pernah menimpa data yang sudah ada: nomor klaim yang sama dengan isi identik dilewati, yang berbeda ditolak. Peserta ditulis sebagai pseudonim, bukan nama atau NIK. Maksimal 1 MB dan {MAX_IMPORT_ROWS} baris per berkas.</SimNotice>

      {job ? (
        <section className="mt-6 space-y-4">
          <SectionTitle title={`Pekerjaan ${job.id}`} hint={`${KIND_DEFS[job.kind].label} · ${job.file_name ?? "teks tempel"} · ${fmtDateTime(job.created_at)}`}>
            <Pill className={TONE_CLASS[STATUS[job.status].tone]}>{STATUS[job.status].label}</Pill>
          </SectionTitle>
          <div className="grid gap-3 sm:grid-cols-4">
            {([["Total baris", job.total_rows], ["Baru", job.summary.fresh], ["Duplikat", job.summary.duplicate], ["Bergalat", job.error_rows]] as const).map(([l, v]) => (
              <div key={l} className="rounded-xl border border-line bg-card p-4"><p className="text-xs text-ink-soft">{l}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{v}</p></div>
            ))}
          </div>
          {job.summary.duplicate_of && <p className="rounded-lg border border-line bg-warn-soft px-3 py-2 text-sm text-ink-soft">Isi yang sama persis sudah pernah diterapkan pada pekerjaan <Link className="underline" href={`/console/import?job=${job.summary.duplicate_of}`}>{job.summary.duplicate_of}</Link>. Menerapkan lagi tidak menambah data.</p>}
          {job.summary.fileErrors.length > 0 && <Card className="p-4 text-sm text-danger"><ul className="list-disc pl-5">{job.summary.fileErrors.map((e, i) => <li key={i}>{e.message}</li>)}</ul></Card>}
          {job.summary.warnings.length > 0 && <Card className="p-4 text-sm text-ink-soft"><ul className="list-disc pl-5">{job.summary.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></Card>}
          {job.status === "previewed" && <Card elevated className="p-4"><ApplyBox jobId={job.id} errors={job.error_rows} fresh={job.summary.fresh} /></Card>}
          {job.status === "applied" && job.summary.result && (
            <Card className="space-y-1 p-4 text-sm">
              <p className="font-semibold">Hasil penerapan{job.summary.result.partial ? ` (parsial: ${job.summary.result.skippedErrors} baris bergalat dilewati)` : ""}</p>
              <ul className="list-disc pl-5 text-ink-soft">{Object.entries(job.summary.result.inserted).map(([k, v]) => <li key={k}>{k}: {v}</li>)}{job.summary.result.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
              {job.summary.result.derived && <p className="text-xs text-muted">Turunan otomatis: {Object.entries(job.summary.result.derived).map(([k, v]) => `${k.replaceAll("_", " ")} ${v}`).join(" · ")}</p>}
            </Card>
          )}
          <Card className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted"><tr><th className="p-3">Baris</th><th className="p-3">Isi</th><th className="p-3">Hasil</th><th className="p-3">Catatan</th></tr></thead>
              <tbody className="divide-y divide-line">
                {job.summary.rows.map((r) => (
                  <tr key={r.line} className="align-top">
                    <td className="p-3 tabular-nums">{r.line}</td>
                    <td className="p-3 font-mono text-xs">{r.label}</td>
                    <td className="p-3"><Pill className={TONE_CLASS[OUT[r.outcome].tone]}>{OUT[r.outcome].label}</Pill></td>
                    <td className="p-3 text-ink-soft">{r.errors.map((e, i) => <p key={i} className="text-danger">{e.field ? `${e.field}: ` : ""}{e.message}</p>)}{r.note && <p>{r.note}</p>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {job.total_rows > job.summary.rows.length && <p className="p-3 text-xs text-muted">Menampilkan {job.summary.rows.length} dari {job.total_rows} baris.</p>}
          </Card>
        </section>
      ) : (
        <>
          {jobId && <p className="mt-4 text-sm text-danger">Pekerjaan {jobId} tidak ditemukan.</p>}
          <section className="mt-6 space-y-3">
            <SectionTitle title="Pratinjau impor baru" />
            <Card elevated className="p-4"><ImportUpload kinds={IMPORT_KINDS.map((k) => ({ value: k, label: KIND_DEFS[k].label, format: KIND_DEFS[k].format }))} /></Card>
          </section>
          <section className="mt-8 space-y-3">
            <SectionTitle title="Format dan templat" hint="Unduh templat berisi contoh. Urutan impor yang disarankan: episode dan klaim → layanan → status bayar." />
            <div className="grid gap-4 lg:grid-cols-2">
              {IMPORT_KINDS.map((k) => {
                const d = KIND_DEFS[k];
                return (
                  <Card key={k} className="space-y-2 p-4 text-sm">
                    <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{d.label}</h3><a className="text-xs font-semibold underline underline-offset-4" href={`/api/import/template/${k}`}>Unduh templat</a></div>
                    <p className="text-ink-soft">{d.description}</p>
                    <p className="text-xs text-muted">Duplikat: {d.dedupe}</p>
                    <details><summary className="cursor-pointer text-xs font-semibold">Kolom ({d.columns.length})</summary>
                      <ul className="mt-2 space-y-1 text-xs text-ink-soft">{d.columns.map((c) => <li key={c.name}><span className="font-mono">{c.name}</span>{c.required === true ? " *" : c.required === "kondisional" ? " (kondisional)" : ""}: {c.help}</li>)}</ul>
                      {d.notes.length > 0 && <ul className="mt-2 list-disc pl-4 text-xs text-muted">{d.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
                    </details>
                  </Card>
                );
              })}
            </div>
          </section>
          <section className="mt-8 space-y-3">
            <SectionTitle title="Riwayat impor" />
            <Card className="overflow-x-auto">
              {listJobs(db).length === 0 ? <EmptyState title="Belum ada impor" /> : (
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-muted"><tr><th className="p-3">Pekerjaan</th><th className="p-3">Jenis</th><th className="p-3">Baris</th><th className="p-3">Status</th><th className="p-3">Dibuat</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {listJobs(db).map((j) => (
                      <tr key={j.id}>
                        <td className="p-3"><Link className="font-mono text-xs underline underline-offset-4" href={`/console/import?job=${j.id}`}>{j.id}</Link><p className="text-xs text-muted">{j.file_name ?? "teks tempel"}</p></td>
                        <td className="p-3">{KIND_DEFS[j.kind].label}</td>
                        <td className="p-3 tabular-nums">{j.total_rows} ({j.valid_rows} valid, {j.error_rows} galat)</td>
                        <td className="p-3"><Pill className={TONE_CLASS[STATUS[j.status].tone]}>{STATUS[j.status].label}</Pill></td>
                        <td className="p-3 text-ink-soft">{fmtDateTime(j.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </section>
        </>
      )}
    </>
  );
}
