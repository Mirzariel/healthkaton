import { CARE_LABEL, CompositionBar, CompositionLegend, GapCell, Link, MiniStat, Th, VERDICT, hrefWith } from "@/components/quality/parts";
import { PrintButton } from "@/components/PrintButton";
import { Card, EmptyState, Forbidden, PageHeader, Pill, SectionTitle, SimNotice, Stat } from "@/components/ui";
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
const sel = "rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm";

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

  return (
    <>
      <PageHeader
        title="Dasbor mutu"
        purpose="Selisih antara layanan yang dijanjikan dan yang dilaporkan diterima, dihitung dari data yang sama dengan ruang kasus. Setiap rasio menyebut jumlah jawaban dan cakupannya."
        eyebrow="Mutu dan keuangan"
      >
        <div className="no-print flex items-center gap-2">
          <a href={hrefWith("/api/quality/export", f, {})} className="rounded-lg border border-line bg-card px-3 py-2 text-sm font-semibold hover:border-ink/40">Ekspor tabel (CSV)</a>
          <PrintButton />
        </div>
      </PageHeader>

      <SimNotice>
        Data sintetis. Angka ini adalah gap laporan peserta dan hasil pembuktian petugas, <strong>bukan</strong> Indikator Nasional Mutu resmi, bukan kerugian terbukti, dan bukan penilaian atas faskes. Definisi metrik berstatus draf (lihat bagian bawah) dan menunggu validasi.
      </SimNotice>

      <nav aria-label="Mode survei" className="no-print mt-5 flex gap-1 rounded-xl border border-line bg-card p-1 text-sm font-semibold w-fit">
        {([["routine", "Survei rutin"], ["directed", "Konfirmasi terarah"]] as const).map(([m, label]) => (
          <Link key={m} href={hrefWith("/console/quality", f, { mode: m === "directed" ? "directed" : null, indicator: null, stage: null })} aria-current={f.mode === m ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 ${f.mode === m ? "bg-brand text-white" : "text-ink-soft hover:bg-brand-soft/60"}`}>{label}</Link>
        ))}
      </nav>
      <p className="mt-2 max-w-3xl text-xs text-muted">
        {routine ? "Survei rutin: pertanyaan inti yang sama untuk semua peserta, sehingga dapat dibandingkan." : "Konfirmasi terarah: ditanyakan hanya bila ada sinyal pada satu tindakan. Distribusinya berbeda dari survei rutin, karena itu tidak pernah dijumlahkan dengan survei rutin."}
      </p>

      <form method="get" className="no-print mt-4 grid gap-3 rounded-xl border border-line bg-card p-4 sm:grid-cols-2 lg:grid-cols-6" role="search" aria-label="Filter dasbor mutu">
        {!routine && <input type="hidden" name="mode" value="directed" />}
        <label className="text-xs font-medium text-ink-soft">Dari bulan
          <select name="from" defaultValue={f.from ?? ""} className={`${sel} mt-1 w-full`}><option value="">Semua</option>{d.options.periods.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select>
        </label>
        <label className="text-xs font-medium text-ink-soft">Sampai bulan
          <select name="to" defaultValue={f.to ?? ""} className={`${sel} mt-1 w-full`}><option value="">Semua</option>{d.options.periods.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select>
        </label>
        <label className="text-xs font-medium text-ink-soft">Faskes
          <select name="facility" defaultValue={f.facilityId ?? ""} className={`${sel} mt-1 w-full`}><option value="">Semua faskes</option>{d.options.facilities.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
        </label>
        <label className="text-xs font-medium text-ink-soft">Jenis layanan
          <select name="care" defaultValue={f.careType ?? ""} className={`${sel} mt-1 w-full`}><option value="">Semua</option><option value="outpatient">Rawat jalan</option><option value="inpatient">Rawat inap</option></select>
        </label>
        {routine && (
          <>
            <label className="text-xs font-medium text-ink-soft">Tahap
              <select name="stage" defaultValue={f.stage ?? ""} className={`${sel} mt-1 w-full`}><option value="">Semua tahap</option><option value="pre">Pra</option><option value="intra">Intra</option><option value="post">Pasca</option></select>
            </label>
            <label className="text-xs font-medium text-ink-soft">Indikator
              <select name="indicator" defaultValue={f.indicatorId ?? ""} className={`${sel} mt-1 w-full`}><option value="">Semua indikator</option>{GAP_RULES.map((r) => <option key={r.indicator_id} value={r.indicator_id}>{d.indicators.find((i) => i.meta.id === r.indicator_id)?.meta.title ?? r.indicator_id}</option>)}</select>
            </label>
          </>
        )}
        <div className="flex items-end gap-2 lg:col-span-6">
          <button className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">Terapkan</button>
          <Link href={hrefWith("/console/quality", { mode: f.mode }, {})} className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:border-ink/40">Atur ulang</Link>
        </div>
      </form>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Sesi survei (bukan sandbox)" value={d.sessions.total} hint={Object.entries(d.sessions.by_status).map(([k, v]) => `${SESSION_LABEL[k as SessionStatus] ?? k}: ${v}`).join(" · ") || "Belum ada sesi pada filter ini"} />
        <Stat label="Respons undangan" value={d.sessions.invitations.response_rate === null ? "–" : pct(d.sessions.invitations.response_rate)} hint={`${d.sessions.invitations.answered} dijawab dari ${d.sessions.invitations.delivered} undangan terkirim; ${d.sessions.invitations.expired} kedaluwarsa`} />
        <Stat label={routine ? "Jawaban belum terpenuhi" : "Konfirmasi terarah"} value={routine ? gapAnswers : d.directed?.answered ?? 0} hint={routine ? "Jumlah jawaban negatif; BUKAN rasio. Rasio ada di tabel indikator." : "Undangan terarah yang dijawab"} tone="warn" />
        <Stat label="Temuan terbukti" value={d.pipeline.proof.verified ?? 0} hint={concluded ? `dari ${concluded} temuan berstatus akhir; ${unfinished} belum selesai` : "Belum ada temuan berstatus akhir"} />
      </div>
      {d.sessions.companion > 0 && <p className="mt-2 text-xs text-muted">{d.sessions.companion} dari {d.sessions.total} sesi dijawab pendamping yang diotorisasi; tetap dihitung, dapat dibedakan.</p>}

      <nav aria-label="Lompat ke bagian" className="no-print mt-6 flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium text-brand">
        {[["#gap", routine ? "Gap per indikator" : "Konfirmasi terarah"], ["#alur", "Dari laporan ke perbaikan"], ["#waktu", "Waktu penyelesaian"], ["#keluhan", "Keluhan"], ["#sebelum", "Sebelum dan sesudah"], ["#kepuasan", "Kepuasan"], ["#definisi", "Definisi"]].map(([h, l]) => (
          <a key={h} href={h} className="underline-offset-4 hover:underline">{l}</a>
        ))}
      </nav>

      {routine ? (
        <section id="gap" className="mt-8 space-y-3 scroll-mt-24">
          <SectionTitle title="Gap laporan per indikator" hint={`Jawaban negatif ÷ jawaban sah (ya atau tidak) pada item yang berlaku. Jawaban sah kurang dari ${MIN_VALID_RESPONSES} ditandai belum cukup (${PARAM_LABEL})`} />
          <CompositionLegend />
          <Card className="overflow-x-auto">
            {d.indicators.length === 0 ? (
              <EmptyState title={noSessions ? "Belum ada sesi survei pada filter ini" : "Belum ada jawaban yang dapat dihitung"}>Gap hanya dihitung dari sesi survei yang benar-benar ada. Tidak ada angka bawaan.</EmptyState>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line"><tr>
                  <Th>Indikator</Th><Th title="Jawaban sah: ya atau tidak">n sah</Th><Th title="Jawaban negatif ÷ n sah, interval Wilson 95%">Gap laporan</Th><Th className="min-w-28">Komposisi</Th><Th title="Jawaban terbaca ÷ sesi yang berlaku dan sudah selesai">Cakupan</Th>
                  <Th title="Dijawab tidak tahu / tidak paham. Tidak masuk gap.">Tidak tahu</Th><Th>Tidak berlaku</Th><Th title="Berlaku tetapi tidak sampai ditanyakan (sesi sebagian)">Tidak ditanya</Th><Th title="Undangan kedaluwarsa tanpa jawaban">Tidak merespons</Th>
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {d.indicators.map((r) => (
                    <tr key={r.key} className={f.indicatorId === r.key ? "bg-brand-soft/40" : ""}>
                      <td className="p-3 align-top">
                        <Link href={hrefWith("/console/quality", f, { indicator: r.key })} className="font-medium underline-offset-4 hover:underline">{r.label}</Link>
                        <p className="mt-0.5 text-xs text-muted"><Pill className="bg-line text-ink-soft">{STAGE_SHORT[r.meta.stage as keyof typeof STAGE_SHORT] ?? r.meta.stage}</Pill> {r.meta.rule.meaning}</p>
                      </td>
                      <td className="p-3 tabular-nums">{r.n_valid}<span className="text-xs text-muted"> / {r.eligible}</span></td>
                      <td className="p-3"><GapCell row={r} /></td>
                      <td className="p-3"><CompositionBar row={r} /></td>
                      <td className="p-3 tabular-nums">{pct(r.coverage)}</td>
                      <td className="p-3 tabular-nums">{r.unknown}</td><td className="p-3 tabular-nums">{r.not_applicable}</td><td className="p-3 tabular-nums">{r.not_asked}</td><td className="p-3 tabular-nums">{r.nonresponse}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          {d.rules_missing.length > 0 && <p className="text-xs text-warn">Indikator berikut belum punya aturan polaritas gap dan tidak dihitung: {d.rules_missing.join(", ")}.</p>}

          {d.by_care_type.length > 0 && (
            <>
              <SectionTitle title="Menurut jenis layanan" hint="Rawat jalan dan rawat inap dibaca terpisah; pooling dapat menyembunyikan perbedaan." />
              <Card className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-line"><tr><Th>Indikator</Th><Th>Rawat jalan</Th><Th>n sah</Th><Th>Rawat inap</Th><Th>n sah</Th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {d.by_care_type.map((r) => (
                      <tr key={r.indicator_id}>
                        <td className="p-3">{r.label}</td>
                        <td className="p-3">{r.outpatient ? <GapCell row={r.outpatient} /> : <span className="text-muted">tidak ada data</span>}</td><td className="p-3 tabular-nums">{r.outpatient?.n_valid ?? 0}</td>
                        <td className="p-3">{r.inpatient ? <GapCell row={r.inpatient} /> : <span className="text-muted">tidak ada data</span>}</td><td className="p-3 tabular-nums">{r.inpatient?.n_valid ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </>
          )}

          {f.indicatorId && d.trend && (
            <>
              <SectionTitle title={`Tren bulanan: ${d.indicators.find((i) => i.key === f.indicatorId)?.label ?? f.indicatorId}`} hint="Satu baris per bulan sesi. Bulan dengan jawaban sah sedikit tidak boleh dibaca sebagai tren." />
              <Card className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-line"><tr><Th>Bulan</Th><Th>n sah</Th><Th>Gap laporan</Th><Th className="w-1/3">Gap</Th><Th>Tidak tahu</Th><Th>Tidak merespons</Th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {d.trend.map((t) => (
                      <tr key={t.key}>
                        <td className="p-3 font-medium">{monthLabel(t.key)}</td><td className="p-3 tabular-nums">{t.n_valid}</td><td className="p-3"><GapCell row={t} /></td>
                        <td className="p-3"><div className="h-2 w-full rounded-full bg-line" aria-hidden><div className={`h-2 rounded-full ${t.sufficient ? "bg-brand" : "bg-muted/50"}`} style={{ width: `${(t.gap ?? 0) * 100}%` }} /></div></td>
                        <td className="p-3 tabular-nums">{t.unknown}</td><td className="p-3 tabular-nums">{t.nonresponse}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </>
          )}

          {f.indicatorId && d.facilities && (
            <>
              <SectionTitle title="Perbandingan antarfaskes" hint="Hanya untuk indikator, versi, dan periode yang sama. Diurutkan menurut nama, tidak diperingkat. Tanda peer menunjukkan kelompok pembanding; faskes beda peer kurang sepadan." />
              <Card className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-line"><tr><Th>Faskes</Th><Th>Kelompok pembanding</Th><Th>n sah</Th><Th>Gap laporan</Th><Th>Cakupan</Th><Th>Tidak tahu</Th><Th>Tidak merespons</Th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {d.facilities.map((x) => (
                      <tr key={x.key}>
                        <td className="p-3 font-medium">{x.label}</td><td className="p-3 text-xs text-ink-soft">{x.peer_group ?? "–"}</td><td className="p-3 tabular-nums">{x.n_valid}</td>
                        <td className="p-3"><GapCell row={x} /></td><td className="p-3 tabular-nums">{pct(x.coverage)}</td><td className="p-3 tabular-nums">{x.unknown}</td><td className="p-3 tabular-nums">{x.nonresponse}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              <p className="text-xs text-muted">Perbedaan antar faskes bisa berasal dari campuran kasus, ukuran sampel, dan tingkat respons, bukan hanya mutu pelayanan. Interval menunjukkan ketidakpastian akibat jumlah jawaban, bukan akibat perbedaan sampling.</p>
            </>
          )}
        </section>
      ) : (
        <section id="gap" className="mt-8 space-y-3 scroll-mt-24">
          <SectionTitle title="Konfirmasi layanan terarah" hint="Peserta ditanya apakah satu tindakan tertentu dijalani. 'Tidak ingat' bukan 'tidak'; tidak merespons dilaporkan terpisah." />
          {d.directed && d.directed.invited > 0 ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <MiniStat label="Undangan terarah" value={d.directed.invited} hint={`${d.directed.in_progress} masih berjalan`} />
                <MiniStat label="Menyatakan menjalani" value={d.directed.yes} hint="Ya" />
                <MiniStat label="Menyatakan tidak menjalani" value={d.directed.no} hint="Menjadi sinyal untuk dibuktikan, bukan putusan" />
                <MiniStat label="Tidak ingat / tidak yakin" value={d.directed.unknown} hint="Netral; tidak dihitung sebagai 'tidak'" />
                <MiniStat label="Tidak merespons" value={d.directed.nonresponse} hint="Dilaporkan terpisah" />
              </div>
              <Card className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-line"><tr><Th>Faskes</Th><Th>Dijawab</Th><Th>Ya</Th><Th>Tidak</Th><Th>Tidak ingat</Th><Th>Tidak merespons</Th></tr></thead>
                  <tbody className="divide-y divide-line">{d.directed.by_facility.map((x) => (<tr key={x.facility_id}><td className="p-3 font-medium">{x.facility}</td><td className="p-3 tabular-nums">{x.answered}</td><td className="p-3 tabular-nums">{x.yes}</td><td className="p-3 tabular-nums">{x.no}</td><td className="p-3 tabular-nums">{x.unknown}</td><td className="p-3 tabular-nums">{x.nonresponse}</td></tr>))}</tbody>
                </table>
              </Card>
              <Card className="p-4 text-sm">
                <p className="font-medium">Hasil pembuktian temuan yang berasal dari konfirmasi terarah</p>
                <p className="mt-1 flex flex-wrap gap-2">
                  {Object.keys(d.directed.findings).length === 0 ? <span className="text-ink-soft">Belum ada temuan dari konfirmasi terarah pada filter ini.</span> : Object.entries(d.directed.findings).map(([k, v]) => (
                    <Pill key={k} className={TONE_CLASS[PROOF_LABEL[k as ProofStatus]?.tone ?? "muted"]}>{PROOF_LABEL[k as ProofStatus]?.label ?? k}: {v}</Pill>
                  ))}
                </p>
              </Card>
            </>
          ) : (
            <Card><EmptyState title="Belum ada konfirmasi terarah pada filter ini">Konfirmasi terarah dibuat dari sinyal pada klaim. Bagian ini terisi setelah sesi terarah berjalan.</EmptyState></Card>
          )}
        </section>
      )}

      <section id="alur" className="mt-10 space-y-3 scroll-mt-24">
        <SectionTitle title="Dari laporan sampai perbaikan" hint="Enam hal yang berbeda dan tidak dicampur: laporan peserta, sinyal mesin, pembuktian petugas, analisis penyebab, keputusan klaim, tindakan perbaikan. Tiap kotak punya penyebutnya sendiri." />
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <Card className="p-4"><p className="text-sm font-semibold">1. Laporan peserta</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{d.pipeline.participant_reports.gap_answers}</p><p className="text-xs text-muted">jawaban belum terpenuhi pada survei rutin</p>
            <p className="mt-2 text-sm text-ink-soft">{d.pipeline.participant_reports.findings_from_reports} menjadi temuan · {d.pipeline.participant_reports.service_requests} permintaan layanan tercatat</p></Card>
          <Card className="p-4"><p className="text-sm font-semibold">2. Sinyal mesin (klaim)</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{d.pipeline.machine_signals.total}</p><p className="text-xs text-muted">sinyal dari pencocokan data klaim, bukan dari peserta</p>
            <p className="mt-2 text-sm text-ink-soft">{Object.entries(d.pipeline.machine_signals.by_type).map(([k, v]) => `${k}: ${v}`).join(" · ") || "–"}. Sinyal bukan bukti.</p></Card>
          <Card className="p-4"><p className="text-sm font-semibold">3. Pembuktian oleh petugas</p>
            <div className="mt-2 flex flex-wrap gap-1.5">{(["signal", "under_review", "awaiting_clarification", "verified", "not_verified", "inconclusive"] as ProofStatus[]).map((k) => (<Pill key={k} className={TONE_CLASS[PROOF_LABEL[k].tone]}>{PROOF_LABEL[k].label}: {d.pipeline.proof[k] ?? 0}</Pill>))}</div>
            <p className="mt-2 text-xs text-muted">Semua temuan (laporan dan sinyal mesin) pada filter ini.</p></Card>
          <Card className="p-4"><p className="text-sm font-semibold">4. Analisis penyebab</p>
            <p className="mt-2 text-sm text-ink-soft">Hanya untuk temuan terbukti ({d.pipeline.proof.verified ?? 0}). Boleh lebih dari satu kategori.</p>
            <div className="mt-2 flex flex-wrap gap-1.5"><Pill className={TONE_CLASS.muted}>{CAUSE_LABEL.administrative.label}: {d.pipeline.causes.administrative}</Pill><Pill className={TONE_CLASS.muted}>{CAUSE_LABEL.service_process.label}: {d.pipeline.causes.service_process}</Pill><Pill className={TONE_CLASS.muted}>Belum dianalisis: {d.pipeline.causes.not_analysed}</Pill></div>
            <p className="mt-2 text-xs text-muted">Eskalasi tinjauan lanjutan disetujui dua pihak (label dugaan, bukan putusan): {d.pipeline.causes.escalations_approved}.</p></Card>
          <Card className="p-4"><p className="text-sm font-semibold">5. Keputusan klaim</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{d.pipeline.claim_decisions.total}</p><p className="text-xs text-muted">catatan peninjauan klaim oleh petugas</p>
            <p className="mt-2 text-sm text-ink-soft">{d.pipeline.claim_decisions.simulated} dicatat sebagai simulasi. Aplikasi tidak mengubah klaim, pembayaran, atau sanksi.</p></Card>
          <Card className="p-4"><p className="text-sm font-semibold">6. Tindakan perbaikan</p>
            <div className="mt-2 flex flex-wrap gap-1.5">{(Object.keys(ACTION_LABEL) as ActionStatus[]).map((k) => (<Pill key={k} className={TONE_CLASS.muted}>{ACTION_LABEL[k]}: {d.pipeline.actions[k] ?? 0}</Pill>))}</div>
            <p className="mt-2 text-xs text-muted">Status tindakan terpisah dari status pembuktian.</p></Card>
        </div>

        <SectionTitle title="Laporan dan temuan terverifikasi per indikator" hint="Penyebut proporsi terbukti = temuan berstatus akhir (terbukti + tidak terbukti + tidak dapat dibuktikan). Temuan yang belum selesai tidak ikut dalam penyebut." />
        <Card className="overflow-x-auto">
          {d.reports_vs_verified.length === 0 ? <EmptyState title="Belum ada laporan atau temuan dari survei pada filter ini" /> : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line"><tr><Th>Indikator</Th><Th title="Jawaban belum terpenuhi">Laporan</Th><Th>Menjadi temuan</Th><Th>Berjalan</Th><Th>Terbukti</Th><Th>Tidak terbukti</Th><Th>Tidak dapat dibuktikan</Th><Th title="Terbukti ÷ berstatus akhir">Proporsi terbukti</Th></tr></thead>
              <tbody className="divide-y divide-line">
                {d.reports_vs_verified.map((x) => (
                  <tr key={x.indicator_id}>
                    <td className="p-3">{x.label}</td><td className="p-3 tabular-nums">{x.reports}</td><td className="p-3 tabular-nums">{x.findings}</td>
                    <td className="p-3 tabular-nums">{x.findings - x.concluded}</td><td className="p-3 tabular-nums">{x.verified}</td><td className="p-3 tabular-nums">{x.by_proof.not_verified ?? 0}</td><td className="p-3 tabular-nums">{x.by_proof.inconclusive ?? 0}</td>
                    <td className="p-3 tabular-nums">{x.verified_share === null ? "–" : <>{pct(x.verified_share)} <span className="text-xs text-muted">({pctRange(x.ci)}; n {x.concluded})</span></>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <p className="text-xs text-muted">Satu laporan yang valid tetap ditindaklanjuti berapa pun jumlah respondennya. Jumlah minimum hanya menentukan apakah rasio agregat boleh dibaca.</p>
      </section>

      <section id="waktu" className="mt-10 space-y-3 scroll-mt-24">
        <SectionTitle title="Waktu penyelesaian" hint="Median dan persentil ke-90 dalam hari, hanya untuk objek yang sudah mencapai kejadian akhir. Yang belum selesai ditampilkan sebagai jumlah berjalan, tidak diperkirakan." />
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line"><tr><Th>Tahap</Th><Th>Selesai (n)</Th><Th>Berjalan</Th><Th>Median (hari)</Th><Th>P90 (hari)</Th></tr></thead>
            <tbody className="divide-y divide-line">
              {d.resolution.stats.map((s) => (<tr key={s.label}><td className="p-3">{s.label}</td><td className="p-3 tabular-nums">{s.n}</td><td className="p-3 tabular-nums">{s.open}</td><td className="p-3 tabular-nums">{num(s.median_days)}</td><td className="p-3 tabular-nums">{num(s.p90_days)}</td></tr>))}
            </tbody>
          </table>
        </Card>
        <div className="grid gap-3 sm:grid-cols-2">
          <MiniStat label="Klarifikasi melewati tenggat" value={d.resolution.clarification.lapsed_share === null ? "–" : pct(d.resolution.clarification.lapsed_share)} hint={`${d.resolution.clarification.lapsed} lewat tenggat dari ${d.resolution.clarification.answered + d.resolution.clarification.lapsed} yang selesai; ${d.resolution.clarification.sent} masih berjalan. Lewat tenggat memenuhi hak jawab, tidak membuktikan apa pun.`} />
          <MiniStat label="Peserta mengonfirmasi kendala selesai" value={d.resolution.confirmation.resolved_share === null ? "–" : pct(d.resolution.confirmation.resolved_share)} hint={`${d.resolution.confirmation.resolved} selesai · ${d.resolution.confirmation.still_issue} masih ada kendala · ${d.resolution.confirmation.pending} menunggu jawaban`} />
        </div>
      </section>

      <section id="keluhan" className="mt-10 space-y-3 scroll-mt-24">
        <SectionTitle title="Keluhan dan permintaan layanan" hint="Dicatat terpisah dari klaim sebab final. Bantuan yang dibutuhkan tidak menunggu investigasi selesai." />
        <div className="grid gap-3 md:grid-cols-3">
          <Card className="overflow-x-auto md:col-span-2">
            {d.complaints.service_requests.length === 0 ? <EmptyState title="Belum ada permintaan layanan pada filter ini" /> : (
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line"><tr><Th>Kategori</Th><Th>Total</Th><Th>Masih berjalan</Th><Th>Selesai atau ditutup</Th></tr></thead>
                <tbody className="divide-y divide-line">{d.complaints.service_requests.map((c) => (<tr key={c.category}><td className="p-3">{SR_LABEL[c.category] ?? c.category}</td><td className="p-3 tabular-nums">{c.total}</td><td className="p-3 tabular-nums">{c.open}</td><td className="p-3 tabular-nums">{c.resolved}</td></tr>))}</tbody>
              </table>
            )}
          </Card>
          <Card className="p-4 text-sm"><p className="font-semibold">Permintaan bantuan peserta</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{d.complaints.help.total}</p>
            <p className="mt-1 text-ink-soft">{d.complaints.help.open} terbuka · {d.complaints.help.handled} ditangani{d.complaints.help.median_hours !== null && <> · median {num(d.complaints.help.median_hours, 0)} jam sampai ditangani</>}</p></Card>
        </div>
      </section>

      <section id="sebelum" className="mt-10 space-y-3 scroll-mt-24">
        <SectionTitle title="Sebelum dan sesudah tindakan perbaikan" hint="Gap laporan pada indikator dan faskes yang sama: 90 hari sebelum tindakan dibuat dibanding periode setelah tindakan selesai dikerjakan, dengan faskes sepeer sebagai konteks." />
        <SimNotice>Perubahan angka tidak otomatis membuktikan bahwa tindakan itu sebabnya. Tidak ada kelompok kontrol acak; tren umum, perubahan campuran kasus, dan tingkat respons juga dapat menggeser angka. Gunakan sebagai petunjuk untuk ditinjau.</SimNotice>
        {d.before_after.length === 0 ? <Card><EmptyState title="Belum ada tindakan perbaikan dengan indikator yang dapat dibandingkan" /></Card> : (
          <div className="grid gap-3 lg:grid-cols-2">
            {d.before_after.map((b) => (
              <Card key={b.action_id} className="min-w-0 p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{b.facility}</p><Pill className={`${VERDICT[b.verdict].cls} whitespace-normal!`}>{VERDICT[b.verdict].label}</Pill></div>
                <p className="mt-1 text-ink-soft">{b.indicator} · <span className="font-mono text-xs">{b.action_id}</span> · {ACTION_LABEL[b.status as ActionStatus] ?? b.status}</p>
                <p className="mt-1 text-xs text-muted">{b.description}</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-paper p-3"><p className="text-xs font-medium text-ink-soft">Sebelum ({b.window_before.from} s.d. {b.window_before.to})</p><p className="mt-1">{b.before ? <GapCell row={b.before} /> : <span className="text-muted">tidak ada sesi</span>}</p><p className="text-xs text-muted">n sah {b.before?.n_valid ?? 0}</p></div>
                  <div className="rounded-lg bg-paper p-3"><p className="text-xs font-medium text-ink-soft">Sesudah {b.window_after ? `(${b.window_after.from} s.d. ${b.window_after.to})` : ""}</p><p className="mt-1">{b.after ? <GapCell row={b.after} /> : <span className="text-muted">{b.window_after ? "tidak ada sesi" : "belum ada"}</span>}</p><p className="text-xs text-muted">n sah {b.after?.n_valid ?? 0}</p></div>
                </div>
                <p className="mt-2 text-xs text-muted">Faskes sepeer (konteks): sebelum {b.peers_before?.gap != null ? pct(b.peers_before.gap) : "–"} (n {b.peers_before?.n_valid ?? 0}), sesudah {b.peers_after?.gap != null ? pct(b.peers_after.gap) : "–"} (n {b.peers_after?.n_valid ?? 0}).{b.delta_points !== null && <> Selisih faskes: {num(b.delta_points)} poin persentase.</>}</p>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section id="kepuasan" className="mt-10 space-y-3 scroll-mt-24">
        <SectionTitle title="Kepuasan (instrumen internal opsional)" hint="Terpisah dari keberadaan layanan dan dari indikasi klaim. Tidak masuk gap dan tidak pernah masuk skor indikasi." />
        {d.satisfaction.n_valid === 0 ? <Card><EmptyState title="Belum ada jawaban skor kepuasan">Instrumen ini opsional. Tanpa jawaban, bagian ini sengaja kosong.</EmptyState></Card> : (
          <div className="grid gap-3 sm:grid-cols-4">
            <MiniStat label="Rata-rata skor (0-10)" value={num(d.satisfaction.mean)} hint={`${d.satisfaction.n_valid} jawaban sah`} />
            <MiniStat label="Skor 0-4" value={d.satisfaction.low} /><MiniStat label="Skor 5-7" value={d.satisfaction.mid} /><MiniStat label="Skor 8-10" value={d.satisfaction.high} />
          </div>
        )}
        <p className="text-xs text-muted">Bukan Indikator Nasional Mutu resmi: instrumen, formula, dan sampling resmi belum diikuti. {d.satisfaction.excluded > 0 && `${d.satisfaction.excluded} jawaban di luar 0-10 dikeluarkan.`}</p>
      </section>

      <section id="definisi" className="mt-10 space-y-3 scroll-mt-24">
        <SectionTitle title="Definisi metrik berversi" hint="Sumber rumus untuk angka di halaman ini. Semua berstatus draf sampai divalidasi pemilik proses." />
        <Card className="divide-y divide-line">
          {metricDefs.map((m) => (
            <details key={m.id} className="group p-4 text-sm">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 font-semibold"><span>{m.metric.replaceAll("_", " ")}</span><span className="font-mono text-xs font-normal text-muted">{m.version}</span><Pill className={TONE_CLASS.warn}>{m.status === "draft" ? "Draf" : m.status}</Pill></summary>
              <p className="mt-2 text-ink-soft">{m.definition}</p>
              <p className="mt-2"><span className="font-medium">Pembilang:</span> {m.numerator}</p>
              <p className="mt-1"><span className="font-medium">Penyebut:</span> {m.denominator}</p>
              <p className="mt-1 text-xs text-muted">{m.note}</p>
            </details>
          ))}
        </Card>
        <details className="rounded-xl border border-line bg-card p-4 text-sm">
          <summary className="cursor-pointer font-semibold">Polaritas jawaban per indikator</summary>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[34rem] text-left text-sm"><thead className="border-b border-line"><tr><Th>Indikator</Th><Th>Butir yang diukur</Th><Th>Dihitung belum terpenuhi</Th><Th>Terpenuhi</Th></tr></thead>
            <tbody className="divide-y divide-line">{GAP_RULES.map((r) => (<tr key={r.indicator_id}><td className="p-2 font-mono text-xs">{r.indicator_id}</td><td className="p-2">{r.slot}{r.requires && <span className="text-xs text-muted"> (hanya bila {r.requires.slot} = {r.requires.values.join("/")})</span>}</td><td className="p-2">{r.negative.join(", ")}</td><td className="p-2">{r.positive.join(", ")}</td></tr>))}</tbody></table></div>
        </details>
      </section>
    </>
  );
}
