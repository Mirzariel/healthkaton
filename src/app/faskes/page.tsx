import Link from "next/link";
import { Tag } from "@/components/casework/parts";
import { Card, EmptyState, Forbidden, PageHeader, ProofBadge, SectionTitle, SimNotice, Stat } from "@/components/ui";
import { can } from "@/lib/auth/principal";
import { facilityHome } from "@/lib/casework/queries";
import { nowIso } from "@/lib/clock";
import { fmtDate } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function FaskesHome() {
  const me = await getPrincipal("faskes");
  if (!can(me, "facility.respond")) return <Forbidden need="facility.respond" />;
  const h = facilityHome(getDb(), me, nowIso().slice(0, 10));
  return (
    <>
      <PageHeader title="Ringkasan faskes" eyebrow="Portal faskes" purpose="Tempat menjawab permintaan klarifikasi, melampirkan dokumen, mengajukan bantahan, dan menyusun tindakan perbaikan. Sebuah temuan baru tampak di sini setelah petugas meminta klarifikasi atau tindakan perbaikan." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Menunggu jawaban Anda" value={h.waiting} tone={h.waiting ? "warn" : "default"} href="/faskes/klarifikasi" hint="Hak jawab Anda berjalan" />
        <Stat label="Lewat tenggat, masih dapat dijawab" value={h.lapsed} href="/faskes/klarifikasi" hint="Jawaban terlambat tetap diterima" />
        <Stat label="Bantahan menunggu tanggapan" value={h.disputesOpen} href="/faskes/bantahan" />
        <Stat label="Tindakan perbaikan berjalan" value={h.actionsOpen} href="/faskes/tindakan" hint={h.actionsOverdue ? `${h.actionsOverdue} lewat target` : undefined} tone={h.actionsOverdue ? "danger" : "default"} />
      </div>
      <section className="mt-8 space-y-3">
        <SectionTitle title="Temuan yang melibatkan faskes Anda" hint="Status pembuktian ditentukan petugas dan reviewer, bukan oleh sistem. Anda dapat membantah temuan kapan saja." />
        <Card className="divide-y divide-line">
          {h.findings.length === 0 && <EmptyState title="Belum ada temuan yang melibatkan faskes Anda">Tidak ada permintaan klarifikasi atau tindakan perbaikan saat ini.</EmptyState>}
          {h.findings.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <Link href={`/faskes/temuan/${f.id}`} className="font-semibold underline-offset-4 hover:underline">{f.title}</Link>
                <p className="text-xs text-muted"><span className="font-mono">{f.id}</span> · {f.type_label}{f.claim_no ? ` · ${f.claim_no}` : ""} · perawatan {fmtDate(f.admit_date)} · diperbarui {fmtDate(f.updated_at)}</p>
              </div>
              <div className="flex items-center gap-2">{f.open_clarification_ids.length > 0 && <Tag t="warn">Perlu jawaban</Tag>}{f.has_open_dispute && <Tag t="info">Bantahan dikirim</Tag>}<ProofBadge status={f.proof_status} /></div>
            </div>
          ))}
        </Card>
        <SimNotice>Status "Sinyal" berarti petugas belum menilai apa pun. Status "Tidak dapat dibuktikan" berarti bukti belum cukup, bukan bahwa layanan tidak dilakukan.</SimNotice>
      </section>
    </>
  );
}
