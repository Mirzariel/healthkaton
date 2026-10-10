import { Pill } from "@/components/ui";
import { CARD_LABEL, TONE_CLASS } from "@/lib/labels";
import type { CardLevel, MetricState } from "@/lib/cards/compute";

export const LEVEL_TONE: Record<CardLevel, keyof typeof TONE_CLASS> = { insufficient_data: "muted", none: "ok", yellow: "warn", red: "danger" };
export const STATE_LABEL: Record<MetricState, string> = { unavailable: "Data belum cukup", no_peers: "Tanpa pembanding", normal: "Wajar", elevated: "Lebih tinggi dari sejawat", high: "Jauh lebih tinggi dari sejawat" };

export function LevelPill({ level }: { level: CardLevel }) {
  return <Pill className={TONE_CLASS[LEVEL_TONE[level]]}>{CARD_LABEL[level]}</Pill>;
}
