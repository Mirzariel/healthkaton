import Link from "next/link";
import { ClarificationItem, FindingItem } from "@/components/faskes/parts";
import { IconCheckCircle, IconChevronRight } from "@/components/icons";
import { Card, EmptyState, Forbidden, PageHeader, Section, SectionTitle, StatGrid, StatusPill, Stat } from "@/components/ui";
import { can } from "@/lib/auth/principal";
import { facilityActions, facilityClarifications, facilityHome } from "@/lib/casework/queries";
import { nowIso } from "@/lib/clock";
import { dayDiff, fmtDate } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { ACTION_LABEL } from "@/lib/labels";
import { getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";

const MAX_TODO = 6;

export default async function FaskesHome() {
  const me = await getPrincipal("faskes");
  if (!can(me, "facility.respond")) return <Forbidden need="facility.respond" />;
  const db = getDb();
  const now = nowIso();
  const today = now.slice(0, 10);
  const h = facilityHome(db, me, today);
  const openClar = facilityClarifications(db, me).filter((c) => c.status === "sent" || c.status === "lapsed");
  const openActions = facilityActions(db, me).filter((a) => a.status === "open" || a.status === "in_progress");

  // Urutan kepentingan: permintaan klarifikasi yang masih berjalan (tenggat terdekat dulu), tindakan lewat target,
  // permintaan yang lewat tenggat (tetap dapat dijawab), lalu tindakan yang belum lewat target.
  type Todo = { key: string; rank: number; sort: string; node: React.ReactNode };
  const todo: Todo[] = [
    ...openClar.map((c) => ({
      key: c.id, rank: c.status === "sent" ? 0 : 2, sort: c.due_at,
      node: <ClarificationItem c={c} now={now} compact />,
    })),
    ...openActions.map((a) => {
      const late = !!a.target_date && a.target_date.slice(0, 10) < today;
      const diff = a.target_date ? dayDiff(today, a.target_date) : null;
      return {
        key: a.id, rank: late ? 1 : 3, sort: a.target_date ?? "9999",
        node: (
          <Link href="/faskes/tindakan" className="group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-subtle/70">
            <div className="min-w-0 flex-1">
              <div className="flex flex-col-reverse items-start gap-1.5 sm:flex-row sm:justify-between sm:gap-3">
                <div className="min-w-0">
                  <p className="text-caption text-muted">Tindakan perbaikan</p>
                  <p className="mt-0.5 text-body-sm font-semibold leading-snug text-ink">{a.description}</p>
                </div>
                <StatusPill tone={late ? "danger" : "warn"}>{ACTION_LABEL[a.status as keyof typeof ACTION_LABEL]}</StatusPill>
              </div>
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted">
                <span>
                  Target {fmtDate(a.target_date)}
                  {diff !== null && <span className={late ? "ml-2 font-medium text-danger" : "ml-2"}>{late ? `lewat ${-diff} hari` : diff === 0 ? "hari ini" : `${diff} hari lagi`}</span>}
                </span>
                <span title="Nomor tindakan">No. <span className="font-mono">{a.id}</span></span>
              </p>
            </div>
            <IconChevronRight size={16} className="mt-1 shrink-0 text-line-strong transition-colors group-hover:text-ink-soft" />
          </Link>
        ),
      };
    }),
  ].sort((a, b) => a.rank - b.rank || a.sort.localeCompare(b.sort));
  const shown = todo.slice(0, MAX_TODO);

  const FIRST_FINDINGS = 5;
  return (
    <>
      <PageHeader title="Ringkasan faskes" purpose="Yang perlu Anda tanggapi dan status temuan faskes Anda." />

      <StatGrid>
        <Stat label="Menunggu jawaban" value={h.waiting} tone={h.waiting ? "warn" : "default"} href="/faskes/klarifikasi" />
        <Stat label="Lewat tenggat" value={h.lapsed} href="/faskes/klarifikasi" hint="Masih dapat dijawab" />
        <Stat label="Bantahan menunggu" value={h.disputesOpen} href="/faskes/bantahan" />
        <Stat label="Tindakan berjalan" value={h.actionsOpen} href="/faskes/tindakan" hint={h.actionsOverdue ? `${h.actionsOverdue} lewat target` : undefined} tone={h.actionsOverdue ? "danger" : "default"} />
      </StatGrid>

      <Section className="mt-9">
        <SectionTitle title="Perlu Anda tanggapi" info="klarifikasi">
          {todo.length > MAX_TODO && <Link href="/faskes/klarifikasi" className="link text-caption">Lihat semua</Link>}
        </SectionTitle>
        <Card elevated className="divide-y divide-line overflow-hidden">
          {shown.length === 0 ? (
            <EmptyState title="Tidak ada yang perlu ditanggapi" icon={<IconCheckCircle size={18} />} />
          ) : (
            shown.map((t) => <div key={t.key}>{t.node}</div>)
          )}
        </Card>
      </Section>

      <Section>
        <SectionTitle title="Temuan faskes Anda" info="pembuktian" hint="Status ditetapkan petugas dan reviewer. Anda dapat membantah kapan saja." />
        {h.findings.length === 0 ? (
          <div className="panel-inset"><EmptyState title="Belum ada temuan" /></div>
        ) : (
          <div className="divide-y divide-line overflow-hidden rounded-card bg-card shadow-e1">
            {h.findings.slice(0, FIRST_FINDINGS).map((f) => <FindingItem key={f.id} f={f} />)}
            {h.findings.length > FIRST_FINDINGS && (
              <details className="group">
                <summary className="cursor-pointer select-none px-4 py-3 text-body-sm font-medium text-brand-ink hover:bg-subtle/60">
                  <span className="group-open:hidden">Tampilkan {h.findings.length - FIRST_FINDINGS} temuan lainnya</span>
                  <span className="hidden group-open:inline">Sembunyikan temuan lainnya</span>
                </summary>
                <div className="divide-y divide-line border-t border-line">{h.findings.slice(FIRST_FINDINGS).map((f) => <FindingItem key={f.id} f={f} />)}</div>
              </details>
            )}
          </div>
        )}
        <p className="text-caption text-muted">&quot;Tidak dapat dibuktikan&quot; berarti bukti belum cukup, bukan layanan tidak dilakukan.</p>
      </Section>
    </>
  );
}
