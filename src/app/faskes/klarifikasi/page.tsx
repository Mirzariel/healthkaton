import Link from "next/link";
import { ClarificationItem, type ClarRow } from "@/components/faskes/parts";
import { Card, EmptyState, Forbidden, PageHeader, Section, SectionTitle, TableCard } from "@/components/ui";
import { can } from "@/lib/auth/principal";
import { facilityClarifications } from "@/lib/casework/queries";
import { nowIso } from "@/lib/clock";
import { fmtDateTime } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";

const FIRST_DONE = 8;

function DoneTable({ rows, head = true }: { rows: ClarRow[]; head?: boolean }) {
  return (
    <table className="w-full text-left text-[13.5px]">
      {head && (
        <thead>
          <tr>
            <th className="px-4 py-2.5 font-medium">Permintaan</th>
            <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Dijawab</th>
            <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">Dokumen</th>
          </tr>
        </thead>
      )}
      <tbody>
        {rows.map((c) => (
          <tr key={c.id}>
            <td className="px-4 py-3">
              <Link href={`/faskes/klarifikasi/${c.id}`} className="link font-medium">{c.finding_title}</Link>
              <p className="mt-0.5 text-[12px] text-muted"><span className="font-mono">{c.id}</span><span className="sm:hidden"> &nbsp;Dijawab {fmtDateTime(c.answered_at)}</span></p>
            </td>
            <td className="hidden whitespace-nowrap px-4 py-3 text-ink-soft sm:table-cell">{fmtDateTime(c.answered_at)}</td>
            <td className="hidden px-4 py-3 text-right tabular-nums text-ink-soft sm:table-cell">{c.doc_count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function FaskesClarifications() {
  const me = await getPrincipal("faskes");
  if (!can(me, "facility.respond")) return <Forbidden need="facility.respond" />;
  const rows = facilityClarifications(getDb(), me);
  const now = nowIso();
  const open = rows.filter((c) => c.status === "sent" || c.status === "lapsed");
  const done = rows.filter((c) => c.status !== "sent" && c.status !== "lapsed");
  return (
    <>
      <PageHeader title="Permintaan klarifikasi" purpose="Jawab dengan penjelasan dan dokumen. Jawaban terlambat tetap diterima." />

      <Section>
        <SectionTitle title="Perlu dijawab" hint={open.length ? `${open.length} permintaan, tenggat terdekat di atas.` : undefined} />
        <Card elevated className="divide-y divide-line overflow-hidden">
          {open.length === 0 ? (
            <EmptyState title="Tidak ada yang menunggu jawaban" />
          ) : (
            open.map((c) => <ClarificationItem key={c.id} c={c} now={now} />)
          )}
        </Card>
      </Section>

      <Section>
        <SectionTitle title="Sudah dijawab" hint={done.length ? `${done.length} permintaan` : undefined} />
        {done.length === 0 ? (
          <div className="panel-inset"><EmptyState title="Belum ada yang dijawab" /></div>
        ) : (
          <TableCard label="Permintaan yang sudah dijawab">
            <DoneTable rows={done.slice(0, FIRST_DONE)} />
            {done.length > FIRST_DONE && (
              <details className="group border-t border-line">
                <summary className="cursor-pointer select-none px-4 py-3 text-[13.5px] font-medium text-brand-ink hover:bg-subtle/70">
                  <span className="group-open:hidden">Tampilkan {done.length - FIRST_DONE} lainnya</span>
                  <span className="hidden group-open:inline">Sembunyikan</span>
                </summary>
                <div className="border-t border-line"><DoneTable rows={done.slice(FIRST_DONE)} head={false} /></div>
              </details>
            )}
          </TableCard>
        )}
      </Section>

      <p className="mt-6 text-[12.5px] text-muted">Identitas peserta tidak ditampilkan.</p>
    </>
  );
}
