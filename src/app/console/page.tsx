import Link from "next/link";
import { Card, PageHeader, SectionTitle, SimNotice, SourceBadge, Stat } from "@/components/ui";
import { getAdapters } from "@/lib/adapters";
import { getDb } from "@/lib/db";
import { getPrincipal } from "@/lib/server";
import { CONSOLE_NAV, navFor } from "@/lib/nav";
import { liveAvailable } from "@/lib/ai/invocations";

export const dynamic = "force-dynamic";

const n = (db: ReturnType<typeof getDb>, sql: string, ...a: unknown[]) => (db.prepare(sql).get(...a) as { c: number }).c;

export default async function ConsoleHome() {
  const db = getDb();
  const me = await getPrincipal("konsol");
  const open = n(db, "SELECT COUNT(*) c FROM cases WHERE lifecycle != 'closed'");
  const sig = n(db, "SELECT COUNT(*) c FROM findings WHERE proof_status = 'signal'");
  const awaiting = n(db, "SELECT COUNT(*) c FROM findings WHERE proof_status = 'awaiting_clarification'");
  const stds = n(db, "SELECT COUNT(*) c FROM standard_versions");
  const auditN = n(db, "SELECT COUNT(*) c FROM audit_log");
  const ready = navFor(me.role).filter((i) => i.href !== "/console");
  const adapters = getAdapters(db);
  const statuses = [adapters.claimFeed, adapters.evidence, adapters.identity, adapters.notification, adapters.paymentStatus].map((x) => x.status());
  return (
    <>
      <PageHeader title="Ringkasan" purpose="Titik awal petugas: apa yang menunggu, dan di mana sumber datanya berasal." eyebrow="Konsol petugas" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Kasus berjalan" value={open} hint="Seluruh kasus yang belum ditutup" />
        <Stat label="Temuan berstatus sinyal" value={sig} hint="Belum ditinjau; sinyal bukan putusan" />
        <Stat label="Menunggu klarifikasi faskes" value={awaiting} hint="Hak jawab faskes berjalan" tone="warn" />
        <Stat label="Entri jejak audit" value={auditN} hint={`${stds} versi standar tercatat`} />
      </div>
      <section className="mt-8 space-y-3">
        <SectionTitle title="Yang tersedia untuk peran ini" hint="Menu hanya memuat halaman yang sudah berfungsi." />
        <Card className="divide-y divide-line">
          {ready.length === 0 && <p className="p-4 text-sm text-ink-soft">Belum ada halaman lain untuk peran ini.</p>}
          {ready.map((i) => (
            <Link key={i.href} href={i.href} className="block px-4 py-3 text-sm font-medium hover:bg-brand-soft/50">{i.label}</Link>
          ))}
        </Card>
        <p className="text-xs text-muted">Halaman lain dalam peta rute ({CONSOLE_NAV.filter((i) => !i.ready).length}) belum aktif dan tidak ditampilkan.</p>
      </section>
      <section className="mt-8 space-y-3">
        <SectionTitle title="Integrasi dan mesin AI" hint="Status jujur setiap sumber: yang nyata, yang simulasi, yang belum tersedia." />
        <Card className="divide-y divide-line">
          {statuses.map((s) => (
            <div key={s.name} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <span className="font-medium">{s.name}</span>
              <span className="flex items-center gap-2 text-ink-soft"><span className="hidden sm:inline">{s.detail}</span><SourceBadge source={s.source} /></span>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
            <span className="font-medium">Mesin AI</span>
            <span className="text-ink-soft">{liveAvailable() ? "Penyedia langsung dikonfigurasi (kunci tersedia)" : "Simulator deterministik berlabel (tidak ada kunci penyedia)"}</span>
          </div>
        </Card>
        <SimNotice>Seluruh data pada lingkungan ini sintetis. Hasil AI hanya menyarankan; keputusan ada pada petugas. Tidak ada pembayaran, koreksi klaim, atau sanksi otomatis.</SimNotice>
      </section>
    </>
  );
}
