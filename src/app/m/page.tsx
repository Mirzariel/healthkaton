import type { Metadata } from "next";
import Link from "next/link";
import { DemoSwitcher } from "@/components/m/DemoSwitcher";
import { MobileApp, type MItem } from "@/components/m/MobileApp";
import { fmtDateTime, ts } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { getHero, getPatientVisits, listParticipantsWithBills } from "@/lib/queries";
import { SVC } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Aplikasi peserta · SEHATI" };

export default async function Mobile({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const sp = await searchParams;
  const db = getDb();
  const hero = getHero(db);
  const raw = Array.isArray(sp.p) ? sp.p[0] : sp.p;
  const pid = raw && /^P-\d{4}$/.test(raw) ? raw : hero.ids.participant_id;
  const isHero = pid === hero.ids.participant_id;
  const people = listParticipantsWithBills(db, 12);
  const me = db.prepare("SELECT id, name FROM participants WHERE id = ?").get(pid) as { id: string; name: string } | undefined;
  const raws = me ? getPatientVisits(db, pid) : [];

  // Kasus phantom tokoh cerita: tujuan langkah 3 di panel samping, dan skor yang ikut berubah saat peserta menjawab.
  const phantom = db
    .prepare("SELECT cs.id AS caseId, f.score FROM cases cs JOIN findings f ON f.id = cs.finding_id WHERE f.claim_id = ? AND f.modus = 'phantom'")
    .get(hero.ids.claim_paid) as { caseId: string; score: number } | undefined;
  const caseHref = phantom ? `/console/cases/${phantom.caseId}` : "/console";

  const long = (iso: string) => new Date(ts(iso)).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  const items: MItem[] = raws
    .flatMap((v) =>
      v.services
        .filter((s) => SVC[s.service.code]?.needsRecord)
        .map((s) => {
          const latest = s.answers.slice().sort((a, b) => b.at.localeCompare(a.at))[0];
          return {
            id: s.service.id,
            code: s.service.code,
            name: s.service.name,
            hospital: v.episode.hospital.replace(/\s*\(simulasi\)\s*$/i, ""),
            dateLong: long(s.service.performed_at),
            existing: latest ? { answer: latest.answer, note: latest.note, at: fmtDateTime(latest.at) } : null,
            hi: s.service.id === hero.ids.bronko_service,
          };
        }),
    )
    // Pertanyaan yang perlu perhatian lebih dulu, lalu yang terbaru.
    .sort((a, b) => Number(b.hi) - Number(a.hi))
    .map(({ hi: _hi, ...rest }) => rest);

  const firstName = me?.name.split(" ")[0] ?? "Peserta";
  const switcher = (prefix: string, dark?: boolean) => (
    <DemoSwitcher idPrefix={prefix} current={pid} people={people} heroId={hero.ids.participant_id} dark={dark} consoleHref={caseHref} />
  );

  const steps = [
    {
      title: "Jawab pertanyaan di ponsel",
      body: isHero ? (
        <>Untuk melihat efeknya, jawab <strong className="font-semibold text-ink">&ldquo;TIDAK pernah&rdquo;</strong> pada Bronkoskopi.</>
      ) : (
        <>Jawab pertanyaan satu per satu. Pilih tokoh cerita (Bu Sari) untuk efek yang paling jelas.</>
      ),
    },
    { title: "Buka konsol petugas", body: <>Pindah ke layar yang dipakai petugas BPJS.</> },
    { title: "Lihat skor kasus berubah", body: <>Skor kasus peserta itu naik atau turun mengikuti jawaban tadi.</> },
  ];

  const intro = (
    <div className="mx-auto max-w-sm text-center lg:mx-0 lg:text-left">
      <p className="eyebrow text-muted">Konsep fitur JKN Mobile</p>
      <h1 className="mt-3 text-[2rem] font-semibold leading-[1.1] tracking-tight">
        Contoh tampilan <em>aplikasi peserta</em>
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
        Anda sedang melihat contoh, bukan aplikasi sungguhan. Peserta JKN suatu hari bisa diminta memastikan perawatan yang ia terima, dengan kata-kata sederhana. Jawabannya menjadi bukti tambahan bagi petugas.
      </p>
    </div>
  );

  const controls = (
    <div className="mx-auto w-full max-w-sm">
      <p className="eyebrow text-muted">Coba dalam 3 langkah</p>
      <ol className="mt-3 space-y-3">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full border border-ink/30 text-xs font-medium" aria-hidden>{i + 1}</span>
            <div className="min-w-0 text-[14px] leading-snug">
              <p className="font-medium">{s.title}</p>
              <p className="mt-0.5 text-ink-soft">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      {isHero && phantom && (
        <Link href={caseHref} className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-line bg-card px-4 py-3 transition hover:border-ink/40">
          <span className="text-[13px] leading-snug text-ink-soft">
            Skor kasus <span className="font-mono">{phantom.caseId}</span> sekarang
            <span className="block text-[11px] text-muted">Berubah setelah Anda menjawab</span>
          </span>
          <span className="text-3xl font-semibold tabular-nums">{phantom.score}</span>
        </Link>
      )}
      <div className="mt-5 border-t border-line pt-4">{switcher("side")}</div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-paper md:grid md:justify-items-center md:gap-8 md:px-6 md:py-8 lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:gap-14">
      <div className="hidden md:block lg:justify-self-end">{intro}</div>
      <MobileApp firstName={firstName} participantId={pid} items={items} demo={switcher("sheet")} consoleHref={caseHref} isHero={isHero} />
      <div className="hidden w-full md:block lg:justify-self-start">
        {controls}
        <p className="mx-auto mt-6 max-w-sm text-xs text-muted">Prototipe Healthkathon 2026 · data contoh</p>
      </div>
    </div>
  );
}
