"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { LinkTabs } from "@/components/ui";

export interface AiTab { href: string; label: string }

/** Tab navigasi dasbor AI (tampilan sama dengan LinkTabs bersama). Tab yang rutenya belum siap tidak dikirim oleh layout. */
export function AiTabs({ tabs }: { tabs: AiTab[] }) {
  const path = usePathname() ?? "";
  const ref = useRef<HTMLDivElement>(null);
  const active = (href: string) => (href === "/console/ai" ? path === href : path === href || path.startsWith(`${href}/`));

  /* Di HP baris tab bergulir; pastikan tab aktif terlihat tanpa menggeser halaman. */
  useEffect(() => {
    const cur = ref.current?.querySelector<HTMLElement>('[aria-current="page"]');
    const strip = cur?.closest<HTMLElement>(".scroll-x");
    if (!cur || !strip) return;
    const left = cur.offsetLeft - strip.offsetLeft;
    if (left + cur.offsetWidth > strip.clientWidth) strip.scrollLeft = left - 16;
  }, [path]);

  return (
    <div ref={ref} className="no-print mb-7">
      <LinkTabs label="Bagian dasbor AI" items={tabs.map((t) => ({ href: t.href, label: t.label, active: active(t.href) }))} />
    </div>
  );
}
