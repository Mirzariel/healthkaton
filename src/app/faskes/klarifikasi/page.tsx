import Link from "next/link";
import { Tag } from "@/components/casework/parts";
import { Card, EmptyState, Forbidden, PageHeader, SimNotice } from "@/components/ui";
import { can } from "@/lib/auth/principal";
import { CLARIFICATION_LABEL } from "@/lib/casework/labels";
import { facilityClarifications } from "@/lib/casework/queries";
import { fmtDateTime } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function FaskesClarifications() {
  const me = await getPrincipal("faskes");
  if (!can(me, "facility.respond")) return <Forbidden need="facility.respond" />;
  const rows = facilityClarifications(getDb(), me);
  return (
    <>
      <PageHeader title="Permintaan klarifikasi" eyebrow="Portal faskes" purpose="Jawab dengan penjelasan dan lampirkan dokumen yang diminta. Tenggat yang lewat tidak berarti apa pun terhadap penilaian, dan jawaban terlambat tetap diterima." />
      <Card className="divide-y divide-line">
        {rows.length === 0 && <EmptyState title="Belum ada permintaan klarifikasi" />}
        {rows.map((c) => {
          const l = CLARIFICATION_LABEL[c.status];
          return (
            <Link key={c.id} href={`/faskes/klarifikasi/${c.id}`} className="block px-4 py-3 text-sm hover:bg-brand-soft/40">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{c.id} · {c.finding_title}</span><Tag t={l.tone} title={l.hint}>{l.label}</Tag></div>
              <p className="mt-1 line-clamp-2 text-ink-soft">{c.issue}</p>
              <p className="mt-1 text-xs text-muted">Dikirim {fmtDateTime(c.sent_at)} · tenggat {fmtDateTime(c.due_at)} · {c.doc_count} dokumen terlampir</p>
            </Link>
          );
        })}
      </Card>
      <div className="mt-4"><SimNotice>Anda hanya melihat permintaan untuk faskes Anda sendiri. Identitas peserta tidak ditampilkan.</SimNotice></div>
    </>
  );
}
