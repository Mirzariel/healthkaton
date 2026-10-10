export type StageKey = "pre" | "intra" | "post" | "directed";
export type StandardStatus = "draft" | "reviewed" | "approved" | "retired";
export type IndicatorKind = "existence" | "communication" | "quality" | "cost" | "administrative";

export type CompareOp = "eq" | "neq" | "in" | "nin" | "exists" | "gt" | "lt";
/** Aturan sebagai DATA (bukan kode). Dievaluasi oleh evalRule; tidak ada eval/Function. */
export type Rule =
  | { field: string; operator: CompareOp; value?: string | number | boolean; values?: (string | number | boolean)[] }
  | { all: Rule[] }
  | { any: Rule[] }
  | { not: Rule };

export interface SlotDef {
  id: string;
  label: string;
  /** Nilai sah selain `unknown` / `not_understood` / `not_applicable` yang selalu diizinkan. */
  values: string[];
  valueLabels?: Record<string, string>;
}

export interface ConditionalRule {
  when: { slot: string; operator: CompareOp; value?: string; values?: string[] };
  require: string[];
}

export interface SignalRule {
  /** Kapan jawaban menghasilkan permintaan layanan/temuan T4 (bukan keputusan). */
  when: { slot: string; operator: CompareOp; value?: string; values?: string[] };
  category: string;
  note: string;
}

export interface IndicatorVersionRow {
  id: string; // INDICATOR:versi
  indicator_id: string;
  version: string;
  standard_version_id: string;
  title: string;
  description: string | null;
  kind: IndicatorKind;
  stage: StageKey;
  scope: string[];
  applicability: Rule | null;
  required_slots: string[];
  conditional_rules: ConditionalRule[];
  slots: SlotDef[];
  signal_rules: SignalRule[];
  observable_by_patient: boolean;
  source_id: string | null;
  locator: string | null;
}

export interface QuestionOption {
  value: string;
  label: string;
}
export interface QuestionRow {
  id: string;
  indicator_version_id: string;
  version: number;
  target_slot: string;
  text: string;
  answer_type: "choice" | "free";
  options: QuestionOption[];
  helper: string | null;
  is_core: boolean;
  ord: number;
}

export const YES_NO_OPTIONS: QuestionOption[] = [
  { value: "yes", label: "Ya" },
  { value: "no", label: "Tidak" },
  { value: "unknown", label: "Saya lupa / tidak yakin" },
  { value: "not_understood", label: "Saya tidak paham pertanyaannya" },
];
