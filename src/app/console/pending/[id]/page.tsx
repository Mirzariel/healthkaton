import Link from "next/link";
import { notFound } from "next/navigation";
import { DisputeResolveForm, PendingStaffActions } from "@/components/pkbi/PendingForms";
import { Card, Forbidden, PageHeader, Pill, SectionTitle, SimNotice, SourceBadge } from "@/components/ui";
import { can } from "@/lib/auth/principal";
import { getDb } from "@/lib/db";
import { fmtDate, fmtDateTime, rupiah } from "@/lib/dates";
import { PENDING_LABEL, TONE_CLASS } from "@/lib/labels";
import { listDisputes } from "@/lib/pending/dispute";
import { CATEGORY_GUIDANCE, OWNER_LABEL, PENDING_CATEGORIES, PENDING_NOTE, PENDING_STATUS_LABEL, getPending, pendingObservations } from "@/lib/pending/triage";
import { getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function PendingDetail({ params }: { params: Promise<{ id: string }> }) {
  const me = await getPrincipal("konsol");
  if (!can(me, "case.view")) return <Forbidden need="case.view" />;
  const { id } = await params;
  const db = getDb();
  const row = getPending(db, decodeURIComponent(id));
  if (!row) notFound();
  const obs = pendingObservations(db, row.claim_id);
  const disputes = listDisputes(db, { kind: "pending_category", refId: row.id });
  const s = PENDING_STATUS_LABEL[row.status];
  const g = CATEGORY_GUIDANCE[row.category];
  const categories = PENDING_CATEGORIES.map((c) => ({ value: c, label: PENDING_LABEL[c] }));
  const docGap = obs.some((o) => o.area === "Dokumentasi pelaksanaan" && o.tone === "warn");
  const mismatch = row.category === "doc_completeness" && !docGap;
  const episode = db.prepare("SELECT episode_id FROM claims WHERE id = ?").get(row.claim_id) as { episode_id: string } | undefined;
  const event = db.prepare("SELECT type, at, reason FROM payment_events WHERE claim_id = ? ORDER BY at, rowid").all(row.claim_id) as { type: string; at: string; reason: string | null }[];
  return (
    <>
      <PageHeader title={`Pending ${row.claim_no}`} eyebrow="Pemilahan pending" crumbs={[{ label: "Pemilahan pending", href: "/console/pending" }, { label: row.id }]}
        purpose={`${row.facility_name} · menunggu ${row.age_days} hari sejak ${fmtDate(row.pending_since)}${row.amount === null ? "" : ` · nilai klaim ${rupiah(row.amount)}`}`}>
        <div className="flex items-center gap-2"><Pill className={TONE_CLASS[s.tone]}>{s.label}</Pill><SourceBadge source="simulated" /></div>
      </PageHeader>
      <SimNotice>{PENDING_NOTE}</SimNotice>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <section className="space-y-3">
            <SectionTitle title="Kategori penanganan" />
            <Card className="space-y-2 p-4">
              <p className="text-lg font-semibold">{PENDING_LABEL[row.category]}</p>
              <p className="text-sm text-ink-soft">Pelaksana awal: {row.owner_role ? OWNER_LABEL[row.owner_role] ?? row.owner_role : "-"} · kode alasan pembayar <span className="font-mono">{row.reason_code}</span></p>
              <p className="text-sm">{row.guidance ?? g.guidance}</p>
              {mismatch && <p className="rounded-md border border-line bg-warn-soft px-3 py-2 text-sm text-ink-soft">Kode alasan menyebut berkas kurang, tetapi pemeriksaan mesin belum menemukan kekurangan catatan pelaksanaan yang tertaut. Ini bisa berarti berkas yang dimaksud berada di luar data yang dimuat SEHATI. Mintalah faskes menjelaskan berkas yang dimaksud, jangan menyimpulkan sendiri.</p>}
            </Card>
          </section>

          <section className="space-y-3">
            <SectionTitle title="Pemeriksaan mesin independen" hint="Dibandingkan dengan kode alasan pembayar. Hanya menampilkan yang terlihat pada data; tidak menyimpulkan penyebab." />
            <Card className="divide-y divide-line">
              {obs.map((o, i) => (
                <div key={i} className="flex items-start gap-3 p-3 text-sm">
                  <Pill className={TONE_CLASS[o.tone === "warn" ? "warn" : o.tone === "ok" ? "ok" : "info"]}>{o.area}</Pill>
                  <p className="text-ink-soft">{o.text}</p>
                </div>
              ))}
            </Card>
            {episode && <p className="text-sm text-ink-soft">Dokumen bukti episode ini: <Link className="underline underline-offset-4" href={`/console/documents?episode=${episode.episode_id}`}>lihat dokumen</Link> · <Link className="underline underline-offset-4" href={`/console/precheck/${row.claim_id}`}>jalankan pra-pengajuan</Link></p>}
          </section>

          <section className="space-y-3">
            <SectionTitle title="Riwayat status pembayaran" hint="Dari data status pembayaran. Keterlambatan pembayar tidak disimpulkan dari tanggal pengajuan." />
            <Card className="divide-y divide-line">
              {event.length === 0 ? <p className="p-3 text-sm text-ink-soft">Tidak ada peristiwa tercatat.</p> : event.map((e, i) => (
                <div key={i} className="flex items-center justify-between gap-3 p-3 text-sm"><span className="font-medium">{e.type}{e.reason ? ` · ${e.reason}` : ""}</span><span className="text-muted">{fmtDateTime(e.at)}</span></div>
              ))}
            </Card>
          </section>

          <section className="space-y-3">
            <SectionTitle title="Jawaban faskes" />
            <Card className="p-4">{row.facility_response ? <pre className="whitespace-pre-wrap font-sans text-sm text-ink-soft">{row.facility_response}</pre> : <p className="text-sm text-ink-soft">Belum ada jawaban dari faskes.</p>}</Card>
          </section>

          {disputes.length > 0 && (
            <section className="space-y-3">
              <SectionTitle title="Bantahan kategori" />
              {disputes.map((d) => (
                <Card key={d.id} className="space-y-2 p-4">
                  <p className="flex items-center gap-2 text-sm"><span className="font-mono text-xs">{d.id}</span><Pill className={TONE_CLASS[d.status === "open" ? "warn" : "ok"]}>{d.status === "open" ? "Menunggu jawaban" : "Dijawab"}</Pill><span className="text-muted">{fmtDateTime(d.created_at)}</span></p>
                  <p className="text-sm">{d.text}</p>
                  {d.response && <p className="rounded-md bg-brand-soft/60 px-3 py-2 text-sm text-ink-soft">Jawaban: {d.response} ({{ accepted: "diterima", rejected: "ditolak", noted: "dicatat tanpa perubahan", open: "" }[d.status]})</p>}
                  {d.status === "open" && can(me, "dispute.resolve") && <DisputeResolveForm id={d.id} kind="pending_category" categories={categories} />}
                </Card>
              ))}
            </section>
          )}
        </div>

        <aside className="lg:col-span-2">
          <Card elevated className="p-4"><PendingStaffActions id={row.id} category={row.category} status={row.status} categories={categories} canManage={can(me, "pending.manage")} /></Card>
          {row.case_id && <p className="mt-3 text-sm text-ink-soft">Dipindahkan ke kasus <span className="font-mono">{row.case_id}</span>.</p>}
        </aside>
      </div>
    </>
  );
}
