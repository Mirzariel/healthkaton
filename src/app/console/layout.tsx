import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "@/components/Brand";
import { BottomBar, type BarItem } from "@/components/BottomBar";
import { Avatar, DemoChip, MobileMenu, NavLinks, PersonaSwitcher, ResetDemoButton, type PersonaOption } from "@/components/Shell";
import { StickyTitle } from "@/components/StickyTitle";
import { ROLE_HINT, ROLE_LABEL } from "@/lib/auth/principal";
import { demoRolesEnabled, getPrincipal, listPersonas } from "@/lib/server";
import { navFor } from "@/lib/nav";

export const dynamic = "force-dynamic";

const DISCLAIMER = "Prototipe dengan data sintetis. Bukan produk resmi BPJS Kesehatan dan tidak terhubung ke sistemnya. Tidak ada tindakan yang mengubah klaim, pembayaran, atau sanksi.";

/** Label pendek + ikon untuk BottomBar (HP). Label lengkap tetap di laci menu. */
const BAR: Record<string, { label: string; icon: string }> = {
  "/console": { label: "Ringkasan", icon: "home" },
  "/console/cases": { label: "Antrean", icon: "inbox" },
  "/console/assistant": { label: "Asisten AI", icon: "sparkle" },
  "/console/precheck": { label: "Pra-ajuan", icon: "checklist" },
  "/console/documents": { label: "Dokumen", icon: "file" },
  "/console/pending": { label: "Pending", icon: "layers" },
  "/console/import": { label: "Impor", icon: "upload" },
};

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const me = await getPrincipal("konsol");
  const items = navFor(me.role);
  const bar: BarItem[] = items
    .filter((i) => i.group === "Kerja")
    .slice(0, 3)
    .map((i) => ({ href: i.href, label: BAR[i.href]?.label ?? i.label, icon: BAR[i.href]?.icon ?? "file", exact: i.href === "/console" }));
  const demo = demoRolesEnabled();
  const options: PersonaOption[] = demo
    ? listPersonas("konsol").map((p) => ({ userId: p.id.split(":")[1], label: p.name, roleLabel: ROLE_LABEL[p.role], hint: ROLE_HINT[p.role], current: p.id === me.id }))
    : [];
  return (
    <div className="min-h-screen bg-paper lg:grid lg:grid-cols-[15.5rem_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-control focus:bg-card focus:px-3 focus:py-2 focus:text-body-sm focus:shadow-e2">
        Lompat ke konten
      </a>

      {/* Sisi kiri (desktop) */}
      <aside className="no-print sticky top-0 hidden h-screen flex-col bg-night text-on-night lg:flex">
        <div className="flex h-14 shrink-0 items-center px-4">
          <Link href="/" aria-label="Beranda SEHATI" className="rounded-md">
            <Brand size={22} dark />
          </Link>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-4 pt-2">
          <NavLinks items={items} />
        </div>
        {demo && me.role === "admin" && (
          <div className="shrink-0 border-t border-white/10 px-2.5 py-3">
            <ResetDemoButton />
          </div>
        )}
      </aside>

      <div className="min-w-0">
        {/* Bilah atas */}
        <header className="glass no-print sticky top-0 z-30 border-b border-line">
          <div className="flex h-14 items-center justify-between gap-3 px-4 md:px-6 lg:px-8">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <MobileMenu items={items} brand={<Brand size={22} dark />} trigger={false}>
                <PersonaSwitcher options={options} layout="stacked" tone="dark" />
                {demo && me.role === "admin" && <ResetDemoButton />}
                <p className="text-caption leading-relaxed text-on-night-soft/70">{DISCLAIMER}</p>
              </MobileMenu>
              <Link href="/" aria-label="Beranda SEHATI" className="shrink-0 rounded-md lg:hidden">
                <Brand size={20} />
              </Link>
              <span className="hidden shrink-0 text-caption font-medium text-ink lg:inline">Konsol petugas</span>
              <StickyTitle />
            </div>
            <div className="flex shrink-0 items-center gap-3 lg:gap-4">
              <DemoChip />
              <div className="hidden lg:block">
                <PersonaSwitcher options={options} />
              </div>
              <div className="flex items-center gap-2.5 lg:border-l lg:border-line lg:pl-4">
                <Avatar name={me.name} />
                <div className="hidden min-w-0 leading-tight sm:block">
                  <p className="truncate text-caption font-semibold text-ink">{me.name.split(",")[0]}</p>
                  <p className="text-caption text-muted">{ROLE_LABEL[me.role]}</p>
                </div>
              </div>
            </div>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[76rem] px-4 pb-24 pt-6 md:px-8 md:pt-8 lg:pb-16">
          {children}
        </main>
        <BottomBar items={bar} label="Menu konsol utama" />
      </div>
    </div>
  );
}
