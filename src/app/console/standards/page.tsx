import Link from "next/link";
import { Disclosure } from "@/components/analytics/blocks";
import { ImportBox } from "@/components/RegistryActions";
import { Card, EmptyState, Forbidden, PageHeader, Section, SectionTitle, SimNotice, StatusPill, TableCard } from "@/components/ui";
import { can } from "@/lib/auth/principal";
import { getDb } from "@/lib/db";
import { TONE_CLASS } from "@/lib/labels";
import { getPrincipal } from "@/lib/server";
import { APPROVAL_DISCLAIMER, listSources, listStandardVersions } from "@/lib/standards/registry";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; tone: keyof typeof TONE_CLASS }> = {
  draft: { label: "Draft", tone: "muted" },
  reviewed: { label: "Ditinjau", tone: "info" },
  approved: { label: "Disetujui tim", tone: "ok" },
  retired: { label: "Dipensiunkan", tone: "muted" },
};
const SRC: Record<string, { label: string; tone: keyof typeof TONE_CLASS }> = {
  awaiting_validation: { label: "Menunggu validasi", tone: "warn" },
  validated: { label: "Tervalidasi", tone: "ok" },
  conflict: { label: "Konflik", tone: "danger" },
  not_provided: { label: "Tidak dilampirkan", tone: "muted" },
};

export default async function StandardsPage() {
  const me = await getPrincipal("konsol");
  if (!can(me, "standards.view")) return <Forbidden need="standards.view" />;
  const db = getDb();
  const versions = listStandardVersions(db);
  const counts = new Map((db.prepare("SELECT standard_version_id id, COUNT(*) c FROM indicator_versions GROUP BY standard_version_id").all() as { id: string; c: number }[]).map((r) => [r.id, r.c]));
  const sources = listSources(db);
  return (
    <>
      <PageHeader title="Registry standar" purpose="Semua butir survei berasal dari sini; AI tidak menambah butir sendiri." eyebrow="Standar dan AI" />
      <SimNotice>{APPROVAL_DISCLAIMER}</SimNotice>
      <Section className="mt-8">
        <SectionTitle title="Versi standar" hint="Buka satu versi untuk butir dan riwayatnya." />
        <TableCard label="Versi standar">
          {versions.length === 0 ? <EmptyState title="Belum ada standar" /> : (
            <table className="w-full min-w-[34rem] text-left text-[13.5px]">
              <thead><tr><th className="px-4 py-2.5">Standar</th><th className="px-4 py-2.5">Versi</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5 text-right">Butir</th><th className="px-4 py-2.5">Cakupan</th></tr></thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.id}>
                    <td className="px-4 py-3"><Link className="font-semibold text-brand-ink underline decoration-brand/30 underline-offset-3 hover:decoration-current" href={`/console/standards/${encodeURIComponent(v.id)}`}>{v.standard_name}</Link></td>
                    <td className="px-4 py-3 font-mono text-[12px]">{v.version}</td>
                    <td className="px-4 py-3"><StatusPill tone={STATUS[v.status].tone}>{STATUS[v.status].label}</StatusPill></td>
                    <td className="px-4 py-3 text-right tabular-nums">{counts.get(v.id) ?? 0}</td>
                    <td className="px-4 py-3 text-ink-soft">{v.scope.join(", ") || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TableCard>
      </Section>
      <Section className="mt-10">
        <Disclosure title="Dokumen sumber" meta={`${sources.length} dokumen`} flush>
        <p className="border-b border-line px-4 py-2.5 text-[12.5px] text-muted">Tautan yang belum dibuka tidak dianggap terverifikasi.</p>
        <div className="scroll-x">
          <table className="w-full min-w-[40rem] text-left text-[13.5px]">
            <thead><tr><th className="px-4 py-2.5">ID</th><th className="px-4 py-2.5">Dokumen</th><th className="px-4 py-2.5">Cakupan</th><th className="px-4 py-2.5">Validasi</th></tr></thead>
            <tbody className="align-top">
              {sources.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 font-mono text-[12px]">{s.id}</td>
                  <td className="px-4 py-3"><p className="font-medium text-ink">{s.title}</p>{s.notes && <p className="mt-0.5 max-w-xl text-[12.5px] leading-relaxed text-muted">{s.notes}</p>}</td>
                  <td className="px-4 py-3 text-ink-soft">{s.scope ?? "-"}</td>
                  <td className="px-4 py-3"><StatusPill tone={SRC[s.validation_status].tone}>{SRC[s.validation_status].label}</StatusPill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </Disclosure>
      </Section>
      {can(me, "standards.edit") && (
        <Section className="mt-10">
          <SectionTitle title="Impor standar (JSON)" hint="Selalu masuk sebagai draft; impor ganda tidak membuat versi ganda." />
          <Card className="p-5"><ImportBox /></Card>
        </Section>
      )}
    </>
  );
}
