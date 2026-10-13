import { existsSync } from "node:fs";
import { join } from "node:path";
import { Doors, Footer, Limits } from "@/components/landing/Closing";
import { ConvergeScene } from "@/components/landing/ConvergeScene";
import type { MediaSet, TheaterData } from "@/components/landing/data";
import { FlowRail } from "@/components/landing/FlowRail";
import { Hero } from "@/components/landing/Hero";
import { MediaBand } from "@/components/landing/MediaBand";
import { LandingNav } from "@/components/landing/Nav";
import { Principles } from "@/components/landing/Principles";
import { ProductFocus } from "@/components/landing/ProductFocus";
import { getAdapters } from "@/lib/adapters";
import { liveAvailable } from "@/lib/ai/invocations";
import { getDb } from "@/lib/db";
import { fmtDate, rupiah } from "@/lib/dates";
import type { ProofStatus } from "@/lib/labels";

export const dynamic = "force-dynamic";

const clean = (s: string) => s.replace(/\s*\(simulasi\)\s*$/i, "");

/* Media lokal di public/media. Bila folder public bisa dibaca (dev, server biasa), hanya berkas yang ada yang dipakai.
   Bila tidak bisa dicek (mis. fungsi serverless tanpa public/), semuanya dianggap ada; AmbientVideo tetap
   jatuh ke foto lokal bila berkas gagal dimuat. */
const PUBLIC = join(process.cwd(), "public");
const canCheck = existsSync(join(PUBLIC, "favicon.svg"));
const has = (path: string) => !canCheck || existsSync(join(PUBLIC, path));
const opt = (path: string) => (has(path) ? path : undefined);

function mediaSets(): { hero: MediaSet; band: MediaSet } {
  return {
    hero: {
      sources: [
        { src: "/media/hero-540p.mp4", media: "(max-width: 767px)" },
        { src: "/media/hero-720.mp4" },
      ].filter((s) => has(s.src)),
      poster: opt("/media/hero-poster.jpg"),
      posterMobile: opt("/media/hero-poster-m.jpg"),
      fallback: "/images/hero-corridor.jpg",
      alt: "Lorong rumah sakit yang tenang, diterangi cahaya pagi",
    },
    band: {
      sources: [{ src: "/media/band-720.mp4" }].filter((s) => has(s.src)),
      poster: opt("/media/band-poster.jpg"),
      fallback: "/images/casemix-laptop.jpg",
      alt: "Tangan mengetik di laptop dengan stetoskop di meja",
    },
  };
}

/* Sudut lembaran gelap dan ruang yang diberikan lembaran terang di bawahnya. */
const SLAB_B = "rounded-b-[2rem] shadow-e4 md:rounded-b-[3rem]";
const SLAB_T = "rounded-t-[2rem] md:rounded-t-[3rem]";
const UNDER_T = "-mt-10 pt-10 md:-mt-14 md:pt-14";

export default function Home() {
  const db = getDb();

  // Episode Bu Sari (E-0001): temuan, kasus, klaim, dan pertanyaan terarah yang sama dengan konsol dan aplikasi peserta.
  const f = db
    .prepare(
      `SELECT f.id, f.title, f.proof_status, f.case_id, c.priority, c.assignee_id, fa.name facility, e.dx_text, e.admit_at, e.discharge_at
       FROM findings f JOIN cases c ON c.id = f.case_id JOIN facilities fa ON fa.id = f.facility_id JOIN episodes e ON e.id = f.episode_id
       WHERE f.episode_id = 'E-0001' ORDER BY f.id LIMIT 1`,
    )
    .get() as
    | {
        id: string;
        title: string;
        proof_status: ProofStatus;
        case_id: string;
        priority: number;
        assignee_id: string | null;
        facility: string;
        dx_text: string | null;
        admit_at: string | null;
        discharge_at: string | null;
      }
    | undefined;
  const assignee = f?.assignee_id
    ? ((
        db
          .prepare("SELECT name FROM users WHERE id = ?")
          .get(f.assignee_id.split(":")[1]) as { name: string } | undefined
      )?.name ?? null)
    : null;

  const inv = db
    .prepare(
      "SELECT subject_json FROM invitations WHERE episode_id = 'E-0001' AND mode = 'directed' ORDER BY created_at DESC LIMIT 1",
    )
    .get() as { subject_json: string | null } | undefined;
  let subject: {
    service_id?: string;
    service_lay?: string;
    when?: string;
  } | null = null;
  try {
    subject = inv?.subject_json ? JSON.parse(inv.subject_json) : null;
  } catch {
    subject = null;
  }
  const svc = subject?.service_id
    ? (db
        .prepare("SELECT name, amount FROM services WHERE id = ?")
        .get(subject.service_id) as
        { name: string; amount: number } | undefined)
    : undefined;
  const claim = db
    .prepare(
      "SELECT claim_no FROM claims WHERE episode_id = 'E-0001' ORDER BY submitted_at LIMIT 1",
    )
    .get() as { claim_no: string } | undefined;
  const documented = subject?.service_id
    ? (
        db
          .prepare(
            "SELECT COUNT(*) c FROM evidence WHERE episode_id = 'E-0001' AND service_id = ?",
          )
          .get(subject.service_id) as { c: number }
      ).c > 0
    : false;
  const auditCount = (
    db.prepare("SELECT COUNT(*) c FROM audit_log").get() as { c: number }
  ).c;

  const theater: TheaterData | null = f
    ? {
        findingId: f.id,
        caseId: f.case_id,
        title: svc
          ? f.title.replace(/:\s*[A-Z0-9_-]+$/, `: ${svc.name.toLowerCase()}`)
          : f.title,
        proof: f.proof_status,
        priority: f.priority,
        assignee: assignee ? assignee.split(",")[0] : null,
        facility: clean(f.facility),
        diagnosis: f.dx_text,
        stay:
          f.admit_at && f.discharge_at
            ? `${fmtDate(f.admit_at)} sampai ${fmtDate(f.discharge_at)}`
            : null,
        claimNo: claim?.claim_no ?? null,
        service: svc?.name ?? null,
        amount: svc ? rupiah(svc.amount) : null,
        documented,
        lay: subject?.service_lay ?? null,
        when: subject?.when ?? null,
        auditCount,
      }
    : null;

  const n = db
    .prepare(
      "SELECT (SELECT COUNT(*) FROM participants) p, (SELECT COUNT(*) FROM facilities) f, (SELECT COUNT(*) FROM findings) fi, (SELECT COUNT(*) FROM findings WHERE proof_status='verified') v",
    )
    .get() as { p: number; f: number; fi: number; v: number };
  const a = getAdapters(db);
  const statuses = [
    a.claimFeed,
    a.evidence,
    a.identity,
    a.notification,
    a.paymentStatus,
  ].map((x) => x.status());

  const media = mediaSets();

  return (
    <div className="min-h-screen overflow-x-clip bg-night text-ink">
      <a
        href="#utama"
        className="sr-only rounded-md bg-white px-3 py-2 text-body-sm font-medium text-ink focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50"
      >
        Lompat ke isi
      </a>
      <LandingNav />

      <main id="utama">
        {/* Lembaran berlapis: permukaan gelap duduk di atas yang terang dengan sudut bawah membulat dan bayangan,
            bukan pita gradasi abu-abu. data-nav memberi tahu pil navigasi tema di bawahnya. */}
        <div
          data-nav="dark"
          data-nav-z="1"
          className={`relative z-10 overflow-clip bg-night ${SLAB_B}`}
        >
          <Hero media={media.hero} />
          {theater && <ConvergeScene d={theater} />}
        </div>
        <div
          data-nav="light"
          className={`relative bg-paper pb-10 text-ink md:pb-14 ${UNDER_T}`}
        >
          {theater && <ProductFocus d={theater} />}
          <FlowRail live={liveAvailable()} />
          <MediaBand media={media.band} />
        </div>
        <div
          data-nav="dark"
          data-nav-z="1"
          className={`relative z-10 -mt-10 overflow-clip bg-night md:-mt-14 ${SLAB_T} ${SLAB_B}`}
        >
          <Principles />
          <Limits statuses={statuses} n={n} />
        </div>
        <div
          data-nav="light"
          className={`relative bg-paper text-ink ${UNDER_T}`}
        >
          <Doors />
          <Footer />
        </div>
      </main>
    </div>
  );
}
