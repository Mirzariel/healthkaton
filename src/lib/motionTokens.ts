/* Token gerak bersama (fase 1). Pasangan CSS: --ease-out-expo, --dur-1..--dur-5 di globals.css. */
import type { Variants } from "framer-motion";

/** Kurva keluar "expo": cepat di awal, mendarat sangat halus. Sama dengan --ease-out-expo. */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
/** Kurva masuk-keluar "quart" untuk perpindahan simetris. Sama dengan --ease-in-out-quart. */
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;

/** Durasi dalam detik (framer-motion). Sama dengan --dur-1..--dur-5 (120/200/320/600/900 ms). */
export const DUR = { 1: 0.12, 2: 0.2, 3: 0.32, 4: 0.6, 5: 0.9 } as const;

/** Varian muncul standar: naik 16px sambil memudar masuk. */
export const REVEAL: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: DUR[4], ease: EASE_OUT } },
};
