"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const ITEMS = [
  { href: "/faskes", label: "Ringkasan", exact: true },
  { href: "/faskes/klarifikasi", label: "Permintaan klarifikasi" },
  { href: "/faskes/bukti", label: "Dokumen bukti" },
  { href: "/faskes/tindakan", label: "Tindakan perbaikan" },
  { href: "/faskes/bantahan", label: "Bantahan" },
  { href: "/faskes/mutu", label: "Laporan mutu" },
];

export function FaskesNav() {
  const path = usePathname() ?? "";
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = nav.current;
    if (!el) return;
    const reveal = () => {
      const active = el.querySelector<HTMLElement>('[aria-current="page"]');
      if (!active) return;
      const r = active.getBoundingClientRect();
      const bounds = el.getBoundingClientRect();
      if (r.left < bounds.left || r.right > bounds.right) {
        el.scrollLeft += r.left - bounds.left - 8;
      }
    };
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(el);
    return () => observer.disconnect();
  }, [path]);
  return (
    <nav ref={nav} aria-label="Menu portal faskes" className="scroll-x -mx-1">
      <ul className="flex min-w-max gap-1 px-1">
        {ITEMS.map((i) => {
          // Halaman detail temuan (/faskes/temuan/…) dibuka dari ringkasan.
          const active = i.exact ? path === i.href || path.startsWith("/faskes/temuan") : path.startsWith(i.href);
          return (
            <li key={i.href}>
              <Link
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={`relative inline-flex h-11 items-center px-2.5 text-[13.5px] font-medium transition-colors after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full ${
                  active ? "text-white after:bg-mint" : "text-on-night-soft after:bg-transparent hover:text-white"
                }`}
              >
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
