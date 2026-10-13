"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** Judul halaman ringkas di bilah atas, muncul setelah judul utama (PageHeader, [data-page-title]) tergulir keluar. */
export function StickyTitle({ className = "", offset = 56 }: { className?: string; offset?: number }) {
  const path = usePathname();
  const [title, setTitle] = useState<string | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    setShown(false);
    setTitle(null);
    let io: IntersectionObserver | null = null;
    let mo: MutationObserver | null = null;
    const attach = () => {
      const el = document.querySelector<HTMLElement>("main [data-page-title]");
      if (!el) return false;
      setTitle(el.dataset.pageTitle ?? null);
      const h1 = el.querySelector("h1") ?? el;
      io = new IntersectionObserver(([e]) => setShown(!e.isIntersecting && e.boundingClientRect.top < offset), { rootMargin: `-${offset}px 0px 0px 0px` });
      io.observe(h1);
      return true;
    };
    if (!attach()) {
      mo = new MutationObserver(() => {
        if (attach()) mo?.disconnect();
      });
      mo.observe(document.body, { childList: true, subtree: true });
    }
    return () => {
      io?.disconnect();
      mo?.disconnect();
    };
  }, [path, offset]);

  return (
    <p
      aria-hidden={!shown}
      className={`min-w-0 truncate border-l border-line-strong pl-3 text-body-sm font-semibold text-ink transition-[opacity,transform] duration-200 ease-out ${shown && title ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1 opacity-0"} ${className}`}
    >
      {title}
    </p>
  );
}
