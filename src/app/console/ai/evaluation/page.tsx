import Link from "next/link";
import { Disclosure, FilterChips, Inset, Metric } from "@/components/analytics/blocks";
import { IntervalBar } from "@/components/analytics/charts";
import { SectionNav } from "@/components/analytics/SectionNav";
import { RunForm } from "@/components/evaluation/RunForm";
import { AiModeBadge, Card, EmptyState, Forbidden, Notice, PageHeader, Pill, Section, SectionTitle, SimNotice, StatusPill, TableCard } from "@/components/ui";
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
const th = "px-4 py-2.5";
const SPLIT_LABEL = { dev: "Dev", heldout: "Heldout", all: "Semua" } as const;

const qs = (base: Record<string, string | undefined>, over: Record<string, string | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...over })) if (v) p.set(k, v);
  const s = p.toString();
  return `/console/ai/evaluation${s ? `?${s}` : ""}`;
};

/** Angka proporsi dengan k/n dan rentang Wilson; `bar` menambah gambar rentang pada skala 0-100%. */
function RateCell({ r, bold = false, bar = false }: { r: Rate | null | undefined; bold?: boolean; bar?: boolean }) {
  if (!r || r.n === 0 || r.value === null) return <span className="text-muted">tidak ada kasus</span>;
  return (
    <span className={bar ? "block" : "whitespace-nowrap"}>
      <span className={`tabular-nums ${bold ? "text-[1.375rem] font-semibold leading-none tracking-tight text-ink" : ""}`}>{pct(r.value)}</span>{" "}
      <span className="text-[12.5px] tabular-nums text-muted">({r.k}/{r.n}; {pctRange(r.ci)})</span>
      {bar && r.ci && <span className="mt-2 block"><IntervalBar value={r.value} lo={r.ci.lo} hi={r.ci.hi} /></span>}
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
    <span className="text-[12.5px]">
      <span className="font-semibold tabular-nums text-ink">{diff >= 0 ? "+" : ""}{num(diff, 0)} poin</span>{" "}
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

  const nav = [
    { id: "jalankan", label: "Jalankan evaluasi" },
    { id: "runs-h", label: "Riwayat run" },
    ...(selected ? [{ id: "detail-h", label: "Rincian run" }] : []),
    ...(selected && m ? [
      { id: "metrik", label: "Metrik" },
      ...(compare?.metrics ? [{ id: "banding", label: "Perbandingan" }] : []),
      ...(m.extraction.per_slot.length ? [{ id: "per-slot", label: "Per slot" }] : []),
      ...(m.by_split.dev && m.by_split.heldout ? [{ id: "dev-heldout", label: "Dev dan heldout" }] : []),
      { id: "gagal", label: "Kasus gagal" },
    ] : []),
    { id: "ds-h", label: "Dataset" },
    { id: "batas", label: "Batasan" },
  ];

  return (
    <>
      <PageHeader title="Evaluasi AI" purpose="Mengukur pembacaan jawaban dan pemilihan pertanyaan. Angka hanya dari run tersimpan." eyebrow="Standar dan AI" />

      <Card className={`px-5 py-4 ${status.kind === "live_evaluated" ? "border-ok/40" : "border-warn/50"}`} elevated>
        <StatusPill tone={status.kind === "live_evaluated" ? "ok" : status.kind === "not_evaluated" ? "muted" : "warn"}>{STATUS_TEXT[status.kind]}</StatusPill>
        <p className="mt-2.5 max-w-3xl text-[14px] leading-relaxed text-ink-soft" role="status">
          {status.kind === "not_evaluated" && "Belum ada run. Tidak ada angka akurasi AI yang boleh dikutip."}
          {status.kind === "simulated_only" && `${status.runs} run selesai, semuanya aturan atau simulator, bukan model AI langsung. Hasil menunjukkan pipa dan batas aturan, bukan akurasi model.`}
          {status.kind === "live_evaluated" && `Dievaluasi dengan ${status.provider ?? "penyedia"}${status.model ? ` / ${status.model}` : ""} pada ${status.runs} run, terakhir ${status.last_at ?? "–"}. Dataset ini sintetis, ditulis oleh pengembang; ini bukan validasi independen.`}
        </p>
      </Card>

      <div className="mt-5" />
      <SectionNav items={nav} />

      <Section id="jalankan" className="scroll-mt-28">
        <SectionTitle title="Jalankan evaluasi" hint="Hanya menulis tabel evaluasi dan log AI." />
        <Card>
          <RunForm liveReady={liveReady} liveNote={liveNote} />
        </Card>
      </Section>

      <Section id="runs-h" className="scroll-mt-28">
        <SectionTitle title="Riwayat run" hint="Lihat satu run, atau bandingkan dua." />
        <TableCard label="Riwayat run evaluasi">
          {runs.length === 0 ? <EmptyState title="Belum ada run">Angka muncul setelah Anda menjalankan evaluasi.</EmptyState> : (
            <table className="w-full min-w-[46rem] text-left text-[13.5px]">
              <thead><tr><th className={th}>Run</th><th className={th}>Sistem</th><th className={th}>Mode</th><th className={th}>Bagian</th><th className={`${th} text-right`}>Kasus</th><th className={th}>Ketepatan giliran</th><th className={th}>Status</th><th className={`${th} relative`}><span className="sr-only">Aksi</span></th></tr></thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className={selected?.id === r.id ? "bg-brand-tint/70" : ""} aria-current={selected?.id === r.id ? "true" : undefined}>
                    <td className="px-4 py-3 font-mono text-[12px]">{r.id}<div className="font-sans text-[11.5px] text-muted">{r.started_at ?? ""}</div></td>
                    <td className="px-4 py-3">{SYSTEM_LABEL[r.system]}</td>
                    <td className="px-4 py-3"><ModeChip run={r} /></td>
                    <td className="px-4 py-3">{SPLIT_LABEL[r.split as keyof typeof SPLIT_LABEL] ?? r.split}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.sample_size}</td>
                    <td className="px-4 py-3">{r.status === "completed" ? <RateCell r={r.metrics?.turn_exact} /> : <span className="text-muted">–</span>}</td>
                    <td className="px-4 py-3"><StatusPill tone={r.status === "completed" ? "ok" : r.status === "failed" ? "danger" : "info"} title={r.note ?? undefined}>{r.status === "completed" ? "Selesai" : r.status === "failed" ? "Gagal" : "Berjalan"}</StatusPill></td>
                    <td className="whitespace-nowrap px-4 py-3 text-[13px]">
                      <Link className="link" href={qs(base, { run: r.id, cmp: undefined, type: undefined })}>Lihat</Link>
                      {selected && selected.id !== r.id && <Link className="link ml-3" href={qs(base, { cmp: r.id })}>Bandingkan</Link>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TableCard>
      </Section>

      {selected && (
        <Section id="detail-h" className="scroll-mt-28 space-y-6">
          <SectionTitle title={`Rincian ${selected.id}`} hint={`${SYSTEM_LABEL[selected.system]} · bagian ${SPLIT_LABEL[selected.split as keyof typeof SPLIT_LABEL] ?? selected.split} · ${selected.sample_size} kasus`} />
          {selected.mode !== "live" && (
            <SimNotice>{selected.mode === "rules" ? "Hanya leksikon aturan, tanpa model AI: angka ini batas bawah yang harus dilampaui model." : "Simulator referensi, bukan model AI: menguji pipa dan validasi, jangan dikutip sebagai akurasi AI."}</SimNotice>
          )}
          {selected.status !== "completed" && <Notice tone="danger"><span role="alert">Run ini {selected.status === "failed" ? "berhenti sebelum selesai" : "belum selesai"}{selected.note ? `: ${selected.note}` : ""}. Angka di bawah hanya untuk kasus yang sempat dijalankan.</span></Notice>}

          <Inset className="px-5 py-4">
            <dl className="grid grid-cols-1 gap-x-8 gap-y-3.5 text-[14px] sm:grid-cols-2 lg:grid-cols-3">
              <div><dt className="text-[12.5px] text-muted">Mode</dt><dd className="mt-0.5"><ModeChip run={selected} /></dd></div>
              <div><dt className="text-[12.5px] text-muted">Penyedia / model</dt><dd className="mt-0.5">{selected.provider ?? "–"}{selected.model ? ` / ${selected.model}` : ""}</dd></div>
              <div><dt className="text-[12.5px] text-muted">Versi prompt dan konfigurasi</dt><dd className="mt-0.5">{selected.prompt_version ?? "–"}, v{selected.config_version ?? "–"}</dd></div>
              <div><dt className="text-[12.5px] text-muted">Dataset</dt><dd className="mt-0.5 break-words">{selected.dataset_id}</dd></div>
              <div><dt className="text-[12.5px] text-muted">Mulai dan selesai</dt><dd className="mt-0.5 text-[13px] tabular-nums">{selected.started_at ?? "–"} sampai {selected.finished_at ?? "–"}</dd></div>
              <div><dt className="text-[12.5px] text-muted">Konfigurasi aktif saat ini</dt><dd className="mt-0.5 text-[13px]">{cfg.prompt_version}, v{cfg.version}</dd></div>
            </dl>
          </Inset>

          {m ? (
            <>
              <MetricGrid m={m} run={selected} />
              {compare?.metrics && <Comparison a={selected} b={compare} />}
              <PerSlot m={m} />
              <BySplit run={selected} />
              <Failures m={m} results={failing} all={results} byId={byId} base={base} type={filterType} />
            </>
          ) : <Card><EmptyState title="Metrik belum tersedia" /></Card>}
        </Section>
      )}

      <Section id="ds-h" className="scroll-mt-28">
        <SectionTitle title="Dataset" hint={dataset ? `${dataset.name} · v${dataset.version}` : undefined} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Kasus" value={cases.length} />
          <Metric label="Dev" value={dev.length} />
          <Metric label="Heldout" value={held.length} />
          <Metric label="Skenario" value={scenarios.length} />
        </div>
        {dataset?.description && <p className="max-w-3xl text-[14px] leading-relaxed text-ink-soft">{dataset.description}</p>}
        <Disclosure title="Cara dataset disusun">
          <ul className="list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-ink-soft">
            <li>Split dipisah per skenario: tidak ada skenario yang muncul di dev dan heldout sekaligus.</li>
            <li>Pertanyaan berikut yang dapat diterima diturunkan dari fakta emas lewat mesin agenda yang sama, bukan ditulis tangan.</li>
            <li>Sebagian kasus (tag semantik) sengaja di luar jangkauan leksikon aturan sebagai ruang bagi model.</li>
          </ul>
        </Disclosure>
        <Disclosure title={`Tinjau ${cases.length} kasus beserta label`} meta={<span className="tabular-nums">{cases.length} kasus</span>} flush>
          <div className="scroll-x max-h-[32rem] overflow-y-auto">
            <table className="w-full min-w-[48rem] text-left text-[13.5px]">
              <thead className="sticky top-0"><tr><th className={th}>Kasus</th><th className={th}>Skenario</th><th className={th}>Bagian</th><th className={th}>Jawaban peserta (sintetis)</th><th className={th}>Label emas</th></tr></thead>
              <tbody className="align-top">
                {cases.map((c) => {
                  const s = caseSummary(c);
                  return (
                    <tr key={c.id}>
                      <td className="px-4 py-3 font-mono text-[12px]">{c.id}{c.label.adversarial && <Pill className={`ml-1.5 ${TONE_CLASS.warn}`}>adversarial</Pill>}</td>
                      <td className="px-4 py-3 text-[12.5px]">{SCENARIO_TITLE[c.scenario_id] ?? c.scenario_id}</td>
                      <td className="px-4 py-3">{c.split === "dev" ? "Dev" : "Heldout"}</td>
                      <td className="px-4 py-3">{s.text}</td>
                      <td className="px-4 py-3 font-mono text-[12px]">{s.gold}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Disclosure>
      </Section>

      <Section id="batas" className="scroll-mt-28"><SimNotice>
        Kasus, label, dan baseline ditulis orang yang sama: heldout bukan validasi independen, label belum ditinjau pengusul atau dr. Yuli, dataset kecil, jadi baca rentang ketidakpastian. Kepuasan peserta bukan fakta layanan.
      </SimNotice></Section>
    </>
  );
}

function Group({ title, hint, children, cols = "sm:grid-cols-2 lg:grid-cols-3" }: { title: string; hint?: string; children: React.ReactNode; cols?: string }) {
  return (
    <Inset className="space-y-3 p-4">
      <div>
        <h4 className="text-[13.5px] font-semibold text-ink">{title}</h4>
        {hint && <p className="text-[12.5px] text-muted">{hint}</p>}
      </div>
      <div className={`grid gap-3 ${cols}`}>{children}</div>
    </Inset>
  );
}

function MetricGrid({ m, run }: { m: NonNullable<RunRow["metrics"]>; run: RunRow }) {
  const live = run.mode === "live";
  const na = (t: string) => <span className="text-[13.5px] text-muted">{t}</span>;
  return (
    <div id="metrik" className="scroll-mt-28 space-y-6">
      <h3 className="text-[15px] font-semibold tracking-tight text-ink">Metrik run ini</h3>
      <div className="grid gap-3 lg:grid-cols-3">
        <Metric label="Ketepatan giliran" hint="Fakta tepat DAN pertanyaan berikut tidak terlarang"><RateCell r={m.turn_exact} bold bar /></Metric>
        <Metric label="Tahan terhadap teks perintah (adversarial)" hint="Kasus yang seharusnya tidak menghasilkan fakta"><RateCell r={m.adversarial} bold bar /></Metric>
        <Metric label="Tidak tahu dibaca tepat" hint="Lupa/tidak paham/tidak berlaku harus tercatat apa adanya"><RateCell r={m.unknown_handling.exact} bold bar />{m.unknown_handling.as_value.k > 0 && <div className="mt-1.5 text-[12.5px] text-danger">{m.unknown_handling.as_value.k} kali dibaca sebagai jawaban ya/tidak</div>}</Metric>
      </div>
      <Group title="Pembacaan jawaban (usulan fakta)">
        <Metric label="Presisi usulan fakta" hint="Dari fakta yang diusulkan, berapa yang benar"><RateCell r={m.extraction.precision} bold bar /></Metric>
        <Metric label="Recall usulan fakta" hint="Dari fakta yang seharusnya, berapa yang terbaca"><RateCell r={m.extraction.recall} bold bar /></Metric>
        <Metric label="F1 mikro · F1 makro per slot" hint="Makro: rata-rata slot yang punya kasus"><span className="text-[1.375rem] font-semibold leading-none tracking-tight tabular-nums">{num(m.extraction.f1, 2)} · {num(m.extraction.macro_f1, 2)}</span></Metric>
        <Metric label="Dukungan sumber" hint="Usulan mentah yang kutipannya potongan jawaban dan sejalan dengan nilai"><RateCell r={m.source_support} bold bar /></Metric>
      </Group>
      <Group title="Pemilihan pertanyaan berikut">
        <Metric label="Pilihan pertanyaan berikut tepat" hint="Dihitung aturan atas fakta yang lolos validasi"><RateCell r={m.selection.accuracy} bold bar /></Metric>
        <Metric label="Memilih pertanyaan terlarang"><RateCell r={m.selection.forbidden} bold bar /></Metric>
        <Metric label="Pilihan mentah model masih sah menurut aturan" hint={m.selection.pick_current ? "Hanya run dengan penyedia AI" : undefined}>{m.selection.pick_current ? <RateCell r={m.selection.pick_current} bold bar /> : na("tidak berlaku (tanpa penyedia AI)")}</Metric>
      </Group>
      {m.session && (
        <Group title="Sesi berskrip" hint={`${m.session.n} sesi, cakupan rata-rata ${m.session.coverage_mean === null ? "–" : pct(m.session.coverage_mean)}, rata-rata ${num(m.session.turns_mean, 1)} giliran`}>
          <Metric label="Sesi berskrip benar utuh" hint={`${m.session.n} sesi; cakupan rata-rata ${m.session.coverage_mean === null ? "–" : pct(m.session.coverage_mean)}; ${num(m.session.turns_mean, 1)} giliran`}><RateCell r={m.session.correct} bold bar /></Metric>
          <Metric label="Fakta akhir sesi benar"><RateCell r={m.session.final_fact_accuracy} bold bar /></Metric>
          <Metric label="Pertanyaan terlarang ditanyakan (sesi)"><RateCell r={m.session.must_not_ask_violations} bold bar /></Metric>
        </Group>
      )}
      <Group title="Keandalan, kecepatan, dan biaya">
        <Metric label="Keluaran tidak valid · fallback" hint={`${m.reliability.calls} panggilan penyedia`}>{m.reliability.calls ? <div className="space-y-2"><RateCell r={m.reliability.invalid} /><br /><RateCell r={m.reliability.fallback} /></div> : na("tidak berlaku (tanpa penyedia AI)")}</Metric>
        <Metric label="Latensi p50 · p95" hint={live ? `${m.latency.n} panggilan` : undefined}>{m.latency.measured ? <span className="text-[1.375rem] font-semibold leading-none tracking-tight tabular-nums">{num(m.latency.p50, 0)} ms · {num(m.latency.p95, 0)} ms</span> : na("tidak berlaku: bukan model langsung")}</Metric>
        <Metric label="Token · biaya" hint="Hanya dari data yang dikirim penyedia">{m.usage.available ? <span className="text-[15px] font-semibold tabular-nums">{m.usage.tokens_in ?? "–"} / {m.usage.tokens_out ?? "–"} · {m.usage.cost_usd === null ? "biaya tidak tersedia" : `$${num(m.usage.cost_usd, 4)}`}</span> : na("tidak tersedia")}</Metric>
      </Group>
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
    <div id="banding" className="scroll-mt-28 space-y-2.5">
      <h3 className="text-[15px] font-semibold tracking-tight text-ink">Perbandingan {SYSTEM_LABEL[from.system]} dengan {SYSTEM_LABEL[to.system]}</h3>
      <p className="text-[13px] text-ink-soft">Dari <span className="font-mono text-[12px]">{from.id}</span> ke <span className="font-mono text-[12px]">{to.id}</span>.</p>
      {(from.split !== to.split) && <Notice tone="warn">Bagian dataset berbeda ({from.split} vs {to.split}); selisih tidak sebanding.</Notice>}
      <TableCard label="Perbandingan dua run">
        <table className="w-full min-w-[42rem] text-left text-[13.5px]">
          <thead><tr><th className={th}>Metrik</th><th className={th}>{SYSTEM_LABEL[from.system]}</th><th className={th}>{SYSTEM_LABEL[to.system]}</th><th className={th}>Selisih</th></tr></thead>
          <tbody className="align-top">
            {rows.map(([l, p, q]) => (
              <tr key={l}><td className="px-4 py-3">{l}</td><td className="px-4 py-3"><RateCell r={p} /></td><td className="px-4 py-3"><RateCell r={q} /></td><td className="px-4 py-3">{VERDICT(p, q)}</td></tr>
            ))}
          </tbody>
        </table>
      </TableCard>
      <p className="text-[12.5px] leading-relaxed text-muted">Tumpang-tindih interval Wilson menganggap kasus independen (kasar, bukan uji berpasangan). {to.mode !== "live" && "Sistem kanan bukan model AI langsung."}</p>
    </div>
  );
}

function PerSlot({ m }: { m: CoreMetrics }) {
  if (!m.extraction.per_slot.length) return null;
  return (
    <div id="per-slot" className="scroll-mt-28 space-y-2.5">
      <h3 className="text-[15px] font-semibold tracking-tight text-ink">Per slot</h3>
      <TableCard label="Metrik per slot">
        <table className="w-full min-w-[36rem] text-left text-[13.5px]">
          <thead><tr><th className={th}>Slot</th><th className={`${th} text-right`}>Dukungan</th><th className={`${th} text-right`}>TP</th><th className={`${th} text-right`}>FP</th><th className={`${th} text-right`}>FN</th><th className={`${th} text-right`}>Presisi</th><th className={`${th} text-right`}>Recall</th><th className={`${th} text-right`}>F1</th></tr></thead>
          <tbody>
            {m.extraction.per_slot.map((s) => (
              <tr key={s.slot} className={s.support < 5 ? "text-muted" : ""} title={s.support < 5 ? "Dukungan di bawah 5: belum cukup untuk disimpulkan" : undefined}>
                <td className="px-4 py-3 font-mono text-[12px]">{s.slot}</td>
                <td className="px-4 py-3 text-right tabular-nums">{s.support}</td><td className="px-4 py-3 text-right tabular-nums">{s.tp}</td><td className="px-4 py-3 text-right tabular-nums">{s.fp}</td><td className="px-4 py-3 text-right tabular-nums">{s.fn}</td>
                <td className="px-4 py-3 text-right tabular-nums">{pct(s.precision)}</td><td className="px-4 py-3 text-right tabular-nums">{pct(s.recall)}</td><td className="px-4 py-3 text-right tabular-nums">{num(s.f1, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>
      <p className="text-[12.5px] leading-relaxed text-muted">Dukungan = jumlah fakta emas pada slot; di bawah 5 belum cukup untuk disimpulkan.</p>
    </div>
  );
}

function BySplit({ run }: { run: RunRow }) {
  const m = run.metrics;
  if (!m || !m.by_split.dev || !m.by_split.heldout) return null;
  const rows: [string, CoreMetrics][] = [["Dev", m.by_split.dev], ["Heldout", m.by_split.heldout]];
  return (
    <div id="dev-heldout" className="scroll-mt-28 space-y-2.5">
      <h3 className="text-[15px] font-semibold tracking-tight text-ink">Dev dan heldout</h3>
      <TableCard label="Perbandingan dev dan heldout">
        <table className="w-full min-w-[36rem] text-left text-[13.5px]">
          <thead><tr><th className={th}>Bagian</th><th className={`${th} text-right`}>Kasus</th><th className={th}>Ketepatan giliran</th><th className={th}>Recall fakta</th><th className={th}>Tahan teks perintah</th></tr></thead>
          <tbody>
            {rows.map(([l, c]) => <tr key={l}><td className="px-4 py-3 font-semibold">{l}</td><td className="px-4 py-3 text-right tabular-nums">{c.n_cases}</td><td className="px-4 py-3"><RateCell r={c.turn_exact} /></td><td className="px-4 py-3"><RateCell r={c.extraction.recall} /></td><td className="px-4 py-3"><RateCell r={c.adversarial} /></td></tr>)}
          </tbody>
        </table>
      </TableCard>
      <p className="text-[12.5px] leading-relaxed text-muted">Selisih dev–heldout menunjukkan seberapa jauh sistem disetel pada contoh terlihat; bukan ukuran dunia nyata.</p>
    </div>
  );
}

function Failures({ m, results, all, byId, base, type }: { m: CoreMetrics; results: CaseResult[]; all: CaseResult[]; byId: Map<string, EvalCaseDef>; base: Record<string, string | undefined>; type: string }) {
  const shown = results.slice(0, 60);
  return (
    <div id="gagal" className="scroll-mt-28 space-y-2.5">
      <h3 className="text-[15px] font-semibold tracking-tight text-ink">Kasus gagal dan peringatan</h3>
      <FilterChips label="Filter jenis masalah" items={[
        { href: qs(base, { type: undefined }), label: "Semua", count: all.filter((r) => r.failures.length).length, active: !type },
        ...m.failures.map((f) => ({ href: qs(base, { type: f.type }), label: FAILURE_LABEL[f.type], count: f.cases, active: type === f.type })),
      ]} />
      <TableCard label="Kasus gagal">
        {shown.length === 0 ? <EmptyState title="Tidak ada kasus pada filter ini" /> : (
          <table className="w-full min-w-[54rem] text-left text-[13.5px]">
            <thead><tr><th className={th}>Kasus</th><th className={th}>Jawaban</th><th className={th}>Seharusnya</th><th className={th}>Terbaca</th><th className={th}>Masalah</th></tr></thead>
            <tbody className="align-top">
              {shown.map((r) => {
                const c = byId.get(r.case_id);
                const s = c ? caseSummary(c) : { text: "–", gold: "–" };
                return (
                  <tr key={r.case_id}>
                    <td className="px-4 py-3 font-mono text-[12px]">{r.case_id}<div className="font-sans text-[11.5px] text-muted">{c ? SCENARIO_TITLE[c.scenario_id] ?? c.scenario_id : ""}</div></td>
                    <td className="px-4 py-3">{s.text}</td>
                    <td className="px-4 py-3 font-mono text-[12px]">{s.gold}</td>
                    <td className="px-4 py-3 font-mono text-[12px]">{r.proposals.length ? r.proposals.map((p) => `${p.slot} = ${p.value}`).join("; ") : "tidak ada fakta"}{r.kind === "turn" && <div className="font-sans text-[12px] text-muted">berikut: {r.next ?? "selesai"}</div>}</td>
                    <td className="px-4 py-3 text-[12.5px]">{r.failures.map((f) => <Pill key={f} className={`mb-1 mr-1 ${TONE_CLASS.muted}`}>{FAILURE_LABEL[f]}</Pill>)}{r.detail && <div className="mt-1 text-muted">{r.detail}</div>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </TableCard>
      {results.length > shown.length && <p className="text-[12.5px] text-muted">Menampilkan {shown.length} dari {results.length} kasus.</p>}
    </div>
  );
}
