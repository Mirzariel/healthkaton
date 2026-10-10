import Link from "next/link";
import { CommandForm } from "@/components/casework/CommandForm";
import { Tag } from "@/components/casework/parts";
import { Card, EmptyState, Forbidden, PageHeader } from "@/components/ui";
import { can } from "@/lib/auth/principal";
import { ACTION_LABEL } from "@/lib/labels";
import { FOLLOWUP_LABEL } from "@/lib/casework/labels";
import { facilityActions } from "@/lib/casework/queries";
import { nowIso } from "@/lib/clock";
import { fmtDate } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function FaskesActions() {
  const me = await getPrincipal("faskes");
  if (!can(me, "action.manage")) return <Forbidden need="action.manage" />;
  const rows = facilityActions(getDb(), me);
  const today = nowIso().slice(0, 10);
  return (
    <>
      <PageHeader title="Tindakan perbaikan" eyebrow="Portal faskes" purpose="Rencana perbaikan Anda. Setelah Anda menandai selesai dikerjakan, petugas meminta konfirmasi peserta dan pengukuran ulang. Tindakan ditutup petugas setelah hasilnya terkonfirmasi, bukan oleh faskes sendiri." />
      <div className="space-y-3">
        {rows.length === 0 && <Card><EmptyState title="Belum ada tindakan perbaikan">Rencana tindakan disusun dari halaman temuan yang sudah terbukti.</EmptyState></Card>}
        {rows.map((a) => (
          <Card key={a.id} className="p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{a.id}</span><Tag t={a.status === "closed" ? "ok" : a.status === "follow_up_pending" ? "info" : "warn"}>{ACTION_LABEL[a.status as keyof typeof ACTION_LABEL]}</Tag><span className="text-xs text-muted">target {fmtDate(a.target_date)}{(a.status === "open" || a.status === "in_progress") && a.target_date && a.target_date.slice(0, 10) < today ? " · lewat target" : ""}</span></div>
            <p className="mt-1">{a.description}</p>
            <p className="text-xs text-muted">Untuk temuan: {a.finding_id ? <Link className="underline underline-offset-4" href={`/faskes/temuan/${a.finding_id}`}>{a.finding_title}</Link> : "-"} · pemilik {a.owner}</p>
            {a.remeasure_plan && <p className="text-xs text-ink-soft">Pengukuran ulang: {a.remeasure_plan}</p>}
            {a.result && <p className="mt-1 text-ink-soft">Hasil yang Anda laporkan: {a.result}</p>}
            {a.followups.length > 0 && <ul className="mt-2 space-y-1 text-xs text-ink-soft">{a.followups.map((u, i) => <li key={i}>{FOLLOWUP_LABEL[u.kind] ?? u.kind}: {u.status === "done" ? "selesai" : u.status === "skipped" ? "dilewati" : `menunggu (jatuh tempo ${fmtDate(u.due_at)})`}</li>)}</ul>}
            {a.status === "open" && <div className="mt-3"><CommandForm command="start_action" endpoint="/api/faskes/commands" hidden={{ actionId: a.id }} submit="Tandai mulai dikerjakan" tone="secondary" /></div>}
            {a.status === "in_progress" && (
              <details className="mt-3 rounded-lg border border-line bg-paper/60"><summary className="cursor-pointer px-3 py-1.5 font-semibold">Laporkan selesai dikerjakan</summary>
                <div className="border-t border-line p-3"><CommandForm command="resolve_action" endpoint="/api/faskes/commands" hidden={{ actionId: a.id }} submit="Laporkan selesai" doneMessage="Dilaporkan. Petugas akan meminta tindak lanjut." fields={[{ kind: "textarea", name: "result", label: "Apa yang sudah dilakukan (minimal 10 karakter)", rows: 3, required: true }]} /></div>
              </details>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
