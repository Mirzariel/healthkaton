"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/faskes", label: "Ringkasan", exact: true },
  { href: "/faskes/klarifikasi", label: "Permintaan klarifikasi" },
  { href: "/faskes/bukti", label: "Dokumen bukti" },
  { href: "/faskes/tindakan", label: "Tindakan perbaikan" },
  { href: "/faskes/bantahan", label: "Bantahan" },
  { href: "/faskes/mutu", label: "Laporan mutu" },
];

export function FaskesNav() {
  const path = usePathname();
  return (
    <nav aria-label="Menu portal faskes" className="-mb-px flex gap-1 overflow-x-auto">
      {ITEMS.map((i) => {
        const active = i.exact ? path === i.href : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium ${active ? "border-brand text-brand" : "border-transparent text-ink-soft hover:text-ink"}`}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
