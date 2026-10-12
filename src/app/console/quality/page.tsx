import { Cell, CellGrid, Disclosure, FilterField, Metric } from "@/components/analytics/blocks";
import { ColumnTrend } from "@/components/analytics/charts";
import { SectionNav } from "@/components/analytics/SectionNav";
import { IconDownload } from "@/components/icons";
import { CompositionBar, CompositionLegend, GapCell, Link, MiniStat, Th, VERDICT, hrefWith } from "@/components/quality/parts";
import { PrintButton } from "@/components/PrintButton";
import { Card, EmptyState, Forbidden, PageHeader, Pill, Section, SectionTitle, SimNotice, Stat, StatusPill, TableCard, Toolbar } from "@/components/ui";
import { can } from "@/lib/auth/principal";
import { getDb } from "@/lib/db";
import { ACTION_LABEL, CAUSE_LABEL, PROOF_LABEL, SESSION_LABEL, STAGE_SHORT, TONE_CLASS, type ActionStatus, type ProofStatus, type SessionStatus } from "@/lib/labels";
import { MIN_VALID_RESPONSES, PARAM_LABEL, GAP_RULES } from "@/lib/quality/definitions";
import { normalizeFilters, qualityDashboard } from "@/lib/quality/metrics";
import { num, pct, pctRange } from "@/lib/quality/stats";
import { getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";

const SR_LABEL: Record<string, string> = { obat: "Obat tidak diterima seluruhnya", biaya: "Biaya yang dipertanyakan", kendala_belum_selesai: "Kendala yang belum selesai", visit_dokter: "Dokter tidak datang memeriksa", informasi: "Informasi" };
const monthLabel = (m: string) => new Date(m + "-01T00:00:00").toLocaleDateString("id-ID", { month: "short", year: "numeric" });
const link = "font-medium text-brand-ink underline decoration-brand/30 underline-offset-3 hover:decoration-current";

export default async function QualityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await getPrincipal("konsol");
  if (!can(me, "quality.view")) return <Forbidden need="quality.view" />;
  const f = normalizeFilters(await searchParams);
  const db = getDb();
  const d = qualityDashboard(db, me, f);
  const routine = f.mode === "routine";
  const metricDefs = db.prepare("SELECT id, metric, version, definition, numerator, denominator, status, note FROM metric_definitions ORDER BY id").all() as { id: string; metric: string; version: string; definition: string; numerator: string; denominator: string; status: string; note: string }[];
  const gapAnswers = d.pipeline.participant_reports.gap_answers;
  const concluded = (d.pipeline.proof.verified ?? 0) + (d.pipeline.proof.not_verified ?? 0) + (d.pipeline.proof.inconclusive ?? 0);
  const unfinished = (d.pipeline.proof.signal ?? 0) + (d.pipeline.proof.under_review ?? 0) + (d.pipeline.proof.awaiting_clarification ?? 0);
  const noSessions = d.sessions.total === 0;
  const filtered = !!(f.from || f.to || f.facilityId || f.careType || f.stage || f.indicatorId);
  const trendLabel = f.indicatorId ? d.indicators.find((i) => i.key === f.indicatorId)?.label ?? f.indicatorId : "";

  const nav = [
    { id: "gap", label: routine ? "Gap per indikator" : "Konfirmasi terarah" },
    { id: "alur", label: "Dari laporan ke perbaikan" },
    { id: "waktu", label: "Waktu penyelesaian" },
    { id: "keluhan", label: "Keluhan" },
    { id: "sebelum", label: "Sebelum dan sesudah" },
    { id: "kepuasan", label: "Kepuasan" },
    { id: "definisi", label: "Definisi" },
  ];

  return (
    <>
      <PageHeader
        title="Dasbor mutu"
        purpose="Selisih layanan yang dijanjikan dan yang dilaporkan diterima; tiap rasio menyebut n dan cakupan."
        eyebrow="Mutu dan keuangan"
      >
        <div className="no-print flex flex-wrap items-center gap-2">
          <a href={hrefWith("/api/quality/export", f, {})} className="btn btn-secondary"><IconDownload size={15} /> Ekspor tabel (CSV)</a>
          <PrintButton />
        </div>
      </PageHeader>

      <SimNotice>
        Data sintetis. Gap laporan peserta dan hasil pembuktian petugas, <strong>bukan</strong> Indikator Nasional Mutu resmi, kerugian terbukti, atau penilaian faskes. Definisi masih draf.
      </SimNotice>

      <div className="no-print mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        <nav aria-label="Mode survei" className="inline-flex rounded-lg bg-subtle p-0.5 ring-1 ring-inset ring-line">
          {([["routine", "Survei rutin"], ["directed", "Konfirmasi terarah"]] as const).map(([m, label]) => (
            <Link key={m} href={hrefWith("/console/quality", f, { mode: m === "directed" ? "directed" : null, indicator: null, stage: null })} aria-current={f.mode === m ? "page" : undefined}
              className={`inline-flex min-h-8 items-center rounded-md px-3.5 text-[13.5px] font-medium transition-colors ${f.mode === m ? "bg-card text-ink shadow-depth-1 ring-1 ring-line" : "text-ink-soft hover:text-ink"}`}>{label}</Link>
          ))}
        </nav>
        <p className="min-w-0 flex-1 basis-72 text-[13px] leading-relaxed text-ink-soft">
          {routine ? "Pertanyaan inti sama untuk semua peserta, jadi dapat dibandingkan." : "Ditanya hanya bila ada sinyal; tidak pernah dijumlahkan dengan survei rutin."}
        </p>
      </div>

      <Toolbar className="no-print mt-4">
        <form method="get" className="contents" role="search" aria-label="Filter dasbor mutu">
          {!routine && <input type="hidden" name="mode" value="directed" />}
          <div className="grid w-full grid-cols-2 gap-x-3 gap-y-3 md:grid-cols-3 lg:grid-cols-6">
            <FilterField label="Dari bulan">
              <select name="from" defaultValue={f.from ?? ""} className="field"><option value="">Semua</option>{d.options.periods.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select>
            </FilterField>
            <FilterField label="Sampai bulan">
              <select name="to" defaultValue={f.to ?? ""} className="field"><option value="">Semua</option>{d.options.periods.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select>
            </FilterField>
            <FilterField label="Faskes" className="col-span-2 md:col-span-1">
              <select name="facility" defaultValue={f.facilityId ?? ""} className="field"><option value="">Semua faskes</option>{d.options.facilities.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
            </FilterField>
            <FilterField label="Jenis layanan">
              <select name="care" defaultValue={f.careType ?? ""} className="field"><option value="">Semua</option><option value="outpatient">Rawat jalan</option><option value="inpatient">Rawat inap</option></select>
            </FilterField>
            {routine && (
              <>
                <FilterField label="Tahap">
                  <select name="stage" defaultValue={f.stage ?? ""} className="field"><option value="">Semua tahap</option><option value="pre">Pra</option><option value="intra">Intra</option><option value="post">Pasca</option></select>
                </FilterField>
                <FilterField label="Indikator">
                  <select name="indicator" defaultValue={f.indicatorId ?? ""} className="field"><option value="">Semua indikator</option>{GAP_RULES.map((r) => <option key={r.indicator_id} value={r.indicator_id}>{d.indicators.find((i) => i.meta.id === r.indicator_id)?.meta.title ?? r.indicator_id}</option>)}</select>
                </FilterField>
              </>
            )}
          </div>
          <div className="flex w-full flex-wrap items-center gap-2">
            <button className="btn btn-primary">Terapkan</button>
            <Link href={hrefWith("/console/quality", { mode: f.mode }, {})} className="btn btn-ghost">Atur ulang</Link>
            {filtered && <span className="text-[12.5px] text-muted">Filter aktif; semua angka di bawah mengikuti filter ini.</span>}
          </div>
        </form>
      </Toolbar>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sesi survei (bukan sandbox)" value={d.sessions.total} hint={Object.entries(d.sessions.by_status).map(([k, v]) => `${SESSION_LABEL[k as SessionStatus] ?? k}: ${v}`).join(" · ") || "Belum ada sesi pada filter ini"} />
        <Stat label="Respons undangan" value={d.sessions.invitations.response_rate === null ? "–" : pct(d.sessions.invitations.response_rate)} hint={`${d.sessions.invitations.answered} dijawab dari ${d.sessions.invitations.delivered} undangan terkirim; ${d.sessions.invitations.expired} kedaluwarsa`} />
        <Stat label={routine ? "Jawaban belum terpenuhi" : "Konfirmasi terarah"} value={routine ? gapAnswers : d.directed?.answered ?? 0} hint={routine ? "Jumlah jawaban negatif; BUKAN rasio. Rasio ada di tabel indikator." : "Undangan terarah yang dijawab"} tone="warn" />
        <Stat label="Temuan terbukti" value={d.pipeline.proof.verified ?? 0} hint={concluded ? `dari ${concluded} temuan berstatus akhir; ${unfinished} belum selesai` : "Belum ada temuan berstatus akhir"} />
      </div>
      {d.sessions.companion > 0 && <p className="mt-2.5 text-[12.5px] text-muted">{d.sessions.companion} dari {d.sessions.total} sesi dijawab pendamping yang diotorisasi; tetap dihitung, dapat dibedakan.</p>}

      <div className="mt-6" />
      <SectionNav items={nav} />

      {routine ? (
        <Section id="gap" className="scroll-mt-28">
          <SectionTitle title="Gap laporan per indikator" hint={`Jawaban negatif ÷ jawaban sah. Di bawah ${MIN_VALID_RESPONSES} jawaban sah ditandai belum cukup (${PARAM_LABEL}).`} />
          <CompositionLegend />
          <TableCard label="Gap laporan per indikator">
            {d.indicators.length === 0 ? (
              <EmptyState title={noSessions ? "Belum ada sesi survei pada filter ini" : "Belum ada jawaban yang dapat dihitung"}>Gap hanya dihitung dari sesi survei yang benar-benar ada. Tidak ada angka bawaan.</EmptyState>
            ) : (
              <table className="w-full min-w-[58rem] text-left text-[13.5px]">
                <thead><tr>
                  <Th>Indikator</Th><Th num title="Jawaban sah: ya atau tidak. Angka kedua: sesi yang berlaku">n sah</Th><Th className="min-w-36" title="Jawaban negatif ÷ n sah, interval Wilson 95%">Gap laporan</Th><Th className="min-w-32">Komposisi</Th><Th num title="Jawaban terbaca ÷ sesi yang berlaku dan sudah selesai">Cakupan</Th>
                  <Th num className="whitespace-normal" title="Dijawab tidak tahu / tidak paham. Tidak masuk gap.">Tidak tahu</Th><Th num className="whitespace-normal">Tidak berlaku</Th><Th num className="whitespace-normal" title="Berlaku tetapi tidak sampai ditanyakan (sesi sebagian)">Tidak ditanya</Th><Th num className="whitespace-normal" title="Undangan kedaluwarsa tanpa jawaban">Tidak merespons</Th>
                </tr></thead>
                <tbody>
                  {d.indicators.map((r) => (
                    <tr key={r.key} className={f.indicatorId === r.key ? "bg-brand-tint/70" : ""}>
                      <td className="max-w-72 px-4 py-3 align-top">
                        <Link href={hrefWith("/console/quality", f, { indicator: r.key })} className={link}>{r.label}</Link>
                        <p className="mt-1 text-[12px] leading-snug text-muted"><span className="mr-1.5 inline-block rounded bg-subtle px-1.5 py-px text-[11.5px] font-medium text-ink-soft ring-1 ring-inset ring-line">{STAGE_SHORT[r.meta.stage as keyof typeof STAGE_SHORT] ?? r.meta.stage}</span>{r.meta.rule.meaning}</p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right align-top tabular-nums">{r.n_valid}<span className="text-[12px] text-muted"> / {r.eligible}</span></td>
                      <td className="px-4 py-3 align-top"><GapCell row={r} /></td>
                      <td className="px-4 py-3 align-middle"><CompositionBar row={r} /></td>
                      <td className="px-3 py-3 text-right align-top tabular-nums">{pct(r.coverage)}</td>
                      <td className="px-3 py-3 text-right align-top tabular-nums">{r.unknown}</td><td className="px-3 py-3 text-right align-top tabular-nums">{r.not_applicable}</td><td className="px-3 py-3 text-right align-top tabular-nums">{r.not_asked}</td><td className="px-3 py-3 text-right align-top tabular-nums">{r.nonresponse}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </TableCard>
          {d.rules_missing.length > 0 && <p className="text-[12.5px] text-warn">Indikator berikut belum punya aturan polaritas gap dan tidak dihitung: {d.rules_missing.join(", ")}.</p>}

          {d.by_care_type.length > 0 && (
            <div className="space-y-3 pt-4">
              <SectionTitle title="Menurut jenis layanan" hint="Dibaca terpisah; penggabungan dapat menyembunyikan perbedaan." />
              <TableCard label="Gap menurut jenis layanan">
                <table className="w-full min-w-[40rem] text-left text-[13.5px]">
                  <thead><tr><Th>Indikator</Th><Th>Rawat jalan</Th><Th num>n sah</Th><Th>Rawat inap</Th><Th num>n sah</Th></tr></thead>
                  <tbody>
                    {d.by_care_type.map((r) => (
                      <tr key={r.indicator_id}>
                        <td className="px-4 py-3">{r.label}</td>
                        <td className="px-4 py-3">{r.outpatient ? <GapCell row={r.outpatient} /> : <span className="text-muted">tidak ada data</span>}</td><td className="px-4 py-3 text-right tabular-nums">{r.outpatient?.n_valid ?? 0}</td>
                        <td className="px-4 py-3">{r.inpatient ? <GapCell row={r.inpatient} /> : <span className="text-muted">tidak ada data</span>}</td><td className="px-4 py-3 text-right tabular-nums">{r.inpatient?.n_valid ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableCard>
            </div>
          )}

          {f.indicatorId && d.trend && (
            <div className="space-y-3 pt-4">
              <SectionTitle title={`Tren bulanan: ${trendLabel}`} hint="Bulan dengan jawaban sah sedikit bukan tren." />
              {d.trend.length > 1 && (
                <ColumnTrend
                  points={d.trend.map((t) => ({ key: t.key, label: monthLabel(t.key), value: t.gap, lo: t.ci?.lo ?? null, hi: t.ci?.hi ?? null, muted: !t.sufficient, note: `n sah ${t.n_valid}${t.sufficient ? "" : ", data belum cukup"}` }))}
                  caption="Tinggi kolom = gap laporan; garis tipis = interval 95%; kolom abu-abu = data belum cukup. Angka tepat ada di tabel."
                />
              )}
              <TableCard label="Tren bulanan">
                <table className="w-full min-w-[40rem] text-left text-[13.5px]">
                  <thead><tr><Th>Bulan</Th><Th num>n sah</Th><Th>Gap laporan</Th><Th className="w-1/3">Gap</Th><Th num>Tidak tahu</Th><Th num>Tidak merespons</Th></tr></thead>
                  <tbody>
                    {d.trend.map((t) => (
                      <tr key={t.key}>
                        <td className="px-4 py-3 font-medium">{monthLabel(t.key)}</td><td className="px-4 py-3 text-right tabular-nums">{t.n_valid}</td><td className="px-4 py-3"><GapCell row={t} /></td>
                        <td className="px-4 py-3"><div className="h-2 w-full rounded-full bg-line" aria-hidden><div className={`h-2 rounded-full ${t.sufficient ? "bg-brand" : "bg-muted/50"}`} style={{ width: `${(t.gap ?? 0) * 100}%` }} /></div></td>
                        <td className="px-4 py-3 text-right tabular-nums">{t.unknown}</td><td className="px-4 py-3 text-right tabular-nums">{t.nonresponse}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableCard>
            </div>
          )}

          {f.indicatorId && d.facilities && (
            <div className="space-y-3 pt-4">
              <SectionTitle title="Perbandingan antarfaskes" hint="Indikator, versi, dan periode yang sama. Urut nama, tidak diperingkat." />
              <TableCard label="Perbandingan antarfaskes">
                <table className="w-full min-w-[46rem] text-left text-[13.5px]">
                  <thead><tr><Th>Faskes</Th><Th>Kelompok pembanding</Th><Th num>n sah</Th><Th>Gap laporan</Th><Th num>Cakupan</Th><Th num>Tidak tahu</Th><Th num>Tidak merespons</Th></tr></thead>
                  <tbody>
                    {d.facilities.map((x) => (
                      <tr key={x.key}>
                        <td className="px-4 py-3 font-medium">{x.label}</td><td className="px-4 py-3 text-[12.5px] text-ink-soft">{x.peer_group ?? "–"}</td><td className="px-4 py-3 text-right tabular-nums">{x.n_valid}</td>
                        <td className="px-4 py-3"><GapCell row={x} /></td><td className="px-4 py-3 text-right tabular-nums">{pct(x.coverage)}</td><td className="px-4 py-3 text-right tabular-nums">{x.unknown}</td><td className="px-4 py-3 text-right tabular-nums">{x.nonresponse}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableCard>
              <p className="max-w-3xl text-[12.5px] leading-relaxed text-muted">Perbedaan bisa berasal dari campuran kasus, ukuran sampel, dan respons, bukan hanya mutu. Faskes beda kelompok pembanding kurang sepadan.</p>
            </div>
          )}
        </Section>
      ) : (
        <Section id="gap" className="scroll-mt-28">
          <SectionTitle title="Konfirmasi layanan terarah" hint="“Tidak ingat” bukan “tidak”; tidak merespons dilaporkan terpisah." />
          {d.directed && d.directed.invited > 0 ? (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
                <MiniStat label="Undangan terarah" value={d.directed.invited} hint={`${d.directed.in_progress} masih berjalan`} />
                <MiniStat label="Menyatakan menjalani" value={d.directed.yes} hint="Ya" />
                <MiniStat label="Menyatakan tidak menjalani" value={d.directed.no} hint="Menjadi sinyal untuk dibuktikan, bukan putusan" />
                <MiniStat label="Tidak ingat / tidak yakin" value={d.directed.unknown} hint="Netral; tidak dihitung sebagai 'tidak'" />
                <MiniStat label="Tidak merespons" value={d.directed.nonresponse} hint="Dilaporkan terpisah" />
              </div>
              <TableCard label="Konfirmasi terarah per faskes">
                <table className="w-full min-w-[36rem] text-left text-[13.5px]">
                  <thead><tr><Th>Faskes</Th><Th num>Dijawab</Th><Th num>Ya</Th><Th num>Tidak</Th><Th num>Tidak ingat</Th><Th num>Tidak merespons</Th></tr></thead>
                  <tbody>{d.directed.by_facility.map((x) => (<tr key={x.facility_id}><td className="px-4 py-3 font-medium">{x.facility}</td><td className="px-4 py-3 text-right tabular-nums">{x.answered}</td><td className="px-4 py-3 text-right tabular-nums">{x.yes}</td><td className="px-4 py-3 text-right tabular-nums">{x.no}</td><td className="px-4 py-3 text-right tabular-nums">{x.unknown}</td><td className="px-4 py-3 text-right tabular-nums">{x.nonresponse}</td></tr>))}</tbody>
                </table>
              </TableCard>
              <Card className="px-5 py-4">
                <p className="text-[14px] font-medium text-ink">Hasil pembuktian temuan yang berasal dari konfirmasi terarah</p>
                <p className="mt-2.5 flex flex-wrap gap-2">
                  {Object.keys(d.directed.findings).length === 0 ? <span className="text-[13.5px] text-ink-soft">Belum ada temuan dari konfirmasi terarah pada filter ini.</span> : Object.entries(d.directed.findings).map(([k, v]) => (
                    <StatusPill key={k} tone={PROOF_LABEL[k as ProofStatus]?.tone ?? "muted"}>{PROOF_LABEL[k as ProofStatus]?.label ?? k}: {v}</StatusPill>
                  ))}
                </p>
              </Card>
            </>
          ) : (
            <Card><EmptyState title="Belum ada konfirmasi terarah pada filter ini">Konfirmasi terarah dibuat dari sinyal pada klaim. Bagian ini terisi setelah sesi terarah berjalan.</EmptyState></Card>
          )}
        </Section>
      )}

      <Section id="alur" className="scroll-mt-28">
        <SectionTitle title="Dari laporan sampai perbaikan" hint="Enam hal terpisah, masing-masing dengan penyebutnya sendiri." />
        <CellGrid>
          <Cell>
            <p className="text-[14px] font-semibold text-ink">1. Laporan peserta</p>
            <p className="mt-2.5 text-[1.75rem] font-semibold leading-none tracking-tight tabular-nums">{d.pipeline.participant_reports.gap_answers}</p>
            <p className="mt-1.5 text-[12.5px] text-muted">jawaban belum terpenuhi pada survei rutin</p>
            <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-soft"><span className="tabular-nums">{d.pipeline.participant_reports.findings_from_reports}</span> menjadi temuan, <span className="tabular-nums">{d.pipeline.participant_reports.service_requests}</span> permintaan layanan tercatat</p>
          </Cell>
          <Cell>
            <p className="text-[14px] font-semibold text-ink">2. Sinyal mesin (klaim)</p>
            <p className="mt-2.5 text-[1.75rem] font-semibold leading-none tracking-tight tabular-nums">{d.pipeline.machine_signals.total}</p>
            <p className="mt-1.5 text-[12.5px] text-muted">sinyal dari pencocokan data klaim, bukan dari peserta</p>
            <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-soft">{Object.entries(d.pipeline.machine_signals.by_type).map(([k, v]) => `${k}: ${v}`).join(" · ") || "–"}. Sinyal bukan bukti.</p>
          </Cell>
          <Cell>
            <p className="text-[14px] font-semibold text-ink">3. Pembuktian oleh petugas</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">{(["signal", "under_review", "awaiting_clarification", "verified", "not_verified", "inconclusive"] as ProofStatus[]).map((k) => (<StatusPill key={k} tone={PROOF_LABEL[k].tone}>{PROOF_LABEL[k].label}: {d.pipeline.proof[k] ?? 0}</StatusPill>))}</div>
            <p className="mt-2.5 text-[12.5px] text-muted">Semua temuan (laporan dan sinyal mesin) pada filter ini.</p>
          </Cell>
          <Cell>
            <p className="text-[14px] font-semibold text-ink">4. Analisis penyebab</p>
            <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-soft">Hanya untuk temuan terbukti ({d.pipeline.proof.verified ?? 0}). Boleh lebih dari satu kategori.</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5"><Pill className={TONE_CLASS.muted}>{CAUSE_LABEL.administrative.label}: {d.pipeline.causes.administrative}</Pill><Pill className={TONE_CLASS.muted}>{CAUSE_LABEL.service_process.label}: {d.pipeline.causes.service_process}</Pill><Pill className={TONE_CLASS.muted}>Belum dianalisis: {d.pipeline.causes.not_analysed}</Pill></div>
            <p className="mt-2.5 text-[12.5px] text-muted">Eskalasi tinjauan lanjutan disetujui dua pihak (label dugaan, bukan putusan): {d.pipeline.causes.escalations_approved}.</p>
          </Cell>
          <Cell>
            <p className="text-[14px] font-semibold text-ink">5. Keputusan klaim</p>
            <p className="mt-2.5 text-[1.75rem] font-semibold leading-none tracking-tight tabular-nums">{d.pipeline.claim_decisions.total}</p>
            <p className="mt-1.5 text-[12.5px] text-muted">catatan peninjauan klaim oleh petugas</p>
            <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-soft">{d.pipeline.claim_decisions.simulated} dicatat sebagai simulasi. Aplikasi tidak mengubah klaim, pembayaran, atau sanksi.</p>
          </Cell>
          <Cell>
            <p className="text-[14px] font-semibold text-ink">6. Tindakan perbaikan</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">{(Object.keys(ACTION_LABEL) as ActionStatus[]).map((k) => (<Pill key={k} className={TONE_CLASS.muted}>{ACTION_LABEL[k]}: {d.pipeline.actions[k] ?? 0}</Pill>))}</div>
            <p className="mt-2.5 text-[12.5px] text-muted">Status tindakan terpisah dari status pembuktian.</p>
          </Cell>
        </CellGrid>

        <div className="space-y-3 pt-4">
          <SectionTitle title="Laporan dan temuan terverifikasi per indikator" hint="Penyebut proporsi terbukti = temuan berstatus akhir; yang belum selesai tidak ikut." />
          <TableCard label="Laporan dan temuan terverifikasi per indikator">
            {d.reports_vs_verified.length === 0 ? <EmptyState title="Belum ada laporan atau temuan dari survei pada filter ini" /> : (
              <table className="w-full min-w-[52rem] text-left text-[13.5px]">
                <thead><tr><Th>Indikator</Th><Th num title="Jawaban belum terpenuhi">Laporan</Th><Th num>Menjadi temuan</Th><Th num>Berjalan</Th><Th num>Terbukti</Th><Th num>Tidak terbukti</Th><Th num>Tidak dapat dibuktikan</Th><Th num title="Terbukti ÷ berstatus akhir">Proporsi terbukti</Th></tr></thead>
                <tbody>
                  {d.reports_vs_verified.map((x) => (
                    <tr key={x.indicator_id}>
                      <td className="px-4 py-3">{x.label}</td><td className="px-4 py-3 text-right tabular-nums">{x.reports}</td><td className="px-4 py-3 text-right tabular-nums">{x.findings}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{x.findings - x.concluded}</td><td className="px-4 py-3 text-right tabular-nums">{x.verified}</td><td className="px-4 py-3 text-right tabular-nums">{x.by_proof.not_verified ?? 0}</td><td className="px-4 py-3 text-right tabular-nums">{x.by_proof.inconclusive ?? 0}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{x.verified_share === null ? "–" : <>{pct(x.verified_share)} <span className="whitespace-nowrap text-[12px] text-muted">({pctRange(x.ci)}; n {x.concluded})</span></>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </TableCard>
          <p className="max-w-3xl text-[12.5px] leading-relaxed text-muted">Satu laporan valid tetap ditindaklanjuti; jumlah minimum hanya menentukan apakah rasio agregat boleh dibaca.</p>
        </div>
      </Section>

      <Section id="waktu" className="scroll-mt-28">
        <SectionTitle title="Waktu penyelesaian" hint="Hanya untuk yang sudah selesai; yang berjalan dihitung, tidak diperkirakan." />
        <TableCard label="Waktu penyelesaian">
          <table className="w-full min-w-[34rem] text-left text-[13.5px]">
            <thead><tr><Th>Tahap</Th><Th num>Selesai (n)</Th><Th num>Berjalan</Th><Th num>Median (hari)</Th><Th num>P90 (hari)</Th></tr></thead>
            <tbody>
              {d.resolution.stats.map((s) => (<tr key={s.label}><td className="px-4 py-3">{s.label}</td><td className="px-4 py-3 text-right tabular-nums">{s.n}</td><td className="px-4 py-3 text-right tabular-nums">{s.open}</td><td className="px-4 py-3 text-right tabular-nums">{num(s.median_days)}</td><td className="px-4 py-3 text-right tabular-nums">{num(s.p90_days)}</td></tr>))}
            </tbody>
          </table>
        </TableCard>
        <div className="grid gap-3 md:grid-cols-2">
          <MiniStat label="Klarifikasi melewati tenggat" value={d.resolution.clarification.lapsed_share === null ? "–" : pct(d.resolution.clarification.lapsed_share)} hint={`${d.resolution.clarification.lapsed} lewat tenggat dari ${d.resolution.clarification.answered + d.resolution.clarification.lapsed} yang selesai; ${d.resolution.clarification.sent} masih berjalan. Lewat tenggat memenuhi hak jawab, tidak membuktikan apa pun.`} />
          <MiniStat label="Peserta mengonfirmasi kendala selesai" value={d.resolution.confirmation.resolved_share === null ? "–" : pct(d.resolution.confirmation.resolved_share)} hint={`${d.resolution.confirmation.resolved} selesai · ${d.resolution.confirmation.still_issue} masih ada kendala · ${d.resolution.confirmation.pending} menunggu jawaban`} />
        </div>
      </Section>

      <Section id="keluhan" className="scroll-mt-28">
        <SectionTitle title="Keluhan dan permintaan layanan" hint="Terpisah dari klaim; bantuan tidak menunggu investigasi." />
        <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <TableCard label="Permintaan layanan per kategori">
            {d.complaints.service_requests.length === 0 ? <EmptyState title="Belum ada permintaan layanan pada filter ini" /> : (
              <table className="w-full min-w-[28rem] text-left text-[13.5px]">
                <thead><tr><Th>Kategori</Th><Th num>Total</Th><Th num>Masih berjalan</Th><Th num>Selesai atau ditutup</Th></tr></thead>
                <tbody>{d.complaints.service_requests.map((c) => (<tr key={c.category}><td className="px-4 py-3">{SR_LABEL[c.category] ?? c.category}</td><td className="px-4 py-3 text-right tabular-nums">{c.total}</td><td className="px-4 py-3 text-right tabular-nums">{c.open}</td><td className="px-4 py-3 text-right tabular-nums">{c.resolved}</td></tr>))}</tbody>
              </table>
            )}
          </TableCard>
          <Metric label="Permintaan bantuan peserta" value={d.complaints.help.total} hint={<>{d.complaints.help.open} terbuka · {d.complaints.help.handled} ditangani{d.complaints.help.median_hours !== null && <> · median {num(d.complaints.help.median_hours, 0)} jam sampai ditangani</>}</>} />
        </div>
      </Section>

      <Section id="sebelum" className="scroll-mt-28">
        <SectionTitle title="Sebelum dan sesudah tindakan perbaikan" hint="Gap indikator dan faskes yang sama: 90 hari sebelum tindakan dibuat vs sesudah selesai." />
        <SimNotice>Perubahan angka belum membuktikan tindakan itu sebabnya: tanpa kelompok kontrol, tren umum dan respons ikut menggeser angka.</SimNotice>
        {d.before_after.length === 0 ? <Card><EmptyState title="Belum ada tindakan perbaikan dengan indikator yang dapat dibandingkan" /></Card> : (
          <div className="grid gap-3 lg:grid-cols-2">
            {d.before_after.map((b) => (
              <Card key={b.action_id} className="min-w-0 px-5 py-4 text-[14px]">
                <p className="font-semibold text-ink">{b.facility}</p>
                <p className="mt-1 text-ink-soft">{b.indicator}</p>
                <p className="mt-0.5 text-[12.5px] text-muted"><span className="font-mono">{b.action_id}</span> · {ACTION_LABEL[b.status as ActionStatus] ?? b.status}</p>
                <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{b.description}</p>
                <div className="mt-3 inline-flex max-w-full"><span className={`inline-flex items-center rounded-md px-2 py-1 text-[12.5px] font-medium leading-snug ${VERDICT[b.verdict].cls}`}>{VERDICT[b.verdict].label}</span></div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-subtle/70 p-3"><p className="text-[12px] font-medium text-ink-soft">Sebelum ({b.window_before.from} s.d. {b.window_before.to})</p><p className="mt-1.5">{b.before ? <GapCell row={b.before} /> : <span className="text-muted">tidak ada sesi</span>}</p><p className="mt-1 text-[12px] text-muted">n sah {b.before?.n_valid ?? 0}</p></div>
                  <div className="rounded-lg bg-subtle/70 p-3"><p className="text-[12px] font-medium text-ink-soft">Sesudah {b.window_after ? `(${b.window_after.from} s.d. ${b.window_after.to})` : ""}</p><p className="mt-1.5">{b.after ? <GapCell row={b.after} /> : <span className="text-muted">{b.window_after ? "tidak ada sesi" : "belum ada"}</span>}</p><p className="mt-1 text-[12px] text-muted">n sah {b.after?.n_valid ?? 0}</p></div>
                </div>
                <p className="mt-3 text-[12.5px] leading-relaxed text-muted">Faskes sepeer (konteks): sebelum {b.peers_before?.gap != null ? pct(b.peers_before.gap) : "–"} (n {b.peers_before?.n_valid ?? 0}), sesudah {b.peers_after?.gap != null ? pct(b.peers_after.gap) : "–"} (n {b.peers_after?.n_valid ?? 0}).{b.delta_points !== null && <> Selisih faskes: {num(b.delta_points)} poin persentase.</>}</p>
              </Card>
            ))}
          </div>
        )}
      </Section>

      <Section id="kepuasan" className="scroll-mt-28">
        <SectionTitle title="Kepuasan (instrumen internal opsional)" hint="Tidak masuk gap dan tidak pernah masuk skor indikasi." />
        {d.satisfaction.n_valid === 0 ? <Card><EmptyState title="Belum ada jawaban skor kepuasan">Instrumen ini opsional. Tanpa jawaban, bagian ini sengaja kosong.</EmptyState></Card> : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MiniStat label="Rata-rata skor (0-10)" value={num(d.satisfaction.mean)} hint={`${d.satisfaction.n_valid} jawaban sah`} />
            <MiniStat label="Skor 0-4" value={d.satisfaction.low} /><MiniStat label="Skor 5-7" value={d.satisfaction.mid} /><MiniStat label="Skor 8-10" value={d.satisfaction.high} />
          </div>
        )}
        <p className="max-w-3xl text-[12.5px] leading-relaxed text-muted">Bukan Indikator Nasional Mutu resmi: instrumen, formula, dan sampling resmi belum diikuti. {d.satisfaction.excluded > 0 && `${d.satisfaction.excluded} jawaban di luar 0-10 dikeluarkan.`}</p>
      </Section>

      <Section id="definisi" className="scroll-mt-28">
        <SectionTitle title="Definisi metrik berversi" hint="Sumber rumus; semua draf sampai divalidasi pemilik proses." />
        <Card className="divide-y divide-line">
          {metricDefs.map((m) => (
            <details key={m.id} className="group">
              <summary className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-[14px] font-semibold text-ink hover:bg-subtle/60"><span>{m.metric.replaceAll("_", " ")}</span><span className="font-mono text-[12px] font-normal text-muted">{m.version}</span><StatusPill tone="warn">{m.status === "draft" ? "Draf" : m.status}</StatusPill></summary>
              <div className="space-y-2 border-t border-line bg-subtle/40 px-5 py-4 text-[13.5px] leading-relaxed">
                <p className="text-ink-soft">{m.definition}</p>
                <p><span className="font-medium text-ink">Pembilang:</span> <span className="text-ink-soft">{m.numerator}</span></p>
                <p><span className="font-medium text-ink">Penyebut:</span> <span className="text-ink-soft">{m.denominator}</span></p>
                <p className="text-[12.5px] text-muted">{m.note}</p>
              </div>
            </details>
          ))}
        </Card>
        <Disclosure title="Polaritas jawaban per indikator" flush>
          <div className="scroll-x"><table className="w-full min-w-[34rem] text-left text-[13.5px]"><thead><tr><Th>Indikator</Th><Th>Butir yang diukur</Th><Th>Dihitung belum terpenuhi</Th><Th>Terpenuhi</Th></tr></thead>
            <tbody className="align-top">{GAP_RULES.map((r) => (<tr key={r.indicator_id}><td className="px-4 py-3 font-mono text-[12px]">{r.indicator_id}</td><td className="px-4 py-3">{r.slot}{r.requires && <span className="text-[12px] text-muted"> (hanya bila {r.requires.slot} = {r.requires.values.join("/")})</span>}</td><td className="px-4 py-3">{r.negative.join(", ")}</td><td className="px-4 py-3">{r.positive.join(", ")}</td></tr>))}</tbody></table></div>
        </Disclosure>
      </Section>
    </>
  );
}
