"use client";

import { useEffect, useState } from "react";

export interface SectionNavItem { id: string; label: string }

/** Daftar lompat "Di halaman ini": menempel di bawah bilah atas, menandai bagian yang sedang dibaca. Tidak ikut dicetak. */
export function SectionNav({ items, label = "Di halaman ini" }: { items: SectionNavItem[]; label?: string }) {
  const [current, setCurrent] = useState(items[0]?.id ?? "");
  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    if (!els.length || typeof IntersectionObserver === "undefined") return;
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        const first = els.find((el) => seen.get(el.id));
        if (first) setCurrent(first.id);
      },
      { rootMargin: "-96px 0px -60% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items]);
  return (
    <nav aria-label={label} className="no-print sticky top-14 z-20 -mx-4 border-b border-line bg-paper/95 px-4 backdrop-blur-sm md:-mx-8 md:px-8">
      <div className="scroll-x">
        <ul className="flex min-w-max items-center gap-1 py-1.5">
          <li className="pr-2 text-caption text-muted">{label}</li>
          {items.map((i) => (
            <li key={i.id}>
              <a
                href={`#${i.id}`}
                aria-current={current === i.id ? "location" : undefined}
                className={`inline-flex h-7 items-center rounded-md px-2.5 text-caption font-medium transition-colors ${current === i.id ? "bg-ink text-white" : "text-ink-soft hover:bg-subtle hover:text-ink"}`}
              >
                {i.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
