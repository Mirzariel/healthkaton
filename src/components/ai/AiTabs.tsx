"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface AiTab { href: string; label: string }

/** Tab navigasi dasbor AI. Tab yang rutenya belum siap tidak dikirim oleh layout. */
export function AiTabs({ tabs }: { tabs: AiTab[] }) {
  const path = usePathname() ?? "";
  const active = (href: string) => (href === "/console/ai" ? path === href : path === href || path.startsWith(`${href}/`));
  return (
    <nav aria-label="Bagian dasbor AI" className="-mx-1 mb-6 overflow-x-auto border-b border-line">
      <ul className="flex min-w-max gap-1 px-1">
        {tabs.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              aria-current={active(t.href) ? "page" : undefined}
              className={`inline-block border-b-2 px-3 py-2 text-sm font-semibold ${active(t.href) ? "border-brand text-ink" : "border-transparent text-ink-soft hover:text-ink"}`}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
