import { IconLock } from "@/components/icons";
import { Card, EmptyState, Forbidden, PageHeader, Section, SectionTitle, Stat } from "@/components/ui";
import { can } from "@/lib/auth/principal";
import { PROOF_LABEL } from "@/lib/labels";
import { facilityQualityReport } from "@/lib/casework/queries";
import { getDb } from "@/lib/db";
import { getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";

const pct = (x: number) => `${Math.round(x * 100)}%`;
const FIRST = 5;

type Report = ReturnType<typeof facilityQualityReport>;
type Ind = Report["indicators"][number];
// Butir yang belum punya judul terbaca masih berupa kode; tampilkan sebagai kode agar tidak tampak seperti kalimat.
const isCode = (t: string) => /^[A-Z0-9_]+$/.test(t);
const Title = ({ t, muted = false }: { t: string; muted?: boolean }) => (
  <h3 className={isCode(t) ? `font-mono text-[12.5px] ${muted ? "font-medium text-ink-soft" : "font-semibold text-ink"}` : `text-[14px] ${muted ? "font-medium text-ink-soft" : "font-semibold text-ink"}`}>{t}</h3>
);

function Indicator({ i }: { i: Ind }) {
  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <Title t={i.title} />
        <span className="text-[12.5px] tabular-nums text-muted">{i.respondents} responden</span>
      </div>
      <ul className="mt-3 space-y-2.5">
        {i.distribution.map((d) => (
          <li key={d.value} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[11rem_1fr_6rem]">
            <span className="text-[13.5px] text-ink-soft">{d.label}</span>
            <span className="text-right text-[13px] tabular-nums text-ink sm:order-last">{pct(d.share)} <span className="text-muted">({d.count})</span></span>
            <span className="col-span-2 h-2 overflow-hidden rounded-full bg-line sm:col-span-1" role="img" aria-label={`${pct(d.share)} dari jawaban`}>
              <span className="block h-full rounded-full bg-brand" style={{ width: pct(d.share) }} />
            </span>
          </li>
        ))}
      </ul>
      {i.zero ? <p className="mt-2.5 text-[12.5px] text-muted">{i.zero} jawaban bernilai nol tidak dihitung.</p> : null}
    </div>
  );
}

export default async function FaskesQuality() {
  const me = await getPrincipal("faskes");
  if (!can(me, "facility.report")) return <Forbidden need="facility.report" />;
  const r = facilityQualityReport(getDb(), me);
  const shown = r.indicators.filter((i) => i.shown);
  const hidden = r.indicators.filter((i) => !i.shown);
  return (
    <>
      <PageHeader title="Laporan mutu faskes Anda" purpose="Klarifikasi, tindakan, dan jawaban peserta untuk faskes Anda saja." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Klarifikasi diterima" value={r.clar.total} hint={`${r.clar.answered} dijawab, ${r.clar.lapsed} lewat tenggat, ${r.clar.waiting} menunggu`} />
        <Stat label="Dijawab tepat waktu" value={r.clar.answered ? `${r.clar.answeredOnTime}/${r.clar.answered}` : "-"} />
        <Stat label="Tindakan perbaikan" value={r.act.total} hint={`${r.act.closed} ditutup, ${r.act.inProgress} berjalan`} />
        <Stat label="Temuan faskes Anda" value={r.outcomes.reduce((a, b) => a + b.n, 0)} hint={r.outcomes.map((o) => `${o.n} ${PROOF_LABEL[o.s as keyof typeof PROOF_LABEL]?.label.toLowerCase() ?? o.s}`).join(", ") || undefined} />
      </div>

      <Section className="mt-9">
        <SectionTitle title="Jawaban peserta per butir layanan" hint={`Tampil bila minimal ${r.minN} responden.`} />
        {r.indicators.length === 0 ? (
          <div className="panel-inset">
            <EmptyState title="Belum ada jawaban survei">
              Butir tampil setelah cukup responden menjawab.
            </EmptyState>
          </div>
        ) : (
          <Card elevated className="divide-y divide-line overflow-hidden">
            {shown.slice(0, FIRST).map((i) => <Indicator key={i.id} i={i} />)}
            {shown.length > FIRST && (
              <details className="group">
                <summary className="cursor-pointer select-none px-5 py-3 text-[13.5px] font-medium text-brand-ink hover:bg-subtle/70">
                  <span className="group-open:hidden">Tampilkan {shown.length - FIRST} lainnya</span>
                  <span className="hidden group-open:inline">Sembunyikan</span>
                </summary>
                <div className="divide-y divide-line border-t border-line">{shown.slice(FIRST).map((i) => <Indicator key={i.id} i={i} />)}</div>
              </details>
            )}
            {hidden.map((i) => (
              <div key={i.id} className="flex items-start gap-2.5 bg-subtle/40 px-5 py-3.5">
                <IconLock size={14} className="mt-[3px] shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                    <Title t={i.title} muted />
                    <span className="text-[12.5px] tabular-nums text-muted">{i.respondents} responden</span>
                  </div>
                  <p className="text-[12.5px] text-muted">Belum ditampilkan: kurang dari {r.minN} responden.</p>
                </div>
              </div>
            ))}
          </Card>
        )}
        {r.indicators.length > 0 && shown.length === 0 && <p className="text-[13px] text-muted">Belum ada butir dengan {r.minN} responden, jadi belum ada persentase.</p>}
        <p className="text-[12.5px] text-muted">Bukan penilaian atas faskes. Skor sinyal tidak ditampilkan di portal ini.</p>
        <details className="text-[13px] text-muted">
          <summary className="cursor-pointer select-none font-medium text-brand-ink hover:underline">Cara membaca</summary>
          <p className="mt-1 max-w-2xl leading-relaxed">Batas {r.minN} responden menjaga jawaban tidak mengarah ke individu. Jawaban &quot;tidak ingat&quot; dan &quot;tidak paham&quot; bernilai nol dan tidak ikut persentase. Kepuasan tidak dipakai sebagai dasar indikasi.</p>
        </details>
      </Section>
    </>
  );
}
