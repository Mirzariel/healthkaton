"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  IconArrowUpRight,
  IconChevronDown,
  IconHospital,
  IconMenu,
  IconPhone,
  IconShield,
  IconX,
} from "@/components/icons";
import SehatiLogo from "@/components/SehatiLogo";
import css from "./landing.module.css";

/* Navigasi beranda.
   Di puncak: bilah transparan di atas hero. Setelah digulir: pil kaca yang mengambang.
   "Coba demo" membuka tiga pintu (peserta, faskes, petugas). Di HP: lembar menu layar penuh. */

const ANCHORS = [
  { href: "#cara-kerja", label: "Cara kerja" },
  { href: "#prinsip", label: "Prinsip" },
];

const DOORS = [
  {
    href: "/m",
    Icon: IconPhone,
    title: "Aplikasi peserta",
    body: "Jawab satu pertanyaan.",
  },
  {
    href: "/faskes",
    Icon: IconHospital,
    title: "Portal faskes",
    body: "Klarifikasi dengan bukti.",
  },
  {
    href: "/console",
    Icon: IconShield,
    title: "Konsol petugas",
    body: "Periksa, lalu putuskan.",
  },
];

function Chip({ light = false }: { light?: boolean }) {
  return (
    <span
      className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-caption font-medium ring-1 ring-inset transition-colors duration-500 ${light ? "bg-ink/4 text-ink-soft ring-ink/8" : "bg-white/8 text-on-night-soft ring-white/12"}`}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${light ? "bg-brand" : "bg-mint"}`}
      />
      Demo · data sintetis
    </span>
  );
}

export function LandingNav() {
  const [solid, setSolid] = useState(false);
  const [demo, setDemo] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [tone, setTone] = useState<"dark" | "light">("dark");
  const demoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const on = () => setSolid(window.scrollY > 32);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  /* Tema pil mengikuti permukaan yang sedang berada di bawahnya. Garis pantau tipis di y ≈ 34px (tengah pil).
     Bila dua permukaan bertumpuk (lembaran gelap di atas yang terang), yang data-nav-z lebih tinggi menang. */
  useEffect(() => {
    const els = Array.from(
      document.querySelectorAll<HTMLElement>("[data-nav]"),
    );
    if (!els.length) return;
    const hit = new Set<HTMLElement>();
    let io: IntersectionObserver | null = null;
    const pick = () => {
      let best: HTMLElement | null = null;
      hit.forEach((el) => {
        if (
          !best ||
          Number(el.dataset.navZ ?? 0) > Number(best.dataset.navZ ?? 0)
        )
          best = el;
      });
      if (best)
        setTone(
          (best as HTMLElement).dataset.nav === "light" ? "light" : "dark",
        );
    };
    const make = () => {
      io?.disconnect();
      hit.clear();
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) =>
            e.isIntersecting
              ? hit.add(e.target as HTMLElement)
              : hit.delete(e.target as HTMLElement),
          );
          pick();
        },
        {
          rootMargin: `-34px 0px -${Math.max(0, window.innerHeight - 36)}px 0px`,
        },
      );
      els.forEach((el) => io!.observe(el));
    };
    make();
    window.addEventListener("resize", make);
    return () => {
      window.removeEventListener("resize", make);
      io?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!demo && !sheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDemo(false);
        setSheet(false);
      }
    };
    const onDown = (e: MouseEvent) => {
      if (
        demo &&
        demoRef.current &&
        !demoRef.current.contains(e.target as Node)
      )
        setDemo(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [demo, sheet]);

  // Kunci gulir halaman selama lembar menu HP terbuka.
  useEffect(() => {
    if (!sheet) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, [sheet]);

  const pill = solid && !sheet;
  const light = pill && tone === "light";

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 pt-3 transition-colors duration-500 ${light ? "text-ink" : "text-on-night"}`}
    >
      {/* Lebar sama dengan wadah isi halaman (WRAP): tepi logo dan tombol sejajar dengan tepi teks di bawahnya. */}
      <div className="mx-auto w-full max-w-[80rem] px-4 sm:px-6 md:px-10">
        <div
          className={`-mx-2 flex h-14 items-center gap-2 rounded-full pl-2 pr-1.5 transition-[background-color,box-shadow,backdrop-filter] duration-500 ease-out-expo md:-mx-5 md:gap-6 md:pl-5 ${pill ? (light ? css.glassLight : css.glass) : "bg-transparent"}`}
        >
          <Link
            href="/"
            aria-label="SEHATI, beranda"
            className="flex h-11 shrink-0 items-center rounded-md"
          >
            <SehatiLogo size={24} inverse={!light} />
          </Link>

          <nav
            aria-label="Bagian halaman"
            className="hidden items-center gap-1 md:flex"
          >
            {ANCHORS.map((a) => (
              <a
                key={a.href}
                href={a.href}
                className={`rounded-full px-3 py-2 text-body-sm font-medium transition-colors ${light ? "text-ink-soft hover:text-ink" : "text-on-night-soft hover:text-white"}`}
              >
                {a.label}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden lg:inline-flex">
              <Chip light={light} />
            </span>

            <div ref={demoRef} className="relative hidden md:block">
              <button
                type="button"
                aria-expanded={demo}
                aria-controls="pintu-demo"
                onClick={() => setDemo((o) => !o)}
                className={`inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-body-sm font-semibold transition-colors duration-500 ${light ? "bg-ink text-white hover:bg-ink/85" : "bg-white text-night hover:bg-white/90"}`}
              >
                Coba demo
                <IconChevronDown
                  size={16}
                  className={`transition-transform duration-300 ${demo ? "rotate-180" : ""}`}
                />
              </button>
              {demo && (
                <div
                  id="pintu-demo"
                  className={`absolute right-0 top-[calc(100%+0.75rem)] w-80 animate-fade-in rounded-panel p-2 ${css.glass}`}
                >
                  <ul>
                    {DOORS.map(({ href, Icon, title, body }) => (
                      <li key={href}>
                        <Link
                          href={href}
                          onClick={() => setDemo(false)}
                          className="group flex items-center gap-3 rounded-card p-3 transition-colors hover:bg-white/8"
                        >
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-white/8 text-mint ring-1 ring-inset ring-white/10">
                            <Icon size={20} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-body font-semibold text-white">
                              {title}
                            </span>
                            <span className="block text-body-sm text-on-night-soft">
                              {body}
                            </span>
                          </span>
                          <IconArrowUpRight
                            size={16}
                            className="text-on-night-soft transition-colors group-hover:text-white"
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <button
              type="button"
              aria-expanded={sheet}
              aria-controls="menu-beranda"
              aria-label={sheet ? "Tutup menu" : "Buka menu"}
              onClick={() => setSheet((o) => !o)}
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-full md:hidden ${light ? "text-ink" : "text-white"} ${pill || sheet ? "" : css.glass}`}
            >
              {sheet ? <IconX size={20} /> : <IconMenu size={20} />}
            </button>
          </div>
        </div>
      </div>

      {sheet && (
        <div
          id="menu-beranda"
          className="fixed inset-0 top-0 -z-10 animate-fade-in overflow-y-auto bg-night/96 px-4 pb-10 pt-24 backdrop-blur-xl md:hidden"
        >
          <nav aria-label="Menu beranda">
            <ul>
              {ANCHORS.map((a) => (
                <li key={a.href}>
                  <a
                    href={a.href}
                    onClick={() => setSheet(false)}
                    className="flex min-h-14 items-center text-title-1 font-semibold tracking-tight text-white"
                  >
                    {a.label}
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-10 text-body-sm font-medium text-mint">
              Coba demo
            </p>
            <ul className="mt-3 space-y-2">
              {DOORS.map(({ href, Icon, title, body }) => (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => setSheet(false)}
                    className="flex items-center gap-4 rounded-card bg-white/6 p-4 ring-1 ring-inset ring-white/10 active:bg-white/10"
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-control bg-white/8 text-mint">
                      <Icon size={22} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-body-lg font-semibold text-white">
                        {title}
                      </span>
                      <span className="block text-body-sm text-on-night-soft">
                        {body}
                      </span>
                    </span>
                    <IconArrowUpRight
                      size={18}
                      className="text-on-night-soft"
                    />
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <Chip />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
