"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { BottomBar, SheetLink, type BarItem } from "@/components/BottomBar";

const ITEMS = [
  { href: "/faskes", label: "Ringkasan", exact: true },
  { href: "/faskes/klarifikasi", label: "Permintaan klarifikasi" },
  { href: "/faskes/bukti", label: "Dokumen bukti" },
  { href: "/faskes/tindakan", label: "Tindakan perbaikan" },
  { href: "/faskes/bantahan", label: "Bantahan" },
  { href: "/faskes/mutu", label: "Laporan mutu" },
];

/** BottomBar portal faskes (HP/tablet): empat menu utama + "Lainnya" berisi Bantahan, Mutu, dan `extra` (mis. pemilih peran). */
const BAR: BarItem[] = [
  { href: "/faskes", label: "Ringkasan", icon: "home", exact: true, also: ["/faskes/temuan"] },
  { href: "/faskes/klarifikasi", label: "Klarifikasi", icon: "message" },
  { href: "/faskes/bukti", label: "Bukti", icon: "file" },
  { href: "/faskes/tindakan", label: "Tindakan", icon: "wrench" },
];

export function FaskesBottomBar({ extra }: { extra?: ReactNode }) {
  return (
    <BottomBar
      items={BAR}
      label="Menu portal faskes"
      sheet={
        <div className="space-y-4">
          <div className="space-y-1">
            <SheetLink href="/faskes/bantahan" label="Bantahan" icon="scale" hint="Ajukan keberatan atas temuan" />
            <SheetLink href="/faskes/mutu" label="Laporan mutu" icon="chart" hint="Ringkasan mutu layanan faskes Anda" />
          </div>
          {extra && <div className="border-t border-line pt-4">{extra}</div>}
        </div>
      }
    />
  );
}

/** Menu portal faskes untuk desktop (≥ lg): kontrol bersegmen di atas latar gelap. Di HP diganti FaskesBottomBar. */
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
    <nav ref={nav} aria-label="Menu portal faskes" className="scroll-x hidden lg:block">
      <ul className="inline-flex min-w-max gap-0.5 rounded-control bg-white/[0.06] p-1 ring-1 ring-white/10">
        {ITEMS.map((i) => {
          // Halaman detail temuan (/faskes/temuan/…) dibuka dari ringkasan.
          const active = i.exact ? path === i.href || path.startsWith("/faskes/temuan") : path.startsWith(i.href);
          return (
            <li key={i.href}>
              <Link
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex h-8 items-center rounded-lg px-3 text-body-sm font-medium transition-[background-color,color,box-shadow] duration-200 ${
                  active ? "bg-white text-ink shadow-e1" : "text-on-night-soft hover:bg-white/[0.06] hover:text-white"
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
