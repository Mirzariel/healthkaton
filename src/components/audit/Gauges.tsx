"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

export type GaugeTone = "brand" | "ink" | "info" | "warn";
const TONE: Record<GaugeTone, string> = { brand: "#0b5c4f", ink: "#0b0d0c", info: "#2160b0", warn: "#a8670a" };

/** Cincin persentase (0..1), garis tunggal solid. Animasi sekali saat tampil. */
export function Ring({
  value,
  tone = "brand",
  size = 112,
  label,
  children,
}: {
  value: number;
  tone?: GaugeTone;
  size?: number;
  /** Teks pembaca layar. */
  label: string;
  children?: ReactNode;
}) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e3e1da" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={TONE[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - v) }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.1 }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

/** Batang horizontal dengan nilai 0..1. */
export function Meter({ value, tone = "brand", label }: { value: number; tone?: "brand" | "ink" | "info" | "warn"; label: string }) {
  const bg = { brand: "bg-brand", ink: "bg-ink", info: "bg-info", warn: "bg-warn" }[tone];
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-line" role="img" aria-label={label}>
      <motion.div
        className={`h-full w-full origin-left rounded-full ${bg}`}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: v }}
        transition={{ duration: 0.7, ease: EASE, delay: 0.1 }}
      />
    </div>
  );
}
