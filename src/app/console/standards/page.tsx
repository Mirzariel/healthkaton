import Link from "next/link";
import { ImportBox } from "@/components/RegistryActions";
import { Card, EmptyState, Forbidden, PageHeader, Pill, SectionTitle, SimNotice } from "@/components/ui";
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
      <PageHeader title="Registry standar" purpose="Semua butir pertanyaan survei berasal dari sini, lengkap dengan sumber, versi, dan status tinjauan. Mesin AI tidak menambah butir sendiri." eyebrow="Standar dan AI" />
      <SimNotice>{APPROVAL_DISCLAIMER}</SimNotice>
      <section className="mt-6 space-y-3">
        <SectionTitle title="Versi standar" />
        <Card className="overflow-x-auto">
          {versions.length === 0 ? <EmptyState title="Belum ada standar" /> : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted"><tr><th className="p-3">Standar</th><th className="p-3">Versi</th><th className="p-3">Status</th><th className="p-3">Butir</th><th className="p-3">Cakupan</th></tr></thead>
              <tbody className="divide-y divide-line">
                {versions.map((v) => (
                  <tr key={v.id}>
                    <td className="p-3"><Link className="font-semibold underline-offset-4 hover:underline" href={`/console/standards/${encodeURIComponent(v.id)}`}>{v.standard_name}</Link></td>
                    <td className="p-3 font-mono text-xs">{v.version}</td>
                    <td className="p-3"><Pill className={TONE_CLASS[STATUS[v.status].tone]}>{STATUS[v.status].label}</Pill></td>
                    <td className="p-3 tabular-nums">{counts.get(v.id) ?? 0}</td>
                    <td className="p-3 text-ink-soft">{v.scope.join(", ") || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>
      <section className="mt-8 space-y-3">
        <SectionTitle title="Dokumen sumber" hint="Status validasi dicatat apa adanya. Tautan eksternal yang belum dibuka tidak dianggap terverifikasi." />
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted"><tr><th className="p-3">ID</th><th className="p-3">Dokumen</th><th className="p-3">Cakupan</th><th className="p-3">Validasi</th></tr></thead>
            <tbody className="divide-y divide-line">
              {sources.map((s) => (
                <tr key={s.id} className="align-top">
                  <td className="p-3 font-mono text-xs">{s.id}</td>
                  <td className="p-3"><p className="font-medium">{s.title}</p>{s.notes && <p className="mt-0.5 text-xs text-muted">{s.notes}</p>}</td>
                  <td className="p-3 text-ink-soft">{s.scope ?? "-"}</td>
                  <td className="p-3"><Pill className={TONE_CLASS[SRC[s.validation_status].tone]}>{SRC[s.validation_status].label}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>
      {can(me, "standards.edit") && (
        <section className="mt-8 space-y-3">
          <SectionTitle title="Impor standar (JSON)" hint="Selalu masuk sebagai draft. Impor yang sama dua kali tidak membuat versi ganda." />
          <Card className="p-4"><ImportBox /></Card>
        </section>
      )}
    </>
  );
}
