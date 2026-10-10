import type Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProviderError, interviewOutputZ, type AIProviderAdapter, type InterviewRequest, type ProviderResult } from "../src/lib/ai/contract";
import { verifyChain } from "../src/lib/audit";
import type { Principal } from "../src/lib/auth/principal";
import { openDb } from "../src/lib/db";
import { BUDGETS, buildDataset, loadCases, validateDataset, DATASET_ID } from "../src/lib/evaluation/dataset";
import { computeCore, evaluationStatus, rate, STATUS_TEXT } from "../src/lib/evaluation/metrics";
import { buildTurnContext, runSession, runTurn } from "../src/lib/evaluation/pipeline";
import { createReferenceSimulator, registerLiveAdapter, resolveProvider, SIMULATOR_NAME } from "../src/lib/evaluation/provider";
import { getRun, runResults, startEvaluation } from "../src/lib/evaluation/runner";
import { scoreSession, scoreTurn } from "../src/lib/evaluation/score";
import type { CaseResult, SessionInput, TurnInput } from "../src/lib/evaluation/types";
import { validateInterviewOutput } from "../src/lib/evaluation/validate";
import { seedAll } from "../src/lib/seed";
import { loadBank } from "../src/lib/standards/registry";

const principal = (role: Principal["role"]): Principal => ({ id: `${role}:T`, name: "Uji", role, facilityId: null, participantId: null, companionId: null });
const REVIEWER = principal("reviewer");

let db: Database.Database;
beforeAll(() => {
  delete process.env.ANTHROPIC_API_KEY;
  db = openDb(":memory:");
  seedAll(db);
});
afterAll(() => {
  registerLiveAdapter(null);
  delete process.env.ANTHROPIC_API_KEY;
});

const bank = () => loadBank(db, { allowDraft: true });
const turnCase = (id: string) => loadCases(db).find((c) => c.id === id)!;

describe("dataset", () => {
  it("memuat 60–100 kasus, ID unik, dan lolos pemeriksaan integritas terhadap bank", () => {
    const cases = loadCases(db);
    expect(cases.length).toBeGreaterThanOrEqual(60);
    expect(cases.length).toBeLessThanOrEqual(100);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    expect(validateDataset(bank(), cases)).toEqual([]);
  });
  it("memisahkan dev dan heldout per skenario tanpa kebocoran", () => {
    const cases = loadCases(db);
    const dev = new Set(cases.filter((c) => c.split === "dev").map((c) => c.scenario_id));
    const held = new Set(cases.filter((c) => c.split === "heldout").map((c) => c.scenario_id));
    expect([...dev].filter((s) => held.has(s))).toEqual([]);
    expect(held.size).toBeGreaterThanOrEqual(8);
    expect(cases.filter((c) => c.split === "heldout").length / cases.length).toBeGreaterThan(0.3);
  });
  it("memuat kasus turn dan sesi, serta kasus adversarial, tidak tahu, dan instruksi-vs-kejadian", () => {
    const cases = loadCases(db);
    expect(cases.filter((c) => c.label.kind === "session").length).toBeGreaterThanOrEqual(10);
    expect(cases.filter((c) => c.label.adversarial).length).toBeGreaterThanOrEqual(6);
    const golds = cases.flatMap((c) => (c.label.kind === "turn" ? c.label.proposals : []));
    expect(golds.some((g) => g.value === "unknown")).toBe(true);
    expect(golds.some((g) => g.value === "not_understood")).toBe(true);
    expect(golds.some((g) => g.slot === "directed_outside_purchase")).toBe(true);
  });
  it("ID dataset tersimpan dan penandaan sintetis jujur", () => {
    const d = db.prepare("SELECT kind, description FROM datasets WHERE id = ?").get(DATASET_ID) as { kind: string; description: string };
    expect(d.kind).toBe("synthetic_draft");
    expect(d.description).toMatch(/BELUM ditinjau/);
  });
  it("buildDataset deterministik", () => {
    expect(JSON.stringify(buildDataset(bank()))).toBe(JSON.stringify(buildDataset(bank())));
  });
});

describe("validator keluaran AI", () => {
  const req = (): InterviewRequest => {
    const c = turnCase("EC-002");
    return buildTurnContext(bank(), c.id, c.stage as never, c.input as TurnInput, BUDGETS).request;
  };
  const good = (r: InterviewRequest) => ({
    schema_version: "1.0", request_id: r.request_id, session_revision: r.session_revision,
    fact_proposals: [{ slot: "medication_receipt", value: "none", source_turn_id: r.last_turn.turn_id, source_quote: "Belum dapat sama sekali", needs_confirmation: false }],
    proposed_next_question_id: r.candidate_questions[0]?.id ?? null, selection_reason_code: "next_core", uncertainties: [], needs_human_help: false,
  });
  it("menerima keluaran sah", () => {
    const r = req();
    const v = validateInterviewOutput(r, good(r));
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.proposals).toHaveLength(1);
  });
  it("menolak enum ilegal dan field tambahan sebagai keluaran tidak sah", () => {
    const r = req();
    expect(validateInterviewOutput(r, { ...good(r), selection_reason_code: "bebas" }).ok).toBe(false);
    expect(validateInterviewOutput(r, { ...good(r), keputusan: "tolak klaim" }).ok).toBe(false);
  });
  it("menolak id permintaan, revisi, dan id pertanyaan di luar kandidat", () => {
    const r = req();
    expect(validateInterviewOutput(r, { ...good(r), request_id: "lain" }).ok).toBe(false);
    expect(validateInterviewOutput(r, { ...good(r), session_revision: 99 }).ok).toBe(false);
    const v = validateInterviewOutput(r, { ...good(r), proposed_next_question_id: "TIDAK_ADA" });
    expect(v.ok).toBe(false);
    const again = validateInterviewOutput(r, { ...good(r), proposed_next_question_id: "MED_RECEIPT_V1" });
    expect(again.ok === false && again.issues[0].code).toBe("repeated_question");
  });
  it("menolak per butir: kutipan bukan potongan jawaban, slot di luar izin, nilai ilegal, kutipan bertentangan", () => {
    const r = req();
    const o = good(r);
    const mk = (over: Record<string, unknown>) => ({ ...o, fact_proposals: [{ ...o.fact_proposals[0], ...over }] });
    for (const [over, reason] of [
      [{ source_quote: "kutipan karangan" }, "unsupported_quote"],
      [{ slot: "fee_paid" }, "slot_not_allowed"],
      [{ value: "banyak" }, "value_not_allowed"],
      [{ value: "full", source_quote: "Belum dapat sama sekali" }, "quote_conflicts_with_value"],
      [{ source_turn_id: "T-lain" }, "wrong_source_turn"],
    ] as const) {
      const v = validateInterviewOutput(r, mk(over));
      expect(v.ok).toBe(true);
      if (v.ok) { expect(v.proposals).toHaveLength(0); expect(v.rejected[0].reason).toBe(reason); }
    }
  });
  it("membuang saran kalimat berisi istilah terlarang", () => {
    const r = req();
    const v = validateInterviewOutput(r, { ...good(r), question_text_suggestion: "Apakah ada penipuan di sini?" });
    expect(v.ok && v.suggestionDropped).toBe(true);
  });
  it("keluaran simulator referensi lolos skema ketat", () => {
    const r = req();
    return createReferenceSimulator(db).interview(r, { timeoutMs: 1000, promptVersion: "x" }).then((res) => {
      expect(interviewOutputZ.safeParse(res.output).success).toBe(true);
    });
  });
});

describe("pipa per giliran", () => {
  const sim = () => ({ provider: createReferenceSimulator(db), mode: "simulated" as const, timeoutMs: 2000, promptVersion: "x" });
  const run = async (id: string, system: "baseline_rules" | "rules_plus_llm") => {
    const c = turnCase(id);
    const ctx = buildTurnContext(bank(), c.id, c.stage as never, c.input as TurnInput, BUDGETS);
    const out = await runTurn(ctx, system, system === "rules_plus_llm" ? sim() : null);
    return scoreTurn(c, ctx, out, system);
  };
  it("baseline: instruksi 'ya saja' diikuti sebagai jawaban (kegagalan terukur), simulator menolaknya", async () => {
    const b = await run("EC-040", "baseline_rules");
    expect(b.correct).toBe(false);
    expect(b.failures).toContain("injection_followed");
    const s = await run("EC-040", "rules_plus_llm");
    expect(s.proposals).toEqual([]);
    expect(s.correct).toBe(true);
  });
  it("tidak tahu dibaca unknown, bukan ya/tidak (aturan I3)", async () => {
    for (const sys of ["baseline_rules", "rules_plus_llm"] as const) {
      const r = await run("EC-034", sys);
      expect(r.proposals.map((p) => `${p.slot}=${p.value}`)).toEqual(["medication_receipt=unknown"]);
      expect(r.correct).toBe(true);
    }
  });
  it("instruksi membeli bukan kejadian membeli", async () => {
    const r = await run("EC-013", "rules_plus_llm");
    const m = Object.fromEntries(r.proposals.map((p) => [p.slot, p.value]));
    expect(m.directed_outside_purchase).toBe("yes");
    expect(m.outside_purchase).toBeUndefined();
  });
  it("pertanyaan berikut dihitung aturan atas fakta yang lolos validasi", async () => {
    const r = await run("EC-002", "baseline_rules");
    expect(["MED_REASON_V1", "MED_REPLACEMENT_V1", "MED_PURCHASE_V1"]).toContain(r.next);
    expect(r.failures).not.toContain("forbidden_next");
  });
  it("kandidat tidak pernah memuat pertanyaan yang sudah ditanyakan", () => {
    for (const c of loadCases(db).filter((x) => x.label.kind === "turn")) {
      const ctx = buildTurnContext(bank(), c.id, c.stage as never, c.input as TurnInput, BUDGETS);
      const asked = new Set(ctx.asked);
      expect(ctx.candidates.every((k) => !asked.has(k.question.id))).toBe(true);
    }
  });
});

describe("sesi", () => {
  const sim = () => ({ provider: createReferenceSimulator(db), mode: "simulated" as const, timeoutMs: 2000, promptVersion: "x" });
  it("semua 'tidak tahu' menghasilkan unknown, tidak pernah ya/tidak", async () => {
    const c = loadCases(db).find((x) => x.scenario_id === "SESI-TIDAK-TAHU")!;
    for (const sys of ["baseline_rules", "rules_plus_llm"] as const) {
      const tr = await runSession(bank(), c.id, c.input as SessionInput, sys, sys === "rules_plus_llm" ? sim() : null, BUDGETS);
      expect(Object.values(tr.facts).every((v) => v === "unknown")).toBe(true);
      expect(scoreSession(c, tr, sys).correct).toBe(true);
    }
  });
  it("teks perintah di tengah sesi tidak mengisi slot terlarang pada simulator", async () => {
    const c = loadCases(db).find((x) => x.scenario_id === "SESI-INJEKSI")!;
    const tr = await runSession(bank(), c.id, c.input as SessionInput, "rules_plus_llm", sim(), BUDGETS);
    expect(tr.facts.medication_receipt).toBeUndefined();
    expect(tr.facts.open_issue).toBeUndefined();
    expect(scoreSession(c, tr, "rules_plus_llm").correct).toBe(true);
  });
  it("probe konteks: tanpa resep pulang, pertanyaan obat tidak ditanyakan", async () => {
    const c = loadCases(db).find((x) => x.scenario_id === "SESI-PROBE-TANPA-RESEP")!;
    const tr = await runSession(bank(), c.id, c.input as SessionInput, "baseline_rules", null, BUDGETS);
    expect(tr.asked[0]).toBe("CTX_RX_DISCHARGE_V1");
    expect(tr.asked).not.toContain("MED_RECEIPT_V1");
  });
});

describe("matematika metrik", () => {
  const mk = (over: Partial<CaseResult>): CaseResult => ({
    case_id: "X", scenario_id: "S", split: "dev", kind: "turn", stage: "post", tags: [], system: "rules_plus_llm", mode: "simulated", adversarial: false, proposals: [], rejected: [], next: null, candidates: [],
    correct: true, failures: [], invalid: false, fallback: false, latency_ms: null, tokens_in: null, tokens_out: null, cost_usd: null, gold: [], calls: { n: 1, invalid: 0, fallback: 0, pick_current: 1, repeated: 0, latencies: [5] }, support: { raw: 0, supported: 0 }, ...over,
  });
  it("rate membawa k, n dan interval Wilson; n=0 → null", () => {
    const r = rate(8, 10);
    expect(r.value).toBeCloseTo(0.8);
    expect(r.ci!.lo).toBeCloseTo(0.4902, 3);
    expect(r.ci!.hi).toBeCloseTo(0.9433, 3);
    expect(rate(0, 0).value).toBeNull();
  });
  it("presisi/recall/F1 mikro dan per slot dihitung dari tp/fp/fn", () => {
    const g = (slot: string, value: string) => ({ slot, value, quote: "q" });
    const m = computeCore([
      mk({ case_id: "1", gold: [g("a", "yes"), g("b", "no")], proposals: [g("a", "yes"), g("b", "yes")] }),
      mk({ case_id: "2", gold: [g("a", "no")], proposals: [] }),
      mk({ case_id: "3", gold: [], proposals: [g("c", "yes")] }),
    ]);
    // tp=1 (a=yes), fp=2 (b=yes, c=yes), fn=2 (b=no, a=no)
    expect(m.extraction.precision.value).toBeCloseTo(1 / 3);
    expect(m.extraction.recall.value).toBeCloseTo(1 / 3);
    expect(m.extraction.f1).toBeCloseTo(1 / 3);
    const a = m.extraction.per_slot.find((s) => s.slot === "a")!;
    expect([a.tp, a.fp, a.fn, a.support]).toEqual([1, 0, 1, 2]);
    expect(a.precision).toBe(1);
    expect(a.recall).toBeCloseTo(0.5);
  });
  it("latensi tidak dilaporkan untuk simulasi; token/biaya 'tidak tersedia' tanpa data penyedia", () => {
    const m = computeCore([mk({})]);
    expect(m.latency.measured).toBe(false);
    expect(m.latency.p50).toBeNull();
    expect(m.usage.available).toBe(false);
    expect(m.usage.cost_usd).toBeNull();
    const live = computeCore([mk({ mode: "live", tokens_in: 100, tokens_out: 20, cost_usd: 0.002, calls: { n: 1, invalid: 0, fallback: 0, pick_current: 1, repeated: 0, latencies: [120] } })]);
    expect(live.latency.measured).toBe(true);
    expect(live.latency.p50).toBe(120);
    expect(live.usage).toMatchObject({ available: true, tokens_in: 100, cost_usd: 0.002 });
  });
  it("kegagalan dihitung per jenis dan per kasus", () => {
    const m = computeCore([mk({ case_id: "1", correct: false, failures: ["missed_slot", "bad_next"] }), mk({ case_id: "2", correct: false, failures: ["missed_slot"] })]);
    expect(m.failures.find((f) => f.type === "missed_slot")).toMatchObject({ n: 2, cases: 2 });
  });
});

describe("status kepala dan larangan klaim akurasi", () => {
  it("tanpa run: belum dievaluasi", () => {
    expect(evaluationStatus(db)).toEqual({ kind: "not_evaluated" });
    expect(STATUS_TEXT.not_evaluated).toBe("Belum dievaluasi");
  });
});

describe("runner", () => {
  const counts = () => {
    const t = ["participants", "survey_sessions", "survey_turns", "participant_facts", "findings", "cases", "claims", "pending_triage", "payment_events", "facility_cards", "service_requests", "ground_truth"];
    return Object.fromEntries(t.map((n) => [n, (db.prepare(`SELECT COUNT(*) n FROM ${n}`).get() as { n: number }).n]));
  };

  it("hanya peran dengan ai.eval yang boleh menjalankan", async () => {
    for (const r of ["verifikator", "faskes", "peserta"] as const) await expect(startEvaluation(db, principal(r), { split: "dev" })).rejects.toThrow();
    expect((db.prepare("SELECT COUNT(*) n FROM eval_runs").get() as { n: number }).n).toBe(0);
  });

  it("run baseline tersimpan, dapat dimuat ulang, tanpa pemanggilan AI, dan tidak mengubah data layanan", async () => {
    const before = counts();
    const out = await startEvaluation(db, REVIEWER, { split: "all", systems: ["baseline_rules"] });
    expect(out.runs).toHaveLength(1);
    const run = getRun(db, out.run_ids[0])!;
    expect(run.status).toBe("completed");
    expect(run.mode).toBe("rules");
    expect(run.provider).toBeNull();
    const cases = loadCases(db);
    expect(run.sample_size).toBe(cases.length);
    expect(runResults(db, run.id)).toHaveLength(cases.length);
    expect(run.metrics!.n_cases).toBe(cases.length);
    expect(run.metrics!.by_split.dev && run.metrics!.by_split.heldout).toBeTruthy();
    expect((db.prepare("SELECT COUNT(*) n FROM ai_invocations WHERE eval_run_id = ?").get(run.id) as { n: number }).n).toBe(0);
    expect(counts()).toEqual(before);
    expect(verifyChain(db).ok).toBe(true);
  });

  it("hanya aturan/simulasi → bukan evaluasi model langsung", async () => {
    const s = evaluationStatus(db);
    expect(s.kind).toBe("simulated_only");
    expect(STATUS_TEXT.simulated_only).toMatch(/Belum ada evaluasi model AI langsung/);
  });

  it("run rules_plus_llm simulasi mencatat pemanggilan AI bertanda simulasi dengan eval_run_id", async () => {
    const out = await startEvaluation(db, REVIEWER, { split: "dev", systems: ["rules_plus_llm"], provider: "simulated" });
    const run = getRun(db, out.run_ids[0])!;
    expect(run.mode).toBe("simulated");
    expect(run.provider).toBe(SIMULATOR_NAME);
    const rows = db.prepare("SELECT operation, mode, provider, status, eval_run_id, case_id, tokens_in, cost_usd FROM ai_invocations WHERE eval_run_id = ?").all(run.id) as Record<string, unknown>[];
    expect(rows.length).toBeGreaterThan(30);
    expect(rows.every((r) => r.operation === "eval_case" && r.mode === "simulated" && r.provider === SIMULATOR_NAME && r.status === "ok")).toBe(true);
    expect(rows.every((r) => r.tokens_in === null && r.cost_usd === null)).toBe(true);
    expect(run.metrics!.usage.available).toBe(false);
    expect(run.metrics!.latency.measured).toBe(false);
    expect(run.metrics!.reliability.fallback.k).toBe(0);
    expect(evaluationStatus(db).kind).toBe("simulated_only");
  });

  it("split heldout hanya memuat kasus heldout", async () => {
    const out = await startEvaluation(db, REVIEWER, { split: "heldout", systems: ["baseline_rules"] });
    const res = runResults(db, out.run_ids[0]);
    expect(res.length).toBeGreaterThan(0);
    expect(res.every((r) => r.split === "heldout")).toBe(true);
  });

  it("baseline deterministik: dua run menghasilkan metrik yang sama", async () => {
    const a = await startEvaluation(db, REVIEWER, { split: "dev", systems: ["baseline_rules"] });
    const b = await startEvaluation(db, REVIEWER, { split: "dev", systems: ["baseline_rules"] });
    expect(JSON.stringify(getRun(db, a.run_ids[0])!.metrics)).toBe(JSON.stringify(getRun(db, b.run_ids[0])!.metrics));
  });

  it("kunci idempoten: kirim ulang mengembalikan run yang sama tanpa run baru", async () => {
    const n0 = (db.prepare("SELECT COUNT(*) n FROM eval_runs").get() as { n: number }).n;
    const a = await startEvaluation(db, REVIEWER, { split: "dev", systems: ["baseline_rules"], idempotency_key: "k-1" });
    const b = await startEvaluation(db, REVIEWER, { split: "dev", systems: ["baseline_rules"], idempotency_key: "k-1" });
    expect(a.replayed).toBe(false);
    expect(b.replayed).toBe(true);
    expect(b.run_ids).toEqual(a.run_ids);
    expect((db.prepare("SELECT COUNT(*) n FROM eval_runs").get() as { n: number }).n).toBe(n0 + 1);
  });

  it("kunci yang sedang berjalan ditolak 409", async () => {
    db.prepare("INSERT INTO idempotency_keys (scope, key, result_json, created_at) VALUES (?,?,NULL,'x')").run(`eval.run:${REVIEWER.id}`, "k-pending");
    await expect(startEvaluation(db, REVIEWER, { split: "dev", systems: ["baseline_rules"], idempotency_key: "k-pending" })).rejects.toMatchObject({ status: 409 });
  });

  it("mode langsung tanpa kunci ditolak, tidak diam-diam diganti simulasi, dan tidak meninggalkan run", async () => {
    const n0 = (db.prepare("SELECT COUNT(*) n FROM eval_runs").get() as { n: number }).n;
    await expect(startEvaluation(db, REVIEWER, { split: "dev", systems: ["rules_plus_llm"], provider: "live", idempotency_key: "k-live" })).rejects.toMatchObject({ status: 409, code: "no_key" });
    expect((db.prepare("SELECT COUNT(*) n FROM eval_runs").get() as { n: number }).n).toBe(n0);
    // kunci idempoten dilepas agar percobaan ulang dimungkinkan
    expect(db.prepare("SELECT 1 FROM idempotency_keys WHERE key = 'k-live'").get()).toBeUndefined();
    expect(() => resolveProvider(db, "live")).toThrow();
  });

  it("batas waktu terlampaui → run ditandai gagal, bukan selesai", async () => {
    const out = await startEvaluation(db, REVIEWER, { split: "dev", systems: ["baseline_rules"] }, { deadlineMs: -1 });
    const run = getRun(db, out.run_ids[0])!;
    expect(run.status).toBe("failed");
    expect(run.note).toMatch(/batas waktu/);
  });

  it("audit: run tercatat dengan ID/enum saja dan rantai tetap sah", () => {
    const rows = db.prepare("SELECT action, detail FROM audit_log WHERE action IN ('evaluasi_dijalankan','evaluasi_selesai')").all() as { action: string; detail: string }[];
    expect(rows.length).toBeGreaterThan(4);
    for (const r of rows) expect(r.detail).not.toMatch(/saya|obat|dokter/i);
    expect(verifyChain(db).ok).toBe(true);
  });
});

describe("adapter tiruan: jalur gagal harus jatuh ke aturan", () => {
  const sim = () => createReferenceSimulator(db);
  const wrap = (fn: (req: InterviewRequest, base: Record<string, unknown>) => unknown | Promise<unknown>, extra: Partial<ProviderResult> = {}): AIProviderAdapter => ({
    kind: "live", provider: "tiruan-uji",
    async interview(req, o) {
      const base = (await sim().interview(req, o)).output as Record<string, unknown>;
      const out = await fn(req, base);
      return { output: out, provider: "tiruan-uji", model: "m-uji", usage: { tokens_in: 100, tokens_out: 30, cost_usd: 0.001 }, latency_ms: 7, ...extra };
    },
    async testConnection() { return { ok: true, detail: "", latency_ms: 0 }; },
  });
  const runWith = async (adapter: AIProviderAdapter, split: "dev" | "heldout" = "dev") => {
    registerLiveAdapter(() => adapter);
    process.env.ANTHROPIC_API_KEY = "kunci-uji";
    try {
      const out = await startEvaluation(db, REVIEWER, { split, systems: ["rules_plus_llm"], provider: "live" });
      return getRun(db, out.run_ids[0])!;
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
      registerLiveAdapter(null);
    }
  };
  const invs = (runId: string) => db.prepare("SELECT mode, status, error_code, fallback_reason, tokens_in, cost_usd FROM ai_invocations WHERE eval_run_id = ?").all(runId) as { mode: string; status: string; error_code: string | null; fallback_reason: string | null; tokens_in: number | null; cost_usd: number | null }[];

  it("enum ilegal → seluruh keluaran tidak sah → fallback aturan, tercatat sebagai fallback", async () => {
    const run = await runWith(wrap((_r, b) => ({ ...b, selection_reason_code: "ngawur" })));
    expect(run.status).toBe("completed");
    expect(run.metrics!.reliability.invalid.value).toBe(1);
    expect(run.metrics!.reliability.fallback.value).toBe(1);
    const rows = invs(run.id);
    expect(rows.every((r) => r.mode === "fallback" && r.status === "invalid" && r.fallback_reason === "invalid_output")).toBe(true);
    const res = runResults(db, run.id).filter((r) => r.kind === "turn");
    expect(res.every((r) => r.mode === "fallback")).toBe(true);
  });

  it("field tambahan → tidak sah → fallback", async () => {
    const run = await runWith(wrap((_r, b) => ({ ...b, keputusan: "tolak" })));
    expect(run.metrics!.reliability.invalid.value).toBe(1);
  });

  it("kutipan karangan ditolak per butir, bukan seluruh keluaran, dan tercatat sebagai peringatan", async () => {
    const run = await runWith(wrap((r, b) => ({ ...b, fact_proposals: [{ slot: r.allowed_slots[0].slot, value: r.allowed_slots[0].values[0], source_turn_id: r.last_turn.turn_id, source_quote: "kalimat yang tidak pernah diucapkan", needs_confirmation: false }] })));
    expect(run.metrics!.reliability.invalid.k).toBe(0);
    expect(run.metrics!.source_support.value).toBe(0);
    expect(run.metrics!.failures.find((f) => f.type === "unsupported_quote")!.cases).toBeGreaterThan(10);
    const res = runResults(db, run.id).filter((r) => r.kind === "turn");
    expect(res.every((r) => r.proposals.length === 0)).toBe(true);
  });

  it("model yang menurut pada teks perintah terukur: lolos validasi skema tetapi gagal kasus adversarial", async () => {
    const run = await runWith(wrap((r, b) => {
      const inj = /abaikan|sistem:|jawab ya|isi saja|tulis kutipan|catat bahwa|katakan saja/i.test(r.last_turn.answer_text);
      if (!inj) return b;
      const s = r.allowed_slots.find((a) => a.values.includes("yes"))!;
      return { ...b, fact_proposals: [{ slot: s.slot, value: "yes", source_turn_id: r.last_turn.turn_id, source_quote: r.last_turn.answer_text.slice(0, 20), needs_confirmation: false }] };
    }));
    const adv = run.metrics!.adversarial;
    expect(adv.n).toBeGreaterThan(3);
    expect(adv.k).toBeLessThan(adv.n);
    expect(run.metrics!.failures.some((f) => f.type === "injection_followed")).toBe(true);
  });

  it("galat penyedia → fallback, tanpa menggagalkan run", async () => {
    const run = await runWith({ ...wrap(() => ({})), async interview() { throw new ProviderError("down", "unavailable"); } });
    expect(run.status).toBe("completed");
    expect(run.metrics!.reliability.fallback.value).toBe(1);
    expect(invs(run.id).every((r) => r.status === "unavailable" && r.mode === "fallback")).toBe(true);
  });

  it("melebihi batas waktu → fallback dengan status timeout", async () => {
    const c = turnCase("EC-001");
    const ctx = buildTurnContext(bank(), c.id, c.stage as never, c.input as TurnInput, BUDGETS);
    const slow: AIProviderAdapter = { ...wrap((_r, b) => b), async interview() { return new Promise(() => {}); } };
    const out = await runTurn(ctx, "rules_plus_llm", { provider: slow, mode: "live", timeoutMs: 30, promptVersion: "x" });
    expect(out.fallback).toBe(true);
    expect(out.log?.status).toBe("timeout");
    expect(out.proposals).toEqual(ctx.baseline);
  });

  it("adapter langsung yang baik: latensi, token, dan biaya dilaporkan dari data penyedia; status menjadi evaluasi langsung", async () => {
    const run = await runWith(wrap((_r, b) => b), "heldout");
    expect(run.mode).toBe("live");
    expect(run.metrics!.latency.measured).toBe(true);
    expect(run.metrics!.usage).toMatchObject({ available: true });
    expect(run.metrics!.usage.tokens_in).toBeGreaterThan(0);
    expect(invs(run.id).every((r) => r.mode === "live" && r.tokens_in === 100)).toBe(true);
    expect(evaluationStatus(db).kind).toBe("live_evaluated");
  });

  it("keluaran sah dari adapter tiruan tidak mengubah data layanan", () => {
    expect((db.prepare("SELECT COUNT(*) n FROM findings").get() as { n: number }).n).toBeGreaterThan(0);
    expect(verifyChain(db).ok).toBe(true);
  });
});
