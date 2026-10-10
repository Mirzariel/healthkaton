import { VerifyBox } from "@/components/RegistryActions";
import { Card, EmptyState, Forbidden, PageHeader, Pill, SectionTitle, SimNotice, Stat } from "@/components/ui";
import { lastVerification } from "@/lib/audit";
import { can } from "@/lib/auth/principal";
import { getDb } from "@/lib/db";
import { TONE_CLASS } from "@/lib/labels";
import { getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";

interface Row { id: number; ts: string; actor: string; action: string; entity: string; entity_id: string; hash: string }

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await getPrincipal("konsol");
  if (!can(me, "audit.view")) return <Forbidden need="audit.view" />;
  const q = ((await searchParams).q ?? "").trim().slice(0, 60);
  const db = getDb();
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const rows = (q
    ? db.prepare("SELECT id, ts, actor, action, entity, entity_id, hash FROM audit_log WHERE action LIKE ? OR entity LIKE ? OR entity_id LIKE ? OR actor LIKE ? ORDER BY id DESC LIMIT 100").all(like, like, like, like)
    : db.prepare("SELECT id, ts, actor, action, entity, entity_id, hash FROM audit_log ORDER BY id DESC LIMIT 100").all()) as Row[];
  const total = (db.prepare("SELECT COUNT(*) c FROM audit_log").get() as { c: number }).c;
  const anchors = db.prepare("SELECT COUNT(*) c, SUM(mac IS NOT NULL) s FROM audit_anchors").get() as { c: number; s: number | null };
  const last = lastVerification(db);
  return (
    <>
      <PageHeader title="Jejak audit" purpose="Setiap perubahan penting tercatat berantai hash dan tidak dapat diubah lewat aplikasi." eyebrow="Sistem" />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Entri audit" value={total} />
        <Stat label="Jangkar" value={anchors.c} hint={`${anchors.s ?? 0} diberi tanda tangan (MAC)`} />
        <Stat label="Verifikasi terakhir" value={last ? (last.ok ? "Konsisten" : "Tidak cocok") : "Belum"} tone={last ? (last.ok ? "ok" : "danger") : "default"} hint={last ? `${last.at} oleh ${last.actor}` : "Jalankan verifikasi di bawah"} />
      </div>
      {can(me, "audit.verify") && (
        <section className="mt-6 space-y-2">
          <SectionTitle title="Verifikasi" />
          <Card className="p-4"><VerifyBox /></Card>
        </section>
      )}
      <div className="mt-6"><SimNotice>Batas yang jujur: rantai hash membuat perubahan terdeteksi, bukan mustahil. Siapa pun dengan akses penuh ke berkas basis data dapat menulis ulang seluruh rantai. Jangkar yang disimpan di basis data yang sama bukan jangkar independen; ekspor jangkar ke penyimpanan lain dan set SEHATI_ANCHOR_SECRET untuk perlindungan lebih kuat.</SimNotice></div>
      <section className="mt-6 space-y-3">
        <SectionTitle title="Entri terbaru" hint="Maksimal 100 entri terbaru yang cocok." />
        <form className="flex gap-2" role="search">
          <label htmlFor="q" className="sr-only">Cari aksi, entitas, atau pelaku</label>
          <input id="q" name="q" defaultValue={q} placeholder="Cari aksi, entitas, atau pelaku" className="w-full max-w-sm rounded-lg border border-line bg-card px-3 py-2 text-sm" />
          <button className="rounded-lg border border-line bg-card px-3 py-2 text-sm font-semibold">Cari</button>
        </form>
        <Card className="overflow-x-auto">
          {rows.length === 0 ? <EmptyState title="Tidak ada entri yang cocok" /> : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted"><tr><th className="p-3">#</th><th className="p-3">Waktu</th><th className="p-3">Pelaku</th><th className="p-3">Aksi</th><th className="p-3">Entitas</th><th className="p-3">Hash</th></tr></thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="p-3 tabular-nums">{r.id}</td>
                    <td className="p-3 font-mono text-xs">{r.ts}</td>
                    <td className="p-3">{r.actor}</td>
                    <td className="p-3"><Pill className={TONE_CLASS.muted}>{r.action}</Pill></td>
                    <td className="p-3 text-ink-soft">{r.entity} <span className="font-mono text-xs">{r.entity_id}</span></td>
                    <td className="p-3 font-mono text-[11px] text-muted">{r.hash.slice(0, 10)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>
    </>
  );
}
