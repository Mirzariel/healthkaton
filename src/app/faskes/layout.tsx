import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "@/components/Brand";
import { FaskesNav } from "@/components/casework/FaskesNav";
import { IconHospital } from "@/components/icons";
import { Avatar, PersonaSwitcher, type PersonaOption } from "@/components/Shell";
import { ROLE_HINT, ROLE_LABEL } from "@/lib/auth/principal";
import { demoRolesEnabled, getPrincipal, listPersonas } from "@/lib/server";
import { getDb } from "@/lib/db";
import { lapseIfDue } from "@/lib/casework/workflow";

export const dynamic = "force-dynamic";

export default async function FaskesLayout({ children }: { children: ReactNode }) {
  const me = await getPrincipal("faskes");
  lapseIfDue(getDb());
  const demo = demoRolesEnabled();
  const options: PersonaOption[] = demo
    ? listPersonas("faskes").map((p) => ({ userId: p.id.split(":")[1], label: p.name, roleLabel: ROLE_LABEL[p.role], hint: ROLE_HINT[p.role], current: p.id === me.id }))
    : [];
  const fac = me.facilityId ? (getDb().prepare("SELECT name FROM facilities WHERE id = ?").get(me.facilityId) as { name: string } | undefined)?.name : null;
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow-depth-2">
        Lompat ke konten
      </a>
      <header className="no-print sticky top-0 z-30 bg-night text-on-night">
        <div className="mx-auto flex max-w-[72rem] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pt-3 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" aria-label="Beranda SEHATI" className="rounded-md">
              <Brand size={22} dark />
            </Link>
            <span className="h-5 w-px bg-white/15" aria-hidden />
            <span className="text-[13px] font-medium text-on-night-soft">Portal faskes</span>
          </div>
          <div className="flex min-w-0 items-center gap-3">
            <div className="hidden lg:block">
              <PersonaSwitcher options={options} tone="dark" />
            </div>
            <div className="flex min-w-0 items-center gap-2.5 lg:border-l lg:border-white/15 lg:pl-3">
              <Avatar name={me.name} />
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[13px] font-semibold text-white">{me.name}</p>
                <p className="flex items-center gap-1 truncate text-[12px] text-on-night-soft">
                  <IconHospital size={13} className="shrink-0" />
                  {fac ?? "-"}
                </p>
              </div>
            </div>
          </div>
        </div>
        {options.length > 0 && (
          <div className="mx-auto max-w-[72rem] px-4 pt-2 md:px-8 lg:hidden">
            <PersonaSwitcher options={options} tone="dark" />
          </div>
        )}
        <div className="mx-auto mt-1 max-w-[72rem] px-4 md:px-8">
          <FaskesNav />
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-[72rem] flex-1 px-4 pb-14 pt-6 md:px-8 md:pt-8">
        {children}
      </main>
      <footer className="border-t border-line">
        <p className="mx-auto max-w-[72rem] px-4 py-5 text-[12px] leading-relaxed text-muted md:px-8">
          Prototipe dengan data sintetis; bukan produk resmi BPJS Kesehatan. Portal ini tidak mengubah klaim, pembayaran, atau sanksi. Anda hanya melihat data faskes Anda sendiri.
        </p>
      </footer>
    </div>
  );
}
