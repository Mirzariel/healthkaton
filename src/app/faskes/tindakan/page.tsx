import Link from "next/link";
import type { ReactNode } from "react";
import { CommandForm } from "@/components/casework/CommandForm";
import { ActionProgress } from "@/components/faskes/parts";
import { IconWrench } from "@/components/icons";
import { Card, EmptyState, Forbidden, PageHeader, Section, SectionTitle, StatusPill } from "@/components/ui";
import { can } from "@/lib/auth/principal";
import { ACTION_LABEL } from "@/lib/labels";
import { FOLLOWUP_LABEL } from "@/lib/casework/labels";
import { facilityActions } from "@/lib/casework/queries";
import { nowIso } from "@/lib/clock";
import { dayDiff, fmtDate } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";

type Row = ReturnType<typeof facilityActions>[number];

function ActionCard({ a, today, primary = false, quiet = false }: { a: Row; today: string; primary?: boolean; quiet?: boolean }) {
  const running = a.status === "open" || a.status === "in_progress";
  const late = running && !!a.target_date && a.target_date.slice(0, 10) < today;
  const lateBy = late ? -dayDiff(today, a.target_date!) : 0;
  const cls = "space-y-4 px-5 py-4";
  const body = (
    <>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <StatusPill tone={a.status === "closed" ? "ok" : a.status === "follow_up_pending" ? "info" : "warn"}>{ACTION_LABEL[a.status as keyof typeof ACTION_LABEL]}</StatusPill>
        {late && <StatusPill tone="danger">Lewat target {lateBy} hari</StatusPill>}
        <span className="text-caption text-muted" title="Nomor tindakan">No. <span className="font-mono">{a.id}</span></span>
      </div>
      <p className="max-w-3xl text-body font-medium leading-relaxed text-ink">{a.description}</p>
      <ActionProgress status={a.status} />
      <dl className="grid gap-x-8 gap-y-2.5 border-t border-line pt-3.5 text-body-sm sm:grid-cols-2">
        <div>
          <dt className="text-caption text-muted">Untuk temuan</dt>
          <dd>{a.finding_id ? <Link className="link" href={`/faskes/temuan/${a.finding_id}`}>{a.finding_title}</Link> : "-"}</dd>
        </div>
        <div>
          <dt className="text-caption text-muted">Pemilik</dt>
          <dd className="text-ink">{a.owner ?? "-"}</dd>
        </div>
        <div>
          <dt className="text-caption text-muted">Target selesai</dt>
          <dd className="text-ink">{fmtDate(a.target_date)}</dd>
        </div>
        {a.remeasure_plan && (
          <div>
            <dt className="text-caption text-muted">Pengukuran ulang</dt>
            <dd className="text-ink-soft">{a.remeasure_plan}</dd>
          </div>
        )}
        {a.result && (
          <div className="sm:col-span-2">
            <dt className="text-caption text-muted">Hasil yang Anda laporkan</dt>
            <dd className="text-ink-soft">{a.result}</dd>
          </div>
        )}
      </dl>
      {a.followups.length > 0 && (
        <div>
          <p className="text-caption text-muted">Tindak lanjut oleh petugas</p>
          <ul className="mt-1 space-y-1 text-body-sm text-ink-soft">
            {a.followups.map((u, i) => (
              <li key={i}>{FOLLOWUP_LABEL[u.kind] ?? u.kind}: {u.status === "done" ? "selesai" : u.status === "skipped" ? "dilewati" : `menunggu (jatuh tempo ${fmtDate(u.due_at)})`}</li>
            ))}
          </ul>
        </div>
      )}
      {a.status === "open" && (
        <div className="border-t border-line pt-3.5">
          <CommandForm command="start_action" endpoint="/api/faskes/commands" hidden={{ actionId: a.id }} submit="Tandai mulai dikerjakan" tone="secondary" />
        </div>
      )}
      {a.status === "in_progress" && (
        <details className="group rounded-control border border-line bg-subtle/50 open:bg-card">
          <summary className="cursor-pointer select-none px-3.5 py-2.5 text-body-sm font-semibold text-ink">Laporkan selesai dikerjakan</summary>
          <div className="border-t border-line p-3.5">
            <CommandForm command="resolve_action" endpoint="/api/faskes/commands" hidden={{ actionId: a.id }} submit="Laporkan selesai" doneMessage="Dilaporkan. Petugas akan meminta tindak lanjut." fields={[{ kind: "textarea", name: "result", label: "Apa yang sudah dilakukan (minimal 10 karakter)", rows: 3, required: true }]} />
          </div>
        </details>
      )}
    </>
  );
  return quiet ? <div className={`panel-inset ${cls}`}>{body}</div> : <Card elevated={primary} className={cls}>{body}</Card>;
}

export default async function FaskesActions() {
  const me = await getPrincipal("faskes");
  if (!can(me, "action.manage")) return <Forbidden need="action.manage" />;
  const rows = facilityActions(getDb(), me);
  const today = nowIso().slice(0, 10);
  const active = rows.filter((a) => a.status !== "closed");
  const closed = rows.filter((a) => a.status === "closed");
  return (
    <>
      <PageHeader title="Tindakan perbaikan" purpose="Rencana perbaikan faskes Anda dan kemajuannya." />
      {rows.length === 0 ? (
        <div className="panel-inset">
          <EmptyState title="Belum ada tindakan perbaikan" icon={<IconWrench size={18} />}>
            Susun dari halaman temuan yang terbukti, lewat <Link href="/faskes" className="link">Ringkasan</Link>.
          </EmptyState>
        </div>
      ) : (
        <>
          <Section>
            <SectionTitle title="Berjalan" info="tindakan" hint={active.length ? `${active.length} belum ditutup` : undefined} />
            <details className="-mt-2 text-caption text-muted">
              <summary className="cursor-pointer select-none font-medium text-brand-ink hover:underline">Cara penutupan</summary>
              <p className="mt-1 max-w-2xl leading-relaxed">Setelah Anda menandai selesai, petugas meminta konfirmasi peserta dan pengukuran ulang. Petugas yang menutup tindakan setelah hasilnya terkonfirmasi.</p>
            </details>
            {active.length === 0 ? <div className="panel-inset px-5 py-4 text-body-sm text-ink-soft">Tidak ada tindakan berjalan.</div> : active.map((a, i) => <ActionCard key={a.id} a={a} today={today} primary={i === 0} />)}
          </Section>
          {closed.length > 0 && (
            <Section>
              <SectionTitle title="Sudah ditutup" />
              {closed.map((a) => <ActionCard key={a.id} a={a} today={today} quiet />)}
            </Section>
          )}
        </>
      )}
    </>
  );
}
