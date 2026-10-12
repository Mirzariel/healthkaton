import Link from "next/link";
import type { ReactNode } from "react";
import { AttentionRow, Inset } from "@/components/console/Parts";
import {
  IconBeaker, IconBook, IconCard, IconChart, IconChecklist, IconChevronRight, IconCpu, IconFile, IconHistory, IconInbox, IconLayers, IconSparkle, IconUpload, IconWallet,
} from "@/components/icons";
import { Card, PageHeader, SectionTitle, SimNotice, SourceBadge, Stat } from "@/components/ui";
import { getAdapters } from "@/lib/adapters";
import { queueCounts } from "@/lib/casework/queries";
import { getDb } from "@/lib/db";
import { getPrincipal } from "@/lib/server";
import { ROLE_LABEL } from "@/lib/auth/principal";
import { ADAPTER_NAME } from "@/components/adapterNames";
import { CONSOLE_NAV, navFor } from "@/lib/nav";
import { liveAvailable } from "@/lib/ai/invocations";

export const dynamic = "force-dynamic";

const n = (db: ReturnType<typeof getDb>, sql: string, ...a: unknown[]) => (db.prepare(sql).get(...a) as { c: number }).c;

const ICON: Record<string, (p: { size?: number; className?: string }) => ReactNode> = {
  "/console/cases": IconInbox,
  "/console/assistant": IconSparkle,
  "/console/precheck": IconChecklist,
  "/console/documents": IconFile,
  "/console/pending": IconLayers,
  "/console/import": IconUpload,
  "/console/standards": IconBook,
  "/console/ai": IconCpu,
  "/console/ai/evaluation": IconBeaker,
  "/console/quality": IconChart,
  "/console/cards": IconCard,
  "/console/payments": IconWallet,
  "/console/audit": IconHistory,
};

const DESC: Record<string, string> = {
  "/console/cases": "Temuan yang perlu dibuktikan dan tindakan perbaikan yang belum tuntas",
  "/console/assistant": "Saran asisten AI yang menunggu keputusan petugas",
  "/console/precheck": "Periksa kelengkapan klaim draft sebelum diajukan",
  "/console/documents": "Unggah dokumen bukti, telaah teks usulan",
  "/console/pending": "Pilah klaim yang ditunda pembayar menurut cara penanganannya",
  "/console/import": "Masukkan data dari berkas, selalu dengan pratinjau dulu",
  "/console/standards": "Standar mutu, versi, dan sumber butirnya",
  "/console/ai": "Sesi, jejak turn, konfigurasi, dan sandbox AI",
  "/console/ai/evaluation": "Ukur mutu keluaran AI pada himpunan uji",
  "/console/quality": "Indikator mutu pelayanan lintas faskes",
  "/console/cards": "Kartu pembinaan per faskes",
  "/console/payments": "Status pembayaran klaim dan keterlambatannya",
  "/console/audit": "Catatan seluruh tindakan petugas dan sistem",
};

export default async function ConsoleHome() {
  const db = getDb();
  const me = await getPrincipal("konsol");
  const open = n(db, "SELECT COUNT(*) c FROM cases WHERE lifecycle != 'closed'");
  const sig = n(db, "SELECT COUNT(*) c FROM findings WHERE proof_status = 'signal'");
  const awaiting = n(db, "SELECT COUNT(*) c FROM findings WHERE proof_status = 'awaiting_clarification'");
  const stds = n(db, "SELECT COUNT(*) c FROM standard_versions");
  const auditN = n(db, "SELECT COUNT(*) c FROM audit_log");
  const q = queueCounts(db);
  const pendingOpen = n(db, "SELECT COUNT(*) c FROM pending_triage WHERE status = 'open'");
  const docsWaiting = n(db, "SELECT COUNT(DISTINCT document_id) c FROM extractions WHERE status = 'proposed'");
  const precheckN = n(db, "SELECT COUNT(*) c FROM claims WHERE status IN ('draft','returned')");

  const ready = navFor(me.role).filter((i) => i.href !== "/console");
  const has = (href: string) => ready.some((i) => i.href === href);
  const groups = [...new Set(ready.map((i) => i.group))];
  const adapters = getAdapters(db);
  const statuses = [adapters.claimFeed, adapters.evidence, adapters.identity, adapters.notification, adapters.paymentStatus].map((x) => x.status());

  const attention = [
    has("/console/cases") && { href: "/console/cases?stage=awaiting_clarification", label: "Menunggu klarifikasi faskes", hint: "Hak jawab faskes sedang berjalan", count: awaiting, tone: awaiting ? ("warn" as const) : ("default" as const) },
    has("/console/cases") && { href: "/console/cases", label: "Bantahan faskes belum ditanggapi", hint: "Perlu tanggapan reviewer", count: q.disputes, tone: q.disputes ? ("danger" as const) : ("default" as const) },
    has("/console/cases") && { href: "/console/cases", label: "Usulan pembuktian menunggu reviewer", hint: `${q.pendingEscalations} permintaan eskalasi menunggu pihak kedua`, count: q.pendingProposals, tone: "default" as const },
    has("/console/cases") && { href: "/console/cases?tab=actions", label: "Tindakan perbaikan belum tuntas", hint: "Belum ditutup, termasuk yang menunggu tindak lanjut", count: q.actionsOpen, tone: "default" as const },
    has("/console/assistant") && { href: "/console/assistant", label: "Saran asisten menunggu keputusan", hint: "Tidak ada yang berjalan sebelum petugas memutuskan", count: q.suggestions, tone: q.suggestions ? ("warn" as const) : ("default" as const) },
    has("/console/pending") && { href: "/console/pending?status=open", label: "Pending menunggu jawaban faskes", hint: "Klaim ditunda pembayar yang belum dijawab", count: pendingOpen, tone: pendingOpen ? ("warn" as const) : ("default" as const) },
    has("/console/documents") && { href: "/console/documents", label: "Dokumen dengan teks usulan", hint: "Menunggu konfirmasi peninjau", count: docsWaiting, tone: "default" as const },
    has("/console/precheck") && { href: "/console/precheck", label: "Klaim draft atau dikembalikan", hint: "Dapat diperiksa kelengkapannya sebelum diajukan", count: precheckN, tone: "default" as const },
  ].filter(Boolean) as { href: string; label: string; hint: string; count: number; tone: "default" | "warn" | "danger" }[];

  return (
    <>
      {/* Panel komando: satu permukaan gelap berlapis sebagai titik fokus halaman. */}
      <section aria-labelledby="ringkasan-judul" className="relative isolate overflow-hidden rounded-2xl bg-night text-on-night shadow-depth-3">
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(60%_90%_at_100%_0%,rgb(47_165_143/0.18),transparent_65%)]" />
        <div className="px-5 pb-2 pt-6 md:px-7 md:pt-7">
          <p className="text-[13px] font-medium text-mint">{ROLE_LABEL[me.role]}</p>
          <h1 id="ringkasan-judul" className="mt-1.5 text-[1.6rem] font-semibold leading-tight tracking-[-0.025em] text-white md:text-[2rem]">
            Halo, {me.name.split(",")[0]}.
          </h1>
          <p className="mt-1.5 text-[14.5px] text-on-night-soft">Apa yang menunggu, dan dari mana datanya berasal.</p>
        </div>
        <div className="mt-4 grid grid-cols-2 border-t border-white/10 lg:grid-cols-4">
          {[
            { label: "Kasus berjalan", value: open, hint: "Belum ditutup", href: has("/console/cases") ? "/console/cases" : undefined },
            { label: "Temuan berstatus sinyal", value: sig, hint: "Sinyal bukan putusan", href: has("/console/cases") ? "/console/cases?stage=signal" : undefined },
            { label: "Menunggu klarifikasi faskes", value: awaiting, hint: "Hak jawab berjalan", href: has("/console/cases") ? "/console/cases?stage=awaiting_clarification" : undefined, warn: true },
            { label: "Entri jejak audit", value: auditN, hint: `${stds} versi standar tercatat`, href: has("/console/audit") ? "/console/audit" : undefined },
          ].map((k, i) => {
            const body = (
              <>
                <p className="flex items-center gap-2 text-[12.5px] font-medium text-on-night-soft">
                  {k.warn && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />}
                  {k.label}
                </p>
                <p className="mt-2 text-[1.9rem] font-semibold leading-none tracking-[-0.03em] tabular-nums text-white">{k.value.toLocaleString("id-ID")}</p>
                <p className="mt-2 text-[12px] text-on-night-soft/80">{k.hint}</p>
              </>
            );
            const cls = `block px-5 py-4 md:px-7 md:py-5 ${i % 2 === 1 ? "border-l border-white/10" : ""} ${i >= 2 ? "border-t border-white/10 lg:border-t-0" : ""} ${i === 2 ? "lg:border-l" : ""}`;
            return k.href ? (
              <Link key={k.label} href={k.href} className={`${cls} transition-colors hover:bg-white/[0.04]`}>{body}</Link>
            ) : (
              <div key={k.label} className={cls}>{body}</div>
            );
          })}
        </div>
      </section>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start">
        <div className="space-y-8">
          {attention.length > 0 && (
            <section className="space-y-3" aria-labelledby="perhatian">
              <SectionTitle id="perhatian" title="Perlu perhatian" />
              <Card elevated className="divide-y divide-line overflow-hidden">
                {attention.map((a) => <AttentionRow key={a.label} {...a} />)}
              </Card>
            </section>
          )}

          <section className="space-y-3" aria-labelledby="modul">
            <SectionTitle id="modul" title="Yang tersedia untuk peran ini" />
            {ready.length === 0 && <Card className="p-4 text-sm text-ink-soft">Belum ada halaman lain untuk peran ini.</Card>}
            <Card className="divide-y divide-line overflow-hidden">
              {groups.map((g) => (
                <div key={g}>
                  <p className="bg-subtle/60 px-4 py-1.5 text-[12.5px] font-medium text-muted">{g}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2">
                    {ready.filter((i) => i.group === g).map((i) => {
                      const Icon = ICON[i.href] ?? IconFile;
                      return (
                        <Link key={i.href} href={i.href} title={DESC[i.href] ?? i.note} className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-subtle/60">
                          <Icon size={16} className="shrink-0 text-ink-soft" />
                          <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">{i.label}</span>
                          <IconChevronRight size={15} className="shrink-0 text-line-strong transition-colors group-hover:text-ink-soft" />
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </Card>
            {CONSOLE_NAV.some((i) => !i.ready) && <p className="text-xs text-muted">Halaman lain dalam peta rute ({CONSOLE_NAV.filter((i) => !i.ready).length}) belum aktif dan tidak ditampilkan.</p>}
          </section>
        </div>

        <section className="space-y-3" aria-labelledby="integrasi">
          <SectionTitle id="integrasi" title="Integrasi dan mesin AI" />
          <Inset title="Sumber data" hint="Tidak ada koneksi produksi di lingkungan ini." flush>
            <ul className="divide-y divide-line/70 pb-1">
              {statuses.map((s) => (
                <li key={s.name} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <span className="min-w-0 text-[13.5px] text-ink">{ADAPTER_NAME[s.name] ?? s.name}</span>
                  <SourceBadge source={s.source} />
                </li>
              ))}
              <li className="px-5 py-2.5">
                <span className="text-[13.5px] text-ink">Mesin AI</span>
                <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{liveAvailable() ? "Penyedia langsung (kunci tersedia)" : "Simulator berlabel, tanpa kunci penyedia"}</p>
              </li>
            </ul>
            <details className="group border-t border-line/70 px-5 py-3">
              <summary className="cursor-pointer text-[13px] font-medium text-ink-soft hover:text-ink">Selengkapnya</summary>
              <ul className="mt-2 space-y-2.5">
                {statuses.map((s) => (
                  <li key={s.name}>
                    <p className="text-[13px] font-medium text-ink">{ADAPTER_NAME[s.name] ?? s.name}</p>
                    <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{s.detail}</p>
                  </li>
                ))}
              </ul>
            </details>
          </Inset>
          <SimNotice>Data sintetis. AI hanya menyarankan; tidak ada pembayaran, koreksi klaim, atau sanksi otomatis.</SimNotice>
        </section>
      </div>
    </>
  );
}
