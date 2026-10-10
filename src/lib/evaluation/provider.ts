import type Database from "better-sqlite3";
import { AI_SCHEMA_VERSION, ProviderError, interviewRequestZ, type AIProviderAdapter, type InterviewRequest, type ProviderResult } from "../ai/contract";
import { getActiveConfig, liveAvailable } from "../ai/invocations";
import { loadBank } from "../standards/registry";
import { extractEnriched } from "./lexicon";

/* Pemilih penyedia untuk harness evaluasi.
   - 'simulated': simulator referensi di bawah. BUKAN model AI. Ia memakai leksikon aturan yang diperkaya, sehingga hasilnya hanya menguji
     pipa (kontrak, validasi, fallback, metrik), bukan kemampuan memahami bahasa.
   - 'live': hanya bila kunci server ada DAN sebuah adapter langsung terdaftar lewat `registerLiveAdapter` (diisi modul survei-ai).
   Tanpa keduanya, permintaan 'live' ditolak dengan alasan yang jelas; tidak pernah diam-diam diganti simulasi. */

export type ProviderPref = "auto" | "simulated" | "live";

export interface ResolvedProvider {
  adapter: AIProviderAdapter;
  mode: "live" | "simulated";
  /** Label yang boleh ditampilkan apa adanya. */
  label: string;
}

export class ProviderUnavailableError extends Error {
  constructor(message: string, public code: "no_key" | "no_adapter") {
    super(message);
  }
}

type LiveFactory = (db: Database.Database) => AIProviderAdapter | null;
let liveFactory: LiveFactory | null = null;

/** Dipanggil modul survei-ai saat adapter langsung (Anthropic) tersedia. Harness tidak mengimpor SDK penyedia sendiri. */
export function registerLiveAdapter(factory: LiveFactory | null) {
  liveFactory = factory;
}
export const liveAdapterRegistered = () => liveFactory !== null;

export const SIMULATOR_NAME = "sehati-reference-simulator";

export function resolveProvider(db: Database.Database, pref: ProviderPref): ResolvedProvider {
  const wantLive = pref === "live" || (pref === "auto" && liveAvailable() && liveFactory !== null);
  if (wantLive) {
    if (!liveAvailable()) throw new ProviderUnavailableError("Mode langsung diminta, tetapi kunci penyedia belum tersedia di server.", "no_key");
    const a = liveFactory ? liveFactory(db) : null;
    if (!a) throw new ProviderUnavailableError("Mode langsung diminta, tetapi adapter penyedia langsung belum terpasang (modul survei-ai).", "no_adapter");
    return { adapter: a, mode: "live", label: `${a.provider} (langsung)` };
  }
  return { adapter: createReferenceSimulator(db), mode: "simulated", label: "Simulator referensi (BUKAN model AI)" };
}

/** Simulator referensi deterministik: membaca jawaban dengan leksikon yang diperkaya, lalu memilih kandidat pertama yang slotnya belum terisi. */
export function createReferenceSimulator(db: Database.Database): AIProviderAdapter {
  const bank = loadBank(db, { allowDraft: true });
  const slotOfQuestion = new Map(bank.questions.map((q) => [q.id, q.target_slot]));
  return {
    kind: "simulated",
    provider: SIMULATOR_NAME,
    async interview(req: InterviewRequest): Promise<ProviderResult<unknown>> {
      const t0 = performance.now();
      const parsed = interviewRequestZ.safeParse(req);
      if (!parsed.success) throw new ProviderError("Permintaan tidak sesuai kontrak.", "invalid");
      const asked = slotOfQuestion.get(req.last_turn.question_id) ?? "";
      const { proposals, uncertainties, helpNeeded } = extractEnriched(asked, req.last_turn.answer_text, req.allowed_slots);
      const filled = new Set<string>([...proposals.map((p) => p.slot), ...req.confirmed_facts.map((f) => f.slot)]);
      const next = req.candidate_questions.find((c) => !filled.has(c.target_slot)) ?? null;
      const output = {
        schema_version: AI_SCHEMA_VERSION,
        request_id: req.request_id,
        session_revision: req.session_revision,
        fact_proposals: proposals.map((p) => ({ slot: p.slot, value: p.value, source_turn_id: req.last_turn.turn_id, source_quote: p.quote, needs_confirmation: false })),
        proposed_next_question_id: next?.id ?? null,
        selection_reason_code: helpNeeded ? ("needs_human_help" as const) : next ? ("next_core" as const) : ("no_candidate" as const),
        uncertainties,
        needs_human_help: helpNeeded,
      };
      return { output, provider: SIMULATOR_NAME, model: null, usage: {}, latency_ms: Math.max(0, Math.round(performance.now() - t0)) };
    },
    async testConnection() {
      return { ok: true, detail: "Simulator referensi lokal (bukan model AI).", latency_ms: 0 };
    },
  };
}

export const providerMeta = (db: Database.Database, rp: ResolvedProvider) => {
  const cfg = getActiveConfig(db);
  return { provider: rp.adapter.provider, model: rp.mode === "live" ? cfg.model : null, prompt_version: cfg.prompt_version, config_version: cfg.version, timeout_ms: cfg.timeout_ms };
};
