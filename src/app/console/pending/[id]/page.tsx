import Link from "next/link";
import { notFound } from "next/navigation";
import { Inset, PAY_EVENT_LABEL, RecordId, reasonLabel } from "@/components/console/Parts";
import { DisputeResolveForm, PendingStaffActions } from "@/components/pkbi/PendingForms";
import { Card, CardHeader, Forbidden, Notice, PageHeader, Pill, SimNotice, SourceBadge } from "@/components/ui";
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
        <Pill className={TONE_CLASS[s.tone]}>{s.label}</Pill>
        <SourceBadge source="simulated" />
      </PageHeader>
      <SimNotice>{PENDING_NOTE}</SimNotice>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 space-y-6">
          <Card elevated>
            <CardHeader title="Kategori penanganan" />
            <div className="space-y-3 px-5 py-4">
              <p className="text-[1.125rem] font-semibold tracking-tight">{PENDING_LABEL[row.category]}</p>
              <p className="text-[13.5px] text-ink-soft">Pelaksana awal: {row.owner_role ? OWNER_LABEL[row.owner_role] ?? row.owner_role : "-"}. Alasan dari pembayar: <span title={row.reason_code}>{reasonLabel(row.reason_code)}</span>.</p>
              <p className="max-w-3xl text-[14px] leading-relaxed">{row.guidance ?? g.guidance}</p>
              {mismatch && <Notice tone="warn">Kode alasan menyebut berkas kurang, tetapi pemeriksaan mesin belum menemukan kekurangan catatan pelaksanaan yang tertaut. Ini bisa berarti berkas yang dimaksud berada di luar data yang dimuat SEHATI. Mintalah faskes menjelaskan berkas yang dimaksud, jangan menyimpulkan sendiri.</Notice>}
            </div>
          </Card>

          <Card>
            <CardHeader title="Pemeriksaan mesin independen" hint="Dibandingkan dengan kode alasan pembayar; tidak menyimpulkan penyebab." />
            <ul className="divide-y divide-line">
              {obs.map((o, i) => (
                <li key={i} className="grid grid-cols-1 gap-x-4 gap-y-1.5 px-5 py-3 text-[14px] sm:grid-cols-[12rem_minmax(0,1fr)]">
                  <div><Pill className={TONE_CLASS[o.tone === "warn" ? "warn" : o.tone === "ok" ? "ok" : "info"]}>{o.area}</Pill></div>
                  <p className="text-ink-soft">{o.text}</p>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Riwayat status pembayaran" hint="Keterlambatan pembayar tidak disimpulkan dari tanggal pengajuan." />
            {event.length === 0 ? <p className="px-5 py-4 text-[13.5px] text-ink-soft">Tidak ada peristiwa tercatat.</p> : (
              <ul className="divide-y divide-line">
                {event.map((e, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-5 py-3 text-[14px]"><span className="font-medium">{PAY_EVENT_LABEL[e.type] ?? e.type}{e.reason ? `: ${reasonLabel(e.reason)}` : ""}</span><span className="text-[13px] tabular-nums text-muted">{fmtDateTime(e.at)}</span></li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Jawaban faskes" />
            <div className="px-5 py-4">{row.facility_response ? <pre className="whitespace-pre-wrap font-sans text-[14px] leading-relaxed text-ink-soft">{row.facility_response}</pre> : <p className="text-[13.5px] text-ink-soft">Belum ada jawaban dari faskes.</p>}</div>
          </Card>

          {disputes.length > 0 && (
            <Card>
              <CardHeader title="Bantahan kategori" />
              <ul className="divide-y divide-line">
                {disputes.map((d) => (
                  <li key={d.id} className="space-y-2.5 px-5 py-4">
                    <p className="flex flex-wrap items-center gap-2 text-[13px]"><RecordId className="text-ink">{d.id}</RecordId><Pill className={TONE_CLASS[d.status === "open" ? "warn" : "ok"]}>{d.status === "open" ? "Menunggu jawaban" : "Dijawab"}</Pill><span className="text-muted">{fmtDateTime(d.created_at)}</span></p>
                    <p className="text-[14px]">{d.text}</p>
                    {d.response && <p className="rounded-lg bg-brand-tint px-3.5 py-2.5 text-[13.5px] text-ink-soft">Jawaban: {d.response} ({{ accepted: "diterima", rejected: "ditolak", noted: "dicatat tanpa perubahan", open: "" }[d.status]})</p>}
                    {d.status === "open" && can(me, "dispute.resolve") && <DisputeResolveForm id={d.id} kind="pending_category" categories={categories} />}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <aside className="space-y-4" aria-label="Tindakan">
          <Card>
            <CardHeader title="Tindakan petugas" />
            <div className="p-5"><PendingStaffActions id={row.id} category={row.category} status={row.status} categories={categories} canManage={can(me, "pending.manage")} /></div>
          </Card>
          {(episode || row.case_id) && (
            <Inset title="Terkait">
              <div className="space-y-2.5 text-[13.5px]">
                {episode && <div className="flex flex-wrap gap-2"><Link className="btn btn-secondary btn-sm" href={`/console/documents?episode=${episode.episode_id}`}>Lihat dokumen bukti</Link><Link className="btn btn-secondary btn-sm" href={`/console/precheck/${row.claim_id}`}>Jalankan pra-pengajuan</Link></div>}
                {row.case_id && <p className="text-ink-soft">Dipindahkan ke kasus <Link className="font-mono text-[12px] underline underline-offset-4" href={`/console/cases/${row.case_id}`}>{row.case_id}</Link>.</p>}
              </div>
            </Inset>
          )}
        </aside>
      </div>
    </>
  );
}
