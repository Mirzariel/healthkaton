import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "@/components/Brand";
import { FaskesNav } from "@/components/casework/FaskesNav";
import { PersonaSwitcher, type PersonaOption } from "@/components/Shell";
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
    <div className="min-h-screen bg-paper">
      <header className="no-print border-b border-line bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8">
          <Link href="/" aria-label="Beranda SEHATI"><Brand size={28} /></Link>
          <div className="flex flex-wrap items-center gap-3 text-sm text-ink-soft">
            <span>Portal faskes · <span className="font-semibold text-ink">{fac ?? "-"}</span> · {me.name}</span>
            <PersonaSwitcher options={options} />
          </div>
        </div>
        <div className="mx-auto max-w-5xl px-4 md:px-8"><FaskesNav /></div>
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-8">{children}</main>
      <footer className="mx-auto max-w-5xl px-4 pb-8 text-xs text-muted md:px-8">Data pada lingkungan ini sintetis. Portal ini tidak mengubah klaim, pembayaran, atau sanksi. Anda hanya melihat data faskes Anda sendiri.</footer>
    </div>
  );
}
