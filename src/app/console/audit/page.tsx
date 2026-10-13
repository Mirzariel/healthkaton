import Link from "next/link";
import { More } from "@/components/analytics/blocks";
import { VerifyBox } from "@/components/RegistryActions";
import { Card, CardHeader, EmptyState, Forbidden, PageHeader, Pill, Section, SectionTitle, SimNotice, Stat, StatGrid, TableCard, Toolbar } from "@/components/ui";
import { InfoDot } from "@/components/explain";
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
      <PageHeader title="Jejak audit" purpose="Setiap perubahan penting tercatat dan tidak bisa diubah." eyebrow="Sistem" />
      <StatGrid>
        <Stat label="Entri audit" value={total.toLocaleString("id-ID")} hint="Seluruh rantai" />
        <Stat label="Jangkar" info="jangkar" value={anchors.c} hint={`${anchors.s ?? 0} diberi tanda tangan (MAC)`} />
        <Stat label="Verifikasi terakhir" value={last ? (last.ok ? "Konsisten" : "Tidak cocok") : "Belum"} tone={last ? (last.ok ? "ok" : "danger") : "default"} hint={last ? `${last.at} oleh ${last.actor}` : "Jalankan verifikasi di bawah"} />
      </StatGrid>

      {can(me, "audit.verify") && (
        <Section className="mt-8">
          <Card elevated>
            <CardHeader title="Verifikasi rantai hash" hint="Menghitung ulang setiap hash terhadap rantai tersimpan." />
            <div className="px-5 py-4"><VerifyBox /></div>
          </Card>
        </Section>
      )}
      <div className="mt-5"><SimNotice>Rantai hash membuat perubahan terdeteksi, bukan mustahil.</SimNotice><More className="mt-2 pl-1">Jangkar di basis data yang sama bukan jangkar independen. Siapa pun dengan akses penuh ke berkas basis data dapat menulis ulang seluruh rantai. Ekspor jangkar ke penyimpanan lain dan set SEHATI_ANCHOR_SECRET untuk perlindungan lebih kuat.</More></div>

      <Section className="mt-10">
        <SectionTitle title="Entri terbaru" hint="Maksimal 100 entri terbaru yang cocok." />
        <Toolbar>
          <form className="flex w-full flex-wrap items-end gap-2" role="search">
            <div className="min-w-0 flex-1 basis-64">
              <label htmlFor="q" className="field-label">Cari aksi, entitas, atau pelaku</label>
              <input id="q" name="q" defaultValue={q} placeholder="Nama aksi, entitas, atau pelaku" className="field" />
            </div>
            <button className="btn btn-primary w-full sm:w-auto">Cari</button>
            {q && <Link href="/console/audit" className="btn btn-ghost">Atur ulang</Link>}
          </form>
        </Toolbar>
        <p className="text-caption text-ink-soft">Menampilkan <span className="tabular-nums font-medium text-ink">{rows.length}</span> entri{q ? <> yang cocok dengan “{q}”</> : ""}.</p>
        <TableCard label="Entri jejak audit">
          {rows.length === 0 ? <EmptyState title="Tidak ada entri yang cocok">Coba kata kunci lain, misalnya nama aksi atau ID pelaku.</EmptyState> : (
            <table className="table-stack w-full text-left md:min-w-[44rem] text-body-sm">
              <thead><tr><th className="hidden px-4 py-2.5 text-right sm:table-cell">#</th><th className="px-4 py-2.5">Waktu</th><th className="px-4 py-2.5">Pelaku</th><th className="px-4 py-2.5">Aksi</th><th className="px-4 py-2.5">Entitas</th><th className="px-4 py-2.5"><span className="inline-flex items-center gap-1">Hash <InfoDot k="hash" /></span></th></tr></thead>
              <tbody className="align-top">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Entri" className="hidden px-4 py-3 text-right tabular-nums text-muted sm:table-cell">{r.id}</td>
                    <td data-label="Waktu" className="whitespace-nowrap px-4 py-3 font-mono text-code text-ink-soft">{r.ts}</td>
                    <td data-label="Pelaku" className="px-4 py-3 break-words">{r.actor}</td>
                    <td data-label="Aksi" className="px-4 py-3"><Pill className={`${TONE_CLASS.muted} !h-auto min-h-[22px] whitespace-normal break-all py-0.5 text-left`}>{r.action}</Pill></td>
                    <td data-label="Entitas" className="max-w-64 px-4 py-3 text-ink-soft">{r.entity} <span className="break-all font-mono text-code">{r.entity_id}</span></td>
                    <td data-label="Hash" className="px-4 py-3 font-mono text-code text-muted" title={r.hash}>{r.hash.slice(0, 10)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TableCard>
      </Section>
    </>
  );
}
