import type { ReactNode } from "react";
import { AiTabs, type AiTab } from "@/components/ai/AiTabs";
import { can } from "@/lib/auth/principal";
import { CONSOLE_NAV } from "@/lib/nav";
import { getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function AiLayout({ children }: { children: ReactNode }) {
  const me = await getPrincipal("konsol");
  const tabs: AiTab[] = [];
  if (can(me, "ai.view")) tabs.push({ href: "/console/ai", label: "Operasional model" }, { href: "/console/ai/sessions", label: "Sesi dan jejak turn" }, { href: "/console/ai/standards", label: "Sumber standar" }, { href: "/console/ai/summary", label: "Ringkasan kasus" });
  if (can(me, "ai.sandbox")) tabs.push({ href: "/console/ai/sandbox", label: "Sandbox" });
  if (can(me, "ai.view")) tabs.push({ href: "/console/ai/config", label: "Konfigurasi" });
  /* Evaluasi dimiliki modul dasbor-evaluasi; tab muncul hanya bila rutenya sudah siap di registri navigasi. */
  const evalReady = CONSOLE_NAV.some((n) => n.href === "/console/ai/evaluation" && n.ready);
  if (evalReady && can(me, "ai.eval")) tabs.push({ href: "/console/ai/evaluation", label: "Evaluasi" });
  return (
    <>
      {tabs.length > 0 && <AiTabs tabs={tabs} />}
      {children}
    </>
  );
}
