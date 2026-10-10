import type { Stage } from "../labels";

/* Tipe harness evaluasi AI (master prompt §13). Kasus berlabel disimpan di tabel eval_cases (input_json, label_json). */

export type EvalSplit = "dev" | "heldout";
export type EvalSystem = "baseline_rules" | "rules_plus_llm";
export type EvalSplitChoice = EvalSplit | "all";

export interface GoldProposal {
  slot: string;
  value: string;
  /** Potongan jawaban peserta yang mendukung nilai. Wajib substring dari jawaban. */
  quote: string;
}

/** Keadaan sebelum satu giliran. Permintaan AI (InterviewRequest) disusun darinya saat evaluasi dijalankan, termasuk kandidat dari mesin agenda. */
export interface TurnInput {
  stage: Stage;
  /** ID indikator (tanpa versi) yang membentuk sesi; versi diambil dari bank draf. */
  indicators: string[];
  scope_tags: string[];
  episode_context: Record<string, string | boolean | number | null>;
  confirmed_facts: { slot: string; value: string }[];
  asked_question_ids: string[];
  last_turn: { question_id: string; answer_text: string };
}

export interface TurnLabel {
  kind: "turn";
  /** Himpunan fakta yang seharusnya diusulkan. Kosong berarti jawaban tidak memuat fakta layanan. */
  proposals: GoldProposal[];
  /** Pertanyaan berikut yang dapat diterima. `null` berarti sesi boleh berakhir. */
  acceptable_next: (string | null)[];
  /** Pertanyaan yang tidak boleh dipilih (mubazir, tidak berlaku, atau cabang yang tidak terpicu). */
  forbidden_next: string[];
  adversarial: boolean;
  note: string;
}

export interface SessionInput {
  stage: Stage;
  indicators: string[];
  scope_tags: string[];
  episode_context: Record<string, string | boolean | number | null>;
  /** Jawaban bebas peserta per ID pertanyaan. Pertanyaan yang tidak ada di sini dijawab "saya tidak tahu". */
  script: Record<string, string>;
}
export interface SessionLabel {
  kind: "session";
  /** Fakta akhir yang seharusnya terbaca (slot → nilai). Slot lain tidak dinilai. */
  final_facts: Record<string, string>;
  /** Pertanyaan yang tidak boleh pernah ditanyakan pada sesi ini. */
  must_not_ask: string[];
  /** Slot yang tidak boleh pernah terisi (mis. satu-satunya sumbernya teks yang menyerupai perintah). */
  forbidden_slots: string[];
  min_coverage: number;
  max_turns: number;
  adversarial: boolean;
  note: string;
}

export interface EvalCaseDef {
  id: string;
  scenario_id: string;
  split: EvalSplit;
  stage: Stage;
  tags: string[];
  input: TurnInput | SessionInput;
  label: TurnLabel | SessionLabel;
}

export interface Proposal {
  slot: string;
  value: string;
  quote: string;
}

export type FailureType =
  | "missed_slot"
  | "wrong_value"
  | "extra_slot"
  | "unknown_as_value"
  | "unsupported_quote"
  | "bad_next"
  | "forbidden_next"
  | "repeated_question"
  | "invalid_output"
  | "fallback"
  | "injection_followed"
  | "forbidden_question_asked"
  | "low_coverage"
  | "wrong_final_fact"
  | "not_finished";

export const FAILURE_LABEL: Record<FailureType, string> = {
  missed_slot: "Fakta terlewat",
  wrong_value: "Nilai salah",
  extra_slot: "Fakta tambahan tanpa dasar",
  unknown_as_value: "Tidak tahu dibaca sebagai jawaban",
  unsupported_quote: "Kutipan tidak mendukung",
  bad_next: "Pertanyaan berikut kurang tepat",
  forbidden_next: "Memilih pertanyaan terlarang",
  repeated_question: "Pertanyaan berulang",
  invalid_output: "Keluaran tidak valid",
  fallback: "Beralih ke fallback aturan",
  injection_followed: "Mengikuti instruksi dalam jawaban",
  forbidden_question_asked: "Menanyakan pertanyaan terlarang",
  low_coverage: "Cakupan kurang",
  wrong_final_fact: "Fakta akhir salah",
  not_finished: "Sesi tidak selesai",
};

export type ResultMode = "rules" | "live" | "simulated" | "fallback";

/** Hasil satu kasus pada satu sistem. */
export interface CaseResult {
  case_id: string;
  scenario_id: string;
  split: EvalSplit;
  kind: "turn" | "session";
  stage: string;
  tags: string[];
  system: EvalSystem;
  mode: ResultMode;
  adversarial: boolean;
  /** Usulan akhir yang lolos validasi (turn) atau fakta akhir sesi (session, diubah ke bentuk usulan). */
  proposals: Proposal[];
  rejected: { slot: string; value: string; reason: string }[];
  next: string | null;
  candidates: string[];
  correct: boolean;
  failures: FailureType[];
  invalid: boolean;
  fallback: boolean;
  latency_ms: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: number | null;
  /** Emas (hanya giliran), untuk penghitungan presisi/recall per slot. */
  gold?: Proposal[];
  /** Panggilan ke penyedia (0 untuk baseline aturan). */
  calls: { n: number; invalid: number; fallback: number; pick_current: number; repeated: number; latencies: number[] };
  /** Dukungan sumber atas usulan MENTAH: didukung = kutipan potongan jawaban dan tidak bertentangan dengan nilai. */
  support: { raw: number; supported: number };
  /** Hanya sesi. */
  session?: { turns: number; coverage: number | null; finished: boolean; asked: string[]; final_correct: number; final_total: number };
  detail?: string;
}
