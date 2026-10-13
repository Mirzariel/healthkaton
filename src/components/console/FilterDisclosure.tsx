"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconChevronDown, IconFilter } from "@/components/icons";

const EMPTY = new Set(["", "all", "semua", "any"]);

/** Hitung kontrol saring yang terisi di dalam formulir induk (input tersembunyi dan tombol diabaikan). */
function countActive(form: HTMLFormElement | null) {
  if (!form) return 0;
  let n = 0;
  for (const el of Array.from(form.elements)) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) continue;
    if (!el.name || el.disabled) continue;
    if (el instanceof HTMLInputElement) {
      if (["hidden", "submit", "button", "reset", "image"].includes(el.type)) continue;
      if (el.type === "checkbox" || el.type === "radio") {
        if (el.checked) n++;
        continue;
      }
    }
    if (!EMPTY.has(el.value.trim().toLowerCase())) n++;
  }
  return n;
}

/** Pembungkus FilterForm: di HP (< md) dilipat menjadi "Saring · n aktif"; di desktop selalu terbuka. */
export function FilterDisclosure({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const form = d.closest("form");
    const recount = () => setActive(countActive(form));
    recount();
    form?.addEventListener("input", recount);
    form?.addEventListener("change", recount);
    const mq = window.matchMedia("(min-width: 48rem)");
    const sync = () => {
      if (mq.matches) d.open = true;
    };
    sync();
    mq.addEventListener("change", sync);
    return () => {
      form?.removeEventListener("input", recount);
      form?.removeEventListener("change", recount);
      mq.removeEventListener("change", sync);
    };
  }, []);

  return (
    <details ref={ref} className="filter-details group">
      <summary className="flex min-h-11 items-center gap-2 rounded-card md:hidden bg-card px-4 text-body-sm font-medium text-ink shadow-e1 group-open:rounded-b-none">
        <IconFilter size={16} className="text-muted" />
        <span>Saring</span>
        {active > 0 && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-caption font-semibold tabular-nums text-brand-ink">{active} aktif</span>}
        <IconChevronDown size={16} className="ml-auto text-muted transition-transform duration-200 group-open:rotate-180" />
      </summary>
      {children}
    </details>
  );
}
