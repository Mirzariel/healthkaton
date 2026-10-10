import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "@/components/Brand";
import { MobileMenu, NavLinks, PersonaSwitcher, ResetDemoButton, type PersonaOption } from "@/components/Shell";
import { ROLE_HINT, ROLE_LABEL } from "@/lib/auth/principal";
import { demoRolesEnabled, getPrincipal, listPersonas } from "@/lib/server";
import { navFor } from "@/lib/nav";

export const dynamic = "force-dynamic";

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const me = await getPrincipal("konsol");
  const items = navFor(me.role);
  const demo = demoRolesEnabled();
  const options: PersonaOption[] = demo
    ? listPersonas("konsol").map((p) => ({ userId: p.id.split(":")[1], label: p.name, roleLabel: ROLE_LABEL[p.role], hint: ROLE_HINT[p.role], current: p.id === me.id }))
    : [];
  const side = (
    <>
      <PersonaSwitcherSlot options={options} />
      {demo && me.role === "admin" && <ResetDemoButton />}
    </>
  );
  return (
    <div className="min-h-screen bg-paper md:flex">
      <aside className="no-print hidden w-64 shrink-0 flex-col gap-6 bg-brand-deep p-5 text-white md:flex">
        <Link href="/" aria-label="Beranda SEHATI"><Brand dark size={30} /></Link>
        <NavLinks items={items} />
        <div className="mt-auto space-y-3">{demo && me.role === "admin" && <ResetDemoButton />}<p className="text-[11px] leading-relaxed text-white/50">Data pada lingkungan ini sintetis. Tidak ada tindakan yang mengubah klaim, pembayaran, atau sanksi.</p></div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-line bg-card px-4 py-3 md:px-8">
          <div className="flex items-center gap-3 md:hidden">
            <MobileMenu items={items}>{side}</MobileMenu>
            <Brand size={26} />
          </div>
          <p className="hidden text-sm text-ink-soft md:block">
            Masuk sebagai <span className="font-semibold text-ink">{me.name}</span> · {ROLE_LABEL[me.role]}
          </p>
          <PersonaSwitcher options={options} />
        </div>
        <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}

function PersonaSwitcherSlot({ options }: { options: PersonaOption[] }) {
  return <PersonaSwitcher options={options} tone="dark" />;
}
