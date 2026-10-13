"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconChevronRight } from "@/components/icons";

/** Keeps wide data local to its panel and explains scrolling only when it is needed. */
export function TableFrame({ children, className = "", label = "Tabel data" }: { children: ReactNode; className?: string; label?: string }) {
  const scroll = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const el = scroll.current;
    if (!el) return;
    const measure = () => setWide(el.scrollWidth > el.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (content.current) observer.observe(content.current);
    return () => observer.disconnect();
  }, [children]);
  return (
    <div className={`table-frame min-w-0 max-w-full overflow-hidden rounded-card bg-card shadow-e1 ${className}`}>
      <div ref={scroll} className="scroll-x table-scroll rounded-[inherit] focus-visible:outline-offset-[-2px]" role="region" aria-label={label} tabIndex={0}>
        <div ref={content}>{children}</div>
      </div>
      {wide && <p className="table-hint no-print flex items-center gap-1.5 border-t border-line px-3 py-2 text-caption text-muted"><IconChevronRight size={14} /> Geser tabel untuk melihat semua kolom<span className="sr-only">. Dengan papan ketik, gunakan tombol panah kiri dan kanan.</span></p>}
    </div>
  );
}
