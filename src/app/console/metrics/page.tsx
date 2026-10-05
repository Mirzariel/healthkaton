import type { Metadata } from "next";
import { Meter, Ring } from "@/components/audit/Gauges";
import { InfoDot, PageGuide, Term } from "@/components/explain";
import { CountUp } from "@/components/motion";
import { Card, MODUS_SHORT, PageHeader, Stat } from "@/components/ui";
import { getLookalikeStats } from "@/lib/auditView";
import { getDb } from "@/lib/db";
import { getMetrics, getStats } from "@/lib/queries";
import type { Modus } from "@/lib/types";

export const metadata: Metadata = { title: "Metrik · SEHATI" };

const pct = (n: number) => `${Math.round(n * 100)}%`;
const ratio = (a: number, b: number) => (b ? a / b : 0);

const MODUS_KEY: Record<Modus, "phantom" | "repeat_billing" | "fragmentation"> = {
  phantom: "phantom",
  repeat_billing: "repeat_billing",
  fragmentation: "fragmentation",
};


export default function Metrics() {
  const db = getDb();
  const m = getMetrics(db);
  const s = getStats(db);
  const look = getLookalikeStats(db);
  const sticky = "sticky left-0 z-[1] bg-card";

  const sum = (f: (r: (typeof m.rows)[number]) => number) => m.rows.reduce((a, r) => a + f(r), 0);
  const positives = sum((r) => r.positives);
  const caught = sum((r) => r.truePositive);
  const flagged = sum((r) => r.flagged);
  const flaggedMed = sum((r) => r.flaggedMedium);
  const tpMed = sum((r) => r.truePositiveMedium);
  const lookTotal = look.reduce((a, r) => a + r.total, 0);
  const lookStrong = look.reduce((a, r) => a + r.strong, 0);
  const recall = ratio(caught, positives);
  const precision = ratio(tpMed, flaggedMed);
  const protectedRate = lookTotal ? 1 - lookStrong / lookTotal : 1;

  return (
    <>
      <PageHeader title="Metrik" purpose="Seberapa jitu SEHATI menandai klaim bermasalah, dan seberapa jarang ia salah menuduh. Diuji pada data contoh." />

      <div className="mb-5 flex items-start gap-3 rounded-lg border border-line border-l-4 border-l-accent bg-card p-4 text-sm">
        <p className="max-w-3xl">
          <strong>Baca dengan hati-hati.</strong> Data sintetis dibuat bersama kunci jawabannya, jadi angka ini membuktikan prototipe berfungsi, bukan kinerja di data nyata. Perlu uji pilot dengan data resmi.
        </p>
      </div>

      <PageGuide
        id="metrik"
        intro="Bayangkan SEHATI sebagai satpam yang memeriksa ribuan klaim. Tiga angka di bawah menjawab tiga pertanyaan sederhana tentang kerjanya."
        steps={[
          { title: "Tertangkap", body: <>Dari semua klaim yang <em>memang</em> bermasalah, berapa yang berhasil ditandai? Istilah teknisnya <Term k="recall">recall</Term>.</> },
          { title: "Tepat", body: <>Dari semua klaim yang ditandai, berapa yang <em>memang</em> bermasalah? Makin tinggi, makin sedikit alarm palsu. Istilah teknisnya <Term k="presisi">presisi</Term>.</> },
          { title: "Sah terlindungi", body: <>Klaim wajar yang kebetulan mirip bermasalah: berapa yang <em>tidak</em> dituduh keras? Ini bukti sistem tidak asal curiga (<Term k="sahTerlindungi">sah terlindungi</Term>).</> },
        ]}
        legend="Persentase dihitung dari data contoh yang kunci jawabannya diketahui. Cincin penuh = 100%."
      />

      <section aria-label="Tiga angka utama" className="mb-6">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              tone: "brand" as const,
              value: recall,
              term: <Term k="recall">Tertangkap</Term>,
              big: `${caught} dari ${positives}`,
              plain: `Dari ${positives} klaim yang memang bermasalah, ${caught} berhasil ditandai SEHATI.`,
            },
            {
              tone: "ink" as const,
              value: precision,
              term: <Term k="presisi">Tepat</Term>,
              big: `${tpMed} dari ${flaggedMed}`,
              plain: tpMed === flaggedMed ? `Dari ${flaggedMed} peringatan sedang atau tinggi, semuanya memang bermasalah. Tidak ada alarm palsu di data contoh ini.` : `Dari ${flaggedMed} peringatan sedang atau tinggi, ${tpMed} memang bermasalah. Sisanya alarm palsu.`,
            },
            {
              tone: "info" as const,
              value: protectedRate,
              term: <Term k="sahTerlindungi">Sah terlindungi</Term>,
              big: `${lookTotal - lookStrong} dari ${lookTotal}`,
              plain: `Dari ${lookTotal} klaim wajar yang sengaja dibuat mirip bermasalah, ${lookTotal - lookStrong} tidak dituduh keras.`,
            },
          ].map((c, i) => (
            <div key={i} className="rounded-xl border border-line bg-card p-5">
              <div className="flex items-center gap-4">
                <Ring value={c.value} tone={c.tone} size={104} label={`${Math.round(c.value * 100)} persen`}>
                  <span className="text-2xl font-semibold tabular-nums">
                    {Math.round(c.value * 100)}
                    <span className="text-base text-muted">%</span>
                  </span>
                </Ring>
                <div className="min-w-0">
                  <p className="eyebrow text-muted">Ukuran {i + 1}</p>
                  <h2 className="text-xl font-semibold leading-tight">{c.term}</h2>
                  <p className="mt-0.5 text-sm font-medium text-ink-soft">{c.big}</p>
                </div>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">{c.plain}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Angka mendekati sempurna di sini wajar: data contoh dibuat bersama kunci jawabannya. Jangan dibaca sebagai janji kinerja di data nyata.
        </p>
      </section>

      <section aria-label="Ringkasan" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Klaim diperiksa" value={<CountUp value={m.totalClaims} />} hint="seluruh klaim di data contoh" />
        <Stat label="Klaim bersih ditandai" value={<><CountUp value={m.cleanFlagged} />/{m.cleanClaims}</>} hint="peringatan palsu pada klaim tanpa masalah" tone={m.cleanFlagged ? "warn" : "ok"} />
        <Stat label="Respons pertama" value={s.avgFirstReviewH ? <><CountUp value={Math.round(s.avgFirstReviewH)} /> jam</> : "-"} hint="rata-rata sejak kasus dibuka" />
        <Stat label="Sampai keputusan" value={s.avgDecisionH ? <><CountUp value={s.avgDecisionH / 24} kind="dec1" /> hari</> : "-"} hint={`rata-rata, ${s.decided} kasus selesai`} tone="ok" />
      </section>

      <h2 className="mb-3 text-xl font-semibold tracking-tight">
        Per jenis <em>kecurangan</em>
      </h2>
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        {m.rows.map((r) => {
          const l = look.find((x) => x.modus === r.modus)!;
          return (
            <Card key={r.modus} className="p-4">
              <h3 className="text-lg font-semibold">
                <Term k={MODUS_KEY[r.modus]}>{MODUS_SHORT[r.modus]}</Term>
              </h3>
              <p className="text-xs text-muted">{r.positives} kasus sebenarnya di data contoh</p>

              <dl className="mt-4 space-y-4 text-sm">
                <div>
                  <dt className="flex items-baseline justify-between gap-2">
                    <span className="inline-flex items-center gap-1 font-semibold">Tertangkap <InfoDot k="recall" /></span>
                    <span className="text-lg font-semibold tabular-nums">{pct(r.recall)}</span>
                  </dt>
                  <dd className="mt-1.5">
                    <Meter value={r.recall} tone="brand" label={`Tertangkap ${pct(r.recall)}`} />
                    <span className="mt-1 block text-xs text-ink-soft">{r.truePositive} dari {r.positives} kasus bermasalah ditandai.</span>
                  </dd>
                </div>
                <div>
                  <dt className="flex items-baseline justify-between gap-2">
                    <span className="inline-flex items-center gap-1 font-semibold">Tepat (semua peringatan) <InfoDot k="presisi" /></span>
                    <span className="text-lg font-semibold tabular-nums">{pct(r.precisionAll)}</span>
                  </dt>
                  <dd className="mt-1.5">
                    <Meter value={r.precisionAll} tone="info" label={`Tepat semua ${pct(r.precisionAll)}`} />
                    <span className="mt-1 block text-xs text-ink-soft">Termasuk peringatan lemah yang memang dibuat berhati-hati.</span>
                  </dd>
                </div>
                <div>
                  <dt className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold">Tepat (sedang dan tinggi)</span>
                    <span className="text-lg font-semibold tabular-nums">{pct(r.precisionMedium)}</span>
                  </dt>
                  <dd className="mt-1.5">
                    <Meter value={r.precisionMedium} tone="ink" label={`Tepat sedang ke atas ${pct(r.precisionMedium)}`} />
                    <span className="mt-1 block text-xs text-ink-soft">Hanya peringatan yang memicu pemeriksaan segera.</span>
                  </dd>
                </div>
              </dl>

              <div className="mt-4 rounded-lg bg-paper p-3 text-xs leading-relaxed text-ink-soft">
                <p className="inline-flex items-center gap-1 font-semibold text-ink">Kasus sah yang mirip <InfoDot k="sahTerlindungi" /></p>
                <p className="mt-0.5">
                  {l.total - l.strong} dari {l.total} tidak dituduh keras
                  {l.any > l.strong ? `; ${l.any - l.strong} hanya ditandai lemah dan bisa diloloskan setelah diperiksa.` : "."}
                </p>
              </div>
            </Card>
          );
        })}
      </div>

      <details className="group mb-4 max-w-4xl">
        <summary className="list-none cursor-pointer select-none text-sm font-semibold text-brand underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">
          <span className="inline-block transition-transform duration-150 group-open:rotate-90" aria-hidden>›</span> Lihat tabel angka lengkap
        </summary>
        <Card className="mt-3 overflow-clip">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">Ketepatan peringatan per jenis kecurangan</caption>
              <thead>
                <tr className="border-b border-line bg-paper/60 text-left text-xs font-semibold text-muted">
                  <th scope="col" className={`${sticky} px-3 py-2.5`}>Jenis</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Kasus sebenarnya</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Tertangkap</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Tepat (semua)</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Tepat (sedang+)</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Sah tertandai</th>
                </tr>
              </thead>
              <tbody>
                {m.rows.map((r) => (
                  <tr key={r.modus} className="border-b border-line/70 transition-colors last:border-0 hover:bg-brand-soft/40">
                    <th scope="row" className={`${sticky} px-3 py-3 text-left font-semibold`}>{MODUS_SHORT[r.modus]}</th>
                    <td className="px-3 py-3 text-right tabular-nums">{r.positives}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{r.truePositive}/{r.positives} ({pct(r.recall)})</td>
                    <td className="px-3 py-3 text-right tabular-nums">{pct(r.precisionAll)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{pct(r.precisionMedium)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.lookalikeFlagged}/{r.lookalikeTotal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </details>

      <ul className="max-w-3xl list-disc space-y-1.5 pl-5 text-sm text-ink-soft">
        <li><strong>Sah tertandai</strong>: kasus sah yang sengaja dibuat mirip modus bermasalah. Hanya berisiko rendah dan bisa diloloskan setelah diperiksa ({s.lookalikeCleared} sudah).</li>
        <li><strong>Tepat (sedang+)</strong>: hanya peringatan risiko sedang dan tinggi, yang memicu pemeriksaan segera.</li>
        <li>Waktu respons berasal dari riwayat contoh. Ukur ulang saat pilot.</li>
      </ul>
    </>
  );
}
