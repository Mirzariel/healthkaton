"use client";

import { usePathname } from "next/navigation";
import { LinkTabs } from "@/components/ui";

export interface AiTab { href: string; label: string }

/** Tab navigasi dasbor AI (tampilan sama dengan LinkTabs bersama). Tab yang rutenya belum siap tidak dikirim oleh layout. */
export function AiTabs({ tabs }: { tabs: AiTab[] }) {
  const path = usePathname() ?? "";
  const active = (href: string) => (href === "/console/ai" ? path === href : path === href || path.startsWith(`${href}/`));
  return (
    <div className="no-print mb-7">
      <LinkTabs label="Bagian dasbor AI" items={tabs.map((t) => ({ href: t.href, label: t.label, active: active(t.href) }))} />
    </div>
  );
}
