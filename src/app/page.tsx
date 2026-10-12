import Link from "next/link";
import { LandingNav } from "@/components/landing/Nav";
import { Photo } from "@/components/landing/Photo";
import { FinalSection, Footer, HowSection, LimitsSection, PrinciplesSection, SidesSection, ThesisSection, WardBand, WRAP } from "@/components/landing/Sections";
import { Theater, type TheaterData } from "@/components/landing/Theater";
import { getAdapters } from "@/lib/adapters";
import { liveAvailable } from "@/lib/ai/invocations";
import { getDb } from "@/lib/db";
import { fmtDate, rupiah } from "@/lib/dates";
import type { ProofStatus } from "@/lib/labels";

export const dynamic = "force-dynamic";

const clean = (s: string) => s.replace(/\s*\(simulasi\)\s*$/i, "");

export default function Home() {
  const db = getDb();

  // Episode Bu Sari (E-0001): temuan, kasus, klaim, dan pertanyaan terarah yang sama dengan konsol dan aplikasi peserta.
  const f = db
    .prepare(
      `SELECT f.id, f.title, f.proof_status, f.case_id, c.priority, c.assignee_id, fa.name facility, e.dx_text, e.admit_at, e.discharge_at
       FROM findings f JOIN cases c ON c.id = f.case_id JOIN facilities fa ON fa.id = f.facility_id JOIN episodes e ON e.id = f.episode_id
       WHERE f.episode_id = 'E-0001' ORDER BY f.id LIMIT 1`,
    )
    .get() as { id: string; title: string; proof_status: ProofStatus; case_id: string; priority: number; assignee_id: string | null; facility: string; dx_text: string | null; admit_at: string | null; discharge_at: string | null } | undefined;
  const assignee = f?.assignee_id ? (db.prepare("SELECT name FROM users WHERE id = ?").get(f.assignee_id.split(":")[1]) as { name: string } | undefined)?.name ?? null : null;

  const inv = db.prepare("SELECT subject_json FROM invitations WHERE episode_id = 'E-0001' AND mode = 'directed' ORDER BY created_at DESC LIMIT 1").get() as { subject_json: string | null } | undefined;
  let subject: { service_id?: string; service_lay?: string; when?: string } | null = null;
  try {
    subject = inv?.subject_json ? JSON.parse(inv.subject_json) : null;
  } catch {
    subject = null;
  }
  const svc = subject?.service_id ? (db.prepare("SELECT name, amount FROM services WHERE id = ?").get(subject.service_id) as { name: string; amount: number } | undefined) : undefined;
  const claim = db.prepare("SELECT claim_no FROM claims WHERE episode_id = 'E-0001' ORDER BY submitted_at LIMIT 1").get() as { claim_no: string } | undefined;
  const documented = subject?.service_id ? (db.prepare("SELECT COUNT(*) c FROM evidence WHERE episode_id = 'E-0001' AND service_id = ?").get(subject.service_id) as { c: number }).c > 0 : false;
  const auditCount = (db.prepare("SELECT COUNT(*) c FROM audit_log").get() as { c: number }).c;

  const theater: TheaterData | null = f
    ? {
        findingId: f.id,
        caseId: f.case_id,
        title: svc ? f.title.replace(/:\s*[A-Z0-9_-]+$/, `: ${svc.name.toLowerCase()}`) : f.title,
        proof: f.proof_status,
        priority: f.priority,
        assignee: assignee ? assignee.split(",")[0] : null,
        facility: clean(f.facility),
        diagnosis: f.dx_text,
        stay: f.admit_at && f.discharge_at ? `${fmtDate(f.admit_at)} sampai ${fmtDate(f.discharge_at)}` : null,
        claimNo: claim?.claim_no ?? null,
        service: svc?.name ?? null,
        amount: svc ? rupiah(svc.amount) : null,
        documented,
        lay: subject?.service_lay ?? null,
        when: subject?.when ?? null,
        auditCount,
      }
    : null;

  const n = db.prepare("SELECT (SELECT COUNT(*) FROM participants) p, (SELECT COUNT(*) FROM facilities) f, (SELECT COUNT(*) FROM findings) fi, (SELECT COUNT(*) FROM findings WHERE proof_status='verified') v").get() as { p: number; f: number; fi: number; v: number };
  const a = getAdapters(db);
  const statuses = [a.claimFeed, a.evidence, a.identity, a.notification, a.paymentStatus].map((x) => x.status());

  return (
    <div className="min-h-screen bg-night text-ink">
      <a href="#utama" className="sr-only rounded-md bg-white px-3 py-2 text-sm font-medium text-ink focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50">Lompat ke isi</a>
      <LandingNav />

      <main id="utama">
        {/* Hero: tesis, satu foto, satu momen gerak */}
        <section aria-labelledby="judul-utama" className="relative isolate flex min-h-[40rem] flex-col overflow-hidden bg-night md:min-h-[min(100svh,58rem)]">
          <div className="absolute inset-0 -z-10">
            <Photo k="hands" priority sizes="100vw" className="object-[70%_40%] opacity-80" />
            <div className="absolute inset-0 bg-gradient-to-r from-night via-night/80 to-night/20" />
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-night to-transparent" />
          </div>

          <div className={`${WRAP} flex flex-1 flex-col justify-center pb-10 pt-28 md:pb-16 md:pt-36`}>
            <div className="animate-rise-in">
              <p className="text-[14px] font-medium text-mint">Akuntabilitas layanan JKN</p>
              <h1 id="judul-utama" className="mt-5 max-w-[12ch] text-[clamp(2.4rem,10vw,3.4rem)] font-semibold leading-[1.04] tracking-[-0.045em] text-white sm:text-[4.4rem] sm:leading-[0.98] lg:text-[5.9rem]">
                Janji layanan harus sampai ke pasien.
              </h1>
              <p className="mt-5 max-w-[34rem] text-[16px] leading-relaxed text-on-night-soft md:mt-7 md:text-[19px]">
                Laporan peserta, bukti faskes, dan peninjauan petugas dalam satu alur yang dapat diaudit.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3 md:mt-10">
                <a href="#produk" className="btn btn-lg w-full bg-white text-night hover:bg-white/90 sm:w-auto">Lihat cara kerjanya</a>
                <Link href="/console" className="btn btn-lg w-full text-white ring-1 ring-inset ring-white/25 hover:bg-white/10 sm:w-auto">Buka konsol petugas</Link>
              </div>
            </div>
          </div>

          <div className={`${WRAP} pb-8`}>
            <div className="flex flex-col gap-4 border-t border-white/12 pt-6 md:flex-row md:items-center md:justify-between">
              <ul className="flex flex-wrap gap-x-8 gap-y-2 text-[14px] font-medium text-on-night">
                <li>Sinyal, bukan tuduhan</li>
                <li>Hak jawab faskes lebih dulu</li>
                <li>Setiap keputusan tercatat</li>
              </ul>
              <p className="text-[12.5px] text-on-night-soft">Prototipe Healthkathon 2026. Data sintetis. Bukan produk resmi BPJS Kesehatan.</p>
            </div>
          </div>
        </section>

        {/* Teater produk */}
        <section id="produk" aria-labelledby="produk-judul" className="scroll-mt-16 bg-night pb-16 pt-16 md:pb-40 md:pt-28">
          <div className={WRAP}>
            <div className="mb-8 grid gap-4 md:mb-20 md:gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-end">
              <div>
                <p className="text-[14px] font-medium text-mint">Produk</p>
                <h2 id="produk-judul" className="mt-4 max-w-3xl text-[clamp(1.9rem,7.5vw,2.4rem)] font-semibold leading-[1.08] tracking-[-0.04em] text-white sm:text-[3.4rem]">
                  Satu ruang kerja untuk membuktikan, bukan menuduh.
                </h2>
              </div>
              <p className="text-[16px] leading-relaxed text-on-night-soft">Tiga sumber berdampingan. Keputusan tetap di tangan petugas.</p>
            </div>
            {theater && <Theater d={theater} />}
          </div>
        </section>

        <ThesisSection d={{ service: svc?.name ?? null, amount: svc ? rupiah(svc.amount) : null, documented, lay: subject?.service_lay ?? null }} />
        <WardBand />
        <HowSection live={liveAvailable()} />
        <SidesSection />
        <PrinciplesSection />
        <LimitsSection statuses={statuses} n={n} />
        <FinalSection />
      </main>
      <Footer />
    </div>
  );
}
