"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { IconMenu, IconX } from "@/components/icons";
import SehatiLogo from "@/components/SehatiLogo";

/* Navigasi beranda: transparan di atas hero gelap, menjadi permukaan malam yang padat setelah digulir. */

const ANCHORS = [
  { href: "#produk", label: "Produk" },
  { href: "#tesis", label: "Mengapa" },
  { href: "#cara-kerja", label: "Cara kerja" },
  { href: "#prinsip", label: "Prinsip" },
];

export function LandingNav() {
  const [open, setOpen] = useState(false);
  const [solid, setSolid] = useState(false);
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const on = () => setSolid(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const filled = solid || open;
  return (
    <header
      ref={root}
      className={`fixed inset-x-0 top-0 z-40 text-on-night transition-[background-color,border-color] duration-300 ${filled ? "border-b border-white/10 bg-night/85 backdrop-blur-md" : "border-b border-transparent bg-transparent"}`}
    >
      <div className="mx-auto flex h-16 max-w-[80rem] items-center gap-3 px-5 md:gap-6 md:px-10">
        <Link href="/" aria-label="SEHATI, beranda" className="shrink-0 rounded-md">
          <SehatiLogo size={26} inverse />
        </Link>

        <nav aria-label="Bagian halaman" className="hidden items-center gap-7 lg:flex">
          {ANCHORS.map((a) => (
            <a key={a.href} href={a.href} className="text-[14px] font-medium text-on-night-soft transition-colors hover:text-white">
              {a.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link href="/m" className="hidden rounded-lg px-3 py-2 text-[14px] font-medium text-on-night-soft transition-colors hover:text-white md:inline-flex">
            Aplikasi peserta
          </Link>
          <Link href="/faskes" className="hidden rounded-lg px-3 py-2 text-[14px] font-medium text-on-night-soft transition-colors hover:text-white md:inline-flex">
            Portal faskes
          </Link>
          <Link href="/console" className="btn hidden h-11 bg-white px-4 text-[14px] text-night hover:bg-white/90 sm:inline-flex">
            Konsol petugas
          </Link>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="menu-beranda"
            aria-label={open ? "Tutup menu" : "Buka menu"}
            onClick={() => setOpen((o) => !o)}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-white hover:bg-white/10 lg:hidden"
          >
            {open ? <IconX size={20} /> : <IconMenu size={20} />}
          </button>
        </div>
      </div>

      {open && (
        <div id="menu-beranda" className="max-h-[calc(100dvh-4rem)] animate-fade-in overflow-y-auto border-t border-white/10 bg-night lg:hidden">
          <nav aria-label="Menu beranda" className="mx-auto flex max-w-[80rem] flex-col px-5 py-3 md:px-10">
            {ANCHORS.map((a) => (
              <a key={a.href} href={a.href} onClick={() => setOpen(false)} className="border-b border-white/5 py-3 text-[16px] font-medium text-on-night">
                {a.label}
              </a>
            ))}
            <Link href="/m" onClick={() => setOpen(false)} className="border-b border-white/5 py-3 text-[16px] font-medium text-on-night md:hidden">Aplikasi peserta</Link>
            <Link href="/faskes" onClick={() => setOpen(false)} className="py-3 text-[16px] font-medium text-on-night md:hidden">Portal faskes</Link>
            <Link href="/console" onClick={() => setOpen(false)} className="py-3 text-[16px] font-medium text-on-night sm:hidden">Konsol petugas</Link>
          </nav>
        </div>
      )}
    </header>
  );
}
