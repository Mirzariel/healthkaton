import Link from "next/link";
import { RunForm } from "@/components/evaluation/RunForm";
import { AiModeBadge, Card, EmptyState, Forbidden, PageHeader, Pill, SectionTitle, SimNotice } from "@/components/ui";
import { can } from "@/lib/auth/principal";
import { getActiveConfig, liveAvailable } from "@/lib/ai/invocations";
import { getDb } from "@/lib/db";
import { loadCases, DATASET_ID, SCENARIO_TITLE } from "@/lib/evaluation/dataset";
import { evaluationStatus, getRun, listRuns, runResults, STATUS_TEXT, type CoreMetrics, type Rate, type RunRow } from "@/lib/evaluation/metrics";
import { liveAdapterRegistered } from "@/lib/evaluation/provider";
import { FAILURE_LABEL, type CaseResult, type EvalCaseDef, type FailureType, type SessionLabel, type TurnInput, type TurnLabel } from "@/lib/evaluation/types";
import { TONE_CLASS } from "@/lib/labels";
import { intervalsOverlap, num, pct, pctRange } from "@/lib/quality/stats";
import { getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";

const SYSTEM_LABEL = { baseline_rules: "Baseline aturan", rules_plus_llm: "Aturan + penyedia AI" } as const;
const th = "p-3 font-medium";
const SPLIT_LABEL = { dev: "Dev", heldout: "Heldout", all: "Semua" } as const;

const qs = (base: Record<string, string | undefined>, over: Record<string, string | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...over })) if (v) p.set(k, v);
  const s = p.toString();
  return `/console/ai/evaluation${s ? `?${s}` : ""}`;
};

function RateCell({ r, bold = false }: { r: Rate | null | undefined; bold?: boolean }) {
  if (!r || r.n === 0 || r.value === null) return <span className="text-muted">tidak ada kasus</span>;
  return (
    <span className="whitespace-nowrap">
      <span className={`tabular-nums ${bold ? "font-semibold" : ""}`}>{pct(r.value)}</span>{" "}
      <span className="text-xs text-muted tabular-nums">({r.k}/{r.n}; {pctRange(r.ci)})</span>
    </span>
  );
}

function ModeChip({ run }: { run: Pick<RunRow, "mode" | "system"> }) {
  if (run.mode === "rules") return <Pill className={TONE_CLASS.muted} title="Tanpa model AI; hanya leksikon aturan">Aturan (tanpa AI)</Pill>;
  if (run.mode === "simulated") return <Pill className={TONE_CLASS.warn} title="Simulator referensi lokal; bukan model AI dan bukan ukuran kemampuan model">Simulasi, BUKAN model AI</Pill>;
  return <AiModeBadge mode="live" />;
}

const VERDICT = (a: Rate | null | undefined, b: Rate | null | undefined) => {
  if (!a || !b || a.value === null || b.value === null) return <span className="text-muted">–</span>;
  const diff = (b.value - a.value) * 100;
  const sep = !intervalsOverlap(a.ci, b.ci);
  return (
    <span className="text-xs">
      <span className="tabular-nums font-semibold">{diff >= 0 ? "+" : ""}{num(diff, 0)} poin</span>{" "}
      <span className={sep ? "text-ok" : "text-muted"}>{sep ? "selisih melampaui rentang ketidakpastian" : "belum dapat dibedakan dari fluktuasi acak"}</span>
    </span>
  );
};

function caseSummary(c: EvalCaseDef) {
  if (c.label.kind === "turn") {
    const l = c.label as TurnLabel;
    return { text: (c.input as TurnInput).last_turn.answer_text, gold: l.proposals.length ? l.proposals.map((p) => `${p.slot} = ${p.value}`).join("; ") : "tidak ada fakta" };
  }
  const l = c.label as SessionLabel;
  return { text: `Sesi berskrip (${Object.keys((c.input as { script: object }).script).length} jawaban)`, gold: Object.entries(l.final_facts).map(([s, v]) => `${s} = ${v}`).join("; ") };
}

export default async function EvaluationPage({ searchParams }: { searchParams: Promise<{ run?: string; cmp?: string; type?: string }> }) {
  const me = await getPrincipal("konsol");
  if (!can(me, "ai.eval")) return <Forbidden need="ai.eval" />;
  const sp = await searchParams;
  const db = getDb();
  const status = evaluationStatus(db);
  const runs = listRuns(db, 30);
  const cases = loadCases(db);
  const byId = new Map(cases.map((c) => [c.id, c]));
  const cfg = getActiveConfig(db);

  const completed = runs.filter((r) => r.status === "completed");
  const selected = (sp.run && getRun(db, sp.run)) || completed.find((r) => r.system === "rules_plus_llm") || runs[0] || null;
  const compare = selected
    ? (sp.cmp && getRun(db, sp.cmp)) || completed.find((r) => r.id !== selected.id && r.split === selected.split && r.system !== selected.system && r.dataset_id === selected.dataset_id) || null
    : null;
  const results = selected ? runResults(db, selected.id) : [];
  const m = selected?.metrics ?? null;
  const filterType = (sp.type ?? "") as FailureType | "";
  const failing = results.filter((r) => r.failures.length > 0 && (!filterType || r.failures.includes(filterType as FailureType)));
  const base = { run: selected?.id, cmp: compare?.id, type: sp.type };

  const liveReady = liveAvailable() && liveAdapterRegistered();
  const liveNote = liveReady
    ? "Penyedia langsung tersedia. Pemanggilan dicatat di log AI dan dapat memakan waktu serta biaya."
    : `Penyedia langsung belum tersedia (${liveAvailable() ? "kunci ada, tetapi adapter belum dipasang oleh modul survei-ai" : "kunci penyedia belum diatur di server"}). Simulator referensi hanya menguji pipa, kontrak, dan metrik; angkanya bukan kemampuan model.`;

  const dev = cases.filter((c) => c.split === "dev"), held = cases.filter((c) => c.split === "heldout");
  const scenarios = [...new Set(cases.map((c) => c.scenario_id))];
  const dataset = db.prepare("SELECT * FROM datasets WHERE id = ?").get(DATASET_ID) as { name: string; version: string; kind: string; description: string } | undefined;

  return (
    <>
      <PageHeader title="Evaluasi AI" purpose="Mengukur seberapa baik pembacaan jawaban dan pemilihan pertanyaan, dengan dataset berlabel yang bisa Anda periksa. Angka hanya berasal dari run yang tersimpan." eyebrow="Standar dan AI" />

      <Card className={`p-4 ${status.kind === "live_evaluated" ? "border-ok/40" : "border-warn/50"}`} elevated>
        <div className="flex flex-wrap items-center gap-2">
          <Pill className={status.kind === "live_evaluated" ? TONE_CLASS.ok : status.kind === "not_evaluated" ? TONE_CLASS.muted : TONE_CLASS.warn}>{STATUS_TEXT[status.kind]}</Pill>
        </div>
        <p className="mt-2 text-sm text-ink-soft" role="status">
          {status.kind === "not_evaluated" && "Belum ada run evaluasi. Tidak ada angka akurasi AI yang boleh dikutip. Jalankan evaluasi di bawah untuk mengukur baseline aturan dan simulator referensi."}
          {status.kind === "simulated_only" && `Sudah ada ${status.runs} run selesai, tetapi semuanya mengukur aturan atau simulator referensi, bukan model AI langsung. Hasilnya menunjukkan pipa, kontrak, dan batas leksikon aturan bekerja; bukan akurasi model.`}
          {status.kind === "live_evaluated" && `Dievaluasi dengan ${status.provider ?? "penyedia"}${status.model ? ` / ${status.model}` : ""} pada ${status.runs} run, terakhir ${status.last_at ?? "–"}. Dataset ini sintetis, ditulis oleh pengembang; ini bukan validasi independen.`}
        </p>
      </Card>

      <section className="mt-6 space-y-3">
        <SectionTitle title="Jalankan evaluasi" hint="Hanya menulis ke tabel evaluasi dan log AI. Tidak mengubah sesi, temuan, kasus, atau pembayaran." />
        <Card>
          <RunForm liveReady={liveReady} liveNote={liveNote} />
        </Card>
      </section>

      <section className="mt-8 space-y-3" aria-labelledby="runs-h">
        <SectionTitle id="runs-h" title="Riwayat run" hint="Pilih satu run untuk melihat rincian; pilih dua untuk membandingkan." />
        <Card className="overflow-x-auto">
          {runs.length === 0 ? <EmptyState title="Belum ada run">Angka muncul setelah Anda menjalankan evaluasi.</EmptyState> : (
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="text-xs text-muted"><tr><th className={th}>Run</th><th className={th}>Sistem</th><th className={th}>Mode</th><th className={th}>Bagian</th><th className={th}>Kasus</th><th className={th}>Ketepatan giliran</th><th className={th}>Status</th><th className={th} /></tr></thead>
              <tbody className="divide-y divide-line">
                {runs.map((r) => (
                  <tr key={r.id} className={selected?.id === r.id ? "bg-brand-soft/40" : ""}>
                    <td className="p-3 font-mono text-xs">{r.id}<div className="text-[11px] text-muted">{r.started_at ?? ""}</div></td>
                    <td className="p-3">{SYSTEM_LABEL[r.system]}</td>
                    <td className="p-3"><ModeChip run={r} /></td>
                    <td className="p-3">{SPLIT_LABEL[r.split as keyof typeof SPLIT_LABEL] ?? r.split}</td>
                    <td className="p-3 tabular-nums">{r.sample_size}</td>
                    <td className="p-3">{r.status === "completed" ? <RateCell r={r.metrics?.turn_exact} /> : <span className="text-muted">–</span>}</td>
                    <td className="p-3"><Pill className={r.status === "completed" ? TONE_CLASS.ok : r.status === "failed" ? TONE_CLASS.danger : TONE_CLASS.info} title={r.note ?? undefined}>{r.status === "completed" ? "Selesai" : r.status === "failed" ? "Gagal" : "Berjalan"}</Pill></td>
                    <td className="p-3 whitespace-nowrap text-xs">
                      <Link className="font-semibold text-brand underline underline-offset-2" href={qs(base, { run: r.id, cmp: undefined, type: undefined })}>Lihat</Link>
                      {selected && selected.id !== r.id && <> · <Link className="font-semibold text-brand underline underline-offset-2" href={qs(base, { cmp: r.id })}>Bandingkan</Link></>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>

      {selected && (
        <section className="mt-8 space-y-4" aria-labelledby="detail-h">
          <SectionTitle id="detail-h" title={`Rincian ${selected.id}`} hint={`${SYSTEM_LABEL[selected.system]} · bagian ${SPLIT_LABEL[selected.split as keyof typeof SPLIT_LABEL] ?? selected.split} · ${selected.sample_size} kasus`} />
          {selected.mode !== "live" && (
            <SimNotice>{selected.mode === "rules" ? "Run ini tidak memakai model AI: hanya leksikon aturan. Angkanya adalah batas bawah yang harus dilampaui model." : "Run ini memakai simulator referensi, bukan model AI. Angkanya menguji pipa dan validasi, dan tidak boleh dikutip sebagai akurasi AI."}</SimNotice>
          )}
          {selected.status !== "completed" && <p role="alert" className="rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger">Run ini {selected.status === "failed" ? "berhenti sebelum selesai" : "belum selesai"}{selected.note ? `: ${selected.note}` : ""}. Angka di bawah hanya untuk kasus yang sempat dijalankan.</p>}

          <Card className="p-4">
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <div><dt className="text-xs text-muted">Mode</dt><dd><ModeChip run={selected} /></dd></div>
              <div><dt className="text-xs text-muted">Penyedia / model</dt><dd>{selected.provider ?? "–"}{selected.model ? ` / ${selected.model}` : ""}</dd></div>
              <div><dt className="text-xs text-muted">Versi prompt · konfigurasi</dt><dd>{selected.prompt_version ?? "–"} · v{selected.config_version ?? "–"}</dd></div>
              <div><dt className="text-xs text-muted">Dataset</dt><dd>{selected.dataset_id}</dd></div>
              <div><dt className="text-xs text-muted">Mulai · selesai</dt><dd className="text-xs">{selected.started_at ?? "–"} · {selected.finished_at ?? "–"}</dd></div>
              <div><dt className="text-xs text-muted">Konfigurasi aktif saat ini</dt><dd className="text-xs">{cfg.prompt_version} · v{cfg.version}</dd></div>
            </dl>
          </Card>

          {m ? (
            <>
              <MetricGrid m={m} run={selected} />
              {compare?.metrics && <Comparison a={selected} b={compare} />}
              <PerSlot m={m} />
              <BySplit run={selected} />
              <Failures m={m} results={failing} all={results} byId={byId} base={base} type={filterType} />
            </>
          ) : <EmptyState title="Metrik belum tersedia" />}
        </section>
      )}

      <section className="mt-8 space-y-3" aria-labelledby="ds-h">
        <SectionTitle id="ds-h" title="Dataset" hint={dataset ? `${dataset.name} · v${dataset.version}` : undefined} />
        <Card className="p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-4 text-sm">
            <div><p className="text-xs text-muted">Kasus</p><p className="text-xl font-semibold tabular-nums">{cases.length}</p></div>
            <div><p className="text-xs text-muted">Dev</p><p className="text-xl font-semibold tabular-nums">{dev.length}</p></div>
            <div><p className="text-xs text-muted">Heldout</p><p className="text-xl font-semibold tabular-nums">{held.length}</p></div>
            <div><p className="text-xs text-muted">Skenario</p><p className="text-xl font-semibold tabular-nums">{scenarios.length}</p></div>
          </div>
          <p className="text-sm text-ink-soft">{dataset?.description}</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
            <li>Split dipisah per skenario: tidak ada skenario yang muncul di dev dan heldout sekaligus.</li>
            <li>Pertanyaan berikut yang dapat diterima diturunkan dari fakta emas lewat mesin agenda yang sama, bukan ditulis tangan.</li>
            <li>Sebagian kasus (tag semantik) sengaja di luar jangkauan leksikon aturan sebagai ruang bagi model.</li>
          </ul>
          <details className="rounded-lg border border-line">
            <summary className="cursor-pointer p-3 text-sm font-semibold">Tinjau {cases.length} kasus beserta label</summary>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem] text-left text-sm">
                <thead className="text-xs text-muted"><tr><th className={th}>Kasus</th><th className={th}>Skenario</th><th className={th}>Bagian</th><th className={th}>Jawaban peserta (sintetis)</th><th className={th}>Label emas</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {cases.map((c) => {
                    const s = caseSummary(c);
                    return (
                      <tr key={c.id}>
                        <td className="p-3 font-mono text-xs">{c.id}{c.label.adversarial && <Pill className={`ml-1 ${TONE_CLASS.warn}`}>adversarial</Pill>}</td>
                        <td className="p-3 text-xs">{SCENARIO_TITLE[c.scenario_id] ?? c.scenario_id}</td>
                        <td className="p-3">{c.split === "dev" ? "Dev" : "Heldout"}</td>
                        <td className="p-3">{s.text}</td>
                        <td className="p-3 font-mono text-xs">{s.gold}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        </Card>
      </section>

      <div className="mt-8"><SimNotice>
        Batas yang jujur: kasus, label, dan baseline ditulis oleh orang yang sama, jadi heldout di sini bukan validasi independen dan hasil dev akan lebih baik daripada hasil di luar contoh. Label belum ditinjau oleh pengusul maupun dr. Yuli. Dataset kecil: perhatikan rentang ketidakpastian, bukan hanya angkanya. Kepuasan peserta tidak pernah menjadi fakta layanan.
      </SimNotice></div>
    </>
  );
}

function MetricCard({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <p className="text-xs font-medium text-ink-soft">{label}</p>
      <div className="mt-1 text-lg">{children}</div>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function MetricGrid({ m, run }: { m: NonNullable<RunRow["metrics"]>; run: RunRow }) {
  const live = run.mode === "live";
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <MetricCard label="Ketepatan giliran" hint="Fakta tepat DAN pertanyaan berikut tidak terlarang"><RateCell r={m.turn_exact} bold /></MetricCard>
      <MetricCard label="Presisi usulan fakta" hint="Dari fakta yang diusulkan, berapa yang benar"><RateCell r={m.extraction.precision} bold /></MetricCard>
      <MetricCard label="Recall usulan fakta" hint="Dari fakta yang seharusnya, berapa yang terbaca"><RateCell r={m.extraction.recall} bold /></MetricCard>
      <MetricCard label="F1 mikro · F1 makro per slot" hint="Makro: rata-rata slot yang punya kasus"><span className="tabular-nums font-semibold">{num(m.extraction.f1, 2)} · {num(m.extraction.macro_f1, 2)}</span></MetricCard>
      <MetricCard label="Dukungan sumber" hint="Usulan mentah yang kutipannya potongan jawaban dan sejalan dengan nilai"><RateCell r={m.source_support} bold /></MetricCard>
      <MetricCard label="Pilihan pertanyaan berikut tepat" hint="Dihitung aturan atas fakta yang lolos validasi"><RateCell r={m.selection.accuracy} bold /></MetricCard>
      <MetricCard label="Memilih pertanyaan terlarang"><RateCell r={m.selection.forbidden} /></MetricCard>
      <MetricCard label="Pilihan mentah model masih sah menurut aturan" hint={m.selection.pick_current ? "Hanya run dengan penyedia AI" : undefined}>{m.selection.pick_current ? <RateCell r={m.selection.pick_current} /> : <span className="text-sm text-muted">tidak berlaku (tanpa penyedia AI)</span>}</MetricCard>
      <MetricCard label="Tahan terhadap teks perintah (adversarial)" hint="Kasus yang seharusnya tidak menghasilkan fakta"><RateCell r={m.adversarial} bold /></MetricCard>
      <MetricCard label="Tidak tahu dibaca tepat" hint="Lupa/tidak paham/tidak berlaku harus tercatat apa adanya"><RateCell r={m.unknown_handling.exact} /> {m.unknown_handling.as_value.k > 0 && <div className="text-xs text-danger">{m.unknown_handling.as_value.k} kali dibaca sebagai jawaban ya/tidak</div>}</MetricCard>
      {m.session && <MetricCard label="Sesi berskrip benar utuh" hint={`${m.session.n} sesi; cakupan rata-rata ${m.session.coverage_mean === null ? "–" : pct(m.session.coverage_mean)}; ${num(m.session.turns_mean, 1)} giliran`}><RateCell r={m.session.correct} bold /></MetricCard>}
      {m.session && <MetricCard label="Fakta akhir sesi benar"><RateCell r={m.session.final_fact_accuracy} /></MetricCard>}
      {m.session && <MetricCard label="Pertanyaan terlarang ditanyakan (sesi)"><RateCell r={m.session.must_not_ask_violations} /></MetricCard>}
      <MetricCard label="Keluaran tidak valid · fallback" hint={`${m.reliability.calls} panggilan penyedia`}>{m.reliability.calls ? <><RateCell r={m.reliability.invalid} /><br /><RateCell r={m.reliability.fallback} /></> : <span className="text-sm text-muted">tidak berlaku (tanpa penyedia AI)</span>}</MetricCard>
      <MetricCard label="Latensi p50 · p95" hint={live ? `${m.latency.n} panggilan` : undefined}>{m.latency.measured ? <span className="tabular-nums font-semibold">{num(m.latency.p50, 0)} ms · {num(m.latency.p95, 0)} ms</span> : <span className="text-sm text-muted">tidak berlaku: bukan model langsung</span>}</MetricCard>
      <MetricCard label="Token · biaya" hint="Hanya dari data yang dikirim penyedia">{m.usage.available ? <span className="tabular-nums font-semibold">{m.usage.tokens_in ?? "–"} / {m.usage.tokens_out ?? "–"} · {m.usage.cost_usd === null ? "biaya tidak tersedia" : `$${num(m.usage.cost_usd, 4)}`}</span> : <span className="text-sm text-muted">tidak tersedia</span>}</MetricCard>
    </div>
  );
}

function Comparison({ a, b }: { a: RunRow; b: RunRow }) {
  const x = a.metrics as CoreMetrics, y = b.metrics as CoreMetrics;
  const [from, to, fm, tm] = a.system === "baseline_rules" || b.system === "rules_plus_llm" ? [a, b, x, y] : [b, a, y, x];
  const rows: [string, Rate | null | undefined, Rate | null | undefined][] = [
    ["Ketepatan giliran", fm.turn_exact, tm.turn_exact],
    ["Presisi usulan fakta", fm.extraction.precision, tm.extraction.precision],
    ["Recall usulan fakta", fm.extraction.recall, tm.extraction.recall],
    ["Pilihan pertanyaan berikut tepat", fm.selection.accuracy, tm.selection.accuracy],
    ["Tahan teks perintah", fm.adversarial, tm.adversarial],
    ["Tidak tahu dibaca tepat", fm.unknown_handling.exact, tm.unknown_handling.exact],
    ["Fakta akhir sesi benar", fm.session?.final_fact_accuracy, tm.session?.final_fact_accuracy],
  ];
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Perbandingan: {SYSTEM_LABEL[from.system]} ({from.id}) → {SYSTEM_LABEL[to.system]} ({to.id})</h3>
      {(from.split !== to.split) && <p className="text-xs text-warn">Bagian dataset berbeda ({from.split} vs {to.split}); selisih tidak sebanding.</p>}
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="text-xs text-muted"><tr><th className={th}>Metrik</th><th className={th}>{SYSTEM_LABEL[from.system]}</th><th className={th}>{SYSTEM_LABEL[to.system]}</th><th className={th}>Selisih</th></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map(([l, p, q]) => (
              <tr key={l}><td className="p-3">{l}</td><td className="p-3"><RateCell r={p} /></td><td className="p-3"><RateCell r={q} /></td><td className="p-3">{VERDICT(p, q)}</td></tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-muted">Uji tumpang-tindih interval Wilson memperlakukan kasus sebagai independen dan hanya kasar; kasus pada kedua sistem sama, sehingga ini bukan uji berpasangan. {to.mode !== "live" && "Sistem kanan bukan model AI langsung."}</p>
    </div>
  );
}

function PerSlot({ m }: { m: CoreMetrics }) {
  if (!m.extraction.per_slot.length) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Per slot</h3>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead className="text-xs text-muted"><tr><th className={th}>Slot</th><th className={th}>Dukungan</th><th className={th}>TP</th><th className={th}>FP</th><th className={th}>FN</th><th className={th}>Presisi</th><th className={th}>Recall</th><th className={th}>F1</th></tr></thead>
          <tbody className="divide-y divide-line">
            {m.extraction.per_slot.map((s) => (
              <tr key={s.slot}>
                <td className="p-3 font-mono text-xs">{s.slot}</td>
                <td className="p-3 tabular-nums">{s.support}</td><td className="p-3 tabular-nums">{s.tp}</td><td className="p-3 tabular-nums">{s.fp}</td><td className="p-3 tabular-nums">{s.fn}</td>
                <td className="p-3 tabular-nums">{pct(s.precision)}</td><td className="p-3 tabular-nums">{pct(s.recall)}</td><td className="p-3 tabular-nums">{num(s.f1, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-muted">Dukungan = jumlah fakta emas pada slot itu. Slot dengan dukungan di bawah 5 tidak cukup untuk disimpulkan sendiri.</p>
    </div>
  );
}

function BySplit({ run }: { run: RunRow }) {
  const m = run.metrics;
  if (!m || !m.by_split.dev || !m.by_split.heldout) return null;
  const rows: [string, CoreMetrics][] = [["Dev", m.by_split.dev], ["Heldout", m.by_split.heldout]];
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Dev dan heldout</h3>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead className="text-xs text-muted"><tr><th className={th}>Bagian</th><th className={th}>Kasus</th><th className={th}>Ketepatan giliran</th><th className={th}>Recall fakta</th><th className={th}>Tahan teks perintah</th></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map(([l, c]) => <tr key={l}><td className="p-3 font-semibold">{l}</td><td className="p-3 tabular-nums">{c.n_cases}</td><td className="p-3"><RateCell r={c.turn_exact} /></td><td className="p-3"><RateCell r={c.extraction.recall} /></td><td className="p-3"><RateCell r={c.adversarial} /></td></tr>)}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-muted">Selisih dev–heldout adalah petunjuk seberapa jauh sistem disetel pada contoh yang terlihat. Karena penyusun sistem dan label sama, jangan membaca heldout sebagai ukuran di dunia nyata.</p>
    </div>
  );
}

function Failures({ m, results, all, byId, base, type }: { m: CoreMetrics; results: CaseResult[]; all: CaseResult[]; byId: Map<string, EvalCaseDef>; base: Record<string, string | undefined>; type: string }) {
  const shown = results.slice(0, 60);
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Kasus gagal dan peringatan</h3>
      <div className="flex flex-wrap gap-2 text-xs">
        <Link href={qs(base, { type: undefined })} className={`rounded-md border px-2 py-1 ${!type ? "border-brand bg-brand-soft font-semibold" : "border-line"}`}>Semua ({all.filter((r) => r.failures.length).length})</Link>
        {m.failures.map((f) => (
          <Link key={f.type} href={qs(base, { type: f.type })} className={`rounded-md border px-2 py-1 ${type === f.type ? "border-brand bg-brand-soft font-semibold" : "border-line"}`}>{FAILURE_LABEL[f.type]} ({f.cases})</Link>
        ))}
      </div>
      <Card className="overflow-x-auto">
        {shown.length === 0 ? <EmptyState title="Tidak ada kasus pada filter ini" /> : (
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead className="text-xs text-muted"><tr><th className={th}>Kasus</th><th className={th}>Jawaban</th><th className={th}>Seharusnya</th><th className={th}>Terbaca</th><th className={th}>Masalah</th></tr></thead>
            <tbody className="divide-y divide-line align-top">
              {shown.map((r) => {
                const c = byId.get(r.case_id);
                const s = c ? caseSummary(c) : { text: "–", gold: "–" };
                return (
                  <tr key={r.case_id}>
                    <td className="p-3 font-mono text-xs">{r.case_id}<div className="font-sans text-[11px] text-muted">{c ? SCENARIO_TITLE[c.scenario_id] ?? c.scenario_id : ""}</div></td>
                    <td className="p-3">{s.text}</td>
                    <td className="p-3 font-mono text-xs">{s.gold}</td>
                    <td className="p-3 font-mono text-xs">{r.proposals.length ? r.proposals.map((p) => `${p.slot} = ${p.value}`).join("; ") : "tidak ada fakta"}{r.kind === "turn" && <div className="font-sans text-muted">berikut: {r.next ?? "selesai"}</div>}</td>
                    <td className="p-3 text-xs">{r.failures.map((f) => <Pill key={f} className={`mr-1 mb-1 ${TONE_CLASS.muted}`}>{FAILURE_LABEL[f]}</Pill>)}{r.detail && <div className="mt-1 text-muted">{r.detail}</div>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
      {results.length > shown.length && <p className="text-xs text-muted">Menampilkan {shown.length} dari {results.length} kasus.</p>}
    </div>
  );
}
