import { Card, EmptyState, Forbidden, PageHeader, SectionTitle, SimNotice, Stat } from "@/components/ui";
import { can } from "@/lib/auth/principal";
import { PROOF_LABEL } from "@/lib/labels";
import { facilityQualityReport } from "@/lib/casework/queries";
import { getDb } from "@/lib/db";
import { getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";

const pct = (x: number) => `${Math.round(x * 100)}%`;

export default async function FaskesQuality() {
  const me = await getPrincipal("faskes");
  if (!can(me, "facility.report")) return <Forbidden need="facility.report" />;
  const r = facilityQualityReport(getDb(), me);
  return (
    <>
      <PageHeader title="Laporan mutu faskes Anda" eyebrow="Portal faskes" purpose="Gambaran proses klarifikasi, tindakan perbaikan, dan jawaban peserta untuk faskes Anda sendiri. Tidak ada perbandingan dengan faskes lain di halaman ini." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Klarifikasi diterima" value={r.clar.total} hint={`${r.clar.answered} dijawab, ${r.clar.lapsed} lewat tenggat, ${r.clar.waiting} menunggu`} />
        <Stat label="Dijawab tepat waktu" value={r.clar.answered ? `${r.clar.answeredOnTime}/${r.clar.answered}` : "-"} hint="Dari klarifikasi yang sudah dijawab" />
        <Stat label="Tindakan perbaikan" value={r.act.total} hint={`${r.act.closed} ditutup, ${r.act.inProgress} berjalan`} />
        <Stat label="Temuan yang melibatkan Anda" value={r.outcomes.reduce((a, b) => a + b.n, 0)} hint={r.outcomes.map((o) => `${o.n} ${PROOF_LABEL[o.s as keyof typeof PROOF_LABEL]?.label.toLowerCase() ?? o.s}`).join(", ") || undefined} />
      </div>
      <section className="mt-8 space-y-3">
        <SectionTitle title="Jawaban peserta menurut butir layanan" hint={`Hanya ditampilkan bila sedikitnya ${r.minN} responden menjawab butir itu, agar tidak mengarah ke individu. Jawaban "tidak ingat" dan "tidak paham" bernilai nol dan tidak ikut persentase.`} />
        {r.indicators.length === 0 ? <Card><EmptyState title="Belum ada jawaban survei untuk faskes Anda" /></Card> : (
          <Card className="divide-y divide-line">
            {r.indicators.map((i) => (
              <div key={i.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{i.title}</span><span className="text-xs text-muted">{i.respondents} responden</span></div>
                {i.shown ? (
                  <ul className="mt-2 space-y-1">{i.distribution.map((d) => <li key={d.value} className="flex items-center gap-2"><span className="w-40 shrink-0 text-ink-soft">{d.label}</span><span className="h-2 flex-1 overflow-hidden rounded bg-line"><span className="block h-full bg-brand" style={{ width: pct(d.share) }} /></span><span className="w-20 text-right tabular-nums">{pct(d.share)} ({d.count})</span></li>)}{i.zero ? <li className="text-xs text-muted">{i.zero} jawaban bernilai nol tidak dihitung.</li> : null}</ul>
                ) : <p className="mt-1 text-xs text-muted">Belum ditampilkan: responden kurang dari {r.minN}.</p>}
              </div>
            ))}
          </Card>
        )}
        <SimNotice>Angka di atas bukan penilaian atas faskes. Kepuasan tidak dipakai sebagai dasar indikasi, dan skor sinyal tidak ditampilkan di portal ini.</SimNotice>
      </section>
    </>
  );
}
