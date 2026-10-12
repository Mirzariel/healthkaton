import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "@/components/Brand";
import { Avatar, MobileMenu, NavLinks, PersonaSwitcher, ResetDemoButton, type PersonaOption } from "@/components/Shell";
import { ROLE_HINT, ROLE_LABEL } from "@/lib/auth/principal";
import { demoRolesEnabled, getPrincipal, listPersonas } from "@/lib/server";
import { navFor } from "@/lib/nav";

export const dynamic = "force-dynamic";

const DISCLAIMER = "Prototipe dengan data sintetis. Bukan produk resmi BPJS Kesehatan dan tidak terhubung ke sistemnya. Tidak ada tindakan yang mengubah klaim, pembayaran, atau sanksi.";

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const me = await getPrincipal("konsol");
  const items = navFor(me.role);
  const demo = demoRolesEnabled();
  const options: PersonaOption[] = demo
    ? listPersonas("konsol").map((p) => ({ userId: p.id.split(":")[1], label: p.name, roleLabel: ROLE_LABEL[p.role], hint: ROLE_HINT[p.role], current: p.id === me.id }))
    : [];
  return (
    <div className="min-h-screen bg-paper lg:grid lg:grid-cols-[15.5rem_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow-depth-2">
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
        <div className="shrink-0 space-y-2 border-t border-white/10 px-2.5 py-3">
          {demo && me.role === "admin" && <ResetDemoButton />}
          <p className="px-2.5 text-[11.5px] leading-relaxed text-on-night-soft/70">{DISCLAIMER}</p>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Bilah atas */}
        <header className="no-print sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur-sm supports-[backdrop-filter]:bg-paper/80">
          <div className="flex h-14 items-center justify-between gap-3 px-4 md:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-2 lg:hidden">
              <MobileMenu items={items} brand={<Brand size={22} dark />}>
                <PersonaSwitcher options={options} layout="stacked" tone="dark" />
                {demo && me.role === "admin" && <ResetDemoButton />}
                <p className="text-[11.5px] leading-relaxed text-on-night-soft/70">{DISCLAIMER}</p>
              </MobileMenu>
              <Link href="/" aria-label="Beranda SEHATI" className="rounded-md">
                <Brand size={20} />
              </Link>
            </div>
            <div className="hidden min-w-0 items-center gap-2 text-[13px] lg:flex">
              <span className="font-medium text-ink">Konsol petugas</span>
              <span className="text-line-strong" aria-hidden>/</span>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-card px-2 py-0.5 text-[12px] font-medium text-muted ring-1 ring-line">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
                Lingkungan demo · data sintetis
              </span>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden lg:block">
                <PersonaSwitcher options={options} />
              </div>
              <div className="flex items-center gap-2.5 lg:border-l lg:border-line lg:pl-4">
                <Avatar name={me.name} />
                <div className="hidden min-w-0 leading-tight sm:block">
                  <p className="truncate text-[13px] font-semibold text-ink">{me.name.split(",")[0]}</p>
                  <p className="text-[12px] text-muted">{ROLE_LABEL[me.role]}</p>
                </div>
              </div>
            </div>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[76rem] px-4 pb-16 pt-6 md:px-8 md:pt-8">
          {children}
        </main>
      </div>
    </div>
  );
}
