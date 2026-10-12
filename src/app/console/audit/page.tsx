import Link from "next/link";
import { More } from "@/components/analytics/blocks";
import { VerifyBox } from "@/components/RegistryActions";
import { Card, CardHeader, EmptyState, Forbidden, PageHeader, Pill, Section, SectionTitle, SimNotice, Stat, TableCard, Toolbar } from "@/components/ui";
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
      <PageHeader title="Jejak audit" purpose="Perubahan penting tercatat berantai hash dan tidak dapat diubah lewat aplikasi." eyebrow="Sistem" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Entri audit" value={total.toLocaleString("id-ID")} hint="Seluruh rantai" />
        <Stat label="Jangkar" value={anchors.c} hint={`${anchors.s ?? 0} diberi tanda tangan (MAC)`} />
        <div className="col-span-2 sm:col-span-1">
          <Stat label="Verifikasi terakhir" value={last ? (last.ok ? "Konsisten" : "Tidak cocok") : "Belum"} tone={last ? (last.ok ? "ok" : "danger") : "default"} hint={last ? `${last.at} oleh ${last.actor}` : "Jalankan verifikasi di bawah"} />
        </div>
      </div>

      {can(me, "audit.verify") && (
        <Section className="mt-8">
          <Card elevated>
            <CardHeader title="Verifikasi rantai hash" hint="Menghitung ulang setiap hash terhadap rantai tersimpan." />
            <div className="px-5 py-4"><VerifyBox /></div>
          </Card>
        </Section>
      )}
      <div className="mt-5"><SimNotice>Rantai hash membuat perubahan terdeteksi, bukan mustahil. Jangkar di basis data yang sama bukan jangkar independen.</SimNotice><More className="mt-2 pl-1">Siapa pun dengan akses penuh ke berkas basis data dapat menulis ulang seluruh rantai. Ekspor jangkar ke penyimpanan lain dan set SEHATI_ANCHOR_SECRET untuk perlindungan lebih kuat.</More></div>

      <Section className="mt-10">
        <SectionTitle title="Entri terbaru" hint="Maksimal 100 entri terbaru yang cocok." />
        <Toolbar>
          <form className="flex w-full flex-wrap items-end gap-2" role="search">
            <div className="min-w-0 flex-1 basis-64">
              <label htmlFor="q" className="field-label">Cari aksi, entitas, atau pelaku</label>
              <input id="q" name="q" defaultValue={q} placeholder="Nama aksi, entitas, atau pelaku" className="field" />
            </div>
            <button className="btn btn-primary">Cari</button>
            {q && <Link href="/console/audit" className="btn btn-ghost">Atur ulang</Link>}
          </form>
        </Toolbar>
        <p className="text-[13px] text-ink-soft">Menampilkan <span className="tabular-nums font-medium text-ink">{rows.length}</span> entri{q ? <> yang cocok dengan “{q}”</> : ""}.</p>
        <TableCard label="Entri jejak audit">
          {rows.length === 0 ? <EmptyState title="Tidak ada entri yang cocok">Coba kata kunci lain, misalnya nama aksi atau ID pelaku.</EmptyState> : (
            <table className="w-full min-w-[44rem] text-left text-[13.5px]">
              <thead><tr><th className="hidden px-4 py-2.5 text-right sm:table-cell">#</th><th className="px-4 py-2.5">Waktu</th><th className="px-4 py-2.5">Pelaku</th><th className="px-4 py-2.5">Aksi</th><th className="px-4 py-2.5">Entitas</th><th className="px-4 py-2.5">Hash</th></tr></thead>
              <tbody className="align-top">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="hidden px-4 py-3 text-right tabular-nums text-muted sm:table-cell">{r.id}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-[12px] text-ink-soft">{r.ts}</td>
                    <td className="px-4 py-3 break-words">{r.actor}</td>
                    <td className="px-4 py-3"><Pill className={`${TONE_CLASS.muted} !h-auto min-h-[22px] whitespace-normal break-all py-0.5 text-left`}>{r.action}</Pill></td>
                    <td className="max-w-64 px-4 py-3 text-ink-soft">{r.entity} <span className="break-all font-mono text-[12px]">{r.entity_id}</span></td>
                    <td className="px-4 py-3 font-mono text-[11.5px] text-muted" title={r.hash}>{r.hash.slice(0, 10)}…</td>
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
