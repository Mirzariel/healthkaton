"use client";

import { useEffect } from "react";

/** Membuka bagian <details> yang menjadi tujuan tautan #id (termasuk induknya) lalu menggulir ke sana. */
export function OpenOnHash() {
  useEffect(() => {
    const go = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const el = document.getElementById(id);
      if (!el) return;
      for (let n: HTMLElement | null = el; n; n = n.parentElement) if (n instanceof HTMLDetailsElement) n.open = true;
      requestAnimationFrame(() => el.scrollIntoView({ block: "start" }));
    };
    go();
    window.addEventListener("hashchange", go);
    return () => window.removeEventListener("hashchange", go);
  }, []);
  return null;
}
